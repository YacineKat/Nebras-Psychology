const express = require('express');
const router = express.Router();
const therapyGroupController = require('../controllers/therapyGroupController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Public routes - get all groups
router.get('/groups', therapyGroupController.getGroups);

// Protected routes - join/leave groups
router.post('/groups/join', authMiddleware, therapyGroupController.joinGroup);
router.post('/groups/leave', authMiddleware, therapyGroupController.leaveGroup);
router.get('/my-groups', authMiddleware, therapyGroupController.getMyGroups);

// Seed route (for development)
router.post('/seed', therapyGroupController.seedGroups);

module.exports = router;