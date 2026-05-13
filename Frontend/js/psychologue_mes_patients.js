let patients = [];
let filteredPatients = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }

    await loadPatients();
    highlightCurrentSidebarLink();
});

async function loadPatients() {
    try {
        const result = await doctorAPI.getPatients();
        
        patients = result.patients || [];
        filteredPatients = [...patients];
        
        renderPatients();
        updateBadge();

    } catch (error) {
        console.error('Error loading patients:', error);
        showToast('Erreur lors du chargement des patients', 'error');
    }
}

function renderPatients() {
    const grid = document.getElementById('patientsGrid');
    if (!grid) return;

    if (filteredPatients.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>Aucun patient trouvé</p></div>';
        return;
    }

    grid.innerHTML = filteredPatients.map(patient => `
        <div class="patient-card" onclick="viewPatientNotes('${patient.id}')">
            <div class="patient-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                </svg>
            </div>
            <div class="patient-info">
                <h3>${patient.fullname}</h3>
                <p class="patient-meta">
                    <span>${patient.totalSessions} séance${patient.totalSessions > 1 ? 's' : ''}</span>
                    <span class="separator">•</span>
                    <span>Dernière: ${formatDate(patient.lastSession)}</span>
                </p>
            </div>
            <div class="patient-actions">
                <button class="action-btn-small" onclick="event.stopPropagation(); viewPatientNotes('${patient.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function filterPatients() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const motifFilter = document.getElementById('filterMotif')?.value || '';
    const dateFilter = document.getElementById('filterDate')?.value || '';

    filteredPatients = patients.filter(patient => {
        const matchesSearch = !searchTerm || patient.fullname.toLowerCase().includes(searchTerm);
        const matchesMotif = !motifFilter || patient.motif?.includes(motifFilter);
        
        let matchesDate = true;
        if (dateFilter) {
            const lastSession = new Date(patient.lastSession);
            const now = new Date();
            const daysDiff = Math.floor((now - lastSession) / (1000 * 60 * 60 * 24));
            matchesDate = daysDiff <= parseInt(dateFilter);
        }

        return matchesSearch && matchesMotif && matchesDate;
    });

    renderPatients();
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterMotif').value = '';
    document.getElementById('filterDate').value = '';
    filteredPatients = [...patients];
    renderPatients();
}

function viewPatientNotes(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;

    document.getElementById('notesModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const genderLabel = { 'male': 'Homme', 'female': 'Femme', 'other': 'Autre' };
    const prefGenderLabel = { 'male': 'Homme', 'female': 'Femme', 'no-preference': 'Aucune préférence' };
    
    const profileContent = `
        <div class="patient-profile-grid" style="display: grid; gap: 15px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <h4 style="margin: 0 0 10px 0; color: #091346;">Informations personnelles</h4>
                <p><strong>Nom:</strong> ${escapeHtml(patient.fullname)}</p>
                <p><strong>Email:</strong> ${escapeHtml(patient.email || 'Non spécifié')}</p>
                <p><strong>Téléphone:</strong> ${escapeHtml(patient.phone || 'Non spécifié')}</p>
                <p><strong>Genre:</strong> ${genderLabel[patient.gender] || 'Non spécifié'}</p>
                <p><strong>Date de naissance:</strong> ${patient.birthDate ? formatDate(patient.birthDate) : 'Non spécifiée'}</p>
                <p><strong>Langue:</strong> ${escapeHtml(patient.language || 'Non spécifiée')}</p>
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
                <h4 style="margin: 0 0 10px 0;">Historique des séances</h4>
                <p><strong>Total des séances:</strong> ${patient.totalSessions}</p>
                <p><strong>Dernière séance:</strong> ${formatDate(patient.lastSession)}</p>
                <p><strong>Première séance:</strong> ${formatDate(patient.firstSession)}</p>
            </div>
        </div>
    `;
    
    document.getElementById('patientProfileContent').innerHTML = profileContent;
    window.currentPatientId = patientId;
}

function closeNotesModal() {
    document.getElementById('notesModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function addNote() {
    const noteText = document.getElementById('newNoteText')?.value.trim();
    if (!noteText) {
        showToast('Veuillez entrer une note', 'error');
        return;
    }
    
    showToast('Note ajoutée (fonctionnalité en cours)', 'info');
    document.getElementById('newNoteText').value = '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function updateBadge() {
    const badge = document.querySelector('.nav-item[href="psychologue_mes_patients.html"] .badge');
    if (badge) {
        badge.textContent = patients.length;
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.filterPatients = filterPatients;
window.resetFilters = resetFilters;
window.viewPatientNotes = viewPatientNotes;
window.closeNotesModal = closeNotesModal;
window.addNote = addNote;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;
window.escapeHtml = escapeHtml;

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