const API_BASE = 'http://localhost:3000/api';

// Catch unhandled promise rejections globally to identify source
window.addEventListener('unhandledrejection', (event) => {
    console.error('UNHANDLED PROMISE REJECTION:', event.reason?.message || event.reason);
    if (event.reason?.stack) {
        console.error('STACK:', event.reason.stack.split('\n').slice(0, 4).join('\n'));
    }
});

let groups = [];
let currentGroupId = null;
let currentGroupDetails = null;

function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || (function() {
        const c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
        return c;
    })();
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// Main server socket connection for real-time events
let mainSocket = null;

function initMainSocket() {
    if (mainSocket) return;
    const user = getCurrentUser();
    if (!user || !user.id) return;
    if (typeof io === 'undefined') return;

    const token = localStorage.getItem('nebras_token');
    if (!token) {
        console.log('No auth token available for socket connection');
        return;
    }

    mainSocket = io('http://localhost:3000', {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    mainSocket.on('connect', () => {
        console.log('Main socket connected for real-time events');
        mainSocket.emit('join-doctor-room', user.id);
    });

    // Listen for group join requests from patients
    mainSocket.on('group:join-request', (data) => {
        console.log('🎯 Group join request received:', data);
        console.log('   Video call section visible:', document.getElementById('videoCallSection')?.style.display);
        showJoinRequestCard(data);
    });

    // Listen for any group data change (created, updated, deleted, ended, etc.)
    mainSocket.on('group-data-changed', (data) => {
        console.log('Group data changed event:', data);
        loadGroups();
    });

    mainSocket.on('disconnect', () => {
        console.log('Main socket disconnected');
    });

    mainSocket.on('connect_error', (error) => {
        console.log('❌ Main socket connection error:', error.message);
    });
}

// ========== JOIN REQUEST UI (in-call overlay) ==========
let joinRequestQueue = [];

function showJoinRequestCard(data) {
    // Only show inside video call section when doctor is in an active group call
    const videoCallSection = document.getElementById('videoCallSection');
    if (!videoCallSection || videoCallSection.style.display === 'none') {
        console.log('⚠️ Join request received but doctor NOT in call - not showing');
        return;
    }

    console.log('✅ Showing join request in video call UI:', data.patientName);

    const container = document.getElementById('joinRequestContainer');
    if (!container) return;

    container.style.display = 'flex';

    // Create card element
    const card = document.createElement('div');
    card.className = 'join-request-card';
    card.dataset.patientId = data.patientId;
    card.dataset.groupId = data.groupId;
    card.dataset.timestamp = data.timestamp || Date.now();

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
            <button class="join-request-accept-btn" onclick="acceptJoinRequest(this, '${data.patientId}', '${data.groupId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Accepter
            </button>
            <button class="join-request-reject-btn" onclick="rejectJoinRequest(this, '${data.patientId}', '${data.groupId}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Refuser
            </button>
        </div>
    `;

    container.appendChild(card);
    joinRequestQueue.push(card);

    // Auto-dismiss after 60 seconds
    setTimeout(() => {
        if (card.parentNode) {
            removeJoinRequestCard(card);
        }
    }, 60000);
}

function removeJoinRequestCard(card) {
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

async function acceptJoinRequest(btn, patientId, groupId) {
    if (!btn) return;
    const card = btn.closest('.join-request-card');
    // Find the member ID by looking up the group member
    try {
        // Get group details to find the right member
        const response = await fetch(`${API_BASE}/psychologue/groups/${groupId}`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            const group = data.group;
            if (group && group.waitingList) {
                const member = group.waitingList.find(w => w.userId === patientId);
                if (member) {
                    await fetch(`${API_BASE}/psychologue/groups/accept`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ memberId: member.id })
                    });
                    showToast('Patient accepté dans le groupe', 'success');
                    removeJoinRequestCard(card);
                    // Refresh group detail modal if open
                    if (currentGroupId === groupId && document.getElementById('groupDetailModal')?.classList.contains('active')) {
                        await openGroupDetailModal(groupId);
                    }
                    return;
                }
            }
        }
        // Fallback: try generic accept endpoint
        try {
            const membersResp = await fetch(`${API_BASE}/psychologue/groups/${groupId}`, {
                headers: getAuthHeaders()
            });
            if (membersResp.ok) {
                const membersData = await membersResp.json();
                const waitingMember = membersData.group?.waitingList?.find(w => w.userId === patientId);
                if (waitingMember) {
                    await fetch(`${API_BASE}/psychologue/groups/accept`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ memberId: waitingMember.id })
                    });
                    showToast('Patient accepté dans le groupe', 'success');
                    removeJoinRequestCard(card);
                    return;
                }
            }
        } catch (e) {}
        showToast('Erreur: membre non trouvé', 'error');
    } catch (error) {
        console.error('Error accepting join request:', error);
        showToast('Erreur lors de l\'acceptation', 'error');
    }
}

async function rejectJoinRequest(btn, patientId, groupId) {
    if (!btn) return;
    const card = btn.closest('.join-request-card');
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/${groupId}`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            const group = data.group;
            if (group && group.waitingList) {
                const member = group.waitingList.find(w => w.userId === patientId);
                if (member) {
                    await fetch(`${API_BASE}/psychologue/groups/reject`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ memberId: member.id })
                    });
                    showToast('Demande refusée', 'info');
                    removeJoinRequestCard(card);
                    return;
                }
            }
        }
        showToast('Erreur: membre non trouvé', 'error');
    } catch (error) {
        console.error('Error rejecting join request:', error);
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
    document.getElementById('patientProfileContent').innerHTML = '<div style="text-align: center; padding: 40px;">Chargement des informations du patient...</div>';

    try {
        const result = await doctorAPI.getPatientById(patientId);
        const patient = result.patient || result;
        if (!patient) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            showToast('Patient non trouvé', 'error');
            return;
        }

        const genderLabel = { 'male': 'Homme', 'female': 'Femme', 'other': 'Autre' };
        const prefGenderLabel = { 'male': 'Homme', 'female': 'Femme', 'no-preference': 'Aucune préférence' };

        document.getElementById('patientProfileContent').innerHTML = `
            <div class="patient-profile-grid" style="display: grid; gap: 15px;">
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Informations personnelles</h4>
                    <p><strong>Nom:</strong> ${escapeHtml(patient.fullname || 'Non spécifié')}</p>
                    <p><strong>Email:</strong> ${escapeHtml(patient.email || 'Non spécifié')}</p>
                    <p><strong>Téléphone:</strong> ${escapeHtml(patient.phone || 'Non spécifié')}</p>
                    <p><strong>Genre:</strong> ${genderLabel[patient.gender] || 'Non spécifié'}</p>
                    <p><strong>Date de naissance:</strong> ${patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('fr-FR') : 'Non spécifiée'}</p>
                    <p><strong>Langue:</strong> ${escapeHtml(patient.language || 'Non spécifiée')}</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Motif de consultation</h4>
                    <p>${escapeHtml(patient.motifs || patient.notes || patient.profile?.motifs || 'Non spécifié')}</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #091346;">Préférences</h4>
                    <p><strong>Genre du praticien:</strong> ${prefGenderLabel[patient.prefGender || patient.profile?.prefGender] || 'Aucune préférence'}</p>
                    <p><strong>Type de session:</strong> ${patient.prefType === 'video' ? 'Vidéo' : patient.prefType === 'phone' ? 'Téléphone' : patient.prefType === 'chat' ? 'Chat' : 'Non spécifié'}</p>
                </div>
                <div style="background: #44AA99; color: white; padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0;">Historique des séances</h4>
                    <p><strong>Total des séances:</strong> ${patient.totalSessions || 0}</p>
                    <p><strong>Dernière séance:</strong> ${patient.lastSession ? new Date(patient.lastSession).toLocaleDateString('fr-FR') : '-'}</p>
                    <p><strong>Première séance:</strong> ${patient.firstSession ? new Date(patient.firstSession).toLocaleDateString('fr-FR') : '-'}</p>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error fetching patient:', error);
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        showToast('Erreur lors du chargement', 'error');
    }
}

function closePatientModal() {
    const modal = document.getElementById('patientProfileModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

window.viewPatientProfile = viewPatientProfile;

// Check if user is logged in and is a psychologue
if (!isLoggedIn()) {
    window.location.href = 'auth.html';
} else if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
    redirectByUserType(getUserType());
}

function getAuthHeaders() {
    const token = localStorage.getItem('nebras_token');
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.ok) {
            groups = data.groups || [];
            renderGroups();
        } else if (response.status === 401) {
            window.location.href = 'auth.html';
        } else {
            console.error('API Error:', data.error || 'Unknown error');
            groups = [];
            renderGroups();
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        groups = [];
        renderGroups();
    }
}

async function updateMessagesBadge() {
    try {
        if (!window.messageAPI) return;
        const result = await messageAPI.getUnreadCount().catch(() => null);
        const count = result?.unreadCount || 0;
        const badge = document.getElementById('messagesBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating messages badge:', error);
    }
}

function isGroupPast(group) {
    if (!group.day || !group.time) return false;
    
    const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
    const dayIndex = dayMap[group.day];
    if (dayIndex === undefined) return false;
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [hours, minutes] = group.time.split(':').map(Number);
    const groupTime = hours * 60 + minutes;
    
    if (dayIndex < currentDay) return true;
    if (dayIndex === currentDay && groupTime < currentTime) return true;
    
    return false;
}

function renderGroups() {
    const container = document.getElementById('groupsList');
    if (!container) return;
    
    if (groups.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Aucun groupe. Cliquez sur le bouton + pour créer un groupe.</div>';
        return;
    }

    // Sort: upcoming groups first (by dayOfWeek/time), then past groups
    const sorted = [...groups].sort((a, b) => {
        const aPast = isGroupPast(a);
        const bPast = isGroupPast(b);
        if (aPast !== bPast) return aPast ? 1 : -1;
        const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
        const aDay = dayMap[a.day] ?? 0;
        const bDay = dayMap[b.day] ?? 0;
        if (aDay !== bDay) return aDay - bDay;
        const aTime = a.time ? parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1] || '0') : 0;
        const bTime = b.time ? parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1] || '0') : 0;
        return aTime - bTime;
    });

    container.innerHTML = sorted.map(group => {
        const isPast = isGroupPast(group);
        const cardStyle = isPast ? 'opacity: 0.6; filter: grayscale(0.5);' : '';
        const pastBadge = isPast ? '<span style="background: #94a3b8; color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; margin-left: 8px;">Passée</span>' : '';
        return `
        <div class="group-card-psycho" style="${cardStyle}">
            <div class="group-header-psycho">
                <span class="group-title-psycho">${group.name}${pastBadge}</span>
                <span class="group-theme-badge">${group.theme || 'Groupe'}</span>
            </div>
            <div class="group-details-psycho">
                <span class="group-detail-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${group.day} ${group.time}</span>
                <span class="group-detail-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ${formatDuration(group.duration)}</span>
                <span class="group-detail-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${group.currentPlaces || 0}/${group.maxPlaces} places</span>
                <span class="group-detail-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8l-4 8-4-8"/></svg> ${group.price || 0} DA</span>
                <span class="group-detail-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> ${group.waitingCount || 0} demandes</span>
            </div>
            <div class="group-desc-psycho">${group.description || ''}</div>
            <div class="group-actions">
                <button class="group-action-btn edit" onclick="openEditGroupModal('${group.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/><path d="M3 21h18"/></svg> Modifier</button>
                <button class="group-action-btn detail" onclick="openGroupDetailModal('${group.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Gérer</button>
                ${isPast ? '' : `<button class="group-action-btn start" onclick="startGroupSession('${group.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Démarrer</button>`}
            </div>
        </div>
    `}).join('');
}

function formatDuration(minutes) {
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h${m}` : `${h}h`;
    }
    return `${minutes}min`;
}

async function openGroupDetailModal(groupId) {
    currentGroupId = groupId;
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/${groupId}`, { headers: getAuthHeaders() });
        if (response.ok) {
            const data = await response.json();
            currentGroupDetails = data.group;
            document.getElementById('detailGroupTitle').innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> ${data.group.name}`;
            document.getElementById('maxPlacesSpan').innerText = data.group.maxPlaces;
            updateWaitingAndParticipants();
            syncGroupSummary(data.group);
            document.getElementById('groupDetailModal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    } catch (error) {
        console.error('Error loading group details:', error);
    }
}

function syncGroupSummary(groupDetails) {
    if (!groupDetails) return;
    const index = groups.findIndex(g => g.id === groupDetails.id);
    if (index === -1) return;

    groups[index] = {
        ...groups[index],
        name: groupDetails.name,
        theme: groupDetails.theme,
        day: groupDetails.day,
        time: groupDetails.time,
        duration: groupDetails.duration,
        maxPlaces: groupDetails.maxPlaces,
        currentPlaces: groupDetails.currentPlaces,
        price: groupDetails.price,
        waitingCount: groupDetails.waitingList?.length || 0
    };

    renderGroups();
}

function updateWaitingAndParticipants() {
    if (!currentGroupDetails) return;
    
    document.getElementById('waitingCount').innerText = currentGroupDetails.waitingList?.length || 0;
    document.getElementById('participantsCount').innerText = currentGroupDetails.currentPlaces || 0;
    
    const waitingContainer = document.getElementById('waitingListContainer');
    const waitingList = currentGroupDetails.waitingList || [];
    const isFull = (currentGroupDetails.currentPlaces || 0) >= currentGroupDetails.maxPlaces;
    
    if (waitingList.length === 0) {
        waitingContainer.innerHTML = '<div class="empty-message">Aucune demande en attente</div>';
    } else {
        waitingContainer.innerHTML = waitingList.map(req => `
            <div class="request-card">
                <div class="request-info">
                    <div class="request-name">${req.name}</div>
                    <div class="request-date">Demande le ${req.requestDate}</div>
                </div>
                <div class="request-actions">
                    ${isFull ? 
                        '<button class="refuse-btn" disabled style="opacity:0.5;">Groupe complet</button>' :
                        `<button class="accept-btn" onclick="acceptRequest('${req.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Accepter</button>`
                    }
                    <button class="refuse-btn" onclick="rejectRequest('${req.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Refuser</button>
                </div>
            </div>
        `).join('');
    }
    
    const participantsContainer = document.getElementById('participantsListContainer');
    const participants = currentGroupDetails.participants || [];
    
    if (participants.length === 0) {
        participantsContainer.innerHTML = '<div class="empty-message">Aucun participant pour le moment</div>';
    } else {
        participantsContainer.innerHTML = participants.map(p => `
            <div class="participant-card">
                <div class="participant-info">
                    <div class="participant-name">${p.name}</div>
                    <div class="participant-date">Inscrit le ${p.joinedDate}</div>
                </div>
            </div>
        `).join('');
    }
}

async function acceptRequest(memberId) {
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/accept`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ memberId })
        });
        if (response.ok) {
            await openGroupDetailModal(currentGroupId);
        }
    } catch (error) {
        console.error('Error accepting request:', error);
    }
}

async function rejectRequest(memberId) {
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/reject`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ memberId })
        });
        if (response.ok) {
            await openGroupDetailModal(currentGroupId);
        }
    } catch (error) {
        console.error('Error rejecting request:', error);
    }
}

function closeGroupDetailModal() {
    document.getElementById('groupDetailModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    currentGroupDetails = null;
}

function openCreateGroupModal() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('groupTime').value = `${hours}:${minutes}`;
    
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const today = dayNames[now.getDay()];
    const daySelect = document.getElementById('groupDay');
    if (today !== 'Dimanche' && daySelect.value !== today) {
        daySelect.value = today;
    }
    
    document.getElementById('createGroupModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCreateGroupModal() {
    document.getElementById('createGroupModal').classList.remove('active');
    document.body.style.overflow = 'auto';
    document.getElementById('groupTitle').value = '';
    document.getElementById('groupDesc').value = '';
}

async function createGroup() {
    const title = document.getElementById('groupTitle').value.trim();
    const desc = document.getElementById('groupDesc').value.trim();
    const theme = document.getElementById('groupTheme').value;
    const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
    const day = document.getElementById('groupDay').value;
    const time = document.getElementById('groupTime').value;
    const durationMap = { '1h': 60, '1h30': 90, '2h': 120 };
    const duration = durationMap[document.getElementById('groupDuration').value];
    const maxPlaces = parseInt(document.getElementById('groupMaxPlaces').value);
    const price = parseInt(document.getElementById('groupPrice').value);

    if (!title || !desc) {
        console.warn('Title or description missing');
        return;
    }

    if (!day || !time) {
        console.warn('Day or time not selected');
        return;
    }

    try {
        console.log('Sending request to create group...');
        console.log('Title:', title);
        console.log('Day:', day, '-> dayOfWeek:', dayMap[day]);
        console.log('Time:', time);
        console.log('Auth headers:', getAuthHeaders());
        
        const response = await fetch(`${API_BASE}/psychologue/groups`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name: title,
                description: desc,
                theme,
                dayOfWeek: dayMap[day],
                time,
                duration,
                maxParticipants: maxPlaces,
                price
            })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (response.ok) {
            console.log('Group created successfully');
            closeCreateGroupModal();
            loadGroups();
        } else {
            console.error('Error:', data.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error creating group:', error);
    }
}

let editGroupId = null;

async function openEditGroupModal(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    
    editGroupId = id;
    document.getElementById('editGroupId').value = id;
    document.getElementById('editGroupTitle').value = group.name;
    document.getElementById('editGroupDesc').value = group.description;
    document.getElementById('editGroupDay').value = group.day;
    document.getElementById('editGroupTime').value = group.time;
    document.getElementById('editGroupMaxPlaces').value = group.maxPlaces;
    document.getElementById('editGroupPrice').value = group.price;
    document.getElementById('editGroupModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditGroupModal() {
    document.getElementById('editGroupModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

async function updateGroup() {
    const id = document.getElementById('editGroupId').value;
    const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
    
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name: document.getElementById('editGroupTitle').value,
                description: document.getElementById('editGroupDesc').value,
                dayOfWeek: dayMap[document.getElementById('editGroupDay').value],
                time: document.getElementById('editGroupTime').value,
                maxParticipants: parseInt(document.getElementById('editGroupMaxPlaces').value),
                price: parseInt(document.getElementById('editGroupPrice').value)
            })
        });

        if (response.ok) {
            closeEditGroupModal();
            loadGroups();
        }
    } catch (error) {
        console.error('Error updating group:', error);
    }
}

async function deleteGroup() {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce groupe ?')) return;
    
    const id = document.getElementById('editGroupId').value;
    
    try {
        const response = await fetch(`${API_BASE}/psychologue/groups/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            closeEditGroupModal();
            loadGroups();
        }
    } catch (error) {
        console.error('Error deleting group:', error);
    }
}

function startGroupSession(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    const roomId = `group_${groupId}`;
    sessionStorage.setItem('groupCallDuration', group.duration || 90);
    sessionStorage.setItem('groupCallGroupId', groupId);
    sessionStorage.setItem('groupCallName', group.name);
    
    window.location.href = `video-call.html?mode=group&role=doctor&room=${roomId}&groupId=${groupId}`;
}

function switchGroupTab(tab) {
    document.querySelectorAll('.group-detail-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.group-tab-panel').forEach(panel => panel.classList.remove('active'));
    
    if (tab === 'waiting') {
        document.querySelector('.group-detail-tab:first-child').classList.add('active');
        document.getElementById('waitingListPanel').classList.add('active');
    } else {
        document.querySelector('.group-detail-tab:last-child').classList.add('active');
        document.getElementById('participantsPanel').classList.add('active');
    }
}

function logout() {
    localStorage.removeItem('nebras_token');
    localStorage.removeItem('nebras_user');
    window.location.href = 'home.html';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeCreateGroupModal();
        closeEditGroupModal();
        closeGroupDetailModal();
    }
});

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
    loadGroups();
    initUserAvatar();
    updateMessagesBadge();
    initMainSocket();
    document.getElementById('patientProfileModal')?.addEventListener('click', function(e) {
        if (e.target === this) closePatientModal();
    });
});

function initUserAvatar() {
    const user = getCurrentUser();
    const avatarContainer = document.getElementById('userAvatarContainer');
    if (!avatarContainer) return;

    if (user?.profile?.avatar) {
        avatarContainer.innerHTML = '';
        avatarContainer.style.backgroundImage = `url(${user.profile.avatar})`;
        avatarContainer.style.backgroundSize = 'cover';
        avatarContainer.style.backgroundPosition = 'center';
        avatarContainer.style.borderRadius = '50%';
    } else if (user) {
        const name = user.fullname || user.email || '';
        const initial = name.charAt(0).toUpperCase();
        avatarContainer.style.backgroundImage = '';
        avatarContainer.innerHTML = `
            <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #091346, #44AA99); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 18px;">
                ${initial}
            </div>
        `;
    }

    if (user) {
        const name = user.fullname || user.email || '';
        const userNameEl = document.querySelector('.user-name');
        if (userNameEl) userNameEl.textContent = name;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}