// ============================================
// VIDEO CALL CHAT - Group and appointment chat
// ============================================

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
        document.body.classList.add('video-chat-open');
        if (btn) btn.classList.add('active');
        if (!isGroupCall) {
            loadCallChatHistory();
        }
    } else {
        chatSection.style.display = 'none';
        document.body.classList.remove('video-chat-open');
        if (btn) btn.classList.remove('active');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const content = input?.value.trim();
    if (!content) return;

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
    const senderName = msg.fromName || (isSent ? 'Vous' : (otherParticipantName || 'Participant'));

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
