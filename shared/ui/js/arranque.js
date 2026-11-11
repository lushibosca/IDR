// Arranque de una app con el esqueleto común (antes de pintar, en el <head>, después de ../idr-tema.js): pone el tema de la
// suite (`IDR_dark`, IDRTema) en `<html data-tema>` y «reducir animaciones» de la app (`<prefijo>movimiento`) en
// `<html data-movimiento>`, sin parpadeo. Reemplaza al flash.js de cada app. Uso:
//   <script src="../shared/ui/js/arranque.js" data-prefijo="RCK_" data-tema="light"></script>
// data-prefijo: el de las claves de la app (CLAUDE.md: cada app tiene el suyo); data-tema: el de siempre si nadie eligió.
// Deja el prefijo en `<html data-idr-prefijo>` para apariencia.js.

// ==== ARRANQUE PURO BEGIN ====
/** Tema a aplicar: el de la suite si alguien lo eligió (true/false), si no el de la app ('dark' | otro = 'light'). */
function idrTemaInicial(suite, defecto) {
    if (suite === true) return 'dark';
    if (suite === false) return 'light';
    return defecto === 'dark' ? 'dark' : 'light';
}
// ==== ARRANQUE PURO END ====

(function () {
    'use strict';
    var script = document.currentScript;
    var html = document.documentElement;
    var prefijo = (script && script.getAttribute('data-prefijo')) || '';
    var suite = typeof IDRTema !== 'undefined' ? IDRTema.oscuro() : null;
    var tema = idrTemaInicial(suite, script && script.getAttribute('data-tema'));
    html.setAttribute('data-tema', tema);
    html.style.colorScheme = tema;
    html.setAttribute('data-idr-prefijo', prefijo);
    try {
        if (prefijo && localStorage.getItem(prefijo + 'movimiento') === 'reducido') html.setAttribute('data-movimiento', 'reducido');
    } catch (_) { /* sin almacenamiento: animaciones de siempre */ }
})();
