// ============================================
// APPOINTMENT ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Create appointment (patient books)
router.post('/', appointmentController.createAppointment);

// Get my appointments (patient or doctor)
router.get('/', appointmentController.getMyAppointments);

// Get single appointment
router.get('/:id', appointmentController.getAppointmentById);

// Update status (doctor only)
router.put('/:id', appointmentController.updateAppointmentStatus);

// Cancel appointment
router.delete('/:id', appointmentController.cancelAppointment);

module.exports = router;