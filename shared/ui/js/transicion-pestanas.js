// Transición de cambio de pestaña de TODAS las apps con el esqueleto común (SGC, SGR, SGI, SGP): al cambiar de pestaña en
// el panel (`#v-pills-tab`, por clic, teclado, swipe o código) la que sale se clona y desliza fuera dentro de su contenedor
// (`#v-pills-tabContent`, que recorta) y la que entra desliza desde el lado de su posición en el orden de las pestañas, con la
// altura del contenedor animada. Con el panel arriba/abajo o en móvil (barra abajo) desliza de lado; con el panel a un costado,
// hacia arriba o abajo (más corto y con fundido). «Reducir animaciones» (`data-movimiento="reducido"` o el sistema): sin
// animar. Lo escuchan `ui:pestana-ocultar` / `ui:pestana-mostrada` de ui.js. Se carga ANTES que los scripts de cada app:
// también deja global `DUR_ANIM_MS`, `fijarAlturaAnimable` y `animarAlturaAlContenido` (SGC los usa en otras animaciones).

// ==== PRIMITIVAS DE ANIMACION BEGIN ====
const DUR_ANIM_MS = (() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--dur-anim').trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 250;
    return v.endsWith('ms') ? n : n * 1000;
})();

// --- Altura animada de un contenedor que cambia de contenido (pestañas y mutarContenido) ---
// fijarAlturaAnimable congela la altura actual; animarAlturaAlContenido la lleva hasta la de su contenido nuevo y
// después la libera. Un cambio rápido cancela la liberación pendiente del anterior en vez de soltar la altura a mitad.
function fijarAlturaAnimable(el, recortar) {
    if (!el || !el.style) return;
    if (el._cancelarAltura) el._cancelarAltura();
    el.style.transition = '';
    el.style.height = el.getBoundingClientRect().height + 'px';
    // clip (no hidden): recorta sin crear un contenedor de scroll, así los encabezados sticky siguen funcionando
    // Un cuerpo de modal con el lugar de la scrollbar reservado (`modal-body-estable`) se recorta con `hidden`: con `clip` la
    // scrollbar desaparece mientras dura la animación y el contenido se corre al ancho que ella ocupaba
    if (recortar) el.style.overflow = el.classList.contains('modal-body-estable') ? 'hidden' : 'clip';
}

function animarAlturaAlContenido(el) {
    if (!el || !el.style || !el.style.height) return;
    const alturaActual = el.style.height;
    el.style.height = 'auto';
    const alturaNueva = el.getBoundingClientRect().height + 'px';
    el.style.height = alturaActual;
    void el.offsetHeight;   // fuerza el reflow para que la transición arranque desde la altura actual
    el.style.transition = 'height var(--dur-anim) ease';
    el.style.height = alturaNueva;

    let temporizador = null;
    const cancelar = () => {
        clearTimeout(temporizador);
        el.removeEventListener('transitionend', alTerminar);
        el._cancelarAltura = null;
    };
    const liberar = () => {
        cancelar();
        el.style.transition = '';
        el.style.height = '';
        el.style.overflow = '';
    };
    const alTerminar = (ev) => { if (ev.target === el) liberar(); };
    el.addEventListener('transitionend', alTerminar);
    temporizador = setTimeout(liberar, DUR_ANIM_MS + 100);   // por si transitionend no llega
    el._cancelarAltura = cancelar;
}
// ==== PRIMITIVAS DE ANIMACION END ====

// ==== DESLIZE POSICION PURO BEGIN ====
// Mientras se deslizan las pestañas principales, su contenedor es `position: relative` (la que sale es absoluta dentro de él) y vuelve
// a lo que tenía recién cuando termina el ÚLTIMO deslizamiento en curso. Con dos cambios seguidos, el segundo arranca antes de que
// termine el primero: si cada uno recordara «lo que había» al empezar, el segundo recordaría `relative` y el primero, al terminar,
// soltaría la posición a mitad del segundo (la pestaña que sale se corría de lugar sobre el panel) y el segundo la dejaría en
// `relative` para siempre. `tomar(actual)` al empezar; `soltar()` al terminar: da la posición original recién con el último
// (null mientras quede otro en curso).
function crearPosicionCompartida() {
    let original = '';
    let enCurso = 0;
    return {
        tomar(actual) {
            if (enCurso === 0) original = actual;
            enCurso += 1;
        },
        soltar() {
            enCurso = Math.max(0, enCurso - 1);
            return enCurso === 0 ? original : null;
        },
        enCurso: () => enCurso,
    };
}
// ==== DESLIZE POSICION PURO END ====

// ==== CLON ACOTADO PURO BEGIN ====
// Copia de `nodo` con a lo sumo `tope` nodos, en orden del documento: lo que pasa del tope no se copia. Es el fantasma de la
// pestaña que sale: un panel con cientos de filas (Activos, Producción) no se clonaba entero (trababa el cambio) y entonces
// desaparecía de golpe; con el tope se anima lo de arriba, que es lo que se ve (el contenedor recorta el resto).
function clonarAcotado(nodo, tope) {
    const cupo = { restantes: tope };
    const copiar = (n) => {
        const c = n.cloneNode(false);
        cupo.restantes -= 1;
        for (const hijo of Array.from(n.childNodes)) {
            if (cupo.restantes <= 0) break;
            c.appendChild(copiar(hijo));
        }
        return c;
    };
    return copiar(nodo);
}
// ==== CLON ACOTADO PURO END ====

const MAX_NODOS_CLON_PESTANA = 1500;      // más que esto, el fantasma de la pestaña que sale se copia solo hasta aquí

(function () {
    'use strict';
    const SELECTOR_TAB = 'button[data-ui-toggle="pill"]';
    const EASING_DESLIZE = 'cubic-bezier(0.4, 0, 0.2, 1)';
    let _deslizePrincipal = null;       // { incomingPane, parent, eje, signo, dist, liberado }
    const _posicionDeslize = crearPosicionCompartida();

    const _ejeDeslizePestanas = () => {
        const pos = document.documentElement.getAttribute('data-panel-pos') || 'left';
        return pos === 'top' || pos === 'bottom' || (window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches) ? 'x' : 'y';   // móvil: la barra va abajo
    };
    const _keyframeDeslizar = (eje, px, opacidad) => ({
        transform: eje === 'x' ? `translateX(${px}px)` : `translateY(${px}px)`, opacity: opacidad });
    function _liberarDeslizePrincipal(estado) {
        if (estado.liberado) return;                       // terminó o se canceló una sola vez
        estado.liberado = true;
        const original = _posicionDeslize.soltar();
        if (original !== null && estado.parent && estado.parent.style) estado.parent.style.position = original;
    }

    document.addEventListener('ui:pestana-ocultar', function (event) {
        if (!event.target.matches(SELECTOR_TAB) || !event.target.closest('#v-pills-tab')) return;
        const outgoingPane = document.querySelector(event.target.getAttribute('data-ui-target'));
        const entrante = event.detail.relacionado;
        const incomingPane = entrante ? document.querySelector(entrante.getAttribute('data-ui-target')) : null;
        if (!outgoingPane || !incomingPane || incomingPane.dataset.skipAnimation === 'true') return;
        if (typeof incomingPane.animate !== 'function' || uiMovimientoReducido()) { incomingPane.dataset.skipAnimation = 'true'; return; }
        const botones = Array.from(document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]'));
        const delta = botones.indexOf(entrante) - botones.indexOf(event.target);
        if (delta === 0) { incomingPane.dataset.skipAnimation = 'true'; return; }
        const parent = outgoingPane.parentElement;
        const eje = _ejeDeslizePestanas();
        const rectP = parent.getBoundingClientRect();
        const dist = eje === 'x' ? rectP.width : 80;
        const signo = delta > 0 ? 1 : -1;
        if (_deslizePrincipal) _liberarDeslizePrincipal(_deslizePrincipal);
        fijarAlturaAnimable(parent, true);
        const estado = { incomingPane, parent, eje, signo, dist, liberado: false };
        _posicionDeslize.tomar(parent.style.position);
        parent.style.position = 'relative';
        _deslizePrincipal = estado;
        incomingPane.dataset.skipAnimation = 'true';
        const rect = outgoingPane.getBoundingClientRect();
        const clon = clonarAcotado(outgoingPane, MAX_NODOS_CLON_PESTANA);
        clon.removeAttribute('id');
        clon.classList.remove('active', 'show', 'fade');
        clon.classList.add('slide-pestana-saliente');
        Object.assign(clon.style, { position: 'absolute', top: `${rect.top - rectP.top}px`, left: `${rect.left - rectP.left}px`,
            width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', display: 'block' });
        parent.appendChild(clon);
        const salida = clon.animate([_keyframeDeslizar(eje, 0, 1), _keyframeDeslizar(eje, -signo * dist, eje === 'x' ? 1 : 0)],
            { duration: DUR_ANIM_MS, easing: EASING_DESLIZE, fill: 'forwards' });
        salida.onfinish = salida.oncancel = () => clon.remove();
    });

    document.addEventListener('ui:pestana-mostrada', function (event) {
        if (!event.target.matches(SELECTOR_TAB) || !event.target.closest('#v-pills-tab')) return;
        const incomingPane = document.querySelector(event.target.getAttribute('data-ui-target'));
        if (!incomingPane) return;
        if (_deslizePrincipal && _deslizePrincipal.incomingPane === incomingPane) {
            const estado = _deslizePrincipal;
            _deslizePrincipal = null;
            delete incomingPane.dataset.skipAnimation;
            const { eje, signo, dist } = estado;
            const entrada = incomingPane.animate([_keyframeDeslizar(eje, signo * dist, eje === 'x' ? 1 : 0), _keyframeDeslizar(eje, 0, 1)],
                { duration: DUR_ANIM_MS, easing: EASING_DESLIZE });
            entrada.onfinish = entrada.oncancel = () => _liberarDeslizePrincipal(estado);
            animarAlturaAlContenido(estado.parent);
            return;
        }
        delete incomingPane.dataset.skipAnimation;          // sin animación (reducida, restaurada al cargar, misma pestaña)
    });
})();
