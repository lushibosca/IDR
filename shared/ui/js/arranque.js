// Arranque de una app con el esqueleto común (antes de pintar, en el <head>, después de ../idr-tema.js): pone el tema de la
// suite (`IDR_dark`, IDRTema) en `<html data-tema>` y «reducir animaciones» de la app (`<prefijo>movimiento`) en
// `<html data-movimiento>`, sin parpadeo. Reemplaza al flash.js de cada app. Uso:
//   <script src="../shared/ui/js/arranque.js" data-prefijo="RCK_" data-tema="light"></script>
// data-prefijo: el de las claves de la app (CLAUDE.md: cada app tiene el suyo); data-tema: el de siempre si nadie eligió.
// Opcionales (para apps con claves propias ya guardadas, así nadie pierde lo elegido):
//   data-clave-tema        clave COMPLETA de respaldo del tema ('dark' | 'light'); vale si la suite no tiene tema elegido
//   data-clave-movimiento  clave COMPLETA de «reducir animaciones» (por defecto <prefijo>movimiento)
//   data-valor-reducido / data-valor-normal  sus valores (por defecto 'reducido' / 'normal')
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
})();
