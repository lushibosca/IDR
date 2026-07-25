(function () { 
    try { 
        // Leemos la clave exacta que usa app.js
        if (localStorage.getItem('SGI_dark') === '1') { 
            // Aplicamos al <html> porque el <body> aún no cargó
            document.documentElement.classList.add('dark-mode'); 
        } 
    } catch (e) { } 
}());
// Parche anti parpadeo blanco en modo oscuro