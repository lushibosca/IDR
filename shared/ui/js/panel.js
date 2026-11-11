// Panel lateral de las apps con el esqueleto común: plegable (`#btn-toggle-sidebar`) y movible a izquierda, derecha, arriba o
// abajo (escritorio; en móvil el panel es la barra de abajo). Estado y lugar se guardan POR DISPOSITIVO con las claves de la app:
// `<prefijo>panel_colapsado` ('1'/'0') y `<prefijo>panel_posicion` (left|right|top|bottom), o las que declare el <script>
// (`data-clave-colapsado`, `data-clave-posicion`, claves completas: SGC conserva las suyas). arranque.js los pone en <html>
// (`data-panel-pos`, `data-panel-colapsado`) antes de pintar. La búsqueda ya despliega el panel sola (foco y escritura en
// `#global-search`; `#search-clear` lo vuelve a plegar) salvo que el <script> traiga `data-busqueda-propia` (SGC lo hace a
// su manera con `panelLateral('buscar')` / `panelLateral('limpiar')`). Mover con el mouse: panel-mover.js; popups con el nombre
// de cada sección cuando solo se ven los íconos: panel-etiquetas.js. Se carga después de ui.js y gestos.js.

const _panelCfg = (() => {
    const s = document.currentScript;
    const pre = document.documentElement.getAttribute('data-idr-prefijo') || '';
    return {
        colapsado: (s && s.getAttribute('data-clave-colapsado')) || `${pre}panel_colapsado`,
        posicion: (s && s.getAttribute('data-clave-posicion')) || `${pre}panel_posicion`,
        busquedaPropia: !!(s && s.hasAttribute('data-busqueda-propia')),
    };
})();
const CLAVE_PANEL_LATERAL = _panelCfg.colapsado;
const CLAVE_POSICION_PANEL = _panelCfg.posicion;      // del dispositivo (como colapsado): no se sincroniza
function leerClavePanel(clave) {
    try { return localStorage.getItem(clave); } catch (_) { return null; }
}
function guardarClavePanel(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (_) { /* queda solo en esta página */ }
}

// ==== PANEL LATERAL PURO BEGIN ====
// Estado del panel lateral: `colapsado` (lo que se ve) y `autoExpandido` (lo abrió la búsqueda y se vuelve a cerrar al
// limpiarla). Eventos: 'alternar' (botón: la única preferencia que se guarda, `guardar`), 'buscar' y 'limpiar'.
function panelLateralTransicion(estado, evento) {
    if (evento === 'alternar') return { colapsado: !estado.colapsado, autoExpandido: false, guardar: true };
    if (evento === 'buscar' && estado.colapsado) return { colapsado: false, autoExpandido: true, guardar: false };
    if (evento === 'limpiar' && estado.autoExpandido) return { colapsado: true, autoExpandido: false, guardar: false };
    return { colapsado: estado.colapsado, autoExpandido: estado.autoExpandido, guardar: false };
}

/**
 * Dónde va el popup con el nombre de una sección del panel colapsado:
 * - Si el panel está a la izquierda: a la derecha del ícono, centrado en vertical.
 * - Si el panel está a la derecha: a la izquierda del ícono, centrado en vertical (para no salirse de la ventana).
 * - Si el panel está arriba o abajo: centrado en horizontal con el ícono, y posicionado dinámicamente
 *   hacia abajo o hacia arriba según la posición del panel y el espacio disponible en la ventana.
 *
 * @param {{ left?: number, top: number, right?: number, bottom?: number, width?: number, height: number }} rectIcono
 * @param {number | { width?: number, height: number }} tamPopup
 * @param {number | { width?: number, height: number }} ventana
 * @param {'left' | 'right' | 'top' | 'bottom'} [posicion='left']
 * @returns {{ left: number, top: number }}
 */
function posicionEtiquetaPanel(rectIcono, tamPopup, ventana, posicion = 'left') {
    const alto = typeof tamPopup === 'number' ? tamPopup : (tamPopup && tamPopup.height) || 0;
    const ancho = typeof tamPopup === 'object' && tamPopup ? (tamPopup.width || 0) : 0;
    const altoVentana = typeof ventana === 'number' ? ventana : (ventana && ventana.height) || 0;
    const anchoVentana = typeof ventana === 'object' && ventana ? (ventana.width || 0) : 0;
    const pos = posicionPanelValida(posicion);

    const altoIcono = rectIcono.height || 0;
    const iconoTop = rectIcono.top || 0;
    const iconoBottom = rectIcono.bottom !== undefined ? rectIcono.bottom : (iconoTop + altoIcono);
    const anchoIcono = rectIcono.width !== undefined
        ? rectIcono.width
        : (rectIcono.right !== undefined && rectIcono.left !== undefined ? rectIcono.right - rectIcono.left : 0);
    const iconoLeft = rectIcono.left !== undefined
        ? rectIcono.left
        : (rectIcono.right !== undefined ? rectIcono.right - anchoIcono : 0);
    const iconoRight = rectIcono.right !== undefined ? rectIcono.right : (iconoLeft + anchoIcono);

    if (pos === 'top' || pos === 'bottom') {
        const centroX = iconoLeft + anchoIcono / 2;
        const centradoX = centroX - ancho / 2;
        const left = Math.max(4, anchoVentana > 0 ? Math.min(centradoX, anchoVentana - ancho - 4) : centradoX);

        const abajo = iconoBottom + 8;
        const arriba = iconoTop - alto - 8;
        const cabeAbajo = altoVentana <= 0 || (abajo + alto <= altoVentana - 4);
        const cabeArriba = arriba >= 4;

        let top;
        if (pos === 'top') {
            if (cabeAbajo) top = abajo;
            else if (cabeArriba) top = arriba;
            else top = (altoVentana - iconoBottom >= iconoTop) ? abajo : arriba;
        } else {
            // pos === 'bottom'
            if (cabeArriba) top = arriba;
            else if (cabeAbajo) top = abajo;
            else top = (iconoTop >= altoVentana - iconoBottom) ? arriba : abajo;
        }
        return {
            left: Math.round(left),
            top: altoVentana > 0 ? Math.max(4, Math.min(Math.round(top), altoVentana - alto - 4)) : Math.round(top)
        };
    }

    // pos === 'left' || pos === 'right'
    const centradoY = iconoTop + altoIcono / 2 - alto / 2;
    const top = altoVentana > 0 ? Math.max(4, Math.min(centradoY, altoVentana - alto - 4)) : centradoY;

    let left;
    if (pos === 'right') {
        left = iconoLeft - ancho - 8;
        if (left < 4 && anchoVentana > 0 && (iconoRight + 8 + ancho <= anchoVentana - 4)) {
            left = iconoRight + 8;
        }
    } else {
        // pos === 'left'
        left = iconoRight + 8;
        if (anchoVentana > 0 && (left + ancho > anchoVentana - 4) && (iconoLeft - ancho - 8 >= 4)) {
            left = iconoLeft - ancho - 8;
        }
    }

    if (anchoVentana > 0 && ancho > 0) {
        left = Math.max(4, Math.min(left, anchoVentana - ancho - 4));
    } else {
        left = Math.max(4, left);
    }

    return { left: Math.round(left), top: Math.round(top) };
}

/**
 * Dónde va la prolongación de un botón del panel colapsado (el nombre pegado al botón, como si este se alargara): a la
 * izquierda del panel, desde el borde derecho del botón hacia la derecha; a la derecha del panel, terminando en el borde
 * izquierdo del botón. A su misma altura y sin salirse de la ventana. (Con el panel arriba o abajo no hay costado: es el
 * popup de siempre, `posicionEtiquetaPanel`.)
 *
 * @param {{ left: number, right: number, top: number, height: number }} rectBoton
 * @param {{ width: number, height: number }} tam
 * @param {{ width: number, height: number }} ventana
 * @param {'left' | 'right' | 'top' | 'bottom'} [posicion='left']
 * @returns {{ left: number, top: number }}
 */
function posicionFilaPanel(rectBoton, tam, ventana, posicion = 'left') {
    const pos = posicionPanelValida(posicion);
    if (pos === 'top' || pos === 'bottom') return posicionEtiquetaPanel(rectBoton, tam, ventana, pos);
    const ancho = (tam && tam.width) || 0;
    const alto = (tam && tam.height) || 0;
    const anchoVentana = (ventana && ventana.width) || 0;
    const altoVentana = (ventana && ventana.height) || 0;
    const deseadoLeft = pos === 'right' ? rectBoton.left - ancho : rectBoton.right;
    const left = anchoVentana > 0 ? Math.min(deseadoLeft, anchoVentana - ancho - 4) : deseadoLeft;
    const top = altoVentana > 0 ? Math.min(rectBoton.top, altoVentana - alto - 4) : rectBoton.top;
    return { left: Math.round(Math.max(4, left)), top: Math.round(Math.max(4, top)) };
}

// Dónde se ubica el panel lateral (solo escritorio): izquierda (de fábrica), derecha, arriba o abajo. Se elige manteniendo
// presionado «Ocultar» y soltando sobre el borde de la ventana más cercano.
const POSICIONES_PANEL = ['left', 'right', 'top', 'bottom'];
function posicionPanelValida(p) {
    return POSICIONES_PANEL.includes(p) ? p : 'left';
}

/** El borde de la ventana más cercano a (x, y), en proporción de cada lado (así una ventana ancha y baja no favorece a los lados). */
function zonaPanelDestino(x, y, ancho, alto) {
    if (!(ancho > 0) || !(alto > 0)) return 'left';
    const d = [['left', x / ancho], ['right', (ancho - x) / ancho], ['top', y / alto], ['bottom', (alto - y) / alto]];
    return d.reduce((mejor, cur) => (cur[1] < mejor[1] ? cur : mejor))[0];
}

/** Ícono del botón Ocultar/Mostrar: la flecha apunta hacia donde se esconde el panel (o de donde vuelve). */
function iconoTogglePanel(posicion, colapsado) {
    const pos = posicionPanelValida(posicion);
    const oculta = { left: 'left', right: 'right', top: 'up', bottom: 'down' }[pos];
    const vuelve = { left: 'right', right: 'left', top: 'down', bottom: 'up' }[pos];
    return `bi-chevron-bar-${colapsado ? vuelve : oculta}`;
}

/**
 * Determina la acción para Ctrl + Flechas según la posición del panel:
 * Si el panel está en los laterales (left / right):
 *   - Flechas verticales (Up/Down): recorrer pestañas (anterior / siguiente)
 *   - Flechas horizontales: Left = volver al buscador, Right = ir al primer resultado
 * Si el panel está arriba o abajo (top / bottom):
 *   - Flechas horizontales (Left/Right): recorrer pestañas (anterior / siguiente)
 *   - Flechas verticales:
 *       top: Up = buscador (arriba), Down = resultados (abajo)
 *       bottom: Down = buscador (abajo), Up = resultados (arriba)
 */
function accionAtajoFlechaCtrl(key, posicion) {
    const pos = posicionPanelValida(posicion);
    const horizontal = pos === 'top' || pos === 'bottom';
    if (horizontal) {
        if (key === 'ArrowLeft') return 'pestana-anterior';
        if (key === 'ArrowRight') return 'pestana-siguiente';
        if (pos === 'top') {
            if (key === 'ArrowUp') return 'buscador';
            if (key === 'ArrowDown') return 'resultados';
        } else {
            if (key === 'ArrowDown') return 'buscador';
            if (key === 'ArrowUp') return 'resultados';
        }
    } else {
        if (key === 'ArrowUp') return 'pestana-anterior';
        if (key === 'ArrowDown') return 'pestana-siguiente';
        if (key === 'ArrowLeft') return 'buscador';
        if (key === 'ArrowRight') return 'resultados';
    }
    return null;
}

/**
 * ¿Algún contenedor del panel o del encabezado tiene más contenido que ancho (no entra)? Cada medida es el ancho útil de
 * la caja y el ancho de lo que lleva adentro; `tolerancia` absorbe los redondeos del navegador.
 * @param {Array<{ancho: number, contenido: number} | null>} medidas
 * @param {number} [tolerancia=1]
 * @returns {boolean}
 */
function panelDesborda(medidas, tolerancia = 1) {
    return (Array.isArray(medidas) ? medidas : []).some(m => m && Number.isFinite(m.ancho) && Number.isFinite(m.contenido)
        && m.contenido - m.ancho > tolerancia);
}

/**
 * Determina el índice de la siguiente pestaña al hacer scroll con la rueda sobre el panel.
 * @param {number} indiceActual - Índice actual (-1 si ninguna pestaña activa)
 * @param {number} total - Cantidad de pestañas disponibles
 * @param {number} delta - Dirección del scroll (> 0 baja/siguiente, < 0 sube/anterior)
 * @returns {number} Siguiente índice (-1 si no hay pestañas o delta es 0)
 */
function calcularPestanaRueda(indiceActual, total, delta) {
    if (!total || total <= 0 || !delta) return -1;
    const paso = delta > 0 ? 1 : -1;
    if (indiceActual < 0) return paso > 0 ? 0 : total - 1;
    return (indiceActual + paso + total) % total;
}
// ==== PANEL LATERAL PURO END ====

// ==== ALTO PANEL LATERAL PURO BEGIN ====
// Alto del panel lateral anclado: lo que queda de la ventana desde su borde superior hasta el margen de abajo. Con avisos
// arriba (error de la API, red del equipo...) y sin haber hecho scroll, el panel arranca más abajo que su lugar anclado;
// con el alto fijo de siempre su botón «Ocultar» (al fondo) quedaba fuera de la ventana. `minimo`: nunca más chico.
function altoPanelLateral(arribaPanel, altoVentana, margen, minimo) {
    if (![arribaPanel, altoVentana, margen, minimo].every(Number.isFinite)) return null;
    return Math.max(minimo, Math.floor(altoVentana - arribaPanel - margen));
}
// ==== ALTO PANEL LATERAL PURO END ====

// Sincronizar altura de la barra superior con la variable CSS `--navbar-height` (panel lateral, encabezados de acordeón, scroll)
function actualizarAlturaNavbar() {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        const h = navbar.offsetHeight;
        document.documentElement.style.setProperty('--navbar-height', `${h}px`);
    }
}

// Alto real del navbar para cálculos de auto-scroll (el mismo valor que ya
// queda en --navbar-height; si el navbar cambia de alto, no hace falta tocar
// este número aparte).
function obtenerAlturaNavbar() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height'));
    return Number.isFinite(v) ? v : 58;
}


// Fija `--alto-panel` en el panel lateral (solo escritorio: en móvil no es anclado). Con scroll, resize o cambios de alto
// de la página (aparece o se va un aviso).
function ajustarAltoPanelLateral() {
    const panel = document.getElementById('sidebar-col');
    if (!panel) return;
    // Arriba o abajo el panel es una barra de alto propio: sin `--alto-panel` (el de antes, medido en otro lugar, dejaba el panel
    // chico y con scroll al volver a un costado)
    if (['top', 'bottom'].includes(posicionPanelActual())) {
        panel.style.removeProperty('--alto-panel');
        return;
    }
    const margen = 1.5 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    // Dónde arranca el panel: el borde de arriba de su fila o, si ya se hizo scroll, donde se ancla (barra + margen). Se mide la FILA y no
    // el panel: al cambiarlo de lugar el panel todavía se está acomodando (transiciones de ancho) y su posición no es la final.
    const fila = document.getElementById('app-main-row');
    const arriba = Math.max(fila ? fila.getBoundingClientRect().top : 0, obtenerAlturaNavbar() + margen);
    const alto = altoPanelLateral(arriba, window.innerHeight, margen, 120);
    if (alto !== null) panel.style.setProperty('--alto-panel', `${alto}px`);
}
let panelLateralTransicionando = false;
document.addEventListener('DOMContentLoaded', () => {
    let pendiente = false;
    const programar = () => {
        if (pendiente || panelLateralTransicionando) return;
        pendiente = true;
        requestAnimationFrame(() => { pendiente = false; ajustarAltoPanelLateral(); });
    };
    window.addEventListener('scroll', programar, { passive: true });
    window.addEventListener('resize', programar, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(programar).observe(document.body);
    programar();
});

function pintarPanelLateral(colapsado, { animar = true } = {}) {
    const sidebarCol = document.getElementById('sidebar-col');
    if (!sidebarCol) return;
    const estabaColapsado = sidebarCol.classList.contains('sidebar-collapsed');
    if (animar && estabaColapsado !== colapsado) {
        panelLateralTransicionando = true;
        clearTimeout(pintarPanelLateral.finTransicion);
        pintarPanelLateral.finTransicion = setTimeout(() => {
            panelLateralTransicionando = false;
            ajustarAltoPanelLateral();
        }, 320);
        if (!sidebarCol.dataset.transicionEscuchada) {
            sidebarCol.dataset.transicionEscuchada = '1';
            sidebarCol.addEventListener('transitionend', (e) => {
                if (e.target === sidebarCol && (e.propertyName === 'width' || e.propertyName === 'max-width')) {
                    clearTimeout(pintarPanelLateral.finTransicion);
                    panelLateralTransicionando = false;
                    ajustarAltoPanelLateral();
                }
            });
        }
    }
    sidebarCol.classList.toggle('sidebar-collapsed', colapsado);
    ajustarEtiquetasPanel();
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    if (!btnToggle) return;
    const etiqueta = colapsado ? 'Mostrar panel lateral' : 'Ocultar panel lateral';
    btnToggle.dataset.etiqueta = etiqueta;
    btnToggle.setAttribute('aria-label', etiqueta);
    // En el encabezado el botón queda fuera del panel (sin su popup de íconos): el nombre va como ayuda del navegador
    if (btnToggle.closest('.navbar')) btnToggle.title = etiqueta; else btnToggle.removeAttribute('title');
    const icon = btnToggle.querySelector('.sidebar-toggle-icon');
    if (icon) icon.className = `bi ${iconoTogglePanel(posicionPanelActual(), colapsado)} sidebar-toggle-icon`;
}


// ---- Ubicación del panel lateral (escritorio): `data-panel-pos` en <html> (lo pone arranque.js antes de pintar)
function posicionPanelActual() {
    return posicionPanelValida(document.documentElement.dataset.panelPos);
}
// Con el panel ARRIBA (escritorio) sus elementos van dentro del encabezado (la barra superior); en cualquier otro lugar, en la
// fila principal. Se mueve el nodo entero (`#sidebar-col`): conserva sus escuchas y su estado. El botón de ocultar (`.sidebar-bottom`)
// se muda al lado del de ajustes, solo con el ícono (no le quita lugar a los botones de la derecha); fuera del encabezado vuelve
// al final del panel.
function ubicarPanelEnEncabezado() {
    const col = document.getElementById('sidebar-col');
    const barra = document.querySelector('.navbar > .container-fluid');
    const fila = document.getElementById('app-main-row');
    if (!col || !barra || !fila) return;
    const enEncabezado = posicionPanelActual() === 'top' && window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    if (enEncabezado && col.parentElement !== barra) {
        barra.insertBefore(col, barra.querySelector(':scope > .d-flex'));
    } else if (!enEncabezado && col.parentElement !== fila) {
        fila.insertBefore(col, fila.firstChild);
    }
    const ocultar = col.querySelector('.sidebar-bottom') || document.querySelector('.navbar .sidebar-bottom');
    const ajustes = document.getElementById('menu-config') || document.querySelector('.navbar-acciones > :last-child');
    const acciones = ajustes ? ajustes.parentElement : document.querySelector('.navbar-acciones');
    const sticky = col.querySelector('.sidebar-sticky');
    if (ocultar && enEncabezado && acciones && ocultar.parentElement !== acciones) {
        acciones.insertBefore(ocultar, ajustes || null);
    } else if (ocultar && !enEncabezado && sticky && ocultar.parentElement !== sticky) {
        sticky.appendChild(ocultar);
    }
    actualizarAlturaNavbar();
}

// Con el panel ARRIBA o ABAJO y mostrando sus textos: si algo no entra a lo ancho (los textos de las pestañas, el menú de
// ajustes o el de actualización del encabezado), se ocultan las etiquetas (queda el ícono; el buscador no se toca). Se mide
// con las etiquetas a la vista y sin transición (`sidebar-midiendo`), y se decide en el mismo cuadro: no parpadea.
const CLASE_ETIQUETAS_OCULTAS = 'sidebar-etiquetas-ocultas';
function ajustarEtiquetasPanel() {
    const col = document.getElementById('sidebar-col');
    if (!col) return;
    const posicion = posicionPanelActual();
    const aplica = (posicion === 'top' || posicion === 'bottom') && !col.classList.contains('sidebar-collapsed')
        && window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    if (!aplica) {
        col.classList.remove(CLASE_ETIQUETAS_OCULTAS);
        return;
    }
    col.classList.add('sidebar-midiendo');
    col.classList.remove(CLASE_ETIQUETAS_OCULTAS);
    const cajas = [col.querySelector('.sidebar-sticky'), col.querySelector('#v-pills-tab'),
        document.querySelector('.navbar > .container-fluid')];
    const medidas = cajas.map(el => (el ? { ancho: el.clientWidth, contenido: el.scrollWidth } : null));
    col.classList.toggle(CLASE_ETIQUETAS_OCULTAS, panelDesborda(medidas));
    col.classList.remove('sidebar-midiendo');
}

function fijarPosicionPanel(posicion, { animar = true, guardar = true } = {}) {
    const pos = posicionPanelValida(posicion);
    if (pos === posicionPanelActual()) return;
    const cambiar = () => {
        if (pos === 'left') delete document.documentElement.dataset.panelPos;
        else document.documentElement.dataset.panelPos = pos;
        ubicarPanelEnEncabezado();
        pintarPanelLateral(estadoPanelLateral.colapsado);
        ajustarEtiquetasPanel();
        ajustarAltoPanelLateral();           // con el alto que corresponde al lugar nuevo, ya para la medida de la animación
    };
    // el panel y el contenido se deslizan a su lugar nuevo (el mismo recorrido que las secciones del dashboard)
    const piezas = () => ['sidebar-col', 'main-content-col'].map(id => document.getElementById(id)).filter(Boolean);
    if (animar) uiAnimarReubicacion(piezas, el => el.id, cambiar); else cambiar();
    if (guardar) guardarClavePanel(CLAVE_POSICION_PANEL, pos);
}

function panelLateral(evento) {
    const r = panelLateralTransicion(estadoPanelLateral, evento);
    estadoPanelLateral = { colapsado: r.colapsado, autoExpandido: r.autoExpandido };
    pintarPanelLateral(r.colapsado);
    if (r.guardar) guardarClavePanel(CLAVE_PANEL_LATERAL, r.colapsado ? '1' : '0');
}


let estadoPanelLateral = { colapsado: false, autoExpandido: false };
function inicializarPanelLateral() {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebarCol = document.getElementById('sidebar-col');
    if (!sidebarCol || !btnToggle) return;

    estadoPanelLateral = { colapsado: leerClavePanel(CLAVE_PANEL_LATERAL) === '1', autoExpandido: false };
    // Dónde está el panel (lo puso arranque.js antes de pintar; acá se asegura que coincida con lo guardado)
    fijarPosicionPanel(leerClavePanel(CLAVE_POSICION_PANEL), { animar: false, guardar: false });
    if (typeof inicializarReubicarPanelLateral === 'function') inicializarReubicarPanelLateral();   // panel-mover.js
    pintarPanelLateral(estadoPanelLateral.colapsado, { animar: false });
    btnToggle.addEventListener('click', () => panelLateral('alternar'));

    const buscador = document.getElementById('global-search');
    const contenedorBusqueda = document.getElementById('sidebar-search-container');
    if (contenedorBusqueda) {
        contenedorBusqueda.addEventListener('click', () => {
            if (!estadoPanelLateral.colapsado) return;
            panelLateral('buscar');
            if (buscador) buscador.focus();
        });
    }
    if (!_panelCfg.busquedaPropia && buscador) {
        buscador.addEventListener('focus', () => panelLateral('buscar'));
        buscador.addEventListener('input', () => panelLateral(buscador.value.trim() ? 'buscar' : 'limpiar'));
        document.getElementById('search-clear')?.addEventListener('click', () => panelLateral('limpiar'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarAlturaNavbar();
    window.addEventListener('resize', actualizarAlturaNavbar, { passive: true });
    if (window.ResizeObserver) {
        const navbar = document.querySelector('.navbar');
        if (navbar) new ResizeObserver(actualizarAlturaNavbar).observe(navbar);
    }
    ubicarPanelEnEncabezado();
    if (window.matchMedia) window.matchMedia('(min-width: 768px)').addEventListener('change', ubicarPanelEnEncabezado);
    // las etiquetas del panel (arriba / abajo) se ocultan si algo no entra: al cambiar el ancho, el contenido del encabezado o la
    // fuente; un cuadro de espera junta varios avisos
    let esperandoEtiquetas = false;
    const programarEtiquetas = () => {
        if (esperandoEtiquetas) return;
        esperandoEtiquetas = true;
        requestAnimationFrame(() => { esperandoEtiquetas = false; ajustarEtiquetasPanel(); });
    };
    window.addEventListener('resize', programarEtiquetas, { passive: true });
    if (window.matchMedia) window.matchMedia('(min-width: 768px)').addEventListener('change', programarEtiquetas);
    if (window.ResizeObserver) {
        const barra = document.querySelector('.navbar > .container-fluid');
        if (barra) new ResizeObserver(programarEtiquetas).observe(barra);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(programarEtiquetas);
    inicializarPanelLateral();
    ajustarEtiquetasPanel();
});
