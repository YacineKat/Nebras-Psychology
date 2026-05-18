// ============================================
// VIDEO CALL RATINGS - Group and 1-on-1 rating modals
// ============================================
// UI-ONLY module: creates modals, handles star interaction, submits ratings.

// Group rating state
let groupRatingModalEl = null;
let groupSelectedRating = 0;

function showGroupRatingModal() {
    if (document.getElementById('groupCallRatingModal')) return;

    const modal = document.createElement('div');
    modal.id = 'groupCallRatingModal';
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
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;" id="groupRatingDoctorName">Notez votre séance avec ${doctorNameForRating || 'le Psychologue'}</p>

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
    if (groupSelectedRating < 1 || !doctorIdForRating || !groupId) return;

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
                doctorId: doctorIdForRating,
                groupId: groupId,
                rating: groupSelectedRating,
                comment: comment || undefined
            })
        });

        const result = await response.json();

        if (response.ok || result.success) {
            clearGroupRatingSession();
            if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
            if (typeof showToast === 'function') {
                showToast('Merci pour votre évaluation !', 'success');
            }
        } else {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Envoyer la note';
            }
            if (response.status === 409) {
                clearGroupRatingSession();
                if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
                window.location.href = 'patient_dashboard.html';
                return;
            }
        }
    } catch (error) {
        console.error('Group rating error:', error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer la note';
        }
    }

    window.location.href = 'patient_dashboard.html';
};

window.skipGroupRating = function() {
    clearGroupRatingSession();
    if (groupRatingModalEl) groupRatingModalEl.style.display = 'none';
    window.location.href = 'patient_dashboard.html';
};

function clearGroupRatingSession() {
    if (groupId && doctorIdForRating) {
        const pid = getCurrentUser()?.id || 'unknown';
        sessionStorage.setItem(`group_rated_${groupId}_${doctorIdForRating}_${pid}`, '1');
    }
    sessionStorage.removeItem('pendingGroupRating');
    sessionStorage.removeItem('groupCallRoom');
    sessionStorage.removeItem('groupCallGroupId');
    sessionStorage.removeItem('groupCallDoctorId');
    groupSelectedRating = 0;
}

// ============================================
// 1-ON-1 POST-CALL RATING MODAL
// ============================================

let ratingModalEl = null;
let selectedRating = 0;

function createRatingModal() {
    if (document.getElementById('postCallRatingModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'postCallRatingModal';
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
            <h3 style="margin: 0 0 4px; color: #091346; font-size: 20px;">Évaluer la consultation</h3>
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;" id="ratingDoctorName">Notez votre séance avec le psychologue</p>
            
            <div style="display: flex; justify-content: center; gap: 6px; margin-bottom: 20px;" id="ratingStars">
                ${[1,2,3,4,5].map(i => `
                    <button type="button" data-star="${i}" style="background: none; border: none; cursor: pointer; padding: 4px; font-size: 36px; line-height: 1; color: #d1d5db; transition: color 0.15s, transform 0.15s;" onmouseenter="highlightStars(${i})" onmouseleave="resetStars()" onclick="selectStar(${i})">★</button>
                `).join('')}
            </div>
            
            <textarea id="ratingComment" placeholder="Partagez votre expérience (optionnel)" style="width: 100%; padding: 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; font-size: 14px; font-family: inherit; resize: none; height: 80px; box-sizing: border-box; margin-bottom: 16px; transition: border-color 0.2s;" onfocus="this.style.borderColor='#44AA99'" onblur="this.style.borderColor='#e2e8f0'"></textarea>
            
            <button onclick="submitRating()" id="submitRatingBtn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #44AA99 0%, #3d9a8b 100%); color: white; border: none; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; transition: all 0.3s; opacity: 0.5;" disabled>Envoyer la note</button>
            
            <button onclick="skipRating()" style="background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer; margin-top: 12px; padding: 8px; text-decoration: underline; text-underline-offset: 3px;">Passer</button>
            
            <p style="font-size: 11px; color: #cbd5e1; margin: 12px 0 0;">Votre avis nous aide à améliorer nos services</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    ratingModalEl = modal;
}

function showRatingModal() {
    createRatingModal();
    selectedRating = 0;
    const nameEl = document.getElementById('ratingDoctorName');
    if (nameEl && doctorNameForRating) {
        nameEl.textContent = `Notez votre séance avec ${doctorNameForRating}`;
    }
    ratingModalEl.style.display = 'flex';
}

function highlightStars(count) {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-star="${i}"]`);
        if (btn) {
            btn.style.color = i <= count ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= count ? 'scale(1.15)' : 'scale(1)';
        }
    }
}

function resetStars() {
    for (let i = 1; i <= 5; i++) {
        const btn = document.querySelector(`[data-star="${i}"]`);
        if (btn) {
            btn.style.color = i <= selectedRating ? '#f59e0b' : '#d1d5db';
            btn.style.transform = i <= selectedRating ? 'scale(1.15)' : 'scale(1)';
        }
    }
}

function selectStar(count) {
    selectedRating = count;
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
    resetStars();
}

async function submitRating() {
    if (selectedRating < 1 || !doctorIdForRating || !sessionAppointmentId) return;
    
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Envoi en cours...';
    }
    
    try {
        const comment = document.getElementById('ratingComment')?.value?.trim() || '';
        
        await reviewAPI.create({
            doctorId: doctorIdForRating,
            appointmentId: sessionAppointmentId,
            rating: selectedRating,
            comment: comment || undefined
        });
        
        clearRatingSession();
        if (ratingModalEl) ratingModalEl.style.display = 'none';
        window.location.href = 'patient_dashboard.html';
    } catch (error) {
        console.error('Rating error:', error);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Envoyer la note';
        }
        if (error.message && error.message.includes('déjà')) {
            clearRatingSession();
            if (ratingModalEl) ratingModalEl.style.display = 'none';
            window.location.href = 'patient_dashboard.html';
            return;
        }
        showToast('Erreur lors de l\'envoi', 'error');
    }
}

function clearRatingSession() {
    sessionStorage.removeItem('pendingRating');
    sessionAppointmentId = null;
    doctorIdForRating = null;
    doctorNameForRating = null;
}

function skipRating() {
    clearRatingSession();
    if (ratingModalEl) ratingModalEl.style.display = 'none';
    window.location.href = 'patient_dashboard.html';
}
