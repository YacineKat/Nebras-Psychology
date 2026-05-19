function formatDa(value) {
    return Number(value).toLocaleString('fr-FR') + ' DA';
}

document.getElementById('currentYear').textContent = new Date().getFullYear();

(async function loadSettings() {
    try {
        var res = await fetch('http://localhost:3000/api/settings');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var s = data.settings || {};

        var siteName = s.siteName || 'Nebras';
        document.title = siteName + ' - Psychologie en ligne';
        var siteEls = document.querySelectorAll('.js-site-name');
        for (var i = 0; i < siteEls.length; i++) {
            siteEls[i].textContent = siteName;
        }

        if (s.consultationPrice) {
            var priceText = Number(s.consultationPrice).toLocaleString('fr-FR');
            var ids = ['normalConsultationPrice', 'vipConsultationPrice'];
            for (var i = 0; i < ids.length; i++) {
                var el = document.getElementById(ids[i]);
                if (el) el.textContent = priceText;
            }
        }
    } catch (e) {
        // Settings API unreachable — leaving hardcoded fallbacks in HTML
    }
})();
