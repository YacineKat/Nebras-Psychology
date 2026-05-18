let conversations = [];
let currentChat = null;
let conversationsSignature = '';
let currentMessagesSignature = '';
let isChatOpen = false;
let currentMessages = [];
let currentMessageIds = new Set();
let counselorMessagingSocket = null;
let counselorMessagingSocketBound = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }

    await loadConversations();
    await updateUnreadBadge();
    connectMessagingRealtime();
    highlightCurrentSidebarLink();
}

async function loadConversations(silent = false) {
    const listEl = document.querySelector('.conversations-list');
    if (!silent && !listEl.dataset.loaded) {
        listEl.innerHTML = '<div class="loading">Chargement...</div>';
    }

    let nextConversations = [];
    try {
        nextConversations = await messageAPI.getConversations() || [];
    } catch (e) {
        nextConversations = [];
    }

    const nextSignature = nextConversations.map(c => `${c.partner?.id}:${c.lastMessageTime || ''}:${c.lastMessage || ''}:${c.unreadCount || 0}`).join('|');
    conversations = nextConversations;

    if (nextSignature === conversationsSignature && listEl.dataset.loaded === '1') {
        return false;
    }

    conversationsSignature = nextSignature;

    if (conversations.length === 0) {
        listEl.innerHTML = `
            <div class="empty-conversations">
                <div class="empty-icon">💬</div>
                <p>Aucune conversation</p>
            </div>
        `;
        listEl.dataset.loaded = '1';
        return true;
    }

    listEl.innerHTML = conversations.map(c => renderConversationItem(c)).join('');
    listEl.dataset.loaded = '1';

    if (currentChat?.partner?.id) {
        document.querySelector(`.conversation-item[data-id="${currentChat.partner.id}"]`)?.classList.add('active');
    }

    return true;
}

function openChatById(userId) {
    const conv = conversations.find(c => c.partner?.id === userId);
    if (conv) openChat(conv);
}

async function openChat(conv) {
    currentChat = conv;
    isChatOpen = true;
    currentMessagesSignature = '';
    currentMessages = [];
    currentMessageIds = new Set();
    const userId = conv.partner?.id;
    const userName = conv.partner?.fullname || 'Patient';

    document.querySelectorAll('.conversation-item')?.forEach(el => el.classList.remove('active'));
    document.querySelector(`.conversation-item[data-id="${userId}"]`)?.classList.add('active');

    const area = document.querySelector('.conversation-area');
    area.innerHTML = `
        <div class="chat-header">
            <div class="chat-user">
                ${renderAvatarMarkup(conv.partner, 40, '18px')}
                <span class="name">${escapeHtml(userName)}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="loading">Chargement...</div>
        </div>
        <div class="chat-input">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()">
            <button onclick="sendMsg()" class="send-btn">➤</button>
        </div>
    `;

    try {
        const messages = await messageAPI.getWithUser(userId) || [];
        renderMessages(messages, userId);
        markConversationRead(userId);
    } catch (e) {
        console.error(e);
        const container = document.getElementById('chatMessages');
        if (container) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 40px;">Erreur de chargement</div>';
        }
    }
}

function renderMessages(messages, partnerId) {
    const user = getCurrentUser();
    const currentUserId = user?.id;
    const container = document.getElementById('chatMessages');
    const nextSignature = messages.map(m => `${m.id}:${m.createdAt}`).join('|');

    if (nextSignature === currentMessagesSignature) {
        return;
    }

    currentMessagesSignature = nextSignature;
    currentMessages = messages.slice();
    currentMessageIds = new Set(messages.map(m => m.id));

    if (!messages.length) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 40px;">Commencez la conversation !</div>';
        return;
    }

    container.innerHTML = messages.map(m => {
        const isMe = m.senderId === currentUserId;
        return `
            <div class="msg ${isMe ? 'sent' : 'received'}">
                <div class="msg-bubble">${escapeHtml(m.content)}</div>
                <div class="msg-time">${formatTime(m.createdAt)}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

async function sendMsg() {
    const input = document.getElementById('msgInput');
    const content = input?.value.trim();

    if (!content || !currentChat) return;

    input.value = '';

    try {
        const socket = connectMessagingRealtime();
        if (socket) {
            await sendMessageRealtime(currentChat.partner?.id, content);
        } else {
            await messageAPI.send(currentChat.partner?.id, content);
            await loadConversations(true);
        }
    } catch (e) {
        console.error(e);
        showToast('Erreur: ' + e.message, 'error');
    }
}

function connectMessagingRealtime() {
    if (!counselorMessagingSocket && typeof connectMessagingSocket === 'function') {
        counselorMessagingSocket = connectMessagingSocket();
    }

    if (counselorMessagingSocket && !counselorMessagingSocketBound) {
        counselorMessagingSocketBound = true;
        counselorMessagingSocket.on('message:new', handleRealtimeMessage);
    }

    return counselorMessagingSocket;
}

function sendMessageRealtime(receiverId, content) {
    return new Promise((resolve, reject) => {
        const socket = connectMessagingRealtime();
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

function handleRealtimeMessage(payload) {
    const message = payload?.message || payload;
    if (!message?.id) return;

    const currentUserId = getCurrentUser()?.id;
    const partnerId = message.senderId === currentUserId ? message.receiverId : message.senderId;

    if (!partnerId) return;

    upsertConversationFromMessage(message, partnerId);

    const activePartnerId = currentChat?.partner?.id;
    if (activePartnerId === partnerId) {
        appendMessageToThread(message);
        markConversationRead(partnerId);
        return;
    }

    if (message.receiverId === currentUserId) {
        incrementUnreadBadge();
    }
}

function appendMessageToThread(message) {
    const container = document.getElementById('chatMessages');
    const currentUserId = getCurrentUser()?.id;
    if (!container || !message?.id || currentMessageIds.has(message.id)) return;

    currentMessages.push(message);
    currentMessageIds.add(message.id);
    currentMessagesSignature = currentMessages.map(m => `${m.id}:${m.createdAt}`).join('|');

    const isMe = message.senderId === currentUserId;
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${isMe ? 'sent' : 'received'}`;
    wrapper.innerHTML = `
        <div class="msg-bubble">${escapeHtml(message.content || '')}</div>
        <div class="msg-time">${formatTime(message.createdAt)}</div>
    `;

    const isNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 80;
    container.appendChild(wrapper);
    if (isNearBottom || isMe) {
        container.scrollTop = container.scrollHeight;
    }
}

function upsertConversationFromMessage(message, partnerId) {
    const currentUserId = getCurrentUser()?.id;
    const partner = message.senderId === currentUserId ? message.receiver : message.sender;
    if (!partner) return;

    const existing = conversations.find(conv => conv.partner?.id === partnerId);
    const nextConversation = {
        partner: {
            id: partner.id,
            fullname: partner.fullname,
            userType: partner.userType || existing?.partner?.userType,
            profile: partner.profile || existing?.partner?.profile || null
        },
        lastMessage: message.content,
        lastMessageTime: message.createdAt,
        unreadCount: message.senderId === currentUserId ? 0 : (currentChat?.partner?.id === partnerId ? 0 : (existing?.unreadCount || 0) + 1)
    };

    conversations = [
        nextConversation,
        ...conversations.filter(conv => conv.partner?.id !== partnerId)
    ];

    renderOrMoveConversationItem(nextConversation, currentChat?.partner?.id === partnerId);
}

function renderOrMoveConversationItem(conversation, isActive = false) {
    const listEl = document.querySelector('.conversations-list');
    if (!listEl || !conversation?.partner?.id) return;

    const partnerId = conversation.partner.id;
    const temp = document.createElement('div');
    temp.innerHTML = renderConversationItem(conversation).trim();
    const item = temp.firstElementChild;
    if (!item) return;

    if (isActive) {
        item.classList.add('active');
    }

    const existing = listEl.querySelector(`.conversation-item[data-id="${partnerId}"]`);
    if (existing) {
        existing.replaceWith(item);
    } else {
        listEl.prepend(item);
    }
}

function markConversationRead(partnerId) {
    const conversation = conversations.find(conv => conv.partner?.id === partnerId);
    if (!conversation || conversation.unreadCount === 0) return;

    conversation.unreadCount = 0;
    renderOrMoveConversationItem(conversation, true);
    updateUnreadBadgeFromState();
}

function incrementUnreadBadge() {
    const badge = document.querySelector('.nav-item[href="counselor_messagerie.html"] .badge');
    if (!badge) return;
    const current = parseInt(badge.textContent || '0', 10) || 0;
    badge.textContent = String(current + 1);
}

function updateUnreadBadgeFromState() {
    const badge = document.querySelector('.nav-item[href="counselor_messagerie.html"] .badge');
    if (!badge) return;
    const count = conversations.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
    badge.textContent = String(count);
}

function renderConversationItem(c) {
    const partner = c.partner || {};
    const name = partner.fullname || 'Patient';

    return `
        <div class="conversation-item" data-id="${partner.id}" onclick="openChatById('${partner.id}')">
            <div class="conv-avatar">
                ${renderAvatarMarkup(partner, 48, '20px')}
            </div>
            <div class="conv-details">
                <div class="conv-name" style="font-weight: 600; color: var(--text-dark);">${escapeHtml(name)}</div>
                <div style="font-size: 13px; color: var(--text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.lastMessage || 'Aucun message')}</div>
            </div>
            <div class="conv-time" style="font-size: 12px; color: var(--text-light);">${formatTime(c.lastMessageTime)}</div>
        </div>
    `;
}

function renderAvatarMarkup(userLike, size, fontSize) {
    const avatarUrl = getUserAvatarUrl(userLike);
    const name = userLike?.fullname || userLike?.name || userLike?.email || '';
    const initial = (name.trim().charAt(0) || '?').toUpperCase();

    if (avatarUrl) {
        return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;">`;
    }

    return `<div style="width:${size}px;height:${size}px;background: linear-gradient(135deg, var(--primary-green), #2F8F83);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${fontSize};font-weight:700;color:white;flex-shrink:0;">${escapeHtml(initial)}</div>`;
}

function getUserAvatarUrl(userLike) {
    return userLike?.profile?.avatar || userLike?.avatar || userLike?.photo || userLike?.image || userLike?.profileImage || userLike?.picture || null;
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));

    if (diff === 0) return d.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    if (diff === 1) return 'Hier';
    if (diff < 7) return d.toLocaleDateString('fr-FR', {weekday:'short'});
    return d.toLocaleDateString('fr-FR', {day:'numeric',month:'short'});
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

async function updateUnreadBadge() {
    try {
        const result = await messageAPI.getUnreadCount().catch(() => null);
        const count = result?.unreadCount || 0;
        const badge = document.querySelector('.nav-item[href="counselor_messagerie.html"] .badge');
        if (badge) badge.textContent = count;
    } catch (e) {}
}

window.openChatById = openChatById;
window.sendMsg = sendMsg;
window.showToast = showToast;
