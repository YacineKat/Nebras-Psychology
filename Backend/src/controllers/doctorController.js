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
    const { dayOfWeek, startTime, endTime, specificDate, recurrence } = req.body;

    // If recurrence is daily/weekly/monthly, create multiple slots
    if (recurrence && recurrence !== 'none') {
      const slots = [];
      let createdCount = 0;
      
      if (recurrence === 'daily') {
        // Create for next 30 days
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 30; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + i);
          const dayOfWeekNum = date.getDay();
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: dayOfWeekNum,
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: false, recurrence: 'none' },
            create: {
              doctorId,
              dayOfWeek: dayOfWeekNum,
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: false,
              isBooked: false
            }
          });
          slots.push(slot);
          createdCount++;
        }
      } else if (recurrence === 'weekly') {
        // Create for next 4 weeks on the same day
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 4; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + (i * 7));
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: parseInt(dayOfWeek),
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: false, recurrence: 'none' },
            create: {
              doctorId,
              dayOfWeek: parseInt(dayOfWeek),
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: false,
              isBooked: false
            }
          });
          slots.push(slot);
          createdCount++;
        }
      } else if (recurrence === 'monthly') {
        // Create for next 3 months on the same day of month
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 3; i++) {
          const date = new Date(startDate);
          date.setMonth(date.getMonth() + i);
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: parseInt(dayOfWeek),
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: false, recurrence: 'none' },
            create: {
              doctorId,
              dayOfWeek: parseInt(dayOfWeek),
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: false,
              isBooked: false
            }
          });
          slots.push(slot);
          createdCount++;
        }
      }
      
      return res.status(201).json({
        message: `${createdCount} créneau(x) ajouté(s) avec récurrence ${recurrence}`,
        slots,
        count: createdCount
      });
    }
    
    // Single slot (no recurrence)
    const slot = await prisma.timeSlot.create({
      data: {
        doctorId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        endTime,
        specificDate: specificDate ? new Date(specificDate) : null,
        recurrence: recurrence || 'none',
        isBlocked: false,
        isBooked: false
      }
    });

    res.status(201).json({
      message: 'Time slot added successfully',
      slot
    });

  } catch (error) {
    console.error('AddTimeSlot error:', error);
    res.status(500).json({ error: 'Failed to add time slot: ' + error.message });
  }
};

// ============================================
// BLOCK TIME SLOT (Mark as unavailable)
// ============================================
exports.blockTimeSlot = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { dayOfWeek, startTime, endTime, specificDate, recurrence } = req.body;
    
    // Handle recurrence for blocking
    if (recurrence && recurrence !== 'none') {
      const blockedSlots = [];
      let blockedCount = 0;
      
      if (recurrence === 'daily') {
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 30; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + i);
          const dayOfWeekNum = date.getDay();
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: dayOfWeekNum,
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: true },
            create: {
              doctorId,
              dayOfWeek: dayOfWeekNum,
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: true,
              isBooked: false
            }
          });
          blockedSlots.push(slot);
          blockedCount++;
        }
      } else if (recurrence === 'weekly') {
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 4; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + (i * 7));
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: parseInt(dayOfWeek),
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: true },
            create: {
              doctorId,
              dayOfWeek: parseInt(dayOfWeek),
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: true,
              isBooked: false
            }
          });
          blockedSlots.push(slot);
          blockedCount++;
        }
      } else if (recurrence === 'monthly') {
        const startDate = specificDate ? new Date(specificDate) : new Date();
        for (let i = 0; i < 3; i++) {
          const date = new Date(startDate);
          date.setMonth(date.getMonth() + i);
          
          const slot = await prisma.timeSlot.upsert({
            where: {
              doctorId_dayOfWeek_startTime_specificDate: {
                doctorId,
                dayOfWeek: parseInt(dayOfWeek),
                startTime,
                specificDate: date
              }
            },
            update: { isBlocked: true },
            create: {
              doctorId,
              dayOfWeek: parseInt(dayOfWeek),
              startTime,
              endTime,
              specificDate: date,
              recurrence: 'none',
              isBlocked: true,
              isBooked: false
            }
          });
          blockedSlots.push(slot);
          blockedCount++;
        }
      }
      
      return res.status(201).json({
        message: `${blockedCount} créneau(x) bloqué(s)`,
        slots: blockedSlots,
        count: blockedCount
      });
    }
    
    // Single block
    const existingSlot = await prisma.timeSlot.findFirst({
      where: {
        doctorId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        specificDate: specificDate ? new Date(specificDate) : null
      }
    });
    
    if (existingSlot) {
      const updated = await prisma.timeSlot.update({
        where: { id: existingSlot.id },
        data: { isBlocked: true }
      });
      return res.json({ message: 'Créneau bloqué', slot: updated });
    }
    
    const slot = await prisma.timeSlot.create({
      data: {
        doctorId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        endTime,
        specificDate: specificDate ? new Date(specificDate) : null,
        recurrence: recurrence || 'none',
        isBlocked: true,
        isBooked: false
      }
    });
    
    res.status(201).json({
      message: 'Time slot blocked successfully',
      slot
    });

  } catch (error) {
    console.error('BlockTimeSlot error:', error);
    res.status(500).json({ error: 'Failed to block time slot' });
  }
};

// ============================================
// UNBLOCK TIME SLOT
// ============================================
exports.unblockTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.id;
    
    const slot = await prisma.timeSlot.findUnique({ where: { id } });
    if (!slot || slot.doctorId !== doctorId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // If it's a recurring block, we might need to handle differently
    // For now, just unblock this specific one
    const updated = await prisma.timeSlot.update({
      where: { id },
      data: { isBlocked: false }
    });
    
    res.json({ message: 'Créneau débloqué', slot: updated });

  } catch (error) {
    console.error('UnblockTimeSlot error:', error);
    res.status(500).json({ error: 'Failed to unblock time slot' });
  }
};

// ============================================
// GET DOCTOR'S SCHEDULE
// ============================================
exports.getSchedule = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { startDate, endDate } = req.query;

    let where = { doctorId };
    
    // Include both: specific date slots AND weekly recurring slots (specificDate: null)
    // If date range provided, filter specific date slots within the range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Always include recurring slots (specificDate: null) plus specific date slots in range
      where.OR = [
        { specificDate: { gte: start, lte: end } },
        { specificDate: null }
      ];
    }

    const slots = await prisma.timeSlot.findMany({
      where,
      orderBy: [
        { specificDate: 'asc' },
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });

    // Also get all appointments for this doctor (to display in schedule grid)
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['confirmed', 'pending', 'completed'] }
      },
      include: {
        patient: { include: { profile: true } }
      }
    });

    res.json({ slots, appointments });

  } catch (error) {
    console.error('GetSchedule error:', error);
    res.status(500).json({ error: 'Failed to get schedule: ' + error.message });
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
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 8);

    // Single optimized query: get all needed data in parallel
    const [allAppointments, doctor, timeSlots] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId },
        include: {
          patient: { include: { profile: true } }
        }
      }),
      prisma.user.findUnique({
        where: { id: doctorId },
        include: { profile: true }
      }),
      prisma.timeSlot.findMany({
        where: { doctorId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
      })
    ]);
    
    const tarif = doctor?.profile?.tarif || 3000;
    
    // Calculate stats from single data source
    const activePatients = allAppointments.filter(a => a.status === 'confirmed').length;
    
    const todaySessionsData = allAppointments
      .filter(a => {
        const aptDate = new Date(a.appointmentDate);
        return aptDate >= today && aptDate < tomorrow && a.status !== 'cancelled';
      })
      .sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''));
    
    const pendingRequestsData = allAppointments
      .filter(a => a.status === 'pending')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const upcomingAppointments = allAppointments
      .filter(a => {
        const aptDate = new Date(a.appointmentDate);
        return aptDate >= tomorrow && aptDate <= nextWeek && (a.status === 'confirmed' || a.status === 'pending');
      })
      .sort((a, b) => {
        const dateCompare = new Date(a.appointmentDate) - new Date(b.appointmentDate);
        if (dateCompare !== 0) return dateCompare;
        return (a.appointmentTime || '').localeCompare(b.appointmentTime || '');
      });
    
    const monthlyCompleted = allAppointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= startOfMonth && aptDate <= endOfMonth && a.status === 'completed';
    });
    
    const monthlyIncome = monthlyCompleted.length * tarif;

    res.json({
      stats: {
        activePatients,
        todaySessionsCount: todaySessionsData.length,
        pendingRequestsCount: pendingRequestsData.length,
        monthlyIncome
      },
      todaySessions: todaySessionsData.filter(apt => apt.patient).map(apt => ({
        id: apt.id,
        patientName: apt.patient.fullname,
        patientId: apt.patient.id,
        patientPhone: apt.patient.profile?.phone || '',
        patientGender: apt.patient.profile?.gender,
        motifs: apt.patient.profile?.motifs || '',
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        status: apt.status,
        notes: apt.patient.profile?.motifs || ''
      })),
      pendingRequests: pendingRequestsData.filter(apt => apt.patient).map(apt => ({
        id: apt.id,
        patientName: apt.patient.fullname,
        patientId: apt.patient.id,
        patientPhone: apt.patient.profile?.phone || '',
        patientGender: apt.patient.profile?.gender,
        motifs: apt.patient.profile?.motifs || '',
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        motifs: apt.patient.profile?.motifs || '',
        createdAt: apt.createdAt
      })),
      upcomingAppointments: upcomingAppointments.filter(apt => apt.patient).map(apt => ({
        id: apt.id,
        patientId: apt.patient.id,
        patientName: apt.patient.fullname,
        patientPhone: apt.patient.profile?.phone || '',
        motifs: apt.patient.profile?.motifs || '',
        patientGender: apt.patient.profile?.gender,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        status: apt.status
      })),
      timeSlots
    });

  } catch (error) {
    console.error('GetDashboard error:', error.message);
    if (error.code === 'P1001') {
      res.status(503).json({ error: 'Database unavailable. Please check connection.' });
    } else {
      res.status(500).json({ error: 'Failed to get dashboard data: ' + error.message });
    }
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

// ============================================
// GET DOCTOR HONORAIRES (Payments & Earnings)
// ============================================
exports.getHonoraires = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Get doctor profile for tariff
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { profile: true }
    });
    
    const tarif = doctor?.profile?.tarif || 2000;

    // Get all appointments for this doctor
    const appointments = await prisma.appointment.findMany({
      where: { doctorId },
      include: {
        patient: { include: { profile: true } }
      },
      orderBy: { appointmentDate: 'desc' }
    });

    // Calculate monthly stats
    const monthlyCompleted = appointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= startOfMonth && aptDate <= endOfMonth && a.status === 'completed';
    });

    const monthlyPending = appointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= startOfMonth && aptDate <= endOfMonth && a.status === 'pending';
    });

    const monthlyConfirmed = appointments.filter(a => {
      const aptDate = new Date(a.appointmentDate);
      return aptDate >= startOfMonth && aptDate <= endOfMonth && a.status === 'confirmed';
    });

    // Total income this month (from completed appointments)
    const totalIncome = monthlyCompleted.length * tarif;
    
    // Pending payments (completed but not yet paid - for now, treat completed as paid)
    const pendingPayments = monthlyPending.length * tarif;
    
    // Received payments (completed appointments)
    const receivedPayments = monthlyCompleted.length * tarif;

    // Recent transactions (last 10 completed appointments)
    const recentTransactions = appointments
      .filter(a => a.status === 'completed')
      .slice(0, 10)
      .map(apt => ({
        id: apt.id,
        date: apt.appointmentDate,
        patientName: apt.patient.fullname,
        amount: tarif,
        status: 'paid'
      }));

    // Upcoming payments (confirmed appointments in the future)
    const upcomingPayments = appointments
      .filter(a => {
        const aptDate = new Date(a.appointmentDate);
        return aptDate >= today && a.status === 'confirmed';
      })
      .slice(0, 10)
      .map(apt => ({
        id: apt.id,
        date: apt.appointmentDate,
        patientName: apt.patient.fullname,
        amount: tarif,
        status: 'upcoming'
      }));

    res.json({
      tarif,
      stats: {
        totalIncome,
        pendingPayments,
        receivedPayments
      },
      recentTransactions,
      upcomingPayments
    });

  } catch (error) {
    console.error('GetHonoraires error:', error.message);
    res.status(500).json({ error: 'Failed to get honoraires data: ' + error.message });
  }
};

// ============================================
// UPDATE DOCTOR TARIF
// ============================================
exports.updateTarif = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { tarif } = req.body;

    if (!tarif || typeof tarif !== 'number' || tarif <= 0) {
      return res.status(400).json({ error: 'Invalid tariff amount' });
    }

    const profile = await prisma.profile.update({
      where: { userId: doctorId },
      data: { tarif }
    });

    res.json({ 
      message: 'Tarif mis à jour avec succès',
      tarif: profile.tarif
    });

  } catch (error) {
    console.error('UpdateTarif error:', error);
    res.status(500).json({ error: 'Failed to update tarif' });
  }
};

// ============================================
// GET VIP STATUS
// ============================================
exports.getVipStatus = async (req, res) => {
  try {
    const doctorId = req.user.id;

    const subscription = await prisma.vIPSubscription.findFirst({
      where: {
        psychologueId: doctorId,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const form = await prisma.vIPForm.findUnique({
      where: { psychologueId: doctorId }
    });

    const isVIP = subscription && new Date(subscription.endDate) > new Date();

    res.json({
      isVIP: isVIP || false,
      subscription: subscription || null,
      form: form || null
    });

  } catch (error) {
    console.error('GetVipStatus error:', error);
    res.status(500).json({ error: 'Failed to get VIP status' });
  }
};

// ============================================
// ACTIVATE VIP SUBSCRIPTION
// ============================================
exports.activateVip = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { plan, ccpNumber } = req.body;

    if (!plan || !['mensuel', 'annuel'].includes(plan)) {
      return res.status(400).json({ error: 'Plan invalide' });
    }

    const price = plan === 'mensuel' ? 5000 : 50000;
    const duration = plan === 'mensuel' ? 30 : 365;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);

    // Deactivate any existing VIP subscription
    await prisma.vIPSubscription.updateMany({
      where: { psychologueId: doctorId, isActive: true },
      data: { isActive: false }
    });

    // Create new subscription
    const subscription = await prisma.vIPSubscription.create({
      data: {
        psychologueId: doctorId,
        plan,
        price,
        startDate,
        endDate,
        isActive: true
      }
    });

    res.json({
      message: 'VIP activé avec succès',
      subscription
    });

  } catch (error) {
    console.error('ActivateVip error:', error);
    res.status(500).json({ error: 'Failed to activate VIP' });
  }
};

// ============================================
// SAVE VIP FORM
// ============================================
exports.saveVipForm = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { question1, question2, question3, question4, question5 } = req.body;

    if (!question1 || !question2 || !question4 || !question5) {
      return res.status(400).json({ error: 'Veuillez remplir toutes les questions obligatoires' });
    }

    // Check if VIP is active
    const subscription = await prisma.vIPSubscription.findFirst({
      where: {
        psychologueId: doctorId,
        isActive: true
      }
    });

    if (!subscription || new Date(subscription.endDate) < new Date()) {
      return res.status(403).json({ error: 'Vous devez avoir un abonnement VIP actif' });
    }

    const form = await prisma.vIPForm.upsert({
      where: { psychologueId: doctorId },
      update: {
        question1,
        question2,
        question3,
        question4,
        question5,
        updatedAt: new Date()
      },
      create: {
        psychologueId: doctorId,
        question1,
        question2,
        question3,
        question4,
        question5
      }
    });

    res.json({
      message: 'Formulaire VIP enregistré avec succès',
      form
    });

  } catch (error) {
    console.error('SaveVipForm error:', error);
    res.status(500).json({ error: 'Failed to save VIP form' });
  }
};

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});