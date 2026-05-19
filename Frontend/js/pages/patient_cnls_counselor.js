let urgentActif = false;

function filterConseillers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.psy-card');
    let visibleCount = 0;
    cards.forEach(card => {
        const name = card.getAttribute('data-name') || '';
        const isOnline = card.getAttribute('data-online') === 'true';
        let showBySearch = name.includes(searchTerm);
        let showByUrgent = !urgentActif || (urgentActif && isOnline);
        if (showBySearch && showByUrgent) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    const resultCount = document.getElementById('resultCount');
    if (urgentActif) {
        resultCount.innerHTML = `${visibleCount} conseiller(s) EN LIGNE disponible(s) pour appel immédiat`;
    } else {
        resultCount.innerHTML = `${visibleCount} conseiller(s) correspondent à votre recherche`;
    }
}

function openUrgentPayment() {
    document.getElementById('urgentModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeUrgentModal() {
    document.getElementById('urgentModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function activateUrgent() {
    const ccp = document.getElementById('ccpNumber').value;
    const expDate = document.getElementById('expDate').value;
    const cvv = document.getElementById('cvv').value;
    if (!ccp || !expDate || !cvv) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    alert('Paiement réussi ! Mode URGENT activé.');
    urgentActif = true;
    closeUrgentModal();
    document.getElementById('urgentBanner').style.display = 'flex';
    const urgentButton = document.getElementById('urgentButton');
    urgentButton.classList.add('active');
    urgentButton.querySelector('.button-text').textContent = 'URGENT';
    filterConseillers();
}

function handleConseillerClick(conseillerId) {
    const conseillerData = {
        sarah: { name: 'Sarah Amrani', online: true },
        karim: { name: 'Karim Benali', online: false },
        amina: { name: 'Amina Mansouri', online: true },
        mehdi: { name: 'Mehdi Bouazza', online: false },
        leila: { name: 'Leila Zerouali', online: true },
        youcef: { name: 'Youcef Hamdi', online: false }
    };
    const data = conseillerData[conseillerId];
    if (urgentActif && data.online) {
        if (confirm(`Appel immédiat avec ${data.name} ?`)) {
            alert(`Appel en cours avec ${data.name}...`);
        }
    } else if (urgentActif && !data.online) {
        alert(`${data.name} n'est pas en ligne actuellement.`);
    } else {
        openConseillerDetail(conseillerId);
    }
}

function openConseillerDetail(conseillerId) {
    const conseillerData = {
        sarah: { name: 'Sarah Amrani', online: true },
        karim: { name: 'Karim Benali', online: false },
        amina: { name: 'Amina Mansouri', online: true },
        mehdi: { name: 'Mehdi Bouazza', online: false },
        leila: { name: 'Leila Zerouali', online: true },
        youcef: { name: 'Youcef Hamdi', online: false }
    };
    const data = conseillerData[conseillerId];
    if (data) {
        document.getElementById('detailName').innerText = data.name;
        const statusSpan = document.getElementById('detailOnlineStatus');
        if (data.online) {
            statusSpan.innerText = 'En ligne';
            statusSpan.style.background = '#27ae60';
        } else {
            statusSpan.innerText = 'Hors ligne';
            statusSpan.style.background = '#999';
        }
    }
    document.getElementById('psyDetailPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePsyDetail() {
    document.getElementById('psyDetailPanel').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-detail-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    if (tab === 'apercu') {
        document.querySelector('.tab-detail-btn:first-child').classList.add('active');
        document.getElementById('apercuContent').classList.add('active');
    } else {
        document.querySelector('.tab-detail-btn:last-child').classList.add('active');
        document.getElementById('avisContent').classList.add('active');
    }
}

document.getElementById('searchInput').addEventListener('keyup', filterConseillers);
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeUrgentModal();
        closePsyDetail();
    }
});

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
