// ============================================
// PATIENT CALL LISTENER (Shared across all patient pages)
// ============================================

window.PatientCallState = {
    currentDoctorId: null,
    activeCallData: null,
    callStatus: null
};

let callCheckInterval = null;
let lastCallActive = false;
let lastCallStatus = null;
let patientCallListenerInitialized = false;
let sessionSocket = null;
const callPollIntervalMs = 2000;
const socketUrl = 'http://localhost:3000';

function initPatientCallListener() {
    if (patientCallListenerInitialized) return;
    patientCallListenerInitialized = true;

    const userType = typeof getUserType === 'function'
        ? getUserType()
        : localStorage.getItem('userType');

    if (userType !== 'patient') return;

    // Initialize Socket.io for real-time updates
    initSessionSocket();

    // Keep polling as fallback
    startCallPolling();
    window.addEventListener('storage', handleStorageChange);

    checkCallStatus();
}

function initSessionSocket() {
    if (sessionSocket) return;

    const user = getCurrentUser();
    if (!user || !user.id) return;

    // Check if socket.io is available
    if (typeof io !== 'undefined') {
        sessionSocket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        sessionSocket.on('connect', () => {
            console.log('Session socket connected');
            // Join patient room for real-time events
            sessionSocket.emit('join-patient-room', user.id);
        });

        sessionSocket.on('session-started', (data) => {
            console.log('Real-time session started event:', data);
            // Update local state
            window.PatientCallState.currentDoctorId = data.doctorId;
            window.PatientCallState.activeCallData = data;
            localStorage.setItem('currentDoctorId', data.doctorId);
            
            // Trigger immediate UI update
            checkCallStatus();
        });

        sessionSocket.on('session-ended', (data) => {
            console.log('Real-time session ended event:', data);
            // Clear local state
            window.PatientCallState.currentDoctorId = null;
            window.PatientCallState.activeCallData = null;
            localStorage.removeItem('currentDoctorId');
            
            // Trigger immediate UI update
            if (lastCallActive) {
                handleCallEnded();
            }
            lastCallActive = false;
            lastCallStatus = null;
            
            const callEntry = document.getElementById('patientCallEntry');
            if (callEntry) {
                callEntry.remove();
            }
        });

        sessionSocket.on('disconnect', () => {
            console.log('Session socket disconnected');
        });

        sessionSocket.on('connect_error', (error) => {
            console.log('Session socket connection error:', error.message);
        });
    } else {
        console.log('Socket.io not available, using polling only');
    }
}

function startCallPolling() {
    if (callCheckInterval) clearInterval(callCheckInterval);
    callCheckInterval = setInterval(checkCallStatus, callPollIntervalMs);
}

function handleStorageChange(event) {
    if (event.key === 'doctorInCall' || event.key === 'currentCallAppointment' || event.key === 'nebras_user') {
        checkCallStatus();
    }
}

async function checkCallStatus() {
    try {
        let status = null;

        if (appointmentAPI?.getMyCallStatus) {
            status = await appointmentAPI.getMyCallStatus();
        } else if (appointmentAPI?.getCallStatus && window.PatientCallState.currentDoctorId) {
            status = await appointmentAPI.getCallStatus(window.PatientCallState.currentDoctorId);
        } else if (doctorAPI?.getCallStatus && window.PatientCallState.currentDoctorId) {
            status = await doctorAPI.getCallStatus(window.PatientCallState.currentDoctorId);
        }

        if (status) updateCallEntryUI(status);
    } catch (error) {
        console.log('Call status check failed');
    }
}

function updateCallEntryUI(status) {
    let callEntry = document.getElementById('patientCallEntry');
    
    if (status.inCall && status.appointmentId) {
        lastCallActive = true;
        lastCallStatus = status;

        if (status.doctorId) {
            window.PatientCallState.currentDoctorId = status.doctorId;
            localStorage.setItem('currentDoctorId', status.doctorId);
        }

        if (!callEntry) {
            callEntry = createCallEntryElement();
            insertCallEntry(callEntry);
        } else {
            ensureCallEntryMarkup(callEntry);
            attachCallEntryEvents(callEntry);
        }
        updateCallEntryContent(callEntry, status);
    } else {
        if (lastCallActive) {
            handleCallEnded();
        }
        if (callEntry) {
            callEntry.remove();
        }
        lastCallActive = false;
        window.PatientCallState.currentDoctorId = null;
        localStorage.removeItem('currentDoctorId');
    }
}

function createCallEntryElement() {
    const div = document.createElement('div');
    div.id = 'patientCallEntry';
    div.className = 'call-entry-sidebar';
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    ensureCallEntryMarkup(div);
    attachCallEntryEvents(div);
    return div;
}

function ensureCallEntryMarkup(callEntry) {
    const hasIcon = callEntry.querySelector('.call-entry-icon svg');
    if (hasIcon) return;

    callEntry.innerHTML = `
        <div class="call-entry-icon" aria-hidden="true">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
            </svg>
        </div>
        <div class="call-entry-content">
            <span class="call-entry-title">Appel en cours</span>
            <span class="call-entry-doctor">avec le Psychologue</span>
        </div>
        <button class="call-entry-btn" type="button">Rejoindre</button>
    `;
}

function attachCallEntryEvents(callEntry) {
    if (callEntry.dataset.bound === 'true') return;
    callEntry.dataset.bound = 'true';

    callEntry.addEventListener('click', function(event) {
        const btn = event.target.closest('.call-entry-btn');
        if (btn || event.currentTarget === event.target) {
            event.preventDefault();
            joinDoctorCall();
        }
    });

    callEntry.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            joinDoctorCall();
        }
    });
}

function insertCallEntry(callEntry) {
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        const firstItem = navMenu.querySelector('.nav-item');
        if (firstItem) {
            navMenu.insertBefore(callEntry, firstItem);
        } else {
            navMenu.appendChild(callEntry);
        }
        return;
    }

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.appendChild(callEntry);
}

function updateCallEntryContent(callEntry, status) {
    const doctorName = status.doctorName || 'le Psychologue';
    const doctorEl = callEntry.querySelector('.call-entry-doctor');
    if (doctorEl) {
        doctorEl.textContent = `avec ${doctorName}`;
    }
}

window.joinDoctorCall = async function() {
    try {
        let status = lastCallStatus;
        
        // Get current status from API
        if (!status || !status.inCall) {
            status = appointmentAPI?.getMyCallStatus
                ? await appointmentAPI.getMyCallStatus()
                : (window.PatientCallState.currentDoctorId && appointmentAPI?.getCallStatus)
                    ? await appointmentAPI.getCallStatus(window.PatientCallState.currentDoctorId)
                    : null;
        }

        if (status?.inCall && status.appointmentId) {
            // Redirect to dedicated video call page
            const roomId = status.appointmentId;
            window.location.href = `video-call.html?room=${roomId}&appointment=${status.appointmentId}&type=patient`;
            return;
        }

        if (typeof showToast === 'function') {
            showToast('La consultation n\'est plus disponible', 'error');
        }
    } catch (e) {
        console.log('Join call failed:', e);
        if (typeof showToast === 'function') {
            showToast('Impossible de rejoindre la consultation', 'error');
        }
    }
};

window.initPatientCallListener = initPatientCallListener;

function handleCallEnded() {
    if (typeof leavePatientSession === 'function') {
        leavePatientSession();
    }

    const activeSessionSection = document.getElementById('activeSessionSection');
    if (activeSessionSection) {
        activeSessionSection.style.display = 'none';
    }

    sessionStorage.removeItem('joinCall');
    sessionStorage.removeItem('joinCallDoctorId');

    if (typeof showToast === 'function') {
        showToast('La consultation est terminee', 'info');
    }

    lastCallStatus = null;
}

document.addEventListener('DOMContentLoaded', initPatientCallListener);

if (typeof module !== 'undefined') module.exports = { initPatientCallListener };