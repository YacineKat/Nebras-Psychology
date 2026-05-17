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

// Rating deduplication — prevents showing the group rating modal more than once per session
function getSessionRatingKey(groupId, doctorId) {
    const user = getCurrentUser();
    const patientId = user?.id || 'unknown';
    return `group_rated_${groupId}_${doctorId}_${patientId}`;
}

function isSessionRated(groupId, doctorId) {
    return !!sessionStorage.getItem(getSessionRatingKey(groupId, doctorId));
}

function markSessionRated(groupId, doctorId) {
    sessionStorage.setItem(getSessionRatingKey(groupId, doctorId), '1');
}

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
        const token = localStorage.getItem('nebras_token');
        if (!token) return;

        sessionSocket = io(socketUrl, {
            transports: ['websocket', 'polling'],
            auth: { token },
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

        // Doctor accepted patient into the group call — show sidebar entry instead of instant redirect
        sessionSocket.on('group:join-accepted', (data) => {
            console.log('Group join accepted:', data);
            if (typeof showToast === 'function') {
                showToast('Vous avez été accepté dans le groupe ! Cliquez sur "Appel de groupe" dans le menu pour rejoindre.', 'success');
            }
            // Store session info
            sessionStorage.setItem('groupCallRoom', data.roomId);
            sessionStorage.setItem('groupCallGroupId', data.groupId);
            sessionStorage.setItem('groupCallDoctorId', data.doctorId);
            sessionStorage.setItem('groupCallDoctorName', data.doctorName || 'Psychologue');
            // Create sidebar entry (like one-to-one call UX)
            showGroupCallEntry(data);
        });

        // Doctor rejected patient's group join request
        sessionSocket.on('group:join-rejected', (data) => {
            console.log('Group join rejected:', data);
            if (typeof showToast === 'function') {
                showToast('Votre demande d\'adhésion au groupe a été refusée', 'error');
            }
            // Dispatch event so therapy page can update UI
            window.dispatchEvent(new CustomEvent('grouptherapy:data-changed', {
                detail: data
            }));
        });

        // Group session ended — doctor ended the group call
        sessionSocket.on('group:ended', (data) => {
            console.log('Group ended:', data);
            // Remove sidebar entry
            window.removeGroupCallEntry();
            // Save for rating modal — only if not already rated
            if (!isSessionRated(data.groupId, data.doctorId)) {
                try {
                    sessionStorage.setItem('pendingGroupRating', JSON.stringify({
                        doctorId: data.doctorId,
                        doctorName: data.doctorName || 'Psychologue',
                        groupId: data.groupId
                    }));
                } catch (e) {}
            }
            if (data.disconnect) {
                // If currently on the video-call page, the room-closed event handles cleanup
                // If on any other page, trigger cleanup via toast + custom event
                if (typeof showToast === 'function') {
                    showToast('La session de groupe est terminée', 'info');
                }
                // Clear any active group call state
                sessionStorage.removeItem('groupCallRoom');
                sessionStorage.removeItem('groupCallGroupId');
                sessionStorage.removeItem('groupCallDoctorId');
            }
            if (typeof handleGroupSessionEnded === 'function') {
                handleGroupSessionEnded(data);
            }
            window.dispatchEvent(new CustomEvent('grouptherapy:session-ended', {
                detail: data
            }));
        });

        // Group data changed — re-fetch groups on therapy page
        sessionSocket.on('group-data-changed', (data) => {
            console.log('Group data changed:', data);
            window.dispatchEvent(new CustomEvent('grouptherapy:data-changed', {
                detail: data
            }));
        });

        sessionSocket.on('disconnect', () => {
            console.log('Session socket disconnected');
        });

        sessionSocket.on('connect_error', (error) => {
            console.log('❌ Session socket connection error:', error.message);
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

// ========== GROUP CALL SIDEBAR ENTRY ==========
window.showGroupCallEntry = function(data) {
    let entry = document.getElementById('patientGroupCallEntry');
    if (entry) return;

    entry = document.createElement('div');
    entry.id = 'patientGroupCallEntry';
    entry.className = 'call-entry-sidebar';
    entry.setAttribute('role', 'button');
    entry.setAttribute('tabindex', '0');
    entry.setAttribute('data-room', data.roomId || '');
    entry.setAttribute('data-groupid', data.groupId || '');
    entry.setAttribute('data-doctorid', data.doctorId || '');
    entry.setAttribute('data-doctorname', data.doctorName || 'Psychologue');

    entry.innerHTML = `
        <div class="call-entry-icon" aria-hidden="true">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
        </div>
        <div class="call-entry-content">
            <span class="call-entry-title">Appel de groupe</span>
            <span class="call-entry-doctor">avec ${(data.doctorName || 'Psychologue').replace(/[<>&"]/g, function(c) { return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; })}</span>
        </div>
        <button class="call-entry-btn" type="button">Rejoindre</button>
    `;

    entry.addEventListener('click', function(event) {
        const btn = event.target.closest('.call-entry-btn');
        if (btn || event.currentTarget === event.target) {
            event.preventDefault();
            const roomId = entry.dataset.room;
            const groupId = entry.dataset.groupid;
            const doctorId = entry.dataset.doctorid;
            window.location.href = `video-call.html?room=${roomId}&type=group&groupId=${groupId}&doctorId=${doctorId}`;
        }
    });

    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        const firstItem = navMenu.querySelector('.nav-item');
        if (firstItem) {
            navMenu.insertBefore(entry, firstItem);
        } else {
            navMenu.appendChild(entry);
        }
    } else {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.appendChild(entry);
    }
};

window.removeGroupCallEntry = function() {
    const entry = document.getElementById('patientGroupCallEntry');
    if (entry) entry.remove();
};

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