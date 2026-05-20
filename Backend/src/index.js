// ============================================
// NEBRAS BACKEND - Main Server File (Unified)
// ============================================

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const config = require('./config');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const therapyGroupRoutes = require('./routes/therapyGroupRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { createMessageRecord } = require('./controllers/messageController');

// Video signaling (WebRTC / room management)
const { initVideoSignaling } = require('./videoSignaling');

const app = express();
const server = http.createServer(app);

// ============================================
// CORS — applied at every possible layer
// ============================================
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  next();
});

app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.status(204).end();
});

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('No token provided'));
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    socket.user = { id: decoded.id, userType: decoded.userType };
    next();
  } catch (error) {
    next(new Error('Unauthorized'));
  }
});

// Make io available globally
global.io = io;

// ============================================
// BODY PARSER
// ============================================
app.use(express.json({ limit: '10mb' }));

// ============================================
// VIDEO SIGNALING (WebRTC / room management)
// ============================================
initVideoSignaling(io, app);

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
app.use(express.static(path.join(__dirname, '../../Frontend')));

// ============================================
// API ROUTES
// ============================================

// Home route - Test if server is running
app.get('/', (req, res) => {
  res.json({ 
    message: 'Nebras API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      doctors: '/api/doctors',
      appointments: '/api/appointments',
      messages: '/api/messages'
    }
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api', therapyGroupRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// Public settings endpoint (no auth required)
const adminController = require('./controllers/adminController');
app.get('/api/settings', adminController.getSettings);

// ============================================
// SOCKET.IO - Real-time Session Events
// ============================================

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);
  }

  socket.on('message:send', async (payload = {}, callback = () => {}) => {
    try {
      const senderId = socket.user?.id;
      const { receiverId, content } = payload;

      if (!senderId || !receiverId || !content) {
        return callback({ error: 'Please provide receiver and message content' });
      }

      if (senderId === receiverId) {
        return callback({ error: 'Cannot send message to yourself' });
      }

      const message = await createMessageRecord(senderId, receiverId, content);
      const messagePayload = {
        message,
        conversationPartnerId: receiverId,
        clientMessageId: payload.clientMessageId || null
      };

      io.to(`user:${senderId}`).emit('message:new', messagePayload);
      io.to(`user:${receiverId}`).emit('message:new', {
        ...messagePayload,
        conversationPartnerId: senderId
      });

      callback({ success: true, message });
    } catch (error) {
      console.error('Socket message send error:', error);
      callback({ error: 'Failed to send message' });
    }
  });
    
    // Join a room to receive session notifications for a specific patient
    socket.on('join-patient-room', (patientId) => {
        socket.join(`patient:${patientId}`);
        console.log(`Socket ${socket.id} joined patient room: patient:${patientId}`);
    });
    
    // Join a room to receive session notifications for a specific doctor
    socket.on('join-doctor-room', (doctorId) => {
        socket.join(`doctor:${doctorId}`);
        console.log(`Socket ${socket.id} joined doctor room: doctor:${doctorId}`);
    });
    
    // Leave rooms on disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 - Route not found
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err.message || err);

  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Cette ressource existe déjà' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Ressource non trouvée' });
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format JSON invalide' });
  }

  res.status(err.statusCode || 500).json({
    error: err.statusCode ? err.message : 'Erreur interne du serveur'
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = config.port;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`
    | NEBRAS SERVER RUNNING ON PORT ${PORT}   
    | Visit: http://localhost:${PORT}         
    `);
  });
}

module.exports = app; // For testing