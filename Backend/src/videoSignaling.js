const { v4: uuidv4 } = require('uuid');

const rooms = new Map();
let ioInstance = null;

function deleteRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  if (ioInstance) {
    ioInstance.to(roomId).emit('room-closed', { roomId });
  }
  rooms.delete(roomId);
  return true;
}

function initVideoSignaling(io, app) {
  ioInstance = io;

  app.post('/api/rooms', (req, res) => {
    const { name, mode } = req.body;
    if (!name || !mode) return res.status(400).json({ error: 'Name and mode required' });

    const id = uuidv4().split('-')[0];
    rooms.set(id, {
      id, name, mode,
      participants: new Map(),
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
    deleteRoom(req.params.id);
    res.json({ message: 'Room deleted' });
  });

  io.on('connection', (socket) => {
    socket.on('join-room', async ({ roomId, userName, avatarUrl, userId, mode }, callback) => {
      if (!rooms.has(roomId)) {
        const resolvedMode = mode || (roomId.startsWith('group_') ? 'group' : 'p2p');
        rooms.set(roomId, {
          id: roomId,
          name: roomId,
          mode: resolvedMode,
          participants: new Map(),
        });
      } else if (mode && mode !== 'p2p') {
        const existingRoom = rooms.get(roomId);
        existingRoom.mode = mode;
      }

      const room = rooms.get(roomId);
      const maxParticipants = room.mode === 'p2p' ? 2 : 10;
      if (room.participants.size >= maxParticipants) {
        return callback({ error: `Room is full (max ${maxParticipants})` });
      }

      const participant = { id: socket.id, name: userName, socketId: socket.id, userId: userId || null, avatarUrl: avatarUrl || null };
      room.participants.set(socket.id, participant);
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userName = userName;
      socket.userId = userId || null;

      socket.to(roomId).emit('participant-joined', participant);

      const others = Array.from(room.participants.values()).map(p => ({ ...p }));

      callback({ mode: room.mode, roomId, participants: others });
    });

    socket.on('p2p-offer', ({ roomId, offer, targetId }) => {
      socket.to(targetId).emit('p2p-offer', { offer, fromId: socket.id, fromName: socket.userName });
    });

    socket.on('p2p-answer', ({ roomId, answer, targetId }) => {
      socket.to(targetId).emit('p2p-answer', { answer, fromId: socket.id });
    });

    socket.on('p2p-ice-candidate', ({ roomId, candidate, targetId }) => {
      socket.to(targetId).emit('p2p-ice-candidate', { candidate, fromId: socket.id });
    });

    socket.on('participant-update', ({ roomId, socketId, isMuted, isVideoOff }) => {
      const payload = { socketId: socket.id };
      if (isMuted !== undefined) payload.isMuted = isMuted;
      if (isVideoOff !== undefined) payload.isVideoOff = isVideoOff;
      socket.to(roomId).emit('participant-update', payload);
    });

    socket.on('participant-mute-update', ({ roomId, targetId, isMuted }) => {
      socket.to(targetId).emit('participant-mute-update', { isMuted });
    });

    socket.on('participant-video-update', ({ roomId, targetId, isVideoOff }) => {
      socket.to(targetId).emit('participant-video-update', { socketId: socket.id, isVideoOff });
    });

    socket.on('remove-participant', ({ roomId, targetId }) => {
      socket.to(targetId).emit('remove-participant');
    });

    socket.on('chat-message', ({ roomId, fromId, fromName, text, timestamp }) => {
      socket.to(roomId).emit('chat-message', { fromId, fromName, text, timestamp });
    });

    socket.on('chat-typing', ({ roomId, socketId, isTyping }) => {
      socket.to(roomId).emit('chat-typing', { socketId, isTyping });
    });

    socket.on('disconnect', () => {
      const roomId = socket.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      room.participants.delete(socket.id);

      if (room.participants.size === 0) {
        rooms.delete(roomId);
      }

      socket.to(roomId).emit('participant-left', { socketId: socket.id });
    });
  });
}

module.exports = { initVideoSignaling, deleteRoom };
