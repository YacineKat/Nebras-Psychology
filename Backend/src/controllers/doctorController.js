// ============================================
// DOCTOR CONTROLLER - Get & Manage Doctors
// ============================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================================
// GET ALL DOCTORS (with filters)
// ============================================
exports.getAllDoctors = async (req, res) => {
  try {
    const { search, specialty, available } = req.query;

    // Build where clause for doctors only
    const where = {
      userType: 'psychologue' // Only psychologists
    };

    // Search by name (case insensitive)
    if (search) {
      where.fullname = { contains: search, mode: 'insensitive' };
    }

    // Get all doctors with their profiles and available slots
    const doctors = await prisma.user.findMany({
      where,
      include: {
        profile: true,
        timeSlots: {
          where: { isBooked: false }
        }
      }
    });

    // Filter by specialty if provided
    let filteredDoctors = doctors;

    if (specialty) {
      filteredDoctors = doctors.filter(d => 
        d.profile?.specialite?.toLowerCase().includes(specialty.toLowerCase())
      );
    }

    // Filter by availability
    if (available === 'true') {
      filteredDoctors = filteredDoctors.filter(d => 
        d.profile?.isAvailable === true && d.timeSlots.length > 0
      );
    }

    // Map response to simplified format
    const response = filteredDoctors.map(d => ({
      id: d.id,
      fullname: d.fullname,
      email: d.email,
      specialite: d.profile?.specialite || 'General',
      universite: d.profile?.universite || '',
      bio: d.profile?.bio || '',
      rating: Number(d.profile?.rating) || 0,
      isAvailable: d.profile?.isAvailable || false,
      tarif: d.profile?.tarif,
      language: d.profile?.language,
      motifs: d.profile?.motifs,
      availableSlots: d.timeSlots.map(slot => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime
      }))
    }));

    res.json(response);

  } catch (error) {
    console.error('GetAllDoctors error:', error);
    res.status(500).json({ error: 'Failed to get doctors' });
  }
};

// ============================================
// GET DOCTOR BY ID
// ============================================
exports.getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        timeSlots: {
          where: { isBooked: false }
        }
      }
    });

    if (!doctor || doctor.userType !== 'psychologue') {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({
      id: doctor.id,
      fullname: doctor.fullname,
      email: doctor.email,
      specialite: doctor.profile?.specialite,
      universite: doctor.profile?.universite,
      bio: doctor.profile?.bio,
      rating: Number(doctor.profile?.rating) || 0,
      isAvailable: doctor.profile?.isAvailable,
      phone: doctor.profile?.phone,
      tarif: doctor.profile?.tarif,
      language: doctor.profile?.language,
      motifs: doctor.profile?.motifs,
      diplomes: doctor.profile?.diplomes,
      agrement: doctor.profile?.agrement,
      availableSlots: doctor.timeSlots
    });

  } catch (error) {
    console.error('GetDoctorById error:', error);
    res.status(500).json({ error: 'Failed to get doctor' });
  }
};

// ============================================
// GET MY PROFILE (For doctors/counselors)
// ============================================
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        timeSlots: true,
        appointmentsAsDoctor: {
          orderBy: { appointmentDate: 'desc' },
          take: 10,
          include: {
            patient: { include: { profile: true } }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });

  } catch (error) {
    console.error('GetMyProfile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// ============================================
// UPDATE DOCTOR PROFILE
// ============================================
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { specialite, universite, bio, isAvailable } = req.body;

    // Check if user is a professional
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.userType !== 'psychologue' && user.userType !== 'counselor') {
      return res.status(403).json({ error: 'Only doctors can update doctor profile' });
    }

    // Update profile
    const profile = await prisma.profile.update({
      where: { userId },
      data: {
        specialite,
        universite,
        bio,
        isAvailable
      }
    });

    res.json({ 
      message: 'Profile updated successfully',
      profile 
    });

  } catch (error) {
    console.error('UpdateProfile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// ============================================
// ADD TIME SLOT (Doctor sets availability)
// ============================================
exports.addTimeSlot = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { dayOfWeek, startTime, endTime } = req.body;

    // Create time slot
    const slot = await prisma.timeSlot.create({
      data: {
        doctorId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        endTime,
        isBooked: false
      }
    });

    res.status(201).json({
      message: 'Time slot added successfully',
      slot
    });

  } catch (error) {
    console.error('AddTimeSlot error:', error);
    res.status(500).json({ error: 'Failed to add time slot' });
  }
};

// ============================================
// GET DOCTOR'S SCHEDULE
// ============================================
exports.getSchedule = async (req, res) => {
  try {
    const doctorId = req.user.id;

    const slots = await prisma.timeSlot.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });

    res.json(slots);

  } catch (error) {
    console.error('GetSchedule error:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
};

// ============================================
// DELETE TIME SLOT
// ============================================
exports.deleteTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.id;

    // Check ownership
    const slot = await prisma.timeSlot.findUnique({ where: { id } });
    if (!slot || slot.doctorId !== doctorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete if not booked
    if (slot.isBooked) {
      return res.status(400).json({ error: 'Cannot delete booked slot' });
    }

    await prisma.timeSlot.delete({ where: { id } });

    res.json({ message: 'Time slot deleted' });

  } catch (error) {
    console.error('DeleteTimeSlot error:', error);
    res.status(500).json({ error: 'Failed to delete time slot' });
  }
};

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});