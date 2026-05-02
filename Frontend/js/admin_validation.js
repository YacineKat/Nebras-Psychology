const candidatsData = {
    'Ahmed Mansouri': {
        type: 'Psychologue',
        specialite: 'Psychologie clinique',
        universite: "Université d'Alger",
        demande: '15/04/2026',
        email: 'ahmed.mansouri@email.com',
        telephone: '+213 5XX XX XX XX',
        documents: [
            { name: 'Diplôme Master', url: '#' },
            { name: 'CV détaillé', url: '#' },
            { name: 'Carte professionnelle', url: '#' }
        ]
    },
    'Leila Zerouali': {
        type: 'Psychologue',
        specialite: 'Thérapie Cognitive et Comportementale (TCC)',
        universite: "Université d'Oran",
        demande: '14/04/2026',
        email: 'leila.zerouali@email.com',
        telephone: '+213 5XX XX XX XX',
        documents: [
            { name: 'Diplôme Master', url: '#' },
            { name: 'CV détaillé', url: '#' }
        ]
    },
    'Sofiane Hamdi': {
        type: 'Psychologue',
        specialite: 'Psychanalyse',
        universite: 'Université de Constantine',
        demande: '12/04/2026',
        email: 'sofiane.hamdi@email.com',
        telephone: '+213 5XX XX XX XX',
        documents: [
            { name: 'Diplôme Master', url: '#' },
            { name: 'CV détaillé', url: '#' }
        ]
    },
    'Sarah Mansouri': {
        type: 'Counselor',
        specialite: 'Conseil en orientation',
        universite: "Université d'Alger",
        demande: '10/04/2026',
        email: 'sarah.mansouri@email.com',
        telephone: '+213 5XX XX XX XX',
        documents: [
            { name: 'Certificat de formation', url: '#' },
            { name: 'CV détaillé', url: '#' }
        ]
    }
};

function showDetails(nom) {
    const candidat = candidatsData[nom];
    if (!candidat) return;
    
    const detailsDiv = document.getElementById('candidatDetails');
    detailsDiv.innerHTML = `
        <h3>${nom}</h3>
        <p><strong>Type:</strong> ${candidat.type}</p>
        <p><strong>Spécialité:</strong> ${candidat.specialite}</p>
        <p><strong>Université:</strong> ${candidat.universite}</p>
        <p><strong>Date de demande:</strong> ${candidat.demande}</p>
        <p><strong>Email:</strong> ${candidat.email}</p>
        <p><strong>Téléphone:</strong> ${candidat.telephone}</p>
        <div class="documents-section">
            <h4>Documents:</h4>
            <ul>
                ${candidat.documents.map(doc => `<li><a href="${doc.url}">${doc.name}</a></li>`).join('')}
            </ul>
        </div>
    `;
    
    document.getElementById('detailsModal').classList.add('active');
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.remove('active');
}

function approveCandidat(nom) {
    if (confirm(`✅ Approver ${nom} ?`)) {
        showToast(`${nom} a été approuvé !`);
        closeDetailsModal();
    }
}

function rejectCandidat(nom) {
    if (confirm(`❌ Rejeter ${nom} ?`)) {
        showToast(`${nom} a été rejeté.`);
        closeDetailsModal();
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeDetailsModal();
    }
});