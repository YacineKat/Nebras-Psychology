// ============================================
// DOCTOR ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Public routes (anyone can view doctors)
router.get('/', doctorController.getAllDoctors);
router.get('/:id', doctorController.getDoctorById);

// Protected routes
router.get('/profile/me', authMiddleware, doctorController.getMyProfile);

// Doctor/Counselor only routes
router.put('/profile', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.updateProfile);
router.post('/schedule', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.addTimeSlot);
router.get('/schedule', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getSchedule);
router.delete('/schedule/:id', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.deleteTimeSlot);

module.exports = router;