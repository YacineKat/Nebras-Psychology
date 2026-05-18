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
        grid.innerHTML = `
            <div class="empty-state-container" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; background: white; border-radius: 16px; border: 1px dashed var(--border-color); text-align: center;">
                <div style="width: 80px; height: 80px; background: rgba(68, 170, 153, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-green)" stroke-width="1.5" width="40" height="40">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <line x1="17" y1="8" x2="23" y2="8"></line>
                        <line x1="20" y1="5" x2="20" y2="11"></line>
                    </svg>
                </div>
                <h3 style="color: var(--primary-dark); font-size: 20px; margin: 0 0 8px 0;">Aucun patient trouvé</h3>
                <p style="color: var(--text-light); margin: 0; max-width: 300px;">Essayez de modifier vos filtres de recherche ou réinitialisez-les pour voir la liste complète.</p>
            </div>`;
        return;
    }

    grid.innerHTML = filteredPatients.map(patient => {
        let maxStr = patient.avatar || patient.profilePicture;
        let avatarUrl = '';
        if (maxStr) {
            avatarUrl = maxStr.startsWith('http') || maxStr.startsWith('data:')
                ? maxStr
                : (window.API_URL ? window.API_URL.replace('/api', '') + maxStr : maxStr);
        }

        const patientMotif = patient.motifs || patient.motif;

        return `
        <div class="patient-card" onclick="viewPatientNotes('${patient.id}')">
            <div class="patient-avatar">
                ${avatarUrl
                    ? `<img src="${avatarUrl}" alt="${patient.fullname}" class="avatar-img" onerror="this.onerror=null; this.outerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#44AA99\\' stroke-width=\\'1.5\\' width=\\'28\\' height=\\'28\\'><circle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/><path d=\\'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2\\'/></svg>'">`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="1.5" width="28" height="28">
                        <circle cx="12" cy="8" r="4"/>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    </svg>`
                }
            </div>
            <div class="patient-info">
                <h3>${patient.fullname}</h3>
                ${patientMotif ? `<div class="patient-motif-pill">${patientMotif}</div>` : ''}
                <div class="patient-meta-wrapper">
                    <p class="patient-meta">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span>${patient.totalSessions || 0} séance${patient.totalSessions > 1 ? 's' : ''}</span>
                    </p>
                    <p class="patient-meta">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>Dernière: ${patient.lastSession ? formatDate(patient.lastSession) : 'Aucune'}</span>
                    </p>
                </div>
            </div>
            <div class="patient-actions">
                <button class="action-btn-small btn-view-notes" onclick="event.stopPropagation(); viewPatientNotes('${patient.id}')" title="Voir le profil">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>
    `}).join('');
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

async function viewPatientNotes(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;

    document.getElementById('notesModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    window.currentPatientNotes = [];
    try {
        const data = await doctorAPI.getPatientNote(patientId);
        if (data && data.notes) {
            window.currentPatientNotes = data.notes;
        } else if (data && data.content) {
            window.currentPatientNotes = [{ content: data.content, createdAt: data.updatedAt || new Date() }];
        }
    } catch (e) {
        console.warn('Could not fetch patient notes:', e);
    }

    const genderLabel = { 'male': 'Homme', 'female': 'Femme', 'other': 'Autre' };
    const prefGenderLabel = { 'male': 'Homme', 'female': 'Femme', 'no-preference': 'Aucune préférence' };

    const profileContent = `
        <div class="patient-profile-tabs">
            <button class="patient-tab-btn active" onclick="switchPatientTab('info')">Informations</button>
            <button class="patient-tab-btn" onclick="switchPatientTab('notes')">Notes cliniques <span class="notes-indicator" style="display: ${window.currentPatientNotes.length > 0 ? 'inline-block' : 'none'}"></span></button>
        </div>

        <div id="patient-tab-info" class="patient-tab-content active-content">
            <div class="patient-profile-grid" style="display: grid; gap: 15px; padding: 5px;">
                <div style="background: white; border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.02); padding: 18px; border-radius: 12px; transition: transform 0.2s;">
                    <h4 style="margin: 0 0 12px 0; color: var(--primary-dark); display: flex; align-items: center; gap: 8px; font-size: 16px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="8" r="4"/></svg>
                        Informations personnelles
                    </h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px; color: var(--text-dark);">
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Nom:</strong><br/>${escapeHtml(patient.fullname)}</p>
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Email:</strong><br/>${escapeHtml(patient.email || 'Non spécifié')}</p>
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Téléphone:</strong><br/>${escapeHtml(patient.phone || 'Non spécifié')}</p>
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Genre:</strong><br/>${genderLabel[patient.gender] || 'Non spécifié'}</p>
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Date de naissance:</strong><br/>${patient.birthDate ? formatDate(patient.birthDate) : 'Non spécifiée'}</p>
                        <p style="margin: 0;"><strong style="color: var(--text-light); font-weight: 500;">Langue:</strong><br/>${escapeHtml(patient.language || 'Non spécifiée')}</p>
                    </div>
                </div>

                <div style="background: white; border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.02); padding: 18px; border-radius: 12px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--primary-dark); display: flex; align-items: center; gap: 8px; font-size: 16px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Motif de consultation
                    </h4>
                    <p style="margin: 0; color: #4b5563; background: #f8f9fb; padding: 12px; border-radius: 8px; font-size: 14px; border-left: 3px solid var(--primary-green);">
                        ${escapeHtml(patient.motifs || patient.motif || 'Non spécifié')}
                    </p>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="background: white; border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.02); padding: 18px; border-radius: 12px;">
                        <h4 style="margin: 0 0 12px 0; color: var(--primary-dark); display: flex; align-items: center; gap: 8px; font-size: 16px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            Préférences
                        </h4>
                        <p style="margin: 0 0 8px 0; font-size: 14px;"><strong style="color: var(--text-light); font-weight: 500;">Praticien:</strong><br/>${prefGenderLabel[patient.prefGender] || 'Aucune préférence'}</p>
                        <p style="margin: 0; font-size: 14px;"><strong style="color: var(--text-light); font-weight: 500;">Type:</strong><br/>${patient.prefType === 'video' ? 'Vidéo' : patient.prefType === 'phone' ? 'Téléphone' : patient.prefType === 'chat' ? 'Chat' : 'Non spécifié'}</p>
                    </div>
                    <div style="background: var(--primary-green); color: white; border: 1px solid var(--border-color); box-shadow: 0 4px 12px rgba(68, 170, 153, 0.2); padding: 18px; border-radius: 12px;">
                        <h4 style="margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; font-size: 16px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Séances
                        </h4>
                        <p style="margin: 0 0 8px 0; font-size: 14px; color: rgba(255,255,255,0.9);"><strong style="color: white; font-weight: 600;">Total:</strong><br/>${patient.totalSessions || 0} séances</p>
                        <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9);"><strong style="color: white; font-weight: 600;">Dernière:</strong><br/>${patient.lastSession ? formatDate(patient.lastSession) : 'Aucune'}</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="patient-tab-notes" class="patient-tab-content" style="display: none; padding: 5px;">
            <div style="display: flex; flex-direction: column; gap: 15px; height: 100%;">

                <div style="background: white; border: 1px solid var(--border-color); padding: 15px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                    <textarea id="patient-private-notes" placeholder="Rédigez une nouvelle note clinique pour ce patient..." style="width: 100%; min-height: 100px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; resize: vertical; font-family: inherit; font-size: 14px; color: var(--text-dark); background: #f8f9fb; outline: none; transition: border-color 0.3s; margin-bottom: 12px;"></textarea>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span id="note-save-status" style="font-size: 13px; color: var(--primary-green); opacity: 0; transition: opacity 0.3s;">Note ajoutée ✓</span>
                        <button onclick="addPatientNote('${patientId}')" style="background: var(--primary-green); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(68, 170, 153, 0.2); transition: all 0.2s;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            Ajouter la note
                        </button>
                    </div>
                </div>

                <div id="notes-timeline" style="display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 500px; padding-right: 5px;" class="custom-scrollbar-light">
                </div>

            </div>
        </div>
    `;

    document.getElementById('patientProfileContent').innerHTML = profileContent;

    renderNotesTimeline(window.currentPatientNotes);

    window.currentPatientId = patientId;
}

function renderNotesTimeline(notes) {
    const timelineEl = document.getElementById('notes-timeline');
    if (!timelineEl) return;

    if (notes.length === 0) {
        timelineEl.innerHTML = '<p style="text-align: center; color: var(--text-light); font-size: 14px; padding: 20px;">Aucune note existante pour ce patient.</p>';
        return;
    }

    timelineEl.innerHTML = notes.map(note => {
        const dateObj = new Date(note.createdAt);
        const dateStr = dateObj.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        return `
            <div style="background: white; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                    <span style="font-size: 13px; font-weight: 600; color: var(--text-light); display: flex; align-items: center; gap: 6px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        ${dateStr} à ${timeStr}
                    </span>
                </div>
                <div style="font-size: 14px; color: var(--text-dark); white-space: pre-wrap; line-height: 1.6;">${escapeHtml(note.content)}</div>
            </div>
        `;
    }).join('');
}

function switchPatientTab(tabName) {
    document.querySelectorAll('.patient-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.patient-tab-content').forEach(content => content.style.display = 'none');

    if (tabName === 'info') {
        document.querySelector('.patient-tab-btn:nth-child(1)').classList.add('active');
        document.getElementById('patient-tab-info').style.display = 'block';
    } else {
        document.querySelector('.patient-tab-btn:nth-child(2)').classList.add('active');
        document.getElementById('patient-tab-notes').style.display = 'block';
        document.getElementById('patient-private-notes').focus();
    }
}

async function addPatientNote(patientId) {
    const textarea = document.getElementById('patient-private-notes');
    const content = textarea.value.trim();
    if (!content) return;

    const statusEl = document.getElementById('note-save-status');
    const indicatorEl = document.querySelector('.notes-indicator');

    try {
        const response = await doctorAPI.savePatientNote(patientId, content);

        if (response && response.note) {
            window.currentPatientNotes.unshift(response.note);
            renderNotesTimeline(window.currentPatientNotes);

            textarea.value = '';

            statusEl.style.opacity = '1';
            indicatorEl.style.display = 'inline-block';

            setTimeout(() => {
                statusEl.style.opacity = '0';
            }, 2500);
        }
    } catch (e) {
        console.error('Failed to add note:', e);
        showToast("Erreur lors de l'ajout de la note", 'error');
    }
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
    const badge = document.querySelector('.nav-item[href="counselor_mes_patients.html"] .badge');
    if (badge) {
        badge.textContent = patients.length;
    }
}

window.filterPatients = filterPatients;
window.resetFilters = resetFilters;
window.viewPatientNotes = viewPatientNotes;
window.closeNotesModal = closeNotesModal;
window.addNote = addNote;
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
