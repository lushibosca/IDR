// Deshacer y rehacer en la pantalla: botones #btn-undo / #btn-redo de la barra superior y Ctrl+Z / Ctrl+Y. La lógica está en
// historial-puro.js (pilas) y api-local.js (`ApiLocal.historial`); acá solo se conecta a la página. Alcanza a lo que se hace en el
// stock (altas, ediciones, bajas, lotes, grupos, tipos, edificios, modelos): lo importado, restablecido o traído de otra PC o pestaña
// vacía el historial. Las preferencias del dispositivo (panel, tema, privacidad) no entran.

(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const h = () => ApiLocal.historial;

    function pintar() {
        const deshacer = $('btn-undo'), rehacer = $('btn-redo');
        const aDeshacer = h().etiquetaDeshacer(), aRehacer = h().etiquetaRehacer();
        if (deshacer) {
            deshacer.disabled = !h().puedeDeshacer();
            deshacer.title = aDeshacer ? `Deshacer: ${aDeshacer} (Ctrl+Z)` : 'Deshacer (Ctrl+Z)';
        }
        if (rehacer) {
            rehacer.disabled = !h().puedeRehacer();
            rehacer.title = aRehacer ? `Rehacer: ${aRehacer} (Ctrl+Y)` : 'Rehacer (Ctrl+Y)';
        }
    }

    function ejecutar(accion, verbo) {
        try {
            const etiqueta = accion();
            if (etiqueta === null) return;
            mostrarToast(`${verbo}: ${etiqueta}`, 'info', 2500);
        } catch (e) {
            mostrarToast(e instanceof ErrorDatos ? e.message : 'No se pudo deshacer.', 'error', 5000);
        }
        pintar();
    }
    const deshacer = () => ejecutar(() => h().deshacer(), 'Deshecho');
    const rehacer = () => ejecutar(() => h().rehacer(), 'Rehecho');

    document.addEventListener('DOMContentLoaded', () => {
        $('btn-undo')?.addEventListener('click', deshacer);
        $('btn-redo')?.addEventListener('click', rehacer);
        pintar();
    });
    document.addEventListener('sgc:historial-cambio', pintar);

    // Ctrl+Z / Ctrl+Y (Ctrl+Mayús+Z también rehace). Dentro de un campo de texto es el deshacer del navegador: no se toca. Con un modal
    // abierto tampoco: lo que se ve no es lo que se deshace.
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        const k = e.key.toLowerCase();
        const esDeshacer = k === 'z' && !e.shiftKey, esRehacer = k === 'y' || (k === 'z' && e.shiftKey);
        if (!esDeshacer && !esRehacer) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (typeof UI !== 'undefined' && UI.modal && UI.modal.arriba && UI.modal.arriba()) return;
        e.preventDefault();
        if (esDeshacer) deshacer(); else rehacer();
    });
})();
