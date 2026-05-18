// ============================================
// HOME PAGE LOGIC
// ============================================

// Handle auth button click - available globally for onclick
function auth() {
    if (window.isLoggedIn()) {
        const user = window.getCurrentUser();
        window.redirectByUserType(user.userType);
    } else {
        window.location.href = "auth.html";
    }
}

// Toggle FAQ accordion
function toggleFaq(element) {
    element.classList.toggle('active');
}

// Tab switching function - works with buttons
function switchTab(tabId, button) {
    // Remove active from all tab buttons
    const tabButtons = document.querySelectorAll('.offers-tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Remove active from all tab contents
    const tabContents = document.querySelectorAll('.offers-tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Add active to clicked button
    button.classList.add('active');
    
    // Show corresponding content
    const activeTab = document.getElementById(tabId);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

window.switchTab = switchTab;

// Make functions globally available for HTML onclick handlers
window.auth = auth;
window.toggleFaq = toggleFaq;