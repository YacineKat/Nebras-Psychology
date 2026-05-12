// ============================================
// EMPLOI DU TEMPS - Enhanced Schedule Management
// ============================================

let currentWeekStart = null;
let timeSlots = [];
let weekAppointments = [];
let patientsCache = null;
let isLoading = false;
let selectedCell = null; // { dayOfWeek, startTime, specificDate }

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
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    currentWeekStart = new Date(today);
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0, 0, 0, 0);
}

function initEventListeners() {
    document.getElementById('prevWeekBtn')?.addEventListener('click', () => navigateWeek(-1));
    document.getElementById('nextWeekBtn')?.addEventListener('click', () => navigateWeek(1));
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
        console.log('Today Sessions:', dashboardResult?.todaySessions);
        console.log('Upcoming:', dashboardResult?.upcomingAppointments);

        timeSlots = scheduleResult || [];
        patientsCache = patientsResult?.patients || [];

        // Combine today's sessions + upcoming appointments + pending requests (if confirmed)
        const allAppointments = [
            ...(dashboardResult?.todaySessions || []),
            ...(dashboardResult?.upcomingAppointments || []),
            ...(dashboardResult?.pendingRequests?.filter(apt => apt.status === 'confirmed') || [])
        ];

        // Filter appointments for this week
        const weekEndDate = new Date(currentWeekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        weekEndDate.setHours(23, 59, 59, 999);

        weekAppointments = allAppointments.filter(apt => {
            if (!apt.appointmentDate) return false;
            const aptDate = new Date(apt.appointmentDate);
            return aptDate >= currentWeekStart && aptDate <= weekEndDate;
        });

        console.log('Filtered appointments:', weekAppointments);

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
    renderSlotsTable();
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const todayAppts = weekAppointments.filter(apt => {
        const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
        return aptDate === todayStr && apt.status === 'confirmed';
    });

    const availableSlots = timeSlots.filter(slot => !slot.isBooked && !slot.isBlocked);
    const blockedSlots = timeSlots.filter(slot => slot.isBlocked);

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

    // Build header
    let html = `
        <div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); background: #f5f5f0; border-bottom: 2px solid #44AA99;">
            <div style="padding: 12px; font-weight: 600; color: #091346; text-align: center; font-size: 12px;">Horaire</div>
            ${DAY_SHORT.map((d, i) => {
                const date = new Date(currentWeekStart);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const isToday = dateStr === today.toISOString().split('T')[0];
                return `<div style="padding: 12px; font-weight: 600; color: ${isToday ? '#44AA99' : '#091346'}; text-align: center; font-size: 12px;">${d}<br><small>${date.getDate()}</small></div>`;
            }).join('')}
        </div>
    `;

    // Build grid
    TIME_SLOTS.forEach(time => {
        html += `<div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); border-bottom: 1px solid #eee;">`;
        html += `<div style="padding: 10px; font-weight: 600; color: #091346; text-align: center; font-size: 11px; display: flex; align-items: center; justify-content: center;">${time}</div>`;

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const date = new Date(currentWeekStart);
            date.setDate(date.getDate() + dayIndex);
            const dateStr = date.toISOString().split('T')[0];
            const dayOfWeek = date.getDay();

            // Check if there's an appointment at this time
            const appointment = weekAppointments.find(apt => {
                const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
                return aptDate === dateStr && apt.appointmentTime === time;
            });

            // Check if there's an available slot
            const slot = timeSlots.find(s => {
                const slotDate = s.specificDate ? new Date(s.specificDate).toISOString().split('T')[0] : null;
                const slotDay = s.specificDate ? null : s.dayOfWeek;
                
                if (slotDate) {
                    return slotDate === dateStr && s.startTime === time;
                } else {
                    return slotDay === dayOfWeek && s.startTime === time;
                }
            });

            let content = '';
            let bgColor = '#fff';
            let textColor = '#ccc';
            let cursor = 'default';
            let onclick = '';

            if (appointment) {
                // BOOKED - Show patient name
                bgColor = '#fef3e2';
                textColor = '#e67e22';
                content = `<strong style="font-size: 10px;">${escapeHtml(appointment.patientName?.split(' ')[0] || 'Patient')}</strong><br><small>${getMediaLabel(appointment.mediaType)}</small>`;
                cursor = 'pointer';
                onclick = `viewPatientFromSchedule('${appointment.patientId}')`;
            } else if (slot?.isBlocked) {
                // BLOCKED
                bgColor = '#f5f5f5';
                textColor = '#999';
                content = `<span style="font-size: 10px;">🔒</span>`;
                cursor = 'pointer';
                onclick = `unblockSlot('${slot.id}')`;
            } else if (slot?.isBooked === false && slot?.isBlocked === false) {
                // AVAILABLE
                bgColor = '#e8f4ee';
                textColor = '#44AA99';
                content = `<span style="font-size: 10px; cursor: pointer; text-decoration: underline;" onclick="event.stopPropagation(); confirmDeleteSlot('${slot.id}')">Supprimer</span>`;
            } else {
                // EMPTY - Click to add
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

    const now = new Date();
    const nextApt = weekAppointments
        .filter(apt => new Date(apt.appointmentDate) >= now && apt.status === 'confirmed')
        .sort((a, b) => {
            const dateCompare = new Date(a.appointmentDate) - new Date(b.appointmentDate);
            if (dateCompare !== 0) return dateCompare;
            return (a.appointmentTime || '').localeCompare(b.appointmentTime || '');
        })[0];

    if (!nextApt) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    const aptDate = new Date(nextApt.appointmentDate);
    
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-size: 14px; opacity: 0.8;">Prochain rendez-vous</div>
                <div style="font-size: 18px; font-weight: 600; margin-top: 5px;">${escapeHtml(nextApt.patientName)}</div>
                <div style="font-size: 14px; margin-top: 5px;">
                    ${aptDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${nextApt.appointmentTime}
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
    
    // Set end time to start time + 30 min
    const [hours, minutes] = startTime.split(':');
    const endDate = new Date();
    endDate.setHours(parseInt(hours), parseInt(minutes) + 30);
    const endTime = endDate.toTimeString().substring(0, 5);
    document.getElementById('slotEndTime').value = endTime;
    
    document.getElementById('slotRecurrence').value = 'none';
    document.getElementById('blockOptions').style.display = 'none';
    document.getElementById('blockEntireDay').checked = false;
    
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
    const endTime = document.getElementById('slotEndTime').value;
    const recurrence = document.getElementById('slotRecurrence').value;
    const blockEntireDay = document.getElementById('blockEntireDay').checked;

    if (!startTime || !endTime) {
        showToast('Veuillez sélectionner les heures', 'error');
        return;
    }

    if (startTime >= endTime) {
        showToast('L\'heure de fin doit être après le début', 'error');
        return;
    }

    try {
        if (isBlock) {
            // Blocking mode
            if (blockEntireDay) {
                // Block entire day - create a slot for each time slot
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
            // Available mode
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

function getEndTime(startTime) {
    const [hours, minutes] = startTime.split(':');
    const endDate = new Date();
    endDate.setHours(parseInt(hours), parseInt(minutes) + 30);
    return endDate.toTimeString().substring(0, 5);
}

async function unblockSlot(slotId) {
    if (!confirm('Débloquer ce créneau?')) return;
    
    try {
        await doctorAPI.unblockTimeSlot(slotId);
        showToast('Créneau débloqué', 'success');
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

async function deleteSlot(slotId) {
    if (!confirm('Supprimer ce créneau?')) return;
    
    try {
        await doctorAPI.deleteTimeSlot(slotId);
        showToast('Créneau supprimé', 'success');
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function confirmDeleteSlot(slotId) {
    if (confirm('Supprimer ce créneau disponible?')) {
        deleteSlot(slotId);
    }
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
                    <button onclick="closePatientModal(); window.location.href='psychologue_mes_patients.html'" style="background: white; color: #44AA99; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%;">
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

function formatDateFR(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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

// Click outside to close modals
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
window.deleteSlot = deleteSlot;
window.confirmDeleteSlot = confirmDeleteSlot;
window.unblockSlot = unblockSlot;
window.viewPatientFromSchedule = viewPatientFromSchedule;
window.viewPatientProfile = viewPatientProfile;
window.closePatientModal = closePatientModal;
window.showToast = showToast;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.getMediaLabel = getMediaLabel;

// Menu scroll persistence
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