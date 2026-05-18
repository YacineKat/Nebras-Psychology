// ============================================
// DOCTOR ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Public routes (anyone can view doctors)
router.get('/', doctorController.getAllDoctors);
router.get('/patients', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getPatients);
router.get('/patients/:patientId', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getPatientById);

// Patient Notes
router.get('/patients/:patientId/notes', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getPatientNote);
router.post('/patients/:patientId/notes', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.savePatientNote);

// Protected routes (must come before /:id)
router.get('/profile/me', authMiddleware, doctorController.getMyProfile);
router.put('/profile', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.updateProfile);
router.post('/schedule', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.addTimeSlot);
router.post('/schedule/block', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.blockTimeSlot);
router.put('/schedule/:id/unblock', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.unblockTimeSlot);
router.get('/schedule', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getSchedule);
router.delete('/schedule/:id', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.deleteTimeSlot);
router.get('/dashboard', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getDashboard);
router.get('/honoraires', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getHonoraires);
router.put('/tarif', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.updateTarif);

router.get('/:id/availability', doctorController.getDoctorAvailability);

// VIP Routes
router.get('/vip', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.getVipStatus);
router.post('/vip/activate', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.activateVip);
router.post('/vip/form', authMiddleware, requireRole('psychologue', 'counselor'), doctorController.saveVipForm);

// Must come last - catches /:id
router.get('/:id', doctorController.getDoctorById);

module.exports = router;