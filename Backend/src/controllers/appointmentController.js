// ============================================
// APPOINTMENT CONTROLLER - Book & Manage Appointments
// ============================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================================
// CREATE APPOINTMENT (Patient books)
// ============================================
exports.createAppointment = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctorId, date, time, mediaType } = req.body;

    // Validation
    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'Please provide doctor, date and time' });
    }

    // Check if doctor exists and is a psychologue
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { profile: true }
    });

    if (!doctor || (doctor.userType !== 'psychologue' && doctor.userType !== 'counselor')) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Check if doctor is available
    if (!doctor.profile?.isAvailable) {
      return res.status(400).json({ error: 'Doctor is not available' });
    }

    // Parse date to get day of week
    const appointmentDate = new Date(date);
    const dayOfWeek = appointmentDate.getDay();

    // Check if time slot is available
    const slot = await prisma.timeSlot.findFirst({
      where: {
        doctorId,
        dayOfWeek,
        startTime: time,
        isBooked: false
      }
    });

    if (!slot) {
      return res.status(400).json({ error: 'This time slot is not available' });
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        appointmentDate,
        appointmentTime: time,
        mediaType: mediaType || 'video',
        status: 'pending'
      },
      include: {
        doctor: { include: { profile: true } },
        patient: { include: { profile: true } }
      }
    });

    // Mark time slot as booked
    await prisma.timeSlot.update({
      where: { id: slot.id },
      data: { isBooked: true }
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
    const userType = req.user.userType;
    const { status } = req.query;

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

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        doctor: { include: { profile: true } },
        patient: { include: { profile: true } }
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

    // Update appointment
    const updated = await prisma.appointment.update({
      where: { id },
      data: { 
        status,
        ...(notes && { notes })
      },
      include: {
        doctor: { include: { profile: true } },
        patient: { include: { profile: true } }
      }
    });

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

    res.json({
      message: `Appointment ${status} successfully`,
      appointment: updated
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

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});