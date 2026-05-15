// ============================================
// VIDEO CALL PAGE - Handles video call connection
// ============================================

let currentUser = null;
let roomId = null;
let isDoctor = false;
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

let isEndingCall = false;
let doctorIdForRating = null;
let doctorNameForRating = null;

// Avatar images
let localAvatarUrl = null;
let remoteAvatarUrl = null;
let remoteVideoOff = true; // assume OFF until we know otherwise

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
    const params = new URLSearchParams(window.location.search);
    roomId = params.get('room');
    isDoctor = params.get('type') === 'doctor';
    sessionAppointmentId = params.get('appointment');
    
    if (!roomId || !sessionAppointmentId) {
        showError('Paramètres de session invalides');
        return;
    }
    
    // Update UI with user info
    const userName = currentUser.fullname || 'Vous';
    document.getElementById('localName').textContent = userName;
    localAvatarUrl = currentUser.profile?.avatar || null;
    setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);
    document.getElementById('callTitle').textContent = isDoctor ? 'Appel vidéo avec patient' : 'Appel vidéo avec psychologue';
    
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

        // Start media + signaling + chat in parallel
        await Promise.all([
            initializeMedia(),
            connectToVideoServer(),
            initializeCallChat()
        ]);

        // Attach local tracks to the peer connection (handles race: either finishes first)
        attachTracksToPeerConnection();

        // Timer starts on ICE connected (both participants at same time)
        // No longer called here — see onconnectionstatechange
        
        // Store appointment participant info for rating + remote avatar
        if (sessionAppointmentId) {
            try {
                const apt = await appointmentAPI.getById(sessionAppointmentId);
                if (apt) {
                    const appt = apt.appointment || apt;
                    // Extract remote avatar
                    if (isDoctor) {
                        remoteAvatarUrl = appt.patient?.profile?.avatar || null;
                        remoteAvatarUrl = remoteAvatarUrl || appt.patient?.avatar || null;
                    } else {
                        remoteAvatarUrl = appt.doctor?.profile?.avatar || null;
                        remoteAvatarUrl = remoteAvatarUrl || appt.doctor?.avatar || null;
                        // Rating info (patient only)
                        doctorIdForRating = appt.doctorId;
                        doctorNameForRating = appt.doctor?.fullname || 'Psychologue';
                    }
                }
            } catch (e) {
                console.log('Could not load appointment details for rating/avatar');
            }
        }
        
    } catch (error) {
        console.error('Init error:', error);
        showError('Erreur lors de l\'initialisation');
    }
}

function attachTracksToPeerConnection() {
    if (!peerConnection || !localStream) return;
    
    const existingKinds = new Set(
        peerConnection.getSenders().map(s => s.track?.kind).filter(Boolean)
    );
    
    localStream.getTracks().forEach(track => {
        if (!existingKinds.has(track.kind)) {
            peerConnection.addTrack(track, localStream);
            existingKinds.add(track.kind);
        }
    });
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
            transports: ['websocket', 'polling']
        });
        
        videoSocket.on('connect', () => {
            console.log('Connected to video server');
            
            const userName = currentUser.fullname || 'User';
            videoSocket.emit('join-room', { roomId, userName }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                
                console.log('Joined room:', response);
                
                // Store other participants
                if (response.participants && response.participants.length > 0) {
                    otherParticipantId = response.participants[0].id;
                    otherParticipantName = response.participants[0].name;
                    console.log('Other participant:', otherParticipantName, otherParticipantId);
                    // Notify existing participant that camera is OFF (default state)
                    videoSocket.emit('participant-video-update', {
                        roomId,
                        targetId: otherParticipantId,
                        isVideoOff: true
                    });
                }
                
                // Create P2P connection and add tracks if media is ready
                createPeerConnection();
                
                // If we're the doctor/host and there's a patient, create offer immediately
                if (isDoctor && otherParticipantId) {
                    createAndSendOffer();
                }
                
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
            console.log('Received P2P offer from:', fromName);
            otherParticipantId = fromId;
            otherParticipantName = fromName;
            setAvatarInitial('remoteAvatarCircle', otherParticipantName, remoteAvatarUrl);
            
            if (!peerConnection) createPeerConnection();
            await handleOffer(offer);
            createAndSendAnswer();
        });
        
        videoSocket.on('p2p-answer', async ({ answer, fromId }) => {
            console.log('Received P2P answer from:', fromId);
            await handleAnswer(answer);
        });
        
        videoSocket.on('p2p-ice-candidate', async ({ candidate, fromId }) => {
            console.log('Received ICE candidate from:', fromId);
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
        
        videoSocket.on('disconnect', () => {
            console.log('Video server disconnected');
        });
    });
}

function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    peerConnection = new RTCPeerConnection(config);
    
    // Renegotiate when tracks are added late (parallel init race)
    peerConnection.onnegotiationneeded = async () => {
        try {
            if (isDoctor) {
                await createAndSendOffer();
            }
        } catch (err) {
            console.error('onnegotiationneeded error:', err);
        }
    };
    
    // Create a single remote stream and attach it to the video element once
    const remoteStream = new MediaStream();
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
    }
    
    // Handle incoming tracks — add to the shared stream, never reassign srcObject
    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);

        // NOTE: Remote video visibility is controlled by the
        // participant-video-update signaling event, NOT by track.onmute/onunmute.
        // The browser does NOT fire onmute when the sender disables
        // via track.enabled = false, so signaling is the reliable mechanism.
    };
    
    // Handle ICE candidates - send to specific participant
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && otherParticipantId) {
            console.log('Sending ICE candidate to:', otherParticipantId);
            videoSocket.emit('p2p-ice-candidate', {
                roomId,
                candidate: event.candidate,
                targetId: otherParticipantId
            });
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
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
            const placeholder = document.getElementById('remotePlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            const badge = document.getElementById('speakerBadge');
            if (badge) {
                badge.style.display = 'flex';
                const nameEl = document.getElementById('currentSpeakerName');
                if (nameEl) nameEl.textContent = otherParticipantName || 'Participant';
            }
            
            // Start timer only when fully connected (both participants)
            if (!callTimerInterval && callStartTime === null) {
                callStartTime = Date.now();
                callTimerInterval = setInterval(updateCallDuration, 1000);
            }
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
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
    
    const placeholder = document.getElementById('remotePlaceholder');
    if (placeholder) {
        placeholder.style.display = 'flex';
        document.getElementById('remotePlaceholderText').textContent = 'Participant déconnecté';
    }
    
    const badge = document.getElementById('speakerBadge');
    if (badge) badge.style.display = 'none';
}

// Call controls
function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    
    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;
    updateMuteButton();
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
    
    // Notify the other participant about video state change
    if (videoSocket?.connected && otherParticipantId) {
        videoSocket.emit('participant-video-update', {
            roomId,
            targetId: otherParticipantId,
            isVideoOff
        });
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
function toggleChat() {
    const chatSection = document.getElementById('chatSection');
    const btn = document.getElementById('chatToggleBtn');
    if (chatSection.style.display === 'none') {
        chatSection.style.display = 'flex';
        if (btn) btn.classList.add('active');
        loadCallChatHistory();
    } else {
        chatSection.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input?.value.trim();
    if (!content || !chatPartnerId) return;

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
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    msgDiv.innerHTML = `
        <div class="message-content">${escapeHtml(messageText)}</div>
        <div class="message-time">${new Date(timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
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

async function initializeCallChat() {
    try {
        const appointment = await appointmentAPI.getById(sessionAppointmentId);
        if (!appointment) return;

        const appt = appointment.appointment || appointment;
        chatPartnerId = isDoctor ? appt.patientId : appt.doctorId;

        // Set remote avatar if not already set from initializeSession
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
        
        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Disconnect video socket
        if (videoSocket) {
            videoSocket.disconnect();
            videoSocket = null;
        }
        
        // End session on backend
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