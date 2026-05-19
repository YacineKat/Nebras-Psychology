let appointments = [];
let activeFilters = {
    media: '',
    status: '',
    dateRange: '',
    doctor: ''
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'patient') {
        redirectByUserType(getUserType());
        return;
    }

    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }

    await loadAppointments();
    setupFilters();
    highlightCurrentSidebarLink();

    setInterval(() => {
        renderAppointments();
        updateBadge();
    }, 60000);
});

function setupFilters() {
    const mediaFilter = document.getElementById('filterMedia');
    const statusFilter = document.getElementById('filterStatus');
    const dateFilter = document.getElementById('filterDateRange');
    const doctorFilter = document.getElementById('filterDoctor');
    const historyStatusFilter = document.getElementById('filterHistoryStatus');

    if (mediaFilter) mediaFilter.addEventListener('change', (e) => {
        activeFilters.media = e.target.value;
        renderAppointments();
    });

    if (statusFilter) statusFilter.addEventListener('change', (e) => {
        activeFilters.status = e.target.value;
        renderAppointments();
    });

    if (dateFilter) dateFilter.addEventListener('change', (e) => {
        activeFilters.dateRange = e.target.value;
        renderAppointments();
    });

    if (doctorFilter) doctorFilter.addEventListener('change', (e) => {
        activeFilters.doctor = e.target.value;
        renderAppointments();
    });

    if (historyStatusFilter) historyStatusFilter.addEventListener('change', (e) => {
        activeFilters.status = e.target.value;
        renderAppointments();
    });
}

async function loadAppointments() {
    try {
        const result = await appointmentAPI.getAll();
        appointments = result || [];
        populateDoctorFilter();
        renderAppointments();
        updateBadge();
    } catch (error) {
        console.error('Error loading appointments:', error);
        showToast('Erreur lors du chargement des rendez-vous', 'error');
    }
}

function getAppointmentScheduledDateTime(apt) {
    if (!apt?.appointmentDate) return null;

    const baseDate = new Date(apt.appointmentDate);
    if (Number.isNaN(baseDate.getTime())) return null;

    if (!apt.appointmentTime) return baseDate;

    const [hours, minutes] = apt.appointmentTime.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return baseDate;

    const scheduledDateTime = new Date(baseDate);
    scheduledDateTime.setHours(hours, minutes, 0, 0);
    return scheduledDateTime;
}

function isAppointmentInHistory(apt, now = new Date()) {
    if (apt.status === 'completed' || apt.status === 'cancelled') return true;

    const scheduledDateTime = getAppointmentScheduledDateTime(apt);
    if (!scheduledDateTime) return false;

    const historyThreshold = new Date(scheduledDateTime);
    historyThreshold.setHours(historyThreshold.getHours() + 1);

    return now >= historyThreshold;
}

function populateDoctorFilter() {
    const doctorFilter = document.getElementById('filterDoctor');
    if (!doctorFilter) return;

    const doctors = [...new Set(appointments.map(apt => apt.doctor?.fullname).filter(Boolean))];
    
    doctorFilter.innerHTML = '<option value="">Tous les psychologues</option>' + 
        doctors.map(doc => `<option value="${doc}">${doc}</option>`).join('');
}

function renderAppointments() {
    const tbody = document.querySelector('#tab-rendezvous .rdv-table tbody');
    const historyBody = document.querySelector('#tab-historique .rdv-table tbody');
    
    if (!tbody || !historyBody) return;

    const now = new Date();
    
    let upcomingAppointments = appointments.filter(apt => {
        return !isAppointmentInHistory(apt, now);
    });
    
    let pastAppointments = appointments.filter(apt => {
        return isAppointmentInHistory(apt, now);
    });

    // Apply upcoming filters
    if (activeFilters.media) {
        upcomingAppointments = upcomingAppointments.filter(apt => apt.mediaType === activeFilters.media);
    }
    if (activeFilters.status) {
        upcomingAppointments = upcomingAppointments.filter(apt => apt.status === activeFilters.status);
    }

    // Apply history filters
    if (activeFilters.dateRange) {
        pastAppointments = filterByDateRange(pastAppointments, activeFilters.dateRange);
    }
    if (activeFilters.doctor) {
        pastAppointments = pastAppointments.filter(apt => apt.doctor?.fullname?.toLowerCase().includes(activeFilters.doctor.toLowerCase()));
    }

    tbody.innerHTML = upcomingAppointments.length === 0 
        ? '<tr><td colspan="7" class="empty-state"><p>Aucun rendez-vous à venir.</p></td></tr>'
        : upcomingAppointments.map(apt => renderAppointmentRow(apt)).join('');

    historyBody.innerHTML = pastAppointments.length === 0
        ? '<tr><td colspan="8" class="empty-state"><p>Aucun rendez-vous dans l\'historique.</p></td></tr>'
        : pastAppointments.map(apt => renderHistoryRow(apt)).join('');
}

function filterByDateRange(appointments, range) {
    const now = new Date();
    return appointments.filter(apt => {
        const aptDate = new Date(apt.appointmentDate);
        if (range === 'thisMonth') {
            return aptDate.getMonth() === now.getMonth() && aptDate.getFullYear() === now.getFullYear();
        } else if (range === 'last3months') {
            const threeMonthsAgo = new Date(now);
            threeMonthsAgo.setMonth(now.getMonth() - 3);
            return aptDate >= threeMonthsAgo;
        }
        return true;
    });
}

function renderAppointmentRow(apt) {
    const statusClass = getStatusClass(apt.status);
    const statusText = getStatusText(apt.status);
    const mediaIcon = getMediaIcon(apt.mediaType);
    const mediaLabel = getMediaLabel(apt.mediaType);
    const dateStr = formatDate(apt.appointmentDate);
    const doctorName = apt.doctor?.fullname || 'Psychologue';

    return `
        <tr>
            <td><span class="media-badge">${mediaIcon} ${mediaLabel}</span></td>
            <td><strong>${doctorName}</strong></td>
            <td><div style="display: flex; flex-direction: column;"><span>${dateStr}</span><span style="color: #888; font-size: 12px;">${apt.appointmentTime}</span></div></td>
            <td style="color: #888;">${formatDate(apt.createdAt)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                ${apt.status === 'pending' ? `<button class="action-btn danger" onclick="cancelAppointment('${apt.id}')">Annuler</button>` : '<span style="color: #ccc;">-</span>'}
            </td>
        </tr>
    `;
}

function renderHistoryRow(apt) {
    const statusClass = getStatusClass(apt.status);
    const statusText = getStatusText(apt.status);
    const mediaIcon = getMediaIcon(apt.mediaType);
    const mediaLabel = getMediaLabel(apt.mediaType);
    const dateStr = formatDate(apt.appointmentDate);
    const doctorName = apt.doctor?.fullname || 'Psychologue';

    return `
        <tr>
            <td><span class="media-badge">${mediaIcon} ${mediaLabel}</span></td>
            <td><strong>${doctorName}</strong></td>
            <td><div style="display: flex; flex-direction: column;"><span>${dateStr}</span><span style="color: #888; font-size: 12px;">${apt.appointmentTime}</span></div></td>
            <td style="color: #888;">${formatDate(apt.createdAt)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td style="color: #666; font-size: 13px;">${apt.notes || '<span style="color: #ccc;">-</span>'}</td>
        </tr>
    `;
}

function getStatusClass(status) {
    const classes = {
        'pending': 'status-pending',
        'confirmed': 'status-confirmed',
        'completed': 'status-completed',
        'cancelled': 'status-cancelled'
    };
    return classes[status] || 'status-pending';
}

function getStatusText(status) {
    const texts = {
        'pending': 'En attente',
        'confirmed': 'Confirmé',
        'completed': 'Terminé',
        'cancelled': 'Annulé'
    };
    return texts[status] || 'En attente';
}

function getMediaLabel(mediaType) {
    const labels = {
        'video': 'Vidéo',
        'phone': 'Téléphone',
        'chat': 'Chat'
    };
    return labels[mediaType] || mediaType;
}

function getMediaIcon(mediaType) {
    const icons = {
        'video': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
        'phone': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
        'chat': '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>'
    };
    return icons[mediaType] || '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function updateBadge() {
    const pendingCount = appointments.filter(apt => apt.status === 'pending' && !isAppointmentInHistory(apt)).length;
    const badge = document.querySelector('.nav-item[href="patient_rendez_vous.html"] .badge');
    if (badge) {
        badge.textContent = pendingCount;
    }
}

async function cancelAppointment(appointmentId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler ce rendez-vous?')) return;

    try {
        await appointmentAPI.cancel(appointmentId);
        showToast('Rendez-vous annulé', 'success');
        await loadAppointments();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
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

window.cancelAppointment = cancelAppointment;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;

const tabs = document.querySelectorAll('.rdv-tab');
const contents = document.querySelectorAll('.rdv-tab-content');

tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        contents[index].classList.add('active');
    });
});