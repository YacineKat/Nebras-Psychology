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

  getSchedule: async () => {
    return fetchAPI('/doctors/schedule');
  },

  getDashboard: async () => {
    return fetchAPI('/doctors/dashboard');
  },

  getPatients: async () => {
    return fetchAPI('/doctors/patients');
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

  getAll: async () => {
    return fetchAPI('/appointments');
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
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR');
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

  // Try to get fresh user data from API to ensure we have latest profile/avatar
  try {
    const result = await authAPI.getMe();
    if (result.user) {
      localStorage.setItem('nebras_user', JSON.stringify(result.user));
    }
  } catch (e) {
    console.log('Using cached user data');
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