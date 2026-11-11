// Móvil (< 768 px): el buscador del panel está oculto y se abre con el ícono de la barra de abajo (#btn-buscar-movil); aparece
// arriba (`html.busqueda-movil-abierta`, el CSS lo desliza) y se cierra con el mismo ícono, con Escape o al tocar fuera sin
// texto. Con texto escrito y cerrado, el ícono lleva un punto (`.con-texto`): la búsqueda sigue filtrando. Se carga después de app.js.

// ==== BUSQUEDA MOVIL PURO BEGIN ====
/** Estado siguiente del buscador móvil. evento: 'alternar' (ícono), 'abrir' (foco en el campo), 'cerrar' (Escape, fuera, ancho de escritorio). */
function busquedaMovilSiguiente(abierta, evento) {
    if (evento === 'alternar') return !abierta;
    if (evento === 'abrir') return true;
    if (evento === 'cerrar') return false;
    return !!abierta;
}

/** Tocar fuera cierra el buscador solo si está abierto y vacío (con texto se queda a la vista). */
function busquedaMovilCierraAlTocarFuera({ abierta, texto, tocoDentro }) {
    return !!abierta && !tocoDentro && String(texto == null ? '' : texto).trim() === '';
}
// ==== BUSQUEDA MOVIL PURO END ====

(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const boton = $('btn-buscar-movil');
    const campo = $('global-search');
    const caja = $('sidebar-search-container');
    if (!boton || !campo || !caja) return;
    const raiz = document.documentElement;
    const CLASE = 'busqueda-movil-abierta';
    const escritorio = window.matchMedia ? window.matchMedia('(min-width: 768px)') : null;

    const abierta = () => raiz.classList.contains(CLASE);
    function aplicar(evento) {
        const antes = abierta();
        const ahora = busquedaMovilSiguiente(antes, evento);
        raiz.classList.toggle(CLASE, ahora);
        boton.classList.toggle('busqueda-activa', ahora);
        boton.setAttribute('aria-expanded', String(ahora));
        if (ahora && !antes) requestAnimationFrame(() => campo.focus({ preventScroll: true }));
        marcarTexto();
    }
    function marcarTexto() {
        boton.classList.toggle('con-texto', campo.value.trim() !== '');
    }

    boton.addEventListener('click', () => aplicar('alternar'));
    campo.addEventListener('focusin', () => { if (!abierta() && !(escritorio && escritorio.matches)) aplicar('abrir'); });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierta()) aplicar('cerrar'); });
    campo.addEventListener('input', marcarTexto);
    document.addEventListener('cctv:busqueda', marcarTexto);
    document.addEventListener('pointerdown', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const tocoDentro = !!t && (!!t.closest('#sidebar-search-container') || !!t.closest('#btn-buscar-movil')
            || !!t.closest('#search-filter-menu'));
        if (busquedaMovilCierraAlTocarFuera({ abierta: abierta(), texto: campo.value, tocoDentro })) aplicar('cerrar');
    });
    if (escritorio) escritorio.addEventListener('change', () => { if (escritorio.matches && abierta()) aplicar('cerrar'); });
    marcarTexto();
})();
