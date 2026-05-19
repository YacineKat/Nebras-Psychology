function showTab(tabName) {
    // Cacher tous les onglets
    document.getElementById('tabProfil').classList.remove('active');
    document.getElementById('tabBesoins').classList.remove('active');
    document.getElementById('tabTherapie').classList.remove('active');
    document.getElementById('tabSecurite').classList.remove('active');
    
    // Désactiver tous les boutons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Afficher l'onglet sélectionné
    if(tabName === 'profil') {
        document.getElementById('tabProfil').classList.add('active');
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    } else if(tabName === 'besoins') {
        document.getElementById('tabBesoins').classList.add('active');
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    } else if(tabName === 'therapie') {
        document.getElementById('tabTherapie').classList.add('active');
        document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
    } else if(tabName === 'securite') {
        document.getElementById('tabSecurite').classList.add('active');
        document.querySelector('.tab-btn:nth-child(4)').classList.add('active');
    }
}

function confirmDelete() {
    if(confirm('⚠️ Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.')) {
        alert('Votre compte a été supprimé. Nous espérons vous revoir bientôt.');
    }
}

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
