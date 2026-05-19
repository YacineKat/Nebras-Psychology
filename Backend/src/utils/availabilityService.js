function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeDateOnly(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return null;
    return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
  }

  const dateString = String(dateValue).trim();
  if (!dateString) return null;

  const normalizedString = dateString.includes('T') ? dateString : `${dateString}T00:00:00`;
  const parsed = new Date(normalizedString);

  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateKey(dateValue) {
  const date = normalizeDateOnly(dateValue);
  if (!date) return null;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameDateKey(left, right) {
  const leftKey = formatDateKey(left);
  const rightKey = formatDateKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function normalizeTimeOnly(timeValue) {
  if (!timeValue) return null;

  const timeString = String(timeValue).trim();
  if (!timeString) return null;

  const directMatch = timeString.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (directMatch) {
    return `${pad(directMatch[1])}:${pad(directMatch[2])}`;
  }

  const parsed = new Date(timeString);
  if (!Number.isNaN(parsed.getTime())) {
    return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  return null;
}

function buildTimeCandidates(timeValue) {
  const normalizedTime = normalizeTimeOnly(timeValue);
  if (!normalizedTime) return [];

  const candidates = new Set([normalizedTime]);
  const [hours, minutes] = normalizedTime.split(':');
  candidates.add(`${hours}:${minutes}:00`);

  return Array.from(candidates);
}

function isBlockingStatus(status) {
  return ['pending', 'confirmed', 'completed'].includes(String(status || '').toLowerCase());
}

function buildAvailabilityForDate({ slots = [], appointments = [], date }) {
  const targetDate = normalizeDateOnly(date);

  if (!targetDate) {
    return {
      date: null,
      dayOfWeek: null,
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
    };
  }

  const targetDateKey = formatDateKey(targetDate);
  const dayOfWeek = targetDate.getDay();

  const exactDateSlots = slots.filter(slot => sameDateKey(slot.specificDate, targetDate));
  const weeklySlots = slots.filter(slot => !slot.specificDate && Number(slot.dayOfWeek) === dayOfWeek);

  const slotMap = new Map();

  weeklySlots.forEach(slot => {
    const timeKey = normalizeTimeOnly(slot?.startTime);
    if (!timeKey) return;

    slotMap.set(timeKey, {
      ...slot,
      timeKey,
      status: slot.isBlocked ? 'blocked' : slot.isBooked ? 'booked' : 'available',
      source: 'weekly',
      selectable: !slot.isBlocked && !slot.isBooked
    });
  });

  exactDateSlots.forEach(slot => {
    const timeKey = normalizeTimeOnly(slot?.startTime);
    if (!timeKey) return;

    slotMap.set(timeKey, {
      ...slot,
      timeKey,
      status: slot.isBlocked ? 'blocked' : slot.isBooked ? 'booked' : 'available',
      source: 'specificDate',
      selectable: !slot.isBlocked && !slot.isBooked
    });
  });

  const appointmentTimes = new Set(
    appointments
      .filter(appointment => isBlockingStatus(appointment.status) && sameDateKey(appointment.appointmentDate, targetDate))
      .map(appointment => normalizeTimeOnly(appointment.appointmentTime))
      .filter(Boolean)
  );

  const finalSlots = Array.from(slotMap.values())
    .map(slot => {
      const hasAppointment = appointmentTimes.has(slot.timeKey);
      const status = hasAppointment ? 'booked' : slot.status;

      return {
        id: slot.id || null,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime || slot.startTime,
        specificDate: slot.specificDate || null,
        recurrence: slot.recurrence || 'none',
        isBlocked: status === 'blocked',
        isBooked: status === 'booked',
        selectable: status === 'available',
        status,
        source: hasAppointment ? 'appointment' : slot.source
      };
    })
    .sort((left, right) => (normalizeTimeOnly(left.startTime) || '').localeCompare(normalizeTimeOnly(right.startTime) || ''));

  const availableSlots = [];
  const blockedSlots = [];
  const bookedSlots = [];
  for (let i = 0; i < finalSlots.length; i++) {
    const slot = finalSlots[i];
    if (slot.selectable) availableSlots.push(slot);
    else if (slot.status === 'blocked') blockedSlots.push(slot);
    else if (slot.status === 'booked') bookedSlots.push(slot);
  }

  return {
    date: targetDateKey,
    dayOfWeek,
    slots: finalSlots,
    availableSlots,
    blockedSlots,
    bookedSlots,
    summary: {
      total: finalSlots.length,
      available: availableSlots.length,
      blocked: blockedSlots.length,
      booked: bookedSlots.length
    }
  };
}

module.exports = {
  buildAvailabilityForDate,
  buildTimeCandidates,
  formatDateKey,
  normalizeDateOnly,
  normalizeTimeOnly,
  sameDateKey
};