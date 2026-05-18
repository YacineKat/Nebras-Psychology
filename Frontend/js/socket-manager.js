// ============================================
// SOCKET.IO MANAGER - Real-time Notifications
// ============================================

let socket = null;
let socketConnected = false;
const socketCallbacks = {};

/**
 * Initialize socket connection with JWT authentication
 */
function initializeSocket() {
    if (socket && socketConnected) {
        console.log('[Socket] Already connected');
        return socket;
    }

    if (!window.API_URL) {
        console.warn('[Socket] API_URL not set, retrying in 500ms');
        setTimeout(initializeSocket, 500);
        return null;
    }

    const token = localStorage.getItem('nebras_token');
    if (!token) {
        console.warn('[Socket] No auth token found');
        return null;
    }

    // Extract base URL from API_URL (e.g., http://localhost:3000/api -> http://localhost:3000)
    const baseUrl = window.API_URL.split('/api')[0];
    
    socket = io(baseUrl, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling']
    });

    // Connection events
    socket.on('connect', () => {
        socketConnected = true;
        console.log('[Socket] Connected:', socket.id);
        triggerCallback('connect');
    });

    socket.on('disconnect', (reason) => {
        socketConnected = false;
        console.log('[Socket] Disconnected:', reason);
        triggerCallback('disconnect');
    });

    socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        triggerCallback('error', error);
    });

    // Urgent request event - for doctors/counselors
    socket.on('urgentRequestCreated', (data) => {
        console.log('[Socket] Urgent request received:', data);
        showToast(`📢 Demande URGENTE de ${data.patientName || 'patient'}!`, 'warning');
        
        // Call registered callbacks
        triggerCallback('urgentRequest', data);
        
        // Reload urgent requests if function exists
        if (typeof loadUrgentRequests === 'function') {
            loadUrgentRequests();
        }
    });

    // Appointment update event
    socket.on('appointmentUpdate', (data) => {
        console.log('[Socket] Appointment update:', data);
        triggerCallback('appointmentUpdate', data);
        
        // Reload dashboard if function exists
        if (typeof loadDashboardData === 'function') {
            loadDashboardData();
        }
    });

    // Call accepted/rejected event - for patients
    socket.on('callAccepted', (data) => {
        console.log('[Socket] Call accepted:', data);
        showToast(`✓ Votre demande a été acceptée par ${data.providerName}!`, 'success');
        triggerCallback('callAccepted', data);
    });

    socket.on('callRejected', (data) => {
        console.log('[Socket] Call rejected:', data);
        showToast(`✗ Votre demande a été refusée: ${data.reason}`, 'error');
        triggerCallback('callRejected', data);
    });

    // New message event
    socket.on('messageReceived', (data) => {
        console.log('[Socket] New message:', data);
        triggerCallback('message', data);
    });

    return socket;
}

/**
 * Register callback for socket events
 */
function onSocketEvent(eventName, callback) {
    if (!socketCallbacks[eventName]) {
        socketCallbacks[eventName] = [];
    }
    socketCallbacks[eventName].push(callback);
}

/**
 * Trigger all callbacks for an event
 */
function triggerCallback(eventName, data) {
    if (socketCallbacks[eventName]) {
        socketCallbacks[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[Socket] Callback error for ${eventName}:`, error);
            }
        });
    }
}

/**
 * Emit event to server
 */
function emitSocketEvent(eventName, data) {
    if (!socket || !socketConnected) {
        console.warn('[Socket] Not connected, cannot emit:', eventName);
        return false;
    }
    
    socket.emit(eventName, data);
    return true;
}

/**
 * Disconnect socket
 */
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socketConnected = false;
        console.log('[Socket] Disconnected');
    }
}

/**
 * Check if socket is connected
 */
function isSocketConnected() {
    return socketConnected;
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeSocket, 100);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    disconnectSocket();
});

// Expose globally
window.initializeSocket = initializeSocket;
window.onSocketEvent = onSocketEvent;
window.emitSocketEvent = emitSocketEvent;
window.disconnectSocket = disconnectSocket;
window.isSocketConnected = isSocketConnected;
