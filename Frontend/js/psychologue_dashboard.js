let currentDoctor = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    currentDoctor = getCurrentUser();
    if (currentDoctor) {
        const name = currentDoctor.fullname || currentDoctor.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
        
        const greeting = document.querySelector('.page-header h1');
        if (greeting && greeting.textContent.includes('Bonjour')) {
            greeting.textContent = 'Bonjour, ' + name;
        }
    }

    await loadDashboardData();
    highlightCurrentSidebarLink();
});

async function loadDashboardData() {
    try {
        const profile = await doctorAPI.getMyProfile();
        currentDoctor = { ...currentDoctor, profile: profile };
        
        updateStats();
        await loadTodaySessions();
        await loadPendingRequests();
        await loadUpcomingAppointments();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateStats() {
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 4) {
        statCards[0].querySelector('h3').textContent = '0';
        statCards[0].querySelector('p').textContent = 'Patients actifs';
        
        statCards[1].querySelector('h3').textContent = '0';
        statCards[1].querySelector('p').textContent = 'Séances aujourd\'hui';
        
        statCards[2].querySelector('h3').textContent = '0';
        statCards[2].querySelector('p').textContent = 'Demandes en attente';
        
        statCards[3].querySelector('h3').textContent = '0 DA';
        statCards[3].querySelector('p').textContent = 'Revenus du mois';
    }
}

async function loadTodaySessions() {
    try {
        const appointments = await appointmentAPI.getAll();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayAppointments = appointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate);
            return aptDate >= today && aptDate < tomorrow && 
                   (apt.status === 'confirmed' || apt.status === 'pending');
        });

        const sessionsList = document.querySelector('.seances-list');
        if (sessionsList) {
            if (todayAppointments.length === 0) {
                sessionsList.innerHTML = '<div class="empty-state"><p>Aucune séance prévue aujourd\'hui</p></div>';
            } else {
                sessionsList.innerHTML = todayAppointments.map(apt => {
                    const status = apt.status === 'confirmed' ? 'Confirmé' : 'En attente';
                    const statusClass = apt.status === 'confirmed' ? 'a-venir' : 'en-cours';
                    const mediaIcon = getMediaIcon(apt.mediaType);
                    return `
                        <div class="seance-card">
                            <div class="seance-time">${apt.appointmentTime}</div>
                            <div class="seance-info">
                                <h4>${apt.patient?.fullname || 'Patient'}</h4>
                                <p>${mediaIcon} ${getMediaLabel(apt.mediaType)}</p>
                            </div>
                            <div class="seance-status ${statusClass}">${status}</div>
                            <button class="seance-btn" onclick="startSession('${apt.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                    <polygon points="5 3 19 12 5 21 5 3"/>
                                </svg> ${apt.status === 'confirmed' ? 'Démarrer' : 'Préparer'}
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }

        const todayCount = todayAppointments.length;
        const statCards = document.querySelectorAll('.stat-card');
        if (statCards[1]) {
            statCards[1].querySelector('h3').textContent = todayCount;
        }

    } catch (error) {
        console.error('Error loading today sessions:', error);
    }
}

async function loadPendingRequests() {
    try {
        const appointments = await appointmentAPI.getAll();
        const pending = appointments.filter(apt => apt.status === 'pending');

        const demandesList = document.querySelector('.demandes-list');
        if (demandesList) {
            if (pending.length === 0) {
                demandesList.innerHTML = '<div class="empty-state"><p>Aucune demande en attente</p></div>';
            } else {
                demandesList.innerHTML = pending.map(apt => `
                    <div class="demande-card">
                        <div class="demande-info">
                            <h4>${apt.patient?.fullname || 'Patient'}</h4>
                            <p>Motif: Non spécifié · Préférence: ${getMediaLabel(apt.mediaType)}</p>
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
                `).join('');
            }
        }

        const statCards = document.querySelectorAll('.stat-card');
        if (statCards[2]) {
            statCards[2].querySelector('h3').textContent = pending.length;
        }

    } catch (error) {
        console.error('Error loading pending requests:', error);
    }
}

async function loadUpcomingAppointments() {
    try {
        const appointments = await appointmentAPI.getAll();
        const now = new Date();
        
        const upcoming = appointments
            .filter(apt => new Date(apt.appointmentDate) >= now && apt.status === 'confirmed')
            .slice(0, 5);

        const rdvList = document.querySelector('.rdv-list');
        if (rdvList) {
            if (upcoming.length === 0) {
                rdvList.innerHTML = '<div class="empty-state"><p>Aucun rendez-vous à venir</p></div>';
            } else {
                rdvList.innerHTML = upcoming.map(apt => `
                    <div class="rdv-item">
                        <div class="rdv-date">${formatDate(apt.appointmentDate)}</div>
                        <div class="rdv-info">
                            <span>${apt.appointmentTime} - ${apt.patient?.fullname || 'Patient'}</span>
                            <span class="rdv-type">${getMediaLabel(apt.mediaType)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }

    } catch (error) {
        console.error('Error loading upcoming appointments:', error);
    }
}

async function acceptRequest(appointmentId) {
    try {
        await appointmentAPI.updateStatus(appointmentId, { status: 'confirmed' });
        showToast('Demande acceptée!', 'success');
        await loadDashboardData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

async function refuseRequest(appointmentId) {
    if (!confirm('Êtes-vous sûr de vouloir refuser cette demande?')) return;
    
    try {
        await appointmentAPI.updateStatus(appointmentId, { status: 'cancelled' });
        showToast('Demande refusée', 'success');
        await loadDashboardData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function startSession(appointmentId) {
    showToast('Démarrage de la séance...', 'info');
}

function getMediaLabel(mediaType) {
    const labels = { 'video': 'Vidéo', 'phone': 'Téléphone', 'chat': 'Chat' };
    return labels[mediaType] || mediaType;
}

function getMediaIcon(mediaType) {
    const icons = {
        'video': '📹',
        'phone': '📞',
        'chat': '💬'
    };
    return icons[mediaType] || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function highlightCurrentSidebarLink() {
    const currentPage = window.location.pathname.split('/').pop().toLowerCase();
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href')?.split('/').pop().toLowerCase();
        if (href && href === currentPage) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

window.acceptRequest = acceptRequest;
window.refuseRequest = refuseRequest;
window.startSession = startSession;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;

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