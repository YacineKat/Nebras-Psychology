// ============================================
// PATIENT PSYCHOLOGUE PAGE - Fetch & Display Doctors from Backend
// ============================================

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

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

    const [userPrefsResult] = await Promise.all([
        loadUserPreferences(),
        fetchDoctors(),
        checkUrgentAccessStatus()
    ]);
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
        const [psyResult, counselorResult] = await Promise.all([
            doctorAPI.getAll({ view: 'summary', role: 'psychologue' }),
            doctorAPI.getAll({ view: 'summary', role: 'counselor' })
        ]);

        const psychologues = (psyResult || []).map(p => ({ ...p, role: 'psychologue' }));
        const counselors = (counselorResult || []).map(c => ({ ...c, role: 'counselor' }));

        doctors = [...psychologues, ...counselors];

        let filtered = doctors;
        if (userPreferences && userPreferences.prefGender) {
            filtered = filterDoctorsByPreferences(filtered);
        }

        renderDoctors(filtered);
    } catch (error) {
        console.error('Error fetching doctors:', error);
        showToast('Erreur lors du chargement', 'error');
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

function renderDoctorCard(doctor, roleLabel) {
    const nextAvailable = getNextAvailableSlot(doctor.availableSlots);
    const avatarHtml = doctor.avatar 
        ? `<img src="${doctor.avatar}" alt="${doctor.fullname}" class="psy-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">`
        : '';
    const defaultAvatarSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="psy-avatar-default">
            <circle cx="12" cy="8" r="4"/>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        </svg>
    `;
    const roleDisplayName = roleLabel === 'counselor' ? 'Conseiller' : 'Psychologue';
    const roleBadgeClass = roleLabel === 'counselor' ? 'counselor' : 'psy';
    
    return `
    <div class="psy-card" 
         data-name="${doctor.fullname.toLowerCase()}" 
         data-online="${doctor.isAvailable}"
         data-role="${roleLabel}"
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
            <p class="psy-specialite">${doctor.specialite || 'Général'}</p>
            <span class="psy-role-badge ${roleBadgeClass}">${roleDisplayName}</span>
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
}

function renderDoctors(allDoctors) {
    const psyGrid = document.getElementById('psychologuesGrid');
    if (!psyGrid) return;

    if (allDoctors.length === 0) {
        psyGrid.innerHTML = '<div class="no-results"><p>Aucun professionnel ne correspond à vos préférences.</p><p>Modifiez vos préférences dans votre profil pour voir plus de résultats.</p></div>';
    } else {
        psyGrid.innerHTML = allDoctors.map(d => renderDoctorCard(d, d.userType === 'counselor' ? 'counselor' : 'psychologue')).join('');
    }

    const resultEl = document.getElementById('resultCount');
    if (resultEl) {
        const total = allDoctors.length;
        resultEl.textContent = `${total} professionnel${total > 1 ? 's' : ''} disponible${total > 1 ? 's' : ''}`;
    }
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
        const cachedDoctor = doctorCache.get(doctorId);
        let doctor;

        if (cachedDoctor && (Date.now() - cachedDoctor._cachedAt) < CACHE_DURATION) {
            doctor = cachedDoctor;
            renderDetailPanel(doctor);
            return;
        }

        const listDoctor = doctors.find(d => d.id === doctorId);
        if (listDoctor) {
            renderDetailPanel(listDoctor, true);
        }

        doctor = await doctorAPI.getById(doctorId);
        doctor._cachedAt = Date.now();
        doctorCache.set(doctorId, doctor);
        renderDetailPanel(doctor);

    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function renderDetailPanel(doctor, isPartial) {
    selectedDoctor = doctor;

    const avatarImg = document.querySelector('.psy-detail-avatar');
    const avatarDefault = document.querySelector('.psy-detail-avatar-default');
    if (avatarImg && avatarDefault) {
        if (doctor.avatar) {
            avatarImg.src = doctor.avatar;
            avatarImg.style.display = 'block';
            avatarDefault.style.display = 'none';
        } else {
            avatarImg.style.display = 'none';
            avatarDefault.style.display = 'flex';
        }
    }

    document.getElementById('detailName').textContent = doctor.fullname || 'Psychologue';

    const specialiteSpan = document.getElementById('detailSpecialite');
    if (specialiteSpan) {
        specialiteSpan.textContent = doctor.specialite || 'Psychologie';
    }

    const roleBadge = document.getElementById('detailRoleBadge');
    if (roleBadge) {
        const isCounselor = doctor.userType === 'counselor';
        roleBadge.textContent = isCounselor ? 'Conseiller' : 'Psychologue';
        roleBadge.className = 'detail-role-badge ' + (isCounselor ? 'counselor' : 'psy');
    }

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

    const patientsCountEl = document.getElementById('detailPatientsCount');
    if (patientsCountEl) {
        patientsCountEl.textContent = doctor.patientsCount || 0;
    }

    const sessionsEl = document.getElementById('detailSessionsCompleted');
    if (sessionsEl) {
        sessionsEl.textContent = doctor.sessionsCompleted || 0;
    }

    const phoneEl = document.getElementById('detailPhone');
    if (phoneEl) {
        phoneEl.textContent = (isPartial && !doctor.phone) ? 'Chargement...' : (doctor.phone || 'Non spécifié');
    }

    const adresseEl = document.getElementById('detailAdresse');
    if (adresseEl) {
        adresseEl.textContent = (isPartial && !doctor.adresse) ? 'Chargement...' : (doctor.adresse || 'Non spécifié');
    }

    const agrementEl = document.getElementById('detailAgrement');
    if (agrementEl) {
        agrementEl.textContent = (isPartial && !doctor.agrement) ? 'Chargement...' : (doctor.agrement || 'Non spécifié');
    }

    const diplomesEl = document.getElementById('detailDiplomes');
    if (diplomesEl) {
        diplomesEl.textContent = (isPartial && !doctor.diplomes) ? 'Chargement...' : (doctor.diplomes || 'Non spécifié');
    }

    const bioEl = document.getElementById('detailBio');
    if (bioEl) {
        bioEl.textContent = (isPartial && !doctor.bio) ? 'Chargement...' : (doctor.bio || 'Aucune description disponible.');
    }

    document.getElementById('psyDetailPanel').classList.add('active');
    document.body.style.overflow = 'hidden';
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
        resultCount.innerHTML = `${visibleCount} professionnel${visibleCount > 1 ? 's' : ''} EN LIGNE disponible${visibleCount > 1 ? 's' : ''} pour appel immédiat`;
    } else {
        resultCount.innerHTML = `${visibleCount} professionnel${visibleCount > 1 ? 's' : ''} correspondent à votre recherche`;
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
        // Send urgent requests to all available psychologists and counselors
        const success = await sendUrgentToAllProviders(undefined);
        
        if (!success) {
            return;
        }
        
        urgentActif = true;
        document.getElementById('urgentBanner').style.display = 'flex';
        filterPsychologues();
        
    } catch (error) {
        console.error('Error activating urgent:', error);
        showToast('Erreur lors de l\'activation URGENT', 'error');
    }
}

async function sendUrgentToAllProviders(appointmentTime) {
    const availableDoctors = doctors.filter(d => d.isAvailable && d.role === 'psychologue');
    const availableCounselors = doctors.filter(d => d.isAvailable && d.role === 'counselor');
    const allProviders = [...availableDoctors, ...availableCounselors];

    if (allProviders.length === 0) {
        showToast('Aucun professionnel disponible en ce moment', 'error');
        return false;
    }

    try {
        let successCount = 0;
        for (let i = 0; i < allProviders.length; i += 5) {
            const batch = allProviders.slice(i, i + 5);
            const batchResults = await Promise.all(batch.map(provider =>
                appointmentAPI.createUrgent(
                    provider.id,
                    'Patient requested URGENT VIP consultation',
                    appointmentTime || undefined
                ).catch(e => {
                    console.log(`Failed to send urgent to ${provider.fullname}:`, e);
                    return null;
                })
            ));
            successCount += batchResults.filter(r => r !== null).length;
        }

        if (successCount > 0) {
            return true;
        } else {
            showToast('Erreur lors de l\'envoi des demandes urgentes', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error sending urgent to all providers:', error);
        showToast('Erreur lors de l\'envoi des demandes urgentes', 'error');
        return false;
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
        
        // Send urgent requests to all available psychologists and counselors
        const success = await sendUrgentToAllProviders(appointmentTime);
        
        if (!success) {
            return;
        }
        
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
// highlightCurrentSidebarLink removed — use global from api.js


document.getElementById('bookingDate')?.addEventListener('change', () => {
    if (document.getElementById('bookingModal')?.classList.contains('active')) {
        refreshBookingAvailability();
    }
});

const debouncedFilter = debounce(filterPsychologues, 200);
document.getElementById('searchInput')?.addEventListener('keyup', debouncedFilter);

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