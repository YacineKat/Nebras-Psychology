// ============================================
// VIDEO CALL SCREEN SHARE
// ============================================
// WEBRTC-PRIMARY module with intrinsic DOM (local preview + button state).

async function toggleScreenShare() {
    if (isScreenSharing) {
        await stopScreenShare();
    } else {
        await startScreenShare();
    }
}

async function startScreenShare() {
    try {
        console.debug('[vcc] startScreenShare: requesting display media');
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        console.debug('[vcc] startScreenShare: getDisplayMedia resolved', { displayStream });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) {
            console.debug('[vcc] startScreenShare: no screen track obtained, aborting');
            return;
        }

        originalVideoTrack = localStream?.getVideoTracks()[0] || null;
        console.debug('[vcc] startScreenShare: originalVideoTrack present?', !!originalVideoTrack);
        isScreenSharing = true;
        screenShareStream = displayStream;

        // Replace video track in all peer connections
        const senderPromises = [];
        if (isGroupCall) {
            console.debug('[vcc] startScreenShare: replacing tracks for group peers', Object.keys(peerConnections).length);
            Object.values(peerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) {
                        senderPromises.push(sender.replaceTrack(screenTrack).then(() => {
                            console.debug('[vcc] replaceTrack OK (group)', { pcId: pc.__id });
                        }).catch(err => {
                            console.error('[vcc] replaceTrack ERROR (group)', { pcId: pc.__id, err });
                        }));
                    } else {
                        console.debug('[vcc] startScreenShare: no video sender on pc', pc.__id);
                    }
                } catch (e) {
                    console.error('[vcc] startScreenShare: error finding sender', e);
                }
            });
        } else if (peerConnection) {
            try {
                const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    senderPromises.push(sender.replaceTrack(screenTrack).then(() => {
                        console.debug('[vcc] replaceTrack OK (p2p)');
                    }).catch(err => {
                        console.error('[vcc] replaceTrack ERROR (p2p)', err);
                    }));
                } else {
                    console.debug('[vcc] startScreenShare: no video sender on peerConnection');
                }
            } catch (e) {
                console.error('[vcc] startScreenShare: error finding sender on peerConnection', e);
            }
        }
        await Promise.allSettled(senderPromises);

        // Update local video preview
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            console.debug('[vcc] startScreenShare: setting local preview to displayStream');
            localVideo.style.transform = 'none';
            try {
                localVideo.srcObject = displayStream;
                await localVideo.play().catch(err => console.debug('[vcc] localVideo.play() rejected', err));
            } catch (e) {
                console.error('[vcc] startScreenShare: error updating local preview', e);
            }
        }

        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) screenShareBtn.style.background = '#44AA99';

        screenTrack.onended = () => {
            console.debug('[vcc] screenTrack.onended fired');
            if (isScreenSharing) {
                stopScreenShare();
            }
        };
    } catch (error) {
        console.error('[vcc] Screen share error:', error);
        if (error && error.name !== 'NotAllowedError') {
            showToast('Erreur de partage d\'écran', 'error');
        }
    }
}

async function stopScreenShare() {
    if (!isScreenSharing) return;

    try {
        console.debug('[vcc] stopScreenShare: stopping screenShareStream if present');
        if (screenShareStream) {
            screenShareStream.getTracks().forEach((track) => {
                try { track.stop(); } catch (e) { console.debug('[vcc] stop track error', e); }
            });
        }

        if (originalVideoTrack) {
            console.debug('[vcc] stopScreenShare: restoring originalVideoTrack enabled state', { isVideoOff });
            originalVideoTrack.enabled = !isVideoOff;
        }

        const restoreTrack = originalVideoTrack;
        const senderPromises = [];
        if (isGroupCall) {
            console.debug('[vcc] stopScreenShare: replacing tracks on group peers', Object.keys(peerConnections).length);
            Object.values(peerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && restoreTrack) {
                        senderPromises.push(sender.replaceTrack(restoreTrack).then(() => {
                            console.debug('[vcc] replaceTrack OK (restore, group)', { pcId: pc.__id });
                        }).catch(err => {
                            console.error('[vcc] replaceTrack ERROR (restore, group)', { pcId: pc.__id, err });
                        }));
                    } else {
                        console.debug('[vcc] stopScreenShare: no video sender on pc or no restoreTrack', pc.__id);
                    }
                } catch (e) {
                    console.error('[vcc] stopScreenShare: error finding sender', e);
                }
            });
        } else if (peerConnection) {
            try {
                const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && restoreTrack) {
                    senderPromises.push(sender.replaceTrack(restoreTrack).then(() => {
                        console.debug('[vcc] replaceTrack OK (restore, p2p)');
                    }).catch(err => {
                        console.error('[vcc] replaceTrack ERROR (restore, p2p)', err);
                    }));
                } else {
                    console.debug('[vcc] stopScreenShare: no video sender on peerConnection or no restoreTrack');
                }
            } catch (e) {
                console.error('[vcc] stopScreenShare: error finding sender on peerConnection', e);
            }
        }
        await Promise.allSettled(senderPromises);

        isScreenSharing = false;
        originalVideoTrack = null;
        screenShareStream = null;

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            console.debug('[vcc] stopScreenShare: restoring local preview to localStream', { hasLocalStream: !!localStream });
            localVideo.style.transform = '';
            try {
                localVideo.srcObject = localStream;
                await localVideo.play().catch(err => console.debug('[vcc] localVideo.play() rejected during restore', err));
            } catch (e) {
                console.error('[vcc] stopScreenShare: error restoring local preview', e);
            }
        }

        const screenShareBtn = document.getElementById('screenShareBtn');
        if (screenShareBtn) screenShareBtn.style.background = '';
    } catch (error) {
        console.error('[vcc] Stop screen share error:', error);
    }
}
