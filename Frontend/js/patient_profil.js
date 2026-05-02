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

function updateSidebarWithUserData() {
    const user = getCurrentUser();
    if (!user) return;
    
    // Update all elements with class user-name (including sidebar)
    const userNameElements = document.querySelectorAll('.user-name');
    userNameElements.forEach(el => {
        el.textContent = user.fullname || user.email || '';
    });
    
    // Update profile header if exists
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) {
        profileNameEl.textContent = user.fullname || 'Mon Profil';
    }
    
    // Update email in security tab
    const profileEmailEl = document.getElementById('profileEmail');
    if (profileEmailEl) {
        profileEmailEl.textContent = user.email || '';
    }
}

// Toggle tag selection
function toggleTag(element) {
    element.classList.toggle('selected');
}

async function loadProfileData() {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'auth.html';
        return;
    }

    // Update sidebar immediately from localStorage BEFORE loading
    updateSidebarWithUserData();

    // Show loading state
    const formContainer = document.getElementById('tabProfil');
    const besoinsContainer = document.getElementById('tabBesoins');
    if (formContainer) {
        formContainer.style.opacity = '0.5';
        formContainer.style.pointerEvents = 'none';
    }
    if (besoinsContainer) {
        besoinsContainer.style.opacity = '0.5';
        besoinsContainer.style.pointerEvents = 'none';
    }

    // Fetch full profile data from API
    try {
        const result = await authAPI.getMe();
        
        const profile = result.user;
        const p = profile?.profile || {};

        // Split fullname
        let firstName = '';
        let lastName = '';
        if (profile?.fullname) {
            const nameParts = profile.fullname.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        }

        // Personal info
        const firstNameEl = document.getElementById('firstName');
        if (firstNameEl) firstNameEl.value = firstName;
        
        const lastNameEl = document.getElementById('lastName');
        if (lastNameEl) lastNameEl.value = lastName;
        
        const birthDateEl = document.getElementById('birthDate');
        if (birthDateEl && p.birthDate) {
            const date = new Date(p.birthDate);
            birthDateEl.value = date.toISOString().split('T')[0];
        }
        
        const genderEl = document.getElementById('gender');
        if (genderEl && p.gender) genderEl.value = p.gender;
        
        const phoneEl = document.getElementById('phone');
        if (phoneEl && p.phone) phoneEl.value = p.phone;

        const emailElApi = document.getElementById('profileEmail');
        if (emailElApi && profile?.email) emailElApi.textContent = profile.email;

        // Load therapeutic preferences
        const languageEl = document.getElementById('prefLanguage');
        if (languageEl && p.language) languageEl.value = p.language;

        const prefGenderEl = document.getElementById('prefGender');
        if (prefGenderEl && p.prefGender) prefGenderEl.value = p.prefGender;

        const prefTypeEl = document.getElementById('prefType');
        if (prefTypeEl && p.prefType) prefTypeEl.value = p.prefType;

        // Load selected motifs (tags)
        if (p.motifs) {
            const selectedMotifs = p.motifs.split(',');
            document.querySelectorAll('#consultationTags .tag').forEach(tag => {
                const tagText = tag.textContent.trim();
                if (selectedMotifs.includes(tagText)) {
                    tag.classList.add('selected');
                }
            });
        }

        // Restore form visibility
        if (formContainer) {
            formContainer.style.opacity = '1';
            formContainer.style.pointerEvents = 'auto';
        }
        if (besoinsContainer) {
            besoinsContainer.style.opacity = '1';
            besoinsContainer.style.pointerEvents = 'auto';
        }

    } catch (error) {
        console.error('Error loading profile:', error);
        
        if (formContainer) {
            formContainer.style.opacity = '1';
            formContainer.style.pointerEvents = 'auto';
        }
        if (besoinsContainer) {
            besoinsContainer.style.opacity = '1';
            besoinsContainer.style.pointerEvents = 'auto';
        }
        
        showToast('⚠️ Erreur lors du chargement du profil', 'error');
    }
}

async function updateProfile() {
    const firstNameEl = document.getElementById('firstName');
    const lastNameEl = document.getElementById('lastName');
    const birthDateEl = document.getElementById('birthDate');
    const genderEl = document.getElementById('gender');
    const phoneEl = document.getElementById('phone');

    const firstName = firstNameEl?.value.trim() || '';
    const lastName = lastNameEl?.value.trim() || '';
    const birthDate = birthDateEl?.value || '';
    const gender = genderEl?.value || '';
    const phone = phoneEl?.value.trim() || '';

    if (!firstName) {
        showToast('❌ Le prénom est obligatoire', 'error');
        return;
    }

    const fullname = lastName ? `${firstName} ${lastName}` : firstName;

    const updateData = { fullname };
    if (birthDate) updateData.birthDate = birthDate;
    if (gender) updateData.gender = gender;
    if (phone) updateData.phone = phone;

    const saveBtn = document.querySelector('.update-btn');
    const originalText = saveBtn?.textContent || 'Mettre à jour';
    if (saveBtn) {
        saveBtn.textContent = 'Enregistrement...';
        saveBtn.disabled = true;
    }

    try {
        await authAPI.updateProfile(updateData);

        // Update localStorage
        const user = getCurrentUser();
        user.fullname = fullname;
        localStorage.setItem('nebras_user', JSON.stringify(user));

        // Update ALL user name displays including sidebar
        updateSidebarWithUserData();

        // Refresh user data from API to ensure consistency
        const result = await authAPI.getMe();
        const freshUser = result.user;
        localStorage.setItem('nebras_user', JSON.stringify(freshUser));
        updateSidebarWithUserData();

        showToast('✅ Profil mis à jour avec succès !', 'success');
    } catch (error) {
        console.error('Update error:', error);
        showToast('❌ Erreur: ' + error.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
}

async function savePreferences() {
    // Get language
    const languageEl = document.getElementById('prefLanguage');
    const language = languageEl?.value || '';

    // Get gender preference
    const prefGenderEl = document.getElementById('prefGender');
    const prefGender = prefGenderEl?.value || '';

    // Get consultation type preference
    const prefTypeEl = document.getElementById('prefType');
    const prefType = prefTypeEl?.value || '';

    // Get selected motifs (tags)
    const selectedMotifs = [];
    document.querySelectorAll('#consultationTags .tag.selected').forEach(tag => {
        selectedMotifs.push(tag.textContent.trim());
    });
    const motifs = selectedMotifs.join(',');

    console.log('Saving preferences:', { language, prefGender, prefType, motifs });

    if (!language) {
        showToast('❌ Veuillez sélectionner une langue', 'error');
        return;
    }

    const updateBtn = document.querySelector('#tabBesoins .update-btn');
    const originalText = updateBtn?.textContent || 'Enregistrer mes préférences';
    if (updateBtn) {
        updateBtn.textContent = 'Enregistrement...';
        updateBtn.disabled = true;
    }

    try {
        await authAPI.updateProfile({
            language: language,
            motifs: motifs,
            prefGender: prefGender,
            prefType: prefType
        });

        showToast('✅ Préférences thérapeutiques enregistrées !', 'success');
    } catch (error) {
        console.error('Save preferences error:', error);
        showToast('❌ Erreur: ' + error.message, 'error');
    } finally {
        if (updateBtn) {
            updateBtn.textContent = originalText;
            updateBtn.disabled = false;
        }
    }
}

function confirmDelete() {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
        showToast('Fonctionnalité de suppression bientôt disponible', 'info');
    }
}

function showTab(tabName) {
    document.querySelectorAll('.profile-tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabMap = {
        'profil': 'tabProfil',
        'besoins': 'tabBesoins',
        'therapie': 'tabTherapie',
        'securite': 'tabSecurite'
    };
    
    const tabId = tabMap[tabName];
    if (tabId) {
        document.getElementById(tabId).classList.add('active');
        const btnIndex = ['profil', 'besoins', 'therapie', 'securite'].indexOf(tabName);
        document.querySelectorAll('.tab-btn')[btnIndex]?.classList.add('active');
    }
}

// Make functions globally available for onclick handlers
window.toggleTag = toggleTag;
window.savePreferences = savePreferences;
window.showTab = showTab;
window.updateProfile = updateProfile;
window.confirmDelete = confirmDelete;
window.logout = logout;

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