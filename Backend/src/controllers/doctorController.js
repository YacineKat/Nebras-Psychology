// ============================================
// DOCTOR CONTROLLER - Get & Manage Doctors
// ============================================

const prisma = require('../prisma');
const { buildAvailabilityForDate, normalizeDateOnly } = require('../utils/availabilityService');

// ============================================
// GET ALL DOCTORS (with filters)
// ============================================
exports.getAllDoctors = async (req, res) => {
  try {
    const { search, specialty, available, view, role } = req.query;
    const isSummary = view === 'summary';

    // Build where clause
    const where = {};
    if (role) {
      where.userType = role;
    } else {
      where.userType = 'psychologue'; // Default: only psychologists
    }

    // Search by name (case insensitive)
    if (search) {
      where.fullname = { contains: search, mode: 'insensitive' };
    }

    const profileWhere = {};
    if (specialty) {
      profileWhere.specialite = { contains: specialty, mode: 'insensitive' };
    }
    if (available === 'true') {
      profileWhere.isAvailable = true;
      where.timeSlots = { some: { isBooked: false } };
    }
    if (Object.keys(profileWhere).length > 0) {
      where.profile = { is: profileWhere };
    }

    const select = isSummary ? {
      id: true,
      fullname: true,
      userType: true,
      profile: {
        select: {
          specialite: true,
          rating: true,
          isAvailable: true,
          avatar: true,
          tarif: true
        }
      },
      timeSlots: {
        where: { isBooked: false },
        select: {
          dayOfWeek: true
        }
      }
    } : {
      id: true,
      fullname: true,
      email: true,
      profile: {
        select: {
          specialite: true,
          universite: true,
          bio: true,
          rating: true,
          isAvailable: true,
          tarif: true,
          language: true,
          motifs: true
        }
      },
      timeSlots: {
        where: { isBooked: false },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true
        }
      }
    };

    const doctors = await prisma.user.findMany({
      where,
      select
    });

    if (isSummary) {
      const response = doctors.map(d => ({
        id: d.id,
        fullname: d.fullname,
        userType: d.userType,
        specialite: d.profile?.specialite || 'General',
        rating: Number(d.profile?.rating) || 0,
        isAvailable: d.profile?.isAvailable || false,
        avatar: d.profile?.avatar || null,
        tarif: d.profile?.tarif || 2000,
        availableSlots: (d.timeSlots || []).map(slot => ({
          dayOfWeek: slot.dayOfWeek
        }))
      }));
      return res.json(response);
    }

    // Map response to simplified format
    const response = doctors.map(d => ({
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
      availableSlots: (d.timeSlots || []).map(slot => ({
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
      select: {
        id: true,
        fullname: true,
        email: true,
        userType: true,
        profile: {
          select: {
            bio: true,
            rating: true,
            isAvailable: true,
            phone: true,
            diplomes: true,
            agrement: true,
            avatar: true,
            adresse: true,
            specialite: true,
            sessionsCompleted: true,
            patientsCount: true,
            reviewsCount: true
          }
        },
        timeSlots: {
          where: { isBooked: false },
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            specificDate: true,
            recurrence: true,
            isBlocked: true,
            isBooked: true
          }
        }
      }
    });

    if (!doctor || (doctor.userType !== 'psychologue' && doctor.userType !== 'counselor')) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json({
      id: doctor.id,
      fullname: doctor.fullname,
      email: doctor.email,
      userType: doctor.userType,
      phone: doctor.profile?.phone,
      adresse: doctor.profile?.adresse || null,
      specialite: doctor.profile?.specialite,
      agrement: doctor.profile?.agrement,
      diplomes: doctor.profile?.diplomes,
      bio: doctor.profile?.bio,
      avatar: doctor.profile?.avatar || null,
      isAvailable: doctor.profile?.isAvailable,
      rating: Number(doctor.profile?.rating) || 0,
      reviewsCount: doctor.profile?.reviewsCount || 0,
      patientsCount: doctor.profile?.patientsCount || 0,
      sessionsCompleted: doctor.profile?.sessionsCompleted || 0,
      availableSlots: doctor.timeSlots
    });

  } catch (error) {
    console.error('GetDoctorById error:', error);
    res.status(500).json({ error: 'Failed to get doctor' });
  }
};

// ============================================
// GET DOCTOR AVAILABILITY FOR A SPECIFIC DATE
// ============================================
exports.getDoctorAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Please provide a date' });
    }

    const targetDate = normalizeDateOnly(date);
    if (!targetDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const doctor = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullname: true,
        userType: true,
        profile: {
          select: {
            isAvailable: true,
            specialite: true
          }
        }
      }
    });

    if (!doctor || (doctor.userType !== 'psychologue' && doctor.userType !== 'counselor')) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    if (!doctor.profile?.isAvailable) {
      return res.json({
        doctorId: doctor.id,
        doctorName: doctor.fullname,
        date: date,
        isDoctorAvailable: false,
        slots: [],
        availableSlots: [],
        blockedSlots: [],
        bookedSlots: [],
        summary: {
          total: 0,
          available: 0,
          blocked: 0,
          booked: 0
        }
      });
    }

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [slots, appointments] = await Promise.all([
      prisma.timeSlot.findMany({
        where: {
          doctorId: id,
          OR: [
            { specificDate: { gte: dayStart, lt: dayEnd } },
            { specificDate: null, dayOfWeek: targetDate.getDay() }
          ]
        },
        orderBy: [
          { specificDate: 'asc' },
          { startTime: 'asc' }
        ]
      }),
      prisma.appointment.findMany({
        where: {
          doctorId: id,
          appointmentDate: {
            gte: dayStart,
            lt: dayEnd
          },
          status: { in: ['pending', 'confirmed', 'completed'] }
        },
        select: {
          appointmentDate: true,
          appointmentTime: true,
          status: true
        }
      })
    ]);

    const availability = buildAvailabilityForDate({
      slots,
      appointments,
      date: targetDate
    });

    return res.json({
      doctorId: doctor.id,
      doctorName: doctor.fullname,
      specialty: doctor.profile?.specialite || 'Psychologie',
      date: availability.date,
      dayOfWeek: availability.dayOfWeek,
      isDoctorAvailable: true,
      ...availability
    });
  } catch (error) {
    console.error('GetDoctorAvailability error:', error);
    res.status(500).json({ error: 'Failed to get doctor availability' });
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
        status: { in: ['confirmed', 'completed'] }
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
    const { view } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 8);

    if (view === 'summary') {
      const [confirmedCount, pendingCount, todayCount, monthlyCompletedCount, doctor] = await Promise.all([
        prisma.appointment.count({
          where: { doctorId, status: 'confirmed' }
        }),
        prisma.appointment.count({
          where: { doctorId, status: 'pending' }
        }),
        prisma.appointment.count({
          where: {
            doctorId,
            status: { not: 'cancelled' },
            appointmentDate: { gte: today, lt: tomorrow }
          }
        }),
        prisma.appointment.count({
          where: {
            doctorId,
            status: 'completed',
            appointmentDate: { gte: startOfMonth, lte: endOfMonth }
          }
        }),
        prisma.user.findUnique({
          where: { id: doctorId },
          select: { profile: { select: { tarif: true } } }
        })
      ]);

      const tarif = doctor?.profile?.tarif || 3000;

      return res.json({
        stats: {
          activePatients: confirmedCount,
          todaySessionsCount: todayCount,
          pendingRequestsCount: pendingCount,
          monthlyIncome: monthlyCompletedCount * tarif
        }
      });
    }

    // Single optimized query: get all needed data in parallel
    const [allAppointments, doctor, timeSlots] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId },
        select: {
          id: true,
          appointmentDate: true,
          appointmentTime: true,
          mediaType: true,
          status: true,
          createdAt: true,
          patient: {
            select: {
              id: true,
              fullname: true,
              profile: {
                select: {
                  phone: true,
                  gender: true,
                  motifs: true
                }
              }
            }
          }
        }
      }),
      prisma.user.findUnique({
        where: { id: doctorId },
        select: { profile: { select: { tarif: true } } }
      }),
      prisma.timeSlot.findMany({
        where: { doctorId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          specificDate: true,
          isBlocked: true,
          isBooked: true
        }
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
exports.getPatientById = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patientId } = req.params;

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        patientId,
        status: { in: ['confirmed', 'completed'] }
      },
      select: {
        appointmentDate: true,
        patient: {
          select: {
            id: true,
            fullname: true,
            email: true,
            profile: {
              select: {
                phone: true,
                gender: true,
                birthDate: true,
                language: true,
                motifs: true,
                prefGender: true,
                prefType: true,
                avatar: true
              }
            }
          }
        }
      },
      orderBy: { appointmentDate: 'desc' }
    });

    if (!appointments || appointments.length === 0) {
      const user = await prisma.user.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          fullname: true,
          email: true,
          profile: { select: { phone: true, avatar: true } }
        }
      });
      if (!user) return res.status(404).json({ error: 'Patient non trouvé' });
      return res.json({
        patient: {
          id: user.id,
          fullname: user.fullname,
          email: user.email,
          phone: user.profile?.phone || null,
          avatar: user.profile?.avatar || null,
          totalSessions: 0,
          firstSession: null,
          lastSession: null
        }
      });
    }

    const apt = appointments[0];
    const patient = apt.patient;
    const totalSessions = appointments.length;
    const firstSession = appointments[totalSessions - 1].appointmentDate;
    const lastSession = appointments[0].appointmentDate;

    res.json({
      patient: {
        id: patient.id,
        fullname: patient.fullname,
        email: patient.email,
        phone: patient.profile?.phone,
        gender: patient.profile?.gender,
        birthDate: patient.profile?.birthDate,
        language: patient.profile?.language,
        motifs: patient.profile?.motifs,
        prefGender: patient.profile?.prefGender,
        prefType: patient.profile?.prefType,
        avatar: patient.profile?.avatar,
        totalSessions,
        firstSession,
        lastSession
      }
    });
  } catch (error) {
    console.error('getPatientById error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ============================================
exports.getPatients = async (req, res) => {
  try {
    const doctorId = req.user && req.user.id;
    console.log('GetPatients called by doctorId=', doctorId);
    if (!doctorId) {
      console.error('GetPatients error: missing doctorId on request');
      return res.status(400).json({ error: 'Invalid request' });
    }
    const { view } = req.query;
    const isSummary = view === 'summary';

    const patientProfileSelect = isSummary ? {
      gender: true,
      birthDate: true
    } : {
      gender: true,
      phone: true,
      birthDate: true,
      language: true,
      motifs: true,
      prefGender: true,
      prefType: true,
      avatar: true
    };

    const patientSelect = {
      id: true,
      ...(isSummary ? {} : { fullname: true, email: true }),
      profile: { select: patientProfileSelect }
    };
    
    // Get all confirmed appointments for this doctor
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { in: ['confirmed', 'completed'] }
      },
      select: {
        appointmentDate: true,
        patient: { select: patientSelect }
      },
      orderBy: { appointmentDate: 'desc' }
    });
    console.log('GetPatients: fetched appointments count=', appointments?.length || 0);
    
    if (!appointments || appointments.length === 0) {
      return res.json({ count: 0, patients: [] });
    }
    
    // Group by patient and aggregate data
    const patientMap = new Map();
    
    appointments.forEach(apt => {
      const patientId = apt.patient.id;
      
      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          id: apt.patient.id,
          ...(isSummary ? {} : {
            fullname: apt.patient.fullname,
            email: apt.patient.email,
            phone: apt.patient.profile?.phone,
            language: apt.patient.profile?.language,
            motifs: apt.patient.profile?.motifs,
            prefGender: apt.patient.profile?.prefGender,
            prefType: apt.patient.profile?.prefType,
            avatar: apt.patient.profile?.avatar,
            totalSpent: 0
          }),
          gender: apt.patient.profile?.gender,
          birthDate: apt.patient.profile?.birthDate,
          totalSessions: 0,
          lastSession: null,
          firstSession: null
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

    if (isSummary) {
      const patients = Array.from(patientMap.values()).map(p => ({
        id: p.id,
        gender: p.gender,
        birthDate: p.birthDate,
        totalSessions: p.totalSessions
      }));

      return res.json({
        count: patients.length,
        patients
      });
    }
    
    // Get doctor's tariff for revenue calculation
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { profile: { select: { tarif: true } } }
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
// PATIENT NOTES
// ============================================
exports.getPatientNote = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patientId } = req.params;

    const notes = await prisma.patientNote.findMany({
      where: {
        doctorId,
        patientId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ notes });
  } catch (error) {
    console.error('GetPatientNote error:', error);
    res.status(500).json({ error: 'Failed to get patient notes' });
  }
};

exports.savePatientNote = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patientId } = req.params;
    const { content } = req.body;

    const note = await prisma.patientNote.create({
      data: {
        doctorId,
        patientId,
        content
      }
    });

    res.json({ success: true, note });
  } catch (error) {
    console.error('SavePatientNote error:', error);
    res.status(500).json({ error: 'Failed to save patient note' });
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