const CONFIG = {
    API_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:3000/api' 
        : '/api',  // En production, même domaine
    SITE_URL: window.location.origin
};