// ============================================
// PATIENT PSYCHOLOGUE PAGE - Fetch & Display Doctors from Backend
// ============================================

let doctors = [];
let userPreferences = null;
let selectedDoctor = null;
let urgentActif = false;
let doctorCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Toast notification system
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

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        showToast('Veuillez vous connecter d\'abord', 'error');
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'patient') {
        redirectByUserType(getUserType());
        return;
    }

    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
        const greeting = document.querySelector('.page-header h1');
        if (greeting && greeting.textContent.includes('Bonjour')) {
            greeting.textContent = 'Bonjour, ' + name;
        }
    }

    await loadUserPreferences();
    await fetchDoctors();
    await checkUrgentAccessStatus();
    highlightCurrentSidebarLink();
    
    // Check URL for joining a call
    const urlParams = new URLSearchParams(window.location.search);
    const joinCall = urlParams.get('joinCall');
    if (joinCall) {
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Init call listener
    if (typeof initPatientCallListener === 'function') {
        setTimeout(initPatientCallListener, 500);
    }
});

async function checkUrgentAccessStatus() {
    try {
        const status = await appointmentAPI.getUrgentAccessStatus();
        if (status.isActive) {
            urgentActif = true;
            document.getElementById('urgentBanner').style.display = 'flex';
            showToast(`URGENT actif! ${status.daysLeft} jour(s) restant(s)`, 'info');
        }
    } catch (error) {
        console.log('Could not load urgent access status');
    }
}

async function loadUserPreferences() {
    try {
        const result = await authAPI.getMe();
        if (result.user && result.user.profile) {
            userPreferences = result.user.profile;
        }
    } catch (error) {
        console.error('Error loading user preferences:', error);
    }
}

async function fetchDoctors() {
    try {
        const result = await doctorAPI.getAll({ view: 'summary' });
        doctors = result || [];
        
        // Clear cache when new doctors are fetched
        doctorCache.clear();
        
        if (userPreferences && userPreferences.prefGender) {
            doctors = filterDoctorsByPreferences(doctors);
        }
        
        renderDoctors(doctors);
    } catch (error) {
        console.error('Error fetching doctors:', error);
        showToast('Erreur lors du chargement des psychologues', 'error');
    }
}

function filterDoctorsByPreferences(doctorsList) {
    let filtered = [...doctorsList];
    
    if (userPreferences.prefGender && userPreferences.prefGender !== 'indiffere') {
        filtered = filtered.filter(d => {
            const docGender = d.fullname.toLowerCase().includes('dr.') ? 
                (d.fullname.toLowerCase().includes('a') ? 'femme' : 'homme') : null;
            return !docGender || docGender === userPreferences.prefGender;
        });
    }
    
    if (userPreferences.prefType === 'couple') {
        filtered = filtered.filter(d => 
            d.specialite?.toLowerCase().includes('couple') || 
            d.bio?.toLowerCase().includes('couple')
        );
    } else if (userPreferences.prefType === 'familiale') {
        filtered = filtered.filter(d => 
            d.specialite?.toLowerCase().includes('famille') || 
            d.bio?.toLowerCase().includes('famille')
        );
    }
    
    return filtered;
}

function renderDoctors(doctorsList) {
    const grid = document.getElementById('psychologuesGrid');
    if (!grid) return;

    if (doctorsList.length === 0) {
        grid.innerHTML = '<div class="no-results"><p>Aucun psychologue ne correspond à vos préférences.</p><p>Modifiez vos préférences dans votre profil pour voir plus de résultats.</p></div>';
        document.getElementById('resultCount').textContent = '0 psychologue disponible';
        return;
    }

    grid.innerHTML = doctorsList.map(doctor => {
        const nextAvailable = getNextAvailableSlot(doctor.availableSlots);
        const onlineStatus = doctor.isAvailable ? 'En ligne' : (nextAvailable ? `Disponible ${nextAvailable}` : 'Non disponible');
        const avatarHtml = doctor.avatar 
            ? `<img src="${doctor.avatar}" alt="${doctor.fullname}" class="psy-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">`
            : '';
        const defaultAvatarSvg = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="psy-avatar-default">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            </svg>
        `;
        
        return `
        <div class="psy-card" 
             data-name="${doctor.fullname.toLowerCase()}" 
             data-online="${doctor.isAvailable}"
             onclick="viewDoctor('${doctor.id}')">
            <div class="psy-card-header">
                <div class="psy-avatar-container">
                    ${avatarHtml}
                    <div class="psy-avatar-default" ${doctor.avatar ? 'style="display:none"' : ''}>
                        ${defaultAvatarSvg}
                    </div>
                    ${doctor.isAvailable ? '<div class="online-indicator"></div>' : ''}
                </div>
            </div>
            <div class="psy-card-body">
                <h3 class="psy-name">${doctor.fullname}</h3>
                <p class="psy-specialite">${doctor.specialite || 'Psychologie générale'}</p>
                <div class="psy-meta">
                    <div class="psy-rating">
                        ${'★'.repeat(Math.floor(doctor.rating || 0))}${'☆'.repeat(5 - Math.floor(doctor.rating || 0))}
                        <span class="rating-value">${doctor.rating ? doctor.rating.toFixed(1) : '0'}</span>
                    </div>
                    <div class="psy-price">${doctor.tarif || 2000} DA</div>
                </div>
            </div>
            <div class="psy-card-footer">
                <button class="psy-view-btn" onclick="event.stopPropagation(); viewDoctor('${doctor.id}')">
                    Voir profil
                </button>
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('resultCount').textContent = 
        `${doctorsList.length} psychologue(s) disponible(s)`;
}

function getNextAvailableSlot(slots) {
    if (!slots || slots.length === 0) return null;
    
    const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const today = new Date();
    
    for (let i = 1; i <= 7; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        
        const hasSlot = slots.some(slot => slot.dayOfWeek === dayOfWeek);
        if (hasSlot) {
            return checkDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' });
        }
    }
    return null;
}

async function viewDoctor(doctorId) {
    try {
        // Check cache first
        const cachedDoctor = doctorCache.get(doctorId);
        let doctor;
        
        if (cachedDoctor && (Date.now() - cachedDoctor._cachedAt) < CACHE_DURATION) {
            doctor = cachedDoctor;
        } else {
            // Fetch from API and cache
            doctor = await doctorAPI.getById(doctorId);
            doctor._cachedAt = Date.now();
            doctorCache.set(doctorId, doctor);
        }
        
        selectedDoctor = doctor;

        // Avatar
        const avatarImg = document.querySelector('.psy-detail-avatar');
        if (avatarImg) {
            if (doctor.avatar) {
                avatarImg.src = doctor.avatar;
                avatarImg.style.display = 'block';
            } else {
                avatarImg.style.display = 'none';
            }
        }

        // Name
        document.getElementById('detailName').textContent = doctor.fullname || 'Psychologue';
        
        // Specialité (was missing - BUG FIX)
        const specialiteSpan = document.getElementById('detailSpecialite');
        if (specialiteSpan) {
            specialiteSpan.textContent = doctor.specialite || 'Psychologie';
        }

        // Rating with stars (NEW)
        const rating = doctor.rating || 0;
        const starsEl = document.getElementById('detailStars');
        if (starsEl) {
            starsEl.innerHTML = 
                '<span class="star filled">★</span>'.repeat(Math.floor(rating)) +
                '<span class="star">★</span>'.repeat(5 - Math.floor(rating));
        }
        
        const ratingValueEl = document.getElementById('detailRating');
        if (ratingValueEl) {
            ratingValueEl.textContent = rating.toFixed(1);
        }

        // System metrics (NEW)
        const patientsCountEl = document.getElementById('detailPatientsCount');
        if (patientsCountEl) {
            patientsCountEl.textContent = doctor.patientsCount || 0;
        }

        const sessionsEl = document.getElementById('detailSessionsCompleted');
        if (sessionsEl) {
            sessionsEl.textContent = doctor.sessionsCompleted || 0;
        }

        // Phone
        const phoneEl = document.getElementById('detailPhone');
        if (phoneEl) {
            phoneEl.textContent = doctor.phone || 'Non spécifié';
        }

        // Adresse
        const adresseEl = document.getElementById('detailAdresse');
        if (adresseEl) {
            adresseEl.textContent = doctor.adresse || 'Non spécifié';
        }

        // Numéro d'agrément
        const agrementEl = document.getElementById('detailAgrement');
        if (agrementEl) {
            agrementEl.textContent = doctor.agrement || 'Non spécifié';
        }

        // Diplômes
        const diplomesEl = document.getElementById('detailDiplomes');
        if (diplomesEl) {
            diplomesEl.textContent = doctor.diplomes || 'Non spécifié';
        }

        // Bio/Description
        const bioEl = document.getElementById('detailBio');
        if (bioEl) {
            bioEl.textContent = doctor.bio || 'Aucune description disponible.';
        }

        document.getElementById('psyDetailPanel').classList.add('active');
        document.body.style.overflow = 'hidden';

    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function closePsyDetail() {
    document.getElementById('psyDetailPanel').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function contactDoctor() {
    if (!selectedDoctor) {
        showToast('Veuillez sélectionner un psychologue', 'error');
        return;
    }
    localStorage.setItem('selectedDoctorId', selectedDoctor.id);
    localStorage.setItem('selectedDoctorName', selectedDoctor.fullname);
    window.location.href = 'patient_messagerie.html';
}

function openBookingModal() {
    if (!selectedDoctor) {
        showToast('Veuillez sélectionner un psychologue', 'error');
        return;
    }
    document.getElementById('bookingDoctorName').textContent = selectedDoctor.fullname;
    
    const today = new Date();
    const minDate = today.toISOString().split('T')[0];
    document.getElementById('bookingDate').min = minDate;
    document.getElementById('bookingDate').value = minDate;
    
    // Populate time slots - show all standard times (user can choose freely)
    const timeSelect = document.getElementById('bookingTime');
    const standardTimes = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'];
    
    timeSelect.innerHTML = '<option value="">Sélectionner une heure</option>';
    standardTimes.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        timeSelect.appendChild(option);
    });
    
    document.getElementById('bookingModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

async function confirmBooking() {
    const dateEl = document.getElementById('bookingDate');
    const timeEl = document.getElementById('bookingTime');
    const mediaEl = document.getElementById('bookingMedia');
    
    const date = dateEl?.value;
    const time = timeEl?.value;
    const mediaType = mediaEl?.value;

    if (!date || !time || !mediaType) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }

    const confirmBtn = document.querySelector('#bookingModal .confirm-btn');
    const originalText = confirmBtn?.textContent || 'Confirmer';
    if (confirmBtn) {
        confirmBtn.textContent = 'Enregistrement...';
        confirmBtn.disabled = true;
    }

    try {
        const result = await appointmentAPI.create({
            doctorId: selectedDoctor.id,
            date: date,
            time: time,
            mediaType: mediaType
        });

        showToast('Rendez-vous réservé avec succès!', 'success');
        closeBookingModal();
        closePsyDetail();
        window.location.href = 'patient_rendez_vous.html';
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    }
}

async function bookAppointment() {
    if (!selectedDoctor) {
        showToast('Veuillez sélectionner un psychologue', 'error');
        return;
    }

    const dateStr = prompt('Date du rendez-vous (JJ/MM/AAAA):', '');
    if (!dateStr) return;
    
    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) {
        showToast('Format de date invalide. Utilisez JJ/MM/AAAA', 'error');
        return;
    }
    
    const date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    const time = prompt('Heure du rendez-vous (HH:MM):', '10:00');
    if (!time) return;

    const mediaType = prompt('Type de consultation (video/phone/chat):', 'video');
    if (!mediaType) return;

    const confirmMsg = `Confirmer le rendez-vous avec ${selectedDoctor.fullname}?\nDate: ${dateStr}\nHeure: ${time}\nType: ${mediaType}`;
    if (!confirm(confirmMsg)) return;

    try {
        const result = await appointmentAPI.create({
            doctorId: selectedDoctor.id,
            date: date,
            time: time,
            mediaType: mediaType
        });

        showToast('Rendez-vous réservé avec succès!', 'success');
        closePsyDetail();
        window.location.href = 'patient_rendez_vous.html';
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function filterPsychologues() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.psy-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const name = card.getAttribute('data-name') || '';
        const isOnline = card.getAttribute('data-online') === 'true';
        
        let showBySearch = name.includes(searchTerm);
        let showByUrgent = !urgentActif || (urgentActif && isOnline);
        
        if (showBySearch && showByUrgent) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    const resultCount = document.getElementById('resultCount');
    if (urgentActif) {
        resultCount.innerHTML = `${visibleCount} psychologue(s) EN LIGNE disponible(s) pour appel immédiat`;
    } else {
        resultCount.innerHTML = `${visibleCount} psychologue(s) correspondent à votre recherche`;
    }
}

async function openUrgentPayment() {
    // Check if user already has active 7-day urgent access
    try {
        const status = await appointmentAPI.getUrgentAccessStatus();
        
        if (status.isActive) {
            // User has active urgent access - skip payment and activate immediately
            showToast(`URGENT déjà actif! ${status.daysLeft} jour(s) restant(s)`, 'info');
            await activateUrgentNoPayment();
            return;
        }
    } catch (error) {
        console.log('Could not check urgent access status, showing payment modal');
    }
    
    // No active access - show payment modal
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const defaultTime = `${hours}:${minutes}`;
    
    const timeInput = document.getElementById('urgentAppointmentTime');
    if (timeInput) {
        timeInput.value = defaultTime;
    }
    
    document.getElementById('urgentModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function activateUrgentNoPayment() {
    // Direct activation without payment - for users with active 7-day access
    try {
        const onlineDoctor = doctors.find(d => d.isAvailable);
        const selectedDoctorId = onlineDoctor?.id;
        
        const result = await appointmentAPI.createUrgent(
            selectedDoctorId,
            'Patient requested URGENT VIP consultation',
            undefined
        );
        
        urgentActif = true;
        document.getElementById('urgentBanner').style.display = 'flex';
        filterPsychologues();
        
    } catch (error) {
        console.error('Error activating urgent:', error);
        showToast('Erreur lors de l\'activation URGENT', 'error');
    }
}

function closeUrgentModal() {
    document.getElementById('urgentModal')?.classList.remove('active');
    document.body.style.overflow = 'auto';
}

async function activateUrgent() {
    const ccpNumber = document.getElementById('ccpNumber')?.value;
    const cvv = document.getElementById('cvv')?.value;
    const appointmentTime = document.getElementById('urgentAppointmentTime')?.value;
    
    if (!ccpNumber || !cvv) {
        showToast('Veuillez remplir tous les champs de paiement', 'error');
        return;
    }
    
    try {
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Activate 7-day urgent access
        await appointmentAPI.activateUrgentAccess();
        
        // Find an online doctor - use first available
        const onlineDoctor = doctors.find(d => d.isAvailable);
        const selectedDoctorId = onlineDoctor?.id;
        
        // Create urgent VIP request via API with custom time
        const result = await appointmentAPI.createUrgent(
            selectedDoctorId,
            'Patient requested URGENT VIP consultation',
            appointmentTime || undefined
        );
        
        showToast('Demande URGENTE VIP envoyée avec succès! Accès actif pour 7 jours.', 'success');
        urgentActif = true;
        document.getElementById('urgentBanner').style.display = 'flex';
        closeUrgentModal();
        filterPsychologues();
        
        // Clear form
        document.getElementById('ccpNumber').value = '';
        document.getElementById('cvv').value = '';
        
    } catch (error) {
        console.error('Error activating urgent:', error);
        showToast('Erreur lors de l\'activation URGENT', 'error');
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-detail-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'apercu') {
        document.querySelector('.tab-detail-btn:first-child').classList.add('active');
        document.getElementById('apercuContent').classList.add('active');
    } else {
        document.querySelector('.tab-detail-btn:last-child').classList.add('active');
        document.getElementById('avisContent').classList.add('active');
    }
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

window.viewDoctor = viewDoctor;
window.closePsyDetail = closePsyDetail;
window.bookAppointment = openBookingModal;
window.contactDoctor = contactDoctor;
window.openBookingModal = openBookingModal;
window.closeBookingModal = closeBookingModal;
window.confirmBooking = confirmBooking;
window.filterPsychologues = filterPsychologues;
window.openUrgentPayment = openUrgentPayment;
window.closeUrgentModal = closeUrgentModal;
window.activateUrgent = activateUrgent;
window.switchTab = switchTab;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;

document.getElementById('searchInput')?.addEventListener('keyup', filterPsychologues);

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeUrgentModal();
        closePsyDetail();
    }
});

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