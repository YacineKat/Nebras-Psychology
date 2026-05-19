// ============================================
// VIDEO CALL STATE - Shared state declarations
// ============================================
// STATE-ONLY module: no logic, no functions, no initialization code.
// All modules read/write these globals directly.

let currentUser = null;
let roomId = null;
let isDoctor = false;
let isGroupCall = false;
let groupId = null;
let sessionAppointmentId = null;
let chatPartnerId = null;
let callStartTime = null;
let callTimerInterval = null;
let lastRenderedChatSignature = null;
let renderedCallMessageIds = new Set();
let callMessagingSocket = null;
let callMessagingSocketBound = false;

// Media state
let localStream = null;
let isMuted = true;
let isVideoOff = true;

// Group call: multiple peer connections (indexed by socketId)
let peerConnections = {};
let otherParticipants = {};
let isEndingCall = false;
let doctorIdForRating = null;
let doctorNameForRating = null;

// Doctor group call state
let participantStates = {};
let sessionEndTime = null;
let isScreenSharing = false;
let originalVideoTrack = null;
let screenShareStream = null;
let doctorGroupDetails = null;

// Avatar images
let localAvatarUrl = null;
let remoteAvatarUrl = null;
let remoteVideoOff = true; // assume OFF until we know otherwise
let groupCallDuration = 90; // minutes, used to start countdown on first participant join

// Pre-fetched participant avatars for group calls: { [userId]: avatarUrl }
let participantAvatars = {};

// Doctor/counselor distinction
let isCounselor = false;

// P2P Connection
let peerConnection = null;
const videoServerUrl = window.APP_CONFIG.videoServerUrl;
let videoSocket = null;

// Other participant info
let otherParticipantId = null;
let otherParticipantName = null;
