function selectSlot(element) {
    if (element.classList.contains('available')) {
        document.querySelectorAll('.slot-cell.selected').forEach(cell => {
            cell.classList.remove('selected');
            cell.style.background = '';
            cell.style.color = '';
        });
        element.classList.add('selected');
        element.style.background = '#B39DDB';
        element.style.color = 'white';
        showToast('Créneau sélectionné !');
    } else {
        showToast('Ce créneau est déjà réservé');
    }
}

function previousWeek() {
    showToast('Semaine précédente');
}

function nextWeek() {
    showToast('Semaine suivante');
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