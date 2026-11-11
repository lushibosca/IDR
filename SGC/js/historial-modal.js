// Historial como ventana: Ajustes > Historial abre #modal-historial. La tarjeta (#bd-card, la de auditoria-bd.js) vive en la
// pestaña Historial del escritorio; al abrir la ventana se MUEVE adentro (conserva sus escuchas y su estado) y al cerrarla
// vuelve a su lugar. Al mostrarse lee una vez, o de nuevo si la búsqueda cambió (`historialMostrar`, de auditoria-bd.js).
// Se carga después de auditoria-bd.js.
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const modal = $('modal-historial');
    const tarjeta = $('bd-card');
    const cuerpo = $('historial-cuerpo');
    if (!modal || !tarjeta || !cuerpo) return;
    const origen = tarjeta.parentElement;

    modal.addEventListener('ui:modal-abrir', () => { cuerpo.appendChild(tarjeta); });
    modal.addEventListener('ui:modal-abierto', () => {
        if (typeof window.historialMostrar === 'function') window.historialMostrar();
    });
    modal.addEventListener('ui:modal-cerrado', () => { origen.appendChild(tarjeta); });
})();
