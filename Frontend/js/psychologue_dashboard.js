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
        const dashboard = await doctorAPI.getDashboard();
        currentDoctor = { ...currentDoctor, profile: dashboard };
        
        updateStats(dashboard.stats);
        renderTodaySessions(dashboard.todaySessions);
        renderPendingRequests(dashboard.pendingRequests);
        renderUpcomingAppointments(dashboard.upcomingAppointments);
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateStats(stats) {
    const statCards = document.querySelectorAll('.stat-card');
    if (statCards.length >= 4) {
        statCards[0].querySelector('h3').textContent = stats.activePatients || 0;
        statCards[0].querySelector('p').textContent = 'Patients actifs';
        
        statCards[1].querySelector('h3').textContent = stats.todaySessionsCount || 0;
        statCards[1].querySelector('p').textContent = "Séances aujourd'hui";
        
        statCards[2].querySelector('h3').textContent = stats.pendingRequestsCount || 0;
        statCards[2].querySelector('p').textContent = 'Demandes en attente';
        
        const income = stats.monthlyIncome || 0;
        statCards[3].querySelector('h3').textContent = income.toLocaleString('fr-FR') + ' DA';
        statCards[3].querySelector('p').textContent = 'Revenus du mois';
    }
}

function renderTodaySessions(sessions) {
    const sessionsList = document.querySelector('.seances-list');
    if (!sessionsList) return;
    
    if (!sessions || sessions.length === 0) {
        sessionsList.innerHTML = '<div class="empty-state"><p>Aucune séance prévue aujourd\'hui</p></div>';
        return;
    }
    
    sessionsList.innerHTML = sessions.map(apt => {
        const statusClass = apt.status === 'confirmed' ? 'a-venir' : 'en-cours';
        const statusText = apt.status === 'confirmed' ? 'Confirmé' : 'En attente';
        const mediaIcon = getMediaIcon(apt.mediaType);
        return `
            <div class="seance-card">
                <div class="seance-time">${apt.appointmentTime}</div>
                <div class="seance-info">
                    <h4>${apt.patientName || 'Patient'}</h4>
                    <p>${mediaIcon} ${getMediaLabel(apt.mediaType)} · ${apt.notes || ''}</p>
                </div>
                <div class="seance-status ${statusClass}">${statusText}</div>
                <button class="seance-btn" onclick="startSession('${apt.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg> ${apt.status === 'confirmed' ? 'Démarrer' : 'Préparer'}
                </button>
            </div>
        `;
    }).join('');
}

function renderPendingRequests(requests) {
    const demandesList = document.querySelector('.demandes-list');
    if (!demandesList) return;
    
    if (!requests || requests.length === 0) {
        demandesList.innerHTML = '<div class="empty-state"><p>Aucune demande en attente</p></div>';
        return;
    }
    
    demandesList.innerHTML = requests.map(apt => `
        <div class="demande-card">
            <div class="demande-info">
                <h4>${apt.patientName || 'Patient'}</h4>
                <p>Motif: ${apt.motifs || 'Non spécifié'} · Préférence: ${getMediaLabel(apt.mediaType)}</p>
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

function renderUpcomingAppointments(appointments) {
    const rdvList = document.querySelector('.rdv-list');
    if (!rdvList) return;
    
    if (!appointments || appointments.length === 0) {
        rdvList.innerHTML = '<div class="empty-state"><p>Aucun rendez-vous à venir</p></div>';
        return;
    }
    
    rdvList.innerHTML = appointments.map(apt => `
        <div class="rdv-item">
            <div class="rdv-date">${formatDate(apt.appointmentDate)}</div>
            <div class="rdv-info">
                <span>${apt.appointmentTime} - ${apt.patientName || 'Patient'}</span>
                <span class="rdv-type">${getMediaLabel(apt.mediaType)}</span>
            </div>
        </div>
    `).join('');
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

// Notification Functions
let notifications = [];
let unreadCount = 0;

async function loadNotifications() {
    try {
        // Get dashboard data which includes pending requests
        const dashboard = await doctorAPI.getDashboard();
        
        // Convert pending requests to notifications
        notifications = [];
        
        // Add pending request notifications
        if (dashboard.pendingRequests && dashboard.pendingRequests.length > 0) {
            dashboard.pendingRequests.forEach(req => {
                notifications.push({
                    id: req.id,
                    type: 'request',
                    title: 'Nouvelle demande de consultation',
                    message: `${req.patientName} demande une consultation`,
                    time: req.createdAt,
                    read: false
                });
            });
        }
        
        // Update badge
        unreadCount = notifications.filter(n => !n.read).length;
        updateNotificationBadge();
        
        // Render notifications
        renderNotifications();
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Export for HTML inline calls
window.loadNotificationsFromDashboard = loadNotifications;

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">Aucune notification</div>';
        return;
    }
    
    list.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.type}')">
            <div class="notification-item-title">${n.title}</div>
            <div class="notification-item-message">${n.message}</div>
            <div class="notification-item-time">${formatTimeAgo(n.time)}</div>
        </div>
    `).join('');
}

function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `Il y a ${minutes}min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return formatDate(dateStr);
}

function toggleNotifications(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        loadNotifications();
    }
}

function handleNotificationClick(notificationId, type) {
    // Mark as read
    const notif = notifications.find(n => n.id === notificationId);
    if (notif && !notif.read) {
        notif.read = true;
        unreadCount--;
        updateNotificationBadge();
        renderNotifications();
    }
    
    // Close dropdown
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.remove('show');
    
    // If it's a request, redirect to pending requests
    if (type === 'request') {
        // Scroll to pending requests section
        const demandesSection = document.querySelector('.demandes-list');
        if (demandesSection) {
            demandesSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

function markAllRead(event) {
    event.stopPropagation();
    notifications.forEach(n => n.read = true);
    unreadCount = 0;
    updateNotificationBadge();
    renderNotifications();
    showToast('Toutes les notifications marquées comme lues', 'success');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('notificationDropdown');
    const container = document.querySelector('.notification-container');
    if (container && !container.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

window.acceptRequest = acceptRequest;
window.refuseRequest = refuseRequest;
window.startSession = startSession;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;
window.toggleNotifications = toggleNotifications;
window.markAllRead = markAllRead;
window.handleNotificationClick = handleNotificationClick;

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