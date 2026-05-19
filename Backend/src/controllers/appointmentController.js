// ============================================
// APPOINTMENT CONTROLLER - Book & Manage Appointments
// ============================================

const prisma = require('../prisma');
const { buildAvailabilityForDate, normalizeDateOnly, normalizeTimeOnly } = require('../utils/availabilityService');

// ============================================
// CREATE APPOINTMENT (Patient books)
// ============================================
exports.createAppointment = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctorId, date, time, mediaType } = req.body;
    const requestedTime = normalizeTimeOnly(time);

    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'Please provide doctor, date and time' });
    }

    if (!requestedTime) {
      return res.status(400).json({ error: 'Invalid time format' });
    }

    const appointmentDate = normalizeDateOnly(date);
    if (!appointmentDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const dayOfWeek = appointmentDate.getDay();
    const dayStart = new Date(appointmentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [doctor, doctorTimeSlots, doctorAppointments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: doctorId },
        select: {
          id: true,
          userType: true,
          profile: { select: { isAvailable: true } }
        }
      }),
      prisma.timeSlot.findMany({
        where: {
          doctorId,
          OR: [
            { specificDate: { gte: dayStart, lt: dayEnd } },
            { specificDate: null, dayOfWeek }
          ]
        },
        orderBy: [
          { specificDate: 'asc' },
          { startTime: 'asc' }
        ]
      }),
      prisma.appointment.findMany({
        where: {
          doctorId,
          appointmentDate: { gte: dayStart, lt: dayEnd },
          status: { in: ['pending', 'confirmed', 'completed'] }
        },
        select: {
          appointmentDate: true,
          appointmentTime: true,
          status: true
        }
      })
    ]);

    if (!doctor || (doctor.userType !== 'psychologue' && doctor.userType !== 'counselor')) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    if (!doctor.profile?.isAvailable) {
      return res.status(400).json({ error: 'Doctor is not available' });
    }

    const availability = buildAvailabilityForDate({
      slots: doctorTimeSlots,
      appointments: doctorAppointments,
      date: appointmentDate
    });

    const requestedSlot = availability.slots.find(slot => normalizeTimeOnly(slot.startTime) === requestedTime);

    if (!requestedSlot || !requestedSlot.selectable) {
      return res.status(400).json({ error: 'Selected time is not available' });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        appointmentDate,
        appointmentTime: requestedTime,
        mediaType: mediaType || 'video',
        status: 'pending'
      }
    });

    res.status(201).json({
      message: 'Appointment booked successfully!',
      appointment
    });

  } catch (error) {
    console.error('CreateAppointment error:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
};

// ============================================
// GET MY APPOINTMENTS (Patient or Doctor)
// ============================================
exports.getMyAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType || 'patient';
    const { status, view } = req.query;

    console.log('getMyAppointments - userId:', userId, 'userType:', userType);

    let whereClause = {};

    if (userType === 'patient') {
      // Patient sees their appointments
      whereClause.patientId = userId;
    } else if (userType === 'psychologue' || userType === 'counselor') {
      // Doctor sees their appointments
      whereClause.doctorId = userId;
    }

    // Filter by status if provided
    if (status) {
      whereClause.status = status;
    }

    if (view === 'summary') {
      let summarySelect = {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        mediaType: true,
        status: true
      };

      if (userType === 'patient') {
        summarySelect.doctor = { select: { fullname: true } };
      } else if (userType === 'psychologue' || userType === 'counselor') {
        summarySelect.patient = { select: { fullname: true } };
      }

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        select: summarySelect,
        orderBy: { appointmentDate: 'asc' }
      });

      const summary = appointments.map(apt => ({
        id: apt.id,
        appointmentDate: apt.appointmentDate,
        appointmentTime: apt.appointmentTime,
        mediaType: apt.mediaType,
        status: apt.status,
        doctorName: apt.doctor?.fullname,
        patientName: apt.patient?.fullname
      }));

      return res.json(summary);
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      select: {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        mediaType: true,
        status: true,
        notes: true,
        createdAt: true,
        doctor: {
          select: {
            id: true,
            fullname: true,
            profile: { select: { specialite: true } }
          }
        },
        patient: {
          select: {
            id: true,
            fullname: true,
            profile: { select: { birthDate: true, gender: true } }
          }
        }
      },
      orderBy: { appointmentDate: 'asc' }
    });

    // Format response
    const formatted = appointments.map(apt => ({
      id: apt.id,
      appointmentDate: apt.appointmentDate,
      appointmentTime: apt.appointmentTime,
      mediaType: apt.mediaType,
      status: apt.status,
      notes: apt.notes,
      doctor: {
        id: apt.doctor.id,
        fullname: apt.doctor.fullname,
        specialite: apt.doctor.profile?.specialite
      },
      patient: {
        id: apt.patient.id,
        fullname: apt.patient.fullname,
        age: apt.patient.profile?.age,
        gender: apt.patient.profile?.gender
      },
      createdAt: apt.createdAt
    }));

    res.json(formatted);

  } catch (error) {
    console.error('GetMyAppointments error:', error);
    res.status(500).json({ error: 'Failed to get appointments' });
  }
};

// ============================================
// GET APPOINTMENT BY ID
// ============================================
exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userType = req.user.userType;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { include: { profile: true } },
        patient: { include: { profile: true } }
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check if user is part of this appointment
    if (appointment.patientId !== userId && appointment.doctorId !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this appointment' });
    }

    res.json(appointment);

  } catch (error) {
    console.error('GetAppointmentById error:', error);
    res.status(500).json({ error: 'Failed to get appointment' });
  }
};

// ============================================
// UPDATE APPOINTMENT STATUS (Doctor confirms/completes/cancels)
// ============================================
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user.id;

    // Find appointment
    const appointment = await prisma.appointment.findUnique({ where: { id } });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Only doctor can update status
    if (appointment.doctorId !== userId) {
      return res.status(403).json({ error: 'Only the doctor can update this appointment' });
    }

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const previousStatus = appointment.status;

    // Update appointment (minimal select, no includes)
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        ...(notes && { notes })
      }
    });

    // Update denormalized counters when appointment is completed
    if (status === 'completed' && previousStatus !== 'completed') {
      await prisma.profile.update({
        where: { userId: appointment.doctorId },
        data: { sessionsCompleted: { increment: 1 } }
      });
    }

    if (status !== 'completed' && previousStatus === 'completed') {
      await prisma.profile.update({
        where: { userId: appointment.doctorId },
        data: { sessionsCompleted: { decrement: 1 } }
      });
    }

    // If confirmed, mark the time slot as booked
    if (status === 'confirmed') {
      const appointmentDate = new Date(updated.appointmentDate);
      const dayOfWeek = appointmentDate.getDay();

      let slot = await prisma.timeSlot.findFirst({
        where: {
          doctorId: updated.doctorId,
          startTime: updated.appointmentTime,
          OR: [
            { specificDate: appointmentDate },
            { specificDate: null, dayOfWeek }
          ]
        }
      });

      if (slot && !slot.isBooked) {
        await prisma.timeSlot.update({
          where: { id: slot.id },
          data: { isBooked: true }
        });
      }
    }

    // If cancelled, free up the time slot
    if (status === 'cancelled') {
      const dayOfWeek = new Date(appointment.appointmentDate).getDay();
      await prisma.timeSlot.updateMany({
        where: {
          doctorId: userId,
          dayOfWeek,
          startTime: appointment.appointmentTime,
          isBooked: true
        },
        data: { isBooked: false }
      });
    }

    // Fetch updated appointment without heavy includes for response
    const responseAppointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { fullname: true } }
      }
    });

    res.json({
      message: `Appointment ${status} successfully`,
      appointment: responseAppointment
    });

  } catch (error) {
    console.error('UpdateAppointmentStatus error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
};

// ============================================
// CANCEL APPOINTMENT (Patient can cancel)
// ============================================
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const appointment = await prisma.appointment.findUnique({ where: { id } });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Only patient or doctor can cancel
    if (appointment.patientId !== userId && appointment.doctorId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Update status
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'cancelled' }
    });

    // Free up time slot
    const dayOfWeek = new Date(appointment.appointmentDate).getDay();
    await prisma.timeSlot.updateMany({
      where: {
        doctorId: appointment.doctorId,
        dayOfWeek,
        startTime: appointment.appointmentTime,
        isBooked: true
      },
      data: { isBooked: false }
    });

    res.json({ message: 'Appointment cancelled', appointment: updated });

  } catch (error) {
    console.error('CancelAppointment error:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
};

// ============================================
// START VIDEO SESSION
// ============================================
exports.startVideoSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { doctor: true, patient: true }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Check if user is the doctor
    if (appointment.doctorId !== userId) {
      return res.status(403).json({ error: 'Only the doctor can start the video session' });
    }

    // Start the video session
    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        videoSessionActive: true,
        videoSessionStartedAt: new Date()
      }
    });

    res.json({
      message: 'Video session started',
      appointment: updated
    });

  } catch (error) {
    console.error('StartVideoSession error:', error);
    res.status(500).json({ error: 'Failed to start video session' });
  }
};

// ============================================
// END VIDEO SESSION
// ============================================
exports.endVideoSession = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const appointment = await prisma.appointment.findUnique({
      where: { id }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.doctorId !== userId && appointment.patientId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        videoSessionActive: false,
        videoSessionEndedAt: new Date()
      }
    });

    res.json({
      message: 'Video session ended',
      appointment: updated
    });

  } catch (error) {
    console.error('EndVideoSession error:', error);
    res.status(500).json({ error: 'Failed to end video session' });
  }
};

// ============================================
// GET ACTIVE VIDEO SESSION (for patient)
// ============================================
exports.getActiveVideoSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const appointment = await prisma.appointment.findFirst({
      where: {
        patientId: userId,
        videoSessionActive: true
      },
      include: {
        doctor: { include: { profile: true } },
        patient: true
      }
    });

    if (!appointment) {
      return res.json({ activeSession: null });
    }

    res.json({
      activeSession: {
        id: appointment.id,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctor.fullname,
        doctorSpecialty: appointment.doctor.profile?.specialite || 'Psychologue'
      }
    });

  } catch (error) {
    console.error('GetActiveVideoSession error:', error);
    res.status(500).json({ error: 'Failed to get active session' });
  }
};

// ============================================
// CREATE URGENT REQUEST (Patient)
// ============================================
exports.createUrgentRequest = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctorId, notes, appointmentTime } = req.body;

    console.log('Creating urgent request:', { patientId, doctorId, notes, appointmentTime });

    // Find an available doctor if none specified
    let selectedDoctorId = doctorId;
    if (!selectedDoctorId) {
      const availableDoctor = await prisma.user.findFirst({
        where: {
          userType: 'psychologue',
          profile: { isAvailable: true }
        }
      });
      
      console.log('Available doctor found:', availableDoctor?.id);
      
      if (availableDoctor) {
        selectedDoctorId = availableDoctor.id;
      } else {
        return res.status(400).json({ error: 'Aucun psychologue disponible pour le moment' });
      }
    }

    // Default time = now if not provided
    const now = new Date();
    const defaultTime = now.toTimeString().slice(0, 5); // "HH:MM"

    console.log('Creating with doctorId:', selectedDoctorId, 'time:', appointmentTime || defaultTime);

    // Create urgent request with VIP priority
    const urgentRequest = await prisma.urgentRequest.create({
      data: {
        patientId,
        doctorId: selectedDoctorId,
        status: 'pending',
        notes: notes || 'Urgent VIP consultation request',
        amount: 1000,
        isVip: true,
        priority: true,
        appointmentTime: appointmentTime || defaultTime,
        appointmentDate: new Date()
      },
      include: {
        patient: { select: { id: true, fullname: true } }
      }
    });

    console.log('Urgent request created:', urgentRequest.id);
    
    // Emit socket event to notify the doctor/counselor about the new urgent request
    if (global.io) {
      global.io.to(`user:${selectedDoctorId}`).emit('urgentRequestCreated', {
        id: urgentRequest.id,
        patientId: urgentRequest.patientId,
        doctorId: urgentRequest.doctorId,
        patientName: urgentRequest.patient?.fullname,
        appointmentTime: urgentRequest.appointmentTime,
        status: urgentRequest.status,
        createdAt: urgentRequest.createdAt
      });
    }

    res.status(201).json({
      message: 'Urgent VIP request created successfully',
      urgentRequest
    });

  } catch (error) {
    console.error('CreateUrgentRequest error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to create urgent request: ' + error.message });
  }
};

// ============================================
// GET URGENT REQUESTS (Patient or Doctor) - Excludes expired (1 hour)
// ============================================
exports.getUrgentRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let whereClause = {};

    if (userType === 'patient') {
      whereClause.patientId = userId;
    } else if (userType === 'psychologue' || userType === 'counselor') {
      whereClause.doctorId = userId;
    }

    // Only return non-expired requests (within 1 hour)
    whereClause.createdAt = { gte: oneHourAgo };

    const urgentRequests = await prisma.urgentRequest.findMany({
      where: whereClause,
      include: {
        patient: { select: { id: true, fullname: true, email: true, profile: { select: { phone: true } } } },
        doctor: { select: { id: true, fullname: true, profile: { select: { specialite: true, phone: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(urgentRequests);

  } catch (error) {
    console.error('GetUrgentRequests error:', error);
    res.status(500).json({ error: 'Failed to get urgent requests' });
  }
};

// ============================================
// ACCEPT URGENT REQUEST (Doctor)
// ============================================
exports.acceptUrgentRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const doctorId = req.user.id;

    const urgentRequest = await prisma.urgentRequest.update({
      where: { id },
      data: { status: 'in_call' },
      include: {
        patient: { select: { fullname: true, email: true, id: true } },
        doctor: { select: { fullname: true, id: true } }
      }
    });

    // Create appointment with in_call status for immediate video call
    const appointmentDate = urgentRequest.appointmentDate || new Date();
    const appointmentTime = urgentRequest.appointmentTime || new Date().toTimeString().slice(0, 5);
    
    const appointment = await prisma.appointment.create({
      data: {
        patientId: urgentRequest.patientId,
        doctorId: doctorId,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        mediaType: 'video',
        status: 'in_call',
        notes: 'URGENT VIP - ' + (urgentRequest.notes || 'Created from urgent request')
      }
    });

    // Notify patient that their urgent request was accepted
    if (global.io) {
      global.io.to(`user:${urgentRequest.patientId}`).emit('callAccepted', {
        urgentId: id,
        appointmentId: appointment.id,
        providerName: urgentRequest.doctor?.fullname || 'Provider',
        appointmentTime: appointmentTime,
        roomId: appointment.id
      });
    }

    res.json({
      message: 'Urgent VIP request accepted - starting video call',
      urgentRequest,
      appointment,
      startCall: true
    });

  } catch (error) {
    console.error('AcceptUrgentRequest error:', error);
    res.status(500).json({ error: 'Failed to accept urgent request' });
  }
};

// ============================================
// REJECT URGENT REQUEST (Doctor)
// ============================================
exports.rejectUrgentRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const urgentRequest = await prisma.urgentRequest.update({
      where: { id },
      data: { 
        status: 'rejected',
        notes: reason || 'Request rejected by doctor'
      },
      include: {
        patient: { select: { id: true, fullname: true } },
        doctor: { select: { fullname: true, id: true } }
      }
    });

    // Notify patient that their urgent request was rejected
    if (global.io) {
      global.io.to(`user:${urgentRequest.patientId}`).emit('callRejected', {
        urgentId: id,
        providerName: urgentRequest.doctor?.fullname || 'Provider',
        reason: reason || 'Request rejected by provider'
      });
    }

    res.json({
      message: 'Urgent request rejected',
      urgentRequest
    });

  } catch (error) {
    console.error('RejectUrgentRequest error:', error);
    res.status(500).json({ error: 'Failed to reject urgent request' });
  }
};

// ============================================
// COMPLETE URGENT REQUEST (Doctor)
// ============================================
exports.completeUrgentRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const urgentRequest = await prisma.urgentRequest.update({
      where: { id },
      data: { status: 'completed' }
    });

    res.json({
      message: 'Urgent request completed',
      urgentRequest
    });

  } catch (error) {
    console.error('CompleteUrgentRequest error:', error);
    res.status(500).json({ error: 'Failed to complete urgent request' });
  }
};

// ============================================
// GET URGENT ACCESS STATUS (Patient)
// ============================================
exports.getUrgentAccessStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { urgentAccessStart: true, urgentAccessExpiry: true }
    });

    const now = new Date();
    const isActive = user.urgentAccessExpiry && new Date(user.urgentAccessExpiry) > now;
    const daysLeft = isActive ? Math.ceil((new Date(user.urgentAccessExpiry) - now) / (1000 * 60 * 60 * 24)) : 0;

    res.json({
      isActive: isActive || false,
      startDate: user.urgentAccessStart,
      expiryDate: user.urgentAccessExpiry,
      daysLeft: Math.max(0, daysLeft)
    });

  } catch (error) {
    console.error('GetUrgentAccessStatus error:', error);
    res.status(500).json({ error: 'Failed to get urgent access status' });
  }
};

// ============================================
// ACTIVATE URGENT ACCESS (7 days) - After payment
// ============================================
exports.activateUrgentAccess = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        urgentAccessStart: now,
        urgentAccessExpiry: expiryDate
      },
      select: { urgentAccessStart: true, urgentAccessExpiry: true }
    });

    res.json({
      success: true,
      message: 'URGENT access activated for 7 days',
      startDate: user.urgentAccessStart,
      expiryDate: user.urgentAccessExpiry
    });

  } catch (error) {
    console.error('ActivateUrgentAccess error:', error);
    res.status(500).json({ error: 'Failed to activate urgent access' });
  }
};

// ============================================
// START CALL STATE (Doctor starts call)
// ============================================
exports.startCallState = async (req, res) => {
  try {
    const userId = req.user.id;
    const { patientId, appointmentId } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        currentCallId: appointmentId,
        currentCallPartnerId: patientId,
        currentCallStartedAt: new Date()
      },
      select: { id: true, fullname: true, currentCallId: true, currentCallPartnerId: true }
    });

    // Also update patient to know they're in call
    if (patientId) {
      await prisma.user.update({
        where: { id: patientId },
        data: {
          currentCallId: appointmentId,
          currentCallPartnerId: userId,
          currentCallStartedAt: new Date()
        }
      });
    }

    // Emit real-time event to patient
    if (global.io && patientId) {
      global.io.to(`patient:${patientId}`).emit('session-started', {
        appointmentId: appointmentId,
        doctorId: userId,
        doctorName: user.fullname
      });
      console.log(`Emitted session-started to patient:${patientId}`);
    }

    res.json({ success: true, message: 'Call state started', doctorId: userId, patientId });

  } catch (error) {
    console.error('StartCallState error:', error);
    res.status(500).json({ error: 'Failed to start call state' });
  }
};

// ============================================
// END CALL STATE (Doctor or Patient ends call)
// ============================================
exports.endCallState = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentCallPartnerId: true, currentCallId: true }
    });

    const previousCallId = user?.currentCallId;
    const previousPartnerId = user?.currentCallPartnerId;

    // Clear doctor's state
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentCallId: null,
        currentCallPartnerId: null,
        currentCallStartedAt: null
      }
    });

    // Clear patient's state if doctor ended
    if (userType === 'psychologue' || userType === 'counselor') {
      if (previousPartnerId) {
        await prisma.user.update({
          where: { id: previousPartnerId },
          data: {
            currentCallId: null,
            currentCallPartnerId: null,
            currentCallStartedAt: null
          }
        });
        
        // Emit real-time event to patient
        if (global.io && previousPartnerId) {
          global.io.to(`patient:${previousPartnerId}`).emit('session-ended', {
            appointmentId: previousCallId
          });
          console.log(`Emitted session-ended to patient:${previousPartnerId}`);
        }
      }
    } else {
      // Patient ended - notify doctor
      if (global.io && previousPartnerId) {
        global.io.to(`doctor:${previousPartnerId}`).emit('session-ended', {
          appointmentId: previousCallId
        });
        console.log(`Emitted session-ended to doctor:${previousPartnerId}`);
      }
    }

    res.json({ success: true, message: 'Call state ended' });

  } catch (error) {
    console.error('EndCallState error:', error);
    res.status(500).json({ error: 'Failed to end call state' });
  }
};

// ============================================
// GET MY CALL STATUS (Patient or Doctor)
// ============================================
exports.getMyCallStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentCallId: true,
        currentCallPartnerId: true,
        currentCallStartedAt: true
      }
    });

    if (!user?.currentCallId || !user?.currentCallPartnerId) {
      return res.json({ inCall: false });
    }

    const partner = await prisma.user.findUnique({
      where: { id: user.currentCallPartnerId },
      select: {
        id: true,
        fullname: true,
        profile: { select: { specialite: true } }
      }
    });

    if (!partner) {
      return res.json({ inCall: false });
    }

    res.json({
      inCall: true,
      appointmentId: user.currentCallId,
      doctorId: partner.id,
      doctorName: partner.fullname,
      doctorSpecialite: partner.profile?.specialite,
      startedAt: user.currentCallStartedAt
    });

  } catch (error) {
    console.error('GetMyCallStatus error:', error);
    res.status(500).json({ error: 'Failed to get call status' });
  }
};

// ============================================
// GET CALL STATUS (Patient checks if doctor is in call)
// ============================================
exports.getCallStatus = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const patientId = req.user.id;

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { 
        id: true, 
        fullname: true, 
        currentCallId: true, 
        currentCallPartnerId: true,
        currentCallStartedAt: true,
        profile: { select: { specialite: true } }
      }
    });

    if (!doctor) {
      return res.json({ inCall: false });
    }

    const inCall = doctor.currentCallId && doctor.currentCallPartnerId === patientId;
    const isAvailable = !!doctor.currentCallId;

    res.json({
      inCall: inCall,
      isAvailable: isAvailable,
      doctorId: doctor.id,
      doctorName: doctor.fullname,
      doctorSpecialite: doctor.profile?.specialite,
      appointmentId: doctor.currentCallId,
      startedAt: doctor.currentCallStartedAt
    });

  } catch (error) {
    console.error('GetCallStatus error:', error);
    res.status(500).json({ error: 'Failed to get call status' });
  }
};