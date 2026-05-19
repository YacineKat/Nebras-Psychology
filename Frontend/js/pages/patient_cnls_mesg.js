// ========== VIP STATUS PATIENT ==========
let isPatientVIP = false;
let selectedOffer = null;
let selectedOfferElement = null;

// Vérifier le statut VIP au chargement
document.addEventListener('DOMContentLoaded', function() {
    checkVIPStatus();
    setupConversationClick();
    highlightCurrentSidebarLink();
});

function checkVIPStatus() {
    const saved = localStorage.getItem('patient_vip_status');
    if (saved === 'true') {
        isPatientVIP = true;
    } else {
        isPatientVIP = false;
    }
    updateVIPDisplay();
}

function updateVIPDisplay() {
    const badge = document.getElementById('vipChatStatusBadge');
    const chatContent = document.getElementById('chatContent');
    const notActivated = document.getElementById('vipNotActivated');
    const infoNote = document.getElementById('vipInfoNote');

    if (isPatientVIP) {
        if (badge) {
            badge.innerText = 'Activé';
            badge.classList.add('actif');
        }
        if (chatContent) chatContent.style.display = 'block';
        if (notActivated) notActivated.style.display = 'none';
        if (infoNote) infoNote.style.display = 'none';
    } else {
        if (badge) {
            badge.innerText = 'Non activé';
            badge.classList.remove('actif');
        }
        if (chatContent) chatContent.style.display = 'none';
        if (notActivated) notActivated.style.display = 'flex';
        if (infoNote) infoNote.style.display = 'flex';
    }
}

function setupConversationClick() {
    const conversations = document.querySelectorAll('.conversation-item');
    conversations.forEach(conv => {
        conv.addEventListener('click', function() {
            if (!isPatientVIP) {
                openVipPaymentModal();
                return;
            }
            
            document.querySelectorAll('.conversation-item').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            const psyName = this.dataset.psyName || 'Conseiller';
            document.getElementById('chatPsyName').textContent = psyName;
            
            document.querySelector('.empty-conversation').style.display = 'none';
            document.querySelector('.chat-active').style.display = 'flex';
        });
    });
}

// ========== MODAL VIP ==========
function openVipPaymentModal() {
    document.getElementById('vipPaymentModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVipPaymentModal() {
    document.getElementById('vipPaymentModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function selectVipOffer(element, offer) {
    if (selectedOfferElement) {
        selectedOfferElement.classList.remove('selected');
    }
    element.classList.add('selected');
    selectedOfferElement = element;
    selectedOffer = offer;
}

function activatePatientVIP() {
    const ccp = document.getElementById('ccpNumber').value;
    const expDate = document.getElementById('expDate').value;
    const cvv = document.getElementById('cvv').value;
    
    if (!ccp || !expDate || !cvv) {
        alert('❌ Veuillez remplir tous les champs');
        return;
    }
    if (!selectedOffer) {
        alert('❌ Veuillez choisir une offre');
        return;
    }
    
    alert('✅ Paiement réussi ! Vous êtes maintenant patient VIP.');
    isPatientVIP = true;
    localStorage.setItem('patient_vip_status', 'true');
    updateVIPDisplay();
    closeVipPaymentModal();
}

// Envoi de message
document.querySelector('.send-btn')?.addEventListener('click', function() {
    const input = document.querySelector('.message-input');
    const message = input?.value.trim();
    if (message && isPatientVIP) {
        const messagesContainer = document.querySelector('.chat-messages');
        const now = new Date();
        const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message-wrapper sent';
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-bubble sent-bubble">
                    <p>${escapeHtml(message)}</p>
                </div>
                <span class="message-time">${time}</span>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        input.value = '';
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeVipPaymentModal();
    }
});
