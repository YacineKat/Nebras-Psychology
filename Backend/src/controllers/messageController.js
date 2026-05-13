// ============================================
// MESSAGE CONTROLLER - Send & Get Messages
// ============================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================================
// SEND MESSAGE
// ============================================
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    // Validation
    if (!receiverId || !content) {
      return res.status(400).json({ error: 'Please provide receiver and message content' });
    }

    // Check if receiver exists
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    // Can't send message to yourself
    if (senderId === receiverId) {
      return res.status(400).json({ error: 'Cannot send message to yourself' });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content
      },
      include: {
        sender: { select: { id: true, fullname: true } },
        receiver: { select: { id: true, fullname: true } }
      }
    });

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: message
    });

  } catch (error) {
    console.error('SendMessage error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// ============================================
// GET MY CONVERSATIONS
// ============================================
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all unique conversations (people user has messaged with)
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          include: { profile: true }
        },
        receiver: {
          include: { profile: true }
        }
      }
    });

    // Group by conversation partner
    const conversationsMap = new Map();

    messages.forEach(msg => {
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      const partnerId = partner.id;

      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          partner: {
            id: partner.id,
            fullname: partner.fullname,
            userType: partner.userType,
            profile: partner.profile ? {
              id: partner.profile.id,
              avatar: partner.profile.avatar,
              photo: partner.profile.photo
            } : null
          },
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: 0
        });
      }
    });

    // Calculate unread count for each conversation
    for (const [partnerId, conv] of conversationsMap) {
      const unread = await prisma.message.count({
        where: {
          senderId: partnerId,
          receiverId: userId,
          isRead: false
        }
      });
      conv.unreadCount = unread;
    }

    // Convert to array and sort by last message time
    const conversations = Array.from(conversationsMap.values())
      .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    res.json(conversations);

  } catch (error) {
    console.error('GetConversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};

// ============================================
// GET MESSAGES WITH A USER
// ============================================
exports.getMessagesWithUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userId: otherUserId } = req.params;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, fullname: true } },
        receiver: { select: { id: true, fullname: true } }
      }
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: userId,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json(messages);

  } catch (error) {
    console.error('GetMessagesWithUser error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

// ============================================
// GET UNREAD COUNT
// ============================================
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await prisma.message.count({
      where: {
        receiverId: userId,
        isRead: false
      }
    });

    res.json({ unreadCount: count });

  } catch (error) {
    console.error('GetUnreadCount error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});