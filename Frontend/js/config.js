const CONFIG = {
    production: {
        apiUrl: 'https://nebras-psychology.onrender.com',
    },
    development: {
        apiUrl: 'http://localhost:3000',
    }
};

(function () {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    let env = isLocalhost ? 'development' : 'production';
    let activeConfig = CONFIG[env];

    window.APP_CONFIG = {
        apiUrl: activeConfig.apiUrl,
        videoServerUrl: activeConfig.apiUrl,
    };

    window.API_URL = activeConfig.apiUrl + '/api';

    // Fallback mechanism: if production URL is unreachable, fallback to localhost
    if (!isLocalhost) {
        fetch(activeConfig.apiUrl + '/api/settings', { method: 'HEAD' })
            .catch(function () {
                console.warn('[Config] Production URL unreachable, falling back to localhost');
                window.APP_CONFIG = {
                    apiUrl: CONFIG.development.apiUrl,
                    videoServerUrl: CONFIG.development.apiUrl,
                };
                window.API_URL = CONFIG.development.apiUrl + '/api';
            });
    }
})();
