(function () {
    try {
        var saved = localStorage.getItem('IDR_dark');
        if (saved === '1' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) { }
}());
// Parche anti parpadeo blanco en modo oscuro
