let currentDoctor = null;
let isLoading = false;
let dashboardData = null;
let patientsData = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    initUserDisplay();
    await loadDashboardData();
    await loadUrgentRequests();
    highlightCurrentSidebarLink();
    
    // Real-time socket will auto-initialize from socket-manager.js
});

function initUserDisplay() {
    currentDoctor = getCurrentUser();
    if (currentDoctor) {
        const name = currentDoctor.fullname || currentDoctor.email || '';

        document.querySelectorAll('.user-name').forEach(el => {
            if (el) el.textContent = name;
        });

        const greetingEl = document.getElementById('greetingTitle');
        if (greetingEl) {
            greetingEl.textContent = 'Bonjour, ' + name;
        }
    }
}

async function loadDashboardData() {
    if (isLoading) return;

    isLoading = true;
    showLoadingState(true);

    try {
        const dashboard = await doctorAPI.getDashboard();
        const patientsResult = await doctorAPI.getPatients().catch(() => ({ patients: [], count: 0 }));

        currentDoctor = { ...currentDoctor, profile: dashboard };
        dashboardData = dashboard;
        patientsData = patientsResult.patients || [];

        updateStats(dashboard.stats);
        renderTodaySessions(dashboard.todaySessions);
        renderPendingRequests(dashboard.pendingRequests);
        renderUpcomingAppointments(dashboard.upcomingAppointments);

        const patientCount = patientsData?.patients?.length || dashboard.stats?.activePatients || 0;
        updateSidebarBadges(patientCount, dashboard.stats.pendingRequestsCount);

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Erreur lors du chargement des données', 'error');
    } finally {
        isLoading = false;
        showLoadingState(false);
    }
}

function showLoadingState(show) {
    const sections = [
        '.stats-dashboard',
        '.seances-list',
        '.demandes-list',
        '.rdv-list'
    ];

    sections.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.style.opacity = show ? '0.5' : '1';
            el.style.pointerEvents = show ? 'none' : 'auto';
        }
    });
}

function updateStats(stats) {
    const statsMap = {
        'statActivePatients': stats?.activePatients || 0,
        'statTodaySessions': stats?.todaySessionsCount || 0,
        'statPendingRequests': stats?.pendingRequestsCount || 0,
        'statMonthlyIncome': (stats?.monthlyIncome || 0).toLocaleString('fr-FR') + ' DA'
    };

    Object.keys(statsMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = statsMap[id];
    });
}

function updateSidebarBadges(patientCount, pendingCount) {
    const patientsBadge = document.querySelector('.nav-item[href="counselor_mes_patients.html"] .badge');
    if (patientsBadge && patientCount !== undefined) {
        patientsBadge.textContent = patientCount;
    }

    const messagesBadge = document.querySelector('.nav-item[href="counselor_messagerie.html"] .badge');
    if (messagesBadge && pendingCount !== undefined) {
        messagesBadge.textContent = pendingCount;
    }
}

function isSessionValid(apt) {
    if (!apt.appointmentTime) return true;
    const now = new Date();
    const [hours, minutes] = apt.appointmentTime.split(':').map(Number);
    const sessionTime = new Date();
    sessionTime.setHours(hours, minutes, 0, 0);
    const oneHourAfterSession = new Date(sessionTime.getTime() + 60 * 60 * 1000);
    return now <= oneHourAfterSession;
}

function renderTodaySessions(sessions) {
    const container = document.querySelector('.seances-list');
    if (!container) {
        console.warn('Sessions container not found');
        return;
    }

    const validSessions = (sessions || []).filter(isSessionValid);

    if (validSessions.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 30px; text-align: center; color: #888;">Aucune séance prévue aujourd\'hui</div>';
        return;
    }

    container.innerHTML = validSessions.map(apt => {
        const statusClass = apt.status === 'confirmed' ? 'a-venir' : 'en-cours';
        const statusText = apt.status === 'confirmed' ? 'Confirmé' : 'En attente';
        const btnText = apt.status === 'confirmed' ? 'Démarrer' : 'Préparer';
        const btnIcon = apt.status === 'confirmed'
            ? '<polygon points="5 3 19 12 5 21 5 3"/>'
            : '<path d="M12 6v6l4 2"/>';

        const patientName = apt.patientName || apt.patient?.fullname || 'Patient';

        return `
            <div class="seance-card">
                <div class="seance-time">${apt.appointmentTime || '-'}</div>
                <div class="seance-info">
                    <h4 style="cursor: pointer; color: #44AA99; text-decoration: underline;" onclick="viewPatientProfile('${apt.patientId}')">${escapeHtml(patientName)}</h4>
                    <p>${getMediaLabel(apt.mediaType)} · ${escapeHtml(apt.notes) || ''}</p>
                </div>
                <div class="seance-status ${statusClass}">${statusText}</div>
                <button class="seance-btn" onclick="startSession('${apt.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">${btnIcon}</svg>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
}

function renderPendingRequests(requests) {
    const container = document.querySelector('.demandes-list');
    if (!container) {
        console.warn('Demandes container not found');
        return;
    }

    const now = new Date();
    const validRequests = (requests || []).filter(apt => {
        if (!apt.appointmentDate || !apt.appointmentTime) return true;
        const [hours, minutes] = apt.appointmentTime.split(':').map(Number);
        const sessionTime = new Date(apt.appointmentDate);
        sessionTime.setHours(hours, minutes, 0, 0);
        const oneHourAfterSession = new Date(sessionTime.getTime() + 60 * 60 * 1000);
        return now <= oneHourAfterSession;
    });

    if (validRequests.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 30px; text-align: center; color: #888;">Aucune demande en attente</div>';
        return;
    }

    container.innerHTML = validRequests.map(apt => {
        const patientName = apt.patientName || apt.patient?.fullname || 'Patient';
        const motifs = apt.motifs || apt.patient?.profile?.motifs || 'Non spécifié';
        const mediaType = apt.mediaType || 'video';
        const aptDate = formatDate(apt.appointmentDate);
        const aptTime = apt.appointmentTime || '-';

        return `
        <div class="demande-card">
            <div class="demande-info">
                <h4 style="cursor: pointer; color: #44AA99; text-decoration: underline;" onclick="viewPatientProfile('${apt.patientId}')">${escapeHtml(patientName)}</h4>
                <p style="color: #44AA99; font-weight: bold;">📅 ${aptDate} à ${aptTime}</p>
                <p>Motif: ${escapeHtml(motifs)} · Préférence: ${getMediaLabel(mediaType)}</p>
                <small>Demande reçue le ${formatDate(apt.createdAt)}</small>
            </div>
            <div class="demande-actions">
                <button class="accept-btn" onclick="acceptRequest('${apt.id}')">✓ Accepter</button>
                <button class="refuse-btn" onclick="refuseRequest('${apt.id}')">✗ Refuser</button>
            </div>
        </div>
    `}).join('');
}

function renderUpcomingAppointments(appointments) {
    const container = document.querySelector('.rdv-list');
    if (!container) {
        console.warn('Rdv list container not found');
        return;
    }

    if (!appointments || appointments.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 30px; text-align: center; color: #888;">Aucun rendez-vous à venir</div>';
        return;
    }

    container.innerHTML = appointments.map(apt => {
        return `
        <div class="rdv-item">
            <div class="rdv-date">${formatDate(apt.appointmentDate)}</div>
            <div class="rdv-info">
                <span style="cursor: pointer; color: #44AA99; text-decoration: underline;" onclick="viewPatientProfile('${apt.patientId}')">${apt.appointmentTime || ''} - ${escapeHtml(apt.patientName) || 'Patient'}</span>
                <span class="rdv-type">${getMediaLabel(apt.mediaType)}</span>
            </div>
        </div>
    `}).join('');
}

async function acceptRequest(appointmentId) {
    try {
        const result = await appointmentAPI.updateStatus(appointmentId, { status: 'confirmed' });
        showToast('Demande acceptée!', 'success');
        await loadDashboardData();
    } catch (error) {
        console.error('Accept error:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}

async function refuseRequest(appointmentId) {
    if (!confirm('Êtes-vous sûr de vouloir refuser cette demande?')) return;

    try {
        const result = await appointmentAPI.updateStatus(appointmentId, { status: 'cancelled' });
        showToast('Demande refusée', 'success');
        await loadDashboardData();
    } catch (error) {
        console.error('Refuse error:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}

async function startSession(appointmentId) {
    try {
        const appointment = dashboardData.todaySessions?.find(s => s.id === appointmentId)
            || dashboardData.upcomingAppointments?.find(s => s.id === appointmentId);

        if (!appointment) {
            showToast('Appointment non trouvé', 'error');
            return;
        }

        await doctorAPI.startVideoSession(appointmentId);

        try {
            await appointmentAPI.startCallState(appointment.patientId, appointmentId);
            localStorage.setItem('doctorInCall', 'true');
            localStorage.setItem('currentCallAppointment', appointmentId);
        } catch (e) {
            console.log('Call state sync skipped');
        }

        window.location.href = `video-call.html?room=${appointmentId}&appointment=${appointmentId}&type=counselor`;

        showToast('Session vidéo démarrée', 'success');

    } catch (error) {
        console.error('Error starting session:', error);
        showToast('Erreur lors du démarrage de la session', 'error');
    }
}

function getMediaIcon(mediaType) {
    const icons = { 'video': '📹', 'phone': '📞', 'chat': '💬' };
    return icons[mediaType] || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function viewPatientProfile(patientId) {
    const modal = document.getElementById('patientProfileModal');
    if (!modal) {
        console.error('Modal not found');
        return;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('patientProfileContent').innerHTML = '<div style="text-align: center; padding: 40px;">Chargement des informations du patient...</div>';

    let patient = null;

    if (patientsData && patientsData.length > 0) {
        patient = patientsData.find(p => p.id === patientId);
    }

    if (!patient && dashboardData) {
        const allPatients = [
            ...(dashboardData.todaySessions || []),
            ...(dashboardData.pendingRequests || []),
            ...(dashboardData.upcomingAppointments || [])
        ];
        const foundApt = allPatients.find(p => p.patientId === patientId);
        if (foundApt) {
            patient = foundApt.patient || foundApt;
        }
    }

    if (!patient) {
        try {
            const result = await doctorAPI.getPatientById(patientId);
            patient = result.patient || result;
        } catch (e) {
            console.error('Error fetching patient:', e);
        }
    }

    if (!patient) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        showToast('Patient non trouvé', 'error');
        return;
    }

    const finalPatient = patient.patient ? { ...patient.patient, ...patient } : patient;

    const genderLabel = { 'male': 'Homme', 'female': 'Femme', 'other': 'Autre' };
    const prefGenderLabel = { 'male': 'Homme', 'female': 'Femme', 'no-preference': 'Aucune préférence' };
    const statusLabel = { 'pending': 'En attente', 'confirmed': 'Confirmé', 'completed': 'Terminé', 'cancelled': 'Annulé' };

    const aptData = patient.appointmentDate ? patient : (dashboardData?.todaySessions?.find(p => p.patientId === patientId) || dashboardData?.pendingRequests?.find(p => p.patientId === patientId) || dashboardData?.upcomingAppointments?.find(p => p.patientId === patientId));

    document.getElementById('patientProfileContent').innerHTML = `
        <div class="patient-profile-grid" style="display: grid; gap: 15px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #091346;">Informations personnelles</h4>
                <p><strong>Nom:</strong> ${escapeHtml(finalPatient.fullname || finalPatient.patientName || 'Non spécifié')}</p>
                <p><strong>Email:</strong> ${escapeHtml(finalPatient.email || 'Non spécifié')}</p>
                <p><strong>Téléphone:</strong> ${escapeHtml(finalPatient.phone || finalPatient.patientPhone || 'Non spécifié')}</p>
                <p><strong>Genre:</strong> ${genderLabel[finalPatient.gender || finalPatient.patientGender] || 'Non spécifié'}</p>
                <p><strong>Date de naissance:</strong> ${finalPatient.birthDate ? formatDate(finalPatient.birthDate) : 'Non spécifiée'}</p>
                <p><strong>Langue:</strong> ${escapeHtml(finalPatient.language || 'Non spécifiée')}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #091346;">Motif de consultation</h4>
                <p>${escapeHtml(finalPatient.motifs || finalPatient.notes || finalPatient.patient?.profile?.motifs || 'Non spécifié')}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #091346;">Préférences</h4>
                <p><strong>Genre du praticien:</strong> ${prefGenderLabel[finalPatient.prefGender || finalPatient.patient?.prefGender] || 'Aucune préférence'}</p>
                <p><strong>Type de session:</strong> ${finalPatient.prefType === 'video' ? 'Vidéo' : finalPatient.prefType === 'phone' ? 'Téléphone' : finalPatient.prefType === 'chat' ? 'Chat' : 'Non spécifié'}</p>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #091346;">Détails du rendez-vous</h4>
                <p><strong>Date:</strong> ${aptData?.appointmentDate ? formatDate(aptData.appointmentDate) : '-'}</p>
                <p><strong>Heure:</strong> ${aptData?.appointmentTime || '-'}</p>
                <p><strong>Type:</strong> ${getMediaLabel(aptData?.mediaType)}</p>
                <p><strong>Statut:</strong> ${statusLabel[aptData?.status] || aptData?.status || 'Non spécifié'}</p>
            </div>
            <div style="background: #44AA99; color: white; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0;">Historique des séances</h4>
                <p><strong>Total des séances:</strong> ${finalPatient.totalSessions || 0}</p>
                <p><strong>Dernière séance:</strong> ${finalPatient.lastSession ? formatDate(finalPatient.lastSession) : '-'}</p>
                <p><strong>Première séance:</strong> ${finalPatient.firstSession ? formatDate(finalPatient.firstSession) : '-'}</p>
            </div>

        </div>
    `;
}

function closePatientModal() {
    const modal = document.getElementById('patientProfileModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = 'auto';
}

document.getElementById('patientProfileModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closePatientModal();
    }
});

// ============================================
// URGENT REQUESTS
// ============================================
async function loadUrgentRequests() {
    try {
        const urgentRequests = await appointmentAPI.getUrgentRequests();
        renderUrgentRequests(urgentRequests);
    } catch (error) {
        console.error('Error loading urgent requests:', error);
    }
}

function renderUrgentRequests(requests) {
    const section = document.getElementById('urgentSection');
    const list = document.getElementById('urgentRequestsList');

    if (!section || !list) return;

    const now = Date.now();
    const pendingRequests = requests.filter(r => {
        if (r.status !== 'pending') return false;
        if (r.doctorId && r.doctorId !== currentDoctor?.id) return false;
        const createdAt = new Date(r.createdAt).getTime();
        return (now - createdAt) < 60 * 60 * 1000;
    });

    if (pendingRequests.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    list.innerHTML = pendingRequests.map(req => {
        const createdAt = new Date(req.createdAt).getTime();
        const minutesLeft = Math.max(0, Math.floor((60 * 60 * 1000 - (now - createdAt)) / 60000));
        const secondsLeft = Math.floor(((60 * 60 * 1000 - (now - createdAt)) % 60000) / 1000);

        return `
        <div class="urgent-item" data-expires="${createdAt + 60 * 60 * 1000}">
            <div class="urgent-badge">URGENT <span class="urgent-timer">${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}</span></div>
            <div class="urgent-content">
                <strong>${req.patient?.fullname || 'Patient'}</strong>
                <span class="urgent-time">${req.appointmentTime || 'Maintenant'}</span>
            </div>
            <div class="urgent-actions">
                <button class="btn-accept" onclick="acceptUrgentRequest('${req.id}')">✓ Accepter</button>
            </div>
        </div>
    `}).join('');

    startUrgentCountdown();
}

let urgentCountdownInterval = null;

function startUrgentCountdown() {
    if (urgentCountdownInterval) clearInterval(urgentCountdownInterval);

    urgentCountdownInterval = setInterval(() => {
        const items = document.querySelectorAll('.urgent-item[data-expires]');
        const now = Date.now();
        let hasExpired = false;

        items.forEach(item => {
            const expires = parseInt(item.dataset.expires);
            const remaining = expires - now;

            if (remaining <= 0) {
                item.remove();
                hasExpired = true;
            } else {
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                const timer = item.querySelector('.urgent-timer');
                if (timer) {
                    timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                if (remaining < 5 * 60 * 1000) {
                    item.style.borderColor = '#ef4444';
                }
            }
        });

        const list = document.getElementById('urgentRequestsList');
        if (list && list.children.length === 0) {
            const section = document.getElementById('urgentSection');
            if (section) section.style.display = 'none';
            clearInterval(urgentCountdownInterval);
        }
    }, 1000);
}

async function acceptUrgentRequest(requestId) {
    try {
        const result = await appointmentAPI.acceptUrgent(requestId);

        if (result.appointment) {
            try {
                await appointmentAPI.startCallState(result.urgentRequest.patient?.id, result.appointment.id);
                localStorage.setItem('doctorInCall', 'true');
                localStorage.setItem('currentCallAppointment', result.appointment.id);
            } catch (e) {
                console.log('Call state sync skipped');
            }

            window.location.href = `video-call.html?room=${result.appointment.id}&appointment=${result.appointment.id}&type=counselor`;
            showToast('Appel vidéo démarré immédiatement!', 'success');
        }

        await loadUrgentRequests();
        await loadDashboardData();
    } catch (error) {
        console.error('Error accepting urgent request:', error);
        showToast('Erreur lors de l\'acceptation', 'error');
    }
}

async function rejectUrgentRequest(requestId) {
    try {
        const result = await appointmentAPI.rejectUrgent(requestId, 'Non disponible');
        showToast('Demande urgente refusée', 'info');
        await loadUrgentRequests();
    } catch (error) {
        console.error('Error rejecting urgent request:', error);
        showToast('Erreur lors du refus', 'error');
    }
}

window.acceptUrgentRequest = acceptUrgentRequest;
window.rejectUrgentRequest = rejectUrgentRequest;
window.loadUrgentRequests = loadUrgentRequests;

window.acceptRequest = acceptRequest;
window.refuseRequest = refuseRequest;
window.startSession = startSession;
window.showToast = showToast;
window.viewPatientProfile = viewPatientProfile;
window.closePatientModal = closePatientModal;

document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
    link.addEventListener('click', function() {
        sessionStorage.setItem('menuScrollPos', document.querySelector('.nav-menu').scrollTop);
    });
});

window.addEventListener('load', function() {
    const scrollPos = sessionStorage.getItem('menuScrollPos');
    if (scrollPos) {
        document.querySelector('.nav-menu').scrollTop = scrollPos;
    }
});

window.addEventListener('beforeunload', function() {
    disconnectSocket();
});

function toggleNotifications(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    if (dropdown.classList.contains('show')) {
        dropdown.classList.remove('show');
    } else {
        dropdown.classList.add('show');
        if (typeof loadNotificationsFromDashboard === 'function') {
            loadNotificationsFromDashboard();
        }
    }
}
window.toggleNotifications = toggleNotifications;
document.getElementById('notificationBtn').addEventListener('click', function(e) {
    toggleNotifications(e);
});
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('notificationDropdown');
    const container = document.querySelector('.notification-container');
    if (container && !container.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});
