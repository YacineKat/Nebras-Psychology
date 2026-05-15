// ============================================
// PATIENT PSYCHOLOGUE PAGE - Fetch & Display Doctors from Backend
// ============================================

let doctors = [];
let userPreferences = null;
let selectedDoctor = null;
let urgentActif = false;
let doctorCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const BOOKING_TIME_GROUPS = [
    { key: 'morning', label: 'Matin', startHour: 8, endHour: 11 },
    { key: 'afternoon', label: 'Après-midi', startHour: 12, endHour: 17 },
    { key: 'evening', label: 'Soir', startHour: 18, endHour: 20 }
];

let bookingAvailability = null;
let bookingAvailabilityRequestId = 0;
let bookingSelectedTime = '';

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

function getSlotHour(time) {
    if (!time) return null;
    const [hour] = String(time).split(':');
    const parsed = Number.parseInt(hour, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function getSlotPeriod(time) {
    const hour = getSlotHour(time);
    if (hour === null) return 'other';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
}

function formatBookingSlotRange(slot) {
    if (!slot) return '';
    if (slot.endTime && slot.endTime !== slot.startTime) {
        return `${slot.startTime} - ${slot.endTime}`;
    }
    return slot.startTime || '';
}

function updateBookingSelectedLabel() {
    const label = document.getElementById('bookingSelectedTimeLabel');
    if (!label) return;

    label.textContent = bookingSelectedTime
        ? `Créneau sélectionné : ${bookingSelectedTime}`
        : 'Sélectionnez un créneau disponible';
}

function setBookingSelection(time) {
    bookingSelectedTime = time || '';

    const hiddenInput = document.getElementById('bookingTime');
    if (hiddenInput) {
        hiddenInput.value = bookingSelectedTime;
    }

    document.querySelectorAll('.booking-slot-btn').forEach(button => {
        button.classList.toggle('selected', button.dataset.time === bookingSelectedTime);
    });

    updateBookingSelectedLabel();
}

function renderBookingAvailability(availability, dateValue) {
    const loadingEl = document.getElementById('bookingSlotsLoading');
    const container = document.getElementById('bookingSlotsContainer');
    const summaryEl = document.getElementById('bookingAvailabilitySummary');

    if (loadingEl) loadingEl.style.display = 'none';
    if (!container) return;

    bookingAvailability = availability || null;

    const slots = availability?.slots || [];
    const availableSlots = slots.filter(slot => slot.selectable);
    const blockedSlots = slots.filter(slot => slot.status === 'blocked');
    const bookedSlots = slots.filter(slot => slot.status === 'booked');

    if (summaryEl) {
        if (!slots.length) {
            summaryEl.textContent = dateValue
                ? `Aucun créneau défini pour le ${new Date(`${dateValue}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`
                : 'Sélectionnez une date pour afficher les disponibilités';
        } else {
            summaryEl.textContent = `${availableSlots.length} disponible(s), ${blockedSlots.length} bloqué(s), ${bookedSlots.length} réservé(s)`;
        }
    }

    if (!slots.length) {
        container.innerHTML = `
            <div class="booking-empty-state">
                <strong>Aucun créneau publié</strong>
                <span>Le psychologue n'a pas encore défini d'horaires pour cette date.</span>
            </div>
        `;
        setBookingSelection('');
        return;
    }

    const groupedSlots = BOOKING_TIME_GROUPS.map(group => ({
        ...group,
        slots: slots.filter(slot => getSlotPeriod(slot.startTime) === group.key)
    })).filter(group => group.slots.length > 0);

    const otherSlots = slots.filter(slot => !BOOKING_TIME_GROUPS.some(group => getSlotPeriod(slot.startTime) === group.key));
    if (otherSlots.length) {
        groupedSlots.push({
            key: 'other',
            label: 'Autres créneaux',
            slots: otherSlots
        });
    }

    container.innerHTML = groupedSlots.map(group => {
        const groupAvailable = group.slots.filter(s => s.selectable).length;
        const groupSlots = group.slots.map(slot => {
            const isAvailable = slot.selectable;
            const stateLabel = isAvailable ? 'Disponible' : (slot.status === 'blocked' ? 'Bloqué' : 'Réservé');
            const disabledAttr = isAvailable ? '' : 'disabled';
            const stateClass = isAvailable ? 'available' : slot.status;

            if (isAvailable) {
                return `
                    <button type="button"
                        class="booking-slot-btn ${stateClass}"
                        data-time="${slot.startTime}"
                        ${disabledAttr}
                        onclick="selectBookingTime('${slot.startTime}')">
                        <span class="booking-slot-copy">
                            <span class="booking-slot-time">${slot.startTime}</span>
                            <span class="booking-slot-range">${formatBookingSlotRange(slot)}</span>
                        </span>
                        <span class="booking-slot-indicator"></span>
                    </button>
                `;
            }

            return `
                <button type="button"
                    class="booking-slot-btn ${stateClass}"
                    data-time="${slot.startTime}"
                    ${disabledAttr}
                    onclick="selectBookingTime('${slot.startTime}')">
                    <span class="booking-slot-copy">
                        <span class="booking-slot-time">${slot.startTime}</span>
                    </span>
                    <span class="booking-slot-state">${stateLabel}</span>
                </button>
            `;
        }).join('');

        return `
            <section class="booking-slot-group">
                <div class="booking-slot-group-header">
                    <h4>${group.label}</h4>
                    ${groupAvailable > 0 ? `<span class="booking-slot-group-count">${groupAvailable} disponible${groupAvailable > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="booking-slot-grid">
                    ${groupSlots}
                </div>
            </section>
        `;
    }).join('');

    const firstAvailable = availableSlots[0];
    if (firstAvailable && !availableSlots.some(slot => slot.startTime === bookingSelectedTime)) {
        setBookingSelection(firstAvailable.startTime);
    } else {
        updateBookingSelectedLabel();
    }

    if (!availableSlots.length && summaryEl) {
        summaryEl.textContent = 'Aucun créneau disponible pour cette date';
    }
}

function selectBookingTime(time) {
    if (!bookingAvailability?.slots?.some(slot => slot.startTime === time && slot.selectable)) {
        return;
    }

    setBookingSelection(time);
}

async function refreshBookingAvailability() {
    if (!selectedDoctor) return;

    const dateInput = document.getElementById('bookingDate');
    const loadingEl = document.getElementById('bookingSlotsLoading');
    const container = document.getElementById('bookingSlotsContainer');

    const date = dateInput?.value;
    if (!date) {
        renderBookingAvailability(null, null);
        return;
    }

    const currentRequestId = ++bookingAvailabilityRequestId;

    if (loadingEl) loadingEl.style.display = 'block';
    if (container) {
        container.innerHTML = '';
    }

    try {
        const availability = await doctorAPI.getAvailability(selectedDoctor.id, date);
        if (currentRequestId !== bookingAvailabilityRequestId) return;

        renderBookingAvailability(availability, date);
    } catch (error) {
        if (currentRequestId !== bookingAvailabilityRequestId) return;

        console.error('Error loading booking availability:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (container) {
            container.innerHTML = `
                <div class="booking-empty-state error">
                    <strong>Impossible de charger les créneaux</strong>
                    <span>Réessayez dans quelques instants.</span>
                </div>
            `;
        }
        setBookingSelection('');
    }
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
    const dateInput = document.getElementById('bookingDate');
    if (dateInput) {
        dateInput.min = minDate;
        dateInput.value = minDate;
    }

    bookingAvailability = null;
    bookingSelectedTime = '';
    bookingAvailabilityRequestId += 1;
    setBookingSelection('');

    const loadingEl = document.getElementById('bookingSlotsLoading');
    const container = document.getElementById('bookingSlotsContainer');
    if (loadingEl) loadingEl.style.display = 'block';
    if (container) container.innerHTML = '';
    
    document.getElementById('bookingModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    refreshBookingAvailability();
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.remove('active');
    bookingAvailability = null;
    bookingSelectedTime = '';
    bookingAvailabilityRequestId += 1;
    setBookingSelection('');
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
window.selectBookingTime = selectBookingTime;
window.switchTab = switchTab;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.showToast = showToast;

document.getElementById('bookingDate')?.addEventListener('change', () => {
    if (document.getElementById('bookingModal')?.classList.contains('active')) {
        refreshBookingAvailability();
    }
});

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