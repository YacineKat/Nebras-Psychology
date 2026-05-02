let patientsData = [
    { id: 1, name: "Maria Benbernou", motif: "Anxiété", seances: 8, lastSeance: "12/04/2025", lastSeanceDate: new Date(2025, 3, 12), notes: [
        { id: 1, date: "12/04/2025", text: "Progression positive sur la gestion de l'anxiété. Le patient utilise bien les techniques de respiration." },
        { id: 2, date: "05/04/2025", text: "Difficultés à gérer le stress au travail. Recommandation: exercices quotidiens." }
    ]},
    { id: 2, name: "Amira Mansouri", motif: "Stress", seances: 5, lastSeance: "10/04/2025", lastSeanceDate: new Date(2025, 3, 10), notes: [
        { id: 1, date: "10/04/2025", text: "Stress lié aux examens. Techniques de relaxation efficaces." },
        { id: 2, date: "03/04/2025", text: "Première séance. Patient stressé par la charge de travail." }
    ]},
    { id: 3, name: "Youcef Hamdi", motif: "Confiance en soi", seances: 3, lastSeance: "08/04/2025", lastSeanceDate: new Date(2025, 3, 8), notes: [
        { id: 1, date: "08/04/2025", text: "Progrès sur l'affirmation de soi. Participation active." }
    ]},
    { id: 4, name: "Lina Zerouali", motif: "Dépression", seances: 12, lastSeance: "15/04/2025", lastSeanceDate: new Date(2025, 3, 15), notes: [
        { id: 1, date: "15/04/2025", text: "Amélioration notable de l'humeur. Continue les activités sociales." },
        { id: 2, date: "08/04/2025", text: "Difficultés à sortir du lit le matin. Suivi de routine." },
        { id: 3, date: "01/04/2025", text: "Début du traitement. Patient motivé." }
    ]},
    { id: 5, name: "Mehdi Bouazza", motif: "Anxiété sociale", seances: 2, lastSeance: "05/04/2025", lastSeanceDate: new Date(2025, 3, 5), notes: [
        { id: 1, date: "05/04/2025", text: "Évite les situations sociales. Travail sur l'exposition progressive." }
    ]},
    { id: 6, name: "Sofia Kaci", motif: "Stress post-traumatique", seances: 6, lastSeance: "14/04/2025", lastSeanceDate: new Date(2025, 3, 14), notes: [
        { id: 1, date: "14/04/2025", text: "Flashbacks moins fréquents. Bonne évolution." },
        { id: 2, date: "07/04/2025", text: "Difficultés de sommeil. Techniques de relaxation." }
    ]}
];

let currentPatientId = null;
let nextNoteId = 10;

function renderPatients() {
    const container = document.getElementById('patientsGrid');
    if (!container) return;
    
    container.innerHTML = patientsData.map(patient => `
        <div class="patient-card" data-id="${patient.id}" data-name="${patient.name.toLowerCase()}" data-motif="${patient.motif}" data-lastdate="${patient.lastSeanceDate}">
            <div class="patient-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="30" height="30"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg></div>
            <div class="patient-info">
                <h3>${patient.name}</h3>
                <p>${patient.motif} · ${patient.seances} séances</p>
                <small>Dernière séance: ${patient.lastSeance}</small>
            </div>
            <button class="patient-btn" onclick="openNotesModal(${patient.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 3h5v5M14 10l6-6M3 16l8-8M3 21h18"/></svg>
                Notes (${patient.notes.length})
            </button>
        </div>
    `).join('');
}

function filterPatients() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const motifFilter = document.getElementById('filterMotif').value;
    const dateFilter = document.getElementById('filterDate').value;
    
    const cards = document.querySelectorAll('.patient-card');
    cards.forEach(card => {
        const name = card.getAttribute('data-name');
        const motif = card.getAttribute('data-motif');
        const patient = patientsData.find(p => p.id === parseInt(card.getAttribute('data-id')));
        
        let showByName = name.includes(searchTerm);
        let showByMotif = !motifFilter || motif === motifFilter;
        let showByDate = true;
        
        if (dateFilter && patient) {
            const lastDate = patient.lastSeanceDate;
            const today = new Date();
            const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
            showByDate = diffDays <= parseInt(dateFilter);
        }
        
        if (showByName && showByMotif && showByDate) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterMotif').value = '';
    document.getElementById('filterDate').value = '';
    filterPatients();
}

function openNotesModal(patientId) {
    currentPatientId = patientId;
    const patient = patientsData.find(p => p.id === patientId);
    if (!patient) return;
    
    document.getElementById('notesModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    renderNotes(patient);
}

function renderNotes(patient) {
    const container = document.getElementById('notesList');
    if (patient.notes.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 30px; color: #999;">Aucune note pour ce patient</div>';
        return;
    }
    
    container.innerHTML = patient.notes.map(note => `
        <div class="note-item" data-note-id="${note.id}">
            <div class="note-date">
                <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B39DDB" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${note.date}</span>
                <div class="note-actions">
                    <button class="edit-note-btn" onclick="editNote(${patient.id}, ${note.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B39DDB" stroke-width="2"><path d="M17 3l4 4-7 7H10v-4l7-7z"/><path d="M3 21h18"/></svg>
                    </button>
                    <button class="delete-note-btn" onclick="deleteNote(${patient.id}, ${note.id})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                    </button>
                </div>
            </div>
            <div class="note-text">${note.text}</div>
        </div>
    `).join('');
}

function addNote() {
    const noteText = document.getElementById('newNoteText').value.trim();
    if (!noteText) {
        showToast('Veuillez écrire une note');
        return;
    }
    
    const patient = patientsData.find(p => p.id === currentPatientId);
    if (!patient) return;
    
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    
    const newNote = {
        id: nextNoteId++,
        date: dateStr,
        text: noteText
    };
    
    patient.notes.push(newNote);
    document.getElementById('newNoteText').value = '';
    renderNotes(patient);
    renderPatients();
}

function editNote(patientId, noteId) {
    const patient = patientsData.find(p => p.id === patientId);
    if (!patient) return;
    const note = patient.notes.find(n => n.id === noteId);
    if (!note) return;
    
    const newText = prompt('Modifier la note :', note.text);
    if (newText && newText.trim()) {
        note.text = newText.trim();
        renderNotes(patient);
    }
}

function deleteNote(patientId, noteId) {
    if (!confirm('Supprimer cette note ?')) return;
    
    const patient = patientsData.find(p => p.id === patientId);
    if (!patient) return;
    patient.notes = patient.notes.filter(n => n.id !== noteId);
    renderNotes(patient);
    renderPatients();
}

function closeNotesModal() {
    document.getElementById('notesModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeNotesModal();
    }
});

renderPatients();