// ============================================
// PATIENT DASHBOARD - Fetch User Data & Appointments
// ============================================

let currentUser = null;
let activeProfileSummaryField = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'patient') {
        redirectByUserType(getUserType());
        return;
    }

    currentUser = getCurrentUser();
    if (currentUser) {
        document.querySelectorAll('.user-name').forEach(el => {
            el.textContent = currentUser.fullname || currentUser.email;
        });
    }

    // Load appointments and profile in parallel
    await Promise.all([
        loadAppointments(),
        loadUserProfile()
    ]);
    highlightCurrentSidebarLink();
    await handleJoinCallRequest();
    checkPendingRating();
    
    if (typeof initPatientCallListener === 'function') {
        setTimeout(initPatientCallListener, 500);
    }
});

async function loadUserProfile() {
    try {
        const result = await authAPI.getMe();
        if (result.user) {
            syncCurrentUserState(result.user);

            // fullname is in User table, not Profile
            const userFullname = result.user.fullname;
            if (userFullname) {
                const fullnameInput = document.getElementById('fullname');
                if (fullnameInput) fullnameInput.value = userFullname;
            }
            
            const profile = result.user.profile;
            if (!profile) return;
            if (profile.birthDate) {
                const ageInput = document.getElementById('age');
                if (ageInput) {
                    const birthYear = new Date(profile.birthDate).getFullYear();
                    ageInput.value = new Date().getFullYear() - birthYear;
                }
            }
            if (profile.gender) {
                const genderSelect = document.getElementById('gender');
                if (genderSelect) genderSelect.value = profile.gender;
            }
            if (profile.motifs) {
                const savedMotifs = profile.motifs.split(',');
                document.querySelectorAll('#motifsGrid input').forEach(cb => {
                    const span = cb.parentElement.querySelector('span');
                    if (span && savedMotifs.includes(span.innerText.trim())) {
                        cb.checked = true;
                    }
                });
            }
            if (profile.language) {
                const savedLangue = profile.language.toLowerCase().replace(/ /g, '_');
                const langRadio = document.querySelector(`input[name="langue"][value="${savedLangue}"]`);
                if (langRadio) langRadio.checked = true;
            }
            if (profile.prefGender) {
                const genderPref = document.getElementById('psychoGender');
                if (genderPref) genderPref.value = profile.prefGender;
            }
            if (profile.prefType) {
                const consultType = document.getElementById('consultType');
                if (consultType) consultType.value = profile.prefType;
            }

            renderPatientProfileSummary(result.user);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsContainer');
    if (!container) return;

    if (!appointments || appointments.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#666;">Aucun rendez-vous</p>';
        return;
    }

    container.innerHTML = appointments.map(apt => `
        <div class="apt-card">
            <div class="apt-date">${formatDate(apt.appointmentDate || apt.date)}</div>
            <div class="apt-info">
                <h4>${apt.doctorName || apt.doctor?.fullname || 'Psychologue'}</h4>
                <p>${(apt.appointmentTime || apt.time)} - ${apt.mediaType}</p>
            </div>
            <div class="apt-status ${apt.status}">${apt.status}</div>
        </div>
    `).join('');
}

// ============================================
// LOAD APPOINTMENTS
// ============================================

async function loadAppointments() {
    try {
        const appointments = await appointmentAPI.getAll({ view: 'summary' });

        renderAppointments(appointments);
        
        // Display appointments count
        const pendingCount = appointments.filter(a => a.status === 'pending').length;
        const confirmedCount = appointments.filter(a => a.status === 'confirmed').length;

        // Update badge if exists
        const badge = document.querySelector('.nav-item[href="patient_rendez_vous.html"] .badge');
        if (badge) {
            badge.textContent = appointments.length;
        }

        // Store for reference
        window.appointments = appointments;

    } catch (error) {
        console.error('Error loading appointments:', error);
    }
}

// ============================================
// SHOW BESOINS SECTION (Existing function)
// ============================================

async function showBesoinsSection() {
    document.getElementById('welcomeContent').style.display = 'none';
    document.getElementById('besoinsSection').style.display = 'block';
    generateMotifs();
    generateLangues();
    
    // Pre-fill with existing profile data
    await loadUserProfile();
    
    showStep(1);
}

// Motifs and Languages lists
const motifsList = [
    "Addictions", "Anxiété", "Confiance en soi", "Conseil en orientation",
    "Couple", "Deuil", "Dépression", "Famille", "Gestion des émotions",
    "Grossesse", "Handicap", "Isolement social", "Obligation de soins",
    "Pathologie physique", "Phobies", "Problèmes au travail",
    "Problèmes de communication", "Public enfants/ados", "Sexualité",
    "Sport", "Stress", "TDAH", "Traumatisme", "Troubles alimentation",
    "Troubles obsessionnels"
];

const languesList = [
    "Français", "Anglais", "Espagnol", "Arabe", "Russe",
    "Portugais", "Chinois", "Allemand", "Italien", "Roumain",
    "Polonais", "Turc", "Langue des Signes (LSF)"
];

const profileSummaryFields = [
    { key: 'fullname', label: 'Nom complet', type: 'text' },
    { key: 'age', label: 'Âge', type: 'number' },
    { key: 'gender', label: 'Genre', type: 'select', options: [
        { value: 'femme', label: 'Femme' },
        { value: 'homme', label: 'Homme' }
    ] },
    { key: 'motifs', label: 'Motifs de consultation', type: 'textarea' },
    { key: 'language', label: 'Langue préférée', type: 'select', options: languesList.map(langue => ({
        value: langue.toLowerCase().replace(/ /g, '_'),
        label: langue
    })) },
    { key: 'prefGender', label: 'Genre du psychologue', type: 'select', options: [
        { value: 'femme', label: 'Femme' },
        { value: 'homme', label: 'Homme' },
        { value: 'aucun', label: 'Peu importe' }
    ] },
    { key: 'prefType', label: 'Type de consultation', type: 'select', options: [
        { value: 'individuelle', label: 'Individuelle' },
        { value: 'plusieurs', label: 'À plusieurs' },
        { value: 'aucun', label: 'Peu importe' }
    ] }
];

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getAgeFromBirthDate(birthDate) {
    if (!birthDate) return '';
    const parsedDate = new Date(birthDate);
    if (Number.isNaN(parsedDate.getTime())) return '';

    const today = new Date();
    let age = today.getFullYear() - parsedDate.getFullYear();
    const monthDiff = today.getMonth() - parsedDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsedDate.getDate())) {
        age -= 1;
    }

    return age > 0 ? age : '';
}

function getGenderLabel(value) {
    if (value === 'femme') return 'Femme';
    if (value === 'homme') return 'Homme';
    return value || '';
}

function getLanguageLabel(value) {
    if (!value) return '';
    const normalizedValue = value.toLowerCase().replace(/ /g, '_');
    const matchedLanguage = languesList.find(langue => langue.toLowerCase().replace(/ /g, '_') === normalizedValue);
    return matchedLanguage || value;
}

function getPrefGenderLabel(value) {
    if (value === 'femme') return 'Femme';
    if (value === 'homme') return 'Homme';
    if (value === 'aucun') return 'Peu importe';
    return value || '';
}

function getPrefTypeLabel(value) {
    if (value === 'individuelle') return 'Individuelle';
    if (value === 'plusieurs') return 'À plusieurs';
    if (value === 'aucun') return 'Peu importe';
    return value || '';
}

function getProfileSummaryData(sourceUser = currentUser) {
    const profile = sourceUser?.profile || {};
    const motifs = profile.motifs ? profile.motifs.split(',').map(item => item.trim()).filter(Boolean) : [];

    return {
        fullname: sourceUser?.fullname || '',
        age: getAgeFromBirthDate(profile.birthDate),
        gender: profile.gender || '',
        motifs,
        language: profile.language || '',
        prefGender: profile.prefGender || '',
        prefType: profile.prefType || ''
    };
}

function hasProfileSummaryData(summaryData) {
    return Object.values(summaryData).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value));
}

function buildSelectOptions(options, currentValue) {
    return ['<option value="">Sélectionnez</option>', ...options.map(option => {
        const selected = option.value === currentValue ? ' selected' : '';
        return `<option value="${escapeHTML(option.value)}"${selected}>${escapeHTML(option.label)}</option>`;
    })].join('');
}

function renderSummaryValue(field, value) {
    if (Array.isArray(value)) {
        if (!value.length) {
            return '<span class="profile-summary-placeholder">Non renseigné</span>';
        }
        return `<div class="profile-summary-tags">${value.map(item => `<span class="profile-summary-tag">${escapeHTML(item)}</span>`).join('')}</div>`;
    }

    if (!value) {
        return '<span class="profile-summary-placeholder">Non renseigné</span>';
    }

    if (field === 'gender') return escapeHTML(getGenderLabel(value));
    if (field === 'language') return escapeHTML(getLanguageLabel(value));
    if (field === 'prefGender') return escapeHTML(getPrefGenderLabel(value));
    if (field === 'prefType') return escapeHTML(getPrefTypeLabel(value));

    return escapeHTML(value);
}

function renderSummaryEditor(field, value) {
    if (field === 'fullname') {
        return `<input class="profile-summary-field" type="text" data-profile-input value="${escapeHTML(value)}" placeholder="Votre nom complet">`;
    }

    if (field === 'age') {
        return `<input class="profile-summary-field" type="number" min="1" max="120" data-profile-input value="${escapeHTML(value)}" placeholder="Votre âge">`;
    }

    if (field === 'motifs') {
        return `<textarea class="profile-summary-field" data-profile-input placeholder="Séparez vos motifs par des virgules">${escapeHTML(Array.isArray(value) ? value.join(', ') : value)}</textarea>`;
    }

    const config = profileSummaryFields.find(item => item.key === field);
    const options = config?.options || [];
    return `<select class="profile-summary-field" data-profile-input>${buildSelectOptions(options, value)}</select>`;
}

function renderPatientProfileSummary(sourceUser = currentUser) {
    const card = document.getElementById('patientProfileSummaryCard');
    const container = document.getElementById('patientProfileSummary');
    if (!card || !container) return;

    const summaryData = getProfileSummaryData(sourceUser);
    if (!hasProfileSummaryData(summaryData)) {
        card.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    card.style.display = 'block';
    container.innerHTML = profileSummaryFields.map(field => {
        const value = summaryData[field.key];
        return `
            <div class="profile-summary-item" data-profile-field="${field.key}">
                <span class="profile-summary-label">${escapeHTML(field.label)}</span>
                <div class="profile-summary-view" data-profile-view>
                    <div class="profile-summary-value">${renderSummaryValue(field.key, value)}</div>
                    <button type="button" class="profile-summary-edit-btn" onclick="startProfileFieldEdit('${field.key}')">Modifier</button>
                </div>
                <div class="profile-summary-editor" data-profile-editor>
                    ${renderSummaryEditor(field.key, value)}
                    <div class="profile-summary-actions">
                        <button type="button" class="profile-summary-cancel-btn" onclick="cancelProfileFieldEdit('${field.key}')">Annuler</button>
                        <button type="button" class="profile-summary-save-btn" onclick="saveProfileFieldEdit('${field.key}')">Enregistrer</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (activeProfileSummaryField) {
        const activeField = container.querySelector(`[data-profile-field="${activeProfileSummaryField}"]`);
        if (activeField) {
            const activeView = activeField.querySelector('[data-profile-view]');
            const activeEditor = activeField.querySelector('[data-profile-editor]');
            if (activeView) activeView.style.display = 'none';
            if (activeEditor) activeEditor.classList.add('active');
        } else {
            activeProfileSummaryField = null;
        }
    }
}

function updateUserIdentityDisplay(user) {
    const displayName = user?.fullname || user?.email || '';
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = displayName;
    });

    const greetingTitle = document.getElementById('greetingTitle');
    if (greetingTitle) {
        greetingTitle.textContent = displayName ? `Bonjour, ${displayName}` : 'Bonjour';
    }
}

function syncCurrentUserState(updatedUser, updateData = {}) {
    const baseUser = updatedUser || currentUser || getCurrentUser() || {};
    const mergedUser = {
        ...baseUser,
        profile: {
            ...(currentUser?.profile || {}),
            ...(baseUser.profile || {})
        }
    };

    if (Object.prototype.hasOwnProperty.call(updateData, 'fullname')) {
        mergedUser.fullname = updateData.fullname;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'birthDate')) {
        mergedUser.profile.birthDate = updateData.birthDate;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'gender')) {
        mergedUser.profile.gender = updateData.gender;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'motifs')) {
        mergedUser.profile.motifs = updateData.motifs;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'language')) {
        mergedUser.profile.language = updateData.language;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'prefGender')) {
        mergedUser.profile.prefGender = updateData.prefGender;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'prefType')) {
        mergedUser.profile.prefType = updateData.prefType;
    }

    currentUser = mergedUser;
    localStorage.setItem('nebras_user', JSON.stringify(mergedUser));
    updateUserIdentityDisplay(mergedUser);
    renderPatientProfileSummary(mergedUser);
}

function startProfileFieldEdit(field) {
    if (activeProfileSummaryField && activeProfileSummaryField !== field) {
        closeProfileFieldEdit(activeProfileSummaryField);
    }

    const row = document.querySelector(`[data-profile-field="${field}"]`);
    if (!row) return;

    const view = row.querySelector('[data-profile-view]');
    const editor = row.querySelector('[data-profile-editor]');
    const input = row.querySelector('[data-profile-input]');

    if (view) view.style.display = 'none';
    if (editor) editor.classList.add('active');
    if (input) {
        input.focus();
        if (typeof input.select === 'function') {
            input.select();
        }
    }

    activeProfileSummaryField = field;
}

function closeProfileFieldEdit(field) {
    const row = document.querySelector(`[data-profile-field="${field}"]`);
    if (!row) return;

    const view = row.querySelector('[data-profile-view]');
    const editor = row.querySelector('[data-profile-editor]');
    if (view) view.style.display = 'flex';
    if (editor) editor.classList.remove('active');

    if (activeProfileSummaryField === field) {
        activeProfileSummaryField = null;
    }
}

async function saveProfileFieldEdit(field) {
    const row = document.querySelector(`[data-profile-field="${field}"]`);
    if (!row) return;

    const input = row.querySelector('[data-profile-input]');
    if (!input) return;

    let updateData = {};
    const rawValue = typeof input.value === 'string' ? input.value.trim() : input.value;

    if (field === 'fullname') {
        if (!rawValue) {
            showToast('Le nom complet est obligatoire', 'error');
            return;
        }
        updateData.fullname = rawValue;
    } else if (field === 'age') {
        const age = parseInt(rawValue, 10);
        if (!age || age < 1 || age > 120) {
            showToast('Veuillez saisir un âge valide', 'error');
            return;
        }
        updateData.birthDate = new Date(new Date().getFullYear() - age, 0, 1).toISOString();
    } else if (field === 'motifs') {
        const motifs = rawValue.split(',').map(item => item.trim()).filter(Boolean);
        updateData.motifs = motifs.length ? motifs.join(',') : null;
    } else if (field === 'language') {
        if (!rawValue) {
            showToast('Veuillez sélectionner une langue', 'error');
            return;
        }
        updateData.language = rawValue.replace(/_/g, ' ');
    } else if (field === 'gender') {
        if (!rawValue) {
            showToast('Veuillez sélectionner un genre', 'error');
            return;
        }
        updateData.gender = rawValue;
    } else if (field === 'prefGender') {
        if (!rawValue) {
            showToast('Veuillez sélectionner une préférence', 'error');
            return;
        }
        updateData.prefGender = rawValue;
    } else if (field === 'prefType') {
        if (!rawValue) {
            showToast('Veuillez sélectionner un type de consultation', 'error');
            return;
        }
        updateData.prefType = rawValue;
    }

    const saveBtn = row.querySelector('.profile-summary-save-btn');
    const originalText = saveBtn?.textContent || 'Enregistrer';
    if (saveBtn) {
        saveBtn.textContent = 'Enregistrement...';
        saveBtn.disabled = true;
    }

    try {
        const result = await authAPI.updateProfile(updateData);
        syncCurrentUserState(result?.user, updateData);
        closeProfileFieldEdit(field);
        showToast('Informations mises à jour', 'success');
    } catch (error) {
        console.error('Error updating profile field:', error);
        showToast('Erreur: ' + error.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
}

function generateMotifs() {
    const grid = document.getElementById('motifsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    motifsList.forEach(motif => {
        const label = document.createElement('label');
        label.className = 'checkbox-card';
        label.innerHTML = `<input type="checkbox" value="${motif.toLowerCase().replace(/ /g, '_')}"> <span>${motif}</span>`;
        grid.appendChild(label);
    });
}

function generateLangues() {
    const grid = document.getElementById('languesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    languesList.forEach(langue => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="langue" value="${langue.toLowerCase().replace(/ /g, '_')}"> ${langue}`;
        grid.appendChild(label);
    });
}

// Step navigation
let currentStep = 1;
const totalSteps = 8;
let userData = {};

function showStep(step) {
    for (let i = 1; i <= totalSteps; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) stepEl.classList.remove('active');
    }
    const currentStepEl = document.getElementById(`step${step}`);
    if (currentStepEl) currentStepEl.classList.add('active');
    currentStep = step;
    updateProgressIndicator(step);
}

function updateProgressIndicator(step) {
    const dots = document.querySelectorAll('.progress-dot');
    const lines = document.querySelectorAll('.progress-line');
    
    dots.forEach((dot) => {
        const stepNum = parseInt(dot.getAttribute('data-step'));
        dot.classList.remove('active', 'completed');
        if (stepNum === step) {
            dot.classList.add('active');
        } else if (stepNum < step) {
            dot.classList.add('completed');
        }
    });
    
    lines.forEach((line, index) => {
        line.classList.remove('completed');
        if (index < step - 1) {
            line.classList.add('completed');
        }
    });
}

function nextStep(step) {
    saveStepData(step);
    if (step < totalSteps) {
        showStep(step + 1);
    }
}

function prevStep(step) {
    if (step > 1) {
        showStep(step - 1);
    }
}

function saveStepData(step) {
    switch(step) {
        case 1:
            userData.fullname = document.getElementById('fullname')?.value;
            userData.age = document.getElementById('age')?.value;
            userData.gender = document.getElementById('gender')?.value;
            break;
        case 2:
            const selectedMotifs = [];
            document.querySelectorAll('#motifsGrid input:checked').forEach(cb => {
                const span = cb.parentElement.querySelector('span');
                selectedMotifs.push(span ? span.innerText : cb.value);
            });
            userData.motifs = selectedMotifs;
            break;
        case 3:
            const selectedMedia = document.querySelector('input[name="media"]:checked');
            userData.media = selectedMedia ? selectedMedia.value : null;
            break;
        case 4:
            userData.days = document.getElementById('days')?.value;
            userData.hours = document.getElementById('hours')?.value;
            break;
        case 5:
            const selectedLangue = document.querySelector('input[name="langue"]:checked');
            userData.langue = selectedLangue ? selectedLangue.value : null;
            break;
        case 6:
            userData.psychoGender = document.getElementById('psychoGender')?.value;
            userData.consultType = document.getElementById('consultType')?.value;
            break;
        case 7:
            userData.therapyType = document.getElementById('therapyType')?.value;
            updateRecap();
            break;
    }
}

function updateRecap() {
    const recapDiv = document.getElementById('recap');
    if (!recapDiv) return;
    
    recapDiv.innerHTML = `
        <div class="recap-item"><div class="recap-label">Nom complet :</div><div class="recap-value">${userData.fullname || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Âge :</div><div class="recap-value">${userData.age || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Genre :</div><div class="recap-value">${userData.gender || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Motifs :</div><div class="recap-value">${userData.motifs?.length ? userData.motifs.join(', ') : 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Média préféré :</div><div class="recap-value">${userData.media || 'Non renseigné'}</div></div>
    `;
}

async function submitNeeds() {
    saveStepData(7);
    
    const updateData = {
        fullname: userData.fullname,
        birthDate: userData.age ? new Date(new Date().getFullYear() - parseInt(userData.age), 0, 1).toISOString() : null,
        gender: userData.gender,
        motifs: userData.motifs ? userData.motifs.join(',') : null,
        language: userData.langue ? userData.langue.toLowerCase().replace(/_/g, ' ') : null,
        prefGender: userData.psychoGender,
        prefType: userData.consultType
    };
    
    const submitBtn = document.querySelector('.btn-submit');
    const originalText = submitBtn?.textContent || 'Trouver un psychologue';
    if (submitBtn) {
        submitBtn.textContent = 'Enregistrement...';
        submitBtn.disabled = true;
    }

    try {
        const result = await authAPI.updateProfile(updateData);
        syncCurrentUserState(result?.user, updateData);
        showToast('Vos préférences ont été enregistrées!', 'success');
        
        document.getElementById('besoinsSection').style.display = 'none';
        document.getElementById('welcomeContent').style.display = 'block';
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }
}

// Make functions available globally
window.showBesoinsSection = showBesoinsSection;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.submitNeeds = submitNeeds;
// highlightCurrentSidebarLink removed — use global from api.js
window.startProfileFieldEdit = startProfileFieldEdit;
window.cancelProfileFieldEdit = closeProfileFieldEdit;
window.saveProfileFieldEdit = saveProfileFieldEdit;

// Scroll persistence
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

let currentVideoSession = null;

async function checkActiveVideoSession() {
    try {
        const status = await appointmentAPI.getMyCallStatus();
        if (status?.inCall) {
            const sessionSection = document.getElementById('activeSessionSection');
            const sessionName = document.getElementById('sessionPsychologistName');
            
            currentVideoSession = status;
            sessionName.textContent = `avec ${status.doctorName || 'votre psychologue'}`;
            sessionSection.style.display = 'block';
        } else {
            const sessionSection = document.getElementById('activeSessionSection');
            if (sessionSection) sessionSection.style.display = 'none';
            currentVideoSession = null;
        }
    } catch (error) {
        console.log('No active video session');
    }
}

async function handleJoinCallRequest() {
    const params = new URLSearchParams(window.location.search);
    const joinCallId = params.get('joinCall') || sessionStorage.getItem('joinCall');
    const cachedDoctorId = sessionStorage.getItem('joinCallDoctorId');
    const cachedDoctorName = sessionStorage.getItem('joinCallDoctorName');

    if (!joinCallId) return;

    if (params.get('joinCall')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    sessionStorage.removeItem('joinCall');
    sessionStorage.removeItem('joinCallDoctorId');
    sessionStorage.removeItem('joinCallDoctorName');

    try {
        const status = await appointmentAPI.getMyCallStatus();
        if (status?.inCall && status.appointmentId === joinCallId) {
            showPatientVideoUI({
                id: status.appointmentId,
                doctorId: status.doctorId,
                doctorName: status.doctorName
            });
            return;
        }
    } catch (error) {
        console.log('Join call status check failed');
    }

    try {
        const status = await appointmentAPI.getMyCallStatus();
        if (status?.inCall) {
            showPatientVideoUI({
                id: status.appointmentId,
                doctorId: status.doctorId,
                doctorName: status.doctorName
            });
            return;
        }
    } catch (error) {
        console.log('Active session check failed');
    }

    if (cachedDoctorId || cachedDoctorName) {
        showPatientVideoUI({
            id: joinCallId,
            doctorId: cachedDoctorId,
            doctorName: cachedDoctorName || 'Psychologue'
        });
        return;
    }

    if (typeof showToast === 'function') {
        showToast('La consultation n\'est plus disponible', 'error');
    }
}

function joinVideoSession() {
    if (!currentVideoSession) return;
    // Redirect to dedicated video call page
    const roomId = currentVideoSession.id;
    window.location.href = `video-call.html?room=${roomId}&appointment=${roomId}&type=patient`;
}

function showPatientVideoUI(appointment) {
    let videoContainer = document.getElementById('patientVideoCall');
    if (!videoContainer) {
        videoContainer = document.createElement('div');
        videoContainer.id = 'patientVideoCall';
        videoContainer.className = 'video-call-container';
        document.querySelector('.main-content').appendChild(videoContainer);
    }

    const userName = currentUser?.fullname || 'Patient';
    const doctorInitial = appointment.doctorName ? appointment.doctorName.charAt(0).toUpperCase() : 'P';
    window.PatientCallState.currentDoctorId = appointment.doctorId;

    videoContainer.innerHTML = `
        <div class="video-main-section">
            <div id="speakerView" class="speaker-view">
                <div class="empty-state" id="doctorVideoPlaceholder" style="color: #9CA3AF; display: flex; flex-direction: column; align-items: center;">
                    <div class="video-avatar" style="width: 120px; height: 120px; border-radius: 50%; background: #E5E7EB; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #6B7280; margin-bottom: 15px;">${doctorInitial}</div>
                    <p style="margin-top: 15px; font-size: 16px;">Connexion en cours...</p>
                    <p style="font-size: 14px; opacity: 0.7; margin-top: 8px; color: #6B7280;">Psychologue: ${appointment.doctorName}</p>
                </div>
                <video id="doctorRemoteVideo" autoplay playsinline style="display: none; width: 100%; height: 100%; object-fit: cover; transform: none;"></video>
                <div id="speakerBadge" class="speaker-badge" style="display: none;">
                    <div class="speaking-indicator"></div>
                    <span id="currentSpeakerName">${appointment.doctorName}</span>
                </div>
            </div>
            <div id="thumbnailGrid" class="thumbnail-section">
                <div id="localVideoContainer" class="thumbnail-video mirrored active">
                    <div id="localVideoPlaceholder" class="video-avatar" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #F3F4F6; font-size: 32px; color: #6B7280;">${userName.charAt(0).toUpperCase()}</div>
                    <video id="patientLocalVideo" autoplay muted playsinline style="display: none;"></video>
                    <div class="thumbnail-info">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/></svg>
                        <span id="localName">${userName}</span>
                    </div>
                    <div id="localMuteIndicator" class="thumbnail-badge muted">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>
                    </div>
                    <div id="localVideoOffIndicator" class="thumbnail-badge video-off">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg>
                    </div>
                </div>
            </div>
        </div>
        <div id="patientChatSection" class="chat-section" style="display: none; width: 350px; border-left: 1px solid #E5E7EB;">
            <div class="chat-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#44AA99" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Chat
                </h3>
            </div>
            <div id="patientMessagesContainer" class="messages-container scrollbar"></div>
            <div class="chat-input-container">
                <div class="emoji-btn">
                    <button onclick="togglePatientEmojiPicker()" class="chat-header-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>
                    <div id="patientEmojiPicker" class="emoji-picker" style="display: none;">
                        <span class="emoji-item" onclick="insertPatientEmoji('😀')">😀</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('😂')">😂</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('🥰')">🥰</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('😔')">😔</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('😎')">😎</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('🤔')">🤔</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('👍')">👍</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('👎')">👎</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('👏')">👏</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('❤️')">❤️</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('👋')">👋</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('🙏')">🙏</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('✅')">✅</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('❌')">❌</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('💡')">💡</span>
                        <span class="emoji-item" onclick="insertPatientEmoji('🎉')">🎉</span>
                    </div>
                </div>
                <input type="text" id="patientChatInput" class="chat-input" placeholder="Écrire un message..." onkeypress="handlePatientChatKeyPress(event)">
                <button onclick="sendPatientMessage()" id="patientSendBtn" class="send-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
        </div>
        <div class="controls-bar">
            <button onclick="togglePatientMute()" id="muteBtn" class="control-btn" title="Activer le micro">
                <svg id="muteIcon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button onclick="togglePatientVideo()" id="videoBtn" class="control-btn" title="Activer la caméra">
                <svg id="videoIcon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </button>
            <button onclick="togglePatientChat()" id="chatToggleBtn" class="control-btn" title="Ouvrir le chat">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
            <div class="control-separator"></div>
            <button onclick="leavePatientSession()" id="endCallBtn" class="control-btn end-call">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Quitter
            </button>
        </div>
    `;

    videoContainer.style.display = 'flex';
    initPatientCall(appointment);
    loadPatientChatHistory(window.PatientCallState.currentDoctorId);
}

let patientStream = null;
let patientFlippedVideoTrack = null;
let patientFlippedStream = null;
let patientFlipAnimFrame = null;
let patientFlipVideoEl = null;
let patientFlipCanvas = null;
let patientFlipCtx = null;
let patientFlipDrawFn = null;

// Visibility handling
let patientVisibilityHandler = null;
let patientIsLeaving = false;

async function buildFlippedTrack(rawVideoTrack) {
    return new Promise((resolve) => {
        const trackSettings = rawVideoTrack.getSettings();
        const W = trackSettings.width || 640;
        const H = trackSettings.height || 480;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        const offVideo = document.createElement('video');
        offVideo.muted = true;
        offVideo.playsInline = true;
        offVideo.srcObject = new MediaStream([rawVideoTrack]);
        offVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:-9999px';
        document.body.appendChild(offVideo);

        offVideo.onloadedmetadata = () => {
            if (offVideo.videoWidth > 0) {
                canvas.width = offVideo.videoWidth;
                canvas.height = offVideo.videoHeight;
            }

            offVideo.play().then(() => {
                const animRef = { current: null };
                let resolved = false;

                const draw = () => {
                    if (offVideo.readyState >= 2 && offVideo.videoWidth > 0) {
                        if (canvas.width !== offVideo.videoWidth) {
                            canvas.width = offVideo.videoWidth;
                            canvas.height = offVideo.videoHeight;
                        }
                        ctx.save();
                        ctx.translate(canvas.width, 0);
                        ctx.scale(-1, 1);
                        ctx.drawImage(offVideo, 0, 0, canvas.width, canvas.height);
                        ctx.restore();

                        if (!resolved) {
                            resolved = true;
                            const flippedStream = canvas.captureStream(30);
                            resolve({
                                flippedTrack: flippedStream.getVideoTracks()[0],
                                flippedStream,
                                animId: animRef,
                                offVideo,
                                canvas,
                                ctx,
                                drawFn: draw
                            });
                        }
                    }
                    animRef.current = requestAnimationFrame(draw);
                };
                draw();
            });
        };
    });
}
function setupPatientVisibilityHandler() {
    if (patientVisibilityHandler) return;
    patientVisibilityHandler = () => {
        if (document.hidden) {
            if (patientFlipAnimFrame?.current) {
                cancelAnimationFrame(patientFlipAnimFrame.current);
                patientFlipAnimFrame.current = null;
            }
        } else {
            if (patientFlipVideoEl && patientFlipDrawFn && patientFlipAnimFrame && !patientFlipAnimFrame.current) {
                patientFlipVideoEl.play().then(() => {
                    if (!document.hidden && patientFlipAnimFrame && !patientFlipAnimFrame.current) {
                        patientFlipDrawFn();
                    }
                }).catch(() => {});
            }
        }
    };
    document.addEventListener('visibilitychange', patientVisibilityHandler);
}

let patientIsMuted = true;
let patientIsVideoOff = true;

async function initPatientCall(appointment) {
    try {
        patientStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Canvas-based horizontal flip for raw track data
        const rawVideoTrack = patientStream.getVideoTracks()[0];
        const flipResult = await buildFlippedTrack(rawVideoTrack);
        patientFlippedVideoTrack = flipResult.flippedTrack;
        patientFlippedStream = flipResult.flippedStream;
        patientFlipAnimFrame = flipResult.animId;
        patientFlipVideoEl = flipResult.offVideo;
        patientFlipCanvas = flipResult.canvas;
        patientFlipCtx = flipResult.ctx;
        patientFlipDrawFn = flipResult.drawFn;
        
        // Attach original stream to local video element for preview
        const videoEl = document.getElementById('patientLocalVideo');
        if (videoEl) {
            videoEl.srcObject = patientStream;
            videoEl.style.transform = 'scaleX(-1)';
        }
        
        rawVideoTrack.enabled = false;
        patientStream.getAudioTracks()[0].enabled = false;
        
        patientIsMuted = true;
        patientIsVideoOff = true;
        
        document.getElementById('localMuteIndicator').style.display = 'flex';
        document.getElementById('localVideoOffIndicator').style.display = 'flex';
        document.getElementById('muteBtn').style.background = '#e74c3c';
        document.getElementById('videoBtn').style.background = '#e74c3c';
        document.getElementById('muteIcon').innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        document.getElementById('videoIcon').innerHTML = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';
        
        window.patientFlippedStream = patientFlippedStream;
        window.patientFlippedVideoTrack = patientFlippedVideoTrack;
        
        setupPatientVisibilityHandler();
    } catch (err) {
        console.error('Error accessing media devices:', err);
    }
}

function togglePatientMute() {
    if (!patientStream) return;
    
    const audioTrack = patientStream.getAudioTracks()[0];
    if (!audioTrack) return;
    
    patientIsMuted = !patientIsMuted;
    audioTrack.enabled = !patientIsMuted;
    
    const btn = document.getElementById('muteBtn');
    const icon = document.getElementById('muteIcon');
    const indicator = document.getElementById('localMuteIndicator');
    
    if (patientIsMuted) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
        indicator.style.display = 'flex';
    } else {
        btn.style.background = '';
        icon.innerHTML = '<path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>';
        indicator.style.display = 'none';
    }
}

function togglePatientVideo() {
    if (!patientStream) return;
    
    const videoTrack = patientStream.getVideoTracks()[0];
    if (!videoTrack) return;
    
    patientIsVideoOff = !patientIsVideoOff;
    videoTrack.enabled = !patientIsVideoOff;
    
    const videoEl = document.getElementById('patientLocalVideo');
    const placeholder = document.getElementById('localVideoPlaceholder');
    const btn = document.getElementById('videoBtn');
    const icon = document.getElementById('videoIcon');
    const indicator = document.getElementById('localVideoOffIndicator');
    
    if (patientIsVideoOff) {
        btn.style.background = '#e74c3c';
        icon.innerHTML = '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>';
        indicator.style.display = 'flex';
        if (videoEl && placeholder) {
            videoEl.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    } else {
        btn.style.background = '';
        icon.innerHTML = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>';
        indicator.style.display = 'none';
        if (videoEl && placeholder) {
            videoEl.style.display = 'block';
            placeholder.style.display = 'none';
        }
    }
}

function leavePatientSession() {
    if (patientIsLeaving) return;
    patientIsLeaving = true;
    
    if (patientVisibilityHandler) {
        document.removeEventListener('visibilitychange', patientVisibilityHandler);
        patientVisibilityHandler = null;
    }
    
    cancelAnimationFrame(patientFlipAnimFrame?.current);
    patientFlipAnimFrame = null;
    if (patientFlipVideoEl) {
        patientFlipVideoEl.srcObject = null;
        if (document.body.contains(patientFlipVideoEl)) {
            document.body.removeChild(patientFlipVideoEl);
        }
        patientFlipVideoEl = null;
    }
    patientFlipCanvas = null;
    patientFlipCtx = null;
    patientFlipDrawFn = null;
    patientFlippedVideoTrack = null;
    patientFlippedStream = null;
    
    if (patientStream) {
        patientStream.getTracks().forEach(track => track.stop());
        patientStream = null;
    }
    const videoContainer = document.getElementById('patientVideoCall');
    if (videoContainer) {
        videoContainer.style.display = 'none';
        videoContainer.remove();
    }
}

function togglePatientChat() {
    const chatSection = document.getElementById('patientChatSection');
    const btn = document.getElementById('chatToggleBtn');
    if (chatSection.style.display === 'none') {
        chatSection.style.display = 'flex';
        btn.classList.add('active');
    } else {
        chatSection.style.display = 'none';
        btn.classList.remove('active');
    }
}

async function loadPatientChatHistory(doctorId) {
    try {
        const response = await fetch(window.API_URL + '/messages/with/' + doctorId, {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('nebras_token') }
        });
        const messages = await response.json();
        const container = document.getElementById('patientMessagesContainer');
        if (!container) return;
        
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div class="no-messages" style="text-align: center; padding: 20px; color: #9CA3AF;">Aucun message</div>';
            return;
        }
        
        container.innerHTML = messages.map(msg => `
            <div class="message ${msg.senderId === currentUser.id ? 'sent' : 'received'}">
                <div class="message-content">${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                <div class="message-time">${new Date(msg.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('Error loading chat history:', e);
    }
}

async function sendPatientMessage() {
    const input = document.getElementById('patientChatInput');
    const content = input?.value.trim();
    if (!content || !window.PatientCallState.currentDoctorId) return;
    
    try {
        const response = await fetch(window.API_URL + '/messages', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('nebras_token'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                receiverId: window.PatientCallState.currentDoctorId,
                content: content
            })
        });
        
        if (response.ok) {
            input.value = '';
            loadPatientChatHistory(window.PatientCallState.currentDoctorId);
        }
    } catch (e) {
        console.error('Error sending message:', e);
    }
}

function handlePatientChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendPatientMessage();
    }
}

window.togglePatientMute = togglePatientMute;
window.togglePatientVideo = togglePatientVideo;
window.leavePatientSession = leavePatientSession;
window.togglePatientChat = togglePatientChat;
window.sendPatientMessage = sendPatientMessage;
window.handlePatientChatKeyPress = handlePatientChatKeyPress;
window.togglePatientEmojiPicker = togglePatientEmojiPicker;
window.insertPatientEmoji = insertPatientEmoji;

function togglePatientEmojiPicker() {
    const picker = document.getElementById('patientEmojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'grid' : 'none';
}

function insertPatientEmoji(emoji) {
    const input = document.getElementById('patientChatInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    document.getElementById('patientEmojiPicker').style.display = 'none';
}

// ============================================
// PENDING RATING ON TAB CLOSE
// ============================================
function checkPendingRating() {
    let pending = null;
    try {
        const raw = sessionStorage.getItem('pendingRating');
        if (raw) pending = JSON.parse(raw);
    } catch (e) {}

    if (!pending || !pending.appointmentId || !pending.doctorId) return;

    sessionStorage.removeItem('pendingRating');

    const modal = document.createElement('div');
    modal.id = 'pendingRatingModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

    let selected = 0;

    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:32px;width:420px;max-width:90%;text-align:center;animation:fadeInUp 0.3s ease;box-shadow:0 25px 60px rgba(0,0,0,0.2);">
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#44AA99 0%,#3d9a8b 100%);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </div>
            <h3 style="margin:0 0 4px;color:#091346;font-size:20px;">Évaluer la consultation</h3>
            <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Notez votre séance avec ${pending.doctorName || 'le psychologue'}</p>
            <div style="display:flex;justify-content:center;gap:6px;margin-bottom:20px;" id="pendingRatingStars">
                ${[1,2,3,4,5].map(i => `
                    <button type="button" data-ps="${i}" style="background:none;border:none;cursor:pointer;padding:4px;font-size:36px;line-height:1;color:#d1d5db;transition:color 0.15s,transform 0.15s;" onmouseenter="document.querySelectorAll('[data-ps]').forEach(b=>b.style.color=b.dataset.ps<=${i}?'#f59e0b':'#d1d5db');document.querySelectorAll('[data-ps]').forEach(b=>b.style.transform=b.dataset.ps<=${i}?'scale(1.15)':'scale(1)')" onmouseleave="document.querySelectorAll('[data-ps]').forEach(b=>b.style.color=b.dataset.ps<=selected?'#f59e0b':'#d1d5db');document.querySelectorAll('[data-ps]').forEach(b=>b.style.transform=b.dataset.ps<=selected?'scale(1.15)':'scale(1)')" onclick="selected=${i};document.querySelectorAll('[data-ps]').forEach(b=>b.style.color=b.dataset.ps<=${i}?'#f59e0b':'#d1d5db');document.querySelectorAll('[data-ps]').forEach(b=>b.style.transform=b.dataset.ps<=${i}?'scale(1.15)':'scale(1)');document.getElementById('pendingSubmitBtn').disabled=false;document.getElementById('pendingSubmitBtn').style.opacity='1'">★</button>
                `).join('')}
            </div>
            <textarea id="pendingComment" placeholder="Partagez votre expérience (optionnel)" style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:12px;font-size:14px;font-family:inherit;resize:none;height:80px;box-sizing:border-box;margin-bottom:16px;"></textarea>
            <button id="pendingSubmitBtn" onclick="(async()=>{const btn=document.getElementById('pendingSubmitBtn');if(!btn)return;btn.disabled=true;btn.textContent='Envoi...';try{await reviewAPI.create({doctorId:'${pending.doctorId}',appointmentId:'${pending.appointmentId}',rating:selected,comment:document.getElementById('pendingComment')?.value?.trim()||undefined});document.getElementById('pendingRatingModal')?.remove();}catch(e){btn.disabled=false;btn.textContent='Envoyer la note';if(e.message&&e.message.includes('déjà')){document.getElementById('pendingRatingModal')?.remove();return}showToast('Erreur','error')}})()" style="width:100%;padding:14px;background:linear-gradient(135deg,#44AA99 0%,#3d9a8b 100%);color:white;border:none;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;opacity:0.5;" disabled>Envoyer la note</button>
            <button onclick="document.getElementById('pendingRatingModal')?.remove()" style="background:none;border:none;color:#94a3b8;font-size:13px;cursor:pointer;margin-top:12px;padding:8px;text-decoration:underline;text-underline-offset:3px;">Passer</button>
        </div>
    `;

    document.body.appendChild(modal);
}

setTimeout(function() {
    if (typeof initPatientCallListener === 'function') {
        initPatientCallListener();
    }
    const greetingTitle = document.getElementById('greetingTitle');
    if (greetingTitle) {
        const user = getCurrentUser();
        if (user) greetingTitle.textContent = 'Bonjour, ' + (user.fullname || '');
    }
}, 500);