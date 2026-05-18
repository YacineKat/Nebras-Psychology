// ============================================
// VIDEO CALL JOIN REQUESTS - Doctor group call management
// ============================================
// UI-PRIMARY module with intrinsic socket (separate connection for join requests).

let doctorMainSocket = null;
let joinRequestQueue = [];

function initDoctorMainSocket() {
    if (!isDoctor || !isGroupCall || doctorMainSocket) return;
    const user = getCurrentUser();
    if (!user || !user.id) return;

    const token = localStorage.getItem('nebras_token');
    if (!token) return;

    const mainServerUrl = window.API_URL.replace(/\/api\/?$/, '');
    doctorMainSocket = io(mainServerUrl, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    doctorMainSocket.on('connect', () => {
        console.log('[DoctorGroup] Main socket connected');
        doctorMainSocket.emit('join-doctor-room', user.id);
    });

    doctorMainSocket.on('group:join-request', (data) => {
        console.log('[DoctorGroup] Join request received:', data.patientName);
        showDoctorJoinRequestCard(data);
    });

    doctorMainSocket.on('disconnect', () => {
        console.log('[DoctorGroup] Main socket disconnected');
    });
}

function showDoctorJoinRequestCard(data) {
    const container = document.getElementById('joinRequestContainer');
    if (!container) return;

    container.style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'join-request-card';
    card.dataset.patientId = data.patientId;
    card.dataset.groupId = data.groupId;

    const initial = (data.patientName || 'P').charAt(0).toUpperCase();

    card.innerHTML = `
        <div class="join-request-header" onclick="viewJoinRequestPatient('${data.patientId}')">
            <div class="join-request-avatar">${initial}</div>
            <div class="join-request-info">
                <div class="join-request-name">${escapeHtml(data.patientName)}</div>
                <div class="join-request-label">Souhaite rejoindre le groupe</div>
            </div>
        </div>
        <div class="join-request-actions">
            <button class="join-request-accept-btn" onclick="acceptDoctorJoinRequest(this, '${data.patientId}', '${data.groupId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Accepter
            </button>
            <button class="join-request-reject-btn" onclick="rejectDoctorJoinRequest(this, '${data.patientId}', '${data.groupId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Refuser
            </button>
        </div>
    `;

    container.appendChild(card);
    joinRequestQueue.push(card);

    setTimeout(() => {
        if (card.parentNode) removeDoctorJoinRequestCard(card);
    }, 60000);
}

function removeDoctorJoinRequestCard(card) {
    if (!card || !card.parentNode) return;
    card.classList.add('removing');
    setTimeout(() => {
        if (card.parentNode) {
            card.remove();
        }
        joinRequestQueue = joinRequestQueue.filter(c => c !== card);
        const container = document.getElementById('joinRequestContainer');
        if (container && container.children.length === 0) {
            container.style.display = 'none';
        }
    }, 250);
}

async function acceptDoctorJoinRequest(btn, patientId, groupId) {
    if (!btn) return;
    const card = btn.closest('.join-request-card');
    try {
        const token = localStorage.getItem('nebras_token');
        const resp = await fetch(window.API_URL + '/psychologue/groups/' + groupId, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (resp.ok) {
            const data = await resp.json();
            const group = data.group;
            if (group && group.waitingList) {
                const member = group.waitingList.find(w => w.userId === patientId);
                if (member) {
                    await fetch(window.API_URL + '/psychologue/groups/accept', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memberId: member.id })
                    });
                    showToast('Patient accepté', 'success');
                    removeDoctorJoinRequestCard(card);
                    return;
                }
            }
        }
        showToast('Erreur: membre non trouvé', 'error');
    } catch (error) {
        console.error('Accept error:', error);
        showToast('Erreur lors de l\'acceptation', 'error');
    }
}

async function rejectDoctorJoinRequest(btn, patientId, groupId) {
    if (!btn) return;
    const card = btn.closest('.join-request-card');
    try {
        const token = localStorage.getItem('nebras_token');
        const resp = await fetch(window.API_URL + '/psychologue/groups/' + groupId, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (resp.ok) {
            const data = await resp.json();
            const group = data.group;
            if (group && group.waitingList) {
                const member = group.waitingList.find(w => w.userId === patientId);
                if (member) {
                    await fetch(window.API_URL + '/psychologue/groups/reject', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memberId: member.id })
                    });
                    showToast('Demande refusée', 'info');
                    removeDoctorJoinRequestCard(card);
                    return;
                }
            }
        }
        showToast('Erreur: membre non trouvé', 'error');
    } catch (error) {
        console.error('Reject error:', error);
        showToast('Erreur lors du refus', 'error');
    }
}

window.viewJoinRequestPatient = function(patientId) {
    viewPatientProfile(patientId);
};

async function viewPatientProfile(patientId) {
    const modal = document.getElementById('patientProfileModal');
    if (!modal) return;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('patientProfileContent').innerHTML = '<div style="text-align: center; padding: 40px;">Chargement...</div>';

    try {
        const result = await doctorAPI.getPatientById(patientId);
        const patient = result.patient || result;
        if (!patient) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            showToast('Patient non trouvé', 'error');
            return;
        }

        document.getElementById('patientProfileContent').innerHTML = `
            <div class="patient-profile-grid" style="display: grid; gap: 15px;">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Informations personnelles</h4>
                    <p><strong>Nom:</strong> ${escapeHtml(patient.fullname || 'Non spécifié')}</p>
                    <p><strong>Email:</strong> ${escapeHtml(patient.email || 'Non spécifié')}</p>
                    <p><strong>Téléphone:</strong> ${escapeHtml(patient.phone || 'Non spécifié')}</p>
                    <p><strong>Genre:</strong> ${patient.gender ? { male: 'Homme', female: 'Femme', other: 'Autre' }[patient.gender] || patient.gender : 'Non spécifié'}</p>
                    <p><strong>Date de naissance:</strong> ${patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('fr-FR') : 'Non spécifiée'}</p>
                    <p><strong>Langue:</strong> ${escapeHtml(patient.language || 'Non spécifiée')}</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Motif de consultation</h4>
                    <p>${escapeHtml(patient.motifs || patient.notes || patient.profile?.motifs || 'Non spécifié')}</p>
                </div>
                <div style="background: #44AA99; color: white; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0;">Historique</h4>
                    <p><strong>Séances:</strong> ${patient.totalSessions || 0}</p>
                    <p><strong>Dernière:</strong> ${patient.lastSession ? new Date(patient.lastSession).toLocaleDateString('fr-FR') : '-'}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading patient:', error);
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        showToast('Erreur de chargement', 'error');
    }
}

function closePatientModal() {
    const modal = document.getElementById('patientProfileModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}
