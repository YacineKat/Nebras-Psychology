// ============================================
// PATIENT DASHBOARD - Fetch User Data & Appointments
// ============================================

let currentUser = null;

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

    await loadAppointments();
    await loadUserProfile();
    highlightCurrentSidebarLink();
});

async function loadAppointments() {
    try {
        const appointments = await appointmentAPI.getAll();
        renderAppointments(appointments);
    } catch (error) {
        console.error('Error loading appointments:', error);
    }
}

async function loadUserProfile() {
    try {
        const result = await authAPI.getMe();
        if (result.user) {
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
            <div class="apt-date">${formatDate(apt.date)}</div>
            <div class="apt-info">
                <h4>${apt.doctorName || 'Psychologue'}</h4>
                <p>${apt.time} - ${apt.mediaType}</p>
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
        const appointments = await appointmentAPI.getAll();
        
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
        await authAPI.updateProfile(updateData);
        showToast('Vos préférences ont été enregistrées!', 'success');
        
        // Update localStorage
        const currentUser = getCurrentUser();
        if (currentUser) {
            currentUser.profile = { ...currentUser.profile, ...updateData };
            localStorage.setItem('nebras_user', JSON.stringify(currentUser));
        }
        
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
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;

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