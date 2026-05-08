const express = require('express');
const router = express.Router();
const therapyGroupController = require('../controllers/therapyGroupController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Protected route - get all groups (to show membership status)
router.get('/groups', authMiddleware, therapyGroupController.getGroups);

// Protected routes - join/leave groups
router.post('/groups/join', authMiddleware, therapyGroupController.joinGroup);
router.post('/groups/leave', authMiddleware, therapyGroupController.leaveGroup);
router.get('/my-groups', authMiddleware, therapyGroupController.getMyGroups);

// Psychologue routes - manage requests
router.get('/groups/pending', authMiddleware, therapyGroupController.getPendingRequests);
router.post('/groups/accept', authMiddleware, therapyGroupController.acceptRequest);
router.post('/groups/reject', authMiddleware, therapyGroupController.rejectRequest);

// Seed route (for development)
router.post('/seed', therapyGroupController.seedGroups);

module.exports = router;