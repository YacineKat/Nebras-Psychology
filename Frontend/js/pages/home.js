function auth() {
    if (window.isLoggedIn()) {
        const user = window.getCurrentUser();
        window.redirectByUserType(user.userType);
    } else {
        window.location.href = "auth.html";
    }
}

function toggleFaq(element) {
    element.classList.toggle('active');
}

window.auth = auth;
window.toggleFaq = toggleFaq;

function formatDa(value) {
    return Number(value).toLocaleString('fr-FR') + ' DA';
}

document.getElementById('currentYear').textContent = new Date().getFullYear();

(async function loadSettings() {
    try {
        const url = window.API_URL + '/settings';

        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        const s = data.settings || {};

        const siteName = s.siteName || 'Nebras';
        document.title = siteName + ' - Psychologie en ligne';
        const siteEls = document.querySelectorAll('.js-site-name');
        for (let i = 0; i < siteEls.length; i++) {
            siteEls[i].textContent = siteName;
        }

        if (s.contactEmail) {
            const el = document.getElementById('contactEmailValue');
            if (el) el.textContent = s.contactEmail;
        }

        if (s.phone) {
            const el = document.getElementById('contactPhoneValue');
            if (el) el.textContent = s.phone;
        }

        if (s.consultationPrice) {
            const text = formatDa(s.consultationPrice);
            const ids = ['whyConsultationPrice', 'etapeConsultationPrice', 'offersConsultationPrice'];
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(ids[i]);
                if (el) el.textContent = text;
            }
        }

        if (s.vipMonthlyPrice) {
            const el = document.getElementById('offersVipPrice');
            if (el) el.textContent = formatDa(s.vipMonthlyPrice) + ' / mois';
        }

    } catch (e) {
        // Settings API unreachable — leaving hardcoded fallbacks in HTML
    }
})();

function switchTab(tabId, button) {
    const tabButtons = document.querySelectorAll('.offers-tab-btn');
    const tabContents = document.querySelectorAll('.offers-tab-content');
    
    tabButtons.forEach(function(btn) { btn.classList.remove('active'); });
    tabContents.forEach(function(content) { content.classList.remove('active'); });
    
    button.classList.add('active');
    
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

