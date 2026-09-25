(function () {
    'use strict';
    // ¡IMPORTANTE! Mantener sincronizado con el APP_KEY de app.js
    const APP_KEY = 'RCK_'; 
    try {
        if (localStorage.getItem('IDR_dark') === '1') {
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) { }
}());
