// ============================================
// PROJECT CONFIGURATION - Environment settings
// ============================================

// Configuration - Update these values for your deployment
const CONFIG = {
    // Manual override - set to true to use production URLs
    useProduction: false,

    // Production URLs (update these for your deployed server)
    production: {
        videoServerUrl: 'https://your-domain.com'
    },

    // Development URLs (localhost)
    development: {
        videoServerUrl: 'http://localhost:5000'
    }
};

// Get current environment settings
const currentConfig = CONFIG.useProduction ? CONFIG.production : CONFIG.development;

// Auto-detect: If not manually overridden, check if running on localhost
if (!CONFIG.useProduction) {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // Not localhost - assume production (will need manual config update)
        console.log('Non-localhost detected. Update config.js for production URLs.');
    }
}

// Export for use in other files
window.APP_CONFIG = {
    videoServerUrl: currentConfig.videoServerUrl
};