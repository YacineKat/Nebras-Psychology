// ============================================
// HOME PAGE LOGIC
// ============================================

import { isLoggedIn, getCurrentUser, redirectByUserType } from './api.js';

// Handle auth button click - available globally for onclick
function auth() {
    if (isLoggedIn()) {
        // Already logged in, go to dashboard
        const user = getCurrentUser();
        redirectByUserType(user.userType);
    } else {
        // Not logged in, go to auth page
        window.location.href = "auth.html";
    }
}

// Toggle FAQ accordion
function toggleFaq(element) {
    element.classList.toggle('active');
}

// Tab functionality
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.offers-section .offers-tab-btn');
    const tabContents = document.querySelectorAll('.offers-section .offers-tab-content');
    
    if (tabButtons.length > 0) {
        tabButtons[0].classList.add('active');
    }
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            this.classList.add('active');
            
            const tabId = this.getAttribute('data-tab');
            const activeTab = document.getElementById(tabId);
            if (activeTab) {
                activeTab.classList.add('active');
            }
        });
    });
});

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