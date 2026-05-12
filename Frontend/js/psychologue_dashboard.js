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
    highlightCurrentSidebarLink();
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
        const [dashboard, patientsResult] = await Promise.all([
            doctorAPI.getDashboard(),
            doctorAPI.getPatients()
        ]);
        
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
                <button class="accept-btn" onclick="acceptRequest('${apt.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg> Accepter
                </button>
                <button class="refuse-btn" onclick="refuseRequest('${apt.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg> Refuser
                </button>
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

function startSession(appointmentId) {
    const sessionData = {
        appointmentId: appointmentId,
        prepared: true,
        timestamp: new Date().toISOString()
    };
    sessionStorage.setItem('currentSession', JSON.stringify(sessionData));
    showToast('Séance préparée! Vous pouvez commencer.', 'success');
    setTimeout(() => {
        window.location.href = 'psychologue_messagerie.html?session=' + appointmentId;
    }, 1000);
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

window.acceptRequest = acceptRequest;
window.refuseRequest = refuseRequest;
window.startSession = startSession;
window.showToast = showToast;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
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