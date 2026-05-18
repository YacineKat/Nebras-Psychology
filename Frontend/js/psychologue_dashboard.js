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
        // Load sequentially to avoid connection pool issues
        const dashboard = await doctorAPI.getDashboard();
        const patientsResult = await doctorAPI.getPatients().catch(() => ({ patients: [], count: 0 }));
        
        console.log('Dashboard data:', dashboard);
        console.log('Patients data:', patientsResult);
        currentDoctor = { ...currentDoctor, profile: dashboard };
        dashboardData = dashboard;
        patientsData = patientsResult.patients || [];
        
        updateStats(dashboard.stats);
        console.log('Today sessions:', dashboard.todaySessions);
        console.log('Pending requests:', dashboard.pendingRequests);
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
    const patientsBadge = document.querySelector('.nav-item[href="psychologue_mes_patients.html"] .badge');
    if (patientsBadge && patientCount !== undefined) {
        patientsBadge.textContent = patientCount;
    }
    
    const messagesBadge = document.querySelector('.nav-item[href="psychologue_messagerie.html"] .badge');
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
    
    console.log('Rendering today sessions:', sessions);
    
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
    
    console.log('Rendering pending requests:', requests);
    
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
        console.log('Accepting request:', appointmentId);
        const result = await appointmentAPI.updateStatus(appointmentId, { status: 'confirmed' });
        console.log('Accept result:', result);
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
        console.log('Refusing request:', appointmentId);
        const result = await appointmentAPI.updateStatus(appointmentId, { status: 'cancelled' });
        console.log('Refuse result:', result);
        showToast('Demande refusée', 'success');
        await loadDashboardData();
    } catch (error) {
        console.error('Refuse error:', error);
        showToast('Erreur: ' + error.message, 'error');
    }
}

let currentVideoAppointment = null;

async function startSession(appointmentId) {
    try {
        // Get appointment details
        const appointment = dashboardData.todaySessions?.find(s => s.id === appointmentId) 
            || dashboardData.upcomingAppointments?.find(s => s.id === appointmentId);
        
        if (!appointment) {
            showToast('Appointment non trouvé', 'error');
            return;
        }

        // Start video session via API
        await doctorAPI.startVideoSession(appointmentId);
        
        currentVideoAppointment = {
            id: appointmentId,
            patientName: appointment.patientName,
            patientId: appointment.patientId
        };

        // Update call state for real-time sync
        try {
            await appointmentAPI.startCallState(appointment.patientId, appointmentId);
            localStorage.setItem('doctorInCall', 'true');
            localStorage.setItem('currentCallAppointment', appointmentId);
        } catch (e) {
            console.log('Call state sync skipped');
        }

        // Redirect to video call page
        window.location.href = `video-call.html?room=${appointmentId}&appointment=${appointmentId}&type=doctor`;
        
        showToast('Session vidéo démarrée', 'success');
        
    } catch (error) {
        console.error('Error starting session:', error);
        showToast('Erreur lors du démarrage de la session', 'error');
    }
}

function showVideoCallUI(appointment) {
    const videoSection = document.getElementById('privateVideoCallSection');
    if (!videoSection) return;

    const userName = getCurrentUser()?.fullname || 'Psychologue';
    const userInitial = userName.charAt(0).toUpperCase();
    const patientInitial = appointment.patientName ? appointment.patientName.charAt(0).toUpperCase() : 'P';

    document.getElementById('videoCallPatientName').textContent = appointment.patientName || 'Appel vidéo';
    document.getElementById('privateLocalName').textContent = userName;
    document.getElementById('privateLocalVideoPlaceholder').textContent = userInitial;
    document.getElementById('privatePatientPlaceholder').querySelector('p').textContent = 'En attente du patient...';

    videoSection.style.display = 'block';
    currentVideoAppointment = appointment;

    initPrivateCall(appointment);
    loadPrivateChatHistory(appointment.patientId);
    startPrivateCallTimer();
}

let privateCallStartTime = null;
let privateCallTimerInterval = null;

function startPrivateCallTimer() {
    privateCallStartTime = Date.now();
    privateCallTimerInterval = setInterval(updatePrivateCallDuration, 1000);
}

function updatePrivateCallDuration() {
    if (!privateCallStartTime) return;
    const elapsed = Math.floor((Date.now() - privateCallStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    const durationEl = document.getElementById('privateCallDuration');
    if (durationEl) {
        durationEl.textContent = `${minutes}:${seconds}`;
    }
}

function stopPrivateCallTimer() {
    if (privateCallTimerInterval) {
        clearInterval(privateCallTimerInterval);
        privateCallTimerInterval = null;
    }
    privateCallStartTime = null;
}

let privateStream = null;
let privateIsMuted = true;
let privateIsVideoOff = true;

async function initPrivateCall(appointment) {
    try {
        privateStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const videoEl = document.getElementById('privateLocalVideo');
        if (videoEl) {
            videoEl.srcObject = privateStream;
            videoEl.style.display = 'block';
            videoEl.style.transform = 'scaleX(-1)';
        }

        const placeholder = document.getElementById('privateLocalVideoPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        privateStream.getVideoTracks()[0].enabled = false;
        privateStream.getAudioTracks()[0].enabled = false;

        privateIsMuted = true;
        privateIsVideoOff = true;

        document.getElementById('privateLocalMuteIndicator').style.display = 'flex';
        document.getElementById('privateLocalVideoOffIndicator').style.display = 'flex';
        document.getElementById('privateMuteBtn').style.background = '#e74c3c';
        document.getElementById('privateVideoBtn').style.background = '#e74c3c';
        document.getElementById('privateMuteIcon').innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        document.getElementById('privateVideoIcon').innerHTML = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';

        window.privateVideoStream = privateStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        showToast('Erreur accès caméra/micro', 'error');
    }
}

function togglePrivateMute() {
    if (!privateStream) return;

    const audioTrack = privateStream.getAudioTracks()[0];
    if (!audioTrack) return;

    privateIsMuted = !privateIsMuted;
    audioTrack.enabled = !privateIsMuted;

    const btn = document.getElementById('privateMuteBtn');
    const icon = document.getElementById('privateMuteIcon');
    const indicator = document.getElementById('privateLocalMuteIndicator');

    if (privateIsMuted) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        indicator.style.display = 'flex';
    } else {
        btn.style.background = '';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>';
        indicator.style.display = 'none';
    }
}

function togglePrivateVideo() {
    if (!privateStream) return;

    const videoTrack = privateStream.getVideoTracks()[0];
    if (!videoTrack) return;

    privateIsVideoOff = !privateIsVideoOff;
    videoTrack.enabled = !privateIsVideoOff;

    const videoEl = document.getElementById('privateLocalVideo');
    const placeholder = document.getElementById('privateLocalVideoPlaceholder');
    const btn = document.getElementById('privateVideoBtn');
    const icon = document.getElementById('privateVideoIcon');
    const indicator = document.getElementById('privateLocalVideoOffIndicator');

    if (privateIsVideoOff) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';
        indicator.style.display = 'flex';
        if (videoEl) videoEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
    } else {
        btn.style.background = '';
        icon.innerHTML = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>';
        indicator.style.display = 'none';
        if (videoEl) videoEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
}

async function endPrivateSession() {
    if (!currentVideoAppointment) return;

    try {
        await doctorAPI.endVideoSession(currentVideoAppointment.id);

        // Clear call state for real-time sync
        try {
            await appointmentAPI.endCallState();
            localStorage.setItem('doctorInCall', 'false');
            localStorage.removeItem('currentCallAppointment');
        } catch (e) {
            console.log('Call state clear skipped');
        }

        if (privateStream) {
            privateStream.getTracks().forEach(track => track.stop());
            privateStream = null;
        }

        const videoSection = document.getElementById('privateVideoCallSection');
        if (videoSection) {
            videoSection.style.display = 'none';
        }

        stopPrivateCallTimer();
        currentVideoAppointment = null;
        showToast('Session terminée', 'success');

    } catch (error) {
        console.error('Error ending session:', error);
        showToast('Erreur lors de la terminaison', 'error');
    }
}

function getMediaLabel(mediaType) {
    const labels = { 'video': 'Vidéo', 'phone': 'Téléphone', 'chat': 'Chat' };
    return labels[mediaType] || mediaType || '-';
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightCurrentSidebarLink() {
    const currentPage = window.location.pathname.split('/').pop().toLowerCase();
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href) {
            const hrefPage = href.split('/').pop().toLowerCase();
            if (hrefPage === currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        }
    });
}

async function viewPatientProfile(patientId) {
    console.log('viewPatientProfile called with:', patientId);
    
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
        return (now - createdAt) < 60 * 60 * 1000; // Within 1 hour
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
            currentVideoAppointment = {
                id: result.appointment.id,
                patientName: result.urgentRequest.patient?.fullname || 'Patient',
                patientId: result.urgentRequest.patient?.id
            };
            showVideoCallUI({
                id: result.appointment.id,
                patientName: result.urgentRequest.patient?.fullname || 'Patient',
                patientId: result.urgentRequest.patient?.id,
                appointmentTime: result.urgentRequest.appointmentTime || 'Maintenant'
            });
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
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.viewPatientProfile = viewPatientProfile;
window.closePatientModal = closePatientModal;
window.togglePrivateMute = togglePrivateMute;
window.togglePrivateVideo = togglePrivateVideo;
window.endPrivateSession = endPrivateSession;
window.togglePrivateChat = togglePrivateChat;
window.sendPrivateMessage = sendPrivateMessage;
window.handlePrivateChatKeyPress = handlePrivateChatKeyPress;
window.togglePrivateEmojiPicker = togglePrivateEmojiPicker;
window.insertPrivateEmoji = insertPrivateEmoji;
window.clearPrivateChat = clearPrivateChat;

function togglePrivateChat() {
    const chatSection = document.getElementById('privateChatSection');
    const btn = document.getElementById('privateChatToggleBtn');
    if (chatSection.style.display === 'none') {
        chatSection.style.display = 'flex';
        if (btn) btn.classList.add('active');
    } else {
        chatSection.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

async function loadPrivateChatHistory(patientId) {
    try {
        const response = await fetch('http://localhost:3000/api/messages/with/' + patientId, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('nebras_token') }
        });
        const messages = await response.json();
        const container = document.getElementById('privateMessagesContainer');
        if (!container) return;
        
        const currentUser = getCurrentUser();
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="no-messages" style="text-align: center; padding: 20px; color: #9CA3AF;">Aucun message</div>';
            return;
        }
        
        container.innerHTML = messages.map(msg => `
            <div class="message ${msg.senderId === currentUser.id ? 'sent' : 'received'}">
                <div class="message-content">${escapeHtml(msg.content)}</div>
                <div class="message-time">${new Date(msg.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('Error loading chat history:', e);
    }
}

async function sendPrivateMessage() {
    const input = document.getElementById('privateChatInput');
    const content = input?.value.trim();
    if (!content || !currentVideoAppointment) return;
    
    try {
        await fetch('http://localhost:3000/api/messages', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('nebras_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiverId: currentVideoAppointment.patientId,
                content: content
            })
        });
        
        input.value = '';
        loadPrivateChatHistory(currentVideoAppointment.patientId);
    } catch (e) {
        console.error('Error sending message:', e);
    }
}

function handlePrivateChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendPrivateMessage();
    }
}

function togglePrivateEmojiPicker() {
    const picker = document.getElementById('privateEmojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'grid' : 'none';
}

function insertPrivateEmoji(emoji) {
    const input = document.getElementById('privateChatInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    document.getElementById('privateEmojiPicker').style.display = 'none';
}

function clearPrivateChat() {
    const container = document.getElementById('privateMessagesContainer');
    if (container) {
        container.innerHTML = '<div class="no-messages" style="text-align: center; padding: 20px; color: #9CA3AF;">Aucun message</div>';
    }
}

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