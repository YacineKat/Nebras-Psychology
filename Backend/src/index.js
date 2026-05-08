// ============================================
// NEBRAS BACKEND - Main Server File
// ============================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const therapyGroupRoutes = require('./routes/therapyGroupRoutes');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
})); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies

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

app.listen(PORT, () => {
  console.log(`
  | NEBRAS SERVER RUNNING ON PORT ${PORT}   
  | Visit: http://localhost:${PORT}         
  `);
});

module.exports = app; // For testing