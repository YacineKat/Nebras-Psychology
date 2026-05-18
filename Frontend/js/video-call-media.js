// ============================================
// VIDEO CALL MEDIA - Mute and video controls
// ============================================
// UI-ONLY module: toggles media state and updates button DOM.

function toggleMute() {
    if (!localStream) return;
    
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    
    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;
    updateMuteButton();
    
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
    
    if (videoSocket?.connected) {
        if (isGroupCall) {
            videoSocket.emit('participant-update', {
                roomId,
                socketId: videoSocket.id,
                isVideoOff
            });
        } else if (otherParticipantId) {
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

function attachLocalTracksToPeerConnection(pc) {
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    localStream.getTracks().forEach((track) => {
        const alreadyAttached = senders.some((sender) => sender.track === track);
        if (!alreadyAttached) {
            try {
                pc.addTrack(track, localStream);
            } catch (e) {
                console.log('[P2P] addTrack error:', e);
            }
        }
    });
}
