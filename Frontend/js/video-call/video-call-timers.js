// ============================================
// VIDEO CALL TIMERS - Call duration and countdown
// ============================================


function updateCallDuration() {
    if (!callStartTime) return;
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    const durationEl = document.getElementById('callDuration');
    if (durationEl) {
        durationEl.textContent = `${minutes}:${seconds}`;
    }
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

function startDoctorCallTimer(durationMinutes) {
    if (!durationMinutes || durationMinutes <= 0) durationMinutes = 90;
    sessionEndTime = Date.now() + durationMinutes * 60 * 1000;
    updateDoctorCallDisplay();
    callTimerInterval = setInterval(updateDoctorCallDisplay, 1000);
}

function updateDoctorCallDisplay() {
    if (!sessionEndTime) return;
    const remaining = Math.max(0, Math.floor((sessionEndTime - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
    const seconds = (remaining % 60).toString().padStart(2, '0');
    const durationEl = document.getElementById('callDuration');
    if (durationEl) {
        durationEl.textContent = `${minutes}:${seconds}`;
        if (remaining <= 300) durationEl.style.color = '#ef4444';
    }
}
