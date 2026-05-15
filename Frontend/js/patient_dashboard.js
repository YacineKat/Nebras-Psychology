// ============================================
// PATIENT DASHBOARD - Fetch User Data & Appointments
// ============================================

let currentUser = null;

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
    await handleJoinCallRequest();
    
    if (typeof initPatientCallListener === 'function') {
        setTimeout(initPatientCallListener, 500);
    }
});

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

let currentVideoSession = null;

async function checkActiveVideoSession() {
    try {
        const response = await doctorAPI.getActiveVideoSession();
        if (response && response.activeSession) {
            const session = response.activeSession;
            const sessionSection = document.getElementById('activeSessionSection');
            const sessionName = document.getElementById('sessionPsychologistName');
            
            currentVideoSession = session;
            sessionName.textContent = `avec ${session.doctorName || 'votre psychologue'}`;
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
        const active = await doctorAPI.getActiveVideoSession();
        if (active?.activeSession) {
            showPatientVideoUI(active.activeSession);
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
                let animId = null;
                let resolved = false;

                function draw() {
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
                                animId: { current: animId },
                                offVideo
                            });
                        }
                    }
                    animId = requestAnimationFrame(draw);
                }
                draw();
            });
        };
    });
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
    cancelAnimationFrame(patientFlipAnimFrame?.current);
    patientFlipAnimFrame = null;
    if (patientFlipVideoEl) {
        patientFlipVideoEl.srcObject = null;
        if (document.body.contains(patientFlipVideoEl)) {
            document.body.removeChild(patientFlipVideoEl);
        }
        patientFlipVideoEl = null;
    }
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

window.togglePatientMute = togglePatientMute;
window.togglePatientVideo = togglePatientVideo;
window.leavePatientSession = leavePatientSession;
window.togglePatientChat = togglePatientChat;
window.sendPatientMessage = sendPatientMessage;
window.handlePatientChatKeyPress = handlePatientChatKeyPress;

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
        const response = await fetch('http://localhost:3000/api/messages/with/' + doctorId, {
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
        const response = await fetch('http://localhost:3000/api/messages', {
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