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
    if (!slot?.startTime) return;
    slotMap.set(slot.startTime, {
      ...slot,
      status: slot.isBlocked ? 'blocked' : slot.isBooked ? 'booked' : 'available',
      source: 'weekly',
      selectable: !slot.isBlocked && !slot.isBooked
    });
  });

  exactDateSlots.forEach(slot => {
    if (!slot?.startTime) return;
    slotMap.set(slot.startTime, {
      ...slot,
      status: slot.isBlocked ? 'blocked' : slot.isBooked ? 'booked' : 'available',
      source: 'specificDate',
      selectable: !slot.isBlocked && !slot.isBooked
    });
  });

  const appointmentTimes = new Set(
    appointments
      .filter(appointment => isBlockingStatus(appointment.status) && sameDateKey(appointment.appointmentDate, targetDate))
      .map(appointment => appointment.appointmentTime)
      .filter(Boolean)
  );

  const finalSlots = Array.from(slotMap.values())
    .map(slot => {
      const hasAppointment = appointmentTimes.has(slot.startTime);
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
    .sort((left, right) => left.startTime.localeCompare(right.startTime));

  return {
    date: targetDateKey,
    dayOfWeek,
    slots: finalSlots,
    availableSlots: finalSlots.filter(slot => slot.selectable),
    blockedSlots: finalSlots.filter(slot => slot.status === 'blocked'),
    bookedSlots: finalSlots.filter(slot => slot.status === 'booked'),
    summary: {
      total: finalSlots.length,
      available: finalSlots.filter(slot => slot.selectable).length,
      blocked: finalSlots.filter(slot => slot.status === 'blocked').length,
      booked: finalSlots.filter(slot => slot.status === 'booked').length
    }
  };
}

module.exports = {
  buildAvailabilityForDate,
  formatDateKey,
  normalizeDateOnly,
  sameDateKey
};