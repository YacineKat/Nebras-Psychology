const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all active therapy groups
async function getGroups(req, res) {
  try {
    const groups = await prisma.therapyGroup.findMany({
      where: { isActive: true },
      orderBy: { dayOfWeek: 'asc' }
    });

    // Get user's joined groups
    const userId = req.user?.id;
    let userGroupIds = [];
    if (userId) {
      const memberships = await prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true }
      });
      userGroupIds = memberships.map(m => m.groupId);
    }

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const formattedGroups = groups.map(g => ({
      id: g.id,
      name: g.name,
      description: g.description,
      day: dayNames[g.dayOfWeek],
      time: g.time,
      duration: g.duration,
      maxParticipants: g.maxParticipants,
      currentParticipants: g.currentParticipants,
      availablePlaces: g.maxParticipants - g.currentParticipants,
      icon: g.icon,
      isJoined: userGroupIds.includes(g.id)
    }));

    res.json({ groups: formattedGroups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Join a therapy group
async function joinGroup(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ error: 'ID du groupe requis' });
    }

    // Check if group exists and has space
    const group = await prisma.therapyGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    if (group.currentParticipants >= group.maxParticipants) {
      return res.status(400).json({ error: 'Groupe complet' });
    }

    // Check if already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: 'Déjà membre de ce groupe' });
    }

    // Add member and increment count
    await prisma.$transaction([
      prisma.groupMember.create({
        data: { groupId, userId }
      }),
      prisma.therapyGroup.update({
        where: { id: groupId },
        data: { currentParticipants: { increment: 1 } }
      })
    ]);

    res.json({ success: true, message: 'Inscription réussie' });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Leave a therapy group
async function leaveGroup(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ error: 'ID du groupe requis' });
    }

    // Check membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    if (!membership) {
      return res.status(400).json({ error: 'Vous n\'êtes pas membre de ce groupe' });
    }

    // Remove member and decrement count
    await prisma.$transaction([
      prisma.groupMember.delete({
        where: { id: membership.id }
      }),
      prisma.therapyGroup.update({
        where: { id: groupId },
        data: { currentParticipants: { decrement: 1 } }
      })
    ]);

    res.json({ success: true, message: 'Désinscription réussie' });
  } catch (error) {
    console.error('Error leaving group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Get user's joined groups
async function getMyGroups(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: true
      }
    });

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const groups = memberships.map(m => ({
      id: m.group.id,
      name: m.group.name,
      description: m.group.description,
      day: dayNames[m.group.dayOfWeek],
      time: m.group.time,
      duration: m.group.duration,
      maxParticipants: m.group.maxParticipants,
      currentParticipants: m.group.currentParticipants,
      icon: m.group.icon,
      joinedAt: m.joinedAt
    }));

    res.json({ groups });
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Seed default groups (for development)
async function seedGroups(req, res) {
  try {
    const defaultGroups = [
      { name: 'Gestion du stress', description: 'Apprenez à gérer votre stress quotidien avec des techniques de relaxation.', dayOfWeek: 3, time: '19:00', duration: 90, maxParticipants: 8, icon: 'stress' },
      { name: 'Confiance en soi', description: 'Développez votre estime personnelle dans un cadre sécurisant.', dayOfWeek: 1, time: '18:00', duration: 90, maxParticipants: 6, icon: 'confidence' },
      { name: 'Relations de couple', description: 'Améliorez votre communication et renforcez votre couple.', dayOfWeek: 2, time: '20:00', duration: 120, maxParticipants: 10, icon: 'couple' },
      { name: 'Dépasser l\'anxiété', description: 'Identifiez et surmontez vos angoisses avec un accompagnement adapté.', dayOfWeek: 4, time: '17:00', duration: 90, maxParticipants: 8, icon: 'anxiety' },
      { name: 'Gestion du deuil', description: 'Accompagnement dans le processus de deuil et la reconstruction.', dayOfWeek: 5, time: '18:30', duration: 90, maxParticipants: 8, icon: 'heart' }
    ];

    for (const g of defaultGroups) {
      await prisma.therapyGroup.upsert({
        where: { name: g.name },
        update: g,
        create: g
      });
    }

    res.json({ success: true, message: 'Groupes种子已添加' });
  } catch (error) {
    console.error('Error seeding groups:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getGroups,
  joinGroup,
  leaveGroup,
  getMyGroups,
  seedGroups
};