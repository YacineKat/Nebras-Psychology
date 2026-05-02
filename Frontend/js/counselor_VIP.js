let isVIP = false;
let selectedOffer = null;
let selectedOfferElement = null;

document.addEventListener('DOMContentLoaded', function() {
    updateVIPStatus();
    if (!isVIP) {
        setTimeout(function() {
            openVipPaymentModal();
        }, 500);
    }
});

function updateVIPStatus() {
    const badge = document.getElementById('vipStatusBadge');
    if (isVIP) {
        badge.innerText = 'Activé';
        badge.classList.add('actif');
    } else {
        badge.innerText = 'Non activé';
        badge.classList.remove('actif');
    }
}

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

function activateVIP() {
    const ccp = document.getElementById('ccpNumber').value;
    const expDate = document.getElementById('expDate').value;
    const cvv = document.getElementById('cvv').value;
    
    if (!ccp || !expDate || !cvv) {
        showToast('❌ Veuillez remplir tous les champs');
        return;
    }
    if (!selectedOffer) {
        showToast('❌ Veuillez choisir une offre');
        return;
    }
    
    showToast('✅ Paiement réussi ! Vous êtes maintenant counselor VIP.');
    isVIP = true;
    updateVIPStatus();
    closeVipPaymentModal();
}

function saveVipForm() {
    if (!isVIP) {
        showToast('❌ Vous devez d\'abord activer votre compte VIP pour créer le formulaire.');
        openVipPaymentModal();
        return;
    }
    
    const q1 = document.getElementById('q1').value;
    const q2 = document.getElementById('q2').value;
    const q3 = document.getElementById('q3').value;
    const q4 = document.getElementById('q4').value;
    const q5 = document.getElementById('q5').value;
    
    if (!q1 || !q2 || !q4 || !q5) {
        showToast('❌ Veuillez remplir toutes les questions obligatoires');
        return;
    }
    
    showToast('✅ Formulaire VIP enregistré ! Vos patients pourront le remplir avant chaque séance.');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeVipPaymentModal();
    }
});

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