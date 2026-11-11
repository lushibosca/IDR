// Móvil (< 768 px): deslizar el dedo a los costados cambia de pestaña (Estado, Activos, Producción, Ajustes; en el orden de la
// barra de abajo). Izquierda = la siguiente, derecha = la anterior; en los extremos no da la vuelta. No actúa si el toque empieza
// en un campo, en algo que se desplaza de lado (tablas, listas), en una ventana o menú abierto, en un encabezado que se
// reordena con el dedo, junto a los bordes (gesto de «atrás» del sistema) ni con más de un dedo. Se carga después de ui.js.

// ==== SWIPE PESTANAS PURO BEGIN ====
/**
 * Índice de la pestaña a la que lleva un deslizamiento, o -1 si no es un cambio de pestaña. dx/dy: lo que se movió el dedo (px),
 * ms: cuánto duró, indice/total: pestaña actual y cuántas hay. Tiene que ser sobre todo horizontal (no un scroll con inclinación),
 * lo bastante largo y rápido, y no pasarse de los extremos.
 */
function swipePestanaDestino({ dx, dy, ms, indice, total, minimo, maxMs }) {
    const largo = Math.abs(dx);
    if (!(ms >= 0) || ms > (maxMs == null ? 700 : maxMs)) return -1;
    if (largo < (minimo == null ? 60 : minimo) || largo < Math.abs(dy) * 1.8) return -1;
    const destino = indice + (dx < 0 ? 1 : -1);
    return destino >= 0 && destino < total ? destino : -1;
}
// ==== SWIPE PESTANAS PURO END ====

(function () {
    'use strict';
    if (!window.matchMedia) return;
    const movil = window.matchMedia('(max-width: 767.98px)');
    const BORDE = 24;                                      // px junto a cada borde: es del sistema (volver / avanzar)
    const SIN_SWIPE = 'input, textarea, select, [contenteditable="true"], .modal.show, .popup-dispositivo, .dropdown-menu.show, '
        + '.table-responsive, .resumen-seccion-toggle, [data-sin-swipe]';
    let toque = null;

    const pestanas = () => [...document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]')]
        .filter((b) => b.offsetParent !== null);          // las ocultas en móvil (Historial) no cuentan

    function seDesplazaDeLado(el) {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            const ox = getComputedStyle(n).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 1) return true;
        }
        return false;
    }

    function puedeEmpezar(e) {
        if (!movil.matches || e.touches.length !== 1) return false;
        const t = e.touches[0];
        if (t.clientX < BORDE || t.clientX > window.innerWidth - BORDE) return false;
        if (typeof UI !== 'undefined' && UI.modal && UI.modal.arriba()) return false;
        const el = e.target instanceof Element ? e.target : null;
        if (!el || el.closest(SIN_SWIPE) || seDesplazaDeLado(el)) return false;
        const sel = window.getSelection && window.getSelection();
        return !(sel && !sel.isCollapsed);                 // con texto seleccionado el dedo arrastra la selección
    }

    document.addEventListener('touchstart', (e) => {
        toque = puedeEmpezar(e) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!toque) return;
        if (e.touches.length !== 1) { toque = null; return; }
        const t = e.touches[0];
        if (Math.abs(t.clientY - toque.y) > 40 && Math.abs(t.clientY - toque.y) > Math.abs(t.clientX - toque.x)) toque = null;   // es un scroll
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const inicio = toque;
        toque = null;
        if (!inicio || !e.changedTouches.length) return;
        const botones = pestanas();
        const indice = botones.findIndex((b) => b.classList.contains('active'));
        if (indice < 0) return;
        const t = e.changedTouches[0];
        const destino = swipePestanaDestino({ dx: t.clientX - inicio.x, dy: t.clientY - inicio.y, ms: Date.now() - inicio.t,
            indice, total: botones.length });
        if (destino >= 0 && typeof UI !== 'undefined' && UI.pestana) UI.pestana.mostrar(botones[destino]);
    }, { passive: true });

    document.addEventListener('touchcancel', () => { toque = null; }, { passive: true });
})();
