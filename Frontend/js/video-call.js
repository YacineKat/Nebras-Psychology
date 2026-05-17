// ============================================
// VIDEO CALL PAGE - Handles video call connection
// ============================================

// Catch unhandled promise rejections globally to identify source
window.addEventListener('unhandledrejection', (event) => {
    console.error('UNHANDLED PROMISE REJECTION:', event.reason?.message || event.reason);
    if (event.reason?.stack) {
        console.error('STACK:', event.reason.stack.split('\n').slice(0, 4).join('\n'));
    }
});

let currentUser = null;
let roomId = null;
let isDoctor = false;
let isGroupCall = false;
let groupId = null;
let sessionAppointmentId = null;
let chatPartnerId = null;
let callStartTime = null;
let callTimerInterval = null;
let lastRenderedChatSignature = null;
let renderedCallMessageIds = new Set();
let callMessagingSocket = null;
let callMessagingSocketBound = false;

// Media state
let localStream = null;
let isMuted = true;
let isVideoOff = true;

// Group call: multiple peer connections (indexed by socketId)
let peerConnections = {};
let otherParticipants = {};
let isEndingCall = false;
let doctorIdForRating = null;
let doctorNameForRating = null;

// Doctor group call state
let participantStates = {};
let sessionEndTime = null;
let isScreenSharing = false;
let originalVideoTrack = null;
let doctorGroupDetails = null;

// Avatar images
let localAvatarUrl = null;
let remoteAvatarUrl = null;
let remoteVideoOff = true; // assume OFF until we know otherwise
let groupCallDuration = 90; // minutes, used to start countdown on first participant join

// Pre-fetched participant avatars for group calls: { [userId]: avatarUrl }
let participantAvatars = {};

function primeParticipantAvatars(groupData) {
    if (!groupData) return;

    const doctor = groupData.doctor || groupData.psychologue;
    if (doctor?.id && doctor.avatar) {
        participantAvatars[doctor.id] = doctor.avatar;
    }

    const participants = groupData.participants || [];
    participants.forEach((participant) => {
        if (participant?.userId && participant.avatar) {
            participantAvatars[participant.userId] = participant.avatar;
        }
    });
}

const AVATAR_COLORS = ['#44AA99', '#091346', '#EF4444', '#F59E0B', '#6366F1', '#EC4899', '#14B8A6', '#F97316'];

function getAvatarColor(name) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function setAvatarInitial(elementId, name, imageUrl) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (imageUrl) {
        el.innerHTML = `<img src="${encodeURI(imageUrl)}" alt="${name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
        el.style.background = 'transparent';
    } else {
        el.textContent = name ? name.charAt(0).toUpperCase() : '?';
        el.style.background = getAvatarColor(name);
    }
}

// P2P Connection
let peerConnection = null;
const videoServerUrl = window.APP_CONFIG.videoServerUrl;
let videoSocket = null;

// Other participant info
let otherParticipantId = null;
let otherParticipantName = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }
    
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }
    
    // Get parameters from URL
    // Support both old scheme (type=doctor|patient|group) and new scheme (mode=single|group + role=doctor|patient)
    const params = new URLSearchParams(window.location.search);
    roomId = params.get('room');
    const type = params.get('type');
    const mode = params.get('mode');
    const role = params.get('role');
    isDoctor = role === 'doctor' || type === 'doctor';
    isGroupCall = mode === 'group' || type === 'group';
    groupId = params.get('groupId');
    sessionAppointmentId = params.get('appointment');
    
    if (!roomId) {
        showError('Paramètres de session invalides');
        return;
    }
    
    // Patient profile modal backdrop close
    document.getElementById('patientProfileModal')?.addEventListener('click', function(e) {
        if (e.target === this) closePatientModal();
    });
    
    if (isGroupCall) {
        document.getElementById('callTitle').textContent = 'Appel de groupe thérapeutique';
        document.getElementById('remotePlaceholderText').textContent = 'Connexion à la session de groupe...';
        if (isDoctor) {
            await initializeDoctorGroupCall();
        } else {
            await initializeGroupCall();
        }
        return;
    }
    
    if (!sessionAppointmentId) {
        showError('Paramètres de session invalides');
        return;
    }
    
    // Update UI with user info
    const userName = currentUser.fullname || 'Vous';
    document.getElementById('localName').textContent = userName;
    localAvatarUrl = currentUser.profile?.avatar || null;
    setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);
    document.getElementById('callTitle').textContent = isDoctor ? 'Appel vidéo avec patient' : 'Appel vidéo avec psychologue';
    
    if (isDoctor) {
        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) screenShareBtn.style.display = 'flex';
    }
    
    // Initialize connections
    await initializeSession();
});

async function initializeSession() {
    try {
        // Verify session is still active
        const status = await appointmentAPI.getMyCallStatus();
        
        if (!status.inCall || status.appointmentId !== sessionAppointmentId) {
            showError('La session n\'est plus active');
            setTimeout(() => {
                window.location.href = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
            }, 2000);
            return;
        }

        // Media first, so localStream is ready when PC is created
        await initializeMedia();

        // Fetch appointment data BEFORE signaling to populate remoteAvatarUrl
        // (avoids race where onconnectionstatechange fires before avatar URL is available)
        let appointmentData = null;
        if (sessionAppointmentId) {
            try {
                const resp = await appointmentAPI.getById(sessionAppointmentId);
                if (resp) {
                    appointmentData = resp.appointment || resp;
                    if (isDoctor) {
                        remoteAvatarUrl = appointmentData.patient?.profile?.avatar || null;
                        remoteAvatarUrl = remoteAvatarUrl || appointmentData.patient?.avatar || null;
                        chatPartnerId = appointmentData.patientId;
                    } else {
                        remoteAvatarUrl = appointmentData.doctor?.profile?.avatar || null;
                        remoteAvatarUrl = remoteAvatarUrl || appointmentData.doctor?.avatar || null;
                        chatPartnerId = appointmentData.doctorId;
                        doctorIdForRating = appointmentData.doctorId;
                        doctorNameForRating = appointmentData.doctor?.fullname || 'Psychologue';
                    }
                }
            } catch (e) {
                console.log('Could not load appointment details:', e);
            }
        }

        // Then start signaling + chat in parallel
        await Promise.all([
            connectToVideoServer(),
            initializeCallChat(appointmentData)
        ]);

        // Timer starts on ICE connected (both participants at the same time)
        
    } catch (error) {
        console.error('Init error:', error);
        showError('Erreur lors de l\'initialisation');
    }
}

async function initializeGroupCall() {
    // Update UI
    const userName = currentUser.fullname || 'Vous';
    document.getElementById('localName').textContent = userName;
    localAvatarUrl = currentUser.profile?.avatar || null;
    console.log('[AvatarDebug] Patient localAvatarUrl:', localAvatarUrl ? localAvatarUrl.substring(0, 80) + '...' : null);
    setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);

    // Get doctor name from storage if available
    const doctorId = new URLSearchParams(window.location.search).get('doctorId');
    doctorIdForRating = doctorId;
    doctorNameForRating = sessionStorage.getItem('groupCallDoctorName') || 'Psychologue';

    // Hide static 1-on-1 elements for group calls
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    if (remotePlaceholder) remotePlaceholder.style.display = 'none';
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (remoteContainer) remoteContainer.style.display = 'none';

    // Pre-fetch known participant avatars before joining
    participantAvatars = {};
    if (currentUser?.id && currentUser?.profile?.avatar) {
        participantAvatars[currentUser.id] = currentUser.profile.avatar;
    }
    if (groupId) {
        try {
            const token = localStorage.getItem('nebras_token');
            const resp = await fetch(window.API_URL + '/my-groups', {
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            });
            if (resp.ok) {
                const data = await resp.json();
                const group = (data.groups || []).find((item) => item.id === groupId);
                primeParticipantAvatars(group);
                if (group?.doctor?.id) {
                    doctorIdForRating = group.doctor.id;
                }
                if (group?.doctor?.name) {
                    doctorNameForRating = group.doctor.name;
                }
            }
        } catch (e) {
            console.log('[Avatar] Pre-fetch group avatars error:', e.message);
        }
    }

    try {
        await initializeMedia();
        await connectGroupToVideoServer();
    } catch (error) {
        console.error('Group call init error:', error);
        showError('Erreur lors de l\'initialisation de l\'appel de groupe');
    }
}

async function initializeDoctorGroupCall() {
    const userName = currentUser.fullname || 'Vous';
    document.getElementById('localName').textContent = userName;
    localAvatarUrl = currentUser.profile?.avatar || null;
    console.log('[AvatarDebug] Doctor localAvatarUrl:', localAvatarUrl ? localAvatarUrl.substring(0, 80) + '...' : null);
    setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);

    // Show doctor-only UI elements
    const editCallBtn = document.getElementById('editCallBtn');
    if (editCallBtn) editCallBtn.style.display = 'flex';
    const screenShareBtn = document.getElementById('screenShareBtn');
    if (screenShareBtn) screenShareBtn.style.display = 'flex';

    // Hide 1-on-1 specific elements
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    if (remotePlaceholder) remotePlaceholder.style.display = 'none';
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (remoteContainer) remoteContainer.style.display = 'none';

    // Get duration for countdown timer (starts when first patient joins)
    groupCallDuration = parseInt(sessionStorage.getItem('groupCallDuration') || '90', 10);
    const groupName = sessionStorage.getItem('groupCallName') || 'Session de groupe';
    document.getElementById('callTitle').textContent = groupName;

    // Pre-fetch participant avatars before joining
    participantAvatars = {};
    if (currentUser?.id && currentUser?.profile?.avatar) {
        participantAvatars[currentUser.id] = currentUser.profile.avatar;
    }

    // Load group details from API for edit modal + prefetch member avatars
    if (groupId) {
        try {
            const token = localStorage.getItem('nebras_token');
            const resp = await fetch(window.API_URL + '/psychologue/groups/' + groupId, {
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            });
            if (resp.ok) {
                const data = await resp.json();
                doctorGroupDetails = data.group || data;
                primeParticipantAvatars(doctorGroupDetails);
            }
        } catch (e) {
            console.log('Could not load group details for doctor');
        }
    }

    try {
        await initializeMedia();
        await doctorConnectGroupToVideoServer();
        initDoctorMainSocket();
    } catch (error) {
        console.error('Doctor group call init error:', error);
        showError('Erreur lors de l\'initialisation de l\'appel de groupe');
    }
}

async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Attach raw stream to local video element for preview with CSS mirror
        const videoEl = document.getElementById('localVideo');
        if (videoEl) {
            videoEl.srcObject = localStream;
            videoEl.style.transform = 'scaleX(-1)';
            videoEl.play().catch(e => console.log('Play error:', e));
        }
        
        // Start with camera and microphone OFF by default
        localStream.getVideoTracks()[0].enabled = false;
        localStream.getAudioTracks()[0].enabled = false;
        
        isMuted = true;
        isVideoOff = true;
        updateMuteButton();
        updateVideoButton();
        
    } catch (error) {
        console.error('Media error:', error);
        showError('Erreur d\'accès à la caméra/micro');
    }
}

async function connectToVideoServer() {
    return new Promise((resolve, reject) => {
        videoSocket = io(videoServerUrl, {
            transports: ['polling', 'websocket']
        });

        videoSocket.on('connect', () => {
            console.log('Connected to video server');
            
            const userName = currentUser.fullname || 'User';
            // Don't send avatarUrl: in 1:1 calls it's redundant (from appointment data)
            // and may exceed engine.io's buffer limit if it's a long data URI
            videoSocket.emit('join-room', { roomId, userName }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                
                console.log('[P2P] Joined room:', response);
                
                // Store other participants
                if (response.participants && response.participants.length > 0) {
                    otherParticipantId = response.participants[0].id;
                    otherParticipantName = response.participants[0].name;
                    console.log('[P2P] Other participant:', otherParticipantName, otherParticipantId);
                    // Notify existing participant that camera is OFF (default state)
                    videoSocket.emit('participant-video-update', {
                        roomId,
                        targetId: otherParticipantId,
                        isVideoOff: true
                    });
                }
                
                // Create P2P connection (tracks attached inside createPeerConnection)
                // onnegotiationneeded fires from addTrack and creates offer for doctor
                createPeerConnection();
                console.log('[P2P] PC created, local tracks:', localStream?.getTracks().length || 0);
                
                resolve();
            });
        });
        
        videoSocket.on('connect_error', (error) => {
            console.error('Video server connection error:', error);
            reject(error);
        });
        
        // Handle participant joined - this is for when the OTHER person joins
        videoSocket.on('participant-joined', (participant) => {
            console.log('Participant joined:', participant);
            otherParticipantId = participant.id;
            otherParticipantName = participant.name;
            setAvatarInitial('remoteAvatarCircle', otherParticipantName, remoteAvatarUrl);
            
            // Send current video state so the new participant knows
            if (videoSocket?.connected && isVideoOff) {
                videoSocket.emit('participant-video-update', {
                    roomId,
                    targetId: otherParticipantId,
                    isVideoOff
                });
            }
            
            if (isDoctor && peerConnection && otherParticipantId) {
                createAndSendOffer();
            }
        });
        
        // P2P Signaling
        videoSocket.on('p2p-offer', async ({ offer, fromId, fromName }) => {
            console.log('[P2P] Received offer from:', fromName);
            otherParticipantId = fromId;
            otherParticipantName = fromName;
            setAvatarInitial('remoteAvatarCircle', otherParticipantName, remoteAvatarUrl);
            
            if (!peerConnection) {
                createPeerConnection();
                console.log('[P2P] PC created on offer (tracks attached)');
            }
            await handleOffer(offer);
            await createAndSendAnswer();
        });
        
        videoSocket.on('p2p-answer', async ({ answer, fromId }) => {
            console.log('[P2P] Received answer from:', fromId);
            await handleAnswer(answer);
        });
        
        videoSocket.on('p2p-ice-candidate', async ({ candidate, fromId }) => {
            console.log('[P2P] Received ICE candidate from:', fromId);
            await handleIceCandidate(candidate);
        });
        
        // Remote video state: hide/show avatar when other participant toggles camera
        videoSocket.on('participant-video-update', ({ isVideoOff: off }) => {
            console.log('Remote video state:', off ? 'OFF' : 'ON');
            remoteVideoOff = off;
            const remoteVideo = document.getElementById('remoteVideo');
            const remoteAvatar = document.getElementById('remoteAvatar');
            if (off) {
                if (remoteVideo) remoteVideo.style.display = 'none';
                if (remoteAvatar) remoteAvatar.style.display = 'flex';
            } else {
                if (remoteVideo) {
                    remoteVideo.style.display = 'block';
                    remoteVideo.play().catch(() => {});
                }
                if (remoteAvatar) remoteAvatar.style.display = 'none';
            }
        });
        
        videoSocket.on('participant-left', ({ socketId }) => {
            console.log('Participant left');
            if (socketId === otherParticipantId) {
                handleParticipantLeft();
                otherParticipantId = null;
            }
        });
        
        videoSocket.on('disconnect', (reason) => {
            console.log('Video server disconnected, reason:', reason);
        });
    });
}

// Group call: connect to video server with multi-P2P support
function connectGroupToVideoServer() {
    return new Promise((resolve, reject) => {
        videoSocket = io(videoServerUrl, {
            transports: ['polling', 'websocket']
        });

        videoSocket.on('connect', () => {
            console.log('Connected to video server for group call');
            const userName = currentUser.fullname || 'Patient';
            const joinPayload = { roomId, userName, userId: currentUser.id };
            if (localAvatarUrl && !localAvatarUrl.startsWith('data:')) {
                joinPayload.avatarUrl = localAvatarUrl;
            }
            videoSocket.emit('join-room', joinPayload, async (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                console.log('[GroupCall] Joined group room:', response);
                if (response.participants && response.participants.length > 0) {
                    response.participants.forEach(p => {
                        setupGroupPeerConnection(p, true);
                    });
                }
                // Notify others of our video state (starts OFF by default)
                if (videoSocket?.connected) {
                    videoSocket.emit('participant-update', {
                        roomId,
                        socketId: videoSocket.id,
                        isVideoOff
                    });
                }
                resolve();
            });
        });

        videoSocket.on('connect_error', (error) => {
            console.error('Group video server connection error:', error);
            reject(error);
        });

        // New participant joined
        videoSocket.on('participant-joined', (participant) => {
            console.log('[GroupCall] Participant joined:', participant.name);
            setupGroupPeerConnection(participant, false);
            // Send current video state so the new participant knows our display
            if (videoSocket?.connected) {
                videoSocket.emit('participant-update', {
                    roomId,
                    socketId: videoSocket.id,
                    isVideoOff
                });
            }
        });

        videoSocket.on('participant-left', ({ socketId }) => {
            console.log('Group participant left:', socketId);
            removeGroupParticipant(socketId);
        });

        // P2P signaling for each peer
        videoSocket.on('p2p-offer', ({ offer, fromId, fromName }) => {
            console.log('[GroupCall] Received offer from:', fromName);
            if (!peerConnections[fromId]) {
                console.log('[GroupCall] Creating PC for incoming offer from', fromName);
                setupGroupPeerConnection({ id: fromId, name: fromName, socketId: fromId }, false);
            }
            const pc = peerConnections[fromId];
            if (pc && (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer')) {
                console.log(`[GroupCall] Setting remote description from ${fromName} (state: ${pc.signalingState})`);
                pc.setRemoteDescription(new RTCSessionDescription(offer))
                    .then(() => createAndSendGroupAnswer(fromId))
                    .catch(e => console.log('[GroupCall] Offer setRemote error:', e));
            } else {
                console.log('[GroupCall] Ignoring offer, PC state:', pc?.signalingState);
            }
        });

        videoSocket.on('p2p-answer', ({ answer, fromId }) => {
            const pc = peerConnections[fromId];
            if (pc && pc.signalingState === 'have-local-offer') {
                console.log(`[GroupCall] Setting remote description (answer) from ${fromId}, answer has video:`, answer.sdp.includes('m=video'));
                pc.setRemoteDescription(new RTCSessionDescription(answer)).then(() => {
                    console.log('[GroupCall] Transceivers after answer:', pc.getTransceivers().map(t => `${t.mid}:${t.currentDirection}`).join(', '));
                }).catch(e => console.log('[GroupCall] Answer set error:', e));
            } else {
                console.log(`[GroupCall] Ignoring answer from ${fromId}, state: ${pc?.signalingState}`);
            }
        });

        videoSocket.on('p2p-ice-candidate', ({ candidate, fromId }) => {
            const pc = peerConnections[fromId];
            if (pc && pc.connectionState !== 'closed' && pc.signalingState !== 'closed') {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.log('[GroupCall] ICE add error:', e));
            }
        });

        // Remote participant video state
        videoSocket.on('participant-video-update', ({ socketId, isVideoOff: off }) => {
            if (off !== undefined && socketId) {
                remoteVideoOff = off;
                updateGroupParticipantTileVideo(socketId, off);
            }
        });
        // Handle broadcast participant state updates from group host
        videoSocket.on('participant-update', (payload) => {
            const { isVideoOff, isMuted, socketId } = payload || {};
            console.log(`[GroupCall] participant-update: isVideoOff=${isVideoOff}, isMuted=${isMuted}`);
            if (isVideoOff !== undefined && socketId) {
                remoteVideoOff = isVideoOff;
                updateGroupParticipantTileVideo(socketId, isVideoOff);
            }
            if (isMuted !== undefined && socketId) {
                const muteBadge = document.getElementById(`mute_${socketId}`);
                if (muteBadge) muteBadge.style.display = isMuted ? 'flex' : 'none';
            }
        });

        // Group chat: receive messages from the room
        videoSocket.on('chat-message', ({ fromId, fromName, text, timestamp }) => {
            console.log(`[GroupCall] Chat message from ${fromName}: ${text}`);
            const currentUserId = currentUser?.id;
            const isSent = fromId === videoSocket?.id || fromName === currentUser?.fullname;
            const msg = {
                senderId: isSent ? currentUserId : fromId,
                fromName: fromName || 'Inconnu',
                text: text || '',
                timestamp: timestamp || new Date().toISOString(),
                isSent
            };
            displayGroupChatMessage(msg);
        });

        // Room closed — doctor ended the group call
        videoSocket.on('room-closed', () => {
            console.log('Group room closed by host');
            handleGroupCallEnded();
        });

        // Removed by doctor
        videoSocket.on('remove-participant', () => {
            console.log('Removed from group by doctor');
            if (typeof showToast === 'function') {
                showToast('Vous avez été retiré de la session', 'info');
            }
            handleGroupCallEnded();
        });

        videoSocket.on('disconnect', (reason) => {
            console.log('Group video server disconnected, reason:', reason);
        });
    });
}

// ============================================
// DOCTOR GROUP CALL: Signaling connection
// ============================================

function doctorConnectGroupToVideoServer() {
    return new Promise((resolve, reject) => {
        videoSocket = io(videoServerUrl, {
            transports: ['polling', 'websocket']
        });

        videoSocket.on('connect', () => {
            console.log('[DoctorGroup] Connected to video server');
            const userName = currentUser.fullname || 'Psychologue';
            const joinPayload = { roomId, userName, userId: currentUser.id };
            if (localAvatarUrl && !localAvatarUrl.startsWith('data:')) {
                joinPayload.avatarUrl = localAvatarUrl;
            }
            videoSocket.emit('join-room', joinPayload, async (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                console.log('[DoctorGroup] Joined room as host:', response);
                if (response.participants && response.participants.length > 0) {
                    response.participants.forEach(p => {
                        setupGroupPeerConnection(p, true);
                    });
                }
                // Notify others of our video state (starts OFF by default)
                if (videoSocket?.connected) {
                    videoSocket.emit('participant-update', {
                        roomId,
                        socketId: videoSocket.id,
                        isVideoOff
                    });
                }
                resolve();
            });
        });

        videoSocket.on('connect_error', (error) => {
            console.error('[DoctorGroup] Connection error:', error);
            reject(error);
        });

        videoSocket.on('participant-joined', (participant) => {
            console.log('[DoctorGroup] Participant joined:', participant.name);
            setupGroupPeerConnection(participant, false);
            if (videoSocket?.connected) {
                videoSocket.emit('participant-update', {
                    roomId,
                    socketId: videoSocket.id,
                    isVideoOff
                });
            }
        });

        videoSocket.on('participant-left', ({ socketId }) => {
            console.log('[DoctorGroup] Participant left:', socketId);
            removeGroupParticipant(socketId);
        });

        videoSocket.on('p2p-offer', ({ offer, fromId, fromName }) => {
            if (!peerConnections[fromId]) {
                setupGroupPeerConnection({ id: fromId, name: fromName, socketId: fromId }, false);
            }
            const pc = peerConnections[fromId];
            if (pc && (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer')) {
                pc.setRemoteDescription(new RTCSessionDescription(offer))
                    .then(() => createAndSendGroupAnswer(fromId))
                    .catch(e => console.log('[DoctorGroup] Offer setRemote error:', e));
            }
        });

        videoSocket.on('p2p-answer', ({ answer, fromId }) => {
            const pc = peerConnections[fromId];
            if (pc && pc.signalingState === 'have-local-offer') {
                pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(e => console.log('[DoctorGroup] Answer set error:', e));
            }
        });

        videoSocket.on('p2p-ice-candidate', ({ candidate, fromId }) => {
            const pc = peerConnections[fromId];
            if (pc && pc.connectionState !== 'closed' && pc.signalingState !== 'closed') {
                pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.log('[DoctorGroup] ICE error:', e));
            }
        });

        videoSocket.on('participant-video-update', ({ socketId, isVideoOff: off }) => {
            if (off !== undefined && socketId) {
                updateGroupParticipantTileVideo(socketId, off);
            }
        });

        videoSocket.on('participant-update', (payload) => {
            const { isVideoOff, isMuted, socketId } = payload || {};
            if (isVideoOff !== undefined && socketId) {
                updateGroupParticipantTileVideo(socketId, isVideoOff);
            }
            if (isMuted !== undefined && socketId) {
                const muteBadge = document.getElementById(`mute_${socketId}`);
                if (muteBadge) muteBadge.style.display = isMuted ? 'flex' : 'none';
            }
        });

        videoSocket.on('chat-message', ({ fromId, fromName, text, timestamp }) => {
            const isSent = fromId === videoSocket?.id || fromName === currentUser?.fullname;
            displayGroupChatMessage({
                senderId: isSent ? (currentUser?.id) : fromId,
                fromName: fromName || 'Inconnu',
                text: text || '',
                timestamp: timestamp || new Date().toISOString(),
                isSent
            });
        });

        videoSocket.on('room-closed', () => {
            console.log('[DoctorGroup] Room closed');
            endCall();
        });

        videoSocket.on('disconnect', (reason) => {
            console.log('[DoctorGroup] Disconnected, reason:', reason);
        });
    });
}

// ============================================
// PATIENT GROUP CALL: Multi-participant tile management
// ============================================

function addGroupParticipantTile(participant) {
    const grid = document.getElementById('participantGrid');
    if (!grid) return null;
    const existing = document.getElementById(`participant_${participant.id}`);
    if (existing) return document.getElementById(`video_${participant.id}`);

    const tile = document.createElement('div');
    tile.id = `participant_${participant.id}`;
    tile.className = 'participant-tile tile-enter';

    const video = document.createElement('video');
    video.id = `video_${participant.id}`;
    video.autoplay = true;
    video.playsinline = true;

    const avatarEl = document.createElement('div');
    avatarEl.id = `avatar_${participant.id}`;
    avatarEl.className = 'tile-avatar';
    avatarEl.style.display = 'flex';
    // Use pre-fetched avatar from participantAvatars map
    const avatarUrl = participant.avatarUrl || participantAvatars?.[participant?.userId] || null;
    console.log('[Avatar] addGroupParticipantTile for', participant.name, 'avatarUrl:', avatarUrl ? avatarUrl.substring(0, 60) + '...' : 'null', 'userId:', participant.userId);
    const circle = document.createElement('div');
    circle.className = 'avatar-circle';
    circle.style.background = avatarUrl ? 'transparent' : getAvatarColor(participant.name);
    if (avatarUrl) {
        circle.innerHTML = `<img src="${encodeURI(avatarUrl)}" alt="${participant.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
        circle.textContent = (participant.name || '?')[0].toUpperCase();
    }
    avatarEl.appendChild(circle);

    const info = document.createElement('div');
    info.className = 'tile-info';
    info.textContent = participant.name || 'Participant';

    const muteBadge = document.createElement('div');
    muteBadge.id = `mute_${participant.id}`;
    muteBadge.className = 'tile-badge badge-mute';
    muteBadge.style.display = 'none';
    muteBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`;

    const videoOffBadge = document.createElement('div');
    videoOffBadge.id = `videooff_${participant.id}`;
    videoOffBadge.className = 'tile-badge badge-videooff';
    videoOffBadge.style.display = 'flex';
    videoOffBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg>`;

    tile.appendChild(video);
    tile.appendChild(avatarEl);
    tile.appendChild(info);
    tile.appendChild(muteBadge);
    tile.appendChild(videoOffBadge);
    grid.appendChild(tile);

    setTimeout(() => tile.classList.remove('tile-enter'), 350);
    updateGridLayout();

    return video;
}

function removeGroupParticipantTile(socketId) {
    const tile = document.getElementById(`participant_${socketId}`);
    if (tile) {
        tile.classList.add('tile-exit');
        setTimeout(() => {
            tile.remove();
            updateGridLayout();
        }, 250);
    }
}

function updateGridLayout() {
    const grid = document.getElementById('participantGrid');
    if (!grid) return;
    const participantTiles = grid.querySelectorAll('[id^="participant_"]');
    const remoteCount = participantTiles.length;
    const hasLocal = !!document.getElementById('localVideoContainer');
    const total = remoteCount + (hasLocal ? 1 : 0);
    grid.className = grid.className.split(' ').filter(c => !c.startsWith('count-')).join(' ').trim();
    const count = Math.min(Math.max(total, 0), 16);
    grid.classList.add(`count-${count}`);

    // Update participant count display
    const countText = document.getElementById('participantCountText');
    if (countText) {
        if (total > 1) {
            countText.textContent = `${total} participants`;
            countText.style.display = 'inline';
        } else if (total === 1) {
            countText.textContent = `1 participant`;
            countText.style.display = 'inline';
        } else {
            countText.style.display = 'none';
        }
    }
}

function updateGroupParticipantTileVideo(socketId, isOff) {
    const videoEl = document.getElementById(`video_${socketId}`);
    const avatarEl = document.getElementById(`avatar_${socketId}`);
    const videoOffBadge = document.getElementById(`videooff_${socketId}`);
    if (videoEl) videoEl.style.display = isOff ? 'none' : 'block';
    if (avatarEl) avatarEl.style.display = isOff ? 'flex' : 'none';
    if (videoOffBadge) videoOffBadge.style.display = isOff ? 'flex' : 'none';
}

function setupGroupPeerConnection(participant, shouldInitiate = false) {
    if (peerConnections[participant.id]) {
        otherParticipants[participant.id] = {
            ...(otherParticipants[participant.id] || {}),
            ...participant
        };

        const existingP = otherParticipants[participant.id];
        const existingAvatar = existingP?.avatarUrl || participantAvatars?.[existingP?.userId] || null;
        if (existingAvatar) {
            const circle = document.querySelector(`#participant_${participant.id} .avatar-circle`);
            if (circle) {
                circle.style.background = 'transparent';
                circle.innerHTML = `<img src="${encodeURI(existingAvatar)}" alt="${participant.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
            }
        }

        return;
    }
    console.log(`[GroupCall] Setting up P2P with ${participant.name} (${shouldInitiate ? 'initiator' : 'responder'})`);

    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const pc = new RTCPeerConnection(config);
    peerConnections[participant.id] = pc;
    otherParticipants[participant.id] = participant;

    // Create tile for this participant
    const videoEl = addGroupParticipantTile(participant);

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try { pc.addTrack(track, localStream); } catch (e) {}
        });
    }

    // Per-participant remote stream
    const remoteStream = new MediaStream();
    if (videoEl) {
        videoEl.srcObject = remoteStream;
    }

    pc.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        if (videoEl && event.track.kind === 'video') {
            videoEl.srcObject = null;
            videoEl.srcObject = remoteStream;
        }
    };

    // Fallback: after 3s pull video receiver track directly if ontrack never fired
    setTimeout(() => {
        const receivers = pc.getReceivers();
        const hasVideoReceiver = receivers.some(r => r.track && r.track.kind === 'video');
        if (hasVideoReceiver && videoEl && remoteStream.getVideoTracks().length === 0) {
            const vTrack = receivers.find(r => r.track.kind === 'video').track;
            remoteStream.addTrack(vTrack);
            videoEl.srcObject = null;
            videoEl.srcObject = remoteStream;
        }
    }, 3000);

    pc.onicecandidate = (event) => {
        if (event.candidate && videoSocket) {
            videoSocket.emit('p2p-ice-candidate', {
                roomId,
                candidate: event.candidate,
                targetId: participant.id
            });
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            const placeholder = document.getElementById('remotePlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            const badge = document.getElementById('speakerBadge');
            if (badge) {
                badge.style.display = 'flex';
                const nameEl = document.getElementById('currentSpeakerName');
                if (nameEl) nameEl.textContent = participant.name || 'Participant';
            }
            if (!callTimerInterval) {
                callStartTime = Date.now();
                callTimerInterval = setInterval(updateCallDuration, 1000);
            }
        }
    };

    if (shouldInitiate && videoSocket) {
        createAndSendGroupOffer(participant.id);
    }
}

// Keep backward-compatible wrapper
function createGroupPeerConnection(participant) {
    setupGroupPeerConnection(participant, false);
}

function createAndSendGroupOffer(targetId) {
    const pc = peerConnections[targetId];
    if (!pc || pc.signalingState !== 'stable' || !videoSocket) return;
    console.log(`[GroupCall] Creating offer for ${targetId}`);
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            if (videoSocket) {
                videoSocket.emit('p2p-offer', {
                    roomId,
                    offer: pc.localDescription,
                    targetId
                });
                console.log(`[GroupCall] Sent offer to ${targetId}`);
            }
        })
        .catch(e => console.log('[GroupCall] Offer error:', e));
}

function createAndSendGroupAnswer(targetId) {
    const pc = peerConnections[targetId];
    if (!pc || !videoSocket) return;
    console.log(`[GroupCall] Creating answer for ${targetId} (state: ${pc.signalingState})`);
    pc.createAnswer()
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
            if (videoSocket) {
                videoSocket.emit('p2p-answer', {
                    roomId,
                    answer: pc.localDescription,
                    targetId
                });
                console.log(`[GroupCall] Sent answer to ${targetId}`);
            }
        })
        .catch(e => console.log('[GroupCall] Answer error:', e));
}

function removeGroupParticipant(socketId) {
    if (isEndingCall) return;
    try {
        if (peerConnections[socketId]) {
            peerConnections[socketId].close();
            delete peerConnections[socketId];
            delete otherParticipants[socketId];
        }
        removeGroupParticipantTile(socketId);
        // Doctor stays in room even if all patients leave; patient auto-exits
        if (!isDoctor && Object.keys(peerConnections).length === 0) {
            handleGroupCallEnded();
        }
    } catch (e) {
        console.log('removeGroupParticipant error:', e);
    }
}

function handleGroupCallEnded() {
    if (isEndingCall) return;
    isEndingCall = true;

    try {
        if (typeof showToast === 'function') {
            showToast('La session de groupe est terminée', 'info');
        }

        // Clean up WebRTC - stop all tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
            });
            localStream = null;
        }

        // Close all peer connections
        Object.values(peerConnections).forEach(pc => {
            try { if (pc) pc.close(); } catch (e) {}
        });
        peerConnections = {};
        otherParticipants = {};

        // Remove listeners then disconnect
        if (videoSocket) {
            videoSocket.removeAllListeners();
            videoSocket.disconnect();
            videoSocket = null;
        }

        // Stop call timer
        stopCallTimer();

        // Clear session storage to prevent stale state
        sessionStorage.removeItem('groupCallRoom');
        sessionStorage.removeItem('groupCallGroupId');
        sessionStorage.removeItem('groupCallDoctorId');
        sessionStorage.removeItem('groupCallDoctorName');

        // Clear chat
        groupChatMessages = [];
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) msgContainer.innerHTML = '';

        // Clear local video element
        const localVideoEl = document.getElementById('localVideo');
        if (localVideoEl) {
            localVideoEl.srcObject = null;
        }

        // Remove all remote participant tiles
        const grid = document.getElementById('participantGrid');
        if (grid) {
            const remoteTiles = grid.querySelectorAll('[id^="participant_"]');
            remoteTiles.forEach(t => t.remove());
        }

        const dashboardUrl = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
        // Show rating modal only if not already rated for this session
        const patientId = getCurrentUser()?.id || 'unknown';
        const ratingKey = `group_rated_${groupId}_${doctorIdForRating}_${patientId}`;
        if (!isDoctor && doctorIdForRating && groupId && !sessionStorage.getItem(ratingKey)) {
            showGroupRatingModal();
        } else if (!isDoctor && doctorIdForRating && groupId && sessionStorage.getItem(ratingKey)) {
            console.log('Rating already submitted for this session, skipping');
            window.location.href = dashboardUrl;
        } else {
            window.location.href = dashboardUrl;
        }
    } catch (e) {
        console.error('Error in group call cleanup:', e);
        const dashboardUrl = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
        window.location.href = dashboardUrl;
    }
}

function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    peerConnection = new RTCPeerConnection(config);
    
    // Set negotiation handler BEFORE adding tracks so addTrack fires it
    peerConnection.onnegotiationneeded = async () => {
        try {
            if (peerConnection.signalingState !== 'stable') return;
            if (isDoctor) {
                await createAndSendOffer();
            }
        } catch (err) {
            console.error('onnegotiationneeded error:', err);
        }
    };
    
    // Attach local tracks (after handler set, so addTrack fires onnegotiationneeded)
    if (localStream) {
        localStream.getTracks().forEach(track => {
            try { peerConnection.addTrack(track, localStream); } catch (e) { console.log('[P2P] addTrack error:', e); }
        });
        console.log('[P2P] Local tracks attached to PC');
    }
    
    // Create a single remote stream and attach it to the video element once
    const remoteStream = new MediaStream();
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
    }
    
    // Handle incoming tracks — add to the shared stream, never reassign srcObject
    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        console.log('[P2P] ontrack:', event.track.kind);
    };
    
    // Handle ICE candidates - send to specific participant
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && otherParticipantId) {
            console.log('[P2P] Sending ICE candidate to:', otherParticipantId);
            videoSocket.emit('p2p-ice-candidate', {
                roomId,
                candidate: event.candidate,
                targetId: otherParticipantId
            });
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('[P2P] Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            setAvatarInitial('remoteAvatarCircle', otherParticipantName, remoteAvatarUrl);
            
            const remoteVideo = document.getElementById('remoteVideo');
            const remoteAvatar = document.getElementById('remoteAvatar');
            if (remoteVideoOff) {
                if (remoteVideo) remoteVideo.style.display = 'none';
                if (remoteAvatar) remoteAvatar.style.display = 'flex';
            } else {
                if (remoteVideo) {
                    remoteVideo.style.display = 'block';
                    remoteVideo.play().catch(e => console.log('play error:', e));
                }
                if (remoteAvatar) remoteAvatar.style.display = 'none';
            }
            const remoteContainer = document.getElementById('remoteVideoContainer');
            if (remoteContainer) remoteContainer.style.display = 'block';
            const placeholder = document.getElementById('remotePlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            const badge = document.getElementById('speakerBadge');
            if (badge) {
                badge.style.display = 'flex';
                const nameEl = document.getElementById('currentSpeakerName');
                if (nameEl) nameEl.textContent = otherParticipantName || 'Participant';
            }
            const grid = document.getElementById('participantGrid');
            if (grid && !isGroupCall) {
                grid.className = grid.className.replace(/count-\d+/g, '').trim() + ' count-2';
            }
            
            // Start timer only when fully connected (both participants)
            if (!callTimerInterval && callStartTime === null) {
                callStartTime = Date.now();
                callTimerInterval = setInterval(updateCallDuration, 1000);
            }
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('[P2P] ICE connection state:', peerConnection.iceConnectionState);
    };
}

async function createAndSendOffer() {
    if (!peerConnection) {
        console.log('Creating peer connection first');
        createPeerConnection();
    }
    
    if (!otherParticipantId) {
        console.log('Waiting for other participant to join...');
        return;
    }
    
    if (peerConnection.signalingState !== 'stable') {
        console.log('Cannot create offer in state:', peerConnection.signalingState);
        return;
    }
    
    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        });
        await peerConnection.setLocalDescription(offer);
        
        console.log('Sending offer to:', otherParticipantId);
        videoSocket.emit('p2p-offer', {
            roomId,
            offer: peerConnection.localDescription,
            targetId: otherParticipantId
        });
        
        console.log('Sent P2P offer');
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

async function createAndSendAnswer() {
    if (!peerConnection || !otherParticipantId) {
        console.log('Cannot send answer - no peer connection or no target');
        return;
    }
    
    try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Sending answer to:', otherParticipantId);
        videoSocket.emit('p2p-answer', {
            roomId,
            answer: peerConnection.localDescription,
            targetId: otherParticipantId
        });
        
        console.log('Sent P2P answer');
    } catch (error) {
        console.error('Error creating answer:', error);
    }
}

async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Set remote description for offer');
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('P2P connection established - set remote description for answer');
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate');
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function handleParticipantLeft() {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.style.display = 'none';
        remoteVideo.srcObject = null;
    }
    
    const remoteAvatar = document.getElementById('remoteAvatar');
    if (remoteAvatar) remoteAvatar.style.display = 'none';
    
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (remoteContainer) remoteContainer.style.display = 'none';
    
    const placeholder = document.getElementById('remotePlaceholder');
    if (placeholder) {
        placeholder.style.display = 'flex';
        document.getElementById('remotePlaceholderText').textContent = 'Participant déconnecté';
    }
    
    const badge = document.getElementById('speakerBadge');
    if (badge) badge.style.display = 'none';

    const grid = document.getElementById('participantGrid');
    if (grid && !isGroupCall) {
        grid.className = grid.className.replace(/count-\d+/g, '').trim() + ' count-1';
    }
}

// Call controls
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    
    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;
    updateMuteButton();
    
    // Notify other participants about mute state change
    if (videoSocket?.connected && isGroupCall) {
        videoSocket.emit('participant-update', {
            roomId,
            socketId: videoSocket.id,
            isMuted
        });
    }
}

function updateMuteButton() {
    const btn = document.getElementById('muteBtn');
    const icon = document.getElementById('muteIcon');
    const indicator = document.getElementById('localMuteIndicator');
    
    if (isMuted) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        if (indicator) indicator.style.display = 'flex';
    } else {
        btn.style.background = '';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>';
        if (indicator) indicator.style.display = 'none';
    }
}

function toggleVideo() {
    if (!localStream) return;
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    isVideoOff = !isVideoOff;
    videoTrack.enabled = !isVideoOff;
    updateVideoButton();
    
    // Notify other participants about video state change
    if (videoSocket?.connected) {
        if (isGroupCall) {
            // Group call: broadcast to all in room via participant-update
            videoSocket.emit('participant-update', {
                roomId,
                socketId: videoSocket.id,
                isVideoOff
            });
        } else if (otherParticipantId) {
            // 1-on-1: send targeted update
            videoSocket.emit('participant-video-update', {
                roomId,
                targetId: otherParticipantId,
                isVideoOff
            });
        }
    }
}

function updateVideoButton() {
    const videoEl = document.getElementById('localVideo');
    const placeholder = document.getElementById('localVideoPlaceholder');
    const btn = document.getElementById('videoBtn');
    const icon = document.getElementById('videoIcon');
    const indicator = document.getElementById('localVideoOffIndicator');
    
    if (isVideoOff) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';
        if (indicator) indicator.style.display = 'flex';
        if (videoEl) {
            videoEl.style.display = 'none';
        }
        if (placeholder) placeholder.style.display = 'flex';
    } else {
        btn.style.background = '';
        icon.innerHTML = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>';
        if (indicator) indicator.style.display = 'none';
        if (videoEl) {
            videoEl.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    }
}

// Chat functions
// Group chat functions
let groupChatMessages = [];

function displayGroupChatMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.isSent ? 'sent' : 'received'}`;
    const timeStr = new Date(msg.timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    msgDiv.innerHTML = `
    <span class="message-sender">${msg.isSent ? 'Vous' : escapeHtml(msg.fromName || 'Inconnu')}</span>
        <div class="message-bubble">${escapeHtml(msg.text)}</div>
        <div class="message-meta">
            <span class="message-time">${timeStr}</span>
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function sendGroupChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text || !videoSocket?.connected) return;
    
    const payload = {
        roomId,
        fromId: videoSocket.id,
        fromName: currentUser?.fullname || (isDoctor ? 'Psychologue' : 'Patient'),
        text,
        timestamp: new Date().toISOString()
    };
    videoSocket.emit('chat-message', payload);
    
    // Display as sent message immediately
    displayGroupChatMessage({
        fromName: currentUser?.fullname || 'Vous',
        text,
        timestamp: payload.timestamp,
        isSent: true
    });
    
    input.value = '';
}

function toggleChat() {
    const chatSection = document.getElementById('chatSection');
    const btn = document.getElementById('chatToggleBtn');
    if (chatSection.style.display === 'none') {
        chatSection.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (!isGroupCall) {
            loadCallChatHistory();
        }
    } else {
        chatSection.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input?.value.trim();
    if (!content) return;

    // Group calls use the video socket's chat-message event
    if (isGroupCall) {
        sendGroupChatMessage();
        return;
    }
    
    if (!chatPartnerId) return;

    try {
        const socket = connectCallChatRealtime();
        if (socket) {
            await sendCallChatRealtimeMessage(chatPartnerId, content);
        } else {
            await messageAPI.send(chatPartnerId, content);
            await loadCallChatHistory(true);
        }
    } catch (error) {
        console.error('Failed to send call message:', error);
        return;
    }
    
    input.value = '';
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function displayChatMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const currentUserId = currentUser?.id;
    const senderId = msg.senderId || msg.fromId;
    const messageText = msg.content || msg.text || '';
    const timestamp = msg.createdAt || msg.timestamp;
    const isSent = senderId === currentUserId;
    const senderName = msg.fromName || (isSent ? 'Vous' : 'Participant');
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    const timeStr = new Date(timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    msgDiv.innerHTML = `
        <div class="message-bubble">${escapeHtml(messageText)}</div>
        <div class="message-meta">
            <span class="message-sender">${isSent ? 'Vous' : escapeHtml(senderName)}</span>
            <span class="message-time">${timeStr}</span>
        </div>
    `;
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function connectCallChatRealtime() {
    if (!callMessagingSocket && typeof connectMessagingSocket === 'function') {
        callMessagingSocket = connectMessagingSocket();
    }

    if (callMessagingSocket && !callMessagingSocketBound) {
        callMessagingSocketBound = true;
        callMessagingSocket.on('message:new', handleCallRealtimeMessage);
    }

    return callMessagingSocket;
}

function handleCallRealtimeMessage(payload) {
    const message = payload?.message || payload;
    if (!message?.id || !chatPartnerId) return;

    const currentUserId = currentUser?.id;
    const partnerId = message.senderId === currentUserId ? message.receiverId : message.senderId;
    if (partnerId !== chatPartnerId) return;

    appendCallChatMessage(message);
}

function appendCallChatMessage(message) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message?.id || renderedCallMessageIds.has(message.id)) return;

    renderedCallMessageIds.add(message.id);
    lastRenderedChatSignature = Array.from(renderedCallMessageIds).join('|');

    const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 80;
    displayChatMessage(message);
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

function sendCallChatRealtimeMessage(receiverId, content) {
    return new Promise((resolve, reject) => {
        const socket = connectCallChatRealtime();
        if (!socket) {
            reject(new Error('Messaging socket unavailable'));
            return;
        }

        const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        socket.emit('message:send', { receiverId, content, clientMessageId }, (response) => {
            if (response?.error) {
                reject(new Error(response.error));
                return;
            }
            resolve(response?.message || null);
        });
    });
}

async function initializeCallChat(appointmentData) {
    try {
        let appt = appointmentData;
        if (!appt) {
            const resp = await appointmentAPI.getById(sessionAppointmentId);
            appt = resp ? (resp.appointment || resp) : null;
        }
        if (!appt) return;

        chatPartnerId = isDoctor ? appt.patientId : appt.doctorId;

        // Set remote avatar if not already set from the pre-fetched data
        if (!remoteAvatarUrl) {
            if (isDoctor) {
                remoteAvatarUrl = appt.patient?.profile?.avatar || appt.patient?.avatar || null;
            } else {
                remoteAvatarUrl = appt.doctor?.profile?.avatar || appt.doctor?.avatar || null;
            }
        }

        await loadCallChatHistory(true);
        connectCallChatRealtime();
    } catch (error) {
        console.error('Failed to initialize call chat:', error);
    }
}

async function loadCallChatHistory(forceScroll = false) {
    if (!chatPartnerId) return;

    try {
        const messages = await messageAPI.getWithUser(chatPartnerId);
        renderCallChatMessages(messages || [], forceScroll);
    } catch (error) {
        console.error('Failed to load call chat history:', error);
    }
}

function renderCallChatMessages(messages, forceScroll = false) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const signature = messages.map(m => `${m.id}:${m.createdAt}`).join('|');
    if (!forceScroll && signature === lastRenderedChatSignature) {
        return;
    }

    lastRenderedChatSignature = signature;
    renderedCallMessageIds = new Set(messages.map(m => m.id));

    if (!messages.length) {
        container.innerHTML = '<div class="no-messages" style="text-align: center; padding: 20px; color: #9CA3AF;">Aucun message</div>';
        return;
    }

    const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 80;
    container.innerHTML = '';
    messages.forEach((msg) => displayChatMessage(msg));

    if (forceScroll || isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Timer
function startCallTimer() {
    callStartTime = Date.now();
    callTimerInterval = setInterval(updateCallDuration, 1000);
}

function updateCallDuration() {
    if (!callStartTime) return;
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    const durationEl = document.getElementById('callDuration');
    if (durationEl) {
        durationEl.textContent = `${minutes}:${seconds}`;
    }
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

// ============================================
// DOCTOR GROUP CALL: Countdown timer
// ============================================

function startDoctorCallTimer(durationMinutes) {
    if (!durationMinutes || durationMinutes <= 0) durationMinutes = 90;
    sessionEndTime = Date.now() + durationMinutes * 60 * 1000;
    updateDoctorCallDisplay();
    callTimerInterval = setInterval(updateDoctorCallDisplay, 1000);
}

function updateDoctorCallDisplay() {
    if (!sessionEndTime) return;
    const remaining = Math.max(0, Math.floor((sessionEndTime - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
    const seconds = (remaining % 60).toString().padStart(2, '0');
    const durationEl = document.getElementById('callDuration');
    if (durationEl) {
        durationEl.textContent = `${minutes}:${seconds}`;
        if (remaining <= 300) durationEl.style.color = '#ef4444';
    }
}

// ============================================
// DOCTOR GROUP CALL: Screen sharing
// ============================================

async function toggleScreenShare() {
    if (isScreenSharing) {
        await stopScreenShare();
    } else {
        await startScreenShare();
    }
}

async function startScreenShare() {
    try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;

        originalVideoTrack = localStream?.getVideoTracks()[0] || null;
        localStream.removeTrack(localStream.getVideoTracks()[0]);
        localStream.addTrack(screenTrack);
        isScreenSharing = true;

        // Replace video track in all peer connections
        const senderPromises = [];
        if (isGroupCall) {
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) senderPromises.push(sender.replaceTrack(screenTrack).catch(() => {}));
            });
        } else if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) senderPromises.push(sender.replaceTrack(screenTrack).catch(() => {}));
        }
        await Promise.allSettled(senderPromises);

        // Update local video preview
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;

        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) screenShareBtn.style.background = '#44AA99';

        screenTrack.onended = () => {
            stopScreenShare();
        };
    } catch (error) {
        console.error('Screen share error:', error);
        if (error.name !== 'NotAllowedError') {
            showToast('Erreur de partage d\'écran', 'error');
        }
    }
}

async function stopScreenShare() {
    if (!isScreenSharing) return;

    try {
        // Stop screen share track
        const currentVideoTrack = localStream?.getVideoTracks()[0];
        if (currentVideoTrack && currentVideoTrack !== originalVideoTrack) {
            currentVideoTrack.stop();
        }

        // Restore original camera track
        if (localStream && originalVideoTrack) {
            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) localStream.removeTrack(oldTrack);
            originalVideoTrack.enabled = !isVideoOff;
            localStream.addTrack(originalVideoTrack);
        }

        // Replace in all peer connections
        const restoreTrack = originalVideoTrack;
        const senderPromises = [];
        if (isGroupCall) {
            Object.values(peerConnections).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender && restoreTrack) senderPromises.push(sender.replaceTrack(restoreTrack).catch(() => {}));
            });
        } else if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender && restoreTrack) senderPromises.push(sender.replaceTrack(restoreTrack).catch(() => {}));
        }
        await Promise.allSettled(senderPromises);

        isScreenSharing = false;
        originalVideoTrack = null;

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.style.transform = 'scaleX(-1)';
        }

        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) screenShareBtn.style.background = '';
    } catch (error) {
        console.error('Stop screen share error:', error);
    }
}

// ============================================
// DOCTOR GROUP CALL: Edit call modal
// ============================================

function openEditCallModal() {
    const modal = document.getElementById('editCallModal');
    if (!modal) return;

    if (doctorGroupDetails) {
        document.getElementById('editCallTitle').value = doctorGroupDetails.name || '';
        document.getElementById('editCallMaxParticipants').value = doctorGroupDetails.maxPlaces || 10;
        document.getElementById('editCallPrice').value = doctorGroupDetails.price || '';
    }

    modal.style.display = 'flex';
}

function closeEditCallModal() {
    const modal = document.getElementById('editCallModal');
    if (modal) modal.style.display = 'none';
}

async function saveCallDetails() {
    const title = document.getElementById('editCallTitle')?.value?.trim();
    const maxParticipants = parseInt(document.getElementById('editCallMaxParticipants')?.value || '10', 10);
    const price = parseInt(document.getElementById('editCallPrice')?.value || '0', 10);

    if (!title || !groupId || !doctorGroupDetails) return;

    // Preserve existing fields not shown in the edit modal
    const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
    const existing = doctorGroupDetails;

    try {
        const token = localStorage.getItem('nebras_token');
        const resp = await fetch(window.API_URL + '/psychologue/groups/' + groupId, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: title,
                description: existing.description || '',
                dayOfWeek: dayMap[existing.day] !== undefined ? dayMap[existing.day] : 0,
                time: existing.time || '00:00',
                duration: existing.duration || 90,
                maxParticipants,
                price
            })
        });

        if (resp.ok) {
            doctorGroupDetails.name = title;
            doctorGroupDetails.maxPlaces = maxParticipants;
            doctorGroupDetails.price = price;
            showToast('Détails de l\'appel mis à jour', 'success');
            document.getElementById('callTitle').textContent = title;
            closeEditCallModal();
        } else {
            showToast('Erreur lors de la mise à jour', 'error');
        }
    } catch (error) {
        console.error('Save call details error:', error);
        showToast('Erreur lors de la mise à jour', 'error');
    }
}

// ============================================
// DOCTOR GROUP CALL: Participant actions
// ============================================

let selectedParticipantId = null;

function openParticipantActions(participantId) {
    selectedParticipantId = participantId;
    const modal = document.getElementById('participantActionsModal');
    const titleEl = document.getElementById('participantModalTitle');
    if (titleEl) {
        const name = otherParticipants[participantId]?.name || 'Participant';
        titleEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(name)}`;
    }
    if (modal) modal.style.display = 'flex';
}

function closeParticipantActionsModal() {
    const modal = document.getElementById('participantActionsModal');
    if (modal) modal.style.display = 'none';
    selectedParticipantId = null;
}

function toggleParticipantMute() {
    if (!selectedParticipantId || !videoSocket?.connected) return;
    // Note: remote mute toggle requires backend support
    showToast('Fonctionnalité non disponible pour le moment', 'info');
    closeParticipantActionsModal();
}

function toggleParticipantVideo() {
    if (!selectedParticipantId || !videoSocket?.connected) return;
    // Note: remote video toggle requires backend support
    showToast('Fonctionnalité non disponible pour le moment', 'info');
    closeParticipantActionsModal();
}

function removeParticipant() {
    if (!selectedParticipantId || !videoSocket?.connected) return;
    const name = otherParticipants[selectedParticipantId]?.name || 'Participant';
    if (!confirm(`Retirer ${name} du groupe ?`)) return;

    videoSocket.emit('remove-participant', {
        roomId,
        targetId: selectedParticipantId
    });
    showToast(`${name} retiré du groupe`, 'info');
    closeParticipantActionsModal();
}

// ============================================
// DOCTOR GROUP CALL: Chat extras
// ============================================

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex';
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.style.display = 'none';
}

function clearChat() {
    groupChatMessages = [];
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
}

// ============================================
// DOCTOR GROUP CALL: Join request handling
// ============================================

let doctorMainSocket = null;
let joinRequestQueue = [];

function initDoctorMainSocket() {
    if (!isDoctor || !isGroupCall || doctorMainSocket) return;
    const user = getCurrentUser();
    if (!user || !user.id) return;

    const token = localStorage.getItem('nebras_token');
    if (!token) return;

    // Main server socket (strip /api suffix from API_URL)
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

// End call
async function endCall() {
    if (isEndingCall) return;
    isEndingCall = true;
    
    try {
        // Stop media
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // Close peer connections
        if (isGroupCall) {
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};
            otherParticipants = {};
        } else if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Disconnect video socket (remove listeners first to prevent reconnect loop)
        if (videoSocket) {
            videoSocket.removeAllListeners();
            videoSocket.disconnect();
            videoSocket = null;
        }
        
        if (isGroupCall) {
            if (isDoctor && groupId) {
                stopCallTimer();
                try {
                    const token = localStorage.getItem('nebras_token');
                    await fetch(window.API_URL + '/psychologue/groups/' + groupId + '/end-session', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                } catch (e) {
                    console.log('End session request failed:', e);
                }
                clearGroupChatSession();
                if (doctorMainSocket) {
                    doctorMainSocket.removeAllListeners();
                    doctorMainSocket.disconnect();
                    doctorMainSocket = null;
                }
                window.location.href = 'psychologue_dashboard.html';
                return;
            }
            stopCallTimer();
            showGroupRatingModal();
            return;
        }
        
        // End session on backend (1-on-1 calls only)
        await appointmentAPI.endCallState();
        
        stopCallTimer();
        
        // For patient: show rating modal before redirect
        if (!isDoctor && doctorIdForRating && sessionAppointmentId) {
            showRatingModal();
            return;
        }
        
        // Doctor: redirect immediately
        window.location.href = 'psychologue_dashboard.html';
        
    } catch (error) {
        console.error('Error ending call:', error);
        window.location.href = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
    }
}

// ============================================
// GROUP POST-CALL RATING MODAL
// ============================================

let groupRatingModalEl = null;
let groupSelectedRating = 0;

function showGroupRatingModal() {
    if (document.getElementById('groupCallRatingModal')) return;

    const modal = document.createElement('div');
    modal.id = 'groupCallRatingModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    `;

    modal.innerHTML = `
        <div style="background: white; border-radius: 20px; padding: 32px; width: 420px; max-width: 90%; text-align: center; animation: fadeInUp 0.3s ease; box-shadow: 0 25px 60px rgba(0,0,0,0.2);">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </div>
            <h3 style="margin: 0 0 4px; color: #091346; font-size: 20px;">Évaluer la séance de groupe</h3>
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;" id="groupRatingDoctorName">Notez votre séance avec ${doctorNameForRating || 'le Psychologue'}</p>

            <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 20px;" id="groupRatingStars">
                ${[1,2,3,4,5].map(i => `
                    <button type="button" data-gstar="${i}" style="background: none; border: none; cursor: pointer; padding: 4px; font-size: 36px; line-height: 1; color: #d1d5db; transition: color 0.15s, transform 0.15s;" onmouseenter="highlightGroupStars(${i})" onmouseleave="resetGroupStars()" onclick="selectGroupStar(${i})">★</button>
                `).join('')}
            </div>

            <textarea id="groupRatingComment" placeholder="Partagez votre expérience (optionnel)" style="width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; resize: none; height: 80px; box-sizing: border-box; margin-bottom: 16px; transition: border-color 0.2s;"></textarea>

            <button onclick="submitGroupRating()" id="submitGroupRatingBtn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; opacity: 0.5;" disabled>Envoyer la note</button>

            <button onclick="skipGroupRating()" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; margin-top: 12px; padding: 8px; text-decoration: underline; text-underline-offset: 3px;">Passer</button>

            <p style="font-size: 11px; color: #cbd5e1; margin: 12px 0 0;">Votre avis nous aide à améliorer nos services</p>
        </div>
    `;

    document.body.appendChild(modal);
    groupRatingModalEl = modal;
}

window.highlightGroupStars = function(count) {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-gstar="${i}"]`);
        if (btn) {
            btn.style.color = i <= count ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= count ? 'scale(1.15)' : 'scale(1)';
        }
    }
};

window.resetGroupStars = function() {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-gstar="${i}"]`);
        if (btn) {
            btn.style.color = i <= groupSelectedRating ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= groupSelectedRating ? 'scale(1.15)' : 'scale(1)';
        }
    }
};

window.selectGroupStar = function(count) {
    groupSelectedRating = count;
    const submitBtn = document.getElementById('submitGroupRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
    resetGroupStars();
};

window.submitGroupRating = async function() {
    if (groupSelectedRating < 1 || !doctorIdForRating || !groupId) return;

    const submitBtn = document.getElementById('submitGroupRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
    }

    try {
        const comment = document.getElementById('groupRatingComment')?.value?.trim() || '';
        const token = localStorage.getItem('nebras_token');

        const response = await fetch(API_URL + '/groups/rate', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                doctorId: doctorIdForRating,
                groupId: groupId,
                rating: groupSelectedRating,
                comment: comment || undefined
            })
        });

        const result = await response.json();

        if (response.ok || result.success) {
            clearGroupRatingSession();
            if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast('Merci pour votre évaluation !', 'success');
            }
        } else {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Envoyer la note';
            }
            if (response.status === 409) {
                clearGroupRatingSession();
                if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
                window.location.href = 'patient_dashboard.html';
                return;
            }
        }
    } catch (error) {
        console.error('Group rating error:', error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer la note';
        }
    }

    window.location.href = 'patient_dashboard.html';
};

window.skipGroupRating = function() {
    clearGroupRatingSession();
    if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
    window.location.href = 'patient_dashboard.html';
};

function clearGroupRatingSession() {
    // Mark as rated so it never appears again for this session
    if (groupId && doctorIdForRating) {
        const pid = getCurrentUser()?.id || 'unknown';
        sessionStorage.setItem(`group_rated_${groupId}_${doctorIdForRating}_${pid}`, '1');
    }
    sessionStorage.removeItem('pendingGroupRating');
    sessionStorage.removeItem('groupCallRoom');
    sessionStorage.removeItem('groupCallGroupId');
    sessionStorage.removeItem('groupCallDoctorId');
    groupSelectedRating = 0;
}

// ============================================
// POST-CALL RATING MODAL
// ============================================

let ratingModalEl = null;
let selectedRating = 0;

function createRatingModal() {
    if (document.getElementById('postCallRatingModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'postCallRatingModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 20px; padding: 32px; width: 420px; max-width: 90%; text-align: center; animation: fadeInUp 0.3s ease; box-shadow: 0 25px 60px rgba(0,0,0,0.2);">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </div>
            <h3 style="margin: 0 0 4px; color: #091346; font-size: 20px;">Évaluer la consultation</h3>
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;" id="ratingDoctorName">Notez votre séance avec le psychologue</p>
            
            <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 20px;" id="ratingStars">
                ${[1,2,3,4,5].map(i => `
                    <button type="button" data-star="${i}" style="background: none; border: none; cursor: pointer; padding: 4px; font-size: 36px; line-height: 1; color: #d1d5db; transition: color 0.15s, transform 0.15s;" onmouseenter="highlightStars(${i})" onmouseleave="resetStars()" onclick="selectStar(${i})">★</button>
                `).join('')}
            </div>
            
            <textarea id="ratingComment" placeholder="Partagez votre expérience (optionnel)" style="width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; resize: none; height: 80px; box-sizing: border-box; margin-bottom: 16px; transition: border-color 0.2s;" onfocus="this.style.borderColor='#44AA99'" onblur="this.style.borderColor='#e2e8f0'"></textarea>
            
            <button onclick="submitRating()" id="submitRatingBtn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; opacity: 0.5;" disabled>Envoyer la note</button>
            
            <button onclick="skipRating()" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; margin-top: 12px; padding: 8px; text-decoration: underline; text-underline-offset: 3px;">Passer</button>
            
            <p style="font-size: 11px; color: #cbd5e1; margin: 12px 0 0;">Votre avis nous aide à améliorer nos services</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    ratingModalEl = modal;
}

function showRatingModal() {
    createRatingModal();
    selectedRating = 0;
    const nameEl = document.getElementById('ratingDoctorName');
    if (nameEl && doctorNameForRating) {
        nameEl.textContent = `Notez votre séance avec ${doctorNameForRating}`;
    }
    ratingModalEl.style.display = 'flex';
}

function highlightStars(count) {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-star="${i}"]`);
        if (btn) {
            btn.style.color = i <= count ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= count ? 'scale(1.15)' : 'scale(1)';
        }
    }
}

function resetStars() {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-star="${i}"]`);
        if (btn) {
            btn.style.color = i <= selectedRating ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= selectedRating ? 'scale(1.15)' : 'scale(1)';
        }
    }
}

function selectStar(count) {
    selectedRating = count;
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
    resetStars();
}

async function submitRating() {
    if (selectedRating < 1 || !doctorIdForRating || !sessionAppointmentId) return;
    
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
    }
    
    try {
        const comment = document.getElementById('ratingComment')?.value?.trim() || '';
        
        await reviewAPI.create({
            doctorId: doctorIdForRating,
            appointmentId: sessionAppointmentId,
            rating: selectedRating,
            comment: comment || undefined
        });
        
        clearRatingSession();
        if (ratingModalEl) ratingModalEl.style.display = 'none';
        window.location.href = 'patient_dashboard.html';
    } catch (error) {
        console.error('Rating error:', error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer la note';
        }
        // If already rated (409), still proceed
        if (error.message && error.message.includes('déjà')) {
            clearRatingSession();
            if (ratingModalEl) ratingModalEl.style.display = 'none';
            window.location.href = 'patient_dashboard.html';
            return;
        }
        showToast('Erreur lors de l\'envoi', 'error');
    }
}

function showToast(message, type) {
    const existing = document.querySelector('.vc-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'vc-toast';
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:12px;color:#fff;font-weight:600;font-size:14px;z-index:999999;box-shadow:0 8px 30px rgba(0,0,0,0.15);background:' + (type === 'error' ? '#ef4444' : '#44AA99') + ';';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function clearRatingSession() {
    sessionStorage.removeItem('pendingRating');
    sessionAppointmentId = null;
    doctorIdForRating = null;
    doctorNameForRating = null;
}

function skipRating() {
    clearRatingSession();
    if (ratingModalEl) ratingModalEl.style.display = 'none';
    window.location.href = 'patient_dashboard.html';
}

// Save pending rating on tab close (patient only)
window.addEventListener('beforeunload', function() {
    if (!isDoctor && sessionAppointmentId && doctorIdForRating) {
        try {
            sessionStorage.setItem('pendingRating', JSON.stringify({
                appointmentId: sessionAppointmentId,
                doctorId: doctorIdForRating,
                doctorName: doctorNameForRating
            }));
        } catch (e) {}
    }
});

function showError(message) {
    alert(message);
}

function clearGroupChatSession() {
    groupChatMessages = [];
    const msgContainer = document.getElementById('messagesContainer');
    if (msgContainer) msgContainer.innerHTML = '';
    sessionStorage.removeItem('groupCallRoom');
    sessionStorage.removeItem('groupCallGroupId');
    sessionStorage.removeItem('groupCallDuration');
    sessionStorage.removeItem('groupCallName');
}

// Expose functions globally
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
window.endCall = endCall;
window.toggleChat = toggleChat;
window.sendChatMessage = sendChatMessage;
window.highlightStars = highlightStars;
window.resetStars = resetStars;
window.selectStar = selectStar;
window.submitRating = submitRating;
window.skipRating = skipRating;
window.handleChatKeyPress = handleChatKeyPress;
window.toggleScreenShare = toggleScreenShare;
window.openEditCallModal = openEditCallModal;
window.closeEditCallModal = closeEditCallModal;
window.saveCallDetails = saveCallDetails;
window.openParticipantActions = openParticipantActions;
window.closeParticipantActionsModal = closeParticipantActionsModal;
window.toggleParticipantMute = toggleParticipantMute;
window.toggleParticipantVideo = toggleParticipantVideo;
window.removeParticipant = removeParticipant;
window.toggleEmojiPicker = toggleEmojiPicker;
window.insertEmoji = insertEmoji;
window.clearChat = clearChat;
window.acceptDoctorJoinRequest = acceptDoctorJoinRequest;
window.rejectDoctorJoinRequest = rejectDoctorJoinRequest;
window.closePatientModal = closePatientModal;
window.startDoctorCallTimer = startDoctorCallTimer;
window.updateGridLayout = updateGridLayout;