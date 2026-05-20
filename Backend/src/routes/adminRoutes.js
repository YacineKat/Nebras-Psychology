const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// All admin routes require auth + admin role
router.use(authMiddleware, requireRole('admin'));

// Badges (lightweight sidebar counts)
router.get('/badges', adminController.getBadges);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Users
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.put('/users/:id/approve', adminController.approveUser);
router.put('/users/:id/reject', adminController.rejectUser);

// Validations
router.get('/validations', adminController.getValidations);
router.put('/validations/:id/approve', adminController.approveValidation);
router.put('/validations/:id/reject', adminController.rejectValidation);

// Payments
router.get('/payments/summary', adminController.getPaymentsSummary);
router.get('/payments', adminController.getPayments);
router.put('/payments/:id/validate', adminController.validatePayment);
router.put('/payments/:id/reject', adminController.rejectPayment);

// Statistics
router.get('/statistics', adminController.getStatistics);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
