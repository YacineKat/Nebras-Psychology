// ============================================
// VIDEO CALL DOCTOR ACTIONS - Edit call, participant actions, extras
// ============================================
// UI-ONLY module: modal management and DOM interactions.

// Edit call modal
function openEditCallModal() {
    const modal = document.getElementById('editCallModal');
    if (!modal) return;

    if (doctorGroupDetails) {
        document.getElementById('editCallTitle').value = doctorGroupDetails.name || '';
        document.getElementById('editCallMaxParticipants').value = doctorGroupDetails.maxPlaces || 10;
        document.getElementById('editCallPrice').value = doctorGroupDetails.price || '';
    }

    modal.style.display = 'flex';
}

function closeEditCallModal() {
    const modal = document.getElementById('editCallModal');
    if (modal) modal.style.display = 'none';
}

async function saveCallDetails() {
    const title = document.getElementById('editCallTitle')?.value?.trim();
    const maxParticipants = parseInt(document.getElementById('editCallMaxParticipants')?.value || '10', 10);
    const price = parseInt(document.getElementById('editCallPrice')?.value || '0', 10);

    if (!title || !groupId || !doctorGroupDetails) return;

    const dayMap = { 'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3, 'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6 };
    const existing = doctorGroupDetails;

    try {
        const token = localStorage.getItem('nebras_token');
        const resp = await fetch(window.API_URL + '/psychologue/groups/' + groupId, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: title,
                description: existing.description || '',
                dayOfWeek: dayMap[existing.day] !== undefined ? dayMap[existing.day] : 0,
                time: existing.time || '00:00',
                duration: existing.duration || 90,
                maxParticipants,
                price
            })
        });

        if (resp.ok) {
            doctorGroupDetails.name = title;
            doctorGroupDetails.maxPlaces = maxParticipants;
            doctorGroupDetails.price = price;
            showToast('Détails de l\'appel mis à jour', 'success');
            document.getElementById('callTitle').textContent = title;
            closeEditCallModal();
        } else {
            showToast('Erreur lors de la mise à jour', 'error');
        }
    } catch (error) {
        console.error('Save call details error:', error);
        showToast('Erreur lors de la mise à jour', 'error');
    }
}

// Participant actions
let selectedParticipantId = null;

function openParticipantActions(participantId) {
    selectedParticipantId = participantId;
    const modal = document.getElementById('participantActionsModal');
    const titleEl = document.getElementById('participantModalTitle');
    if (titleEl) {
        const name = otherParticipants[participantId]?.name || 'Participant';
        titleEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#091346" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escapeHtml(name)}`;
    }
    if (modal) modal.style.display = 'flex';
}

function closeParticipantActionsModal() {
    const modal = document.getElementById('participantActionsModal');
    if (modal) modal.style.display = 'none';
    selectedParticipantId = null;
}


function removeParticipant() {
    if (!selectedParticipantId || !videoSocket?.connected) return;
    const name = otherParticipants[selectedParticipantId]?.name || 'Participant';
    if (!confirm(`Retirer ${name} du groupe ?`)) return;

    videoSocket.emit('remove-participant', {
        roomId,
        targetId: selectedParticipantId
    });
    showToast(`${name} retiré du groupe`, 'info');
    closeParticipantActionsModal();
}

// Chat extras
function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex';
}

function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.style.display = 'none';
}

function clearChat() {
    groupChatMessages = [];
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
}
