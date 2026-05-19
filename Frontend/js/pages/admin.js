// === admin.html ===
function normalizeStringField(id) {
    return document.getElementById(id).value.trim();
}

function parsePositiveNumber(id, label) {
    const raw = document.getElementById(id).value.trim();
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(label + ' invalide');
    }
    return value;
}

async function loadSettings() {
    try {
        const data = await adminAPI.getSettings();
        const s = data.settings || {};
        document.getElementById('siteName').value = s.siteName || '';
        document.getElementById('contactEmail').value = s.contactEmail || '';
        document.getElementById('phone').value = s.phone || '';
        document.getElementById('consultationPrice').value = s.consultationPrice ?? 1000;
        document.getElementById('vipMonthlyPrice').value = s.vipMonthlyPrice ?? 5000;
        document.getElementById('platformCommission').value = s.platformCommission ?? 10;
        const savedEl = document.getElementById('lastSaved');
        if (s.updatedAt) {
            savedEl.textContent = 'Dernière mise à jour: ' + new Date(s.updatedAt).toLocaleString('fr-FR');
        } else {
            savedEl.textContent = '';
        }
    } catch (e) {
        showToast(e.message || 'Impossible de charger les paramètres', 'error');
    }
}

async function saveSettings() {
    let payload;
    try {
        const siteName = normalizeStringField('siteName');
        const contactEmail = normalizeStringField('contactEmail');
        const phone = normalizeStringField('phone');
        const price = parsePositiveNumber('consultationPrice', 'Prix consultation');
        const vip = parsePositiveNumber('vipMonthlyPrice', 'Prix VIP');
        const commission = Number.parseInt(document.getElementById('platformCommission').value.trim(), 10);

        if (!siteName) throw new Error('Le nom du site est requis');
        if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Email contact invalide');
        if (!Number.isFinite(commission) || commission < 0 || commission > 100) throw new Error('Commission doit être entre 0 et 100');

        payload = {
            siteName,
            contactEmail,
            consultationPrice: price,
            vipMonthlyPrice: vip,
            platformCommission: commission
        };

        if (phone) payload.phone = phone;
    } catch (validationError) {
        showToast(validationError.message, 'error');
        return;
    }

    const btn = document.querySelector('.save-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation:spin 1s linear infinite;"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Enregistrement...';

    try {
        await adminAPI.updateSettings(payload);
        await loadSettings();
        showToast('Paramètres enregistrés', 'success');
    } catch (e) {
        showToast(e.message || 'Erreur enregistrement', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg> Enregistrer';
    }
}

async function loadSidebarBadges() {
    try {
        const data = await adminAPI.getBadges();
        document.getElementById('usersBadge').textContent = data.pendingUsers || '';
        document.getElementById('validationsBadge').textContent = data.pendingValidations || '';
        document.getElementById('paymentsBadge').textContent = data.pendingPayments || '';
    } catch (e) {}
}

// === admin_dashboard.html ===
async function loadDashboard() {
    try {
        const data = await adminAPI.getDashboard();
        const s = data.stats;

        document.getElementById('patientsCount').textContent = s.patientsActifs;
        document.getElementById('psychologuesCount').textContent = s.psychologuesActifs;
        document.getElementById('counselorsCount').textContent = s.counselorsActifs;
        document.getElementById('totalUsers').textContent = s.utilisateursTotaux;
        document.getElementById('rdvCount').textContent = s.rdvCeMois;
        document.getElementById('revenueCount').textContent = s.revenusTotaux.toLocaleString() + ' DA';
        document.getElementById('vipCount').textContent = s.abonnementsVIP;

        document.getElementById('validationsBadge').textContent = data.pendingValidations;
        document.getElementById('paymentsBadge').textContent = data.pendingPayments;

        const valSpan = document.getElementById('pendingValidationsCount');
        if (valSpan) valSpan.textContent = '(' + data.pendingValidations + ')';
        const paySpan = document.getElementById('pendingPaymentsCount');
        if (paySpan) paySpan.textContent = '(' + data.pendingPayments + ')';

        const tbody = document.getElementById('recentUsersBody');
        tbody.innerHTML = '';
        data.recentUsers.forEach(u => {
            const typeLabel = { patient: 'Patient', psychologue: 'Psychologue', counselor: 'Counselor', admin: 'Admin' }[u.userType] || u.userType;
            const statusClass = { active: 'status-active', pending: 'status-pending', rejected: 'status-inactive', suspended: 'status-inactive' }[u.status] || 'status-pending';
            const statusLabel = { active: 'Actif', pending: 'En attente', rejected: 'Rejeté', suspended: 'Suspendu' }[u.status] || u.status;
            const avatarHtml = u.avatar ? `<img src="${u.avatar}" class="user-avatar-img">` : `<div class="user-avatar-img" style="background:#e8f4ee;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#44AA99">${u.fullname.charAt(0)}</div>`;
            const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '-';

            let actionsHtml = '';
            if (u.status === 'pending') {
                actionsHtml = `
                    <button class="icon-btn-small" onclick="openApproveModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
                    <button class="icon-btn-small" onclick="openRejectModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
            } else {
                actionsHtml = `
                    <button class="icon-btn-small" onclick="openViewUserModal('${u.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
                    <button class="icon-btn-small" onclick="openEditUserModal('${u.id}','${escapeHtml(u.fullname)}','${escapeHtml(u.email)}','${u.userType}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/></svg></button>
                    <button class="icon-btn-small" onclick="openDeleteModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`;
            }

            tbody.innerHTML += `<tr>
                <td>${avatarHtml}</td>
                <td>${escapeHtml(u.fullname)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${typeLabel}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${dateStr}</td>
                <td><div class="action-btns">${actionsHtml}</div></td>
            </tr>`;
        });
    } catch (e) {
        showToast('Erreur chargement tableau de bord', 'error');
        console.error(e);
    }
}

function openAddUserModal() {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter un utilisateur',
        bodyHtml: `
            <div class="modal-form-row"><label>Nom complet</label><input type="text" id="addFullname" placeholder="Nom et prénom"></div>
            <div class="modal-form-row"><label>Email</label><input type="email" id="addEmail" placeholder="email@exemple.com"></div>
            <div class="modal-form-row"><label>Mot de passe</label><input type="password" id="addPassword" placeholder="Mot de passe"></div>
            <div class="modal-form-row"><label>Type</label><select id="addUserType"><option value="patient">Patient</option><option value="psychologue">Psychologue</option><option value="counselor">Counselor</option></select></div>
        `,
        confirmText: 'Créer',
        confirmClass: 'primary',
        onConfirm: async () => {
            const fullname = document.getElementById('addFullname').value.trim();
            const email = document.getElementById('addEmail').value.trim();
            const password = document.getElementById('addPassword').value;
            const userType = document.getElementById('addUserType').value;
            if (!fullname || !email || !password) { showToast('Veuillez remplir tous les champs', 'error'); return; }
            try {
                await window.authAPI.register({ fullname, email, password, userType });
                showToast('Utilisateur créé', 'success');
                loadDashboard();
            } catch(e) { showToast(e.message || 'Erreur création', 'error'); }
        }
    });
}

function openViewUserModal(userId) {
    const modalRef = {};
    const overlay = showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg> Détails utilisateur',
        bodyHtml: '<p style="text-align:center;color:#999;">Chargement...</p>',
        confirmText: 'Fermer',
        confirmClass: 'secondary',
        width: '560px',
        onConfirm: () => {}
    });
    modalRef.overlay = overlay;
    adminAPI.getUser(userId).then(data => {
        const u = data.user;
        if (!modalRef.overlay || !modalRef.overlay.parentNode) return;
        const body = modalRef.overlay.querySelector('.admin-modal-body');
        if (!body) return;
        const typeLabel = { patient: 'Patient', psychologue: 'Psychologue', counselor: 'Counselor', admin: 'Admin' }[u.userType] || u.userType;
        const statusLabel = { active: 'Actif', pending: 'En attente', rejected: 'Rejeté', suspended: 'Suspendu' }[u.status] || u.status;
        const avatarHtml = u.profile?.avatar ? `<img src="${u.profile.avatar}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px;">` : '';
        body.innerHTML = `
            ${avatarHtml}
            <div class="modal-info-row"><span class="modal-info-label">Avatar</span><span class="modal-info-value">${u.profile?.avatar ? 'Oui' : 'Non'}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Nom</span><span class="modal-info-value">${escapeHtml(u.fullname)}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Email</span><span class="modal-info-value">${escapeHtml(u.email)}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Type</span><span class="modal-info-value">${typeLabel}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Statut</span><span class="modal-info-value">${statusLabel}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Téléphone</span><span class="modal-info-value">${escapeHtml(u.profile?.phone || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Spécialité</span><span class="modal-info-value">${escapeHtml(u.profile?.specialite || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Université</span><span class="modal-info-value">${escapeHtml(u.profile?.universite || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Bio</span><span class="modal-info-value">${escapeHtml(u.profile?.bio || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Inscription</span><span class="modal-info-value">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</span></div>
        `;
    }).catch(() => {
        if (modalRef.overlay && modalRef.overlay.parentNode) {
            const body = modalRef.overlay.querySelector('.admin-modal-body');
            if (body) body.innerHTML = '<p style="text-align:center;color:#e74c3c;">Erreur chargement des détails</p>';
        }
    });
}

function openEditUserModal(id, fullname, email, userType) {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/></svg> Modifier utilisateur',
        bodyHtml: `
            <div class="modal-form-row"><label>Nom complet</label><input type="text" id="editFullname" value="${escapeHtml(fullname)}"></div>
            <div class="modal-form-row"><label>Email</label><input type="email" id="editEmail" value="${escapeHtml(email)}"></div>
            <div class="modal-form-row"><label>Type</label><select id="editUserType">
                <option value="patient" ${userType === 'patient' ? 'selected' : ''}>Patient</option>
                <option value="psychologue" ${userType === 'psychologue' ? 'selected' : ''}>Psychologue</option>
                <option value="counselor" ${userType === 'counselor' ? 'selected' : ''}>Counselor</option>
            </select></div>
        `,
        confirmText: 'Enregistrer',
        confirmClass: 'primary',
        onConfirm: async () => {
            const data = {
                fullname: document.getElementById('editFullname').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                userType: document.getElementById('editUserType').value
            };
            if (!data.fullname || !data.email) { showToast('Veuillez remplir tous les champs', 'error'); return; }
            try {
                await adminAPI.updateUser(id, data);
                showToast('Utilisateur modifié', 'success');
                loadDashboard();
            } catch(e) { showToast('Erreur modification', 'error'); }
        }
    });
}

function openDeleteModal(id, name) {
    showConfirmModal({
        title: 'Supprimer',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
        message: `Êtes-vous sûr de vouloir supprimer <strong>${escapeHtml(name)}</strong> ? Cette action est irréversible.`,
        confirmText: 'Supprimer',
        confirmClass: 'danger',
        onConfirm: async () => {
            try {
                await adminAPI.deleteUser(id);
                showToast(name + ' supprimé', 'success');
                loadDashboard();
                if (document.getElementById('searchInput')) loadUsers();
            } catch(e) { showToast('Erreur suppression', 'error'); }
        }
    });
}

function openApproveModal(id, name) {
    showConfirmModal({
        title: 'Approuver',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        message: `Approuver <strong>${escapeHtml(name)}</strong> ? Son compte sera activé.`,
        confirmText: 'Approuver',
        confirmClass: 'primary',
        onConfirm: async () => {
            try {
                await adminAPI.approveUser(id);
                showToast(name + ' approuvé', 'success');
                loadDashboard();
                if (document.getElementById('searchInput')) loadUsers();
            } catch(e) { showToast('Erreur approbation', 'error'); }
        }
    });
}

function openRejectModal(id, name) {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Rejeter',
        bodyHtml: `<p>Rejeter <strong>${escapeHtml(name)}</strong> ?</p><div class="modal-form-row"><label>Motif (optionnel)</label><textarea id="rejectReason" placeholder="Raison du rejet..."></textarea></div>`,
        confirmText: 'Rejeter',
        confirmClass: 'danger',
        onConfirm: async () => {
            const reason = document.getElementById('rejectReason')?.value || '';
            try {
                await adminAPI.rejectUser(id, reason);
                showToast(name + ' rejeté', 'success');
                loadDashboard();
                if (document.getElementById('searchInput')) loadUsers();
            } catch(e) { showToast('Erreur rejet', 'error'); }
        }
    });
}

// === admin_utilisateurs.html ===
let searchTimeout;

function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadUsers, 400);
}

async function loadUsers() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    const search = searchInput.value;
    const type = document.getElementById('typeFilter').value;
    const status = document.getElementById('statusFilter').value;

    try {
        const params = {};
        if (search) params.search = search;
        if (type) params.type = type;
        if (status) params.status = status;

        const data = await adminAPI.getUsers(params);
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">Aucun utilisateur trouvé</td></tr>';
            document.getElementById('paginationInfo').textContent = '';
            return;
        }

        data.users.forEach(u => {
            const typeLabel = { patient: 'Patient', psychologue: 'Psychologue', counselor: 'Counselor', admin: 'Admin' }[u.userType] || u.userType;
            const statusClass = { active: 'status-active', pending: 'status-pending', rejected: 'status-inactive', suspended: 'status-inactive' }[u.status] || 'status-pending';
            const statusLabel = { active: 'Actif', pending: 'En attente', rejected: 'Rejeté', suspended: 'Suspendu' }[u.status] || u.status;
            const avatarHtml = u.avatar ? `<img src="${u.avatar}" class="user-avatar-img">` : `<div class="user-avatar-img" style="background:#e8f4ee;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#44AA99">${u.fullname.charAt(0)}</div>`;
            const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '-';

            let actionsHtml = '';
            if (u.status === 'pending') {
                actionsHtml = `
                    <button class="icon-btn-small" onclick="openApproveModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>
                    <button class="icon-btn-small" onclick="openRejectModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
            } else {
                actionsHtml = `
                    <button class="icon-btn-small" onclick="openViewModal('${u.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>
                    <button class="icon-btn-small" onclick="openEditModal('${u.id}','${escapeHtml(u.fullname)}','${escapeHtml(u.email)}','${u.userType}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/></svg></button>
                    <button class="icon-btn-small" onclick="openDeleteModal('${u.id}','${escapeHtml(u.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`;
            }

            tbody.innerHTML += `<tr>
                <td>${avatarHtml}</td>
                <td>${escapeHtml(u.fullname)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${typeLabel}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${dateStr}</td>
                <td><div class="action-btns">${actionsHtml}</div></td>
            </tr>`;
        });

        const pg = data.pagination;
        document.getElementById('paginationInfo').textContent = `Page ${pg.page} / ${pg.totalPages} — ${pg.total} utilisateur(s)`;
    } catch (e) {
        showToast('Erreur chargement utilisateurs', 'error');
        console.error(e);
    }
}

function openViewModal(userId) {
    const modalRef = {};
    const overlay = showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg> Détails utilisateur',
        bodyHtml: '<p style="text-align:center;color:#999;">Chargement...</p>',
        confirmText: 'Fermer',
        confirmClass: 'secondary',
        cancelText: '',
        width: '560px',
        onConfirm: () => {}
    });
    modalRef.overlay = overlay;
    adminAPI.getUser(userId).then(data => {
        const u = data.user;
        if (!modalRef.overlay || !modalRef.overlay.parentNode) return;
        const body = modalRef.overlay.querySelector('.admin-modal-body');
        if (!body) return;
        const typeLabel = { patient: 'Patient', psychologue: 'Psychologue', counselor: 'Counselor', admin: 'Admin' }[u.userType] || u.userType;
        const statusLabel = { active: 'Actif', pending: 'En attente', rejected: 'Rejeté', suspended: 'Suspendu' }[u.status] || u.status;
        const avatarHtml = u.profile?.avatar ? `<img src="${u.profile.avatar}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px;">` : '';
        body.innerHTML = `
            ${avatarHtml}
            <div class="modal-info-row"><span class="modal-info-label">Avatar</span><span class="modal-info-value">${u.profile?.avatar ? 'Oui' : 'Non'}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Nom</span><span class="modal-info-value">${escapeHtml(u.fullname)}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Email</span><span class="modal-info-value">${escapeHtml(u.email)}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Type</span><span class="modal-info-value">${typeLabel}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Statut</span><span class="modal-info-value">${statusLabel}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Téléphone</span><span class="modal-info-value">${escapeHtml(u.profile?.phone || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Spécialité</span><span class="modal-info-value">${escapeHtml(u.profile?.specialite || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Université</span><span class="modal-info-value">${escapeHtml(u.profile?.universite || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Bio</span><span class="modal-info-value">${escapeHtml(u.profile?.bio || '-')}</span></div>
            <div class="modal-info-row"><span class="modal-info-label">Inscription</span><span class="modal-info-value">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</span></div>
        `;
    }).catch(() => {
        if (modalRef.overlay && modalRef.overlay.parentNode) {
            const body = modalRef.overlay.querySelector('.admin-modal-body');
            if (body) body.innerHTML = '<p style="text-align:center;color:#e74c3c;">Erreur chargement des détails</p>';
        }
    });
}

function openEditModal(id, fullname, email, userType) {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/></svg> Modifier utilisateur',
        bodyHtml: `
            <div class="modal-form-row"><label>Nom complet</label><input type="text" id="editFullname" value="${escapeHtml(fullname)}"></div>
            <div class="modal-form-row"><label>Email</label><input type="email" id="editEmail" value="${escapeHtml(email)}"></div>
            <div class="modal-form-row"><label>Type</label><select id="editUserType">
                <option value="patient" ${userType === 'patient' ? 'selected' : ''}>Patient</option>
                <option value="psychologue" ${userType === 'psychologue' ? 'selected' : ''}>Psychologue</option>
                <option value="counselor" ${userType === 'counselor' ? 'selected' : ''}>Counselor</option>
            </select></div>
        `,
        confirmText: 'Enregistrer',
        confirmClass: 'primary',
        onConfirm: async () => {
            const data = {
                fullname: document.getElementById('editFullname').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                userType: document.getElementById('editUserType').value
            };
            if (!data.fullname || !data.email) { showToast('Veuillez remplir tous les champs', 'error'); return; }
            try {
                await adminAPI.updateUser(id, data);
                showToast('Utilisateur modifié', 'success');
                loadUsers();
            } catch(e) { showToast('Erreur modification', 'error'); }
        }
    });
}

// === admin_validation.html ===
let allValidations = [];

async function loadValidations() {
    try {
        const data = await adminAPI.getValidations();
        allValidations = data.validations || [];
        renderTab('psychologue');
        renderTab('counselor');
        document.getElementById('validationsBadge').textContent = allValidations.length || '';
    } catch (e) {
        showToast('Erreur chargement validations', 'error');
        console.error(e);
    }
}

function renderTab(type) {
    const grid = document.getElementById(type + 'Grid');
    const items = allValidations.filter(v => v.type === type);
    const badgeLabel = type === 'psychologue' ? 'Psychologue' : 'Counselor';

    if (items.length === 0) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">Aucune demande en attente</p>';
        return;
    }

    grid.innerHTML = items.map(v => {
        const avatarHtml = v.avatar ? `<img src="${v.avatar}" class="user-avatar-img" style="width:50px;height:50px;">` : `<div class="user-avatar-img" style="width:50px;height:50px;background:#e8f4ee;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#44AA99;border-radius:50%;font-size:20px;">${v.fullname.charAt(0)}</div>`;
        const docsHtml = (v.documents || []).map(d => `<a href="${d.fileUrl}" class="doc-link" target="_blank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${d.name}</a>`).join('');

        return `<div class="validation-card">
            <div class="validation-header">
                <div>${avatarHtml}</div>
                <div class="validation-info">
                    <h4>${escapeHtml(v.fullname)} <span class="psychologue-badge">${badgeLabel}</span></h4>
                    <p>${escapeHtml(v.specialite || '-')}${v.universite ? ' - ' + escapeHtml(v.universite) : ''}</p>
                    <p><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Demande: ${new Date(v.requestDate).toLocaleDateString('fr-FR')}</p>
                </div>
            </div>
            <div class="validation-docs">${docsHtml || '<span style="color:#999;font-size:12px;">Aucun document</span>'}</div>
            <div class="validation-actions">
                <button class="action-btn primary" onclick="approveValidation('${v.id}','${escapeHtml(v.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approuver</button>
                <button class="action-btn danger" onclick="rejectValidation('${v.id}','${escapeHtml(v.fullname)}')"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Rejeter</button>
                <button class="action-btn secondary" data-details='${encodeURIComponent(JSON.stringify(v))}' onclick="showDetails(this)"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg> Voir</button>
            </div>
        </div>`;
    }).join('');
}

function showTab(type) {
    document.querySelectorAll('.validation-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.validation-tab-content').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(type + 'Section').classList.add('active');
}

function approveValidation(id, name) {
    showConfirmModal({
        title: 'Approuver',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        message: `Approuver <strong>${escapeHtml(name)}</strong> ? Son compte sera activé.`,
        confirmText: 'Approuver',
        confirmClass: 'primary',
        onConfirm: async () => {
            try {
                await adminAPI.approveValidation(id);
                showToast(name + ' approuvé', 'success');
                loadValidations();
            } catch (e) {
                showToast('Erreur approbation', 'error');
            }
        }
    });
}

function rejectValidation(id, name) {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Rejeter',
        bodyHtml: `<p>Rejeter <strong>${escapeHtml(name)}</strong> ?</p><div class="modal-form-row"><label>Motif (optionnel)</label><textarea id="rejectReason" placeholder="Raison du rejet..."></textarea></div>`,
        confirmText: 'Rejeter',
        confirmClass: 'danger',
        onConfirm: async () => {
            const reason = document.getElementById('rejectReason')?.value || '';
            try {
                await adminAPI.rejectValidation(id, reason);
                showToast(name + ' rejeté', 'success');
                loadValidations();
            } catch (e) {
                showToast('Erreur rejet', 'error');
            }
        }
    });
}

function showDetails(btn) {
    const v = JSON.parse(decodeURIComponent(btn.dataset.details));
    const docsHtml = (v.documents || []).map(d => `<div class="document-item"><span class="document-name"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${escapeHtml(d.name)}</span><a href="${d.fileUrl}" class="download-link" target="_blank">Télécharger</a></div>`).join('');

    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Dossier complet',
        bodyHtml: `
            <div class="info-section">
                <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg> Informations personnelles</h3>
                <div class="modal-info-row"><span class="modal-info-label">Nom</span><span class="modal-info-value">${escapeHtml(v.fullname)}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Email</span><span class="modal-info-value">${escapeHtml(v.email)}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Téléphone</span><span class="modal-info-value">${escapeHtml(v.phone || '-')}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Type</span><span class="modal-info-value">${v.type === 'psychologue' ? 'Psychologue' : 'Counselor'}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Spécialité</span><span class="modal-info-value">${escapeHtml(v.specialite || '-')}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Université</span><span class="modal-info-value">${escapeHtml(v.universite || '-')}</span></div>
                <div class="modal-info-row"><span class="modal-info-label">Bio</span><span class="modal-info-value">${escapeHtml(v.bio || '-')}</span></div>
            </div>
            <div class="documents-list">
                <h4 style="margin-bottom:10px;color:#091346;">Documents</h4>
                ${docsHtml || '<p style="color:#999;">Aucun document</p>'}
            </div>
        `,
        confirmText: 'Fermer',
        confirmClass: 'secondary',
        cancelText: '',
        width: '580px',
        onConfirm: () => {}
    });
}

// === admin_paiements.html ===
async function loadPayments() {
    try {
        const [summary, payments] = await Promise.all([
            adminAPI.getPaymentsSummary(),
            adminAPI.getPayments({ status: 'pending' })
        ]);

        document.getElementById('totalRevenue').textContent = summary.totalRevenue.toLocaleString() + ' DA';
        document.getElementById('pendingAmount').textContent = summary.pendingAmount.toLocaleString() + ' DA';
        document.getElementById('pendingCount').textContent = summary.pendingCount + ' transactions';
        document.getElementById('validatedAmount').textContent = summary.validatedAmount.toLocaleString() + ' DA';
        document.getElementById('paymentsBadge').textContent = summary.pendingCount;

        const tbody = document.getElementById('paymentsTableBody');
        tbody.innerHTML = '';

        if (payments.transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#999;">Aucun paiement en attente</td></tr>';
            return;
        }

        payments.transactions.forEach(t => {
            const typeLabel = { consultation: 'Consultation', vip_subscription: 'Abonnement VIP' }[t.type] || t.type;
            const dateStr = new Date(t.date).toLocaleDateString('fr-FR');

            tbody.innerHTML += `<tr>
                <td>${dateStr}</td>
                <td>${escapeHtml(t.userName)}</td>
                <td>${typeLabel} ${t.type === 'consultation' ? '<span class="psychologue-badge">Consultation</span>' : ''}</td>
                <td>${t.amount.toLocaleString()} DA</td>
                <td>${escapeHtml(t.reference || '-')}</td>
                <td><div class="action-btns">
                    <button class="action-btn primary" onclick="validatePayment('${t.id}','${escapeHtml(t.userName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Valider</button>
                    <button class="action-btn danger" onclick="rejectPayment('${t.id}','${escapeHtml(t.userName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Refuser</button>
                </div></td>
            </tr>`;
        });
    } catch (e) {
        showToast('Erreur chargement paiements', 'error');
        console.error(e);
    }
}

function validatePayment(id, userName) {
    showConfirmModal({
        title: 'Valider',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        message: `Valider le paiement de <strong>${escapeHtml(userName)}</strong> ?`,
        confirmText: 'Valider',
        confirmClass: 'primary',
        onConfirm: async () => {
            try {
                await adminAPI.validatePayment(id);
                showToast('Paiement validé', 'success');
                loadPayments();
            } catch (e) {
                showToast('Erreur validation', 'error');
            }
        }
    });
}

function rejectPayment(id, userName) {
    showPromptModal({
        title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Refuser',
        bodyHtml: `<p>Refuser le paiement de <strong>${escapeHtml(userName)}</strong> ?</p><div class="modal-form-row"><label>Motif (optionnel)</label><textarea id="rejectReason" placeholder="Raison du refus..."></textarea></div>`,
        confirmText: 'Refuser',
        confirmClass: 'danger',
        onConfirm: async () => {
            const reason = document.getElementById('rejectReason')?.value || '';
            try {
                await adminAPI.rejectPayment(id, reason);
                showToast('Paiement refusé', 'success');
                loadPayments();
            } catch (e) {
                showToast('Erreur refus', 'error');
            }
        }
    });
}

// === admin_statistiques.html ===
let statsData = null;

function escapeHtmlSafe(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDa(value) {
    return Number(value || 0).toLocaleString('fr-FR') + ' DA';
}

function periodLabel(value) {
    if (value === '7d') return '7 derniers jours';
    if (value === '3m') return '3 derniers mois';
    if (value === '12m') return '12 derniers mois';
    return '30 derniers jours';
}

function updateKpis(data) {
    const totalUsers = (data.registrations || []).reduce((sum, month) => {
        return sum + (month.patients || 0) + (month.psychologues || 0) + (month.counselors || 0);
    }, 0);
    const revenue = (data.revenue || []).reduce((sum, m) => sum + (m.revenue || 0), 0);
    const appointments = (data.appointmentsByDay || []).reduce((sum, d) => sum + (d.count || 0), 0);
    const topRating = (data.topProfessionals && data.topProfessionals.length > 0) ? data.topProfessionals[0].rating : null;

    document.getElementById('kpiUsers').textContent = String(totalUsers);
    document.getElementById('kpiRevenue').textContent = formatDa(revenue);
    document.getElementById('kpiAppointments').textContent = String(appointments);
    document.getElementById('kpiTopRating').textContent = topRating !== null ? Number(topRating).toFixed(1) + ' / 5' : '-';
}

function csvQuote(str) {
    return '"' + String(str).replace(/"/g, '""') + '"';
}

function setLoading(containerId) {
    const el = document.getElementById(containerId);
    el.innerHTML = '<div class="chart-loading">Chargement</div>';
}

async function loadStats() {
    const period = document.getElementById('periodSelect').value;
    document.getElementById('registrationPeriodText').textContent = periodLabel(period);
    document.getElementById('appointmentsPeriodText').textContent = '7 derniers jours';

    setLoading('registrationsChart');
    setLoading('revenueChart');
    setLoading('appointmentsChart');
    document.getElementById('distributionChart').innerHTML = '<div class="chart-loading">Chargement</div>';
    document.getElementById('topProfessionalsBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">Chargement...</td></tr>';

    try {
        const data = await adminAPI.getStatistics({ period });
        statsData = data;
        renderRegistrations(data.registrations);
        renderDistribution(data.distribution);
        renderRevenue(data.revenue);
        renderAppointments(data.appointmentsByDay);
        renderTopProfessionals(data.topProfessionals);
        updateKpis(data);
    } catch (e) {
        showToast('Erreur chargement statistiques', 'error');
        console.error(e);
        ['registrationsChart','revenueChart','appointmentsChart','distributionChart'].forEach(id => {
            document.getElementById(id).innerHTML = '<p class="data-empty">Erreur de chargement</p>';
        });
        document.getElementById('topProfessionalsBody').innerHTML = '<tr><td colspan="7" class="data-empty">Erreur de chargement</td></tr>';
        ['kpiUsers', 'kpiRevenue', 'kpiAppointments', 'kpiTopRating'].forEach(id => { document.getElementById(id).textContent = '-'; });
    }
}

function renderRegistrations(months) {
    const container = document.getElementById('registrationsChart');
    if (!months || months.length === 0) {
        container.innerHTML = '<p class="data-empty"><svg class="data-empty-icon" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Aucune inscription sur cette période</p>';
        return;
    }
    const maxVal = Math.max(...months.map(m => Math.max(m.patients, m.psychologues, m.counselors)), 1);
    container.innerHTML = months.map(m => {
        const h = v => Math.max(Math.round((v / maxVal) * 120), 4);
        return `<div class="line-marker" style="height:130px;">
            <span class="marker-label">${m.month}</span>
            <div style="display:flex;gap:2px;align-items:flex-end;height:120px;">
                <div style="width:14px;height:${h(m.patients)}px;background:#44AA99;border-radius:3px 3px 0 0;" title="Patients: ${m.patients}"></div>
                <div style="width:14px;height:${h(m.psychologues)}px;background:#091346;border-radius:3px 3px 0 0;" title="Psychologues: ${m.psychologues}"></div>
                <div style="width:14px;height:${h(m.counselors)}px;background:#9575CD;border-radius:3px 3px 0 0;" title="Counselors: ${m.counselors}"></div>
            </div>
            <span class="marker-value">${m.patients + m.psychologues + m.counselors}</span>
        </div>`;
    }).join('');
}

function renderDistribution(dist) {
    const container = document.getElementById('distributionChart');
    if (!dist) {
        container.innerHTML = '<p class="data-empty">Aucune donnée</p>';
        return;
    }
    const segments = [
        { label: 'Patients normaux', pct: dist.patientsNormaux || 0, color: '#44AA99' },
        { label: 'Patients VIP', pct: dist.patientsVip || 0, color: '#B39DDB' },
        { label: 'Psychologues', pct: dist.psychologues || 0, color: '#091346' },
        { label: 'Counselors', pct: dist.counselors || 0, color: '#9575CD' }
    ];
    container.innerHTML = segments.map(s =>
        `<div class="pie-segment" style="width:${s.pct}%;background:${s.color};" title="${s.label}: ${s.pct}%">${s.pct > 8 ? s.pct + '%' : ''}</div>`
    ).join('');

    document.getElementById('distributionLegend').innerHTML = segments.map(s =>
        `<span><span class="legend-color" style="background:${s.color};"></span> ${s.label} (${s.pct}%)</span>`
    ).join('');
}

function renderRevenue(months) {
    const container = document.getElementById('revenueChart');
    if (!months || months.length === 0) {
        container.innerHTML = '<p class="data-empty"><svg class="data-empty-icon" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 8l-4 8-4-8"/></svg>Aucun revenu sur cette période</p>';
        return;
    }
    const maxRev = Math.max(...months.map(m => m.revenue), 1);
    container.innerHTML = months.map(m => {
        const pct = Math.max(Math.round((m.revenue / maxRev) * 100), 2);
        return `<div class="bar-item"><span class="bar-label">${m.month}</span><div class="bar-fill" style="width:${pct}%;"></div><span class="bar-value">${(m.revenue / 1000).toFixed(0)}K</span></div>`;
    }).join('');
}

function renderAppointments(days) {
    const container = document.getElementById('appointmentsChart');
    if (!days || days.length === 0) {
        container.innerHTML = '<p class="data-empty"><svg class="data-empty-icon" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Aucun rendez-vous cette semaine</p>';
        return;
    }
    const maxVal = Math.max(...days.map(d => d.count), 1);
    container.innerHTML = days.map(d => {
        const h = Math.max(Math.round((d.count / maxVal) * 130), 4);
        return `<div class="day-bar"><span class="day-name">${d.day}</span><div class="day-fill" style="height:${h}px;"></div><span class="day-value">${d.count}</span></div>`;
    }).join('');
}

function renderTopProfessionals(pros) {
    const tbody = document.getElementById('topProfessionalsBody');
    tbody.innerHTML = '';
    if (!pros || pros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="data-empty">Aucun professionnel enregistré</td></tr>';
        return;
    }
    pros.forEach((p, i) => {
        const rank = i + 1;
        const rankClass = rank <= 3 ? 'top-rank top-rank-' + rank : 'top-rank';
        const typeLabel = p.type === 'psychologue' ? 'Psychologue' : 'Counselor';
        const initial = (p.fullname || '?').charAt(0).toUpperCase();
        const safeName = escapeHtmlSafe(p.fullname);
        const safeSpecialite = escapeHtmlSafe(p.specialite);
        const roundedRating = Math.max(0, Math.min(5, Math.round(Number(p.rating) || 0)));
        tbody.innerHTML += `<tr>
            <td><span class="${rankClass}">#${rank}</span></td>
            <td>
                <div class="pro-cell">
                    <span class="pro-avatar">${initial}</span>
                    <span class="pro-name">${safeName}</span>
                </div>
            </td>
            <td><span class="pro-type-badge ${p.type === 'psychologue' ? 'psy' : 'cns'}">${typeLabel}</span></td>
            <td>${safeSpecialite}</td>
            <td>${p.patientCount}</td>
            <td>${formatDa(p.revenue)}</td>
            <td><span class="prof-rating">${'★'.repeat(roundedRating)}${'☆'.repeat(5 - roundedRating)} ${Number(p.rating || 0).toFixed(1)}</span></td>
        </tr>`;
    });
}

function exportStats() {
    showConfirmModal({
        title: 'Exporter',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        message: 'Exporter les statistiques en CSV ?',
        confirmText: 'Exporter',
        confirmClass: 'primary',
        onConfirm: () => {
            if (!statsData) { showToast('Aucune donnée à exporter', 'error'); return; }

            const rows = [];
            rows.push('=== Évolution des inscriptions ===');
            rows.push('Mois,Patients,Psychologues,Counselors');
            (statsData.registrations || []).forEach(r => rows.push(`${csvQuote(r.month)},${r.patients},${r.psychologues},${r.counselors}`));
            rows.push('');

            rows.push('=== Répartition des utilisateurs ===');
            rows.push('Catégorie,Pourcentage');
            if (statsData.distribution) {
                rows.push('Patients normaux,' + (statsData.distribution.patientsNormaux || 0));
                rows.push('Patients VIP,' + (statsData.distribution.patientsVip || 0));
                rows.push('Psychologues,' + (statsData.distribution.psychologues || 0));
                rows.push('Counselors,' + (statsData.distribution.counselors || 0));
            }
            rows.push('');

            rows.push('=== Revenus mensuels ===');
            rows.push('Mois,Revenu (DA)');
            (statsData.revenue || []).forEach(r => rows.push(`${csvQuote(r.month)},${r.revenue}`));
            rows.push('');

            rows.push('=== Rendez-vous par jour ===');
            rows.push('Jour,Nombre');
            (statsData.appointmentsByDay || []).forEach(d => rows.push(`${csvQuote(d.day)},${d.count}`));
            rows.push('');

            rows.push('=== Top professionnels ===');
            rows.push('Nom,Type,Spécialité,Patients,Revenus (DA),Note');
            (statsData.topProfessionals || []).forEach(p => rows.push(`${csvQuote(p.fullname)},${csvQuote(p.type)},${csvQuote(p.specialite)},${p.patientCount},${p.revenue},${p.rating}`));

            const csv = rows.join('\r\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'statistiques_nebras.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast('Export terminé ✓', 'success');
        }
    });
}

// === Page init calls (parallelized) ===
Promise.all([
    loadSidebarBadges(),
    ...(document.getElementById('patientsCount') ? [loadDashboard()] : []),
    ...(document.getElementById('searchInput') ? [loadUsers()] : []),
    ...(document.getElementById('psychologueGrid') ? [loadValidations()] : []),
    ...(document.getElementById('totalRevenue') ? [loadPayments()] : []),
    ...(document.getElementById('periodSelect') ? [loadStats()] : []),
    ...(document.getElementById('siteName') ? [loadSettings()] : []),
]).catch(e => console.warn('Admin init error:', e));
