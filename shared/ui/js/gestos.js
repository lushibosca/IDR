// Gestos y movimiento de elementos, comunes a las apps con el esqueleto común: pulsación larga y arrastre (`uiArrastreLargo`),
// reubicación con recorrido visible (`uiAnimarReubicacion`), foco de teclado y, en pantallas táctiles, que la página no haga
// scroll mientras se arrastra (`html.arrastrando-largo`). Los usa el panel lateral movible (panel-mover.js) y SGC en otros lugares.
// Se carga después de ui.js (`uiMovimientoReducido`).

// ==== PULSACION LARGA PURO BEGIN ====
// Mantener presionado (y soltar) un encabezado plegable abre o cierra TODOS los de su lista (subgrupos de Activos, tipos
// de los modales de detalle de stock). Sin temporizadores: se mide la duración al soltar (instantes en ms, como
// `event.timeStamp`).
const PULSACION_LARGA_MS = 300;
function esPulsacionLarga(inicio, fin) {
    return Number.isFinite(inicio) && Number.isFinite(fin) && fin - inicio >= PULSACION_LARGA_MS;
}
// ==== PULSACION LARGA PURO END ====

const UMBRAL_MOVIMIENTO_PULSACION_PX = 6;   // moverse más que esto antes de tiempo es un scroll, no una pulsación larga

// ==== REUBICACION BEGIN ====
/** Reubicar con recorrido visible (FLIP): mide dónde están los elementos de `obtener()` (por `clave(el)`), aplica
 *  `cambiar()` (mover o repintar el DOM), los devuelve con `transform` a donde estaban y los anima a su lugar nuevo.
 *  Lo comparten el modal Listar (fichas de columnas) y las secciones reubicables del panel de Estado. Mide la
 *  posición visual (con la animación anterior a medias, si la hay) y la final sin transform: un movimiento encadenado
 *  sigue desde donde iba, sin saltos. Con menos movimiento, solo `cambiar()`. Devuelve los elementos que se animan. */
const REUBICACION_TRANSICION = 'transform 0.28s cubic-bezier(0.2, 0, 0, 1)';
function uiAnimarReubicacion(obtener, clave, cambiar, { encima = null } = {}) {
    const antes = new Map();
    for (const el of obtener()) antes.set(clave(el), el.getBoundingClientRect());
    cambiar();
    if (antes.size === 0 || uiMovimientoReducido()) return [];
    const animables = [];
    for (const el of obtener()) {
        const r0 = antes.get(clave(el));
        if (!r0) continue;
        el.style.transition = 'none';
        el.style.transform = '';
        const r1 = el.getBoundingClientRect();
        const dx = r0.left - r1.left;
        const dy = r0.top - r1.top;
        if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) {
            el.style.transition = '';
            continue;
        }
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.zIndex = el === encima ? '3' : '2';
        animables.push(el);
    }
    if (!animables.length) return [];
    void animables[0].offsetHeight;                       // reflow: la posición invertida queda fijada
    requestAnimationFrame(() => {
        for (const el of animables) {
            el.style.transition = REUBICACION_TRANSICION;
            el.style.transform = '';
            const limpiar = (e) => {
                if (e.propertyName !== 'transform') return;
                el.style.transition = '';
                el.style.zIndex = '';
                el.removeEventListener('transitionend', limpiar);
                el.removeEventListener('transitioncancel', limpiar);
            };
            el.addEventListener('transitionend', limpiar);
            el.addEventListener('transitioncancel', limpiar);
        }
    });
    return animables;
}
// ==== REUBICACION END ====

/** ¿El foco de `el` es de teclado (`:focus-visible`)? El de un clic, o el que vuelve al regresar a la ventana, no cuenta: con ese el
 *  popup de una etiqueta quedaba pegado. Un navegador sin `:focus-visible`: como antes (sí). */
function uiFocoDeTeclado(el) {
    try { return el.matches(':focus-visible'); } catch (_) { return true; }
}

/** Pulsación larga y arrastre (lo común a reubicar chips y tiles, las secciones del panel y el panel lateral). Sobre `raiz`,
 *  `elegir(ev)` dice qué se arrastra (o null: ese `pointerdown` no es para esto). Tras PULSACION_LARGA_MS sin moverse más de
 *  UMBRAL_MOVIMIENTO_PULSACION_PX (si se mueve antes, es un scroll) empieza el arrastre: el elemento toma el puntero (en `capturar(el)`, por defecto él
 *  mismo), sin gestos táctiles del navegador, con una vibración corta, y `alEmpezar(el, inicio)`. Mientras dura, cada
 *  movimiento es `alMover(ev, el)`. Al soltar, `alTerminar(el, true)`; con Escape o si el navegador cancela el puntero,
 *  `alTerminar(el, false)`. El clic que sigue a soltar no llega a nadie (en captura, sobre `raiz`).
 *  Devuelve `{ activo }`: ¿hay un arrastre en curso? (no repintar debajo). */
function uiArrastreLargo(raiz, { elegir, capturar = (el) => el, alEmpezar = () => {}, alMover = () => {}, alTerminar = () => {} }) {
    let timer = null;
    let arrastrando = false;
    let el = null;
    let pointerId = null;
    let inicio = null;
    let tragarClic = false;

    function terminar(confirmar) {
        clearTimeout(timer);
        timer = null;
        window.removeEventListener('pointermove', alMoverPuntero);
        window.removeEventListener('pointerup', alSoltar);
        window.removeEventListener('pointercancel', alCancelar);
        const arrastrado = arrastrando ? el : null;
        arrastrando = false;
        el = null;
        if (arrastrado) {
            arrastrado.style.touchAction = ''; document.documentElement.classList.remove('arrastrando-largo');
            try { capturar(arrastrado).releasePointerCapture(pointerId); } catch (_) { /* ya soltado */ }
            tragarClic = true;
            setTimeout(() => { tragarClic = false; }, 100);
            alTerminar(arrastrado, confirmar);
        }
        pointerId = null;
    }
    function alMoverPuntero(e) {
        if (e.pointerId !== pointerId) return;
        if (!arrastrando) {
            if (timer && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_MOVIMIENTO_PULSACION_PX) terminar(false);    // scroll: no es pulsación larga
            return;
        }
        e.preventDefault();
        alMover(e, el);
    }
    function alSoltar(e) {
        if (e.pointerId === pointerId) terminar(true);
    }
    function alCancelar(e) {
        if (e.pointerId === pointerId) terminar(false);
    }

    // en captura: el clic que sigue a soltar un arrastre no abre (ni pliega) lo que había debajo
    raiz.addEventListener('click', (e) => {
        if (!tragarClic) return;
        e.stopPropagation();
        e.preventDefault();
    }, true);
    raiz.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || el) return;
        const elegido = elegir(e);
        if (!elegido) return;
        el = elegido;
        pointerId = e.pointerId;
        inicio = { x: e.clientX, y: e.clientY };
        timer = setTimeout(() => {
            timer = null;
            arrastrando = true;
            el.style.touchAction = 'none'; document.documentElement.classList.add('arrastrando-largo');   // (js/arrastre-tactil.js: sin scroll)
            try { capturar(el).setPointerCapture(pointerId); } catch (_) { /* sin captura: sigue con la ventana */ }
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(35); } catch (_) { /* sin vibración */ }
            }
            alEmpezar(el, inicio);
        }, PULSACION_LARGA_MS);
        window.addEventListener('pointermove', alMoverPuntero, { passive: false });
        window.addEventListener('pointerup', alSoltar);
        window.addEventListener('pointercancel', alCancelar);
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && arrastrando) terminar(false);
    });
    return { activo: () => arrastrando };
}

// Reubicar con el dedo (pulsación larga y arrastre: apartados del panel, tarjetas, chips, fichas) sin que la página haga scroll.
// `touch-action: none` que fija uiArrastreLargo al empezar llega tarde: el navegador decide el gesto al tocar. Por eso, mientras
// dura el arrastre (`html.arrastrando-largo`) se cancelan los `touchmove` (no se desplaza ni rebota la página) y se quita la
// selección de texto.
(function () {
    'use strict';
    const raiz = document.documentElement;
    document.addEventListener('touchmove', (e) => {
        if (raiz.classList.contains('arrastrando-largo') && e.cancelable) e.preventDefault();
    }, { passive: false });
})();
