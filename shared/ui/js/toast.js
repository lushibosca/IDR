// Avisos (toast) de toda la suite: `mostrarToast(mensaje, tipo, duracion, extra)` y su alias `toast(mensaje, tipo = 'success', ...)`.
// Marcado único: <div id="toast" class="toast" role="status" aria-live="polite"></div> (si falta, se crea). Cola de hasta 5 avisos
// (el repetido se descarta; con más en cola, cada uno dura la mitad). Tocar el aviso o deslizarlo hacia un costado lo cierra.
// `extra` (4.º argumento): un texto → detalle («mensaje, detalle»); una función → acción que se ejecuta al tocar el aviso;
// o un objeto { detalle, accion }. Solo textContent: lo que se avisa nunca se interpreta como HTML.

// ==== TOAST PURO BEGIN ====
const TOAST_MAX_COLA = 5;

/** Texto y acción de un aviso a partir del 4.º argumento (texto = detalle, función = acción, objeto = { detalle, accion }). */
function toastExtra(mensaje, extra) {
    const o = extra && typeof extra === 'object' ? extra : { detalle: typeof extra === 'string' ? extra : null, accion: typeof extra === 'function' ? extra : null };
    return { texto: o.detalle ? `${mensaje}, ${o.detalle}` : mensaje, accion: typeof o.accion === 'function' ? o.accion : null };
}

/** Cola nueva con `item` al final (tope TOAST_MAX_COLA, se descartan los más viejos); la misma cola si el texto ya es el último
 *  en espera o el que se está mostrando (`actual`). */
function toastEncolar(cola, item, actual) {
    const ultimo = cola[cola.length - 1];
    if ((ultimo && ultimo.texto === item.texto) || actual === item.texto) return cola;
    return [...cola, item].slice(-TOAST_MAX_COLA);
}

/** Duración real: la pedida (3 s si no hay) y, con más avisos esperando, la mitad. */
function toastDuracion(pedida, enEspera) {
    const d = pedida || 3000;
    return enEspera >= 1 ? Math.floor(d / 2) : d;
}
// ==== TOAST PURO END ====

(function () {
    'use strict';
    let cola = [], ocupado = false, temporizador = null, accionActual = null;

    function elemento() {
        let el = document.getElementById('toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        if (!el.dataset.toastInit) {
            el.dataset.toastInit = '1';
            el.addEventListener('click', () => { const accion = accionActual; cerrar(); if (accion) accion(); });
            let x0 = null, y0 = null;
            el.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }
            }, { passive: true });
            el.addEventListener('touchend', (e) => {
                if (x0 === null) return;
                const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
                x0 = y0 = null;
                if (Math.abs(dy) <= 60 && Math.abs(dx) > 40) cerrar();
            }, { passive: true });
        }
        return el;
    }

    function cerrar() {
        if (temporizador) { clearTimeout(temporizador); temporizador = null; }
        const el = document.getElementById('toast');
        if (!el || !el.classList.contains('show')) return;
        el.classList.remove('show');
        setTimeout(siguiente, 350);
    }

    function siguiente() {
        if (cola.length === 0) { ocupado = false; accionActual = null; return; }
        ocupado = true;
        const [actual, ...resto] = cola;
        cola = resto;
        accionActual = actual.accion;
        const el = elemento();
        el.classList.remove('show');
        const icono = document.createElement('i');
        icono.className = actual.tipo === 'success' ? 'bi bi-check-circle-fill'
            : (actual.tipo === 'error' || actual.tipo === 'warning') ? 'bi bi-exclamation-triangle-fill' : 'bi bi-info-circle-fill';
        el.replaceChildren(icono, ` ${actual.texto}`);
        el.className = `toast ${actual.tipo}`;
        el.classList.toggle('toast-accionable', !!actual.accion);
        void el.offsetHeight;                      // punto de partida de la animación de entrada
        const duracion = toastDuracion(actual.duracion, cola.length);
        requestAnimationFrame(() => {
            el.classList.add('show');
            temporizador = setTimeout(() => {
                el.classList.remove('show');
                temporizador = null;
                setTimeout(siguiente, 350);
            }, duracion);
        });
    }

    function mostrarToast(mensaje, tipo = 'info', duracion = 3000, extra = null) {
        if (!mensaje) return;
        const { texto, accion } = toastExtra(mensaje, extra);
        const el = document.getElementById('toast');
        cola = toastEncolar(cola, { texto, tipo, duracion, accion }, ocupado && el ? el.textContent.trim() : null);
        if (!ocupado && cola.length) siguiente();
    }

    window.mostrarToast = mostrarToast;
    window.toast = (mensaje, tipo = 'success', duracion = 3000, extra = null) => mostrarToast(mensaje, tipo, duracion, extra);
})();
