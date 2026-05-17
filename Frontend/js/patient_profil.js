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
        el.textContent = getUserDisplayName(user);
    });
    
    // Update profile header if exists
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) {
        profileNameEl.textContent = getUserDisplayName(user);
    }
    
    // Update email in security tab
    const profileEmailEl = document.getElementById('profileEmail');
    if (profileEmailEl) {
        profileEmailEl.textContent = user.email || '';
    }
}

function getUserDisplayName(user) {
    return user?.fullname || user?.email || '';
}

function getUserInitial(user) {
    const displayName = getUserDisplayName(user);
    return displayName ? displayName.charAt(0).toUpperCase() : '?';
}

function createInitialAvatarDataUrl(user) {
    const initial = getUserInitial(user);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="Avatar ${initial}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#E9EEF5"/>
                    <stop offset="100%" stop-color="#D7E0EB"/>
                </linearGradient>
            </defs>
            <rect width="120" height="120" rx="60" fill="url(#bg)"/>
            <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#64748B">${initial}</text>
        </svg>
    `.trim();
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderPatientProfileFromUser(profileUser) {
    const profile = profileUser || getCurrentUser();
    if (!profile) return;

    const p = profile.profile || {};

    let firstName = '';
    let lastName = '';
    if (profile.fullname) {
        const nameParts = profile.fullname.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
    }

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
    if (genderEl) genderEl.value = p.gender || '';

    const phoneEl = document.getElementById('phone');
    if (phoneEl) phoneEl.value = p.phone || '';

    const emailElApi = document.getElementById('profileEmail');
    if (emailElApi) emailElApi.textContent = profile.email || '';

    const avatarImg = document.getElementById('profileAvatarImg');
    if (avatarImg) {
        avatarImg.src = p.avatar || createInitialAvatarDataUrl(profile);
    }

    updateSidebarAvatar(p.avatar);

    const languageEl = document.getElementById('prefLanguage');
    if (languageEl) languageEl.value = p.language || '';

    const prefGenderEl = document.getElementById('prefGender');
    if (prefGenderEl) prefGenderEl.value = p.prefGender || '';

    const prefTypeEl = document.getElementById('prefType');
    if (prefTypeEl) prefTypeEl.value = p.prefType || '';

    document.querySelectorAll('#consultationTags .tag').forEach(tag => {
        tag.classList.remove('selected');
    });

    if (p.motifs) {
        const selectedMotifs = p.motifs.split(',');
        document.querySelectorAll('#consultationTags .tag').forEach(tag => {
            const tagText = tag.textContent.trim();
            if (selectedMotifs.includes(tagText)) {
                tag.classList.add('selected');
            }
        });
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
    renderPatientProfileFromUser(user);

    const formContainer = document.getElementById('tabProfil');
    const besoinsContainer = document.getElementById('tabBesoins');

    try {
        const needsRefresh = !user.profile || user.profile.avatar === undefined || user.fullname === undefined;
        if (needsRefresh) {
            const result = await authAPI.getMe();
            if (result?.user) {
                localStorage.setItem('nebras_user', JSON.stringify(result.user));
                updateSidebarWithUserData();
                renderPatientProfileFromUser(result.user);
            }
        }

    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('⚠️ Erreur lors du chargement du profil', 'error');
    } finally {
        if (formContainer) {
            formContainer.style.opacity = '1';
            formContainer.style.pointerEvents = 'auto';
        }
        if (besoinsContainer) {
            besoinsContainer.style.opacity = '1';
            besoinsContainer.style.pointerEvents = 'auto';
        }
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
        const result = await authAPI.updateProfile(updateData);

        const user = result?.user || getCurrentUser();
        if (user) {
            user.fullname = fullname;
            user.profile = { ...(user.profile || {}), ...updateData };
            localStorage.setItem('nebras_user', JSON.stringify(user));
        }

        // Update ALL user name displays including sidebar
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

function updateSidebarAvatar(avatarUrl) {
    const avatars = document.querySelectorAll('.user-avatar');
    const user = getCurrentUser();
    avatars.forEach(avatar => {
        if (avatarUrl) {
            avatar.style.backgroundImage = `url(${avatarUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        } else {
            const initial = getUserInitial(user);
            avatar.textContent = initial;
            avatar.style.backgroundImage = '';
        }
    });
}

async function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('❌ Veuillez sélectionner une image', 'error');
        return;
    }

    let avatarDataUrl;

    try {
        avatarDataUrl = await prepareAvatarImageForUpload(file);
    } catch (error) {
        showToast(error.message || '❌ Impossible de traiter l\'image', 'error');
        return;
    }

    const avatarImg = document.getElementById('profileAvatarImg');
    if (avatarImg) {
        avatarImg.src = avatarDataUrl;
    }

    try {
        const result = await authAPI.updateProfile({ avatar: avatarDataUrl });

        const user = result?.user || getCurrentUser();
        if (user) {
            if (user.profile) {
                user.profile.avatar = avatarDataUrl;
            } else {
                user.profile = { avatar: avatarDataUrl };
            }
            localStorage.setItem('nebras_user', JSON.stringify(user));
        }

        updateSidebarAvatar(avatarDataUrl);

        showToast('✅ Photo de profil mise à jour !', 'success');
    } catch (error) {
        console.error('Avatar upload error:', error);
        showToast('❌ Erreur lors de la mise à jour: ' + error.message, 'error');
    }
}

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 1200;
const MAX_AVATAR_QUALITY = 0.9;
const MIN_AVATAR_QUALITY = 0.7;

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('❌ Impossible de lire l\'image'));
        reader.readAsDataURL(file);
    });
}

function getDataUrlSizeBytes(dataUrl) {
    const base64 = (dataUrl || '').split(',')[1] || '';
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function compressAvatarImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const image = new Image();

            image.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('❌ Impossible de traiter l\'image'));
                    return;
                }

                let width = image.width;
                let height = image.height;
                const scale = Math.min(1, MAX_AVATAR_DIMENSION / width, MAX_AVATAR_DIMENSION / height);
                width = Math.max(1, Math.round(width * scale));
                height = Math.max(1, Math.round(height * scale));

                let quality = MAX_AVATAR_QUALITY;
                let currentWidth = width;
                let currentHeight = height;

                while (currentWidth >= 320 && currentHeight >= 320) {
                    canvas.width = currentWidth;
                    canvas.height = currentHeight;
                    ctx.clearRect(0, 0, currentWidth, currentHeight);
                    ctx.drawImage(image, 0, 0, currentWidth, currentHeight);

                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (getDataUrlSizeBytes(dataUrl) > MAX_AVATAR_SIZE_BYTES && quality > MIN_AVATAR_QUALITY) {
                        quality = Math.max(MIN_AVATAR_QUALITY, Number((quality - 0.1).toFixed(1)));
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }

                    if (getDataUrlSizeBytes(dataUrl) <= MAX_AVATAR_SIZE_BYTES) {
                        resolve(dataUrl);
                        return;
                    }

                    currentWidth = Math.max(320, Math.round(currentWidth * 0.85));
                    currentHeight = Math.max(320, Math.round(currentHeight * 0.85));
                    quality = MAX_AVATAR_QUALITY;

                    if (currentWidth === 320 && currentHeight === 320) {
                        break;
                    }
                }

                reject(new Error('❌ L\'image optimisée dépasse encore 2MB. Essayez une image plus légère.'));
            };

            image.onerror = () => reject(new Error('❌ Impossible de lire l\'image'));
            image.src = reader.result;
        };

        reader.onerror = () => reject(new Error('❌ Impossible de lire l\'image'));
        reader.readAsDataURL(file);
    });
}

async function prepareAvatarImageForUpload(file) {
    if (file.size <= MAX_AVATAR_SIZE_BYTES) {
        return readFileAsDataUrl(file);
    }

    return compressAvatarImage(file);
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