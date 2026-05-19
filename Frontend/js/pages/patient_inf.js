document.getElementById('currentYear').textContent = new Date().getFullYear();

loadPublicSettings().then(s => {
    if (s.consultationPrice) {
        document.querySelectorAll('.rules-list li').forEach(li => {
            if (li.textContent.includes('1000 DA')) {
                li.innerHTML = li.innerHTML.replace('1000 DA', Number(s.consultationPrice).toLocaleString() + ' DA');
            }
        });
    }
});
