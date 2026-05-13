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
    
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = user.fullname || user.email || 'Mon Profil';
    });
    
    const profileNameEl = document.getElementById('psyProfileName');
    if (profileNameEl) {
        profileNameEl.textContent = user.fullname || 'Mon Profil';
    }
    
    const profileEmailEl = document.getElementById('psyEmail');
    if (profileEmailEl && user.email) {
        profileEmailEl.textContent = user.email;
    }
}

function updateSidebarAvatar(avatarUrl) {
    const avatars = document.querySelectorAll('.user-avatar');
    avatars.forEach(avatar => {
        if (avatarUrl) {
            avatar.style.backgroundImage = `url(${avatarUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        } else {
            const user = getCurrentUser();
            const initial = (user?.fullname || user?.email || 'M').charAt(0).toUpperCase();
            avatar.textContent = initial;
            avatar.style.backgroundImage = '';
        }
    });
}

async function updateSidebarBadges() {
    try {
        const [dashboardResult, unreadMessages, vipResult] = await Promise.all([
            doctorAPI.getDashboard().catch(() => null),
            messageAPI.getUnreadCount().catch(() => null),
            doctorAPI.getVipStatus().catch(() => null)
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
                if (badge && unreadMessages?.count !== undefined) {
                    badge.textContent = unreadMessages.count || 0;
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

function updateProfileHeaderAvatar(avatarUrl) {
    const avatarContainer = document.querySelector('.profile-avatar-large');
    const avatarImg = document.getElementById('profileAvatarImg');
    const initialsEl = document.getElementById('profileAvatarInitials');
    const user = getCurrentUser();
    const initial = (user?.fullname || user?.email || 'M').charAt(0).toUpperCase();

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
    updateSidebarBadges();

    const formContainer = document.getElementById('tabProfil');
    if (formContainer) {
        formContainer.style.opacity = '0.5';
        formContainer.style.pointerEvents = 'none';
    }

    try {
        const [profileResult, dashboardResult, patientsResult] = await Promise.all([
            authAPI.getMe(),
            doctorAPI.getDashboard().catch(() => null),
            doctorAPI.getPatients().catch(() => null)
        ]);

        const profile = profileResult.user;
        const p = profile?.profile || {};

        const nameEl = document.getElementById('psyProfileName');
        if (nameEl) nameEl.textContent = profile.fullname || 'Mon Profil';

        const specialiteEl = document.getElementById('psySpecialiteDisplay');
        if (specialiteEl) specialiteEl.textContent = p.specialite || 'Psychologue';

        document.getElementById('psyFullname').value = profile.fullname || '';

        if (dashboardResult?.stats) {
            document.getElementById('statsPatients').textContent = dashboardResult.stats.activePatients || 0;
            document.getElementById('statsSessions').textContent = dashboardResult.stats.pendingRequestsCount || 0;
            document.getElementById('statsRating').textContent = p.rating ? Number(p.rating).toFixed(1) : '0.0';
        }

        if (patientsResult?.patients) {
            loadStatsData(patientsResult.patients, p.motifs);
        } else {
            loadStatsData([], p.motifs);
        }

        document.getElementById('psyEmailInput').value = profile.email || '';
        document.getElementById('psyPhone').value = p.phone || '';
        document.getElementById('psyAdresse').value = p.adresse || '';

        if (p.gender) {
            document.getElementById('psyGender').value = p.gender;
        }

        if (p.birthDate) {
            const date = new Date(p.birthDate);
            document.getElementById('psyBirthDate').value = date.toISOString().split('T')[0];
        }

        if (p.specialite) {
            document.getElementById('psySpecialiteSelect').value = p.specialite;
        }

        document.getElementById('psyAgrement').value = p.agrement || '';
        document.getElementById('psyDiplomes').value = p.diplomes || '';
        document.getElementById('psyBioText').value = p.bio || '';

        const emailEl = document.getElementById('psyEmail');
        if (emailEl) emailEl.textContent = profile.email || '-';

        const onlineToggle = document.getElementById('onlineToggle');
        const toggleStatusText = document.getElementById('toggleStatusText');
        if (onlineToggle) {
            onlineToggle.checked = p.isAvailable !== false;
            if (toggleStatusText) {
                toggleStatusText.textContent = p.isAvailable !== false ? 'Actualmente visible' : 'Actualmente invisible';
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

async function updatePsychologueProfile() {
    const fullname = document.getElementById('psyFullname').value.trim();

    if (!fullname) {
        showToast('❌ Le nom complet est obligatoire', 'error');
        return;
    }

    const profileData = {
        fullname: fullname,
        specialite: document.getElementById('psySpecialiteSelect').value || null,
        universite: document.getElementById('psyAgrement').value || null,
        bio: document.getElementById('psyBioText').value || null,
        diplomes: document.getElementById('psyDiplomes').value || null,
        phone: document.getElementById('psyPhone').value || null,
        adresse: document.getElementById('psyAdresse').value || null,
        gender: document.getElementById('psyGender').value || null,
        birthDate: document.getElementById('psyBirthDate').value || null
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
        await authAPI.updateProfile(profileData);

        const user = getCurrentUser();
        user.fullname = profileData.fullname;
        localStorage.setItem('nebras_user', JSON.stringify(user));
        
        updateSidebarWithUserData();
        
        const nameEl = document.getElementById('psyProfileName');
        if (nameEl) nameEl.textContent = profileData.fullname;

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
            toggleStatusText.textContent = isAvailable ? 'Actualmente visible' : 'Actualmente invisible';
        }

        showToast(isAvailable ? '✅ Vous êtes maintenant visible' : '✅ Vous êtes maintenant invisible', 'success');
    } catch (error) {
        console.error('Error toggling online status:', error);
        onlineToggle.checked = !isAvailable;
        showToast('❌ Erreur lors de la mise à jour du statut', 'error');
    }
}

async function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('❌ Veuillez sélectionner une image', 'error');
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showToast('❌ L\'image ne doit pas dépasser 2MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Image = e.target.result;

        updateProfileHeaderAvatar(base64Image);

        try {
            const result = await authAPI.updateProfile({ avatar: base64Image });

            const user = getCurrentUser();
            if (user.profile) {
                user.profile.avatar = base64Image;
            } else {
                user.profile = { avatar: base64Image };
            }
            localStorage.setItem('nebras_user', JSON.stringify(user));

            updateSidebarAvatar(base64Image);

            showToast('✅ Photo de profil mise à jour !', 'success');
        } catch (error) {
            console.error('Avatar upload error:', error);
            showToast('❌ Erreur lors de la mise à jour: ' + (error.message || 'Erreur serveur'), 'error');
        }
    };
    reader.readAsDataURL(file);
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
    }
}

window.showTab = showTab;
window.updatePsychologueProfile = updatePsychologueProfile;
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