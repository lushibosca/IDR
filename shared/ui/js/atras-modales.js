// El botón «atrás» (Android, gesto de volver) cierra el modal de arriba o el buscador móvil en vez de volver al launcher.
// Conecta `UI.modal` (ui.js, por sus eventos) con `IDRAtras` (../shared/idr-atras.js): cada modal que se abre guarda una entrada
// del historial; al cerrarlo por la X, el fondo o Escape esa entrada se saca; y «atrás» del sistema cierra el de arriba.
// Los modales flotantes (ventana «PiP») no cuentan: no tapan la página. Se carga después de ui.js.
(function () {
    'use strict';
    if (typeof IDRAtras === 'undefined' || typeof UI === 'undefined') return;

    const id = (modal) => `modal:${modal.id || ''}`;

    document.addEventListener('ui:modal-abrir', (e) => {
        const modal = e.target;
        if (!(modal instanceof HTMLElement) || e.defaultPrevented || modal.classList.contains('modal-flotante')) return;
        IDRAtras.abrir(id(modal), () => {
            UI.modal.cerrar(modal);
            return !UI.modal.abierto(modal);             // false: no se dejó cerrar (otro oyente lo frenó)
        });
    });

    document.addEventListener('ui:modal-cerrar', (e) => {
        if (e.target instanceof HTMLElement && !e.defaultPrevented) IDRAtras.cerrada(id(e.target));
    });
})();
