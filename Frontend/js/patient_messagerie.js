// ============================================
// PATIENT MESSAGERIE - Simple & Clean
// ============================================

let conversations = [];
let currentChat = null;

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
    listEl.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        conversations = await messageAPI.getConversations() || [];
    } catch (e) {
        console.error(e);
        conversations = [];
    }

    if (conversations.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">💬</span>
                <p>Aucune conversation</p>
                <small>Contactez un psychologue pour commencer</small>
            </div>
        `;
        return;
    }

    listEl.innerHTML = conversations.map(c => `
        <div class="conv-item" data-id="${c.partner?.id}" onclick="openChatById('${c.partner?.id}')">
            <div class="conv-avatar">👤</div>
            <div class="conv-details">
                <div class="conv-name">${c.partner?.fullname || 'Utilisateur'}</div>
                <div class="conv-preview">${c.lastMessage || 'Aucun message'}</div>
            </div>
            <div class="conv-time">${formatTime(c.lastMessageTime)}</div>
        </div>
    `).join('');
}

function openChatById(userId) {
    const conv = conversations.find(c => c.partner?.id === userId);
    if (conv) openChat(conv);
}

async function openChat(conv) {
    currentChat = conv;
    const userId = conv.partner?.id;
    const userName = conv.partner?.fullname || 'Utilisateur';

    // Update UI
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.conv-item[data-id="${userId}"]`)?.classList.add('active');

    // Show chat area
    const area = document.querySelector('.conversation-area');
    area.innerHTML = `
        <div class="chat-header">
            <div class="chat-user">
                <span class="avatar">👤</span>
                <span class="name">${userName}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="loading">Chargement...</div>
        </div>
        <div class="chat-input">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()">
            <button onclick="sendMsg()">➤</button>
        </div>
    `;

    // Load messages
    try {
        const messages = await messageAPI.getWithUser(userId) || [];
        renderMessages(messages, userId);
    } catch (e) {
        console.error(e);
        document.getElementById('chatMessages').innerHTML = '<div class="empty-state">Erreur de chargement</div>';
    }
}

function renderMessages(messages, partnerId) {
    const user = getCurrentUser();
    const currentUserId = user?.id;
    const container = document.getElementById('chatMessages');
    
    if (!messages.length) {
        container.innerHTML = '<div class="empty-state">Commencez la conversation!</div>';
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
        await openChat(currentChat); // Refresh
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
                <span class="avatar">👤</span>
                <span class="name">${doctorName}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            <div class="empty-state">Nouvelle conversation avec ${doctorName}</div>
        </div>
        <div class="chat-input">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()">
            <button onclick="sendMsg()">➤</button>
        </div>
    `;
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
    div.textContent = text;
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