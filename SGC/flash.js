(function () {
    try {
        // Misma clave y lógica que app.js: 'cctv_tema' === 'true' o null activa modo oscuro
        var t = localStorage.getItem('cctvs:cctv_tema');
        if (t === 'true' || t === null) {
            // Aplicamos al <html> — el CSS tiene el selector html.dark-mode para cubrir este momento
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) { }
}());
// Parche anti parpadeo blanco en modo oscuro — adaptado para CCTVS (clave: cctv_tema)
