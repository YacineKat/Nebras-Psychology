// ============================================
// APPOINTMENT ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// URGENT ACCESS ROUTES - Check and activate 7-day access
router.get('/urgent/access', appointmentController.getUrgentAccessStatus);
router.post('/urgent/activate', appointmentController.activateUrgentAccess);

// URGENT REQUEST ROUTES - MUST come BEFORE general routes
router.post('/urgent', appointmentController.createUrgentRequest);
router.get('/urgent', appointmentController.getUrgentRequests);
router.put('/urgent/:id/accept', appointmentController.acceptUrgentRequest);
router.put('/urgent/:id/reject', appointmentController.rejectUrgentRequest);
router.put('/urgent/:id/complete', appointmentController.completeUrgentRequest);

// Video session routes
router.post('/:id/video/start', appointmentController.startVideoSession);
router.post('/:id/video/end', appointmentController.endVideoSession);
router.get('/video/active', appointmentController.getActiveVideoSession);

// Call state routes (real-time sync)
router.post('/call/start', appointmentController.startCallState);
router.post('/call/end', appointmentController.endCallState);
router.get('/call/status', appointmentController.getMyCallStatus);
router.get('/call/status/:doctorId', appointmentController.getCallStatus);

// General appointment routes - AFTER specific routes
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