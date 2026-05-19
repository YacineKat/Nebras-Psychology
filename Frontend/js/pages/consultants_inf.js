function formatDa(value) {
    return Number(value).toLocaleString('fr-FR') + ' DA';
}

document.getElementById('currentYear').textContent = new Date().getFullYear();

(async function loadSettings() {
    try {
        const res = await fetch(window.API_URL + '/settings');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const s = data.settings || {};

        const siteName = s.siteName || 'Nebras';
        document.title = siteName + ' - Psychologie en ligne';
        const siteEls = document.querySelectorAll('.js-site-name');
        for (let i = 0; i < siteEls.length; i++) {
            siteEls[i].textContent = siteName;
        }

        if (s.consultationPrice) {
            const priceText = Number(s.consultationPrice).toLocaleString('fr-FR');
            const ids = ['normalConsultationPrice', 'vipConsultationPrice'];
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(ids[i]);
                if (el) el.textContent = priceText;
            }
        }
    } catch (e) {
        // Settings API unreachable — leaving hardcoded fallbacks in HTML
    }
})();
