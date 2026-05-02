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
    if (!user || (user.userType !== 'psychologue' && user.userType !== 'counselor')) {
        redirectByUserType(user?.userType);
        return;
    }

    // Update sidebar user info
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = user.fullname || user.email;
    });

    // Update profile header
    const nameEl = document.querySelector('.profile-header h1');
    if (nameEl) nameEl.textContent = user.fullname || 'Mon Profil';

    // Fetch full profile data from API
    try {
        const result = await authAPI.getMe();
        const profile = result.user;
        const p = profile.profile || {};

        // Fill personal info
        document.getElementById('psyEmailInput').value = profile.email || '';
        document.getElementById('psyPhone').value = p.phone || '';
        document.getElementById('psyAdresse').value = p.adresse || '';

        if (p.gender) {
            document.getElementById('psyGender').value = p.gender;
        }

        if (p.birthDate) {
            document.getElementById('psyBirthDate').value = p.birthDate.split('T')[0];
        }

        // Fill professional info
        if (p.specialite) {
            document.getElementById('psySpecialiteSelect').value = p.specialite;
        }
        
        document.getElementById('psyAgrement').value = p.agrement || '';
        document.getElementById('psyDiplomes').value = p.diplomes || '';
        document.getElementById('psyBioText').value = p.bio || '';

        // Update email in security tab
        const emailEl = document.getElementById('psyEmail');
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

async function updatePsychologueProfile() {
    const user = getCurrentUser();
    if (!user) return;

    // Get name parts
    const fullnameInput = prompt('Entrez votre nom complet:', user.fullname || '');
    if (fullnameInput === null) return; // Cancelled

    const profileData = {
        fullname: fullnameInput.trim() || null,
        specialite: document.getElementById('psySpecialiteSelect').value || null,
        universite: document.getElementById('psyAgrement').value || null,
        bio: document.getElementById('psyBioText').value || null,
        diplomes: document.getElementById('psyDiplomes').value || null,
        phone: document.getElementById('psyPhone').value || null,
        adresse: document.getElementById('psyAdresse').value || null,
        gender: document.getElementById('psyGender').value || null
    };

    // Remove null values
    Object.keys(profileData).forEach(key => {
        if (profileData[key] === null) delete profileData[key];
    });

    try {
        await authAPI.updateProfile(profileData);
        
        // Update localStorage
        if (profileData.fullname) {
            user.fullname = profileData.fullname;
            localStorage.setItem('nebras_user', JSON.stringify(user));
            document.querySelectorAll('.user-name').forEach(el => {
                el.textContent = profileData.fullname;
            });
        }
        
        showToast('✅ Profil mis à jour avec succès !', 'success');
    } catch (error) {
        showToast('❌ Erreur: ' + error.message, 'error');
    }
}

function showTab(tabName) {
    document.querySelectorAll('.profile-tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabId = 'tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
    
    const btnIndex = ['profil', 'statistiques', 'statut', 'securite'].indexOf(tabName);
    document.querySelectorAll('.tab-btn')[btnIndex]?.classList.add('active');
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