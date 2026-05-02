// ============================================
// MESSAGE ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Send a message
router.post('/', messageController.sendMessage);

// Get all conversations
router.get('/conversations', messageController.getConversations);

// Get messages with specific user
router.get('/with/:userId', messageController.getMessagesWithUser);

// Get unread count
router.get('/unread', messageController.getUnreadCount);

module.exports = router;