// ============================================
// VIDEO CALL GROUP UI - Tiles, metadata, and layout
// ============================================

function setRemoteParticipantDisplay(name, avatarUrl) {
    const remoteName = document.getElementById('remoteParticipantName');
    if (remoteName && name) {
        remoteName.textContent = name;
    }
    setAvatarInitial('remoteAvatarCircle', name, avatarUrl);
}

function hydrateGroupParticipantMetadata() {
    if (!groupId) return;

    const loadGroup = async () => {
        try {
            const token = localStorage.getItem('nebras_token');
            const endpoint = isDoctor ? '/psychologue/groups/' + groupId : '/my-groups';
            const resp = await fetch(window.API_URL + endpoint, {
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
            });
            if (!resp.ok) return;

            const data = await resp.json();
            const group = isDoctor ? (data.group || data) : (data.groups || []).find((item) => item.id === groupId);
            if (!group) return;

            doctorGroupDetails = isDoctor ? (data.group || data) : doctorGroupDetails;
            primeParticipantAvatars(group);

            if (isDoctor && group?.doctor?.id) {
                doctorIdForRating = group.doctor.id;
            }
            if (group?.doctor?.name) {
                doctorNameForRating = group.doctor.name;
            }

            refreshGroupParticipantAvatars();
        } catch (e) {
            console.log('Could not hydrate group metadata:', e);
        }
    };

    void loadGroup();
}

function refreshGroupParticipantAvatars() {
    if (!participantAvatars) return;

    const localAvatar = document.getElementById('localAvatarCircle');
    if (localAvatar && currentUser?.fullname) {
        setAvatarInitial('localAvatarCircle', currentUser.fullname, localAvatarUrl);
    }

    Object.values(otherParticipants).forEach((participant) => {
        const avatarUrl = participant?.avatarUrl || participantAvatars?.[participant?.userId] || null;
        if (avatarUrl || participant?.name) {
            hydrateParticipantTile(participant, avatarUrl);
        }
    });
}

function hydrateParticipantTile(participant, avatarUrl) {
    const circle = document.querySelector(`#participant_${participant?.id} .avatar-circle`);
    if (!circle) return;

    if (avatarUrl) {
        circle.style.background = 'transparent';
        circle.innerHTML = `<img src="${encodeURI(avatarUrl)}" alt="${participant?.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
        circle.textContent = (participant?.name || '?')[0].toUpperCase();
        circle.style.background = getAvatarColor(participant?.name);
    }
}

function addGroupParticipantTile(participant) {
    const grid = document.getElementById('participantGrid');
    if (!grid) return null;
    const existing = document.getElementById(`participant_${participant.id}`);
    if (existing) return document.getElementById(`video_${participant.id}`);

    const tile = document.createElement('div');
    tile.id = `participant_${participant.id}`;
    tile.className = 'participant-tile tile-enter';

    const video = document.createElement('video');
    video.id = `video_${participant.id}`;
    video.autoplay = true;
    video.playsinline = true;

    const avatarEl = document.createElement('div');
    avatarEl.id = `avatar_${participant.id}`;
    avatarEl.className = 'tile-avatar';
    avatarEl.style.display = 'flex';
    const avatarUrl = participant.avatarUrl || participantAvatars?.[participant?.userId] || null;
    const circle = document.createElement('div');
    circle.className = 'avatar-circle';
    circle.style.background = avatarUrl ? 'transparent' : getAvatarColor(participant.name);
    if (avatarUrl) {
        circle.innerHTML = `<img src="${encodeURI(avatarUrl)}" alt="${participant.name || ''}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
        circle.textContent = (participant.name || '?')[0].toUpperCase();
    }
    avatarEl.appendChild(circle);

    const info = document.createElement('div');
    info.className = 'tile-info';
    info.textContent = participant.name || 'Participant';

    const muteBadge = document.createElement('div');
    muteBadge.id = `mute_${participant.id}`;
    muteBadge.className = 'tile-badge badge-mute';
    muteBadge.style.display = 'none';
    muteBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`;

    const videoOffBadge = document.createElement('div');
    videoOffBadge.id = `videooff_${participant.id}`;
    videoOffBadge.className = 'tile-badge badge-videooff';
    videoOffBadge.style.display = 'flex';
    videoOffBadge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M1 1l22 22M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg>`;

    tile.appendChild(video);
    tile.appendChild(avatarEl);
    tile.appendChild(info);
    tile.appendChild(muteBadge);
    tile.appendChild(videoOffBadge);
    grid.appendChild(tile);

    setTimeout(() => tile.classList.remove('tile-enter'), 350);
    updateGridLayout();

    return video;
}

function removeGroupParticipantTile(socketId) {
    const tile = document.getElementById(`participant_${socketId}`);
    if (tile) {
        tile.classList.add('tile-exit');
        setTimeout(() => {
            tile.remove();
            updateGridLayout();
        }, 250);
    }
}

function updateGridLayout() {
    const grid = document.getElementById('participantGrid');
    if (!grid) return;
    const participantTiles = grid.querySelectorAll('[id^="participant_"]');
    const remoteCount = participantTiles.length;
    const hasLocal = !!document.getElementById('localVideoContainer');
    const total = remoteCount + (hasLocal ? 1 : 0);
    grid.className = grid.className.split(' ').filter(c => !c.startsWith('count-')).join(' ').trim();
    const count = Math.min(Math.max(total, 0), 16);
    grid.classList.add(`count-${count}`);

    const countText = document.getElementById('participantCountText');
    if (countText) {
        if (total > 1) {
            countText.textContent = `${total} participants`;
            countText.style.display = 'inline';
        } else if (total === 1) {
            countText.textContent = `1 participant`;
            countText.style.display = 'inline';
        } else {
            countText.style.display = 'none';
        }
    }
}

function updateGroupParticipantTileVideo(socketId, isOff) {
    const videoEl = document.getElementById(`video_${socketId}`);
    const avatarEl = document.getElementById(`avatar_${socketId}`);
    const videoOffBadge = document.getElementById(`videooff_${socketId}`);
    if (videoEl) videoEl.style.display = isOff ? 'none' : 'block';
    if (avatarEl) avatarEl.style.display = isOff ? 'flex' : 'none';
    if (videoOffBadge) videoOffBadge.style.display = isOff ? 'flex' : 'none';
}
