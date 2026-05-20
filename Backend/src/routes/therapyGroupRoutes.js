const express = require('express');
const router = express.Router();
const therapyGroupController = require('../controllers/therapyGroupController');
const { authMiddleware } = require('../middleware/authMiddleware');

// =============================================
// PSYCHOLOGUE ROUTES
// =============================================

// Create a new group (must come before /:groupId)
router.post('/psychologue/groups', authMiddleware, therapyGroupController.createGroup);

// Get groups created by the psychologue
router.get('/psychologue/groups', authMiddleware, therapyGroupController.getMyGroups);

// Get group details (waiting list + participants) - must come after static routes
router.get('/psychologue/groups/:groupId', authMiddleware, therapyGroupController.getGroupDetails);

// Update a group
router.put('/psychologue/groups/:groupId', authMiddleware, therapyGroupController.updateGroup);

// Delete a group
router.delete('/psychologue/groups/:groupId', authMiddleware, therapyGroupController.deleteGroup);

// Accept/reject patient requests
router.post('/psychologue/groups/accept', authMiddleware, therapyGroupController.acceptPatientRequest);
router.post('/psychologue/groups/reject', authMiddleware, therapyGroupController.rejectPatientRequest);

// End a group session — notify all patients
router.post('/psychologue/groups/:groupId/end-session', authMiddleware, therapyGroupController.endGroupSession);

// =============================================
// PATIENT ROUTES
// =============================================

// Protected route - get all groups (to show membership status)
router.get('/groups', authMiddleware, therapyGroupController.getGroups);

// Protected routes - join/leave groups
router.post('/groups/join', authMiddleware, therapyGroupController.joinGroup);
router.get('/my-groups', authMiddleware, therapyGroupController.getMyGroupsAsPatient);

// Rate a group therapy session
router.post('/groups/rate', authMiddleware, therapyGroupController.createGroupSessionRating);

module.exports = router;