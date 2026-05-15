const API_BASE = 'http://localhost:3000/api';
let groups = [];
let currentGroupId = null;
let currentGroupDetails = null;

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
    
    const activeGroups = groups.filter(g => !isGroupPast(g));
    
    if (activeGroups.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">Aucun groupe actif. Cliquez sur le bouton + pour créer un groupe.</div>';
        return;
    }

    container.innerHTML = activeGroups.map(group => `
        <div class="group-card-psycho">
            <div class="group-header-psycho">
                <span class="group-title-psycho">${group.name}</span>
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
                <button class="group-action-btn start" onclick="startGroupSession('${group.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Démarrer</button>
            </div>
        </div>
    `).join('');
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
    currentGroupId = groupId;
    
    // Update call info
    document.getElementById('videoGroupName').textContent = group.name;
    document.getElementById('editCallTitle').value = group.name;
    document.getElementById('editCallMaxParticipants').value = group.maxPlaces || 10;
    document.getElementById('editCallPrice').value = group.price || 0;
    
    // Show video call section
    document.getElementById('videoCallSection').style.display = 'block';
    
    // Initialize video call
    initGroupCall(roomId, group);
}

let localVideoTrack = null;
let localAudioTrack = null;

async function initGroupCall(roomId, group) {
    currentRoomId = roomId;
    
    // Get local video stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideoTrack = localStream.getVideoTracks()[0];
        localAudioTrack = localStream.getAudioTracks()[0];
        
        // Canvas-based horizontal flip for raw track data
        const rawVideoTrack = localStream.getVideoTracks()[0];
        const flipResult = await buildFlippedTrack(rawVideoTrack);
        flippedVideoTrack = flipResult.flippedTrack;
        flippedVideoStream = flipResult.flippedStream;
        flipAnimFrame = flipResult.animId;
        flipVideoEl = flipResult.offVideo;
        flipCanvas = flipResult.canvas;
        flipCtx = flipResult.ctx;
        flipDrawFn = flipResult.drawFn;
        
        // Start with camera and microphone OFF
        localVideoTrack.enabled = false;
        localAudioTrack.enabled = false;
        isMuted = true;
        isVideoOff = true;
        
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('localVideo').style.transform = 'scaleX(-1)';
        document.getElementById('localVideo').style.display = 'none';
        
        // Add avatar placeholder
        const localVideoContainer = document.getElementById('localVideoContainer');
        let avatarPlaceholder = document.getElementById('localVideoAvatar');
        if (!avatarPlaceholder) {
            avatarPlaceholder = document.createElement('div');
            avatarPlaceholder.id = 'localVideoAvatar';
            avatarPlaceholder.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #F3F4F6; font-size: 32px; color: #6B7280;';
            localVideoContainer.appendChild(avatarPlaceholder);
        }
        const userInitial = getCurrentUser()?.fullname?.charAt(0).toUpperCase() || 'V';
        avatarPlaceholder.innerHTML = userInitial;
        
        // Update UI to show OFF state
        document.getElementById('muteBtn').classList.add('muted');
        document.getElementById('muteBtn').classList.remove('active');
        document.getElementById('localMuteIndicator').style.display = 'flex';
        
        document.getElementById('videoBtn').classList.add('muted');
        document.getElementById('videoBtn').classList.remove('active');
        document.getElementById('localVideoOffIndicator').style.display = 'flex';
        
        // Update local name with user name
        const userName = getCurrentUser()?.fullname || 'Vous';
        document.getElementById('localName').innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/></svg>
            ${userName}
        `;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        endGroupSession();
        return;
    }
    
    // Connect to video server
    const videoServerUrl = window.APP_CONFIG.videoServerUrl;
    socket = io(videoServerUrl);
    
    const userName = getCurrentUser()?.fullname || 'Psychologue';
    
    socket.on('connect', () => {
        console.log('Connected to video server');
        
        socket.emit('join-room', { roomId, userName }, (response) => {
            if (response.error) {
                console.error('Error joining room:', response.error);
                return;
            }
            
            console.log('Joined room:', response);
            updateParticipantCount();
            
            // Handle incoming participants
            if (response.participants) {
                response.participants.forEach(p => {
                    addRemoteParticipant(p);
                });
            }
        });
    });
    
    socket.on('participant-joined', (participant) => {
        console.log('Participant joined:', participant);
        addRemoteParticipant(participant);
        updateParticipantCount();
        updateParticipantsPanel();
    });
    
    socket.on('participant-left', (data) => {
        console.log('Participant left:', data);
        removeRemoteParticipant(data.socketId);
        updateParticipantCount();
        updateParticipantsPanel();
    });
    
    socket.on('p2p-offer', ({ offer, fromId, fromName }) => {
        handleOffer(offer, fromId, fromName);
    });
    
    socket.on('p2p-answer', ({ answer, fromId }) => {
        const pc = peerConnections[fromId];
        if (pc) {
                pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    
    socket.on('p2p-ice-candidate', ({ candidate, fromId }) => {
        const pc = peerConnections[fromId];
        if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    // Chat events
    socket.on('chat-message', (message) => {
        addChatMessage(message.fromId, message.fromName, message.text, message.timestamp);
        if (!chatVisible) {
            unreadCount++;
            updateUnreadBadge();
        }
    });
    
    socket.on('chat-typing', ({ socketId, isTyping }) => {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = isTyping ? 'block' : 'none';
        }
    });
    
    // Handle tab visibility for canvas flip pipeline
    setupGroupVisibilityHandler();
    
    // Start call timer
    const durationMinutes = group?.duration || 90;
    startCallTimer(durationMinutes);
}

let localStream = null;
let flippedVideoTrack = null;
let flippedVideoStream = null;
let flipAnimFrame = null;
let flipVideoEl = null;
let flipCanvas = null;
let flipCtx = null;
let flipDrawFn = null;

// Visibility handling
let groupVisibilityHandler = null;
let isEndingGroupSession = false;

async function buildFlippedTrack(rawVideoTrack) {
    return new Promise((resolve) => {
        const trackSettings = rawVideoTrack.getSettings();
        const W = trackSettings.width || 640;
        const H = trackSettings.height || 480;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        const offVideo = document.createElement('video');
        offVideo.muted = true;
        offVideo.playsInline = true;
        offVideo.srcObject = new MediaStream([rawVideoTrack]);
        offVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px';
        document.body.appendChild(offVideo);

        offVideo.onloadedmetadata = () => {
            if (offVideo.videoWidth > 0) {
                canvas.width = offVideo.videoWidth;
                canvas.height = offVideo.videoHeight;
            }

            offVideo.play().then(() => {
                const animRef = { current: null };
                let resolved = false;

                const draw = () => {
                    if (offVideo.readyState >= 2 && offVideo.videoWidth > 0) {
                        if (canvas.width !== offVideo.videoWidth) {
                            canvas.width = offVideo.videoWidth;
                            canvas.height = offVideo.videoHeight;
                        }
                        ctx.save();
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(offVideo, 0, 0, canvas.width, canvas.height);
                        ctx.restore();

                        if (!resolved) {
                            resolved = true;
                            const flippedStream = canvas.captureStream(30);
                            resolve({
                                flippedTrack: flippedStream.getVideoTracks()[0],
                                flippedStream,
                                animId: animRef,
                                offVideo,
                                canvas,
                                ctx,
                                drawFn: draw
                            });
                        }
                    }
                    animRef.current = requestAnimationFrame(draw);
                };
                draw();
            });
        };
    });
}
function setupGroupVisibilityHandler() {
    if (groupVisibilityHandler) return;
    groupVisibilityHandler = () => {
        if (document.hidden) {
            if (flipAnimFrame?.current) {
                cancelAnimationFrame(flipAnimFrame.current);
                flipAnimFrame.current = null;
            }
        } else {
            if (flipVideoEl && flipDrawFn && flipAnimFrame && !flipAnimFrame.current) {
                flipVideoEl.play().then(() => {
                    if (!document.hidden && flipAnimFrame && !flipAnimFrame.current) {
                        flipDrawFn();
                    }
                }).catch(() => {});
            }
        }
    };
    document.addEventListener('visibilitychange', groupVisibilityHandler);
}

let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let socket = null;
let peerConnections = {};
let peerStreams = {};
let currentRoomId = null;
let callStartTime = null;
let callDurationInterval = null;
let sessionEndTimeout = null;
let sessionEndTime = null;
let selectedParticipant = null;

// Chat variables
let chatMessages = [];
let chatVisible = false;
let unreadCount = 0;

function addRemoteParticipant(participant) {
    const thumbnailGrid = document.getElementById('thumbnailGrid');
    
    // Check if already exists
    if (document.getElementById(`participant_${participant.socketId}`)) return;
    
    const container = document.createElement('div');
    container.id = `participant_${participant.socketId}`;
    container.className = 'thumbnail-video';
    container.style.cssText = 'position: relative; min-width: 180px; height: 120px; border-radius: 12px; background: #0f0f1a; border: 2px solid rgba(255,255,255,0.2); overflow: hidden; cursor: pointer;';
    container.onclick = () => openParticipantActions(participant);
    
    const video = document.createElement('video');
    video.id = `video_${participant.socketId}`;
    video.autoplay = true;
    video.playsinline = true;
    video.style.cssText = 'width: 100%; height: 100%; object-fit: cover; transform: none;';
    
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; display: flex; align-items: center; gap: 5px;';
    nameDiv.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/></svg>
        ${participant.name || 'Participant'}
    `;
    
    const muteIndicator = document.createElement('div');
    muteIndicator.id = `mute_${participant.socketId}`;
    muteIndicator.style.cssText = 'display: none; position: absolute; top: 8px; right: 8px; background: #e74c3c; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center;';
    muteIndicator.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`;
    
    const videoOffIndicator = document.createElement('div');
    videoOffIndicator.id = `videooff_${participant.socketId}`;
    videoOffIndicator.style.cssText = 'display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.7); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;';
    videoOffIndicator.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>`;
    
    container.appendChild(video);
    container.appendChild(nameDiv);
    container.appendChild(muteIndicator);
    container.appendChild(videoOffIndicator);
    thumbnailGrid.appendChild(container);
    
    // Store participant info
    if (!participantStates[participant.socketId]) {
        participantStates[participant.socketId] = { name: participant.name, isMuted: false, isVideoOff: false };
    }
    
    // Create WebRTC connection for this participant
    setupPeerConnection(participant.socketId, video);
    
    // Update speaker view
    updateSpeakerView(participant);
}

let participantStates = {};

function setupPeerConnection(peerId, videoElement) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    peerConnections[peerId] = pc;
    
    // Add flipped video track and original audio track
    if (flippedVideoTrack && flippedVideoStream) {
        pc.addTrack(flippedVideoTrack, flippedVideoStream);
    }
    const audioTrack = localStream?.getAudioTracks()[0];
    if (audioTrack) {
        pc.addTrack(audioTrack, localStream);
    }
    
    // Create a per-peer remote stream and attach it to the video element once
    const remoteStream = new MediaStream();
    peerStreams[peerId] = remoteStream;
    if (videoElement) {
        videoElement.srcObject = remoteStream;
    }
    
    // Handle incoming tracks — add to the shared stream
    pc.ontrack = (event) => {
        remoteStream.addTrack(event.track);
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('p2p-ice-candidate', {
                roomId: currentRoomId,
                candidate: event.candidate,
                targetId: peerId
            });
        }
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected' && videoElement) {
            videoElement.play().catch(e => console.log('play error:', e));
        }
    };
    
    // Create and send offer
    pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        socket.emit('p2p-offer', {
            roomId: currentRoomId,
            offer: pc.localDescription,
            targetId: peerId
        });
    });
}

async function handleOffer(offer, fromId, fromName) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    peerConnections[fromId] = pc;
    
    if (flippedVideoTrack && flippedVideoStream) {
        pc.addTrack(flippedVideoTrack, flippedVideoStream);
    }
    const audioTrack = localStream?.getAudioTracks()[0];
    if (audioTrack) {
        pc.addTrack(audioTrack, localStream);
    }
    
    // Create a per-peer remote stream and attach it to the video element once
    const remoteStream = new MediaStream();
    peerStreams[fromId] = remoteStream;
    const videoEl = document.getElementById(`video_${fromId}`);
    if (videoEl) {
        videoEl.srcObject = remoteStream;
    }
    
    // Handle incoming tracks — add to the shared stream
    pc.ontrack = (event) => {
        remoteStream.addTrack(event.track);
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('p2p-ice-candidate', {
                roomId: currentRoomId,
                candidate: event.candidate,
                targetId: fromId
            });
        }
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${fromId}: ${pc.connectionState}`);
        if (pc.connectionState === 'connected' && videoEl) {
            videoEl.play().catch(e => console.log('play error:', e));
        }
    };
    
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('p2p-answer', {
        roomId: currentRoomId,
        answer: pc.localDescription,
        targetId: fromId
    });
    
    addRemoteParticipant({ socketId: fromId, name: fromName });
}

function removeRemoteParticipant(socketId) {
    const container = document.getElementById(`participant_${socketId}`);
    if (container) {
        container.remove();
    }
    
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    
    delete participantStates[socketId];
    updateSpeakerView(null);
}

function updateParticipantCount() {
    const count = Object.keys(peerConnections).length + 1; // +1 for self
    document.getElementById('participantCountText').textContent = `${count} participant${count > 1 ? 's' : ''}`;
}

function startCallTimer(durationMinutes) {
    callStartTime = Date.now();
    if (durationMinutes) {
        sessionEndTime = callStartTime + (durationMinutes * 60 * 1000);
    }
    callDurationInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('callDuration').textContent = `${minutes}:${seconds}`;
        
        if (sessionEndTime && Date.now() >= sessionEndTime) {
            endGroupSession(true);
        }
    }, 1000);
}

function updateSpeakerView(participant) {
    const speakerBadge = document.getElementById('speakerBadge');
    const speakerName = document.getElementById('currentSpeakerName');
    const speakerView = document.getElementById('speakerView');
    
    if (participant) {
        if (speakerName) speakerName.textContent = participant.name || 'Participant';
        if (speakerBadge) speakerBadge.style.display = 'flex';
        if (speakerView) speakerView.style.borderColor = '#44AA99';
    } else if (Object.keys(peerConnections).length === 0) {
        if (speakerBadge) speakerBadge.style.display = 'none';
        if (speakerView) speakerView.style.borderColor = 'rgba(68,170,153,0.3)';
    }
}

function toggleMute() {
    if (localAudioTrack) {
        localAudioTrack.enabled = !localAudioTrack.enabled;
        isMuted = !localAudioTrack.enabled;
        
        const muteBtn = document.getElementById('muteBtn');
        const muteIcon = document.getElementById('muteIcon');
        const muteIndicator = document.getElementById('localMuteIndicator');
        
        if (isMuted) {
            muteBtn.classList.add('muted');
            muteBtn.classList.remove('active');
            muteIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>`;
            muteIndicator.style.display = 'flex';
        } else {
            muteBtn.classList.remove('muted');
            muteBtn.classList.add('active');
            muteIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
            muteIndicator.style.display = 'none';
        }
        
        // Notify other participants
        if (socket) {
            socket.emit('participant-update', { roomId: currentRoomId, socketId: socket.id, isMuted });
        }
    }
}

function toggleVideo() {
    if (localVideoTrack) {
        localVideoTrack.enabled = !localVideoTrack.enabled;
        isVideoOff = !localVideoTrack.enabled;
        
        const videoBtn = document.getElementById('videoBtn');
        const videoIcon = document.getElementById('videoIcon');
        const videoEl = document.getElementById('localVideo');
        const avatarEl = document.getElementById('localVideoAvatar');
        
        if (isVideoOff) {
            videoBtn.classList.add('muted');
            videoBtn.classList.remove('active');
            videoIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg>`;
            document.getElementById('localVideoOffIndicator').style.display = 'flex';
            if (videoEl) videoEl.style.display = 'none';
            if (avatarEl) avatarEl.style.display = 'flex';
        } else {
            videoBtn.classList.remove('muted');
            videoBtn.classList.add('active');
            videoIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
            document.getElementById('localVideoOffIndicator').style.display = 'none';
            if (videoEl) videoEl.style.display = 'block';
            if (avatarEl) avatarEl.style.display = 'none';
        }
        
        // Notify other participants
        if (socket) {
            socket.emit('participant-update', { roomId: currentRoomId, socketId: socket.id, isVideoOff });
        }
    }
}

function toggleScreenShare() {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

async function startScreenShare() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace video track in all peer connections
        Object.values(peerConnections).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });
        
        // Show screen in local video
        document.getElementById('localVideo').srcObject = screenStream;
        document.getElementById('localVideo').style.transform = 'none';
        
        isScreenSharing = true;
        const screenShareBtn = document.getElementById('screenShareBtn');
        screenShareBtn.style.background = '#44AA99';
        
        // Handle screen share stop
        screenTrack.onended = () => {
            stopScreenShare();
        };
    } catch (err) {
        console.error('Error starting screen share:', err);
    }
}

function stopScreenShare() {
    if (localVideoTrack) {
        // Restore camera video
        document.getElementById('localVideo').srcObject = localStream;
        document.getElementById('localVideo').style.transform = 'scaleX(-1)';
        
        // Replace track in all peer connections
        Object.values(peerConnections).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                sender.replaceTrack(localVideoTrack);
            }
        });
    }
    
    isScreenSharing = false;
}

function endGroupSession(wasAutoEnded = false) {
    // Stop call timer
    if (callDurationInterval) {
        clearInterval(callDurationInterval);
        callDurationInterval = null;
    }
    sessionEndTime = null;
    
    // Auto-end notification
    if (wasAutoEnded) {
        const callSection = document.getElementById('videoCallSection');
        if (callSection) {
            callSection.style.opacity = '0.5';
            setTimeout(() => {
                finishEndingSession();
            }, 1000);
        } else {
            finishEndingSession();
        }
        return;
    }
    
    finishEndingSession();
}

function finishEndingSession() {
    if (isEndingGroupSession) return;
    isEndingGroupSession = true;
    
    if (groupVisibilityHandler) {
        document.removeEventListener('visibilitychange', groupVisibilityHandler);
        groupVisibilityHandler = null;
    }
    
    // Stop canvas flip pipeline
    cancelAnimationFrame(flipAnimFrame?.current);
    flipAnimFrame = null;
    if (flipVideoEl) {
        flipVideoEl.srcObject = null;
        if (document.body.contains(flipVideoEl)) {
            document.body.removeChild(flipVideoEl);
        }
        flipVideoEl = null;
    }
    flipCanvas = null;
    flipCtx = null;
    flipDrawFn = null;
    flippedVideoTrack = null;
    flippedVideoStream = null;
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    participantStates = {};
    
    // Disconnect socket
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    // Clear video elements
    const thumbnailGrid = document.getElementById('thumbnailGrid');
    const localContainer = document.getElementById('localVideoContainer');
    thumbnailGrid.innerHTML = '';
    if (localContainer) {
        thumbnailGrid.appendChild(localContainer);
    }
    document.getElementById('localVideo').srcObject = null;
    
    // Reset buttons
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;
    const muteBtn = document.getElementById('muteBtn');
    const muteIcon = document.getElementById('muteIcon');
    const videoBtn = document.getElementById('videoBtn');
    const videoIcon = document.getElementById('videoIcon');
    const localMuteIndicator = document.getElementById('localMuteIndicator');
    
    if (muteBtn) muteBtn.className = 'control-btn';
    if (muteIcon) muteIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    if (videoBtn) videoBtn.className = 'control-btn';
    if (videoIcon) videoIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    if (localMuteIndicator) localMuteIndicator.style.display = 'none';
    
    // Hide video section
    document.getElementById('videoCallSection').style.display = 'none';
    document.getElementById('participantsPanel').style.display = 'none';
    document.getElementById('chatSection').style.display = 'none';
    
    // Reset call variables
    currentRoomId = null;
    currentGroupId = null;
    callStartTime = null;
    chatMessages = [];
    chatVisible = false;
    unreadCount = 0;
}

// Modal functions
function openEditCallModal() {
    document.getElementById('editCallModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditCallModal() {
    document.getElementById('editCallModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function saveCallDetails() {
    const title = document.getElementById('editCallTitle').value;
    
    // Update group info
    const group = groups.find(g => g.id === currentGroupId);
    if (group) {
        group.name = title;
        document.getElementById('videoGroupName').textContent = title;
        renderGroups();
    }
    
    closeEditCallModal();
}

function openParticipantsPanel() {
    updateParticipantsPanel();
    document.getElementById('participantsPanel').style.display = 'flex';
}

function closeParticipantsPanel() {
    document.getElementById('participantsPanel').style.display = 'none';
}

function updateParticipantsPanel() {
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    // Add self
    const userName = getCurrentUser()?.fullname || 'Vous';
    participantsList.innerHTML += `
        <div class="participant-item" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 10px; display: flex; align-items: center; gap: 15px;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #091346, #44AA99); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                ${userName.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
                <div style="color: white; font-weight: 500;">${userName}</div>
                <div style="color: rgba(255,255,255,0.5); font-size: 12px;">Vous (Organisateur)</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${isMuted ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>` : ''}
                ${isVideoOff ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>` : ''}
            </div>
        </div>
    `;
    
    // Add other participants
    Object.entries(participantStates).forEach(([socketId, state]) => {
        participantsList.innerHTML += `
            <div class="participant-item" onclick="openParticipantActions({ socketId: '${socketId}', name: '${state.name}' })" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; display: flex; align-items: center; gap: 15px; cursor: pointer; transition: background 0.2s;">
                <div style="width: 40px; height: 40px; background: #333; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                    ${state.name.charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1;">
                    <div style="color: white; font-weight: 500;">${state.name}</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 12px;">Connecté</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${state.isMuted ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>` : ''}
                    ${state.isVideoOff ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg>` : ''}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>
        `;
    });
}

function openParticipantActions(participant) {
    selectedParticipant = participant;
    document.getElementById('participantModalTitle').innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        ${participant.name}
    `;
    
    const state = participantStates[participant.socketId] || { isMuted: false, isVideoOff: false };
    
    document.getElementById('toggleMuteBtn').innerHTML = state.isMuted ? 
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/></svg><span>Activer le micro</span>` :
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg><span>Désactiver le micro</span>`;
    
    document.getElementById('toggleVideoBtn').innerHTML = state.isVideoOff ?
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span>Activer la caméra</span>` :
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg><span>Désactiver la caméra</span>`;
    
    document.getElementById('participantActionsModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeParticipantActionsModal() {
    document.getElementById('participantActionsModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    selectedParticipant = null;
}

function toggleParticipantMute() {
    if (!selectedParticipant) return;
    
    const state = participantStates[selectedParticipant.socketId] || { isMuted: false, isVideoOff: false };
    state.isMuted = !state.isMuted;
    participantStates[selectedParticipant.socketId] = state;
    
    // Update mute indicator
    const muteIndicator = document.getElementById(`mute_${selectedParticipant.socketId}`);
    if (muteIndicator) {
        muteIndicator.style.display = state.isMuted ? 'flex' : 'none';
    }
    
    // Send update to participant via socket
    if (socket) {
        socket.emit('participant-mute-update', { 
            roomId: currentRoomId, 
            targetId: selectedParticipant.socketId,
            isMuted: state.isMuted 
        });
    }
    
    updateParticipantsPanel();
    closeParticipantActionsModal();
}

function toggleParticipantVideo() {
    if (!selectedParticipant) return;
    
    const state = participantStates[selectedParticipant.socketId] || { isMuted: false, isVideoOff: false };
    state.isVideoOff = !state.isVideoOff;
    participantStates[selectedParticipant.socketId] = state;
    
    // Update video off indicator
    const videoOffIndicator = document.getElementById(`videooff_${selectedParticipant.socketId}`);
    if (videoOffIndicator) {
        videoOffIndicator.style.display = state.isVideoOff ? 'flex' : 'none';
    }
    
    const videoElement = document.getElementById(`video_${selectedParticipant.socketId}`);
    if (videoElement) {
        videoElement.style.opacity = state.isVideoOff ? '0.2' : '1';
    }
    
    // Send update to participant via socket
    if (socket) {
        socket.emit('participant-video-update', { 
            roomId: currentRoomId, 
            targetId: selectedParticipant.socketId,
            isVideoOff: state.isVideoOff 
        });
    }
    
    updateParticipantsPanel();
    closeParticipantActionsModal();
}

function removeParticipant() {
    if (!selectedParticipant) return;
    
    if (!confirm('Voulez-vous retirer ce participant?')) return;
    
    if (socket) {
        socket.emit('remove-participant', { 
            roomId: currentRoomId, 
            targetId: selectedParticipant.socketId 
        });
    }
    
    removeRemoteParticipant(selectedParticipant.socketId);
    updateParticipantCount();
    closeParticipantActionsModal();
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
});

// Initialize user avatar
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

// Chat functions
function toggleChat() {
    chatVisible = !chatVisible;
    const chatSection = document.getElementById('chatSection');
    const chatBtn = document.getElementById('chatToggleBtn');
    
    if (chatVisible) {
        chatSection.style.display = 'flex';
        chatBtn.classList.add('active');
        unreadCount = 0;
        updateUnreadBadge();
        document.getElementById('chatInput').focus();
    } else {
        chatSection.style.display = 'none';
        chatBtn.classList.remove('active');
    }
}

function updateUnreadBadge() {
    const badge = document.getElementById('unreadBadge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

function addChatMessage(senderId, senderName, text, timestamp) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const currentUserId = getCurrentUser()?.id;
    const isSent = senderId === currentUserId || senderId === socket?.id;
    const time = timestamp ? new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    messageEl.innerHTML = `
        <div class="message-bubble">${escapeHtml(text)}</div>
        <div class="message-meta">
            <span class="message-sender">${isSent ? 'Vous' : senderName}</span>
            <span class="message-time">${time}</span>
        </div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    chatMessages.push({ senderId, senderName, text, timestamp: new Date() });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const userName = getCurrentUser()?.fullname || 'Psychologue';
    
    // Add message locally
    addChatMessage(socket?.id, userName, text, new Date());
    
    // Send to server
    if (socket) {
        socket.emit('chat-message', {
            roomId: currentRoomId,
            fromId: socket.id,
            fromName: userName,
            text: text,
            timestamp: new Date().toISOString()
        });
    }
    
    input.value = '';
    document.getElementById('sendBtn').disabled = true;
}

function handleChatKeyPress(e) {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    
    // Enable/disable send button
    sendBtn.disabled = input.value.trim() === '';
    
    // Send on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
    
    // Emit typing indicator
    if (socket && input.value.trim()) {
        socket.emit('chat-typing', { roomId: currentRoomId, socketId: socket.id, isTyping: true });
        clearTimeout(window.typingTimeout);
        window.typingTimeout = setTimeout(() => {
            socket.emit('chat-typing', { roomId: currentRoomId, socketId: socket.id, isTyping: false });
        }, 2000);
    }
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    picker.classList.toggle('show');
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
    toggleEmojiPicker();
    document.getElementById('sendBtn').disabled = false;
}

function clearChat() {
    chatMessages = [];
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
}