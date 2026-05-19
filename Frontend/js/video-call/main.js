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
    isCounselor = role === 'counselor' || type === 'counselor';
    isGroupCall = mode === 'group' || type === 'group';
    groupId = params.get('groupId');
    sessionAppointmentId = params.get('appointment');
    
    if (!roomId) {
        showError('ParamÃ¨tres de session invalides');
        return;
    }
    
    // Patient profile modal backdrop close
    document.getElementById('patientProfileModal')?.addEventListener('click', function(e) {
        if (e.target === this) closePatientModal();
    });
    
    if (isGroupCall) {
        document.getElementById('callTitle').textContent = 'Appel de groupe thérapeutique';
        document.getElementById('remotePlaceholderText').textContent = 'Connexion Ã  la session de groupe...';
        if (isDoctor || isCounselor) {
            await initializeDoctorGroupCall();
        } else {
            await initializeGroupCall();
        }
        return;
    }
    
    if (!sessionAppointmentId) {
        showError('ParamÃ¨tres de session invalides');
        return;
    }
    
    // Update UI with user info
    const userName = currentUser.fullname || 'Vous';
    document.getElementById('localName').textContent = userName;
    localAvatarUrl = currentUser.profile?.avatar || null;
    setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);
    document.getElementById('callTitle').textContent = (isDoctor || isCounselor) ? 'Appel video avec patient' : 'Appel video avec psychologue';
    
    if (isDoctor || isCounselor) {
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
                const redirectAfterInactive = isDoctor ? 'psychologue_dashboard.html' : (isCounselor ? 'counselor_dashboard.html' : 'patient_dashboard.html');
                window.location.href = redirectAfterInactive;
            }, 2000);
            return;
        }

        // Start media and signaling work in parallel to reduce join latency.
        const mediaPromise = initializeMedia();
        const connectPromise = connectToVideoServer();
        const appointmentPromise = sessionAppointmentId
            ? appointmentAPI.getById(sessionAppointmentId).then((resp) => {
                if (!resp) return null;
                const data = resp.appointment || resp;

                if (isDoctor || isCounselor) {
                    chatPartnerId = data.patientId;
                    remoteAvatarUrl = data.patient?.profile?.avatar || data.patient?.avatar || null;
                } else {
                    chatPartnerId = data.doctorId;
                    doctorIdForRating = data.doctorId;
                    doctorNameForRating = data.doctor?.fullname || 'Psychologue';
                    remoteAvatarUrl = data.doctor?.profile?.avatar || data.doctor?.avatar || null;
                }

                const remoteName = (isDoctor || isCounselor) ? data.patient?.fullname : data.doctor?.fullname;
                setRemoteParticipantDisplay(remoteName, remoteAvatarUrl);

                // If current user is a patient, adjust title based on provider type
                if (!(isDoctor || isCounselor)) {
                    const provider = data.doctor || {};
                    const providerIsCounselor = provider.role === 'counselor' || provider.type === 'counselor' || provider.userType === 'counselor' || provider.isCounselor;
                    document.getElementById('callTitle').textContent = providerIsCounselor ? 'Appel video avec counselor' : 'Appel video avec psychologue';
                }

                return data;
            }).catch((e) => {
                console.log('Could not load appointment details:', e);
                return null;
            })
            : Promise.resolve(null);

        appointmentPromise.then((appointmentData) => {
            void initializeCallChat(appointmentData).catch((error) => {
                console.log('Call chat init error:', error);
            });
        });

        await Promise.all([
            mediaPromise,
            connectPromise
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

    // Remove static 1-on-1 elements for group calls
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    if (remotePlaceholder) remotePlaceholder.style.display = 'none';
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (remoteContainer) remoteContainer.style.display = 'none';
    const grid = document.getElementById('participantGrid');
    if (grid) void grid.offsetHeight;

    // Pre-fetch known participant avatars before joining
    participantAvatars = {};
    if (currentUser?.id && currentUser?.profile?.avatar) {
        participantAvatars[currentUser.id] = currentUser.profile.avatar;
    }

    try {
        const connectPromise = connectGroupToVideoServer();
        await initializeMedia();
        attachLocalTracksToActivePeerConnections();
        hydrateGroupParticipantMetadata();
        await connectPromise;
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

    // Remove 1-on-1 specific elements
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    if (remotePlaceholder) remotePlaceholder.style.display = 'none';
    const remoteContainer = document.getElementById('remoteVideoContainer');
    if (remoteContainer) remoteContainer.style.display = 'none';
    const grid = document.getElementById('participantGrid');
    if (grid) void grid.offsetHeight;

    // Get duration for countdown timer (starts when first patient joins)
    groupCallDuration = parseInt(sessionStorage.getItem('groupCallDuration') || '90', 10);
    const groupName = sessionStorage.getItem('groupCallName') || 'Session de groupe';
    document.getElementById('callTitle').textContent = groupName;

    // Pre-fetch participant avatars before joining
    participantAvatars = {};
    if (currentUser?.id && currentUser?.profile?.avatar) {
        participantAvatars[currentUser.id] = currentUser.profile.avatar;
    }

    try {
        const connectPromise = doctorConnectGroupToVideoServer();
        await initializeMedia();
        attachLocalTracksToActivePeerConnections();
        hydrateGroupParticipantMetadata();
        await connectPromise;
        initDoctorMainSocket();
    } catch (error) {
        console.error('Doctor group call init error:', error);
        showError('Erreur lors de l\'initialisation de l\'appel de groupe');
    }
}

async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const videoEl = document.getElementById('localVideo');
        if (videoEl) {
            videoEl.srcObject = localStream;
            videoEl.play().catch(e => console.log('Play error:', e));
        }
        
        // Start with camera and microphone OFF by default
        localStream.getVideoTracks()[0].enabled = false;
        localStream.getAudioTracks()[0].enabled = false;
        
        isMuted = true;
        isVideoOff = true;
        updateMuteButton();
        updateVideoButton();
        attachLocalTracksToActivePeerConnections();
        
    } catch (error) {
        console.error('Media error:', error);
        showError('Erreur d\'accÃ¨s Ã  la camÃ©ra/micro');
    }
}

function attachLocalTracksToActivePeerConnections() {
    if (!localStream) return;

    attachLocalTracksToPeerConnection(peerConnection);
    Object.values(peerConnections).forEach((pc) => attachLocalTracksToPeerConnection(pc));

    if (!isGroupCall && (isDoctor || isCounselor) && peerConnection && otherParticipantId && peerConnection.signalingState === 'stable' && !peerConnection.__offerInFlight) {
        createAndSendOffer();
    }

    if (isGroupCall && (isDoctor || isCounselor) && videoSocket?.connected) {
        Object.entries(peerConnections).forEach(([socketId, pc]) => {
            const participant = otherParticipants[socketId];
            if (participant?.shouldInitiate && pc && pc.signalingState === 'stable' && !pc.__groupOfferInFlight) {
                createAndSendGroupOffer(socketId);
            }
        });
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
            if ((isDoctor || isCounselor) && groupId) {
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
                window.location.href = isDoctor ? 'psychologue_dashboard.html' : 'counselor_dashboard.html';
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
        if (!(isDoctor || isCounselor) && doctorIdForRating && sessionAppointmentId) {
            showRatingModal();
            return;
        }
        
        // Doctor: redirect immediately
            const redirectAfterEnd = isDoctor ? 'psychologue_dashboard.html' : (isCounselor ? 'counselor_dashboard.html' : 'patient_dashboard.html');
            window.location.href = redirectAfterEnd;
        
    } catch (error) {
        console.error('Error ending call:', error);
        const fallbackRedirect = isDoctor ? 'psychologue_dashboard.html' : (isCounselor ? 'counselor_dashboard.html' : 'patient_dashboard.html');
        window.location.href = fallbackRedirect;
    }
}

// MOVED TO video-call-ratings.js

// Save pending rating on tab close (patient only)
window.addEventListener('beforeunload', function() {
    if (!(isDoctor || isCounselor) && sessionAppointmentId && doctorIdForRating) {
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
window.removeParticipant = removeParticipant;
window.toggleEmojiPicker = toggleEmojiPicker;
window.insertEmoji = insertEmoji;
window.clearChat = clearChat;
window.acceptDoctorJoinRequest = acceptDoctorJoinRequest;
window.rejectDoctorJoinRequest = rejectDoctorJoinRequest;
window.closePatientModal = closePatientModal;
window.startDoctorCallTimer = startDoctorCallTimer;
window.updateGridLayout = updateGridLayout;
