// Con el panel lateral colapsado (solo íconos), pasar el mouse (o el foco) por un ícono muestra un popup con el nombre de su
// sección. Va fuera del panel, que recorta lo que sobresale. Las etiquetas están en `data-etiqueta` (texto, nunca HTML).
// Para las pestañas del panel (Estado, Activos...) con el panel a un costado no es un popup aparte sino una PROLONGACIÓN del
// botón: pegada a su borde exterior, de su misma altura y color, con solo el nombre (el ícono y el contador de la búsqueda
// ya están en el botón). El resto de los botones (buscar, ocultar) y el panel arriba o abajo llevan el texto de siempre.
function llenarEtiquetaPanel(tip, el, prolonga) {
    tip.replaceChildren();
    tip.classList.remove('sidebar-tip-fila', 'sidebar-tip-activa');
    tip.style.removeProperty('min-height');
    if (!prolonga) {
        tip.textContent = el.dataset.etiqueta;
        return;
    }
    tip.classList.add('sidebar-tip-fila');
    tip.classList.toggle('sidebar-tip-activa', el.classList.contains('active'));
    const nombre = document.createElement('span');
    nombre.textContent = el.dataset.etiqueta;
    tip.appendChild(nombre);
}

function inicializarEtiquetasPanelLateral() {
    const panel = document.getElementById('sidebar-col');
    if (!panel) return;
    const tip = document.createElement('div');
    tip.className = 'sidebar-tip d-none';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let origen = null;                 // el elemento que lo muestra y cómo: { el, modo: 'mouse' | 'foco' }
    const ocultar = () => {
        tip.classList.add('d-none');
        // el botón al que se une la prolongación vuelve a tener sus esquinas redondeadas
        panel.querySelectorAll('.sidebar-tip-origen').forEach(b => b.classList.remove('sidebar-tip-origen', 'sidebar-tip-origen-der'));
        origen = null;
    };
    const mostrar = (el, modo) => {
        // solo íconos (panel oculto) o sin textos por falta de lugar (el buscador conserva el suyo)
        const sinTexto = panel.classList.contains('sidebar-collapsed')
            || (panel.classList.contains('sidebar-etiquetas-ocultas') && !el.closest('.search-container'));
        if (!sinTexto || !el.dataset.etiqueta) return;
        origen = { el, modo };
        const posPanel = posicionPanelActual();
        const rect = el.getBoundingClientRect();
        const esFila = el.matches('.nav-link') && (posPanel === 'left' || posPanel === 'right');
        llenarEtiquetaPanel(tip, el, esFila);
        if (esFila) tip.style.minHeight = `${Math.round(rect.height)}px`;
        tip.classList.toggle('sidebar-tip-der', esFila && posPanel === 'right');
        el.classList.toggle('sidebar-tip-origen', esFila);
        el.classList.toggle('sidebar-tip-origen-der', esFila && posPanel === 'right');
        tip.classList.remove('d-none');
        const pos = (esFila ? posicionFilaPanel : posicionEtiquetaPanel)(
            rect,
            { width: tip.offsetWidth, height: tip.offsetHeight },
            { width: window.innerWidth, height: window.innerHeight },
            posPanel
        );
        tip.style.left = `${pos.left}px`;
        tip.style.top = `${pos.top}px`;
    };
    panel.querySelectorAll('[data-etiqueta]').forEach(el => {
        el.addEventListener('mouseenter', () => mostrar(el, 'mouse'));
        // solo el foco del teclado: el de un clic (o el que vuelve al regresar a la ventana) dejaba el popup pegado
        el.addEventListener('focus', () => { if (uiFocoDeTeclado(el)) mostrar(el, 'foco'); });
        el.addEventListener('mouseleave', ocultar);
        el.addEventListener('blur', ocultar);
        el.addEventListener('click', ocultar);
    });
    window.addEventListener('scroll', ocultar, true);
    window.addEventListener('resize', ocultar);
    // Lo que lo deja pegado: un `mouseleave` que no llega (el panel se mueve o se reacomoda bajo el puntero), volver a la ventana,
    // abrirse el panel con el popup a la vista, o tocar otra cosa. Se oculta en todos esos casos.
    document.addEventListener('pointermove', () => {
        if (origen && origen.modo === 'mouse' && !origen.el.matches(':hover')) ocultar();
    }, { passive: true });
    document.addEventListener('pointerdown', ocultar, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ocultar(); });
    window.addEventListener('blur', ocultar);
    document.addEventListener('visibilitychange', ocultar);
    new MutationObserver(() => {
        if (!panel.classList.contains('sidebar-collapsed') && !panel.classList.contains('sidebar-etiquetas-ocultas')) ocultar();
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('DOMContentLoaded', inicializarEtiquetasPanelLateral);
