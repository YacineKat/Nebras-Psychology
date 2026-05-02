// ============================================
// PATIENT PSYCHOLOGUE PAGE - Fetch & Display Doctors from Backend
// ============================================

let doctors = [];
let userPreferences = null;
let selectedDoctor = null;
let urgentActif = false;

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
    highlightCurrentSidebarLink();
});

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
        const result = await doctorAPI.getAll();
        doctors = result || [];
        
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
        
        return `
        <div class="psy-card" 
             data-name="${doctor.fullname.toLowerCase()}" 
             data-online="${doctor.isAvailable}"
             onclick="viewDoctor('${doctor.id}')">
            <div class="psy-image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="50" height="50">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                </svg>
                ${doctor.isAvailable ? '<div class="online-badge">En ligne</div>' : ''}
            </div>
            <div class="psy-info">
                <h3>${doctor.fullname}</h3>
                <p class="psy-specialite">${doctor.specialite || 'Psychologie'}</p>
                <div class="psy-status ${doctor.isAvailable ? 'online' : 'offline'}">
                    ${onlineStatus}
                </div>
                <div class="psy-rating">
                    ${'★'.repeat(Math.floor(doctor.rating || 0))}${'☆'.repeat(5 - Math.floor(doctor.rating || 0))}
                    <span>${doctor.rating ? doctor.rating.toFixed(1) : '0'}</span>
                </div>
            </div>
            <button class="psy-contact-btn" onclick="event.stopPropagation(); viewDoctor('${doctor.id}')">
                Voir profil
            </button>
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
        const doctor = await doctorAPI.getById(doctorId);
        selectedDoctor = doctor;

        document.getElementById('detailName').textContent = doctor.fullname;
        
        const statusSpan = document.getElementById('detailOnlineStatus');
        statusSpan.textContent = doctor.isAvailable ? 'En ligne' : 'Hors ligne';
        statusSpan.style.background = doctor.isAvailable ? '#27ae60' : '#999';

        const ratingText = document.querySelector('.rating-text');
        if (ratingText) {
            const rating = doctor.rating || 0;
            ratingText.textContent = rating.toFixed(1) + '/5';
        }
        
        const starsDiv = document.querySelector('.stars');
        if (starsDiv) {
            const rating = doctor.rating || 0;
            starsDiv.innerHTML = 
                '<span class="star filled">★</span>'.repeat(Math.floor(rating)) +
                '<span class="star">★</span>'.repeat(5 - Math.floor(rating));
        }

        const quickInfo = document.querySelector('.quick-info');
        if (quickInfo) {
            const duration = doctor.tarif ? Math.ceil(doctor.tarif / 40) : 45;
            quickInfo.innerHTML = `
                <div class="info-item-detail"><svg viewBox="0 0 24 24" fill="none"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" fill="currentColor"/></svg><span>${duration} min.</span></div>
                <div class="info-item-detail"><span>${doctor.tarif || '2000'} DA</span></div>
            `;
        }

        const langSection = document.querySelector('.detail-section:nth-child(5)');
        if (langSection && doctor.language) {
            const langTags = langSection.querySelector('.tags-list');
            if (langTags) {
                const langs = doctor.language.split(',').map(l => l.trim());
                langTags.innerHTML = langs.map(l => `<span class="tag">${l}</span>`).join('');
            }
        }

        const approachSection = document.querySelector('.detail-section:nth-child(6)');
        if (approachSection && doctor.specialite) {
            const tags = approachSection.querySelector('.tags-list');
            if (tags) {
                tags.innerHTML = `<span class="tag">${doctor.specialite}</span>`;
            }
        }

        const motifsSection = document.querySelector('.detail-section:nth-child(7)');
        if (motifsSection && doctor.motifs) {
            const tags = motifsSection.querySelector('.tags-list');
            if (tags) {
                const motifList = doctor.motifs.split(',').map(m => m.trim());
                tags.innerHTML = motifList.map(m => `<span class="tag">${m}</span>`).join('');
            }
        }

        const descSection = document.querySelector('.detail-section:nth-child(8)');
        if (descSection) {
            const descText = descSection.querySelector('.description-text');
            if (descText) {
                descText.textContent = doctor.bio || 'Aucune description disponible.';
            }
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

function openUrgentPayment() {
    showToast('Fonctionnalité URGENT bientôt disponible!', 'info');
}

function closeUrgentModal() {
    document.getElementById('urgentModal')?.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function activateUrgent() {
    showToast('Paiement réussi! Mode URGENT activé (simulation)', 'success');
    urgentActif = true;
    document.getElementById('urgentBanner').style.display = 'flex';
    filterPsychologues();
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