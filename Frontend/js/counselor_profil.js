function showTab(tabName) {
    document.getElementById('tabProfil').classList.remove('active');
    document.getElementById('tabStatistiques').classList.remove('active');
    document.getElementById('tabStatut').classList.remove('active');
    document.getElementById('tabSecurite').classList.remove('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if(tabName === 'profil') {
        document.getElementById('tabProfil').classList.add('active');
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    } else if(tabName === 'statistiques') {
        document.getElementById('tabStatistiques').classList.add('active');
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    } else if(tabName === 'statut') {
        document.getElementById('tabStatut').classList.add('active');
        document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
    } else if(tabName === 'securite') {
        document.getElementById('tabSecurite').classList.add('active');
        document.querySelector('.tab-btn:nth-child(4)').classList.add('active');
    }
}

function toggleOnlineStatus() {
    const toggle = document.getElementById('onlineToggle');
    const statusBadge = document.getElementById('onlineStatusBadge');
    const statusText = document.getElementById('toggleStatusText');
    
    if (toggle.checked) {
        statusBadge.innerText = 'En ligne';
        statusBadge.classList.remove('offline');
        statusText.innerText = 'Actualmente visible';
        statusText.style.color = '#27ae60';
        showToast('Vous êtes maintenant affiché comme EN LIGNE pour vos patients', 'success');
    } else {
        statusBadge.innerText = 'Hors ligne';
        statusBadge.classList.add('offline');
        statusText.innerText = 'Actuellement invisible';
        statusText.style.color = '#999';
        showToast('Vous êtes maintenant affiché comme HORS LIGNE. Les patients ne pourront pas vous contacter en direct.', 'info');
    }
}

function confirmDelete() {
    if(confirm('Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.')) {
        showToast('Votre compte a été supprimé.', 'success');
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

async function loadProfileData() {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    const user = getCurrentUser();
    if (!user || user.userType !== 'counselor') {
        redirectByUserType(user?.userType);
        return;
    }

    // Update sidebar user info
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = user.fullname || user.email;
    });

    // Fetch full profile data from API
    try {
        const result = await authAPI.getMe();
        const profile = result.user;
        const p = profile.profile || {};

        // Split fullname
        const nameParts = (profile.fullname || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Fill personal info
        document.getElementById('counselorFirstName').value = firstName;
        document.getElementById('counselorLastName').value = lastName;
        document.getElementById('counselorEmailInput').value = profile.email || '';
        document.getElementById('counselorPhone').value = p.phone || '';
        document.getElementById('counselorAdresse').value = p.adresse || '';

        if (p.gender) {
            document.getElementById('counselorGender').value = p.gender;
        }

        // Fill professional info
        if (p.specialite) {
            document.getElementById('counselorSpecialite').value = p.specialite;
        }
        
        document.getElementById('counselorAgrement').value = p.agrement || '';
        document.getElementById('counselorDiplomes').value = p.diplomes || '';
        document.getElementById('counselorBio').value = p.bio || '';
        document.getElementById('counselorTarif').value = p.tarif || '';

        // Update email in security tab
        const emailEl = document.getElementById('counselorEmail');
        if (emailEl) emailEl.textContent = profile.email || '';

        // Update VIP status
        const vipBadge = document.getElementById('vipStatusBadge');
        if (vipBadge && p.isVIP) {
            vipBadge.textContent = 'Activé';
            vipBadge.classList.add('active');
        }

    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function updateCounselorProfile() {
    const firstName = document.getElementById('counselorFirstName').value.trim();
    const lastName = document.getElementById('counselorLastName').value.trim();
    
    if (!firstName) {
        showToast('Le prénom est obligatoire', 'error');
        return;
    }

    const fullname = lastName ? `${firstName} ${lastName}` : firstName;

    const profileData = {
        fullname: fullname,
        specialite: document.getElementById('counselorSpecialite').value || null,
        bio: document.getElementById('counselorBio').value || null,
        diplomes: document.getElementById('counselorDiplomes').value || null,
        agrement: document.getElementById('counselorAgrement').value || null,
        phone: document.getElementById('counselorPhone').value || null,
        adresse: document.getElementById('counselorAdresse').value || null,
        gender: document.getElementById('counselorGender').value || null
    };

    // Remove null values
    Object.keys(profileData).forEach(key => {
        if (profileData[key] === null || profileData[key] === '') delete profileData[key];
    });

    try {
        await authAPI.updateProfile(profileData);
        
        // Update localStorage
        const user = getCurrentUser();
        user.fullname = fullname;
        localStorage.setItem('nebras_user', JSON.stringify(user));
        
        // Update display
        document.querySelectorAll('.user-name').forEach(el => {
            el.textContent = fullname;
        });

        showToast('✅ Profil mis à jour avec succès !', 'success');
    } catch (error) {
        showToast('❌ Erreur: ' + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadProfileData();
    highlightCurrentSidebarLink();
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