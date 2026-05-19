function getUserDisplayName(user) {
    return user?.fullname || user?.email || '';
}

function getUserInitial(user) {
    const displayName = getUserDisplayName(user);
    return displayName ? displayName.charAt(0).toUpperCase() : '?';
}

function getDoctorPrefix() {
    return getUserType() === 'counselor' ? 'counselor' : 'psy';
}

function getElId(name) {
    return `${getDoctorPrefix()}${name}`;
}

function updateSidebarWithUserData() {
    const user = getCurrentUser();
    if (!user) return;

    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = getUserDisplayName(user);
    });

    const profileNameEl = document.getElementById(getElId('ProfileName'));
    if (profileNameEl) {
        profileNameEl.textContent = getUserDisplayName(user);
    }

    const profileEmailEl = document.getElementById(getElId('Email'));
    if (profileEmailEl && user.email) {
        profileEmailEl.textContent = user.email;
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

function updateProfileHeaderAvatar(avatarUrl) {
    const avatarContainer = document.querySelector('.profile-avatar-large');
    const avatarImg = document.getElementById('profileAvatarImg');
    const initialsEl = document.getElementById('profileAvatarInitials');
    const user = getCurrentUser();
    const initial = getUserInitial(user);

    if (avatarUrl) {
        if (avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.style.display = 'block';
        }
        if (initialsEl) initialsEl.style.display = 'none';
        if (avatarContainer) avatarContainer.classList.add('has-avatar');
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (initialsEl) {
            initialsEl.textContent = initial;
            initialsEl.style.display = 'flex';
        }
        if (avatarContainer) avatarContainer.classList.remove('has-avatar');
    }
}

async function updateSidebarBadges(cache = {}) {
    try {
        const [dashboardResult, unreadMessages, vipResult] = await Promise.all([
            cache.dashboard || doctorAPI.getDashboard({ view: 'summary' }).catch(() => null),
            cache.unread || messageAPI.getUnreadCount().catch(() => null),
            cache.vip || doctorAPI.getVipStatus().catch(() => null)
        ]);

        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            const text = item.querySelector('span')?.textContent || '';
            if (text.includes('Mes patients')) {
                const badge = item.querySelector('.badge');
                if (badge && dashboardResult?.stats?.activePatients !== undefined) {
                    badge.textContent = dashboardResult.stats.activePatients || 0;
                }
            }
            if (text.includes('Messagerie')) {
                const badge = item.querySelector('.badge');
                if (badge && unreadMessages?.unreadCount !== undefined) {
                    badge.textContent = unreadMessages.unreadCount || 0;
                }
            }
            if (text.includes('Espace VIP') || item.classList.contains('vip-link')) {
                const vipBadge = item.querySelector('.vip-status-badge');
                if (vipBadge && vipResult?.isVIP) {
                    vipBadge.textContent = 'Activé';
                    vipBadge.classList.add('actif');
                }
            }
        });
    } catch (error) {
        console.error('Error updating sidebar badges:', error);
    }
}

let statsLoaded = false;
let statsLoading = false;
let cachedMotifs = getCurrentUser()?.profile?.motifs || null;

async function loadStatsIfNeeded() {
    if (statsLoaded || statsLoading) return;
    statsLoading = true;

    try {
        const patientsResult = await doctorAPI.getPatients({ view: 'summary' }).catch(() => null);
        const patients = patientsResult?.patients || [];
        loadStatsData(patients, cachedMotifs);
        statsLoaded = true;
    } catch (error) {
        console.error('Error loading stats:', error);
        loadStatsData([], cachedMotifs);
    } finally {
        statsLoading = false;
    }
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

    updateSidebarWithUserData();

    const cachedUser = getCurrentUser();
    if (cachedUser) {
        const p = cachedUser.profile || {};
        cachedMotifs = p.motifs || cachedMotifs;

        const nameEl = document.getElementById(getElId('ProfileName'));
        if (nameEl) nameEl.textContent = getUserDisplayName(cachedUser);

        const specialiteEl = document.getElementById(getElId('SpecialiteDisplay'));
        if (specialiteEl) specialiteEl.textContent = p.specialite || '';

        const fullnameInput = document.getElementById(getElId('Fullname'));
        if (fullnameInput) fullnameInput.value = cachedUser.fullname || '';

        const emailInput = document.getElementById(getElId('EmailInput'));
        if (emailInput) emailInput.value = cachedUser.email || '';

        const phoneInput = document.getElementById(getElId('Phone'));
        if (phoneInput) phoneInput.value = p.phone || '';

        const adresseInput = document.getElementById(getElId('Adresse'));
        if (adresseInput) adresseInput.value = p.adresse || '';

        const genderInput = document.getElementById(getElId('Gender'));
        if (genderInput) genderInput.value = p.gender || '';

        if (p.birthDate) {
            const date = new Date(p.birthDate);
            const birthDateInput = document.getElementById(getElId('BirthDate'));
            if (birthDateInput) birthDateInput.value = date.toISOString().split('T')[0];
        }

        const specialiteInput = document.getElementById(getElId('SpecialiteSelect'));
        if (specialiteInput) specialiteInput.value = p.specialite || '';

        const agrementInput = document.getElementById(getElId('Agrement'));
        if (agrementInput) agrementInput.value = p.agrement || '';

        const diplomesInput = document.getElementById(getElId('Diplomes'));
        if (diplomesInput) diplomesInput.value = p.diplomes || '';

        const bioInput = document.getElementById(getElId('BioText'));
        if (bioInput) bioInput.value = p.bio || '';

        const emailEl = document.getElementById(getElId('Email'));
        if (emailEl) emailEl.textContent = cachedUser.email || '';

        if (p.avatar) {
            updateProfileHeaderAvatar(p.avatar);
            updateSidebarAvatar(p.avatar);
        }
    }

    const formContainer = document.getElementById('tabProfil');
    if (formContainer) {
        formContainer.style.opacity = '0.5';
        formContainer.style.pointerEvents = 'none';
    }

    try {
        const [profileResult, dashboardResult] = await Promise.all([
            authAPI.getMe(),
            doctorAPI.getDashboard({ view: 'summary' }).catch(() => null)
        ]);

        const profile = profileResult?.user;
        const p = profile?.profile || {};
        cachedMotifs = p.motifs || cachedMotifs;

        if (profile) {
            localStorage.setItem('nebras_user', JSON.stringify(profile));
            updateSidebarWithUserData();

            const nameEl = document.getElementById(getElId('ProfileName'));
            if (nameEl) nameEl.textContent = getUserDisplayName(profile);

            const specialiteEl = document.getElementById(getElId('SpecialiteDisplay'));
            if (specialiteEl) specialiteEl.textContent = p.specialite || '';

            const fullnameInput = document.getElementById(getElId('Fullname'));
            if (fullnameInput) fullnameInput.value = profile.fullname || '';

            if (dashboardResult?.stats) {
                const patientsEl = document.getElementById('statsPatients');
                const sessionsEl = document.getElementById('statsSessions');
                const ratingEl = document.getElementById('statsRating');
                if (patientsEl) patientsEl.textContent = dashboardResult.stats.activePatients || 0;
                if (sessionsEl) sessionsEl.textContent = dashboardResult.stats.pendingRequestsCount || 0;
                if (ratingEl) ratingEl.textContent = p.rating ? Number(p.rating).toFixed(1) : '0.0';
            }
        }

        if (document.getElementById('tabStatistiques')?.classList.contains('active')) {
            loadStatsIfNeeded();
        }

        const onlineToggle = document.getElementById('onlineToggle');
        const toggleStatusText = document.getElementById('toggleStatusText');
        if (onlineToggle) {
            onlineToggle.checked = p.isAvailable !== false;
            if (toggleStatusText) {
                toggleStatusText.textContent = p.isAvailable !== false ? 'Actuellement visible' : 'Actuellement invisible';
            }
        }

        if (p.avatar) {
            updateProfileHeaderAvatar(p.avatar);
            updateSidebarAvatar(p.avatar);
        }

    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('⚠️ Erreur lors du chargement du profil', 'error');
    } finally {
        if (formContainer) {
            formContainer.style.opacity = '1';
            formContainer.style.pointerEvents = 'auto';
        }
        setTimeout(() => updateSidebarBadges(), 100);
    }
}

function loadStatsData(patients, motifs) {
    const totalPatients = patients.length;
    let femaleCount = 0;
    let maleCount = 0;
    const ageGroups = { '18-25': 0, '26-35': 0, '36-50': 0, '50+': 0 };

    patients.forEach(patient => {
        if (patient.gender === 'femme') femaleCount++;
        else if (patient.gender === 'homme') maleCount++;

        if (patient.birthDate) {
            const age = calculateAge(new Date(patient.birthDate));
            if (age < 26) ageGroups['18-25']++;
            else if (age < 36) ageGroups['26-35']++;
            else if (age < 51) ageGroups['36-50']++;
            else ageGroups['50+']++;
        }
    });

    const totalGender = femaleCount + maleCount;
    const femalePercent = totalGender > 0 ? Math.round((femaleCount / totalGender) * 100) : 0;
    const malePercent = totalGender > 0 ? Math.round((maleCount / totalGender) * 100) : 0;

    const viewsEl = document.getElementById('statViews');
    if (viewsEl) viewsEl.textContent = totalPatients > 0 ? (totalPatients * 20).toLocaleString() : '0';

    const contactsEl = document.getElementById('statContacts');
    if (contactsEl) contactsEl.textContent = totalPatients;

    const appointmentsEl = document.getElementById('statAppointments');
    if (appointmentsEl) {
        const totalSessions = patients.reduce((sum, p) => sum + (p.totalSessions || 0), 0);
        appointmentsEl.textContent = totalSessions;
    }

    const femaleBar = document.getElementById('femaleBar');
    const femalePercentEl = document.getElementById('femalePercent');
    if (femaleBar) femaleBar.style.width = femalePercent + '%';
    if (femalePercentEl) femalePercentEl.textContent = femalePercent + '%';

    const maleBar = document.getElementById('maleBar');
    const malePercentEl = document.getElementById('malePercent');
    if (maleBar) maleBar.style.width = malePercent + '%';
    if (malePercentEl) malePercentEl.textContent = malePercent + '%';

    const totalWithAge = Object.values(ageGroups).reduce((a, b) => a + b, 0);

    const ageBars = [
        { bar: 'age1Bar', percent: 'age1Percent', key: '18-25' },
        { bar: 'age2Bar', percent: 'age2Percent', key: '26-35' },
        { bar: 'age3Bar', percent: 'age3Percent', key: '36-50' },
        { bar: 'age4Bar', percent: 'age4Percent', key: '50+' }
    ];

    ageBars.forEach(item => {
        const barEl = document.getElementById(item.bar);
        const percentEl = document.getElementById(item.percent);
        if (barEl) {
            barEl.style.width = (totalWithAge > 0 ? (ageGroups[item.key] / totalWithAge * 100) : 0) + '%';
        }
        if (percentEl) {
            percentEl.textContent = totalWithAge > 0 ? Math.round(ageGroups[item.key] / totalWithAge * 100) + '%' : '0%';
        }
    });

    const motifsTagsEl = document.getElementById('motifsTags');
    if (motifsTagsEl) {
        if (motifs) {
            const motifsArray = motifs.split(',').map(m => m.trim()).filter(m => m);
            if (motifsArray.length > 0) {
                motifsTagsEl.innerHTML = motifsArray.map(m => `<span class="tag">${m}</span>`).join('');
            } else {
                motifsTagsEl.innerHTML = '<span class="tag">Aucun motif défini</span>';
            }
        } else {
            motifsTagsEl.innerHTML = '<span class="tag">Aucun motif défini</span>';
        }
    }
}

function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

async function updateProfile() {
    const fullname = document.getElementById(getElId('Fullname')).value.trim();

    if (!fullname) {
        showToast('Le nom complet est obligatoire', 'error');
        return;
    }

    const profileData = {
        fullname: fullname,
        specialite: document.getElementById(getElId('SpecialiteSelect')).value || null,
        agrement: document.getElementById(getElId('Agrement')).value || null,
        universite: document.getElementById(getElId('Agrement')).value || null,
        bio: document.getElementById(getElId('BioText')).value || null,
        diplomes: document.getElementById(getElId('Diplomes')).value || null,
        phone: document.getElementById(getElId('Phone')).value || null,
        adresse: document.getElementById(getElId('Adresse')).value || null,
        gender: document.getElementById(getElId('Gender')).value || null,
        birthDate: document.getElementById(getElId('BirthDate')).value || null
    };

    Object.keys(profileData).forEach(key => {
        if (profileData[key] === '') profileData[key] = null;
    });

    const saveBtn = document.querySelector('.update-btn');
    const originalText = saveBtn?.textContent || 'Mettre à jour';
    if (saveBtn) {
        saveBtn.textContent = 'Enregistrement...';
        saveBtn.disabled = true;
    }

    try {
        const result = await authAPI.updateProfile(profileData);

        const user = result?.user || getCurrentUser();
        if (user) {
            user.fullname = profileData.fullname;
            user.profile = { ...(user.profile || {}), ...profileData };
            localStorage.setItem('nebras_user', JSON.stringify(user));
        }

        updateSidebarWithUserData();

        const nameEl = document.getElementById(getElId('ProfileName'));
        if (nameEl) nameEl.textContent = profileData.fullname;

        const specialiteEl = document.getElementById(getElId('SpecialiteDisplay'));
        if (specialiteEl) specialiteEl.textContent = profileData.specialite || '';

        showToast('✅ Profil mis à jour avec succès !', 'success');
    } catch (error) {
        showToast('❌ Erreur: ' + error.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
}

async function toggleOnlineStatus() {
    const onlineToggle = document.getElementById('onlineToggle');
    const toggleStatusText = document.getElementById('toggleStatusText');
    const isAvailable = onlineToggle?.checked;

    try {
        await doctorAPI.updateProfile({ isAvailable: isAvailable });

        if (toggleStatusText) {
            toggleStatusText.textContent = isAvailable ? 'Actuellement visible' : 'Actuellement invisible';
        }

        showToast(isAvailable ? '✅ Vous êtes maintenant visible' : '✅ Vous êtes maintenant invisible', 'success');
    } catch (error) {
        console.error('Error toggling online status:', error);
        onlineToggle.checked = !isAvailable;
        showToast('❌ Erreur lors de la mise à jour du statut', 'error');
    }
}

async function handleAvatarChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

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

    updateProfileHeaderAvatar(avatarDataUrl);

    try {
        await authAPI.updateProfile({ avatar: avatarDataUrl });

        const user = getCurrentUser();
        if (user.profile) {
            user.profile.avatar = avatarDataUrl;
        } else {
            user.profile = { avatar: avatarDataUrl };
        }
        localStorage.setItem('nebras_user', JSON.stringify(user));

        updateSidebarAvatar(avatarDataUrl);

        showToast('✅ Photo de profil mise à jour !', 'success');
    } catch (error) {
        console.error('Avatar upload error:', error);
        showToast('❌ Erreur lors de la mise à jour: ' + (error.message || 'Erreur serveur'), 'error');
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

function openPasswordModal() {
    document.getElementById('passwordModal').style.display = 'flex';
}

function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('❌ Veuillez remplir tous les champs', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('❌ Les mots de passe ne correspondent pas', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('❌ Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }

    const btn = document.querySelector('#passwordModal .update-btn');
    const originalText = btn?.textContent || 'Enregistrer';
    if (btn) {
        btn.textContent = 'Enregistrement...';
        btn.disabled = true;
    }

    try {
        await authAPI.changePassword({
            currentPassword,
            newPassword,
            confirmPassword
        });

        showToast('✅ Mot de passe mis à jour avec succès !', 'success');
        closePasswordModal();
    } catch (error) {
        showToast('❌ ' + (error.message || 'Erreur lors du changement de mot de passe'), 'error');
    } finally {
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
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
        'statistiques': 'tabStatistiques',
        'statut': 'tabStatut',
        'securite': 'tabSecurite'
    };

    const tabId = tabMap[tabName];
    if (tabId) {
        document.getElementById(tabId).classList.add('active');
        const btnIndex = ['profil', 'statistiques', 'statut', 'securite'].indexOf(tabName);
        document.querySelectorAll('.tab-btn')[btnIndex]?.classList.add('active');
        if (tabName === 'statistiques') {
            loadStatsIfNeeded();
        }
    }
}

window.showTab = showTab;
window.updateProfile = updateProfile;
window.toggleOnlineStatus = toggleOnlineStatus;
window.handleAvatarChange = handleAvatarChange;
window.confirmDelete = confirmDelete;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.changePassword = changePassword;

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
