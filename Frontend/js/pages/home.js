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
        var url = 'http://localhost:3000/api/settings';

        var res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        var data = await res.json();
        var s = data.settings || {};

        var siteName = s.siteName || 'Nebras';
        document.title = siteName + ' - Psychologie en ligne';
        var siteEls = document.querySelectorAll('.js-site-name');
        for (var i = 0; i < siteEls.length; i++) {
            siteEls[i].textContent = siteName;
        }

        if (s.contactEmail) {
            var el = document.getElementById('contactEmailValue');
            if (el) el.textContent = s.contactEmail;
        }

        if (s.phone) {
            var el = document.getElementById('contactPhoneValue');
            if (el) el.textContent = s.phone;
        }

        if (s.consultationPrice) {
            var text = formatDa(s.consultationPrice);
            var ids = ['whyConsultationPrice', 'etapeConsultationPrice', 'offersConsultationPrice'];
            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el) el.textContent = text;
            }
        }

        if (s.vipMonthlyPrice) {
            var el = document.getElementById('offersVipPrice');
            if (el) el.textContent = formatDa(s.vipMonthlyPrice) + ' / mois';
        }

    } catch (e) {
        // Settings API unreachable — leaving hardcoded fallbacks in HTML
    }
})();

function switchTab(tabId, button) {
    var tabButtons = document.querySelectorAll('.offers-tab-btn');
    var tabContents = document.querySelectorAll('.offers-tab-content');
    
    tabButtons.forEach(function(btn) { btn.classList.remove('active'); });
    tabContents.forEach(function(content) { content.classList.remove('active'); });
    
    button.classList.add('active');
    
    var activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

function showToast(message, type = 'success') {
    const container = document.querySelector('.toast-container') || (() => { const c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); return c; })();
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
