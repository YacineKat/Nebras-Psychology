// ============================================
// NEBRAS BACKEND - Main Server File
// ============================================

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const therapyGroupRoutes = require('./routes/therapyGroupRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Make io available globally
global.io = io;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
})); // Allow cross-origin requests
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies (increased for avatar uploads)

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

// ============================================
// SOCKET.IO - Real-time Session Events
// ============================================

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
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
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
  | NEBRAS SERVER RUNNING ON PORT ${PORT}   
  | Visit: http://localhost:${PORT}         
  `);
});

module.exports = app; // For testing