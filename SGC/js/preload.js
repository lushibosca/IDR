(function () {
    try {
        var html = document.documentElement;
        // (el tema y «reducir animaciones» los pone ../shared/ui/js/arranque.js, antes de este script)
        // Dashboard oculto hasta que lleguen los datos: resumen.js lo revela con el blur (sin salto de placeholders)
        html.setAttribute('data-cargando', '');
        setTimeout(function () { html.removeAttribute('data-cargando'); }, 6000);

        // Dónde está el panel lateral (solo escritorio; el CSS lo ignora en pantallas chicas): antes de pintar, sin salto
        var p = localStorage.getItem('sgc2/' + 'cctv:sidebar_posicion');
        if (p === 'right' || p === 'top' || p === 'bottom') html.setAttribute('data-panel-pos', p);

        // Si el panel lateral estaba colapsado (cctv:sidebar_collapsed): aplicarlo antes de pintar
        // para que aparezca directamente contraído sin flash del panel abierto ni animaciones innecesarias al recargar.
        if (localStorage.getItem('sgc2/' + 'cctv:sidebar_collapsed') === '1') {
            html.setAttribute('data-panel-colapsado', '');
            var aplicarColapso = function () {
                var col = document.getElementById('sidebar-col');
                if (col && !col.classList.contains('sidebar-collapsed')) {
                    col.classList.add('sidebar-collapsed');
                }
                var btn = document.getElementById('btn-toggle-sidebar');
                if (btn) {
                    var icon = btn.querySelector('.sidebar-toggle-icon');
                    if (icon) {
                        var pos = html.getAttribute('data-panel-pos') || 'left';
                        var vuelve = { left: 'right', right: 'left', top: 'down', bottom: 'up' }[pos] || 'right';
                        icon.className = 'bi bi-chevron-bar-' + vuelve + ' sidebar-toggle-icon';
                        var etiqueta = 'Mostrar panel lateral';
                        btn.dataset.etiqueta = etiqueta;
                        btn.setAttribute('aria-label', etiqueta);
                    }
                }
                return Boolean(col && btn);
            };

            if (typeof MutationObserver === 'function') {
                var obs = new MutationObserver(function () {
                    if (aplicarColapso()) {
                        obs.disconnect();
                    }
                });
                obs.observe(document.documentElement, { childList: true, subtree: true });
                document.addEventListener('DOMContentLoaded', function () {
                    obs.disconnect();
                    aplicarColapso();
                }, { once: true });
            } else {
                document.addEventListener('DOMContentLoaded', aplicarColapso, { once: true });
            }
        }

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
