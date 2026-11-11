// Arranque de una app con el esqueleto común (antes de pintar, en el <head>, después de ../idr-tema.js): pone el tema de la
// suite (`IDR_dark`, IDRTema) en `<html data-tema>` y «reducir animaciones» de la app (`<prefijo>movimiento`) en
// `<html data-movimiento>`, sin parpadeo. Reemplaza al flash.js de cada app. Uso:
//   <script src="../shared/ui/js/arranque.js" data-prefijo="RCK_" data-tema="light"></script>
// data-prefijo: el de las claves de la app (CLAUDE.md: cada app tiene el suyo); data-tema: el de siempre si nadie eligió.
// Opcionales (para apps con claves propias ya guardadas, así nadie pierde lo elegido):
//   data-clave-tema        clave COMPLETA de respaldo del tema ('dark' | 'light'); vale si la suite no tiene tema elegido
//   data-clave-movimiento  clave COMPLETA de «reducir animaciones» (por defecto <prefijo>movimiento)
//   data-valor-reducido / data-valor-normal  sus valores (por defecto 'reducido' / 'normal')
//   data-clave-panel-colapsado / data-clave-panel-posicion  claves COMPLETAS del panel lateral (por defecto <prefijo>panel_colapsado
//                          y <prefijo>panel_posicion; las mismas que lee panel.js)
// Deja todo en `<html data-idr-*>` para apariencia.js.

// ==== ARRANQUE PURO BEGIN ====
/** Tema a aplicar: el de la suite si alguien lo eligió (true/false), si no el de la app ('dark' | otro = 'light'). */
function idrTemaInicial(suite, defecto, respaldo) {
    if (suite === true) return 'dark';
    if (suite === false) return 'light';
    if (respaldo === 'dark' || respaldo === 'light') return respaldo;
    return defecto === 'dark' ? 'dark' : 'light';
}
// ==== ARRANQUE PURO END ====

(function () {
    'use strict';
    var script = document.currentScript;
    var html = document.documentElement;
    var attr = function (n, d) { return (script && script.getAttribute(n)) || d; };
    var prefijo = attr('data-prefijo', '');
    var claveTema = attr('data-clave-tema', '');
    var claveMov = attr('data-clave-movimiento', prefijo ? prefijo + 'movimiento' : '');
    var reducido = attr('data-valor-reducido', 'reducido');
    var suite = typeof IDRTema !== 'undefined' ? IDRTema.oscuro() : null;
    var respaldo = null;
    try { if (claveTema) respaldo = localStorage.getItem(claveTema); } catch (_) { /* sin respaldo */ }
    var tema = idrTemaInicial(suite, attr('data-tema', ''), respaldo);
    html.setAttribute('data-tema', tema);
    html.style.colorScheme = tema;
    html.setAttribute('data-idr-prefijo', prefijo);
    html.setAttribute('data-idr-clave-tema', claveTema);
    html.setAttribute('data-idr-clave-movimiento', claveMov);
    html.setAttribute('data-idr-valor-reducido', reducido);
    html.setAttribute('data-idr-valor-normal', attr('data-valor-normal', 'normal'));
    try {
        if (claveMov && localStorage.getItem(claveMov) === reducido) html.setAttribute('data-movimiento', 'reducido');
    } catch (_) { /* sin almacenamiento: animaciones de siempre */ }

    // Panel lateral (antes de pintar, sin salto): dónde está (solo escritorio; el CSS lo ignora en pantallas chicas) y si estaba plegado
    try {
        var clavePos = attr('data-clave-panel-posicion', prefijo ? prefijo + 'panel_posicion' : '');
        var claveCol = attr('data-clave-panel-colapsado', prefijo ? prefijo + 'panel_colapsado' : '');
        var pos = clavePos && localStorage.getItem(clavePos);
        if (pos === 'right' || pos === 'top' || pos === 'bottom') html.setAttribute('data-panel-pos', pos);
        if (claveCol && localStorage.getItem(claveCol) === '1') {
            html.setAttribute('data-panel-colapsado', '');
            // el panel aparece contraído de entrada: apenas existe #sidebar-col se le pone la clase (sin flash ni animación al recargar)
            var plegar = function () {
                var col = document.getElementById('sidebar-col');
                if (col && !col.classList.contains('sidebar-collapsed')) col.classList.add('sidebar-collapsed');
                var btn = document.getElementById('btn-toggle-sidebar');
                var icono = btn && btn.querySelector('.sidebar-toggle-icon');
                if (icono) {
                    var vuelve = { left: 'right', right: 'left', top: 'down', bottom: 'up' }[html.getAttribute('data-panel-pos') || 'left'] || 'right';
                    icono.className = 'bi bi-chevron-bar-' + vuelve + ' sidebar-toggle-icon';
                    btn.dataset.etiqueta = 'Mostrar panel lateral';
                    btn.setAttribute('aria-label', 'Mostrar panel lateral');
                }
                return Boolean(col && btn);
            };
            if (typeof MutationObserver === 'function') {
                var obs = new MutationObserver(function () { if (plegar()) obs.disconnect(); });
                obs.observe(html, { childList: true, subtree: true });
                document.addEventListener('DOMContentLoaded', function () { obs.disconnect(); plegar(); }, { once: true });
            } else {
                document.addEventListener('DOMContentLoaded', plegar, { once: true });
            }
        }
    } catch (_) { /* sin almacenamiento: panel como de fábrica */ }
})();
