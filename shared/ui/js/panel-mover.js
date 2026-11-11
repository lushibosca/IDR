// Mover el panel lateral con el mouse o el teclado (escritorio). Lo usa panel.js (`inicializarReubicarPanelLateral`).
// Necesita gestos.js (`uiArrastreLargo`, `uiAnimarReubicacion`).

// Mantener presionado «Ocultar» y arrastrar: una franja muestra dónde quedaría el panel; al soltar se muda. Solo con ancho de
// escritorio (en móvil el panel es la barra de arriba). Escape cancela; Alt + flechas lo mueve con el teclado.
function inicializarReubicarPanelLateral() {
    const btn = document.getElementById('btn-toggle-sidebar');
    const zonaBtn = btn ? btn.parentElement : null;
    if (!btn || !zonaBtn) return;
    const escritorio = () => window.matchMedia('(min-width: 768px)').matches;
    let destino = null;
    let zonaActual = 'left';
    const mostrarDestino = (x, y) => {
        zonaActual = zonaPanelDestino(x, y, window.innerWidth, window.innerHeight);
        destino.dataset.zona = zonaActual;
    };

    // pulsación larga y arrastre (uiArrastreLargo); el clic que sigue a soltar se traga en el contenedor, antes del de Ocultar
    uiArrastreLargo(zonaBtn, {
        elegir: (e) => (escritorio() && e.target instanceof Element && e.target.closest('#btn-toggle-sidebar') ? btn : null),
        alEmpezar: (_el, inicio) => {
            if (!destino) {
                destino = (() => { const d = document.createElement('div'); d.className = 'panel-destino'; return d; })();
                destino.setAttribute('aria-hidden', 'true');
                document.body.appendChild(destino);
            }
            zonaActual = posicionPanelActual();
            destino.dataset.zona = zonaActual;
            void destino.offsetHeight;                 // la franja arranca en el lugar actual del panel y se desliza
            destino.classList.add('activo');
            document.body.classList.add('panel-reubicando');
            mostrarDestino(inicio.x, inicio.y);
        },
        alMover: (e) => mostrarDestino(e.clientX, e.clientY),
        alTerminar: (_el, confirmar) => {          // Escape o un puntero cancelado: el panel queda donde estaba
            document.body.classList.remove('panel-reubicando');
            if (destino) destino.classList.remove('activo');
            if (confirmar) fijarPosicionPanel(zonaActual);
        },
    });
    btn.addEventListener('keydown', (e) => {
        const zona = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[e.key];
        if (!e.altKey || !zona || !escritorio()) return;
        e.preventDefault();
        fijarPosicionPanel(zona);
        btn.focus();
    });
}
