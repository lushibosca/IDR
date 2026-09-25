(function () {
    try {
        if (localStorage.getItem('IDR_dark') === '1') {
            document.documentElement.classList.add('dark-mode');
        }
    } catch (e) { }
}());
// Parche anti parpadeo blanco en modo oscuro
