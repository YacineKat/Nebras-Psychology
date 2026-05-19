let isLoading = false;
let honorairesData = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    initUserDisplay();
    await loadHonorairesData();
    highlightCurrentSidebarLink();
});

function initUserDisplay() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        const name = currentUser.fullname || currentUser.email || '';
        document.querySelectorAll('.user-name').forEach(el => {
            if (el) el.textContent = name;
        });
    }
}

async function loadHonorairesData() {
    if (isLoading) return;

    isLoading = true;
    showLoadingState(true);

    try {
        const data = await doctorAPI.getHonoraires();
        console.log('Honoraires data:', data);
        honorairesData = data;

        updateSummaryCards(data.stats);
        updateConsultationRate(data.tarif);
        renderRecentTransactions(data.recentTransactions);
        renderUpcomingPayments(data.upcomingPayments);

    } catch (error) {
        console.error('Error loading honoraires:', error);
        showToast('Erreur lors du chargement des honoraires', 'error');
    } finally {
        isLoading = false;
        showLoadingState(false);
    }
}

function showLoadingState(show) {
    const sections = [
        '.honoraires-summary',
        '.dashboard-section'
    ];

    sections.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.style.opacity = show ? '0.5' : '1';
            el.style.pointerEvents = show ? 'none' : 'auto';
        }
    });
}

function updateSummaryCards(stats) {
    const cards = document.querySelectorAll('.honoraire-card');
    if (cards[0]) {
        cards[0].querySelector('.amount').textContent = (stats?.totalIncome || 0).toLocaleString('fr-FR') + ' DA';
    }
    if (cards[1]) {
        cards[1].querySelector('.amount').textContent = (stats?.pendingPayments || 0).toLocaleString('fr-FR') + ' DA';
    }
    if (cards[2]) {
        cards[2].querySelector('.amount').textContent = (stats?.receivedPayments || 0).toLocaleString('fr-FR') + ' DA';
    }
}

function updateConsultationRate(tarif) {
    const tarifAmount = document.getElementById('tarifAmount');
    if (tarifAmount) {
        tarifAmount.textContent = (tarif || 0).toLocaleString('fr-FR') + ' DA';
    }
}

function renderRecentTransactions(transactions) {
    const container = document.getElementById('recentTransactionsList');
    if (!container) return;

    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #888;">Aucune transaction récente</div>';
        return;
    }

    container.innerHTML = transactions.map(t => `
        <div class="transaction-item">
            <div class="transaction-date">${formatDate(t.date)}</div>
            <div class="transaction-patient">${escapeHtml(t.patientName)}</div>
            <div class="transaction-amount">+${t.amount.toLocaleString('fr-FR')} DA</div>
            <span style="color: #44AA99;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="20 6 9 17 4 12"/>
                </svg> Payé
            </span>
        </div>
    `).join('');
}

function renderUpcomingPayments(payments) {
    const container = document.getElementById('upcomingPaymentsList');
    if (!container) return;

    if (!payments || payments.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #888;">Aucun paiement à venir</div>';
        return;
    }

    container.innerHTML = payments.map(p => `
        <div class="transaction-item">
            <div class="transaction-date">${formatDate(p.date)}</div>
            <div class="transaction-patient">${escapeHtml(p.patientName)}</div>
            <div class="transaction-amount">${p.amount.toLocaleString('fr-FR')} DA</div>
            <span style="color: #f39c12;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg> À venir
            </span>
        </div>
    `).join('');
}

function openTarifModal() {
    const modal = document.getElementById('tarifModal');
    const input = document.getElementById('newTarifInput');
    if (modal && input) {
        input.value = honorairesData?.tarif || 2000;
        modal.style.display = 'flex';
    }
}

function closeTarifModal() {
    const modal = document.getElementById('tarifModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function saveTarif() {
    const input = document.getElementById('newTarifInput');
    const parsedTarif = parseInt(input.value);

    if (isNaN(parsedTarif) || parsedTarif <= 0) {
        showToast('Veuillez entrer un montant valide', 'error');
        return;
    }

    try {
        const result = await doctorAPI.updateTarif(parsedTarif);
        showToast('Tarif mis à jour: ' + parsedTarif + ' DA', 'success');

        honorairesData.tarif = parsedTarif;
        updateConsultationRate(parsedTarif);

        closeTarifModal();

    } catch (error) {
        console.error('Error updating tarif:', error);
        showToast('Erreur lors de la mise à jour du tarif', 'error');
    }
}

async function requestWithdrawal() {
    if (!confirm('Voulez-vous demander un retrait?')) return;

    try {
        showToast('Demande de retrait envoyée!', 'success');
    } catch (error) {
        console.error('Error requesting withdrawal:', error);
        showToast('Erreur lors de la demande de retrait', 'error');
    }
}

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

document.getElementById('tarifModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeTarifModal();
    }
});

window.openTarifModal = openTarifModal;
window.closeTarifModal = closeTarifModal;
window.saveTarif = saveTarif;
window.requestWithdrawal = requestWithdrawal;
