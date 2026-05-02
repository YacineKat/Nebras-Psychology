let groups = [
    {
        id: 1,
        title: "Gestion du stress",
        description: "Apprenez à gérer votre stress quotidien avec des techniques de relaxation.",
        theme: "Stress",
        day: "Mercredi",
        time: "19:00",
        duration: "1h30",
        maxPlaces: 8,
        currentPlaces: 2,
        price: 1000,
        waitingList: [
            { id: 101, name: "Sofia Kaci", requestDate: "15/04/2025", hasIndividualSession: false },
            { id: 102, name: "Karim Zerouali", requestDate: "14/04/2025", hasIndividualSession: true }
        ],
        participants: [
            { id: 1, name: "Maria Benbernou", joinedDate: "10/04/2025" },
            { id: 2, name: "Amira Mansouri", joinedDate: "11/04/2025" }
        ]
    }
];

function renderGroups() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    
    container.innerHTML = groups.map(group => `
        <div class="group-card">
            <div class="group-header">
                <h3>${group.title}</h3>
                <span class="group-theme">${group.theme}</span>
            </div>
            <p class="group-desc">${group.description}</p>
            <div class="group-details">
                <span>📅 ${group.day} à ${group.time}</span>
                <span>⏱️ ${group.duration}</span>
                <span>👥 ${group.currentPlaces}/${group.maxPlaces} places</span>
                <span>💰 ${group.price} DA</span>
            </div>
            <div class="group-actions">
                <button class="view-group-btn" onclick="viewGroupDetails(${group.id})">Voir détails</button>
            </div>
        </div>
    `).join('');
}

function viewGroupDetails(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    
    document.getElementById('groupDetailsContent').innerHTML = `
        <h3>${group.title}</h3>
        <p>${group.description}</p>
        <p><strong>Jour:</strong> ${group.day}</p>
        <p><strong>Horaire:</strong> ${group.time}</p>
        <p><strong>Durée:</strong> ${group.duration}</p>
        <p><strong>Places:</strong> ${group.currentPlaces}/${group.maxPlaces}</p>
        <p><strong>Prix:</strong> ${group.price} DA</p>
    `;
    document.getElementById('groupDetailsModal').classList.add('active');
}

function closeGroupDetailsModal() {
    document.getElementById('groupDetailsModal').classList.remove('active');
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeGroupDetailsModal();
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

renderGroups();