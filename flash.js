(function () { 
    'use strict';
    try { 
        if (localStorage.getItem('IDR_dark') === '1') { 
            document.documentElement.classList.add('dark-mode'); 
        } 
    } catch (e) { } 
}());