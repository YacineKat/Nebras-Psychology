// Start immediately
console.log('patient_therapie.js loaded');

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

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, calling loadGroups...');
    loadGroups();
});