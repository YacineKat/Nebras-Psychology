// ============================================
// PSYCHOLOGUE MESSAGERIE - Simple & Clean
// ============================================

let conversations = [];
let currentChat = null;

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

    // Load user name
    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }

    // Load conversations
    await loadConversations();

    // Update badge
    await updateUnreadBadge();

    highlightCurrentSidebarLink();
}

async function loadConversations() {
    const listEl = document.querySelector('.conversations-list');
    listEl.innerHTML = '<div class="loading">Chargement...</div>';

    try {
        conversations = await messageAPI.getConversations() || [];
    } catch (e) {
        conversations = [];
    }

    if (conversations.length === 0) {
        listEl.innerHTML = `
            <div class="empty-conversations">
                <div class="empty-icon">💬</div>
                <p>Aucune conversation</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = conversations.map(c => {
        const profile = c.partner?.profile;
        
        let avatar = null;
        if (profile) {
            avatar = profile.avatar || profile.photo || profile.image || profile.profileImage || profile.picture;
        }
        
        const avatarHtml = avatar 
            ? `<img src="${avatar}" alt="Avatar" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 48px; height: 48px; background: var(--primary-beige); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">👤</div>`;
        
        return `
            <div class="conversation-item" data-id="${c.partner?.id}" onclick="openChatById('${c.partner?.id}')">
                <div class="conv-avatar">
                    ${avatarHtml}
                </div>
                <div class="conv-details">
                    <div class="conv-name" style="font-weight: 600; color: var(--text-dark);">${c.partner?.fullname || 'Patient'}</div>
                    <div style="font-size: 13px; color: var(--text-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.lastMessage || 'Aucun message'}</div>
                </div>
                <div class="conv-time" style="font-size: 12px; color: var(--text-light);">${formatTime(c.lastMessageTime)}</div>
            </div>
        `;
    }).join('');
}

function openChatById(userId) {
    const conv = conversations.find(c => c.partner?.id === userId);
    if (conv) openChat(conv);
}

async function openChat(conv) {
    currentChat = conv;
    const userId = conv.partner?.id;
    const userName = conv.partner?.fullname || 'Patient';
    const partnerAvatar = conv.partner?.profile?.avatar || conv.partner?.avatar;
    
    const avatarHtml = partnerAvatar 
        ? `<img src="${partnerAvatar}" alt="Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`
        : `<div style="width: 40px; height: 40px; background: var(--primary-beige); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">👤</div>`;

    // Update UI
    document.querySelectorAll('.conversation-item')?.forEach(el => el.classList.remove('active'));
    document.querySelector(`.conversation-item[data-id="${userId}"]`)?.classList.add('active');

    // Show chat area
    const area = document.querySelector('.conversation-area');
    area.innerHTML = `
        <div class="conversation-header" style="display: flex; padding: 16px 20px; border-bottom: 1px solid var(--border-color); background: white;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${avatarHtml}
                <span style="font-weight: 600; color: var(--primary-dark);">${userName}</span>
            </div>
        </div>
        <div class="chat-messages" id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;">
            <div class="loading">Chargement...</div>
        </div>
        <div style="display: flex; padding: 8px 16px; border-top: 1px solid #eee; background: white; gap: 8px; align-items: center;">
            <input type="text" id="msgInput" placeholder="Tapez votre message..." onkeypress="if(event.key==='Enter')sendMsg()" style="flex: 1; padding: 6px 12px; border: 1px solid #ddd; border-radius: 20px; outline: none; font-size: 13px; height: 32px; line-height: 20px;">
            <button onclick="sendMsg()" style="padding: 6px 12px; background: #44AA99; color: white; border: none; border-radius: 50%; cursor: pointer; width: 32px; height: 32px; font-size: 14px;">
                ➤
            </button>
        </div>
    `;

    // Load messages
    try {
        const messages = await messageAPI.getWithUser(userId) || [];
        renderMessages(messages, userId);
    } catch (e) {
        console.error(e);
        document.getElementById('chatMessages').innerHTML = '<div style="text-align: center; color: var(--text-light);">Erreur de chargement</div>';
    }
}

function renderMessages(messages, partnerId) {
    const user = getCurrentUser();
    const currentUserId = user?.id;
    const container = document.getElementById('chatMessages');

    if (!messages.length) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-light); padding: 40px;">Commencez la conversation!</div>';
        return;
    }

    container.innerHTML = messages.map(m => {
        const isMe = m.senderId === currentUserId;
        return `
            <div style="display: flex; ${isMe ? 'justify-content: flex-end;' : 'justify-content: flex-start;'}">
                <div style="max-width: 70%; padding: 12px 16px; border-radius: 16px; ${isMe ? 'background: var(--primary-green); color: white; border-bottom-right-radius: 4px;' : 'background: var(--primary-beige); color: var(--text-dark); border-bottom-left-radius: 4px;'}">
                    <div style="font-size: 14px;">${escapeHtml(m.content)}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 4px; text-align: ${isMe ? 'right' : 'left'};">${formatTime(m.createdAt)}</div>
                </div>
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
        await openChat(currentChat);
    } catch (e) {
        console.error(e);
        showToast('Erreur: ' + e.message, 'error');
    }
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
        const conversations = await messageAPI.getConversations() || [];
        const count = conversations.length;
        const badge = document.querySelector('.nav-item[href="psychologue_messagerie.html"] .badge');
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