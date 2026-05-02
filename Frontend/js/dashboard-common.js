// ============================================
// COMMON DASHBOARD FUNCTIONS
// Shared by all dashboard pages
// ============================================

import { isLoggedIn, getCurrentUser, getUserType, redirectByUserType, authAPI } from './api.js';

// Check authentication on every dashboard page
export function checkAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'auth.html';
        return false;
    }
    return true;
}

// Get and update current user display
export async function updateUserDisplay() {
    const user = getCurrentUser();
    if (!user) return;

    // Update all user name elements in sidebar
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = user.fullname || user.email;
    });

    // Update welcome headers
    const welcomeHeaders = document.querySelectorAll('h1');
    welcomeHeaders.forEach(header => {
        if (header.textContent.includes('Bonjour')) {
            header.textContent = `Bonjour, ${user.fullname || 'User'}`;
        }
    });

    // Update avatar if user type specific
    const avatar = document.querySelector('.user-avatar');
    if (avatar) {
        // Use first letter of name or email
        const initial = (user.fullname || user.email).charAt(0).toUpperCase();
        if (avatar.tagName === 'DIV') {
            avatar.textContent = initial;
        }
    }
}

// Highlight current page in sidebar
export function highlightCurrentSidebarLink() {
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

// Initialize common dashboard features
export async function initDashboard() {
    if (!checkAuth()) return;

    // Update user display
    await updateUserDisplay();

    // Highlight sidebar
    highlightCurrentSidebarLink();

    // Scroll persistence
    setupScrollPersistence();
}

// Setup scroll position persistence for sidebar
export function setupScrollPersistence() {
    document.querySelectorAll('.nav-menu .nav-item').forEach(link => {
        link.addEventListener('click', function() {
            sessionStorage.setItem('menuScrollPos', document.querySelector('.nav-menu').scrollTop);
        });
    });

    window.addEventListener('load', function() {
        const scrollPos = sessionStorage.getItem('menuScrollPos');
        if (scrollPos) {
            const navMenu = document.querySelector('.nav-menu');
            if (navMenu) navMenu.scrollTop = scrollPos;
        }
    });
}

// Make functions available globally for non-module scripts
window.checkAuth = checkAuth;
window.updateUserDisplay = updateUserDisplay;
window.highlightCurrentSidebarLink = highlightCurrentSidebarLink;
window.initDashboard = initDashboard;