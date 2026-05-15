// ============================================
// NEBRAS API SERVICE
// Connects frontend to backend APIs
// ============================================

window.API_URL = 'http://localhost:3000/api';

// ============================================
// HELPER FUNCTION
// ============================================
async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('nebras_token');
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ============================================
// AUTH API
// ============================================
const authAPI = {
  register: async (userData) => {
    return fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  login: async (credentials) => {
    return fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  getMe: async () => {
    return fetchAPI('/auth/me');
  },

  updateProfile: async (profileData) => {
    return fetchAPI('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  changePassword: async (passwordData) => {
    return fetchAPI('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(passwordData)
    });
  },

  logout: () => {
    localStorage.removeItem('nebras_token');
    localStorage.removeItem('nebras_user');
    window.location.href = 'home.html';
  }
};

// ============================================
// DOCTORS API
// ============================================
const doctorAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/doctors${queryString ? '?' + queryString : ''}`);
  },

  getById: async (id) => {
    return fetchAPI(`/doctors/${id}`);
  },

  getMyProfile: async () => {
    return fetchAPI('/doctors/profile/me');
  },

  updateProfile: async (profileData) => {
    return fetchAPI('/doctors/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  addTimeSlot: async (slotData) => {
    return fetchAPI('/doctors/schedule', {
      method: 'POST',
      body: JSON.stringify(slotData)
    });
  },

  getSchedule: async (startDate, endDate) => {
    const queryString = startDate && endDate ? `?startDate=${startDate}&endDate=${endDate}` : '';
    return fetchAPI(`/doctors/schedule${queryString}`);
  },

  deleteTimeSlot: async (slotId) => {
    return fetchAPI(`/doctors/schedule/${slotId}`, {
      method: 'DELETE'
    });
  },

  blockTimeSlot: async (slotData) => {
    return fetchAPI('/doctors/schedule/block', {
      method: 'POST',
      body: JSON.stringify(slotData)
    });
  },

  unblockTimeSlot: async (slotId) => {
    return fetchAPI(`/doctors/schedule/${slotId}/unblock`, {
      method: 'POST'
    });
  },

  getWeekAppointments: async (startDate, endDate) => {
    return fetchAPI(`/appointments?startDate=${startDate}&endDate=${endDate}`);
  },

  getDashboard: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/doctors/dashboard${queryString ? '?' + queryString : ''}`);
  },

  getPatients: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/doctors/patients${queryString ? '?' + queryString : ''}`);
  },

  getPatientById: async (patientId) => {
    return fetchAPI(`/doctors/patients/${patientId}`);
  },

  getHonoraires: async () => {
    return fetchAPI('/doctors/honoraires');
  },

  updateTarif: async (tarif) => {
    return fetchAPI('/doctors/tarif', {
      method: 'PUT',
      body: JSON.stringify({ tarif })
    });
  },

  getVipStatus: async () => {
    return fetchAPI('/doctors/vip');
  },

  activateVip: async (plan, ccpNumber) => {
    return fetchAPI('/doctors/vip/activate', {
      method: 'POST',
      body: JSON.stringify({ plan, ccpNumber })
    });
  },

  saveVipForm: async (formData) => {
    return fetchAPI('/doctors/vip/form', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
  },

  startVideoSession: async (appointmentId) => {
    return fetchAPI(`/appointments/${appointmentId}/video/start`, {
      method: 'POST'
    });
  },

  endVideoSession: async (appointmentId) => {
    return fetchAPI(`/appointments/${appointmentId}/video/end`, {
      method: 'POST'
    });
  },

  getActiveVideoSession: async () => {
    return fetchAPI('/appointments/video/active');
  },

  // Call state (real-time sync)
  startCallState: async (patientId, appointmentId) => {
    return fetchAPI('/appointments/call/start', {
      method: 'POST',
      body: JSON.stringify({ patientId, appointmentId })
    });
  },

  endCallState: async () => {
    return fetchAPI('/appointments/call/end', {
      method: 'POST'
    });
  },

  getCallStatus: async (doctorId) => {
    return fetchAPI(`/appointments/call/status/${doctorId}`);
  }
};

// ============================================
// APPOINTMENTS API
// ============================================
const appointmentAPI = {
  create: async (appointmentData) => {
    return fetchAPI('/appointments', {
      method: 'POST',
      body: JSON.stringify(appointmentData)
    });
  },

  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/appointments${queryString ? '?' + queryString : ''}`);
  },

  getById: async (id) => {
    return fetchAPI(`/appointments/${id}`);
  },

  updateStatus: async (id, statusData) => {
    return fetchAPI(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(statusData)
    });
  },

  cancel: async (id) => {
    return fetchAPI(`/appointments/${id}`, {
      method: 'DELETE'
    });
  },

  // Urgent requests
  createUrgent: async (doctorId, notes, appointmentTime) => {
    return fetchAPI('/appointments/urgent', {
      method: 'POST',
      body: JSON.stringify({ doctorId, notes, appointmentTime })
    });
  },

  getUrgentRequests: async () => {
    return fetchAPI('/appointments/urgent');
  },

  acceptUrgent: async (id) => {
    return fetchAPI(`/appointments/urgent/${id}/accept`, {
      method: 'PUT'
    });
  },

  rejectUrgent: async (id, reason) => {
    return fetchAPI(`/appointments/urgent/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason })
    });
  },

  // Urgent Access (7-day)
  getUrgentAccessStatus: async () => {
    return fetchAPI('/appointments/urgent/access');
  },

  activateUrgentAccess: async () => {
    return fetchAPI('/appointments/urgent/activate', {
      method: 'POST'
    });
  },

  completeUrgent: async (id) => {
    return fetchAPI(`/appointments/urgent/${id}/complete`, {
      method: 'PUT'
    });
  },

  // Call state (real-time sync)
  startCallState: async (patientId, appointmentId) => {
    return fetchAPI('/appointments/call/start', {
      method: 'POST',
      body: JSON.stringify({ patientId, appointmentId })
    });
  },

  endCallState: async () => {
    return fetchAPI('/appointments/call/end', {
      method: 'POST'
    });
  },

  getCallStatus: async (doctorId) => {
    return fetchAPI(`/appointments/call/status/${doctorId}`);
  },

  getMyCallStatus: async () => {
    return fetchAPI('/appointments/call/status');
  }
};

// ============================================
// MESSAGES API
// ============================================
const messageAPI = {
  send: async (receiverId, content) => {
    return fetchAPI('/messages', {
      method: 'POST',
      body: JSON.stringify({ receiverId, content })
    });
  },

  getConversations: async () => {
    return fetchAPI('/messages/conversations');
  },

  getWithUser: async (userId) => {
    return fetchAPI(`/messages/with/${userId}`);
  },

  getUnreadCount: async () => {
    return fetchAPI('/messages/unread');
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function isLoggedIn() {
  return !!localStorage.getItem('nebras_token');
}

function getCurrentUser() {
  const userStr = localStorage.getItem('nebras_user');
  return userStr ? JSON.parse(userStr) : null;
}

function getUserType() {
  const user = getCurrentUser();
  return user ? user.userType : null;
}

function redirectByUserType(userType) {
  switch (userType) {
    case 'patient':
      window.location.href = 'patient_dashboard.html';
      break;
    case 'psychologue':
      window.location.href = 'psychologue_dashboard.html';
      break;
    case 'counselor':
      window.location.href = 'counselor_dashboard.html';
      break;
    case 'admin':
      window.location.href = 'admin_dashboard.html';
      break;
    default:
      window.location.href = 'home.html';
  }
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeString) {
  return timeString;
}

const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Make all APIs available globally
window.authAPI = authAPI;
window.doctorAPI = doctorAPI;
window.appointmentAPI = appointmentAPI;
window.messageAPI = messageAPI;
window.isLoggedIn = isLoggedIn;
window.getCurrentUser = getCurrentUser;
window.getUserType = getUserType;
window.redirectByUserType = redirectByUserType;
window.formatDate = formatDate;
window.formatTime = formatTime;
window.daysOfWeek = daysOfWeek;

// ============================================
// COMMON: Load sidebar user data
// ============================================
async function loadSidebarUserData() {
  const user = getCurrentUser();
  if (!user) return;

  const shouldRefresh = !user.profile || user.profile.avatar === undefined;
  if (shouldRefresh) {
    try {
      const result = await authAPI.getMe();
      if (result.user) {
        localStorage.setItem('nebras_user', JSON.stringify(result.user));
      }
    } catch (e) {
      console.log('Using cached user data');
    }
  }

  // Get updated user data
  const updatedUser = getCurrentUser();
  if (!updatedUser) return;

  // Update user names
  document.querySelectorAll('.user-name').forEach(el => {
    el.textContent = updatedUser.fullname || updatedUser.email || '';
  });

  // Update avatars
  const avatars = document.querySelectorAll('.user-avatar');
  avatars.forEach(avatar => {
    const avatarUrl = updatedUser?.profile?.avatar;
    if (avatarUrl) {
      avatar.style.backgroundImage = `url(${avatarUrl})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      const initial = (updatedUser.fullname || updatedUser.email || 'U').charAt(0).toUpperCase();
      if (avatar.tagName === 'DIV') {
        avatar.textContent = initial;
        avatar.style.backgroundImage = '';
      }
    }
  });
}

// Auto-load sidebar data when api.js is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', loadSidebarUserData);
}
window.loadSidebarUserData = loadSidebarUserData;