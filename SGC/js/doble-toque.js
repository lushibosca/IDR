// Doble toque = doble clic, donde se pida: en los teléfonos el `dblclick` nativo no es confiable (iOS casi nunca lo dispara y en
// Android depende del zoom por doble toque). Dentro de lo marcado con `data-doble-toque` dos toques seguidos al mismo lugar emiten un
// `dblclick` sobre el elemento tocado, y el que el navegador dispare por su cuenta justo después se descarta (uno solo). Hoy lo usan
// los modales de detalle de stock y de canales (doble toque en un modelo o un grabador: buscarlo en Activos). Se carga después de ui.js.

// ==== DOBLE TOQUE PURO BEGIN ====
/** ¿Un toque es un toque corto, sin arrastre? (duración en ms y recorrido en px, entre que se apoya y se suelta el dedo) */
function esToqueCorto(duracionMs, recorridoPx, maxMs, maxPx) {
    return duracionMs >= 0 && duracionMs <= (maxMs == null ? 300 : maxMs) && recorridoPx <= (maxPx == null ? 10 : maxPx);
}

/** ¿Este toque es el segundo de un doble toque? `anterior` y `ahora`: {t (ms), x, y}; `anterior` puede ser null. */
function esDobleToque(anterior, ahora, maxMs, maxPx) {
    if (!anterior || !ahora) return false;
    const dt = ahora.t - anterior.t;
    return dt >= 0 && dt <= (maxMs == null ? 350 : maxMs)
        && Math.hypot(ahora.x - anterior.x, ahora.y - anterior.y) <= (maxPx == null ? 30 : maxPx);
}
// ==== DOBLE TOQUE PURO END ====

(function () {
    'use strict';
    const ZONA = '[data-doble-toque]';
    let apoyado = null;       // el toque en curso: { t, x, y, id }
    let ultimo = null;        // el último toque corto: { t, x, y }
    let sintetico = 0;        // cuándo se emitió el último dblclick propio

    document.addEventListener('pointerdown', (e) => {
        apoyado = e.pointerType === 'touch' && e.isPrimary && e.target instanceof Element && e.target.closest(ZONA)
            ? { t: Date.now(), x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    }, true);

    document.addEventListener('pointerup', (e) => {
        const toque = apoyado;
        apoyado = null;
        if (!toque || e.pointerId !== toque.id || !(e.target instanceof Element)) return;
        const ahora = { t: Date.now(), x: e.clientX, y: e.clientY };
        if (!esToqueCorto(ahora.t - toque.t, Math.hypot(ahora.x - toque.x, ahora.y - toque.y))) { ultimo = null; return; }
        if (esDobleToque(ultimo, ahora)) {
            ultimo = null;
            sintetico = ahora.t;
            e.target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window,
                clientX: e.clientX, clientY: e.clientY }));
        } else {
            ultimo = ahora;
        }
    }, true);

    document.addEventListener('pointercancel', () => { apoyado = null; ultimo = null; }, true);

    // el dblclick nativo que llega tras el nuestro es el mismo gesto: no se repite
    window.addEventListener('dblclick', (e) => {
        if (e.isTrusted && Date.now() - sintetico < 800 && e.target instanceof Element && e.target.closest(ZONA)) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);
})();
