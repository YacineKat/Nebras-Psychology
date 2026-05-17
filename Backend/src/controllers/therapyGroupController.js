const prisma = require('../prisma');

// =============================================
// REAL-TIME BROADCAST HELPERS
// =============================================

function broadcastGroupChange(type, details = {}) {
  if (!global.io) return;
  global.io.emit('group-data-changed', {
    type,
    timestamp: new Date().toISOString(),
    ...details
  });
}

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

    // Broadcast real-time update
    broadcastGroupChange('group-created', { groupId: group.id, psychologueId });

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

    // Broadcast real-time update
    broadcastGroupChange('group-updated', { groupId: group.id, psychologueId });

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

    // Broadcast real-time update
    broadcastGroupChange('group-deleted', { groupId, psychologueId });

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
      where: { id: groupId, psychologueId },
      include: {
        psychologue: {
          select: { id: true, fullname: true, profile: { select: { avatar: true } } }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable' });
    }

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    const waitingList = await prisma.groupMember.findMany({
      where: { groupId, status: 'pending' },
      include: { user: { select: { id: true, fullname: true, profile: { select: { avatar: true } } } } }
    });

    const participants = await prisma.groupMember.findMany({
      where: { groupId, status: 'accepted' },
      include: { user: { select: { id: true, fullname: true, profile: { select: { avatar: true } } } } }
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
          avatar: w.user.profile?.avatar || null,
          requestDate: w.joinedAt.toLocaleDateString('fr-FR')
        })),
        participants: participants.map(p => ({
          id: p.id,
          userId: p.user.id,
          name: p.user.fullname,
          avatar: p.user.profile?.avatar || null,
          joinedDate: p.joinedAt.toLocaleDateString('fr-FR')
        })),
        doctor: group.psychologue ? {
          id: group.psychologue.id,
          name: group.psychologue.fullname,
          avatar: group.psychologue.profile?.avatar || null
        } : null
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

    // Emit group:join-accepted to the patient so they auto-join the live call
    if (global.io) {
      const doctorUser = await prisma.user.findUnique({
        where: { id: psychologueId },
        select: { fullname: true }
      });
      global.io.to(`patient:${member.userId}`).emit('group:join-accepted', {
        groupId: member.groupId,
        roomId: `group_${member.groupId}`,
        doctorId: member.group.psychologueId,
        doctorName: doctorUser?.fullname || 'Psychologue'
      });
    }

    // Broadcast real-time update (for doctor group listing)
    broadcastGroupChange('group-member-accepted', { groupId: member.groupId, psychologueId });

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

    // Emit group:join-rejected to the patient so they get real-time feedback
    if (global.io) {
      global.io.to(`patient:${member.userId}`).emit('group:join-rejected', {
        groupId: member.groupId
      });
    }

    // Broadcast real-time update
    broadcastGroupChange('group-member-rejected', { groupId: member.groupId, psychologueId });

    res.json({ success: true, message: 'Demande refusée' });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// End a group session — notify all accepted + pending members in real-time,
// delete video room, mark group inactive, and clean up stale pending requests
async function endGroupSession(req, res) {
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

    // 1. Get accepted members BEFORE deleting group (for notifications)
    const acceptedMemberRecords = await prisma.groupMember.findMany({
      where: { groupId, status: 'accepted' },
      include: { user: { select: { id: true } } }
    });

    // 2. Delete group permanently - remove from database entirely so it never reappears
    //    (Cascade will automatically delete all groupMember records)
    await prisma.therapyGroup.delete({
      where: { id: groupId }
    });

    // 3. Notify ALL accepted members via socket.io that the group has ended
    if (global.io) {
      const doctor = await prisma.user.findUnique({
        where: { id: psychologueId },
        select: { fullname: true }
      });
      const doctorName = doctor?.fullname || 'Psychologue';
      const notifiedIds = new Set();
      for (const member of acceptedMemberRecords) {
        const patientId = member.user.id;
        if (!notifiedIds.has(patientId)) {
          notifiedIds.add(patientId);
          global.io.to(`patient:${patientId}`).emit('group:ended', {
            groupId,
            doctorId: psychologueId,
            doctorName,
            disconnect: true,
            reason: 'doctor-ended'
          });
        }
      }
    }

    // 4. Delete video server room for this group
    const VIDEO_SERVER_URL = process.env.VIDEO_SERVER_URL || 'http://localhost:5000';
    const roomId = `group_${groupId}`;
    try {
      await fetch(`${VIDEO_SERVER_URL}/api/rooms/${roomId}`, {
        method: 'DELETE'
      });
    } catch (videoErr) {
      console.log('Video server room deletion (non-blocking):', videoErr.message);
    }

    // Broadcast real-time update so ALL clients re-fetch
    broadcastGroupChange('group-ended', { groupId, psychologueId });

    res.json({ success: true, message: 'Session terminée, données nettoyées' });
  } catch (error) {
    console.error('Error ending group session:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Rate a group therapy session (patient only)
async function createGroupSessionRating(req, res) {
  try {
    const patientId = req.user?.id;
    if (!patientId) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { doctorId, groupId, rating, comment } = req.body;

    if (!doctorId || !groupId || !rating) {
      return res.status(400).json({ error: 'doctorId, groupId et rating requis' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La note doit être entre 1 et 5' });
    }

    // Check patient is a member
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: patientId
        }
      }
    });

    if (!membership || membership.status !== 'accepted') {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce groupe' });
    }

    // Check for duplicate rating
    const existing = await prisma.groupSessionRating.findUnique({
      where: {
        patientId_doctorId_groupId: {
          patientId,
          doctorId,
          groupId
        }
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'Vous avez déjà noté cette session' });
    }

    const ratingRecord = await prisma.groupSessionRating.create({
      data: {
        patientId,
        doctorId,
        groupId,
        rating,
        comment: comment || undefined
      }
    });

    // Update doctor's overall rating
    const allRatings = await prisma.groupSessionRating.findMany({
      where: { doctorId },
      select: { rating: true }
    });
    const reviewRatings = await prisma.review.findMany({
      where: { doctorId },
      select: { rating: true }
    });
    const allScores = [
      ...allRatings.map(r => r.rating),
      ...reviewRatings.map(r => r.rating)
    ];
    const avgRating = allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100
      : 0;

    await prisma.profile.updateMany({
      where: { userId: doctorId },
      data: { rating: avgRating }
    });

    res.status(201).json({
      success: true,
      message: 'Note enregistrée',
      rating: ratingRecord
    });
  } catch (error) {
    console.error('Error creating group session rating:', error);
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

    // Validate: patient must have had at least one appointment with the group's psychologist
    if (group.psychologueId) {
      const hasAppointment = await prisma.appointment.findFirst({
        where: {
          patientId: userId,
          doctorId: group.psychologueId,
          status: { in: ['confirmed', 'completed'] }
        }
      });

      if (!hasAppointment) {
        return res.status(403).json({
          error: 'Vous devez avoir consulté ce psychologue avant de rejoindre un groupe thérapeutique'
        });
      }
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
        // Broadcast real-time update (re-request)
        broadcastGroupChange('group:join-request', { groupId, userId });
        // Also notify psychologue via socket
        const patientUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { fullname: true }
        });
        emitJoinRequestNotification(group.psychologueId, userId, groupId, patientUser?.fullname);
        return res.json({ success: true, message: 'Demande de réinscription envoyée' });
      }
    }

    // Create pending request (don't increment count yet)
    await prisma.groupMember.create({
      data: { groupId, userId, status: 'pending' }
    });

    // Broadcast real-time update (new join request)
    broadcastGroupChange('group:join-request', { groupId, userId });
    // Notify psychologue via socket about the new join request
    const patientUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullname: true }
    });
    emitJoinRequestNotification(group.psychologueId, userId, groupId, patientUser?.fullname);

    res.json({ success: true, message: 'Demande envoyée, en attente de validation' });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// Helper: emit real-time join request notification to the psychologue
function emitJoinRequestNotification(psychologueId, patientId, groupId, patientName) {
  if (!global.io || !psychologueId) return;
  global.io.to(`doctor:${psychologueId}`).emit('group:join-request', {
    patientId,
    patientName: patientName || 'Patient',
    groupId,
    timestamp: new Date().toISOString()
  });
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

    // Broadcast real-time update
    broadcastGroupChange('group-member-left', { groupId, userId });

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
        group: {
          include: {
            psychologue: {
              select: { id: true, fullname: true, profile: { select: { avatar: true } } }
            },
            members: {
              where: { status: 'accepted' },
              include: {
                user: {
                  select: { id: true, fullname: true, profile: { select: { avatar: true } } }
                }
              }
            }
          }
        }
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
      doctorId: m.group.psychologueId || null,
      doctor: m.group.psychologue ? {
        id: m.group.psychologue.id,
        name: m.group.psychologue.fullname,
        avatar: m.group.psychologue.profile?.avatar || null
      } : null,
      participants: (m.group.members || []).map(member => ({
        id: member.id,
        userId: member.user.id,
        name: member.user.fullname,
        avatar: member.user.profile?.avatar || null,
        joinedAt: member.joinedAt
      })),
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
  endGroupSession,
  // Patient functions
  getGroups,
  joinGroup,
  leaveGroup,
  getMyGroupsAsPatient,
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  createGroupSessionRating,
  seedGroups
};