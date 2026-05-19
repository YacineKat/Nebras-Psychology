document.getElementById('currentYear').textContent = new Date().getFullYear();

if (isLoggedIn()) {
    const user = getCurrentUser();
    if (user) redirectByUserType(user.userType);
}

window.showLogin = function() {
    document.getElementById('login').classList.add('active');
    document.getElementById('register').classList.remove('active');
};

window.showRegister = function() {
    document.getElementById('login').classList.remove('active');
    document.getElementById('register').classList.add('active');
};

window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('Veuillez entrer votre email et mot de passe');
        return;
    }
    
    try {
        const result = await authAPI.login({ email, password });
        localStorage.setItem('nebras_token', result.token);
        localStorage.setItem('nebras_user', JSON.stringify(result.user));
        setTimeout(() => redirectByUserType(result.user.userType), 300);
    } catch(e) {
        alert('Erreur: ' + e.message);
    }
};

window.handleRegister = async function() {
    const userType = document.getElementById('regUserType').value;
    const fullname = document.getElementById('regFullname').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const rules = document.getElementById('rules');
    
    if (!fullname || !email || !password) {
        alert('Veuillez remplir tous les champs');
        return;
    }
    if (password !== confirmPassword) {
        alert('Les mots de passe ne correspondent pas');
        return;
    }
    if (!rules.checked) {
        alert('Vous devez accepter les règles du site');
        return;
    }
    
    try {
        const result = await authAPI.register({ email, password, fullname, userType });
        localStorage.setItem('nebras_token', result.token || result.user?.token);
        localStorage.setItem('nebras_user', JSON.stringify(result.user));
        setTimeout(() => redirectByUserType(userType), 300);
    } catch(e) {
        alert('Erreur: ' + e.message);
    }
};

window.goToHome = function() {
    window.location.href = 'home.html';
};
