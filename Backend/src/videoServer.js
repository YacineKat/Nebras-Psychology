require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());

// Store rooms in memory
const rooms = new Map();

const mediaCodecs = [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: { 'x-google-start-bitrate': 1000 } },
    { kind: 'video', mimeType: 'video/VP9', clockRate: 90000, parameters: { 'profile-id': 2, 'x-google-start-bitrate': 1000 } },
    { kind: 'video', mimeType: 'video/h264', clockRate: 90000, parameters: { 'packetization-mode': 1, 'profile-level-id': '4d0032', 'level-asymmetry-allowed': 1, 'x-google-start-bitrate': 1000 } },
];

let worker;

async function createWorker() {
    worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 10000,
        rtcMaxPort: 10100,
    });
    worker.on('died', () => {
        console.error('Mediasoup worker died');
        process.exit(1);
    });
    console.log('Mediasoup worker created');
    return worker;
}

async function createRouter() {
    return await worker.createRouter({ mediaCodecs });
}

// REST API - Room management
app.post('/api/rooms', (req, res) => {
    const { name, mode } = req.body;
    if (!name || !mode) return res.status(400).json({ error: 'Name and mode required' });
    if (!['p2p', 'sfu'].includes(mode)) return res.status(400).json({ error: 'Mode must be p2p or sfu' });

    const id = uuidv4().split('-')[0];
    rooms.set(id, {
        id, name, mode,
        participants: new Map(),
        router: null,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
    });

    res.status(201).json({ id, name, mode, link: `/video-call.html?room=${id}` });
});

app.get('/api/rooms/:id', (req, res) => {
    const room = rooms.get(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ id: room.id, name: room.name, mode: room.mode, participants: Array.from(room.participants.values()) });
});

app.get('/api/rooms', (req, res) => {
    const list = Array.from(rooms.values()).map(r => ({ id: r.id, name: r.name, mode: r.mode, count: r.participants.size }));
    res.json(list);
});

app.delete('/api/rooms/:id', (req, res) => {
    if (!rooms.has(req.params.id)) return res.status(404).json({ error: 'Room not found' });
    rooms.delete(req.params.id);
    res.json({ message: 'Room deleted' });
});

// Socket.IO
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, userName }, callback) => {
        // Auto-create room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                id: roomId,
                name: roomId,
                mode: 'p2p', // Default to p2p for group therapy
                participants: new Map(),
                router: null,
                transports: new Map(),
                producers: new Map(),
                consumers: new Map(),
            });
        }

        const room = rooms.get(roomId);
        const maxParticipants = room.mode === 'p2p' ? 2 : 10;
        if (room.participants.size >= maxParticipants) {
            return callback({ error: `Room is full (max ${maxParticipants})` });
        }

        const participant = { id: socket.id, name: userName, socketId: socket.id };
        room.participants.set(socket.id, participant);
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        socket.to(roomId).emit('participant-joined', participant);

        const others = Array.from(room.participants.values()).filter(p => p.id !== socket.id);

        callback({ mode: room.mode, roomId, participants: others });
    });

    // P2P Signaling
    socket.on('p2p-offer', ({ roomId, offer, targetId }) => {
        socket.to(targetId).emit('p2p-offer', { offer, fromId: socket.id, fromName: socket.userName });
    });

    socket.on('p2p-answer', ({ roomId, answer, targetId }) => {
        socket.to(targetId).emit('p2p-answer', { answer, fromId: socket.id });
    });

    socket.on('p2p-ice-candidate', ({ roomId, candidate, targetId }) => {
        socket.to(targetId).emit('p2p-ice-candidate', { candidate, fromId: socket.id });
    });

    // Participant control events
    socket.on('participant-update', ({ roomId, socketId, isMuted }) => {
        socket.to(roomId).emit('participant-update', { socketId: socket.id, isMuted });
    });

    socket.on('participant-mute-update', ({ roomId, targetId, isMuted }) => {
        socket.to(targetId).emit('participant-mute-update', { isMuted });
    });

    socket.on('participant-video-update', ({ roomId, targetId, isVideoOff }) => {
        socket.to(targetId).emit('participant-video-update', { isVideoOff });
    });

    socket.on('remove-participant', ({ roomId, targetId }) => {
        socket.to(targetId).emit('remove-participant');
    });

    // Chat events
    socket.on('chat-message', ({ roomId, fromId, fromName, text, timestamp }) => {
        socket.to(roomId).emit('chat-message', { fromId, fromName, text, timestamp });
    });

    socket.on('chat-typing', ({ roomId, socketId, isTyping }) => {
        socket.to(roomId).emit('chat-typing', { socketId, isTyping });
    });

    // SFU Signaling (Mediasoup)
    socket.on('sfu-create-transport', async ({ roomId, direction }, callback) => {
        const room = rooms.get(roomId);
        if (!room || !room.router) return callback({ error: 'Room or router not found' });

        const transport = await room.router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1' }],
            enableUdp: true, enableTcp: true, preferUdp: true,
        });

        transport.on('dtlsstatechange', (dtlsState) => { if (dtlsState === 'closed') transport.close(); });

        const key = `${socket.id}-${direction}`;
        room.transports.set(key, transport);

        callback({ id: transport.id, iceParameters: transport.iceParameters, iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters });
    });

    socket.on('sfu-connect-transport', async ({ roomId, direction, dtlsParameters }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });
        const key = `${socket.id}-${direction}`;
        const transport = room.transports.get(key);
        if (!transport) return callback({ error: 'Transport not found' });
        await transport.connect({ dtlsParameters });
        callback({ connected: true });
    });

    socket.on('sfu-produce', async ({ roomId, kind, rtpParameters }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });
        const transport = room.transports.get(`${socket.id}-send`);
        if (!transport) return callback({ error: 'Send transport not found' });

        const producer = await transport.produce({ kind, rtpParameters });
        room.producers.set(producer.id, { producer, socketId: socket.id, kind });

        producer.on('transportclose', () => { producer.close(); room.producers.delete(producer.id); });
        socket.to(roomId).emit('sfu-new-producer', { producerId: producer.id, socketId: socket.id, kind });

        callback({ producerId: producer.id });
    });

    socket.on('sfu-consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
        const room = rooms.get(roomId);
        if (!room || !room.router) return callback({ error: 'Room not found' });
        if (!room.router.canConsume({ producerId, rtpCapabilities })) return callback({ error: 'Cannot consume' });

        const transport = room.transports.get(`${socket.id}-recv`);
        if (!transport) return callback({ error: 'Recv transport not found' });

        const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
        room.consumers.set(consumer.id, { consumer, socketId: socket.id });

        consumer.on('transportclose', () => consumer.close());
        consumer.on('producerclose', () => { consumer.close(); room.consumers.delete(consumer.id); socket.emit('sfu-producer-closed', { consumerId: consumer.id }); });

        callback({ id: consumer.id, consumerId: consumer.id, producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters });
    });

    socket.on('sfu-resume-consumer', async ({ roomId, consumerId }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });
        const entry = room.consumers.get(consumerId);
        if (!entry) return callback({ error: 'Consumer not found' });
        await entry.consumer.resume();
        callback({ resumed: true });
    });

    socket.on('sfu-get-producers', ({ roomId }, callback) => {
        const room = rooms.get(roomId);
        if (!room) return callback([]);
        const producers = Array.from(room.producers.values()).filter(p => p.socketId !== socket.id).map(p => ({ producerId: p.producer.id, socketId: p.socketId, kind: p.kind }));
        callback(producers);
    });

    // Disconnect
    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        room.participants.delete(socket.id);

        const sendKey = `${socket.id}-send`;
        const recvKey = `${socket.id}-recv`;
        if (room.transports.has(sendKey)) { room.transports.get(sendKey).close(); room.transports.delete(sendKey); }
        if (room.transports.has(recvKey)) { room.transports.get(recvKey).close(); room.transports.delete(recvKey); }

        for (const [id, p] of room.producers) {
            if (p.socketId === socket.id) { p.producer.close(); room.producers.delete(id); }
        }
        for (const [id, c] of room.consumers) {
            if (c.socketId === socket.id) { c.consumer.close(); room.consumers.delete(id); }
        }

        if (room.participants.size === 0) {
            if (room.router) room.router.close();
            rooms.delete(roomId);
        }

        io.to(roomId).emit('participant-left', { socketId: socket.id });
        console.log(`Socket ${socket.id} left room ${roomId}`);
    });
});

// Start server
const VIDEO_PORT = process.env.VIDEO_PORT || 5000;

createWorker().then(() => {
    server.listen(VIDEO_PORT, () => {
        console.log(`Video server running on port ${VIDEO_PORT}`);
    });
});