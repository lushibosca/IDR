(function () {
    try {
        var html = document.documentElement;
        // (el tema y «reducir animaciones» los pone ../shared/ui/js/arranque.js, antes de este script)
        // Dashboard oculto hasta que lleguen los datos: resumen.js lo revela con el blur (sin salto de placeholders)
        html.setAttribute('data-cargando', '');
        setTimeout(function () { html.removeAttribute('data-cargando'); }, 6000);

        // (el lugar y el plegado del panel lateral los pone ../shared/ui/js/arranque.js)

        // Modo privacidad (Ajustes): desenfoca IP y MAC desde el primer cuadro
        if (localStorage.getItem('sgc2/' + 'cctv:privacidad') === '1') html.setAttribute('data-privacidad', '');

        var t = localStorage.getItem('sgc2/' + 'cctv_tab');
        if (t && t !== '#v-pills-dashboard') {
            html.classList.add('preload-tab');
        }
    } catch (e) {
        /* sin almacenamiento: queda lo que puso arranque.js */
    }
}());
