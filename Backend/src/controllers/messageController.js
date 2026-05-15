// ============================================
// MESSAGE CONTROLLER - Send & Get Messages
// ============================================

const prisma = require('../prisma');

async function createMessageRecord(senderId, receiverId, content) {
  return prisma.message.create({
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
}

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

    const message = await createMessageRecord(senderId, receiverId, content);

    if (global.io) {
      const senderRoom = `user:${senderId}`;
      const receiverRoom = `user:${receiverId}`;
      global.io.to(senderRoom).emit('message:new', { message, conversationPartnerId: receiverId });
      global.io.to(receiverRoom).emit('message:new', { message, conversationPartnerId: senderId });
    }

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
      select: {
        id: true,
        content: true,
        createdAt: true,
        senderId: true,
        receiverId: true,
        sender: {
          select: {
            id: true,
            fullname: true,
            userType: true,
            profile: {
              select: {
                id: true,
                avatar: true
              }
            }
          }
        },
        receiver: {
          select: {
            id: true,
            fullname: true,
            userType: true,
            profile: {
              select: {
                id: true,
                avatar: true
              }
            }
          }
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
              photo: partner.profile.avatar || null
            } : null
          },
          lastMessage: msg.content,
          lastMessageTime: msg.createdAt,
          unreadCount: 0
        });
      }
    });

    const unreadCounts = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId,
        isRead: false
      },
      _count: { _all: true }
    });

    const unreadMap = new Map(
      unreadCounts.map(item => [item.senderId, item._count._all])
    );

    // Apply unread counts per partner
    for (const [partnerId, conv] of conversationsMap) {
      conv.unreadCount = unreadMap.get(partnerId) || 0;
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

module.exports.createMessageRecord = createMessageRecord;