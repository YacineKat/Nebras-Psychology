// ============================================
// VIDEO CALL WEBRTC - Signaling + peer connections
// ============================================
// WEBRTC-PRIMARY module with intrinsic DOM callbacks.
// Merged: socket signaling, offer/answer/ICE, peer connection lifecycle.

// ============================================
// 1-ON-1: Connect to video server
// ============================================

async function connectToVideoServer() {
    return new Promise((resolve, reject) => {
        videoSocket = io(videoServerUrl, {
            transports: ['polling', 'websocket']
        });

        videoSocket.on('connect', () => {
            console.log('Connected to video server');
            
            const userName = currentUser.fullname || 'User';
            videoSocket.emit('join-room', { roomId, userName }, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                
                console.log('[P2P] Joined room:', response);
                
                if (response.participants && response.participants.length > 0) {
                    otherParticipantId = response.participants[0].id;
                    otherParticipantName = response.participants[0].name;
                    console.log('[P2P] Other participant:', otherParticipantName, otherParticipantId);
                    videoSocket.emit('participant-video-update', {
                        roomId,
                        targetId: otherParticipantId,
                        isVideoOff: true
                    });
                }
                
                createPeerConnection();
                console.log('[P2P] PC created, local tracks:', localStream?.getTracks().length || 0);
                
                resolve();
            });
        });
        
        videoSocket.on('connect_error', (error) => {
            console.error('Video server connection error:', error);
            reject(error);
        });
        
        videoSocket.on('participant-joined', (participant) => {
            console.log('Participant joined:', participant);
            otherParticipantId = participant.id;
            otherParticipantName = participant.name;
            setAvatarInitial('remoteAvatarCircle', otherParticipantName, remoteAvatarUrl);
            
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

// ============================================
// PATIENT GROUP: Connect to video server
// ============================================

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

        videoSocket.on('participant-joined', (participant) => {
            console.log('[GroupCall] Participant joined:', participant.name);
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
            console.log('Group participant left:', socketId);
            removeGroupParticipant(socketId);
        });

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
                addIceCandidateSafely(pc, candidate).catch(e => console.log('[GroupCall] ICE add error:', e));
            }
        });

        videoSocket.on('participant-video-update', ({ socketId, isVideoOff: off }) => {
            if (off !== undefined && socketId) {
                remoteVideoOff = off;
                updateGroupParticipantTileVideo(socketId, off);
            }
        });

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

        videoSocket.on('room-closed', () => {
            console.log('Group room closed by host');
            handleGroupCallEnded();
        });

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
// DOCTOR GROUP: Connect to video server
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
                addIceCandidateSafely(pc, candidate).catch(e => console.log('[DoctorGroup] ICE error:', e));
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
// GROUP: Peer connection management
// ============================================

function setupGroupPeerConnection(participant, shouldInitiate = false) {
    if (peerConnections[participant.id]) {
        otherParticipants[participant.id] = {
            ...(otherParticipants[participant.id] || {}),
            ...participant,
            shouldInitiate: (otherParticipants[participant.id]?.shouldInitiate || shouldInitiate)
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

        const existingName = document.querySelector(`#participant_${participant.id} .tile-info`);
        if (existingName && participant.name) {
            existingName.textContent = participant.name;
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
    otherParticipants[participant.id] = { ...participant, shouldInitiate };

    pc.onnegotiationneeded = async () => {
        try {
            if (pc.signalingState !== 'stable') return;
            await createAndSendGroupOffer(participant.id);
        } catch (err) {
            console.error('[GroupCall] onnegotiationneeded error:', err);
        }
    };

    const videoEl = addGroupParticipantTile(participant);

    attachLocalTracksToPeerConnection(pc);

    const remoteStream = new MediaStream();
    if (videoEl) {
        videoEl.srcObject = remoteStream;
    }

    hydrateParticipantTile(participant, participant.avatarUrl || participantAvatars?.[participant?.userId] || null);

    pc.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        if (videoEl && event.track.kind === 'video') {
            videoEl.srcObject = null;
            videoEl.srcObject = remoteStream;
        }
    };

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

    if (shouldInitiate && videoSocket && localStream) {
        createAndSendGroupOffer(participant.id);
    }
}

function createGroupPeerConnection(participant) {
    setupGroupPeerConnection(participant, false);
}

function createAndSendGroupOffer(targetId) {
    const pc = peerConnections[targetId];
    if (!pc || pc.signalingState !== 'stable' || !videoSocket) return;
    if (pc.__groupOfferInFlight) return;
    pc.__groupOfferInFlight = true;
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
        .catch(e => {
            console.log('[GroupCall] Offer error:', e);
        })
        .finally(() => {
            pc.__groupOfferInFlight = false;
        });
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

        if (localStream) {
            localStream.getTracks().forEach(track => {
                try { track.stop(); } catch (e) {}
            });
            localStream = null;
        }

        Object.values(peerConnections).forEach(pc => {
            try { if (pc) pc.close(); } catch (e) {}
        });
        peerConnections = {};
        otherParticipants = {};

        if (videoSocket) {
            videoSocket.removeAllListeners();
            videoSocket.disconnect();
            videoSocket = null;
        }

        stopCallTimer();

        sessionStorage.removeItem('groupCallRoom');
        sessionStorage.removeItem('groupCallGroupId');
        sessionStorage.removeItem('groupCallDoctorId');
        sessionStorage.removeItem('groupCallDoctorName');

        groupChatMessages = [];
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) msgContainer.innerHTML = '';

        const localVideoEl = document.getElementById('localVideo');
        if (localVideoEl) {
            localVideoEl.srcObject = null;
        }

        const grid = document.getElementById('participantGrid');
        if (grid) {
            const remoteTiles = grid.querySelectorAll('[id^="participant_"]');
            remoteTiles.forEach(t => t.remove());
        }

        const dashboardUrl = isDoctor ? 'psychologue_dashboard.html' : 'patient_dashboard.html';
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

// ============================================
// 1-ON-1: Peer connection management
// ============================================

function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };
    
    peerConnection = new RTCPeerConnection(config);
    
    peerConnection.onnegotiationneeded = async () => {
        try {
            if (peerConnection.signalingState !== 'stable') return;
            await createAndSendOffer();
        } catch (err) {
            console.error('onnegotiationneeded error:', err);
        }
    };
    
    attachLocalTracksToPeerConnection(peerConnection);
    if (localStream) {
        console.log('[P2P] Local tracks attached to PC');
    }
    
    const remoteStream = new MediaStream();
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
    }
    
    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        console.log('[P2P] ontrack:', event.track.kind);
    };
    
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

    if (!localStream) {
        console.log('Waiting for local media before creating offer');
        return;
    }
    
    if (!otherParticipantId) {
        console.log('Waiting for other participant to join...');
        return;
    }
    
    if (peerConnection.signalingState !== 'stable') {
        console.log('Cannot create offer in state:', peerConnection.signalingState);
        return;
    }

    if (peerConnection.__offerInFlight) return;
    peerConnection.__offerInFlight = true;
    
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
    } finally {
        peerConnection.__offerInFlight = false;
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

// ============================================
// ICE handling
// ============================================

async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingIceCandidates(peerConnection);
        console.log('Set remote description for offer');
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingIceCandidates(peerConnection);
        console.log('P2P connection established - set remote description for answer');
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleIceCandidate(candidate) {
    try {
        await addIceCandidateSafely(peerConnection, candidate);
        console.log('Added ICE candidate');
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
}

function queueIceCandidate(pc, candidate) {
    if (!pc) return;
    if (!pc.__pendingIceCandidates) pc.__pendingIceCandidates = [];
    pc.__pendingIceCandidates.push(candidate);
}

async function flushPendingIceCandidates(pc) {
    if (!pc || !pc.__pendingIceCandidates || !pc.__pendingIceCandidates.length) return;
    const pending = pc.__pendingIceCandidates.splice(0, pc.__pendingIceCandidates.length);
    for (const candidate of pending) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.log('[P2P] flush ICE candidate error:', e);
        }
    }
}

async function addIceCandidateSafely(pc, candidate) {
    if (!pc || !candidate) return;
    if (!pc.remoteDescription) {
        queueIceCandidate(pc, candidate);
        return;
    }

    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        if (pc.signalingState !== 'closed') {
            queueIceCandidate(pc, candidate);
        }
        throw error;
    }
}

// ============================================
// Participant left (1-on-1)
// ============================================

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
