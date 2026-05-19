// Start immediately
console.log('patient_therapie.js loaded');

document.addEventListener('DOMContentLoaded', highlightCurrentSidebarLink);

// Use API_URL from api.js

const iconMap = {
    stress: '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
    confidence: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    couple: '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    anxiety: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.08 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3 9.24 3 10.91 3.81 12 5.08 13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    group: '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'
};

function formatDuration(minutes) {
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h${mins}` : `${hours}h`;
    }
    return `${minutes}min`;
}

function getDefaultIcon() {
    return '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
}

async function loadGroups() {
    const grid = document.querySelector('.groups-grid');
    if (!grid) {
        console.log('Grid not found');
        return;
    }

    grid.innerHTML = '<div class="loading">Chargement des groupes...</div>';

    try {
        const token = localStorage.getItem('nebras_token');
        const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
        
        console.log('Fetching groups from API...');
        console.log('Token being used:', token);
        const response = await fetch(API_URL + '/groups', { headers });
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error('HTTP error: ' + response.status);
        }
        
        const data = await response.json();
        console.log('Groups data:', data);

        if (!data.groups || data.groups.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>Aucun groupe disponible</p></div>';
            return;
        }

        grid.innerHTML = data.groups.map(group => {
            const icon = iconMap[group.icon] || getDefaultIcon();
            
            let btnText = 'Rejoindre le groupe';
            let btnClass = 'join-btn';
            let disabled = '';
            let btnAction = `onclick="joinGroup('${group.id}')"`;
            
            if (group.membershipStatus === 'accepted') {
                btnText = 'Déjà inscrit';
                btnClass = 'join-btn joined';
                disabled = 'disabled';
                btnAction = '';
            } else if (group.membershipStatus === 'pending') {
                btnText = 'En attente de validation';
                btnClass = 'join-btn pending';
                disabled = 'disabled';
                btnAction = '';
            } else if (group.membershipStatus === 'rejected') {
                btnText = 'Rejoindre le groupe';
                btnClass = 'join-btn';
                btnAction = `onclick="joinGroup('${group.id}')"`;
            }

            return `
                <div class="group-card">
                    <div class="group-image">
                        <span class="group-icon">${icon}</span>
                    </div>
                    <div class="group-info">
                        <h3>${group.name}</h3>
                        <p class="group-description">${group.description}</p>
                        <div class="group-details">
                            <span>
                                <span class="detail-icon"><svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg></span>
                                ${group.day} ${group.time}
                            </span>
                            <span>
                                <span class="detail-icon"><svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></span>
                                ${group.availablePlaces} places
                            </span>
                            <span>
                                <span class="detail-icon"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11.7V7h-2v6.3l4.2 2.52.8-1.32L13 13.7z"/></svg></span>
                                ${formatDuration(group.duration)}
                            </span>
                        </div>
                        <button class="${btnClass}" ${btnAction} ${disabled}>${btnText}</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading groups:', error);
        grid.innerHTML = '<div class="error">Erreur lors du chargement des groupes: ' + error.message + '</div>';
    }
}

async function joinGroup(groupId) {
    console.log('joinGroup called with:', groupId);
    const token = localStorage.getItem('nebras_token');
    console.log('token exists:', !!token);
    if (!token) {
        showToast('Veuillez vous connecter pour rejoindre un groupe', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL + '/groups/join', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ groupId })
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (response.ok) {
            showToast(data.message || 'Demande envoyée!', 'success');
            loadGroups();
        } else {
            showToast(data.error || 'Erreur lors de la demande', 'error');
        }
    } catch (error) {
        console.error('Error joining group:', error);
        showToast('Erreur lors de la demande', 'error');
    }
}

// ============================================
// GROUP SESSION RATING MODAL
// ============================================

let groupRatingData = null;
let groupSelectedRating = 0;
let groupRatingModalEl = null;

window.handleGroupSessionEnded = function(data) {
    groupRatingData = {
        doctorId: data.doctorId,
        doctorName: data.doctorName || 'Psychologue',
        groupId: data.groupId
    };
    // Also persist in sessionStorage as backup (belt-and-suspenders with patient-call-listener)
    try {
        sessionStorage.setItem('pendingGroupRating', JSON.stringify(groupRatingData));
    } catch (e) {}
    showGroupRatingModal();
    // Immediately re-fetch groups so ended session disappears from UI
    loadGroups();
};

function createGroupRatingModal() {
    if (document.getElementById('groupSessionRatingModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'groupSessionRatingModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 20px; padding: 32px; width: 420px; max-width: 90%; text-align: center; animation: fadeInUp 0.3s ease; box-shadow: 0 25px 60px rgba(0,0,0,0.2);">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
            </div>
            <h3 style="margin: 0 0 4px; color: #091346; font-size: 20px;">Évaluer la séance de groupe</h3>
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;" id="groupRatingDoctorName">Notez votre séance avec le psychologue</p>
            
            <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 20px;" id="groupRatingStars">
                ${[1,2,3,4,5].map(i => `
                    <button type="button" data-gstar="${i}" style="background: none; border: none; cursor: pointer; padding: 4px; font-size: 36px; line-height: 1; color: #d1d5db; transition: color 0.15s, transform 0.15s;" onmouseenter="highlightGroupStars(${i})" onmouseleave="resetGroupStars()" onclick="selectGroupStar(${i})">★</button>
                `).join('')}
            </div>
            
            <textarea id="groupRatingComment" placeholder="Partagez votre expérience (optionnel)" style="width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; resize: none; height: 80px; box-sizing: border-box; margin-bottom: 16px; transition: border-color 0.2s;"></textarea>
            
            <button onclick="submitGroupRating()" id="submitGroupRatingBtn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; opacity: 0.5;" disabled>Envoyer la note</button>
            
            <button onclick="skipGroupRating()" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; margin-top: 12px; padding: 8px; text-decoration: underline; text-underline-offset: 3px;">Passer</button>
            
            <p style="font-size: 11px; color: #cbd5e1; margin: 12px 0 0;">Votre avis nous aide à améliorer nos services</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    groupRatingModalEl = modal;
}

function showGroupRatingModal() {
    if (!groupRatingData) return;
    createGroupRatingModal();
    groupSelectedRating = 0;
    const nameEl = document.getElementById('groupRatingDoctorName');
    if (nameEl) {
        nameEl.textContent = `Notez votre séance avec ${groupRatingData.doctorName}`;
    }
    groupRatingModalEl.style.display = 'flex';
}

window.highlightGroupStars = function(count) {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-gstar="${i}"]`);
        if (btn) {
            btn.style.color = i <= count ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= count ? 'scale(1.15)' : 'scale(1)';
        }
    }
};

window.resetGroupStars = function() {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-gstar="${i}"]`);
        if (btn) {
            btn.style.color = i <= groupSelectedRating ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= groupSelectedRating ? 'scale(1.15)' : 'scale(1)';
        }
    }
};

window.selectGroupStar = function(count) {
    groupSelectedRating = count;
    const submitBtn = document.getElementById('submitGroupRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
    resetGroupStars();
};

window.submitGroupRating = async function() {
    if (groupSelectedRating < 1 || !groupRatingData) return;
    
    const submitBtn = document.getElementById('submitGroupRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
    }
    
    try {
        const comment = document.getElementById('groupRatingComment')?.value?.trim() || '';
        
        const token = localStorage.getItem('nebras_token');
        const response = await fetch(API_URL + '/groups/rate', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                doctorId: groupRatingData.doctorId,
                groupId: groupRatingData.groupId,
                rating: groupSelectedRating,
                comment: comment || undefined
            })
        });
        
        const result = await response.json();
        
        if (response.ok || result.success) {
            clearGroupRatingSession();
            if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
            showToast('Merci pour votre évaluation !', 'success');
        } else {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Envoyer la note';
            }
            if (response.status === 409) {
                clearGroupRatingSession();
                if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
                return;
            }
            showToast(result.error || 'Erreur lors de l\'envoi', 'error');
        }
    } catch (error) {
        console.error('Group rating error:', error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer la note';
        }
        showToast('Erreur lors de l\'envoi', 'error');
    }
};

window.skipGroupRating = function() {
    clearGroupRatingSession();
    if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
};

function clearGroupRatingSession() {
    if (groupRatingData?.groupId && groupRatingData?.doctorId) {
        const pid = getCurrentUser()?.id || 'unknown';
        sessionStorage.setItem(`group_rated_${groupRatingData.groupId}_${groupRatingData.doctorId}_${pid}`, '1');
    }
    sessionStorage.removeItem('pendingGroupRating');
    groupRatingData = null;
    groupSelectedRating = 0;
}

function checkPendingGroupRating() {
    try {
        const pending = sessionStorage.getItem('pendingGroupRating');
        if (pending) {
            const data = JSON.parse(pending);
            if (data.doctorId && data.groupId) {
                const pid = getCurrentUser()?.id || 'unknown';
                const alreadyRated = sessionStorage.getItem(`group_rated_${data.groupId}_${data.doctorId}_${pid}`);
                if (alreadyRated) {
                    sessionStorage.removeItem('pendingGroupRating');
                    return;
                }
                groupRatingData = {
                    doctorId: data.doctorId,
                    doctorName: data.doctorName || 'Psychologue',
                    groupId: data.groupId
                };
                showGroupRatingModal();
            }
        }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, calling loadGroups...');
    loadGroups();
    checkPendingGroupRating();
    // Listen for group session ended events dispatched by patient-call-listener
    window.addEventListener('grouptherapy:session-ended', function() {
        loadGroups();
    });
    // Listen for any group data change (created, updated, etc.)
    window.addEventListener('grouptherapy:data-changed', function() {
        loadGroups();
    });
});