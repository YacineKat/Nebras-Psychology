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
