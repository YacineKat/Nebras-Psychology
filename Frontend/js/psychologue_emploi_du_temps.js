let currentWeekStart = null;
let timeSlots = [];
let weekAppointments = [];
let blockedDays = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return;
    }

    if (getUserType() !== 'psychologue' && getUserType() !== 'counselor') {
        redirectByUserType(getUserType());
        return;
    }

    initUserData();
    initWeek();
    await loadAllData();
});

function initUserData() {
    const user = getCurrentUser();
    if (user) {
        const name = user.fullname || user.email || '';
        document.querySelectorAll('.user-name').forEach(el => el.textContent = name);
    }
}

function initWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    currentWeekStart = new Date(today);
    currentWeekStart.setDate(diff);
}

async function loadAllData() {
    try {
        showLoading(true);
        
        const [scheduleResult, dashboardResult] = await Promise.all([
            doctorAPI.getSchedule(),
            doctorAPI.getDashboard()
        ]);
        
        timeSlots = scheduleResult || [];
        const allAppointments = dashboardResult.upcomingAppointments || [];
        
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        
        weekAppointments = allAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate);
            return aptDate >= currentWeekStart && aptDate < weekEnd;
        });
        
        renderAll();
        highlightCurrentSidebarLink();
        
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Erreur lors du chargement des données', 'error');
    } finally {
        showLoading(false);
    }
}

function renderAll() {
    updateWeekHeader();
    renderWeekNavigation();
    renderCalendarDays();
    renderWeekAppointments();
    renderTimeSlotsGrid();
}

function showLoading(show) {
    const content = document.querySelector('.main-content');
    if (show) {
        content.style.opacity = '0.5';
        content.style.pointerEvents = 'none';
    } else {
        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';
    }
}

function updateWeekHeader() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const formatDate = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const dateRange = `Semaine du ${formatDate(currentWeekStart)} au ${formatDate(weekEnd)}`;
    
    const headerEl = document.querySelector('.week-navigation h3');
    if (headerEl) {
        headerEl.textContent = dateRange;
    }
}

function renderWeekNavigation() {
    const navDiv = document.querySelector('.week-navigation');
    if (navDiv) {
        const existingH3 = navDiv.querySelector('h3');
        const prevBtn = navDiv.querySelector('.btn-prev');
        const nextBtn = navDiv.querySelector('.btn-next');
        
        if (!existingH3) {
            const h3 = document.createElement('h3');
            h3.style.color = '#091346';
            h3.style.margin = '0';
            navDiv.insertBefore(h3, nextBtn);
        }
        
        if (prevBtn) {
            prevBtn.onclick = () => navigateWeek(-1);
        }
        if (nextBtn) {
            nextBtn.onclick = () => navigateWeek(1);
        }
    }
}

function renderCalendarDays() {
    const container = document.getElementById('calendarDays');
    if (!container) return;
    
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const fullDayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    
    let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 20px;">';
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        const dayOfWeek = date.getDay();
        const isBlocked = blockedDays.includes(dayOfWeek);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const bgColor = isBlocked ? '#e74c3c' : (isWeekend ? '#e8f4ee' : '#091346');
        const textColor = isBlocked ? 'white' : (isWeekend ? '#091346' : 'white');
        const blockText = isBlocked ? 'Débloquer' : 'Bloquer';
        
        html += `
            <div style="background: ${bgColor}; color: ${textColor}; padding: 10px; text-align: center; border-radius: 10px; position: relative;">
                <div style="font-weight: 600; font-size: 12px;">${fullDayNames[dayOfWeek]}</div>
                <div style="font-size: 18px; font-weight: bold;">${date.getDate()}</div>
                <button onclick="toggleBlockDay(${dayOfWeek})" 
                    style="position: absolute; top: 3px; right: 3px; background: rgba(255,255,255,0.25); border: none; border-radius: 4px; padding: 2px 5px; font-size: 9px; cursor: pointer; color: ${textColor};">
                    ${blockText}
                </button>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderTimeSlotsGrid() {
    const container = document.querySelector('.slots-table-container');
    if (!container) return;
    
    const timeSlotTimes = ['09:15', '10:00', '10:45', '11:30', '12:15', '13:45'];
    const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    
    let html = `
        <div class="slots-table" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); background: var(--primary-beige); border-bottom: 2px solid var(--primary-green);">
                <div style="padding: 12px; font-weight: 600; color: var(--primary-dark); text-align: center; font-size: 12px;">Horaire</div>
                ${dayLabels.map(d => `<div style="padding: 12px; font-weight: 600; color: var(--primary-dark); text-align: center; font-size: 12px;">${d}</div>`).join('')}
            </div>
    `;
    
    timeSlotTimes.forEach((time) => {
        html += `<div style="display: grid; grid-template-columns: 80px repeat(7, 1fr); border-bottom: 1px solid #eee;">`;
        html += `<div style="padding: 12px; font-weight: 600; color: var(--primary-dark); text-align: center; font-size: 12px; display: flex; align-items: center; justify-content: center;">${time}</div>`;
        
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayOfWeek = dayIndex;
            const isBlocked = blockedDays.includes(dayOfWeek);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            const slot = timeSlots.find(s => s.dayOfWeek === dayOfWeek && s.startTime === time && !s.isBooked);
            
            const weekDate = new Date(currentWeekStart);
            weekDate.setDate(weekDate.getDate() + dayIndex);
            const dateStr = weekDate.toISOString().split('T')[0];
            
            const appointment = weekAppointments.find(apt => {
                const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
                return aptDate === dateStr && apt.appointmentTime === time;
            });
            
            let content = '-';
            let bgColor = '#f9f9f9';
            let textColor = '#ccc';
            
            if (isBlocked || isWeekend) {
                bgColor = '#f0f0f0';
                textColor = '#999';
                content = 'Bloqué';
            } else if (appointment) {
                bgColor = '#fef3e2';
                textColor = '#e67e22';
                content = `<strong>${appointment.patientName}</strong><br><small>${getMediaLabel(appointment.mediaType)}</small>`;
            } else if (slot) {
                bgColor = '#e8f4ee';
                textColor = '#44AA99';
                content = `<span style="cursor: pointer; font-size: 11px;" onclick="event.stopPropagation(); confirmDeleteSlot('${slot.id}', ${dayOfWeek}, '${time}')">Supprimer</span>`;
            }
            
            html += `<div style="padding: 10px 5px; text-align: center; font-size: 11px; background: ${bgColor}; color: ${textColor};">${content}</div>`;
        }
        html += '</div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderWeekAppointments() {
    const container = document.getElementById('weekAppointments');
    if (!container) return;
    
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    
    let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">';
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        
        const dayAppointments = weekAppointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
            return aptDate === dateStr;
        });
        
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const bgColor = isWeekend ? '#e8f4ee' : '#fafafa';
        
        html += `
            <div style="background: ${bgColor}; border-radius: 10px; padding: 10px; min-height: 120px; border: 1px solid #eee;">
                <div style="font-weight: 600; color: var(--primary-dark); font-size: 11px; text-align: center; margin-bottom: 8px;">
                    ${dayNames[dayOfWeek].substring(0, 3)} ${date.getDate()}
                </div>
                ${dayAppointments.length === 0 
                    ? '<div style="color: #ccc; font-size: 10px; text-align: center;">-</div>' 
                    : dayAppointments.map(apt => `
                        <div style="background: var(--primary-green); color: white; padding: 6px; border-radius: 6px; margin-bottom: 6px; font-size: 10px;">
                            <div style="font-weight: 600;">${apt.appointmentTime}</div>
                            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${apt.patientName}</div>
                        </div>
                    `).join('')
                }
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

function navigateWeek(direction) {
    currentWeekStart.setDate(currentWeekStart.getDate() + (direction * 7));
    loadAllData();
}

function toggleBlockDay(dayOfWeek) {
    const index = blockedDays.indexOf(dayOfWeek);
    if (index > -1) {
        blockedDays.splice(index, 1);
        showToast('Jour débloqué', 'success');
    } else {
        blockedDays.push(dayOfWeek);
        showToast('Jour bloqué', 'success');
    }
    renderCalendarDays();
    renderTimeSlotsGrid();
}

function openAddSlotModal() {
    document.getElementById('addSlotModal').style.display = 'flex';
}

function closeAddSlotModal() {
    document.getElementById('addSlotModal').style.display = 'none';
    document.getElementById('slotDayOfWeek').value = '1';
    document.getElementById('slotStartTime').value = '';
    document.getElementById('slotEndTime').value = '';
}

async function addNewSlot() {
    const dayOfWeek = parseInt(document.getElementById('slotDayOfWeek').value);
    const startTime = document.getElementById('slotStartTime').value;
    const endTime = document.getElementById('slotEndTime').value;
    
    if (!startTime || !endTime) {
        showToast('Veuillez sélectionner les heures', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showToast('L\'heure de fin doit être après le début', 'error');
        return;
    }
    
    try {
        await doctorAPI.addTimeSlot({ dayOfWeek, startTime, endTime });
        showToast('Créneau ajouté!', 'success');
        closeAddSlotModal();
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function confirmDeleteSlot(slotId, dayOfWeek, startTime) {
    if (!confirm('Supprimer ce créneau?')) return;
    deleteSlot(slotId);
}

async function deleteSlot(slotId) {
    try {
        await fetch(window.API_URL + '/doctors/schedule/' + slotId, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('nebras_token') 
            }
        });
        showToast('Créneau supprimé', 'success');
        await loadAllData();
    } catch (error) {
        showToast('Erreur: ' + error.message, 'error');
    }
}

function startSession(appointmentId) {
    showToast('Démarrage de la séance...', 'info');
}

window.navigateWeek = navigateWeek;
window.toggleBlockDay = toggleBlockDay;
window.openAddSlotModal = openAddSlotModal;
window.closeAddSlotModal = closeAddSlotModal;
window.addNewSlot = addNewSlot;
window.confirmDeleteSlot = confirmDeleteSlot;
window.deleteSlot = deleteSlot;
window.startSession = startSession;
window.showToast = showToast;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.getMediaLabel = getMediaLabel;

document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
    link.addEventListener('click', () => {
        sessionStorage.setItem('menuScrollPos', document.querySelector('.nav-menu').scrollTop);
    });
});

window.addEventListener('load', () => {
    const scrollPos = sessionStorage.getItem('menuScrollPos');
    if (scrollPos) {
        document.querySelector('.nav-menu').scrollTop = scrollPos;
    }
});