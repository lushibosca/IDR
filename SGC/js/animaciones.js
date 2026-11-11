// Animaciones de "mutación" (entrada/salida), alturas animadas y banners: el punto único para todo lo que muta en
// pantalla (pestañas, contenido de un contenedor, banners, contenedores de alerta). Se carga ANTES que app.js: app.js
// usa DUR_ANIM_MS al cargar. Sin dependencias de app.js al cargar (tests/js/alternar_banner.test.mjs lo carga solo).

// --- Animaciones de mutación (entrada/salida) ---
// Punto único para todo lo que "muta" en pantalla: cambio de pestañas y
// contenedores de alerta del dashboard. La duración sale de --dur-anim en el
// CSS (única fuente de verdad); el JS espera a que la animación termine de
// verdad (animationend) en vez de adivinar el tiempo con un setTimeout.
/** ¿Menos movimiento (el ajuste del menú o el sistema)? Entonces todo se aplica sin animar (`uiMovimientoReducido`, ui.js). */
function prefiereMovimientoReducido() {
    return uiMovimientoReducido();
}

const CLASES_MUTACION = { entrada: 'mutacion-entrante', salida: 'mutacion-saliente' };
const mutacionesEnCurso = new WeakMap(); // el -> función que cancela su animación

// Corta la animación de mutación de un elemento (si tiene una) sin ejecutar su callback.
function cancelarMutacion(el) {
    const cancelar = el && mutacionesEnCurso.get(el);
    if (cancelar) cancelar();
}

const TODAS_CLASES_ANIMACION_MUTACION = [
    CLASES_MUTACION.entrada,
    CLASES_MUTACION.salida
];

function animarClase(el, clase, alTerminar) {
    if (!el || !clase) return;
    cancelarMutacion(el);
    el.classList.remove(...TODAS_CLASES_ANIMACION_MUTACION);
    void el.offsetWidth; // forzar reflow para reiniciar la animación
    el.classList.add(clase);

    let respaldo = null;
    const limpiar = () => {
        el.removeEventListener('animationend', alFinalizar);
        clearTimeout(respaldo);
        mutacionesEnCurso.delete(el);
        el.classList.remove(clase);
    };
    const alFinalizar = (e) => {
        // animationend burbujea: ignorar animaciones de elementos hijos
        if (e && e.target !== el) return;
        limpiar();
        if (alTerminar) alTerminar();
    };
    el.addEventListener('animationend', alFinalizar);
    respaldo = setTimeout(() => alFinalizar(null), DUR_ANIM_MS + 50);
    mutacionesEnCurso.set(el, limpiar);
}

// tipo: 'entrada' | 'salida'. alTerminar se ejecuta una sola vez, con la clase
// de animación ya quitada. Si el elemento no llega a animarse (por ejemplo,
// oculto con display:none no dispara animationend), un temporizador de
// respaldo igualmente llama a alTerminar.
function animarMutacion(el, tipo, alTerminar) {
    if (!el) return;
    const clase = CLASES_MUTACION[tipo];
    animarClase(el, clase, alTerminar);
}

// Punto (en px desde el borde superior del elemento) que queda en el centro de la parte VISIBLE del elemento.
// El escalado de la mutación se hace desde ahí: con un panel largo y la página scrolleada, escalar desde el borde
// superior desplazaba lo que se estaba mirando (10% de la distancia al borde) y se veía como un salto.
function origenMutacionY(arriba, abajo, altoVentana) {
    const visibleArriba = Math.max(arriba, 0);
    const visibleAbajo = Math.min(abajo, altoVentana);
    if (!(visibleAbajo > visibleArriba)) return 0;
    return Math.round((visibleArriba + visibleAbajo) / 2 - arriba);
}

function fijarOrigenVisible(el) {
    if (!el || !el.style || typeof el.getBoundingClientRect !== 'function') return;
    const r = el.getBoundingClientRect();
    const alto = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : r.bottom;
    el.style.transformOrigin = `50% ${origenMutacionY(r.top, r.bottom, alto)}px`;
}

function elementoVisible(el) {
    if (!el || el.isConnected === false) return false;
    if (el.classList.contains('d-none') || (el.style && el.style.display === 'none')) return false;
    if (typeof el.closest === 'function') {
        if (el.closest('.d-none')) return false;
        let tp = el.closest('.tab-pane');
        while (tp) {
            if (!tp.classList.contains('active') || (tp.style && tp.style.display === 'none')) return false;
            tp = tp.parentElement && typeof tp.parentElement.closest === 'function'
                ? tp.parentElement.closest('.tab-pane') : null;
        }
    }
    return true;
}

const _mutacionesContenido = new WeakMap(); // elSalida -> mutación cuya salida está en curso

/**
 * Animación estándar de mutación cuando cambia el contenido de un contenedor (vista lista/tarjetas,
 * agrupamiento, búsqueda): la MISMA secuencia que alertas y auditorías. Sale el contenido actual,
 * recién entonces se aplica el DOM nuevo y entra. La altura del contenedor padre se congela y se anima
 * hasta la nueva (sin saltos de página) y el escalado se hace desde el centro de lo visible.
 * Sin clones: un clon pierde los estilos que dependen del id y desubica los encabezados sticky.
 *
 * Mientras dura la salida, otro repintado del mismo contenedor (animado o no) no pisa el DOM: reemplaza al
 * DOM pendiente (vale el último, sus datos son los más nuevos). Si el contenedor no está visible o se prefiere
 * movimiento reducido, se aplica el DOM sin animación.
 *
 * @param {HTMLElement} elSalida - Elemento cuyo contenido cambia
 * @param {Function} actualizarDOM - Callback que actualiza el DOM
 * @param {Function} [alTerminar] - Callback opcional al finalizar
 * @param {Function} [getElEntrada] - Devuelve el elemento que entra (por defecto elSalida)
 * @param {boolean} [animar=true] - false = repintado sin animación (respeta una mutación en curso)
 */
function mutarContenido(elSalida, actualizarDOM, alTerminar, getElEntrada, animar = true) {
    const terminar = () => { if (alTerminar) alTerminar(); };
    let pendiente = elSalida ? _mutacionesContenido.get(elSalida) : null;
    if (pendiente && !mutacionesEnCurso.has(elSalida)) {
        // Su salida fue cancelada (cancelarMutacion/otra animación): no debe trabar los repintados siguientes
        _mutacionesContenido.delete(elSalida);
        pendiente = null;
    }
    if (pendiente) {
        pendiente.actualizar = actualizarDOM;
        pendiente.getElEntrada = getElEntrada;
        if (alTerminar) pendiente.alTerminar.push(alTerminar);
        return;
    }
    if (!elSalida || !animar || prefiereMovimientoReducido()) {
        if (actualizarDOM) actualizarDOM();
        terminar();
        return;
    }

    const entrar = (getEntrada, finales) => {
        const elEntrada = typeof getEntrada === 'function' ? getEntrada() : elSalida;
        const fin = () => {
            if (elEntrada && elEntrada.style) elEntrada.style.transformOrigin = '';
            finales.forEach(f => f());
        };
        if (!elementoVisible(elEntrada)) { fin(); return; }
        fijarOrigenVisible(elEntrada);
        animarMutacion(elEntrada, 'entrada', fin);
    };

    const contenedor = elSalida.parentElement || null;
    if (!elementoVisible(elSalida)) {
        // Estaba oculto: no hay nada que sacar, pero si el DOM nuevo lo muestra, entra con la animación estándar
        // animando al mismo tiempo la expansión de altura de su contenedor padre.
        const animarPadre = Boolean(contenedor && elementoVisible(contenedor));
        if (animarPadre) fijarAlturaAnimable(contenedor, true);
        if (actualizarDOM) actualizarDOM();
        const elEntrada = typeof getElEntrada === 'function' ? getElEntrada() : elSalida;
        if (animarPadre) {
            if (elementoVisible(elEntrada)) {
                animarAlturaAlContenido(contenedor);
            } else {
                if (contenedor._cancelarAltura) contenedor._cancelarAltura();
                contenedor.style.transition = '';
                contenedor.style.height = '';
                contenedor.style.overflow = '';
            }
        }
        entrar(getElEntrada, alTerminar ? [alTerminar] : []);
        return;
    }

    fijarAlturaAnimable(contenedor, true);
    fijarOrigenVisible(elSalida);
    const mutacion = { actualizar: actualizarDOM, getElEntrada, alTerminar: alTerminar ? [alTerminar] : [] };
    _mutacionesContenido.set(elSalida, mutacion);
    animarMutacion(elSalida, 'salida', () => {
        _mutacionesContenido.delete(elSalida);
        if (elSalida.style) elSalida.style.transformOrigin = '';
        if (mutacion.actualizar) mutacion.actualizar();
        animarAlturaAlContenido(contenedor);
        entrar(mutacion.getElEntrada, mutacion.alTerminar);
    });
}
window.mutarContenido = mutarContenido;

/**
 * Oculta un panel de resultados animando en simultáneo su salida y la contracción de altura de su tarjeta padre.
 * Si durante la salida llega un `mutarContenido`, éste reemplaza el cierre pendiente y anima hacia el contenido nuevo.
 */
function ocultarContenido(elSalida, actualizarDOM, alTerminar) {
    const terminar = () => { if (alTerminar) alTerminar(); };
    if (!elSalida || !elementoVisible(elSalida) || prefiereMovimientoReducido()) {
        if (actualizarDOM) actualizarDOM();
        terminar();
        return;
    }
    const contenedor = elSalida.parentElement || null;
    if (contenedor && elementoVisible(contenedor)) {
        fijarAlturaAnimable(contenedor, true);
        elSalida.classList.add('d-none');
        animarAlturaAlContenido(contenedor);
        elSalida.classList.remove('d-none');
    }
    fijarOrigenVisible(elSalida);
    const mutacion = { actualizar: actualizarDOM, getElEntrada: null, alTerminar: alTerminar ? [alTerminar] : [] };
    _mutacionesContenido.set(elSalida, mutacion);
    animarMutacion(elSalida, 'salida', () => {
        _mutacionesContenido.delete(elSalida);
        if (elSalida.style) elSalida.style.transformOrigin = '';
        const eraOcultar = mutacion.actualizar === actualizarDOM;
        if (mutacion.actualizar) mutacion.actualizar();
        if (!eraOcultar) {
            animarAlturaAlContenido(contenedor);
            const elEntrada = typeof mutacion.getElEntrada === 'function' ? mutacion.getElEntrada() : elSalida;
            if (elementoVisible(elEntrada)) {
                fijarOrigenVisible(elEntrada);
                animarMutacion(elEntrada, 'entrada', () => {
                    if (elEntrada && elEntrada.style) elEntrada.style.transformOrigin = '';
                    mutacion.alTerminar.forEach(f => f());
                });
                return;
            }
        }
        mutacion.alTerminar.forEach(f => f());
    });
}
window.ocultarContenido = ocultarContenido;

// --- Paneles de resultado de las consultas a demanda (Auditoría: logs de servidores, disponibilidad, grabador, video,
// cámara). Todos son `<div id="...-resultado">` hijo directo de su tarjeta: la tarjeta crece y se achica suave en vez
// de saltar al cambiar el contenido (el patrón lo estrenó Disponibilidad).

/** Repinta sin mutación de entrada/salida pero animando la altura de `contenedor` (búsqueda, «Cargar más»). */
// `recortar: false` cuando el contenedor ES el que scrollea (el cuerpo de un modal): con `clip` se le iba la barra de
// scroll mientras duraba la animación y el contenido se ensanchaba un instante.
function animarAlturaDe(contenedor, actualizarDOM, { recortar = true } = {}) {
    const animar = Boolean(contenedor && contenedor.style && !prefiereMovimientoReducido() && elementoVisible(contenedor));
    if (animar) fijarAlturaAnimable(contenedor, recortar);
    if (actualizarDOM) actualizarDOM();
    if (animar) animarAlturaAlContenido(contenedor);
}

// Cambio de pestaña dentro de un modal, con el mismo deslizamiento que las subpestañas de Auditoría: lo de antes y lo nuevo se
// mueven JUNTOS el ancho completo, con la misma duración y curva. `contenedor` envuelve lo que cambia; una copia de lo que había
// queda a su costado (dentro de él, así viaja con él) y el conjunto se corre hasta mostrar lo nuevo; el ancestro con
// `overflow-x: hidden` recorta. `aplicar()` pone lo nuevo. `paso` > 0 = la pestaña nueva está a la derecha. Sin `Element.animate`,
// con menos movimiento o oculto: directo.
function uiDeslizarCambio(contenedor, aplicar, paso = 1) {
    if (!contenedor || typeof contenedor.animate !== 'function' || prefiereMovimientoReducido() || !elementoVisible(contenedor)) {
        aplicar();
        return;
    }
    const ancho = contenedor.getBoundingClientRect().width;
    const sentido = paso >= 0 ? 1 : -1;
    const fantasma = document.createElement('div');
    fantasma.setAttribute('aria-hidden', 'true');
    for (const nodo of contenedor.childNodes) fantasma.append(nodo.cloneNode(true));
    for (const n of fantasma.querySelectorAll('[id]')) n.removeAttribute('id');
    Object.assign(fantasma.style, { position: 'absolute', top: '0', left: `${-sentido * ancho}px`, width: `${ancho}px`,
        pointerEvents: 'none', margin: '0' });
    const posicionPrevia = contenedor.style.position;
    contenedor.style.position = 'relative';
    aplicar();
    contenedor.append(fantasma);
    const mov = contenedor.animate([{ transform: `translateX(${sentido * ancho}px)` }, { transform: 'translateX(0)' }],
        { duration: DUR_ANIM_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    const fin = () => { fantasma.remove(); contenedor.style.position = posicionPrevia; };
    mov.onfinish = fin;
    mov.oncancel = fin;
}

// Si la subpestaña del panel todavía está entrando (el deslizamiento de app.js la deja en display:none hasta que
// termina, `ui:slide-subtab-fin`), espera a que se vea: animar algo oculto no se ve y la tarjeta saltaría igual.
function esperarPanelVisible(panel) {
    const pane = panel && typeof panel.closest === 'function' ? panel.closest('.tab-pane') : null;
    if (!pane || !pane.style || pane.style.display !== 'none') return Promise.resolve();
    return new Promise(res => {
        const fin = () => { clearTimeout(t); pane.removeEventListener('ui:slide-subtab-fin', fin); res(); };
        const t = setTimeout(fin, DUR_ANIM_MS + 50);
        pane.addEventListener('ui:slide-subtab-fin', fin, { once: true });
    });
}

/**
 * Muestra el resultado NUEVO de una consulta: sale el anterior (si había), se aplica el DOM y entra, con la tarjeta
 * acompañando la altura. `actualizarDOM` corre recién al final de la salida: lo que pinta (y el estado que fija) es
 * del resultado nuevo. Devuelve una promesa que se cumple cuando se aplicó el DOM.
 */
async function mostrarResultadoConsulta(panel, actualizarDOM) {
    await esperarPanelVisible(panel);
    return new Promise(res => {
        mutarContenido(panel, () => { if (actualizarDOM) actualizarDOM(); res(); });
    });
}

window.animarAlturaDe = animarAlturaDe;
window.prefiereMovimientoReducido = prefiereMovimientoReducido;
window.esperarPanelVisible = esperarPanelVisible;
window.mostrarResultadoConsulta = mostrarResultadoConsulta;



// Muestra u oculta un banner aplicando la animación de mutación estándar
// Si ya está en el estado deseado, no repite la animación (idempotente frente a polling)
// Alto del banner que aparece o desaparece: se anima (Web Animations) para que lo de abajo se corra suave en vez de
// saltar. null si no se puede (sin WAAPI, como jsdom) o si el usuario pidió menos movimiento.
const _alturasBanner = new WeakMap();
function animarAlturaBanner(el, mostrar) {
    const previa = _alturasBanner.get(el);
    if (previa) previa.cancel();
    if (typeof el.animate !== 'function') return null;
    if (prefiereMovimientoReducido()) return null;
    const cs = getComputedStyle(el);
    const lleno = { height: `${el.offsetHeight}px`, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom };
    const vacio = { height: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' };
    el.style.overflow = 'hidden';
    const anim = el.animate(mostrar ? [vacio, lleno] : [lleno, vacio],
        { duration: DUR_ANIM_MS, easing: 'ease', fill: mostrar ? 'none' : 'forwards' });
    _alturasBanner.set(el, anim);
    const fin = () => {
        if (_alturasBanner.get(el) !== anim) return;
        el.style.overflow = '';
        if (mostrar) _alturasBanner.delete(el);
    };
    anim.onfinish = fin;
    anim.oncancel = () => { el.style.overflow = ''; };
    return anim;
}

function alternarBannerMutacion(el, visible, alTerminar) {
    if (!el) return;
    const salidaClase = CLASES_MUTACION.salida;
    const estaVisible = !el.classList.contains('d-none') && !el.classList.contains(salidaClase);
    if (visible === estaVisible) return;
    if (visible) {
        el.classList.remove('d-none');
        animarAlturaBanner(el, true);
        animarMutacion(el, 'entrada', alTerminar);
    } else {
        const altura = animarAlturaBanner(el, false);
        animarMutacion(el, 'salida', () => {
            el.classList.add('d-none');
            if (altura) altura.cancel();               // ya oculto: se suelta el alto congelado en 0
            if (alTerminar) alTerminar();
        });
    }
}

window.animarClase = animarClase;
window.animarMutacion = animarMutacion;
window.alternarBannerMutacion = alternarBannerMutacion;

// --- Animación de carga: Blur Reveal (revela suavemente los elementos al cargar la página) ---
const _cargasBlurHechas = new WeakSet();

function animarCargaBlur(el, { delay = 0, duracion = null, forzar = false } = {}) {
    if (!el || (!forzar && _cargasBlurHechas.has(el)) || prefiereMovimientoReducido()) return;
    _cargasBlurHechas.add(el);
    el.classList.remove('blur-reveal');
    if (delay) el.style.setProperty('--delay-blur-reveal', `${delay}ms`);
    else el.style.removeProperty('--delay-blur-reveal');
    if (duracion) el.style.setProperty('--dur-blur-reveal', `${duracion}ms`);
    else el.style.removeProperty('--dur-blur-reveal');
    void el.offsetWidth;
    el.classList.add('blur-reveal');
    const limpiar = (e) => {
        if (e && e.target !== el) return;
        el.removeEventListener('animationend', limpiar);
        el.classList.remove('blur-reveal');
        el.style.removeProperty('--delay-blur-reveal');
        el.style.removeProperty('--dur-blur-reveal');
    };
    el.addEventListener('animationend', limpiar);
    setTimeout(limpiar, (duracion || 400) + delay + 80);
}

window.animarCargaBlur = animarCargaBlur;

// --- Transición entre pestañas (la llama el DOMContentLoaded de app.js) ---
// Pestañas principales: mutación de salida (un clon fijo de la que sale) y de entrada, con la altura del contenedor
// animada. Subpestañas de Auditoría: deslizamiento lateral entre dos instantáneas; la que entra queda en display:none
// hasta que termina y avisa con `ui:slide-subtab-fin` (esperarPanelVisible). Movido desde app.js: es animación.
function initTransicionesTabs() {
    // Los eventos de pestaña de ui.js burbujean, así que un único listener
    // delegado en document alcanza para todos los botones (antes había uno
    // por botón y por evento: 8 listeners en vez de 2 para las 4 pestañas
    // del panel lateral).
    const SELECTOR_TAB = 'button[data-ui-toggle="pill"], button[data-ui-toggle="tab"]';
    const esPrincipal = (boton) => !!boton.closest('#v-pills-tab');   // sus pestañas las desliza ../shared/ui/js/transicion-pestanas.js

    let _slideSubtabsEstado = null; // { wrapper, incomingPane, timeout }
    let _slideSubtabsPendiente = null;

    function _limpiarClonVisualSubtabs(clon) {
        clon.removeAttribute('id');
        clon.querySelectorAll('[id]').forEach(n => {
            if (n.id && !n.id.includes(' ')) n.classList.add(n.id);
            n.removeAttribute('id');
        });
        return clon;
    }

    function _finalizarSlideSubtabsPendiente() {
        if (!_slideSubtabsEstado) return;
        clearTimeout(_slideSubtabsEstado.timeout);
        const pane = _slideSubtabsEstado.incomingPane;
        pane.style.display = '';
        _slideSubtabsEstado.wrapper.remove();
        _slideSubtabsEstado = null;
        pane.dispatchEvent(new CustomEvent('ui:slide-subtab-fin'));
    }


    document.addEventListener('ui:pestana-ocultar', function (event) {
        if (!event.target.matches(SELECTOR_TAB) || esPrincipal(event.target)) return;

        // El tab actual que se va a ocultar
        const outgoingPaneId = event.target.getAttribute('data-ui-target');
        const outgoingPane = document.querySelector(outgoingPaneId);

        // El tab nuevo que se va a mostrar
        const incomingPaneId = event.detail.relacionado?.getAttribute('data-ui-target');
        const incomingPane = incomingPaneId ? document.querySelector(incomingPaneId) : null;

        if (!outgoingPane || !incomingPane) return;
        if (incomingPane.dataset.skipAnimation === 'true') return;

        const esSubtabAuditoria = !!event.target.closest('#auditoria-subtabs');
        if (esSubtabAuditoria && event.detail.relacionado) {
            _finalizarSlideSubtabsPendiente();
            if (prefiereMovimientoReducido()) {
                incomingPane.dataset.skipAnimation = 'true';
                return;
            }

            const subtabs = Array.from(document.querySelectorAll('#auditoria-subtabs button'));
            const idxSaliente = subtabs.indexOf(event.target);
            const idxEntrante = subtabs.indexOf(event.detail.relacionado);
            const delta = idxEntrante - idxSaliente;

            if (delta === 0) {
                incomingPane.dataset.skipAnimation = 'true';
                return;
            }

            const rectViejo = outgoingPane.getBoundingClientRect();
            const ancho = rectViejo.width;
            const altoViejo = rectViejo.height;

            const snapViejo = _limpiarClonVisualSubtabs(outgoingPane.cloneNode(true));
            snapViejo.classList.remove('active', 'show', 'fade');
            Object.assign(snapViejo.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: `${ancho}px`,
                pointerEvents: 'none',
                margin: '0'
            });

            _slideSubtabsPendiente = {
                outgoingPane,
                incomingPane,
                snapViejo,
                ancho,
                altoViejo,
                delta
            };
            incomingPane.dataset.skipAnimation = 'true';
            return;
        }

        // 0. Fijar altura del contenedor para animar (cancelando la liberación pendiente de un cambio anterior)
        fijarAlturaAnimable(outgoingPane.parentElement);

        // Rendimiento: Activos y Producción tienen cientos de filas/tarjetas con imágenes. Clonarlas enteras para el
        // fantasma de salida trababa el cambio de pestaña: se copian solo los primeros nodos (`clonarAcotado`).
        // 1. Clonar el elemento saliente (con tope de nodos)
        const rect = outgoingPane.getBoundingClientRect();
        const clone = clonarAcotado(outgoingPane, MAX_NODOS_CLON_PESTANA);

        // 2. Posicionarlo como fantasma fijo sobre el original
        Object.assign(clone.style, {
            position: 'fixed',
            top: rect.top + 'px',
            left: rect.left + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            margin: '0',
            pointerEvents: 'none',
            zIndex: '1000'
        });

        clone.classList.remove('active', 'show'); // Limpiar clases de estado
        outgoingPane.parentNode.appendChild(clone);

        // 3. Animar la salida y quitar el clon cuando termine
        animarClase(clone, CLASES_MUTACION.salida, () => clone.remove());
    });

    document.addEventListener('ui:pestana-mostrada', function (event) {
        if (!event.target.matches(SELECTOR_TAB) || esPrincipal(event.target)) return;

        // El tab nuevo que se acaba de mostrar
        const incomingPaneId = event.target.getAttribute('data-ui-target');
        const incomingPane = document.querySelector(incomingPaneId);
        if (!incomingPane) return;

        if (_slideSubtabsPendiente && _slideSubtabsPendiente.incomingPane === incomingPane) {
            delete incomingPane.dataset.skipAnimation;
            const { snapViejo, ancho, altoViejo, delta } = _slideSubtabsPendiente;
            _slideSubtabsPendiente = null;

            const rectNuevo = incomingPane.getBoundingClientRect();
            const altoNuevo = rectNuevo.height;

            const snapNuevo = _limpiarClonVisualSubtabs(incomingPane.cloneNode(true));
            snapNuevo.classList.remove('active', 'show', 'fade');
            const xInicialNuevo = delta > 0 ? ancho : -ancho;
            Object.assign(snapNuevo.style, {
                position: 'absolute',
                top: '0',
                left: `${xInicialNuevo}px`,
                width: `${ancho}px`,
                pointerEvents: 'none',
                margin: '0'
            });

            const wrapper = document.createElement('div');
            wrapper.className = 'slide-subtabs-wrapper';
            Object.assign(wrapper.style, {
                position: 'relative',
                overflow: 'hidden',
                pointerEvents: 'none',
                width: '100%',
                height: `${altoViejo}px`
            });
            wrapper.appendChild(snapViejo);
            wrapper.appendChild(snapNuevo);

            incomingPane.parentNode.insertBefore(wrapper, incomingPane);
            incomingPane.style.display = 'none';

            void wrapper.offsetHeight; // reflow

            const dur = DUR_ANIM_MS;
            const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
            snapViejo.style.transition = `transform ${dur}ms ${easing}`;
            snapNuevo.style.transition = `transform ${dur}ms ${easing}`;
            if (Math.abs(altoNuevo - altoViejo) > 1) {
                wrapper.style.transition = `height ${dur}ms ${easing}`;
                wrapper.style.height = `${altoNuevo}px`;
            }
            const tx = (delta > 0 ? -ancho : ancho) + 'px';
            snapViejo.style.transform = `translateX(${tx})`;
            snapNuevo.style.transform = `translateX(${tx})`;

            const timeout = setTimeout(() => {
                _finalizarSlideSubtabsPendiente();
            }, dur + 30);

            _slideSubtabsEstado = { wrapper, incomingPane, timeout };
            return;
        }

        if (incomingPane.dataset.skipAnimation === 'true') {
            delete incomingPane.dataset.skipAnimation;
            return;
        }

        animarClase(incomingPane, CLASES_MUTACION.entrada);

        // Animar altura del contenedor. Un cambio de pestaña rápido cancela la liberación pendiente del anterior (paso 0)
        // en vez de que ésta suelte la altura en medio de la animación nueva.
        animarAlturaAlContenido(incomingPane.parentElement);
    });
}

// --- Conteo animado de los números principales de los chips (Monitoreo, Canales y Cámaras) ---
// Al cargar la página, el primer valor real de cada número sube desde 0 hasta él; los repintados posteriores
// (polling) lo ponen directo. Sin animación si el sistema pide menos movimiento.

// ==== CONTEO ANIMADO PURO BEGIN ====
const DUR_CONTEO_MS = 800;

// Partes de un texto de KPI: enteros y el resto tal cual ("12/15" -> [12, '/', 15]; "80%" -> [80, '%']).
function partesConteo(texto) {
    return String(texto).split(/(\d+)/).filter(p => p !== '').map(p => (/^\d+$/.test(p) ? Number(p) : p));
}

function tieneNumerosConteo(partes) {
    return partes.some(p => typeof p === 'number');
}

// Avance con desaceleración (ease-out cúbico), acotado a 0..1.
function avanceConteo(t) {
    const x = Math.min(Math.max(Number(t) || 0, 0), 1);
    return 1 - (1 - x) ** 3;
}

// Texto en el instante t (0..1): cada número va de 0 a su valor, redondeado; en t >= 1, el valor exacto.
function textoConteoEn(partes, t) {
    const a = avanceConteo(t);
    return partes.map(p => (typeof p === 'number' ? String(Math.round(p * a)) : p)).join('');
}
// ==== CONTEO ANIMADO PURO END ====

// ==== CONTEO ANIMADO BEGIN ====
const _conteosHechos = new WeakSet();   // elementos que ya mostraron su primer valor con números
const _conteosEnCurso = new WeakMap();  // el -> { id: requestAnimationFrame, final: texto de destino }

/** Pone el texto de un número principal de un chip (solo textContent). La PRIMERA vez que recibe un valor con
 *  números lo cuenta desde 0; después lo pone directo (un valor distinto a mitad de la cuenta la corta).
 *  `alAvanzar(a)` (opcional) acompaña la cuenta con otro elemento (el anillo de Canales): recibe el avance ya suavizado
 *  de cada cuadro, de 0 a 1, y siempre termina con 1 (también cuando el valor se pone directo). */
function ponerTextoConteo(el, valor, alAvanzar = null) {
    if (!el) return;
    const final = String(valor ?? '');
    const enCurso = _conteosEnCurso.get(el);
    if (enCurso) {
        if (enCurso.final === final) return;          // mismo valor (otro repintado): la cuenta sigue
        cancelAnimationFrame(enCurso.id);
        _conteosEnCurso.delete(el);
    }
    const partes = partesConteo(final);
    const primera = !_conteosHechos.has(el) && tieneNumerosConteo(partes);
    if (tieneNumerosConteo(partes)) _conteosHechos.add(el);
    const avanzar = (t) => { if (alAvanzar) alAvanzar(avanceConteo(t)); };
    if (!primera || prefiereMovimientoReducido() || typeof requestAnimationFrame !== 'function') {
        el.textContent = final;
        avanzar(1);
        return;
    }
    let inicio = null;
    const paso = (ahora) => {
        if (inicio === null) inicio = ahora;
        const t = (ahora - inicio) / DUR_CONTEO_MS;
        if (t >= 1) {
            _conteosEnCurso.delete(el);
            el.textContent = final;
            avanzar(1);
            return;
        }
        el.textContent = textoConteoEn(partes, t);
        avanzar(t);
        _conteosEnCurso.set(el, { id: requestAnimationFrame(paso), final });
    };
    el.textContent = textoConteoEn(partes, 0);
    avanzar(0);
    _conteosEnCurso.set(el, { id: requestAnimationFrame(paso), final });
}

function ponerTextoConteoId(id, valor, alAvanzar = null) {
    ponerTextoConteo(document.getElementById(id), valor, alAvanzar);
}
// ==== CONTEO ANIMADO END ====
