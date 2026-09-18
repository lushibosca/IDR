(function () { 
    'use strict';
    try { 
        if (localStorage.getItem('IDR_dark') === '1') { 
            document.documentElement.classList.add('dark-mode'); 
            document.documentElement.style.backgroundColor = '#131314';
            document.documentElement.style.colorScheme = 'dark';
        } 
    } catch (e) { } 
}());
// Parche anti parpadeo blanco en modo oscuro