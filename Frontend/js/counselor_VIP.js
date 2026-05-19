let isVIP = false;
let selectedOffer = null;
let selectedOfferElement = null;

document.addEventListener('DOMContentLoaded', function() {
    loadVipData();
});

async function loadVipData() {
    try {
        const data = await doctorAPI.getVipStatus();

        isVIP = data.isVIP;

        updateVIPStatus(data.isVIP);

        if (data.form) {
            document.getElementById('q1').value = data.form.question1 || '';
            document.getElementById('q2').value = data.form.question2 || '';
            document.getElementById('q3').value = data.form.question3 || 'Non';
            document.getElementById('q4').value = data.form.question4 || '';
            document.getElementById('q5').value = data.form.question5 || '';
        }

        if (!isVIP) {
            setTimeout(function() {
                openVipPaymentModal();
            }, 500);
        }
    } catch (error) {
        console.error('Error loading VIP data:', error);
        showToast('Erreur lors du chargement des données VIP', 'error');
    }
}

function updateVIPStatus(active) {
    const badge = document.getElementById('vipStatusBadge');
    if (active) {
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

async function activateVIP() {
    const ccp = document.getElementById('ccpNumber').value;
    const expDate = document.getElementById('expDate').value;
    const cvv = document.getElementById('cvv').value;

    if (!ccp || !expDate || !cvv) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    if (!selectedOffer) {
        showToast('Veuillez choisir une offre', 'error');
        return;
    }

    try {
        await doctorAPI.activateVip(selectedOffer, ccp);

        showToast('Paiement réussi ! Vous êtes maintenant counselor VIP.', 'success');
        isVIP = true;
        updateVIPStatus(true);
        closeVipPaymentModal();

        document.getElementById('ccpNumber').value = '';
        document.getElementById('expDate').value = '';
        document.getElementById('cvv').value = '';
        selectedOffer = null;
        if (selectedOfferElement) {
            selectedOfferElement.classList.remove('selected');
            selectedOfferElement = null;
        }

    } catch (error) {
        console.error('Error activating VIP:', error);
        showToast(error.message || 'Erreur lors de l\'activation du VIP', 'error');
    }
}

async function saveVipForm() {
    if (!isVIP) {
        showToast('Vous devez d\'abord activer votre compte VIP pour créer le formulaire.', 'error');
        openVipPaymentModal();
        return;
    }

    const q1 = document.getElementById('q1').value;
    const q2 = document.getElementById('q2').value;
    const q3 = document.getElementById('q3').value;
    const q4 = document.getElementById('q4').value;
    const q5 = document.getElementById('q5').value;

    if (!q1 || !q2 || !q4 || !q5) {
        showToast('Veuillez remplir toutes les questions obligatoires', 'error');
        return;
    }

    try {
        await doctorAPI.saveVipForm({
            question1: q1,
            question2: q2,
            question3: q3,
            question4: q4,
            question5: q5
        });

        showToast('Formulaire VIP enregistré ! Vos patients pourront le remplir avant chaque séance.', 'success');

    } catch (error) {
        console.error('Error saving VIP form:', error);
        showToast(error.message || 'Erreur lors de l\'enregistrement du formulaire', 'error');
    }
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

loadPublicSettings().then(s => {
    if (s.vipMonthlyPrice) {
        const monthly = document.querySelector('.vip-offer:first-child .price');
        const annual = document.querySelector('.vip-offer:last-child .price');
        if (monthly) monthly.textContent = Number(s.vipMonthlyPrice).toLocaleString() + ' DA';
        if (annual) annual.textContent = Number(s.vipMonthlyPrice * 12 * 0.833).toLocaleString() + ' DA';
    }
});
