// Variables
let currentStep = 1;
const totalSteps = 8;
let userData = {};

// Listes
const motifsList = [
    "Addictions", "Anxiété", "Confiance en soi", "Conseil en orientation",
    "Couple", "Deuil", "Dépression", "Famille", "Gestion des émotions",
    "Grossesse", "Handicap", "Isolement social", "Obligation de soins",
    "Pathologie physique", "Phobies", "Problèmes au travail",
    "Problèmes de communication", "Public enfants/ados", "Sexualité",
    "Sport", "Stress", "TDAH", "Traumatisme", "Troubles alimentation",
    "Troubles obsessionnels"
];

const languesList = [
    "Français", "Anglais", "Espagnol", "Arabe", "Russe",
    "Portugais", "Chinois", "Allemand", "Italien", "Roumain",
    "Polonais", "Turc", "Langue des Signes (LSF)"
];

// Afficher la section des besoins
function showBesoinsSection() {
    document.getElementById('welcomeContent').style.display = 'none';
    document.getElementById('besoinsSection').style.display = 'block';
    generateMotifs();
    generateLangues();
    showStep(1);
}

// Générer les motifs
function generateMotifs() {
    const grid = document.getElementById('motifsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    motifsList.forEach(motif => {
        const label = document.createElement('label');
        label.className = 'checkbox-card';
        label.innerHTML = `<input type="checkbox" value="${motif.toLowerCase().replace(/ /g, '_')}"> <span>${motif}</span>`;
        grid.appendChild(label);
    });
}

// Générer les langues
function generateLangues() {
    const grid = document.getElementById('languesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    languesList.forEach(langue => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="langue" value="${langue.toLowerCase().replace(/ /g, '_')}"> ${langue}`;
        grid.appendChild(label);
    });
}

// Afficher une étape
function showStep(step) {
    for (let i = 1; i <= totalSteps; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) stepEl.classList.remove('active');
    }
    const currentStepEl = document.getElementById(`step${step}`);
    if (currentStepEl) currentStepEl.classList.add('active');
    currentStep = step;
    updateProgressIndicator(step);
}

// Mettre à jour l'indicateur de progression
function updateProgressIndicator(step) {
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach((dot, index) => {
        const stepNum = parseInt(dot.getAttribute('data-step'));
        dot.classList.remove('active', 'completed');
        if (stepNum === step) {
            dot.classList.add('active');
        } else if (stepNum < step) {
            dot.classList.add('completed');
        }
    });
}

// Étape suivante
function nextStep(step) {
    saveStepData(step);
    if (step < totalSteps) {
        showStep(step + 1);
    }
}

// Étape précédente
function prevStep(step) {
    if (step > 1) {
        showStep(step - 1);
    }
}

// Sauvegarder les données
function saveStepData(step) {
    switch(step) {
        case 1:
            userData.fullname = document.getElementById('fullname')?.value;
            userData.age = document.getElementById('age')?.value;
            userData.gender = document.getElementById('gender')?.value;
            break;
        case 2:
            const selectedMotifs = [];
            document.querySelectorAll('#motifsGrid input:checked').forEach(cb => {
                const span = cb.parentElement.querySelector('span');
                selectedMotifs.push(span ? span.innerText : cb.value);
            });
            userData.motifs = selectedMotifs;
            break;
        case 3:
            const selectedMedia = document.querySelector('input[name="media"]:checked');
            userData.media = selectedMedia ? selectedMedia.value : null;
            break;
        case 4:
            userData.days = document.getElementById('days')?.value;
            userData.hours = document.getElementById('hours')?.value;
            break;
        case 5:
            const selectedLangue = document.querySelector('input[name="langue"]:checked');
            userData.langue = selectedLangue ? selectedLangue.value : null;
            break;
        case 6:
            userData.psychoGender = document.getElementById('psychoGender')?.value;
            userData.consultType = document.getElementById('consultType')?.value;
            break;
        case 7:
            userData.therapyType = document.getElementById('therapyType')?.value;
            updateRecap();
            break;
    }
}

// Mettre à jour le récapitulatif
function updateRecap() {
    const recapDiv = document.getElementById('recap');
    if (!recapDiv) return;
    
    recapDiv.innerHTML = `
        <div class="recap-item"><div class="recap-label">Nom complet :</div><div class="recap-value">${userData.fullname || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Âge :</div><div class="recap-value">${userData.age || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Genre :</div><div class="recap-value">${userData.gender || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Motifs :</div><div class="recap-value">${userData.motifs?.length ? userData.motifs.join(', ') : 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Média préféré :</div><div class="recap-value">${userData.media || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Disponibilités :</div><div class="recap-value">${userData.days || ''} - ${userData.hours || ''}</div></div>
        <div class="recap-item"><div class="recap-label">Langue :</div><div class="recap-value">${userData.langue || 'Non renseigné'}</div></div>
        <div class="recap-item"><div class="recap-label">Préférence conseiller :</div><div class="recap-value">${userData.psychoGender || ''} - ${userData.consultType || ''}</div></div>
        <div class="recap-item"><div class="recap-label">Thérapie :</div><div class="recap-value">${userData.therapyType || 'Non renseigné'}</div></div>
    `;
}

// Soumettre
function submitNeeds() {
    saveStepData(7);
    alert('Votre demande a été envoyée ! Un conseiller vous contactera bientôt.');
    console.log('Données utilisateur :', userData);
    // Cacher la section besoins et revenir à l'accueil
    document.getElementById('besoinsSection').style.display = 'none';
    document.getElementById('welcomeContent').style.display = 'block';
}

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
