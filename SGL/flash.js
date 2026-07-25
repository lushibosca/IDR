(function () {
    try {
        var saved = localStorage.getItem('sgl_dark');
        if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) { }
}());
// Parche anti parpadeo blanco en modo oscuro
