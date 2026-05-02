function highlightCurrentSidebarLink() {
    const currentPage = window.location.pathname.split('/').pop().toLowerCase();
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href')?.split('/').pop().toLowerCase();
        if (href && href === currentPage) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', highlightCurrentSidebarLink);

document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
    link.addEventListener('click', function() {
        sessionStorage.setItem('menuScrollPos', document.querySelector('.nav-menu').scrollTop);
    });
});

window.addEventListener('load', function() {
    const scrollPos = sessionStorage.getItem('menuScrollPos');
    if (scrollPos) {
        document.querySelector('.nav-menu').scrollTop = scrollPos;
    }
});

// ========== MESSAGING ==========
let currentConversationId = null;
let currentPartnerId = null;

async function loadConversations() {
    try {
        const response = await fetch('http://localhost:3000/api/conversations', {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('nebras_token') }
        });
        const data = await response.json();
        
        const container = document.querySelector('.conversations-list');
        if (!container) return;
        
        if (!data.conversations || data.conversations.length === 0) {
            container.innerHTML = '<div class="no-conversations"><p>Aucune conversation</p></div>';
            return;
        }
        
        container.innerHTML = data.conversations.map(conv => `
            <div class="conversation-item" onclick="selectConversation('${conv.id}', '${conv.partner.id}')">
                <div class="conv-avatar">${(conv.partner.fullname || 'U').charAt(0).toUpperCase()}</div>
                <div class="conv-info">
                    <div class="conv-name">${conv.partner.fullname || 'Utilisateur'}</div>
                    <div class="conv-preview">${conv.lastMessage?.substring(0, 40) || 'Aucun message'}...</div>
                </div>
                <div class="conv-time">${conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString('fr-FR') : ''}</div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Error loading conversations:', e);
    }
}

async function selectConversation(convId, partnerId) {
    currentConversationId = convId;
    currentPartnerId = partnerId;
    
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    event.target.closest('.conversation-item')?.classList.add('active');
    
    document.querySelector('.empty-conversation').style.display = 'none';
    document.querySelector('.conversation-header').style.display = 'flex';
    document.querySelector('.message-input').style.display = 'flex';
    
    await loadMessages(convId);
}

async function loadMessages(convId) {
    try {
        const response = await fetch('http://localhost:3000/api/messages/' + convId, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('nebras_token') }
        });
        const data = await response.json();
        
        const container = document.querySelector('.chat-messages');
        if (!container) return;
        
        const currentUserId = JSON.parse(localStorage.getItem('nebras_user') || '{}').id;
        
        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = '<div class="no-messages"><p>Aucun message</p></div>';
            return;
        }
        
        container.innerHTML = data.messages.map(msg => `
            <div class="message ${msg.senderId === currentUserId ? 'sent' : 'received'}">
                <div class="message-content">${msg.content}</div>
                <div class="message-time">${new Date(msg.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
        
        const header = document.querySelector('.conversation-header');
        if (header) {
            const conv = data.messages[0];
            const partnerName = conv?.senderId === currentUserId ? conv?.receiver?.fullname : conv?.sender?.fullname;
            header.innerHTML = `
                <div class="conv-header-info">
                    <div class="conv-header-avatar">${(partnerName || 'U').charAt(0).toUpperCase()}</div>
                    <span class="conv-header-name">${partnerName || 'Utilisateur'}</span>
                </div>
            `;
        }
    } catch (e) {
        console.error('Error loading messages:', e);
    }
}

async function sendMessage() {
    const input = document.querySelector('.message-input input');
    const content = input?.value.trim();
    if (!content || !currentPartnerId) return;
    
    try {
        const response = await fetch('http://localhost:3000/api/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('nebras_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiverId: currentPartnerId, content })
        });
        
        if (response.ok) {
            input.value = '';
            await loadMessages(currentConversationId);
            await loadConversations();
        }
    } catch (e) {
        console.error('Error sending message:', e);
    }
}

document.addEventListener('DOMContentLoaded', loadConversations);