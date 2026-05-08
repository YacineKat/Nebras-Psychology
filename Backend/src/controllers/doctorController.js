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

// ============================================
// GET DOCTOR DASHBOARD DATA
// ============================================
exports.getDashboard = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // 1. Get all appointments for this doctor
    const allAppointments = await prisma.appointment.findMany({
      where: { doctorId },
      include: {
        patient: { include: { profile: true } }
      }
    });

    // 2. Calculate stats
    // Active patients (all confirmed appointments)
    const activePatients = allAppointments.filter(a => a.status === 'confirmed').length;
    
    // Today's sessions
    const todaySessions = allAppointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= today && aptDate < tomorrow && a.status !== 'cancelled';
    });
    
    // Pending requests
    const pendingRequests = allAppointments.filter(a => a.status === 'pending');
    
    // Monthly income (completed appointments this month)
    const monthlyCompleted = allAppointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= startOfMonth && aptDate <= endOfMonth && a.status === 'completed';
    });
    
    // Get doctor tariff
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { profile: true }
    });
    const tarif = doctor?.profile?.tarif || 3000;
    const monthlyIncome = monthlyCompleted.length * tarif;

    // 3. Today's sessions with details
    const todaySessionsData = await prisma.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: {
          gte: today,
          lt: tomorrow
        },
        status: { not: 'cancelled' }
      },
      include: {
        patient: { include: { profile: true } }
      },
      orderBy: { appointmentTime: 'asc' }
    });

    // 4. Pending requests details
    const pendingRequestsData = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: 'pending'
      },
      include: {
        patient: { include: { profile: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 5. Upcoming appointments (next 7 days)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: {
          gte: tomorrow,
          lte: nextWeek
        },
        status: 'confirmed'
      },
      include: {
        patient: { include: { profile: true } }
      },
      orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }]
    });

    // 6. Get time slots for availability display
    const timeSlots = await prisma.timeSlot.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    });

    res.json({
      stats: {
        activePatients,
        todaySessionsCount: todaySessions.length,
        pendingRequestsCount: pendingRequests.length,
        monthlyIncome
      },
      todaySessions: todaySessionsData.map(apt => ({
        id: apt.id,
        patientName: apt.patient.fullname,
        patientId: apt.patient.id,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        status: apt.status,
        notes: apt.patient.profile?.motifs || ''
      })),
      pendingRequests: pendingRequestsData.map(apt => ({
        id: apt.id,
        patientName: apt.patient.fullname,
        patientId: apt.patient.id,
        patientPhone: apt.patient.profile?.phone || '',
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        motifs: apt.patient.profile?.motifs || '',
        createdAt: apt.createdAt
      })),
      upcomingAppointments: upcomingAppointments.map(apt => ({
        id: apt.id,
        patientName: apt.patient.fullname,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType
      })),
      timeSlots
    });

  } catch (error) {
    console.error('GetDashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
};

// ============================================
// GET DOCTOR'S PATIENTS
// ============================================
exports.getPatients = async (req, res) => {
  try {
    const doctorId = req.user.id;
    
    // Get all confirmed appointments for this doctor
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['confirmed', 'completed'] }
      },
      include: {
        patient: {
          include: { profile: true }
        }
      },
      orderBy: { appointmentDate: 'desc' }
    });
    
    // Group by patient and aggregate data
    const patientMap = new Map();
    
    appointments.forEach(apt => {
      const patientId = apt.patient.id;
      
      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          id: apt.patient.id,
          fullname: apt.patient.fullname,
          email: apt.patient.email,
          gender: apt.patient.profile?.gender,
          phone: apt.patient.profile?.phone,
          birthDate: apt.patient.profile?.birthDate,
          language: apt.patient.profile?.language,
          motifs: apt.patient.profile?.motifs,
          prefGender: apt.patient.profile?.prefGender,
          prefType: apt.patient.profile?.prefType,
          totalSessions: 0,
          lastSession: null,
          firstSession: null,
          totalSpent: 0
        });
      }
      
      const patient = patientMap.get(patientId);
      patient.totalSessions++;
      
      // Update last session
      if (!patient.lastSession || new Date(apt.appointmentDate) > new Date(patient.lastSession)) {
        patient.lastSession = apt.appointmentDate;
      }
      
      // Update first session
      if (!patient.firstSession || new Date(apt.appointmentDate) < new Date(patient.firstSession)) {
        patient.firstSession = apt.appointmentDate;
      }
    });
    
    // Get doctor's tariff for revenue calculation
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { profile: true }
    });
    const tarif = doctor?.profile?.tarif || 3000;
    
    // Calculate total spent for each patient
    patientMap.forEach(patient => {
      patient.totalSpent = patient.totalSessions * tarif;
    });
    
    const patients = Array.from(patientMap.values());
    
    res.json({
      count: patients.length,
      patients
    });

  } catch (error) {
    console.error('GetPatients error:', error);
    res.status(500).json({ error: 'Failed to get patients' });
  }
};

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});