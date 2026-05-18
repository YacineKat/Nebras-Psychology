function getUserDisplayName(user) {
    return user?.fullname || user?.email || '';
}

function getUserInitial(user) {
    const displayName = getUserDisplayName(user);
    return displayName ? displayName.charAt(0).toUpperCase() : '?';
}

function updateSidebarWithUserData() {
    const user = getCurrentUser();
    if (!user) return;

    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = getUserDisplayName(user);
    });

    const profileNameEl = document.getElementById('counselorProfileName');
    if (profileNameEl) {
        profileNameEl.textContent = getUserDisplayName(user);
    }

    const profileEmailEl = document.getElementById('counselorEmail');
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
        const [dashboardResult, unreadMessages] = await Promise.all([
            cache.dashboard || doctorAPI.getDashboard({ view: 'summary' }).catch(() => null),
            cache.unread || messageAPI.getUnreadCount().catch(() => null)
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

        const nameEl = document.getElementById('counselorProfileName');
        if (nameEl) nameEl.textContent = getUserDisplayName(cachedUser);

        const specialiteEl = document.getElementById('counselorSpecialiteDisplay');
        if (specialiteEl) specialiteEl.textContent = p.specialite || '';

        const fullnameInput = document.getElementById('counselorFullname');
        if (fullnameInput) fullnameInput.value = cachedUser.fullname || '';

        const emailInput = document.getElementById('counselorEmailInput');
        if (emailInput) emailInput.value = cachedUser.email || '';

        const phoneInput = document.getElementById('counselorPhone');
        if (phoneInput) phoneInput.value = p.phone || '';

        const adresseInput = document.getElementById('counselorAdresse');
        if (adresseInput) adresseInput.value = p.adresse || '';

        const genderInput = document.getElementById('counselorGender');
        if (genderInput) genderInput.value = p.gender || '';

        if (p.birthDate) {
            const date = new Date(p.birthDate);
            const birthDateInput = document.getElementById('counselorBirthDate');
            if (birthDateInput) birthDateInput.value = date.toISOString().split('T')[0];
        }

        const specialiteInput = document.getElementById('counselorSpecialiteSelect');
        if (specialiteInput) specialiteInput.value = p.specialite || '';

        const agrementInput = document.getElementById('counselorAgrement');
        if (agrementInput) agrementInput.value = p.agrement || '';

        const diplomesInput = document.getElementById('counselorDiplomes');
        if (diplomesInput) diplomesInput.value = p.diplomes || '';

        const bioInput = document.getElementById('counselorBioText');
        if (bioInput) bioInput.value = p.bio || '';

        const emailEl = document.getElementById('counselorEmail');
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

            const nameEl = document.getElementById('counselorProfileName');
            if (nameEl) nameEl.textContent = getUserDisplayName(profile);

            const specialiteEl = document.getElementById('counselorSpecialiteDisplay');
            if (specialiteEl) specialiteEl.textContent = p.specialite || '';

            const fullnameInput = document.getElementById('counselorFullname');
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

async function updateCounselorProfile() {
    const fullname = document.getElementById('counselorFullname').value.trim();

    if (!fullname) {
        showToast('Le nom complet est obligatoire', 'error');
        return;
    }

    const profileData = {
        fullname: fullname,
        specialite: document.getElementById('counselorSpecialiteSelect').value || null,
        bio: document.getElementById('counselorBioText').value || null,
        diplomes: document.getElementById('counselorDiplomes').value || null,
        agrement: document.getElementById('counselorAgrement').value || null,
        phone: document.getElementById('counselorPhone').value || null,
        adresse: document.getElementById('counselorAdresse').value || null,
        gender: document.getElementById('counselorGender').value || null,
        birthDate: document.getElementById('counselorBirthDate').value || null
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

        const specialiteEl = document.getElementById('counselorSpecialiteDisplay');
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

async function handleAvatarChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Format d\'image non supporté. Utilisez JPG, PNG, GIF ou WebP.', 'error');
        return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast('L\'image est trop volumineuse. Maximum 5 Mo.', 'error');
        return;
    }

    try {
        const base64 = await compressToDataUrl(file, 300, 300, 0.7);

        updateProfileHeaderAvatar(base64);
        updateSidebarAvatar(base64);

        await authAPI.updateProfile({ avatar: base64 });

        const user = getCurrentUser();
        if (user) {
            user.profile = user.profile || {};
            user.profile.avatar = base64;
            localStorage.setItem('nebras_user', JSON.stringify(user));
        }
        showToast('✅ Photo de profil mise à jour !', 'success');
    } catch (err) {
        console.error('Avatar upload error:', err);
        showToast('❌ Erreur lors de la mise à jour de la photo', 'error');
        const p = getCurrentUser()?.profile;
        updateProfileHeaderAvatar(p?.avatar || null);
        updateSidebarAvatar(p?.avatar || null);
    }
}

function compressToDataUrl(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            if (height > maxHeight) {
                width *= maxHeight / height;
                height = maxHeight;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL(file.type, quality);
            if (dataUrl.startsWith('data:')) {
                resolve(dataUrl);
            } else {
                reject(new Error('Compression failed'));
            }
        };
        img.onerror = function() {
            reject(new Error('Image load failed'));
        };
        img.src = URL.createObjectURL(file);
    });
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
window.updateCounselorProfile = updateCounselorProfile;
window.toggleOnlineStatus = toggleOnlineStatus;
window.confirmDelete = confirmDelete;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.changePassword = changePassword;
window.handleAvatarChange = handleAvatarChange;

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
