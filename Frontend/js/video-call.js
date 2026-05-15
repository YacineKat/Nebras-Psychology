// ============================================
// VIDEO CALL PAGE - Handles video call connection
// ============================================

let currentUser = null;
let roomId = null;
let isDoctor = false;
let sessionAppointmentId = null;
let callStartTime = null;
let callTimerInterval = null;

// Media state
let localStream = null;
let isMuted = true;
let isVideoOff = true;

// Canvas flip pipeline
let flippedVideoTrack = null;
let flippedVideoStream = null;
let flipAnimFrame = null;
let flipVideoEl = null;
let flipCanvas = null;
let flipCtx = null;
let flipDrawFn = null;

// Visibility handling
let visibilityHandler = null;
let isEndingCall = false;

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

function setupVisibilityHandler() {
    if (visibilityHandler) return;
    visibilityHandler = () => {
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
    document.addEventListener('visibilitychange', visibilityHandler);
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
    const userInitial = currentUser.fullname ? currentUser.fullname.charAt(0).toUpperCase() : 'U';
    document.getElementById('localName').textContent = currentUser.fullname || 'Vous';
    document.getElementById('localVideoPlaceholder').textContent = userInitial;
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
        
        // Initialize media
        await initializeMedia();
        
        // Connect to video server
        await connectToVideoServer();
        
        // Start call timer
        startCallTimer();
        
        // Handle tab visibility for canvas flip pipeline
        setupVisibilityHandler();
        
    } catch (error) {
        console.error('Init error:', error);
        showError('Erreur lors de l\'initialisation');
    }
}

async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Canvas-based horizontal flip for raw track data (fixes USB camera hardware flip)
        const rawVideoTrack = localStream.getVideoTracks()[0];
        const flipResult = await buildFlippedTrack(rawVideoTrack);
        flippedVideoTrack = flipResult.flippedTrack;
        flippedVideoStream = flipResult.flippedStream;
        flipAnimFrame = flipResult.animId;
        flipVideoEl = flipResult.offVideo;
        flipCanvas = flipResult.canvas;
        flipCtx = flipResult.ctx;
        flipDrawFn = flipResult.drawFn;
        
        // Attach original stream to local video element for preview
        const videoEl = document.getElementById('localVideo');
        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.srcObject = localStream;
            videoEl.play().catch(e => console.log('Play error:', e));
            videoEl.style.display = 'none';
            videoEl.style.transform = 'scaleX(-1)';
        }
        
        const placeholder = document.getElementById('localVideoPlaceholder');
        if (placeholder) placeholder.style.display = 'flex';
        
        // Start with camera and microphone OFF by default
        rawVideoTrack.enabled = false;
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
                }
                
                // Create P2P connection
                createPeerConnection();
                
                // If we're the doctor/host and there's a patient, create offer immediately
                if (isDoctor && otherParticipantId) {
                    setTimeout(() => {
                        createAndSendOffer();
                    }, 500);
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
            
            // If patient just joined and we're doctor, send offer
            if (isDoctor && peerConnection && otherParticipantId) {
                createAndSendOffer();
            }
        });
        
        // P2P Signaling
        videoSocket.on('p2p-offer', async ({ offer, fromId, fromName }) => {
            console.log('Received P2P offer from:', fromName);
            otherParticipantId = fromId;
            otherParticipantName = fromName;
            
            if (!peerConnection) createPeerConnection();
            await handleOffer(offer);
            
            // Automatically create and send answer
            setTimeout(() => createAndSendAnswer(), 300);
        });
        
        videoSocket.on('p2p-answer', async ({ answer, fromId }) => {
            console.log('Received P2P answer from:', fromId);
            await handleAnswer(answer);
        });
        
        videoSocket.on('p2p-ice-candidate', async ({ candidate, fromId }) => {
            console.log('Received ICE candidate from:', fromId);
            await handleIceCandidate(candidate);
        });
        
        videoSocket.on('participant-left', ({ socketId }) => {
            console.log('Participant left');
            if (socketId === otherParticipantId) {
                handleParticipantLeft();
                otherParticipantId = null;
            }
        });
        
        // Chat messages
        videoSocket.on('chat-message', (msg) => {
            displayChatMessage(msg);
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
    
    // Add flipped video track and original audio track
    if (flippedVideoTrack && flippedVideoStream) {
        peerConnection.addTrack(flippedVideoTrack, flippedVideoStream);
    }
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        peerConnection.addTrack(audioTrack, localStream);
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
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.style.display = 'block';
                remoteVideo.style.transform = 'none';
                remoteVideo.play().catch(e => console.log('play error:', e));
            }
            const placeholder = document.getElementById('remotePlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            const badge = document.getElementById('speakerBadge');
            if (badge) {
                badge.style.display = 'flex';
                const nameEl = document.getElementById('currentSpeakerName');
                if (nameEl) nameEl.textContent = otherParticipantName || 'Participant';
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
    } else {
        chatSection.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input?.value.trim();
    if (!content || !videoSocket) return;
    
    const message = {
        fromId: currentUser.id,
        fromName: currentUser.fullname || 'User',
        text: content,
        timestamp: new Date().toISOString()
    };
    
    videoSocket.emit('chat-message', { roomId, ...message });
    displayChatMessage(message);
    
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
    const isSent = msg.fromId === currentUserId;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    msgDiv.innerHTML = `
        <div class="message-content">${escapeHtml(msg.text)}</div>
        <div class="message-time">${new Date(msg.timestamp).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
    `;
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
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
        // Remove visibility handler
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
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
        
        // Redirect to dashboard
        window.location.href = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
        
    } catch (error) {
        console.error('Error ending call:', error);
        // Still redirect even if API fails
        window.location.href = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
    }
}

function showError(message) {
    alert(message);
}

// Expose functions globally
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
window.endCall = endCall;
window.toggleChat = toggleChat;
window.sendChatMessage = sendChatMessage;
window.handleChatKeyPress = handleChatKeyPress;