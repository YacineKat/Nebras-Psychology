// ============================================
// VIDEO CALL UTILS - Shared helpers
// ============================================

function primeParticipantAvatars(groupData) {
    if (!groupData) return;

    const doctor = groupData.doctor || groupData.psychologue;
    if (doctor?.id && doctor.avatar) {
        participantAvatars[doctor.id] = doctor.avatar;
    }

    const participants = groupData.participants || [];
    participants.forEach((participant) => {
        if (participant?.userId && participant.avatar) {
            participantAvatars[participant.userId] = participant.avatar;
        }
    });
}

const AVATAR_COLORS = ['#44AA99', '#091346', '#EF4444', '#F59E0B', '#6366F1', '#EC4899', '#14B8A6', '#F97316'];

function getAvatarColor(name) {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function setAvatarInitial(elementId, name, imageUrl) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (imageUrl) {
        el.innerHTML = `<img src="${encodeURI(imageUrl)}" alt="${name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
        el.style.background = 'transparent';
    } else {
        el.textContent = name ? name.charAt(0).toUpperCase() : '?';
        el.style.background = getAvatarColor(name);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type) {
    const existing = document.querySelector('.vc-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'vc-toast';
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);padding:14px 28px;border-radius:12px;color:#fff;font-weight:600;font-size:14px;z-index:999999;box-shadow:0 8px 30px rgba(0,0,0,0.15);background:' + (type === 'error' ? '#ef4444' : '#44AA99') + ';';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
