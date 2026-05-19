// ============================================
// EMPLOI DU TEMPS - Enhanced Schedule Management
// ============================================

let currentWeekStart = null;
let timeSlots = [];
let weekAppointments = [];
let allAppointments = [];
let patientsCache = null;
let isLoading = false;
let selectedCell = null;

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const TIME_SLOTS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    initWeek();
    initEventListeners();
    await loadAllData();
    highlightCurrentSidebarLink();
});

function initWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = -dayOfWeek;
    currentWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
    currentWeekStart.setHours(0, 0, 0, 0);
}

function initEventListeners() {
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => navigateWeek(-1));
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => navigateWeek(1));
}

// ============================================
// HELPERS
// ============================================
function parseDateSafe(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return isNaN(dateValue.getTime()) ? null : dateValue;

    let dateStr = String(dateValue);
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
        dateStr = dateStr.replace(' ', 'T');
    }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
    if (!date) return '';
    const d = parseDateSafe(date);
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateFR(dateStr) {
    const d = parseDateSafe(dateStr);
    if (!d) return '-';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getMediaLabel(mediaType) {
    const labels = { 'video': '📹 Vidéo', 'phone': '📞 Téléphone', 'chat': '💬 Chat' };
    return labels[mediaType] || mediaType || '-';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function normalizeAppointment(apt) {
    const patientName = apt.patientName || apt.patient?.fullname || 'Patient';
    const patientId = apt.patientId || apt.patient?.id || null;
    const appointmentDate = parseDateSafe(apt.appointmentDate);

    return {
        id: apt.id,
        patientName,
        patientId,
        appointmentDate,
        appointmentTime: apt.appointmentTime || null,
        mediaType: apt.mediaType || 'video',
        status: apt.status || 'pending',
        notes: apt.notes || '',
        createdAt: apt.createdAt || null
    };
}

// ============================================
// DATA LOADING
// ============================================
async function loadAllData() {
    if (isLoading) return;
    isLoading = true;
    setLoading(true);

    try {
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const [scheduleResult, dashboardResult, patientsResult] = await Promise.all([
            doctorAPI.getSchedule(
                currentWeekStart.toISOString().split('T')[0],
                weekEnd.toISOString().split('T')[0]
            ),
            doctorAPI.getDashboard(),
            doctorAPI.getPatients()
        ]);

        console.log('Dashboard:', dashboardResult);
        console.log('Schedule:', scheduleResult);
        console.log('Today Sessions:', dashboardResult?.todaySessions);
        console.log('Upcoming:', dashboardResult?.upcomingAppointments);

        const scheduleData = scheduleResult?.slots !== undefined ? scheduleResult : { slots: [], appointments: [] };

        const scheduleSlots = scheduleData.slots || [];
        const dashboardSlots = dashboardResult?.timeSlots || [];

        const slotsMap = new Map();
        dashboardSlots.forEach(slot => {
            if (slot.id) slotsMap.set(slot.id, slot);
        });
        scheduleSlots.forEach(slot => {
            if (slot.id && !slotsMap.has(slot.id)) slotsMap.set(slot.id, slot);
        });
        timeSlots = Array.from(slotsMap.values());

        patientsCache = patientsResult?.patients || [];

        const scheduleAppointments = (scheduleData.appointments || []).map(normalizeAppointment);

        const dashboardAppointments = [
            ...(dashboardResult?.todaySessions || []),
            ...(dashboardResult?.upcomingAppointments || []),
            ...(dashboardResult?.pendingRequests || [])
        ].map(normalizeAppointment);

        const appointmentsMap = new Map();

        dashboardAppointments.forEach(apt => {
            if (apt.id) {
                appointmentsMap.set(apt.id, apt);
            }
        });

        scheduleAppointments.forEach(apt => {
            if (apt.id && (!appointmentsMap.has(apt.id) || !appointmentsMap.get(apt.id).patientName || appointmentsMap.get(apt.id).patientName === 'Patient')) {
                appointmentsMap.set(apt.id, apt);
            }
        });

        allAppointments = Array.from(appointmentsMap.values()).filter(apt =>
            apt.status === 'confirmed' || apt.status === 'completed'
        );
        console.log('All appointments:', allAppointments);

        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        weekEndDate.setHours(23, 59, 59, 999);

        weekAppointments = allAppointments.filter(apt => {
            if (!apt.appointmentDate) return false;
            const aptDate = parseDateSafe(apt.appointmentDate);
            if (!aptDate) return false;
            return aptDate >= currentWeekStart && aptDate <= weekEndDate;
        });

        console.log('Dashboard slots:', dashboardSlots);
        console.log('Schedule slots:', scheduleSlots);
        console.log('Combined time slots:', timeSlots);
        console.log('Filtered appointments for week:', weekAppointments);
        console.log('Current week:', currentWeekStart?.toISOString(), 'to', weekEndDate?.toISOString());

        renderAll();
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Erreur lors du chargement des données', 'error');
    } finally {
        isLoading = false;
        setLoading(false);
    }
}

function setLoading(show) {
    const content = document.querySelector('.main-content');
    if (content) {
        content.style.opacity = show ? '0.6' : '1';
        content.style.pointerEvents = show ? 'none' : 'auto';
    }
}

// ============================================
// RENDERING
// ============================================
function renderAll() {
    updateWeekRange();
    renderStats();
    renderWeekView();
    renderNextAppointment();
}

function updateWeekRange() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const formatOptions = { day: 'numeric', month: 'short' };
    const startStr = currentWeekStart.toLocaleDateString('fr-FR', formatOptions);
    const endStr = weekEnd.toLocaleDateString('fr-FR', formatOptions);

    const weekRangeEl = document.getElementById('weekRange');
    if (weekRangeEl) {
        weekRangeEl.textContent = `Semaine du ${startStr} au ${endStr}`;
    }
}

function renderStats() {
    const now = new Date();

    const todayAppts = allAppointments.filter(apt => {
        if (!apt.appointmentDate || apt.status !== 'confirmed') return false;
        const aptDate = parseDateSafe(apt.appointmentDate);
        if (!aptDate) return false;
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        return aptDate >= todayStart && aptDate <= todayEnd;
    });

    const availableSlots = timeSlots.filter(slot => slot.isBooked === false && slot.isBlocked === false);
    const blockedSlots = timeSlots.filter(slot => slot.isBlocked === true);

    document.getElementById('todayApptCount').textContent = todayAppts.length;
    document.getElementById('weekApptCount').textContent = weekAppointments.length;
    document.getElementById('availableSlotsCount').textContent = availableSlots.length;

    document.getElementById('dayStats').style.display = 'grid';
}

function renderSlotsTable() {
    const container = document.getElementById('slotsTable');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStartDay = currentWeekStart.getDay();

    let html = `
        <div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); background: #f5f5f0; border-bottom: 2px solid #44AA99;">
            <div style="padding: 12px; font-weight: 600; color: #091346; text-align: center; font-size: 12px;">Horaire</div>
            ${Array.from({length: 7}, (_, i) => {
                const dayIndex = (weekStartDay + i) % 7;
                const d = DAY_SHORT[dayIndex];
                const date = new Date(currentWeekStart);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const isToday = dateStr === today.toISOString().split('T')[0];
                return `<div style="padding: 12px; font-weight: 600; color: ${isToday ? '#44AA99' : '#091346'}; text-align: center; font-size: 12px;">${d}<br><small>${date.getDate()}</small></div>`;
            }).join('')}
        </div>
    `;

    TIME_SLOTS.forEach(time => {
        html += `<div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); border-bottom: 1px solid #eee;">`;
        html += `<div style="padding: 10px; font-weight: 600; color: #091346; text-align: center; font-size: 11px; display: flex; align-items: center; justify-content: center;">${time}</div>`;

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate() + dayIndex);
            const dateStr = date.toISOString().split('T')[0];
            const dayOfWeek = date.getDay();

            const appointment = weekAppointments.find(apt => {
                if (!apt.appointmentDate || !apt.appointmentTime) return false;
                const aptDate = parseDateSafe(apt.appointmentDate);
                if (!aptDate) return false;
                const aptDateStr = formatDateOnly(aptDate);
                return aptDateStr === dateStr && apt.appointmentTime === time;
            });

            const slot = timeSlots.find(s => {
                if (s.specificDate) {
                    const slotDate = parseDateSafe(s.specificDate);
                    if (!slotDate) return false;
                    const slotDateStr = formatDateOnly(slotDate);
                    return slotDateStr === dateStr && s.startTime === time;
                }
                return s.dayOfWeek === dayOfWeek && s.startTime === time && (s.specificDate === null || s.specificDate === undefined);
            });

            let content = '';
            let bgColor = '#fff';
            let textColor = '#ccc';
            let cursor = 'default';
            let onclick = '';

            if (appointment) {
                bgColor = '#fef3e2';
                textColor = '#e67e22';
                const displayName = (appointment.patientName || 'Patient').split(' ')[0];
                content = `<strong style="font-size: 10px;">${escapeHtml(displayName)}</strong><br><small>${getMediaLabel(appointment.mediaType)}</small>`;
                cursor = 'pointer';
                onclick = appointment.patientId ? `viewPatientFromSchedule('${appointment.patientId}')` : '';
            } else if (slot?.isBlocked) {
                bgColor = '#f5f5f5';
                textColor = '#999';
                content = `<span style="font-size: 10px;">🔒</span>`;
                cursor = 'pointer';
                onclick = `unblockSlot('${slot.id}')`;
            } else if (slot && !slot.isBooked && !slot.isBlocked) {
                bgColor = '#e8f4ee';
                textColor = '#44AA99';
                content = `<span style="font-size: 10px; cursor: pointer; text-decoration: underline;" onclick="event.stopPropagation(); confirmDeleteSlot('${slot.id}')">Supprimer</span>`;
            } else {
                bgColor = '#fff';
                textColor = '#eee';
                content = `<span style="cursor: pointer; opacity: 0.3;" onclick="openSlotModal(${dayOfWeek}, '${time}', '${dateStr}')">+</span>`;
            }

            html += `<div style="padding: 8px 4px; text-align: center; font-size: 10px; background: ${bgColor}; color: ${textColor}; cursor: ${cursor}; border: 1px solid #f0f0f0;" ${onclick ? 'onclick="' + onclick + '"' : ''}>${content}</div>`;
        }
        html += '</div>';
    });

    container.innerHTML = html;
}

function renderNextAppointment() {
    const section = document.getElementById('nextAppointmentSection');
    const container = document.getElementById('nextAppointment');
    if (!section || !container) return;

    console.log('All appointments for next appointment:', allAppointments);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const validStatuses = ['confirmed', 'accepted', 'completed'];
    const nextApt = allAppointments
        .filter(apt => {
            if (!apt.appointmentDate) return false;
            const aptDate = parseDateSafe(apt.appointmentDate);
            if (!aptDate) return false;
            const status = (apt.status || '').toLowerCase();
            const isValidStatus = validStatuses.includes(status) || status === '';
            return isValidStatus && aptDate >= now;
        })
        .sort((a, b) => {
            const dateA = parseDateSafe(a.appointmentDate) || new Date(0);
            const dateB = parseDateSafe(b.appointmentDate) || new Date(0);
            const dateCompare = dateA - dateB;
            if (dateCompare !== 0) return dateCompare;
            return (a.appointmentTime || '').localeCompare(b.appointmentTime || '');
        })[0];

    if (!nextApt) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const aptDate = parseDateSafe(nextApt.appointmentDate) || new Date();
    if (!aptDate) {
        section.style.display = 'none';
        return;
    }

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 14px; opacity: 0.8;">Prochain rendez-vous</div>
                <div style="font-size: 18px; font-weight: 600; margin-top: 5px;">${escapeHtml(nextApt.patientName || 'Patient')}</div>
                <div style="font-size: 14px; margin-top: 5px;">
                    ${aptDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${nextApt.appointmentTime || '-'}
                </div>
                <div style="font-size: 13px; margin-top: 5px; opacity: 0.8;">
                    Type: ${getMediaLabel(nextApt.mediaType)}
                </div>
            </div>
            <div style="text-align: right;">
                <button onclick="viewPatientProfile('${nextApt.patientId}')" style="background: white; color: #091346; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">
                    Voir patient
                </button>
            </div>
        </div>
    `;
}

function renderWeekView() {
    const container = document.getElementById('weekView');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '';
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        weekDays.push(date);
    }

    html += weekDays.map((date, i) => {
        const dayName = DAY_NAMES[date.getDay()];
        const dayNum = date.getDate();
        const month = date.toLocaleDateString('fr-FR', { month: 'short' });
        const dateStr = formatDateOnly(date);
        const isToday = dateStr === formatDateOnly(today);
        return `
            <div style="background: ${isToday ? '#44AA99' : '#091346'}; color: white; padding: 12px 8px; border-radius: 8px; text-align: center;">
                <div style="font-weight: 600; font-size: 13px;">${dayName}</div>
                <div style="font-size: 18px; font-weight: 700;">${dayNum}</div>
                <div style="font-size: 11px; opacity: 0.9;">${month}</div>
            </div>
        `;
    }).join('');

    weekDays.forEach((date, dayIndex) => {
        const dateStr = formatDateOnly(date);
        const dayOfWeek = date.getDay();

        const dayAppointments = weekAppointments.filter(apt => {
            if (!apt.appointmentDate || !apt.appointmentTime) return false;
            const aptDate = parseDateSafe(apt.appointmentDate);
            if (!aptDate) return false;
            const aptDateStr = formatDateOnly(aptDate);
            return aptDateStr === dateStr;
        }).sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''));

        const appointmentTimes = new Set(dayAppointments.map(apt => apt.appointmentTime));

        const dayAvailableSlots = timeSlots.filter(slot => {
            if (slot.isBlocked) return false;
            if (appointmentTimes.has(slot.startTime)) return false;
            if (slot.specificDate) {
                const slotDate = parseDateSafe(slot.specificDate);
                if (!slotDate) return false;
                return formatDateOnly(slotDate) === dateStr;
            }
            return slot.dayOfWeek === dayOfWeek && (slot.specificDate === null || slot.specificDate === undefined);
        }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        const dayBlockedSlots = timeSlots.filter(slot => {
            if (!slot.isBlocked) return false;
            if (slot.specificDate) {
                const slotDate = parseDateSafe(slot.specificDate);
                if (!slotDate) return false;
                return formatDateOnly(slotDate) === dateStr;
            }
            return slot.dayOfWeek === dayOfWeek && (slot.specificDate === null || slot.specificDate === undefined);
        }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        const allItems = [];

        dayAppointments.forEach(apt => {
            allItems.push({
                type: 'appointment',
                time: apt.appointmentTime,
                data: apt
            });
        });

        dayAvailableSlots.forEach(slot => {
            allItems.push({
                type: 'available',
                time: slot.startTime,
                data: slot
            });
        });

        dayBlockedSlots.forEach(slot => {
            allItems.push({
                type: 'blocked',
                time: slot.startTime,
                data: slot
            });
        });

        allItems.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const hasContent = allItems.length > 0;

        html += `<div style="min-height: 200px; background: #f9f9f9; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">`;

        if (!hasContent) {
            html += `<div style="color: #999; font-size: 12px; text-align: center; padding: 20px;">Aucun créneau</div>`;
        } else {
            allItems.forEach(item => {
                const time = item.time || '-';

                if (item.type === 'appointment') {
                    const apt = item.data;
                    const patientName = (apt.patientName || 'Patient').split(' ')[0];
                    const mediaIcon = apt.mediaType === 'video' ? '📹' : apt.mediaType === 'phone' ? '📞' : '💬';
                    html += `
                        <div style="background: #fef3e2; border-left: 4px solid #e67e22; padding: 10px; border-radius: 4px; cursor: pointer;" onclick="viewPatientProfile('${apt.patientId}')">
                            <div style="font-weight: 600; font-size: 13px; color: #091346;">${time}</div>
                            <div style="font-size: 12px; color: #e67e22;">${escapeHtml(patientName)}</div>
                            <div style="font-size: 11px; color: #999;">${mediaIcon}</div>
                        </div>
                    `;
                } else if (item.type === 'blocked') {
                    const slot = item.data;
                    const slotId = slot.id || '';
                    html += `
                        <div style="background: #ffebee; border-left: 4px solid #e74c3c; padding: 10px; border-radius: 4px; cursor: pointer;" onclick="event.stopPropagation(); confirmUnblockSlot('${slotId}', '${dateStr}', '${time}')">
                            <div style="font-weight: 600; font-size: 13px; color: #c62828;">${time}</div>
                            <div style="font-size: 11px; color: #e74c3c;">Bloqué</div>
                        </div>
                    `;
                } else {
                    const slot = item.data;
                    const slotId = slot.id || '';
                    html += `
                        <div style="background: #e8f4ee; border-left: 4px solid #44AA99; padding: 10px; border-radius: 4px; cursor: pointer;" onclick="event.stopPropagation(); confirmUnavailable('${slotId}', '${dateStr}', '${time}')">
                            <div style="font-weight: 600; font-size: 13px; color: #091346;">${time}</div>
                            <div style="font-size: 11px; color: #44AA99;">Disponible</div>
                        </div>
                    `;
                }
            });
        }

        html += `</div>`;
    });

    container.innerHTML = html;
}

// ============================================
// NAVIGATION
// ============================================
function navigateWeek(direction) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (direction * 7));
    loadAllData();
}

function goToToday() {
    initWeek();
    loadAllData();
    showToast('Semaine en cours', 'info');
}

// ============================================
// SLOT MODAL
// ============================================
function openSlotModal(dayOfWeek, startTime, specificDate) {
    selectedCell = { dayOfWeek: parseInt(dayOfWeek), startTime, specificDate };

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('slotSpecificDate').value = specificDate || today;
    document.getElementById('slotStartTime').value = startTime;

    document.getElementById('slotRecurrence').value = 'none';
    document.getElementById('blockOptions').style.display = 'none';
    document.getElementById('blockEntireDay').checked = false;

    document.getElementById('enableBlockRange').checked = false;
    document.getElementById('blockRangeContent').style.display = 'none';
    document.getElementById('blockRangeStart').value = '';
    document.getElementById('blockRangeEnd').value = '';
    setRangeAction('available');

    document.getElementById('slotModal').style.display = 'flex';
}

function closeSlotModal() {
    document.getElementById('slotModal').style.display = 'none';
    selectedCell = null;
}

async function saveSlot(isBlock) {
    if (!selectedCell) return;

    const specificDate = document.getElementById('slotSpecificDate').value;
    const startTime = document.getElementById('slotStartTime').value;
    const recurrence = document.getElementById('slotRecurrence').value;
    const blockEntireDay = document.getElementById('blockEntireDay').checked;

    if (!startTime) {
        showToast('Veuillez sélectionner une heure', 'error');
        return;
    }

    const endTime = getEndTime(startTime);

    try {
        if (isBlock) {
            if (blockEntireDay) {
                for (const time of TIME_SLOTS) {
                    await doctorAPI.blockTimeSlot({
                        dayOfWeek: selectedCell.dayOfWeek,
                        startTime: time,
                        endTime: getEndTime(time),
                        specificDate,
                        recurrence
                    });
                }
                showToast('Journée entière bloquée!', 'success');
            } else {
                await doctorAPI.blockTimeSlot({
                    dayOfWeek: selectedCell.dayOfWeek,
                    startTime,
                    endTime,
                    specificDate,
                    recurrence
                });
                showToast('Créneau bloqué!', 'success');
            }
        } else {
            const result = await doctorAPI.addTimeSlot({
                dayOfWeek: selectedCell.dayOfWeek,
                startTime,
                endTime,
                specificDate,
                recurrence
            });
            showToast(result.message || 'Créneau ajouté!', 'success');
        }

        closeSlotModal();
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + (error.message || 'Impossible de sauvegarder'), 'error');
    }
}

let currentRangeAction = 'available';

function toggleTimeRange() {
    const enabled = document.getElementById('enableBlockRange').checked;
    const content = document.getElementById('blockRangeContent');
    const startTime = document.getElementById('slotStartTime').value;
    content.style.display = enabled ? 'block' : 'none';
    if (enabled && startTime) {
        document.getElementById('blockRangeStart').value = startTime;
        const idx = TIME_SLOTS.indexOf(startTime);
        if (idx !== -1 && idx < TIME_SLOTS.length - 1) {
            document.getElementById('blockRangeEnd').value = TIME_SLOTS[idx + 1];
        }
    }
}

function setRangeAction(action) {
    currentRangeAction = action;
    const availableBtn = document.getElementById('rangeActionAvailableBtn');
    const blockedBtn = document.getElementById('rangeActionBlockedBtn');
    const applyBtn = document.getElementById('applyRangeBtn');

    if (action === 'available') {
        availableBtn.style.background = 'var(--primary-green)';
        availableBtn.style.color = 'white';
        blockedBtn.style.background = 'white';
        blockedBtn.style.color = '#94a3b8';
        applyBtn.style.background = 'var(--primary-green)';
        applyBtn.textContent = 'Rendre disponible cette plage';
    } else {
        availableBtn.style.background = 'white';
        availableBtn.style.color = '#94a3b8';
        blockedBtn.style.background = '#dc2626';
        blockedBtn.style.color = 'white';
        applyBtn.style.background = '#dc2626';
        applyBtn.textContent = 'Bloquer cette plage';
    }
}

async function applyTimeRange() {
    if (!selectedCell) return;

    const specificDate = document.getElementById('slotSpecificDate').value;
    const recurrence = document.getElementById('slotRecurrence').value;
    const rangeStart = document.getElementById('blockRangeStart').value;
    const rangeEnd = document.getElementById('blockRangeEnd').value;

    if (!rangeStart || !rangeEnd) {
        showToast('Veuillez sélectionner une heure de début et de fin', 'error');
        return;
    }

    if (rangeStart >= rangeEnd) {
        showToast('L\'heure de fin doit être après l\'heure de début', 'error');
        return;
    }

    const timesInRange = TIME_SLOTS.filter(time => time >= rangeStart && time <= rangeEnd && time.endsWith(':00'));

    if (timesInRange.length === 0) {
        showToast('Aucun créneau valide dans cette plage horaire', 'error');
        return;
    }

    try {
        if (currentRangeAction === 'blocked') {
            for (const time of timesInRange) {
                await doctorAPI.blockTimeSlot({
                    dayOfWeek: selectedCell.dayOfWeek,
                    startTime: time,
                    endTime: getEndTime(time),
                    specificDate,
                    recurrence
                });
            }
            showToast(`${timesInRange.length} créneau(x) bloqué(s) de ${rangeStart} à ${rangeEnd}`, 'success');
        } else {
            for (const time of timesInRange) {
                await doctorAPI.addTimeSlot({
                    dayOfWeek: selectedCell.dayOfWeek,
                    startTime: time,
                    endTime: getEndTime(time),
                    specificDate,
                    recurrence
                });
            }
            showToast(`${timesInRange.length} créneau(x) disponible(s) de ${rangeStart} à ${rangeEnd}`, 'success');
        }
        closeSlotModal();
        await loadAllData();
    } catch (error) {
        const actionLabel = currentRangeAction === 'blocked' ? 'bloquer' : 'ajouter';
        showToast('Erreur: ' + (error.message || `Impossible de ${actionLabel} la plage`), 'error');
    }
}

function getEndTime(startTime) {
    const [hours, minutes] = startTime.split(':');
    const endDate = new Date();
    endDate.setHours(parseInt(hours), parseInt(minutes) + 30);
    return endDate.toTimeString().substring(0, 5);
}

async function unblockSlot(slotId) {
    try {
        await doctorAPI.unblockTimeSlot(slotId);
        showToast('Créneau débloqué', 'success');
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

async function deleteSlot(slotId) {
    try {
        await doctorAPI.deleteTimeSlot(slotId);
        showToast('Créneau supprimé', 'success');
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function confirmDeleteSlot(slotId) {
    showConfirmModal('Supprimer ce créneau ?', 'Êtes-vous sûr de vouloir supprimer ce créneau disponible ?', () => deleteSlot(slotId));
}

let currentUnavailableSlot = null;
let currentConfirmAction = null;

function confirmUnavailable(slotId, dateStr, time) {
    currentUnavailableSlot = { slotId, dateStr, time };
    const modal = document.getElementById('unavailableModal');
    const timeText = document.getElementById('unavailableTimeText');
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    timeText.textContent = `${dateFormatted} à ${time}`;
    modal.style.display = 'flex';
}

function closeUnavailableModal() {
    document.getElementById('unavailableModal').style.display = 'none';
    currentUnavailableSlot = null;
}

function confirmUnavailableAction() {
    if (currentUnavailableSlot && currentUnavailableSlot.slotId) {
        deleteSlot(currentUnavailableSlot.slotId);
        closeUnavailableModal();
    } else {
        showToast('Créneau non trouvé', 'error');
        closeUnavailableModal();
    }
}

function showConfirmModal(title, text, action) {
    currentConfirmAction = action;
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalText').textContent = text;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    currentConfirmAction = null;
}

function confirmModalAction() {
    if (currentConfirmAction) {
        currentConfirmAction();
    }
    closeConfirmModal();
}

function confirmUnblockSlot(slotId, dateStr, time) {
    showConfirmModal('Débloquer ce créneau ?', 'Voulez-vous débloquer ce créneau à ' + time + ' ?', () => {
        if (slotId) {
            unblockSlot(slotId);
        } else {
            showToast('Créneau non trouvé', 'error');
        }
    });
}

function viewPatientFromSchedule(patientId) {
    viewPatientProfile(patientId);
}

// ============================================
// VIEW PATIENT PROFILE
// ============================================
async function viewPatientProfile(patientId) {
    const modal = document.getElementById('patientProfileModal');
    if (!modal) return;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('patientProfileContent').innerHTML = '<div style="text-align: center; padding: 40px;">Chargement...</div>';

    try {
        let patient = null;

        if (patientsCache) {
            patient = patientsCache.find(p => p.id === patientId);
        }

        if (!patient) {
            const result = await doctorAPI.getPatientById(patientId);
            patient = result.patient || result;
        }

        if (!patient) {
            closePatientModal();
            showToast('Patient non trouvé', 'error');
            return;
        }

        const genderLabel = { 'male': 'Homme', 'female': 'Femme', 'other': 'Autre' };
        const prefGenderLabel = { 'male': 'Homme', 'female': 'Femme', 'no-preference': 'Aucune préférence' };

        const userType = getUserType();
        const patientsPage = userType === 'psychologue' ? 'psychologue_mes_patients.html' : 'counselor_mes_patients.html';

        document.getElementById('patientProfileContent').innerHTML = `
            <div style="display: grid; gap: 15px;">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Informations personnelles</h4>
                    <p><strong>Nom:</strong> ${escapeHtml(patient.fullname || 'Non spécifié')}</p>
                    <p><strong>Email:</strong> ${escapeHtml(patient.email || 'Non spécifié')}</p>
                    <p><strong>Téléphone:</strong> ${escapeHtml(patient.phone || 'Non spécifié')}</p>
                    <p><strong>Genre:</strong> ${genderLabel[patient.gender] || 'Non spécifié'}</p>
                    <p><strong>Date de naissance:</strong> ${patient.birthDate ? formatDateFR(patient.birthDate) : 'Non spécifiée'}</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Motif de consultation</h4>
                    <p>${escapeHtml(patient.motifs || 'Non spécifié')}</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Préférences</h4>
                    <p><strong>Genre du praticien:</strong> ${prefGenderLabel[patient.prefGender] || 'Aucune préférence'}</p>
                    <p><strong>Type de session:</strong> ${patient.prefType === 'video' ? 'Vidéo' : patient.prefType === 'phone' ? 'Téléphone' : patient.prefType === 'chat' ? 'Chat' : 'Non spécifié'}</p>
                </div>
                <div style="background: #44AA99; color: white; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0;">Historique</h4>
                    <p><strong>Total des séances:</strong> ${patient.totalSessions || 0}</p>
                    <p><strong>Dernière séance:</strong> ${patient.lastSession ? formatDateFR(patient.lastSession) : '-'}</p>
                </div>
                <div style="background: #44AA99; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <button onclick="closePatientModal(); window.location.href='${patientsPage}'" style="background: white; color: #44AA99; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%;">
                        Voir fiche complète
                    </button>
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Error loading patient:', error);
        closePatientModal();
        showToast('Erreur lors du chargement du patient', 'error');
    }
}

function closePatientModal() {
    const modal = document.getElementById('patientProfileModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = 'auto';
}

document.getElementById('patientProfileModal')?.addEventListener('click', function(e) {
    if (e.target === this) closePatientModal();
});

document.getElementById('slotModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeSlotModal();
});

// ============================================
// WINDOW EXPORTS
// ============================================
window.navigateWeek = navigateWeek;
window.goToToday = goToToday;
window.openSlotModal = openSlotModal;
window.closeSlotModal = closeSlotModal;
window.saveSlot = saveSlot;
window.toggleTimeRange = toggleTimeRange;
window.setRangeAction = setRangeAction;
window.applyTimeRange = applyTimeRange;
window.deleteSlot = deleteSlot;
window.confirmDeleteSlot = confirmDeleteSlot;
window.confirmUnavailable = confirmUnavailable;
window.closeUnavailableModal = closeUnavailableModal;
window.confirmUnavailableAction = confirmUnavailableAction;
window.confirmUnblockSlot = confirmUnblockSlot;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.confirmModalAction = confirmModalAction;
window.unblockSlot = unblockSlot;
window.viewPatientFromSchedule = viewPatientFromSchedule;
window.viewPatientProfile = viewPatientProfile;
window.closePatientModal = closePatientModal;


document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
    link.addEventListener('click', () => {
        sessionStorage.setItem('menuScrollPos', document.querySelector('.nav-menu').scrollTop);
    });
});

window.addEventListener('load', () => {
    const scrollPos = sessionStorage.getItem('menuScrollPos');
    if (scrollPos) {
        document.querySelector('.nav-menu').scrollTop = scrollPos;
    }
});
