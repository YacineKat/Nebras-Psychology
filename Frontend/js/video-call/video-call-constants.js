// ============================================
// VIDEO CALL CONSTANTS - Event names, config, timeouts
// ============================================
// CONFIG-ONLY module: no logic, no functions, no state.

const SOCKET_EVENTS = {
    JOIN_ROOM: 'join-room',
    PARTICIPANT_JOINED: 'participant-joined',
    PARTICIPANT_LEFT: 'participant-left',
    PARTICIPANT_VIDEO_UPDATE: 'participant-video-update',
    PARTICIPANT_UPDATE: 'participant-update',
    P2P_OFFER: 'p2p-offer',
    P2P_ANSWER: 'p2p-answer',
    P2P_ICE_CANDIDATE: 'p2p-ice-candidate',
    CHAT_MESSAGE: 'chat-message',
    ROOM_CLOSED: 'room-closed',
    REMOVE_PARTICIPANT: 'remove-participant',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error'
};

const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];

const TIMEOUTS = {
    VIDEO_RECEIVER_FALLBACK: 3000,
    JOIN_REQUEST_EXPIRY: 60000,
    TILE_ENTER_ANIMATION: 350,
    TILE_EXIT_ANIMATION: 250,
    TOAST_DURATION: 3000,
    TOAST_FADE: 300,
    ERROR_REDIRECT_DELAY: 2000
};
