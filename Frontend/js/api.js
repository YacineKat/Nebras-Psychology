// ============================================
// NEBRAS API SERVICE
// Connects frontend to backend APIs
// ============================================

window.API_URL = 'http://localhost:3000/api';

function setApiBaseUrl(url) {
  window.API_URL = url.replace(/\/+$/, '') + '/api';
}

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
      // Centralized 401 handling: clear broken auth and redirect to login
      if (response.status === 401 && endpoint !== '/auth/login') {
        localStorage.removeItem('nebras_token');
        localStorage.removeItem('nebras_user');
        if (!window.location.pathname.includes('auth.html')) {
          window.location.href = 'auth.html';
        }
      }
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

  getAvailability: async (doctorId, date) => {
    const queryString = date ? `?date=${encodeURIComponent(date)}` : '';
    return fetchAPI(`/doctors/${doctorId}/availability${queryString}`);
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
      method: 'PUT'
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

  getPatientNote: async (patientId) => {
    return fetchAPI(`/doctors/patients/${patientId}/notes`);
  },

  savePatientNote: async (patientId, content) => {
    return fetchAPI(`/doctors/patients/${patientId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
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

  getCallStatus: async (doctorId) => {
    return fetchAPI(`/appointments/call/status/${doctorId}`);
  },

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
  },

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
// MESSAGING SOCKET
// ============================================
const messagingSocketUrl = window.API_URL.replace('/api', '');
let messagingSocket = null;

function connectMessagingSocket() {
  if (messagingSocket && messagingSocket.connected) {
    return messagingSocket;
  }

  if (typeof io === 'undefined') {
    return null;
  }

  const token = localStorage.getItem('nebras_token');
  if (!token) {
    return null;
  }

  if (!messagingSocket) {
    messagingSocket = io(messagingSocketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  } else {
    messagingSocket.auth = { token };
    if (!messagingSocket.connected) {
      messagingSocket.connect();
    }
  }

  return messagingSocket;
}

function disconnectMessagingSocket() {
  if (!messagingSocket) return;
  messagingSocket.disconnect();
  messagingSocket = null;
}

function getMessagingSocket() {
  return messagingSocket;
}

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


// ============================================
// CENTRALIZED UI HELPERS
// ============================================
function showToast(message, type = 'success') {
  const container = document.querySelector('.toast-container') || (() => {
    const c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  })();
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function logout() {
  localStorage.removeItem('nebras_token');
  localStorage.removeItem('nebras_user');
  showToast('Déconnexion réussie', 'success');
  setTimeout(() => window.location.href = 'home.html', 500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getMediaLabel(mediaType) {
  const labels = { video: 'Vidéo', phone: 'Téléphone', chat: 'Chat' };
  return labels[mediaType] || mediaType;
}

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

function ensureMobileNavStyles() {
  if (document.getElementById('mobile-nav-enhancer-style')) return;

  const style = document.createElement('style');
  style.id = 'mobile-nav-enhancer-style';
  style.textContent = `
    @media (max-width: 900px) {
      .nav-item.nav-item-secondary {
        display: none !important;
      }

      .nav-item.mobile-more-trigger,
      .nav-item.mobile-profile-shortcut {
        min-width: 74px;
      }

      .nav-item.mobile-more-trigger {
        border: none !important;
        outline: none !important;
        background: transparent !important;
        font-family: inherit !important;
        font-size: inherit !important;
        cursor: pointer !important;
        -webkit-tap-highlight-color: transparent !important;
        user-select: none !important;
        -webkit-appearance: none !important;
        box-shadow: none !important;
      }

      .nav-item.mobile-more-trigger:focus,
      .nav-item.mobile-more-trigger:focus-visible {
        outline: none !important;
        box-shadow: none !important;
      }

      .nav-item.mobile-more-trigger::-moz-focus-inner {
        border: none !important;
      }

      .mobile-more-sheet {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 98px;
        max-height: 52dvh;
        background: white;
        border-radius: 18px;
        padding: 12px;
        box-shadow: 0 18px 40px rgba(9, 19, 70, 0.2);
        overflow-y: auto;
        z-index: 1010;
        transform: translateY(18px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.2s ease, opacity 0.2s ease;
      }

      .mobile-more-sheet.active {
        transform: translateY(0);
        opacity: 1;
        pointer-events: auto;
      }

      .mobile-more-sheet a,
      .mobile-more-sheet button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: none;
        background: #f8fafc;
        color: #091346;
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 8px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .mobile-more-sheet a:last-child,
      .mobile-more-sheet button:last-child {
        margin-bottom: 0;
      }

      .mobile-more-overlay {
        position: fixed;
        inset: 0;
        background: rgba(9, 19, 70, 0.22);
        z-index: 1009;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      .mobile-more-overlay.active {
        opacity: 1;
        pointer-events: auto;
      }
    }
  `;

  document.head.appendChild(style);
}

function closeMobileMoreSheet() {
  const sheet = document.querySelector('.mobile-more-sheet');
  const overlay = document.querySelector('.mobile-more-overlay');
  if (sheet) sheet.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

function initializeMobileBottomNav() {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const navMenu = document.querySelector('.sidebar .nav-menu');
  if (!navMenu) return;

  ensureMobileNavStyles();

  let overlay = document.querySelector('.mobile-more-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'mobile-more-overlay';
    overlay.addEventListener('click', closeMobileMoreSheet);
    document.body.appendChild(overlay);
  }

  let sheet = document.querySelector('.mobile-more-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'mobile-more-sheet';
    document.body.appendChild(sheet);
  }

  const existingProfileShortcut = navMenu.querySelector('.mobile-profile-shortcut');
  if (!isMobile) {
    navMenu.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.remove('nav-item-secondary');
    });
    if (existingProfileShortcut) existingProfileShortcut.remove();
    const trigger = navMenu.querySelector('.mobile-more-trigger');
    if (trigger) trigger.remove();
    closeMobileMoreSheet();
    return;
  }

  const navItems = Array.from(navMenu.querySelectorAll('.nav-item:not(.mobile-more-trigger):not(.mobile-profile-shortcut)'));
  if (!navItems.length) return;

  const dashboardItem = navItems.find((item) => (item.getAttribute('href') || '').toLowerCase().includes('dashboard'));
  const chatItem = navItems.find((item) => (item.getAttribute('href') || '').toLowerCase().includes('messagerie'));

  let profileItem = navItems.find((item) => {
    const href = (item.getAttribute('href') || '').toLowerCase();
    return href.includes('profil') || href === 'admin.html';
  });

  if (!profileItem) {
    const profileLink = document.querySelector('.profile-link[href]');
    if (profileLink && !existingProfileShortcut) {
      const profileShortcut = document.createElement('a');
      profileShortcut.className = 'nav-item mobile-profile-shortcut';
      profileShortcut.href = profileLink.getAttribute('href');
      profileShortcut.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg><span>Profil</span>';
      navMenu.appendChild(profileShortcut);
      profileItem = profileShortcut;
    } else if (existingProfileShortcut) {
      profileItem = existingProfileShortcut;
    }
  }

  const primary = [];
  if (dashboardItem) primary.push(dashboardItem);
  if (chatItem && !primary.includes(chatItem)) primary.push(chatItem);
  if (profileItem && !primary.includes(profileItem)) primary.push(profileItem);

  navItems.forEach((item) => {
    if (primary.includes(item)) {
      item.classList.remove('nav-item-secondary');
    } else {
      item.classList.add('nav-item-secondary');
    }
  });

  if (profileItem) {
    profileItem.classList.remove('nav-item-secondary');
  }

  const secondaryItems = navItems.filter((item) => !primary.includes(item));

  let trigger = navMenu.querySelector('.mobile-more-trigger');
  if (secondaryItems.length) {
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'nav-item mobile-more-trigger';
      trigger.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Plus</span>';
      trigger.addEventListener('click', () => {
        const willOpen = !sheet.classList.contains('active');
        sheet.classList.toggle('active', willOpen);
        overlay.classList.toggle('active', willOpen);
      });
      navMenu.appendChild(trigger);
    }

    const logoutLink = document.querySelector('.sidebar > a[onclick*="logout"]');
    const secondaryHtml = secondaryItems.map((item) => {
      const href = item.getAttribute('href');
      const text = item.querySelector('span')?.textContent?.trim() || 'Menu';
      if (href) {
        return `<a href="${href}">${escapeHtml(text)}<span>›</span></a>`;
      }

      const onclick = item.getAttribute('onclick') || '';
      return `<button type="button" onclick="${escapeHtml(onclick)}">${escapeHtml(text)}<span>›</span></button>`;
    }).join('');

    const logoutHtml = logoutLink
      ? '<button type="button" onclick="logout()" style="background:#fee2e2;color:#b91c1c;">Déconnexion</button>'
      : '';

    sheet.innerHTML = secondaryHtml + logoutHtml;
    sheet.querySelectorAll('a,button').forEach((el) => {
      el.addEventListener('click', () => closeMobileMoreSheet());
    });
  } else if (trigger) {
    trigger.remove();
    closeMobileMoreSheet();
  }
}

// ============================================
// REVIEWS / RATINGS API
// ============================================
const reviewAPI = {
  create: async (data) => {
    return fetchAPI('/reviews', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  getDoctorReviews: async (doctorId) => {
    return fetchAPI(`/reviews/doctor/${doctorId}`);
  }
};

// ============================================
// ADMIN API
// ============================================
const adminAPI = {
  getDashboard: async () => {
    return fetchAPI('/admin/dashboard');
  },

  getUsers: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/admin/users${queryString ? '?' + queryString : ''}`);
  },

  getUser: async (id) => {
    return fetchAPI(`/admin/users/${id}`);
  },

  updateUser: async (id, data) => {
    return fetchAPI(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  deleteUser: async (id) => {
    return fetchAPI(`/admin/users/${id}`, { method: 'DELETE' });
  },

  approveUser: async (id) => {
    return fetchAPI(`/admin/users/${id}/approve`, { method: 'PUT' });
  },

  rejectUser: async (id, reason) => {
    return fetchAPI(`/admin/users/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason: reason || '' })
    });
  },

  getValidations: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/admin/validations${queryString ? '?' + queryString : ''}`);
  },

  approveValidation: async (id) => {
    return fetchAPI(`/admin/validations/${id}/approve`, { method: 'PUT' });
  },

  rejectValidation: async (id, reason) => {
    return fetchAPI(`/admin/validations/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason: reason || '' })
    });
  },

  getPaymentsSummary: async () => {
    return fetchAPI('/admin/payments/summary');
  },

  getPayments: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/admin/payments${queryString ? '?' + queryString : ''}`);
  },

  validatePayment: async (id) => {
    return fetchAPI(`/admin/payments/${id}/validate`, { method: 'PUT' });
  },

  rejectPayment: async (id, reason) => {
    return fetchAPI(`/admin/payments/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason: reason || '' })
    });
  },

  getStatistics: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/admin/statistics${queryString ? '?' + queryString : ''}`);
  },

    getSettings: async () => {
      return fetchAPI('/admin/settings');
    },

    getBadges: async () => {
      return fetchAPI('/admin/badges');
    },

    updateSettings: async (data) => {
    return fetchAPI('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};

const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// ============================================
// SHARED MODAL SYSTEM
// ============================================
let modalCounter = 0;

function showConfirmModal(opts) {
  const id = 'admin-modal-' + (++modalCounter);
  const iconHtml = opts.icon || '';
  const title = opts.title || 'Confirmation';
  const message = opts.message || 'Êtes-vous sûr ?';
  const confirmText = opts.confirmText || 'Confirmer';
  const confirmClass = opts.confirmClass || 'primary';
  const cancelText = opts.cancelText || 'Annuler';
  const onConfirm = opts.onConfirm || (() => {});
  const onCancel = opts.onCancel || (() => {});

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay active';
  overlay.id = id;
  overlay.innerHTML = `
    <div class="admin-modal">
      <div class="admin-modal-header">
        <h2>${iconHtml} ${title}</h2>
        <button class="admin-modal-close" data-close>&times;</button>
      </div>
      <div class="admin-modal-body"><p>${message}</p></div>
      <div class="admin-modal-footer">
        <button class="action-btn secondary" data-cancel>${cancelText}</button>
        <button class="action-btn ${confirmClass}" data-confirm>${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onCancel(); };
  overlay.querySelector('[data-close]').onclick = close;
  overlay.querySelector('[data-cancel]').onclick = close;
  overlay.querySelector('[data-confirm]').onclick = () => {
    onConfirm();
    overlay.remove();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
  });
}

function showPromptModal(opts) {
  const id = 'admin-modal-' + (++modalCounter);
  const title = opts.title || 'Action';
  const bodyHtml = opts.bodyHtml || '';
  const confirmText = opts.confirmText || 'Confirmer';
  const confirmClass = opts.confirmClass || 'primary';
  const cancelText = opts.cancelText || 'Annuler';
  const onConfirm = opts.onConfirm || (() => {});
  const onCancel = opts.onCancel || (() => {});
  const width = opts.width || '480px';

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay active';
  overlay.id = id;
  overlay.innerHTML = `
    <div class="admin-modal" style="max-width:${width}">
      <div class="admin-modal-header">
        <h2>${title}</h2>
        <button class="admin-modal-close" data-close>&times;</button>
      </div>
      <div class="admin-modal-body">${bodyHtml}</div>
      <div class="admin-modal-footer">
        <button class="action-btn secondary" data-cancel>${cancelText}</button>
        <button class="action-btn ${confirmClass}" data-confirm>${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onCancel(); };
  overlay.querySelector('[data-close]').onclick = close;
  overlay.querySelector('[data-cancel]').onclick = close;
  overlay.querySelector('[data-confirm]').onclick = () => {
    onConfirm();
    overlay.remove();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handler); }
  });

  return overlay;
}

// ============================================

// Make all APIs available globally
window.adminAPI = adminAPI;
window.authAPI = authAPI;
window.doctorAPI = doctorAPI;
window.appointmentAPI = appointmentAPI;
window.messageAPI = messageAPI;
window.reviewAPI = reviewAPI;
window.connectMessagingSocket = connectMessagingSocket;
window.disconnectMessagingSocket = disconnectMessagingSocket;
window.getMessagingSocket = getMessagingSocket;
window.isLoggedIn = isLoggedIn;
window.getCurrentUser = getCurrentUser;
window.getUserType = getUserType;
window.redirectByUserType = redirectByUserType;
window.formatDate = formatDate;
window.showToast = showToast;
window.logout = logout;
window.escapeHtml = escapeHtml;
window.getMediaLabel = getMediaLabel;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
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
  document.addEventListener('DOMContentLoaded', () => {
    loadSidebarUserData();
    initializeMobileBottomNav();
  });
  window.addEventListener('resize', initializeMobileBottomNav);
}
window.showConfirmModal = showConfirmModal;
window.showPromptModal = showPromptModal;
window.loadSidebarUserData = loadSidebarUserData;
window.initializeMobileBottomNav = initializeMobileBottomNav;