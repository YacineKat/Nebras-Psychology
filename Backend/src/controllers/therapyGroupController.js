const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =============================================
// PSYCHOLOGUE GROUP MANAGEMENT
// =============================================

// Create a new therapy group (psychologue only)
async function createGroup(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (req.user.userType !== 'psychologue') {
      return res.status(403).json({ error: 'Seuls les psychologues peuvent créer des groupes' });
    }

    const { name, description, theme, dayOfWeek, time, duration, maxParticipants, price } = req.body;

    if (!name || dayOfWeek === undefined || !time) {
      return res.status(400).json({ error: 'Nom, jour et heure requis' });
    }

    const group = await prisma.therapyGroup.create({
      data: {
        name,
        description: description || '',
        theme: theme || null,
        dayOfWeek: parseInt(dayOfWeek),
        time,
        duration: duration || 90,
        maxParticipants: maxParticipants || 10,
        currentParticipants: 0,
        price: price || null,
        psychologueId
      }
    });

    res.status(201).json({ 
      success: true, 
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        theme: group.theme,
        day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][group.dayOfWeek],
        time: group.time,
        duration: group.duration,
        maxParticipants: group.maxParticipants,
        currentParticipants: group.currentParticipants,
        price: group.price
      }
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Get groups created by the psychologue
async function getMyGroups(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const groups = await prisma.therapyGroup.findMany({
      where: { psychologueId },
      orderBy: { createdAt: 'desc' }
    });

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    
    // Get pending requests count for each group
    const groupsWithCounts = await Promise.all(groups.map(async (g) => {
      const pendingCount = await prisma.groupMember.count({
        where: { groupId: g.id, status: 'pending' }
      });
      
      const participants = await prisma.groupMember.findMany({
        where: { groupId: g.id, status: 'accepted' },
        include: { user: { select: { id: true, fullname: true } } }
      });

      const waitingList = await prisma.groupMember.findMany({
        where: { groupId: g.id, status: 'pending' },
        include: { user: { select: { id: true, fullname: true } } }
      });

      return {
        id: g.id,
        name: g.name,
        description: g.description || '',
        theme: g.theme || '',
        day: dayNames[g.dayOfWeek] || 'Lundi',
        time: g.time || '19:00',
        duration: g.duration || 90,
        maxPlaces: g.maxParticipants || 10,
        currentPlaces: g.currentParticipants || 0,
        price: g.price || 0,
        waitingCount: pendingCount || 0,
        waitingList: (waitingList || []).map(w => ({
          id: w.id,
          userId: w.user?.id,
          name: w.user?.fullname || 'Unknown',
          requestDate: w.joinedAt ? w.joinedAt.toLocaleDateString('fr-FR') : '-'
        })).filter(w => w.userId),
        participants: (participants || []).map(p => ({
          id: p.id,
          userId: p.user?.id,
          name: p.user?.fullname || 'Unknown',
          joinedDate: p.joinedAt ? p.joinedAt.toLocaleDateString('fr-FR') : '-'
        })).filter(p => p.userId)
      };
    }));

    res.json({ groups: groupsWithCounts });
  } catch (error) {
    console.error('Error fetching my groups:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Update a therapy group
async function updateGroup(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { groupId } = req.params;
    const { name, description, theme, dayOfWeek, time, duration, maxParticipants, price } = req.body;

    // Verify group belongs to this psychologue
    const existingGroup = await prisma.therapyGroup.findFirst({
      where: { id: groupId, psychologueId }
    });

    if (!existingGroup) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    const group = await prisma.therapyGroup.update({
      where: { id: groupId },
      data: {
        name: name || existingGroup.name,
        description: description !== undefined ? description : existingGroup.description,
        theme: theme !== undefined ? theme : existingGroup.theme,
        dayOfWeek: dayOfWeek !== undefined ? parseInt(dayOfWeek) : existingGroup.dayOfWeek,
        time: time || existingGroup.time,
        duration: duration || existingGroup.duration,
        maxParticipants: maxParticipants || existingGroup.maxParticipants,
        price: price !== undefined ? price : existingGroup.price
      }
    });

    res.json({ 
      success: true, 
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        theme: group.theme,
        day: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][group.dayOfWeek],
        time: group.time,
        duration: group.duration,
        maxParticipants: group.maxParticipants,
        price: group.price
      }
    });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Delete a therapy group
async function deleteGroup(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { groupId } = req.params;

    // Verify group belongs to this psychologue
    const existingGroup = await prisma.therapyGroup.findFirst({
      where: { id: groupId, psychologueId }
    });

    if (!existingGroup) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Delete all group members first
    await prisma.groupMember.deleteMany({
      where: { groupId }
    });

    // Delete the group
    await prisma.therapyGroup.delete({
      where: { id: groupId }
    });

    res.json({ success: true, message: 'Groupe supprimé' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Get group details (for managing waiting list and participants)
async function getGroupDetails(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { groupId } = req.params;

    const group = await prisma.therapyGroup.findFirst({
      where: { id: groupId, psychologueId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    const waitingList = await prisma.groupMember.findMany({
      where: { groupId, status: 'pending' },
      include: { user: { select: { id: true, fullname: true } } }
    });

    const participants = await prisma.groupMember.findMany({
      where: { groupId, status: 'accepted' },
      include: { user: { select: { id: true, fullname: true } } }
    });

    res.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        theme: group.theme,
        day: dayNames[group.dayOfWeek],
        time: group.time,
        duration: group.duration,
        maxPlaces: group.maxParticipants,
        currentPlaces: group.currentParticipants,
        price: group.price,
        waitingList: waitingList.map(w => ({
          id: w.id,
          userId: w.user.id,
          name: w.user.fullname,
          requestDate: w.joinedAt.toLocaleDateString('fr-FR')
        })),
        participants: participants.map(p => ({
          id: p.id,
          userId: p.user.id,
          name: p.user.fullname,
          joinedDate: p.joinedAt.toLocaleDateString('fr-FR')
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Accept a patient request (from waiting list to participants)
async function acceptPatientRequest(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ error: 'ID du membre requis' });
    }

    // Get the member with group info
    const member = await prisma.groupMember.findUnique({
      where: { id: memberId },
      include: { group: true }
    });

    if (!member) {
      return res.status(404).json({ error: 'Demande introuvable' });
    }

    // Verify group belongs to this psychologue
    if (member.group.psychologueId !== psychologueId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    if (member.group.currentParticipants >= member.group.maxParticipants) {
      return res.status(400).json({ error: 'Groupe complet' });
    }

    // Accept and increment count
    await prisma.$transaction([
      prisma.groupMember.update({
        where: { id: memberId },
        data: { status: 'accepted' }
      }),
      prisma.therapyGroup.update({
        where: { id: member.groupId },
        data: { currentParticipants: { increment: 1 } }
      })
    ]);

    res.json({ success: true, message: 'Patient accepté dans le groupe' });
  } catch (error) {
    console.error('Error accepting request:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Reject a patient request
async function rejectPatientRequest(req, res) {
  try {
    const psychologueId = req.user?.id;
    if (!psychologueId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ error: 'ID du membre requis' });
    }

    // Get the member with group info
    const member = await prisma.groupMember.findUnique({
      where: { id: memberId },
      include: { group: true }
    });

    if (!member) {
      return res.status(404).json({ error: 'Demande introuvable' });
    }

    // Verify group belongs to this psychologue
    if (member.group.psychologueId !== psychologueId) {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    await prisma.groupMember.update({
      where: { id: memberId },
      data: { status: 'rejected' }
    });

    res.json({ success: true, message: 'Demande refusée' });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// =============================================
// PATIENT-FACING FUNCTIONS (existing)
// =============================================

// Get all active therapy groups
async function getGroups(req, res) {
  try {
    const groups = await prisma.therapyGroup.findMany({
      where: { isActive: true },
      orderBy: { dayOfWeek: 'asc' }
    });

    // Get user's membership status
    const userId = req.user?.id;
    console.log('getGroups - userId from token:', userId);
    
    let userMemberships = [];
    if (userId) {
      userMemberships = await prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true, status: true }
      });
      console.log('getGroups - user memberships:', userMemberships);
    }

    const membershipMap = {};
    userMemberships.forEach(m => {
      membershipMap[m.groupId] = m.status;
    });

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const formattedGroups = groups.map(g => {
      const status = membershipMap[g.id];
      return {
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
        membershipStatus: status || null // null, 'pending', 'accepted', 'rejected'
      };
    });

    res.json({ groups: formattedGroups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Join a therapy group - creates pending request
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

    // Check if group exists
    const group = await prisma.therapyGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    // Check if already a member or has pending request
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId
        }
      }
    });

    if (existingMember) {
      if (existingMember.status === 'pending') {
        return res.status(400).json({ error: 'Demande en attente de validation' });
      }
      if (existingMember.status === 'accepted') {
        return res.status(400).json({ error: 'Déjà membre de ce groupe' });
      }
      if (existingMember.status === 'rejected') {
        // Allow re-request
        await prisma.groupMember.update({
          where: { id: existingMember.id },
          data: { status: 'pending' }
        });
        return res.json({ success: true, message: 'Demande de réinscription envoyée' });
      }
    }

    // Create pending request (don't increment count yet)
    await prisma.groupMember.create({
      data: { groupId, userId, status: 'pending' }
    });

    res.json({ success: true, message: 'Demande envoyée, en attente de validation' });
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

// Get user's joined groups (for patients)
async function getMyGroupsAsPatient(req, res) {
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

// Get pending requests (for psychologues)
async function getPendingRequests(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const requests = await prisma.groupMember.findMany({
      where: { status: 'pending' },
      include: {
        user: { select: { id: true, fullname: true, email: true } },
        group: { select: { id: true, name: true } }
      },
      orderBy: { joinedAt: 'desc' }
    });

    res.json({ requests });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Accept a join request
async function acceptRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ error: 'ID du membre requis' });
    }

    // Get the member and group
    const member = await prisma.groupMember.findUnique({
      where: { id: memberId },
      include: { group: true }
    });

    if (!member) {
      return res.status(404).json({ error: 'Demande introuvable' });
    }

    if (member.group.currentParticipants >= member.group.maxParticipants) {
      return res.status(400).json({ error: 'Groupe complet' });
    }

    // Accept the request and increment count
    await prisma.$transaction([
      prisma.groupMember.update({
        where: { id: memberId },
        data: { status: 'accepted' }
      }),
      prisma.therapyGroup.update({
        where: { id: member.groupId },
        data: { currentParticipants: { increment: 1 } }
      })
    ]);

    res.json({ success: true, message: 'Demande acceptée' });
  } catch (error) {
    console.error('Error accepting request:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Reject a join request
async function rejectRequest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { memberId } = req.body;
    if (!memberId) {
      return res.status(400).json({ error: 'ID du membre requis' });
    }

    await prisma.groupMember.update({
      where: { id: memberId },
      data: { status: 'rejected' }
    });

    res.json({ success: true, message: 'Demande refusée' });
  } catch (error) {
    console.error('Error rejecting request:', error);
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
  // Psychologue functions
  createGroup,
  getMyGroups,
  updateGroup,
  deleteGroup,
  getGroupDetails,
  acceptPatientRequest,
  rejectPatientRequest,
  // Patient functions
  getGroups,
  joinGroup,
  leaveGroup,
  getMyGroupsAsPatient,
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  seedGroups
};