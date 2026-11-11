// Móvil (< 768 px): la barra superior se oculta al bajar y reaparece al subir (`html.navbar-oculta`; el CSS la desliza y los
// encabezados pegajosos suben con ella porque --navbar-height pasa a 0). Arriba de todo siempre se ve. Con el buscador abierto
// no se oculta. Se carga después de produccion.js (usa actualizarAlturaNavbar) y de busqueda-movil.js.

// ==== BARRA SUPERIOR MOVIL PURO BEGIN ====
/**
 * ¿Debe estar oculta la barra superior? y = scroll actual, anterior = scroll de la última decisión, alto = lo que mide la barra.
 * Un movimiento menor al umbral no cambia nada (el temblor del dedo); al final del recorrido el rebote de iOS da y fuera de rango.
 */
function barraSuperiorOculta({ y, anterior, oculta, alto, umbral }) {
    const pos = Math.max(0, y);
    if (pos <= alto) return false;                       // arriba de todo siempre se ve
    const delta = pos - anterior;
    if (Math.abs(delta) < (umbral == null ? 8 : umbral)) return !!oculta;
    return delta > 0;
}
// ==== BARRA SUPERIOR MOVIL PURO END ====

(function () {
    'use strict';
    const barra = document.querySelector('.navbar');
    if (!barra || !window.matchMedia) return;
    const raiz = document.documentElement;
    const movil = window.matchMedia('(max-width: 767.98px)');
    const UMBRAL = 8;
    let ultimo = window.scrollY;
    let pendiente = false;

    function fijar(oculta) {
        if (raiz.classList.contains('navbar-oculta') === oculta) return;
        raiz.classList.toggle('navbar-oculta', oculta);
        if (typeof actualizarAlturaNavbar === 'function') actualizarAlturaNavbar();
    }

    function revisar() {
        pendiente = false;
        const y = Math.max(0, window.scrollY);
        if (!movil.matches || raiz.classList.contains('busqueda-movil-abierta')) {
            fijar(false);
            ultimo = y;
            return;
        }
        const oculta = barraSuperiorOculta({ y, anterior: ultimo, oculta: raiz.classList.contains('navbar-oculta'),
            alto: barra.offsetHeight, umbral: UMBRAL });
        fijar(oculta);
        if (Math.abs(y - ultimo) >= UMBRAL || y <= barra.offsetHeight) ultimo = y;
    }

    window.addEventListener('scroll', () => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(revisar);
    }, { passive: true });
    movil.addEventListener('change', revisar);
    document.addEventListener('focusin', (e) => {        // un campo enfocado abajo (el buscador) deja la barra a la vista
        if (e.target instanceof Element && e.target.closest('#sidebar-search-container')) fijar(false);
    });
})();
