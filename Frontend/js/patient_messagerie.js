// ============================================
// PATIENT MESSAGERIE - Simple & Clean
// ============================================

let conversations = [];
let currentChat = null;
let conversationsSignature = '';
let currentMessagesSignature = '';

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'patient') {
        redirectByUserType(getUserType());
        return;
    }

    // Load user name
    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }

    // Check for pre-selected doctor from psychologue page
    const preSelectedId = localStorage.getItem('selectedDoctorId');
    const preSelectedName = localStorage.getItem('selectedDoctorName');
    localStorage.removeItem('selectedDoctorId');
    localStorage.removeItem('selectedDoctorName');

    // Load conversations
    await loadConversations();

    // Open pre-selected conversation if exists
    if (preSelectedId) {
        const conv = conversations.find(c => c.partner?.id === preSelectedId);
        if (conv) {
            openChat(conv);
        } else if (preSelectedName) {
            startNewChat(preSelectedId, preSelectedName);
        }
    }

    highlightCurrentSidebarLink();
}

async function loadConversations() {
    const listEl = document.querySelector('.conversations-list');

    try {
        const nextConversations = await messageAPI.getConversations() || [];
        const nextSignature = nextConversations.map(c => `${c.partner?.id}:${c.lastMessageTime || ''}:${c.lastMessage || ''}:${c.unreadCount || 0}`).join('|');
        conversations = nextConversations;

        if (nextSignature === conversationsSignature && listEl.dataset.loaded === '1') {
            return false;
        }

        conversationsSignature = nextSignature;
    } catch (e) {
        console.error(e);
        conversations = [];
        conversationsSignature = '';
    }

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
    currentMessagesSignature = '';
    const userId = conv.partner?.id;
    const userName = conv.partner?.fullname || 'Utilisateur';
    const avatarHtml = renderAvatarMarkup(conv.partner, 40, '18px');

    // Update UI
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.conversation-item[data-id="${userId}"]`)?.classList.add('active');

    // Show chat area
    const area = document.querySelector('.conversation-area');
    area.innerHTML = `
        <div class="chat-header">
            <div class="chat-user">
                ${avatarHtml}
                <span class="name">${escapeHtml(userName)}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="loading">Chargement...</div>
        </div>
        <div class="chat-input">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()">
            <button class="send-btn" onclick="sendMsg()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </div>
    `;

    // Load messages
    try {
        const messages = await messageAPI.getWithUser(userId) || [];
        renderMessages(messages, userId);
    } catch (e) {
        console.error(e);
        document.getElementById('chatMessages').innerHTML = '<div class="empty-state" style="padding: 40px;">Erreur de chargement</div>';
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
    
    if (!messages.length) {
        container.innerHTML = '<div class="empty-state">Commencez la conversation !</div>';
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
    const content = input.value.trim();
    
    if (!content || !currentChat) return;

    input.value = '';
    
    try {
        await messageAPI.send(currentChat.partner?.id, content);
        await loadCurrentThread();
        await loadConversations();
    } catch (e) {
        console.error(e);
        showToast('Erreur: ' + e.message, 'error');
    }
}

function startNewChat(doctorId, doctorName) {
    currentChat = { partner: { id: doctorId, fullname: doctorName } };
    
    const area = document.querySelector('.conversation-area');
    area.innerHTML = `
        <div class="chat-header">
            <div class="chat-user">
                ${renderAvatarMarkup(currentChat.partner, 40, '18px')}
                <span class="name">${escapeHtml(doctorName)}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="empty-state">Nouvelle conversation avec ${escapeHtml(doctorName)}</div>
        </div>
        <div class="chat-input">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()">
            <button class="send-btn" onclick="sendMsg()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </div>
    `;
}

async function loadCurrentThread() {
    if (!currentChat?.partner?.id) return;
    const messages = await messageAPI.getWithUser(currentChat.partner.id) || [];
    renderMessages(messages, currentChat.partner.id);
}

function renderConversationItem(c) {
    const partner = c.partner || {};
    const name = partner.fullname || 'Utilisateur';

    return `
        <div class="conversation-item" data-id="${partner.id}" onclick="openChatById('${partner.id}')">
            <div class="conv-avatar">${renderAvatarMarkup(partner, 48, '20px')}</div>
            <div class="conv-details">
                <div class="conv-name">${escapeHtml(name)}</div>
                <div class="conv-preview">${escapeHtml(c.lastMessage || 'Aucun message')}</div>
            </div>
            <div class="conv-time">${formatTime(c.lastMessageTime)}</div>
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
        const badge = document.querySelector('.nav-item[href="patient_messagerie.html"] .badge');
        if (badge) badge.textContent = count;
    } catch (e) {}
}

function highlightCurrentSidebarLink() {
    const current = window.location.pathname.split('/').pop().toLowerCase();
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href')?.split('/').pop().toLowerCase();
        item.classList.toggle('active', href === current);
    });
}

// Expose functions globally
window.openChatById = openChatById;
window.sendMsg = sendMsg;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;