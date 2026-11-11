let globalData = { nvrs: [], camaras: [] };   // /api/v2/datos (js/api-local.js lo arma desde el stock)

// Ubicación de una cámara o un NVR según el stock ("Anexo A · piso PB · rack 0131 · puerto 4/0/45"; '' sin alta o sin
// datos). La arma stock.js (una sola definición del texto); `equipo.stock` lo agrega el servidor en /api/v2/datos.
function ubicacionStockTexto(equipo) {
    return (equipo && equipo.stock && typeof stockUbicacionTexto === 'function') ? stockUbicacionTexto(equipo.stock) : '';
}

// Un NVR puede llegar con la IP pegada al nombre (ej: "Nombre (10.0.0.1)");
// esto lo saca para poder agrupar/comparar por nombre limpio. Antes estaba
// duplicado en dos funciones distintas con el mismo regex.
function limpiarNombreNvr(nombre) {
    return (nombre || '').replace(/\s*\(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\)\s*$/, '').trim();
}

// --- Theme Toggling ---
function initTheme() {
    const suite = IDRTema.oscuro(), savedTheme = suite === null ? (storage.get('theme') || 'dark') : (suite ? 'dark' : 'light');   // el de la suite (IDR_dark) manda
    if (document.documentElement.getAttribute('data-tema') !== savedTheme) {
        document.documentElement.setAttribute('data-tema', savedTheme);
        document.documentElement.style.colorScheme = savedTheme;
    }
    updateThemeIcon();
}

preferencias.alAplicar('theme', initTheme);         // el tema de esta persona, traído de otra PC

// El cambio de tema (botón de Ajustes o del menú ⚙, otra app, otra ventana) lo hace apariencia.js y avisa con `idr:tema`:
// acá se guarda el respaldo propio (sgc2/theme, se sincroniza entre PC) y se repinta el ícono del menú.
document.addEventListener('idr:tema', (e) => {
    preferencias.set('theme', e.detail.oscuro ? 'dark' : 'light');
    updateThemeIcon();
});

function updateThemeIcon() {
    const currentTheme = document.documentElement.getAttribute('data-tema');
    const oscuro = currentTheme === 'dark';
    uiInterruptor(document.getElementById('btn-theme'), oscuro);
    const btnMenu = document.getElementById('btn-theme-menu');
    if (btnMenu) {
        btnMenu.replaceChildren(
            uiNodo('i', oscuro ? 'bi bi-sun-fill text-warning me-2' : 'bi bi-moon-fill text-secondary me-2'),
            oscuro ? ' Modo claro' : ' Modo oscuro'
        );
    }
}

// Muestra una pestaña SIN animarla (restaurar la guardada al cargar). Los eventos de pestaña son síncronos, así que la
// marca la consume el propio cambio; pero la restauración corre ANTES de que animaciones.js registre sus oyentes
// (`initTransicionesTabs`), y una marca que nadie consumió frenaba la primera animación real de ese panel (volver a la
// pestaña con la que se cargó la página). Por eso se borra siempre acá.
function mostrarPestanaSinAnimar(boton, panel) {
    if (panel) panel.dataset.skipAnimation = 'true';
    try {
        UI.pestana.mostrar(boton);
    } finally {
        if (panel) delete panel.dataset.skipAnimation;
    }
}

// --- Persistencia de Pestañas ---
function inicializarPersistenciaPestanas() {
    // preload.js oculta el dashboard con .preload-tab para evitar el parpadeo;
    // el finally garantiza que la clase se quite aunque algo de abajo falle
    // (localStorage bloqueado, ui.js sin cargar, etc.) y el dashboard no
    // quede invisible hasta recargar.
    try {
        restaurarPestanaGuardada();
    } catch (e) {
        console.warn('No se pudo restaurar la pestaña guardada:', e);
    } finally {
        document.documentElement.classList.remove('preload-tab');
    }

    document.addEventListener('ui:pestana-mostrada', (e) => {
        const target = e.target.getAttribute('data-ui-target');
        if (!target) return;
        if (target.startsWith('#v-pills-')) storage.set('cctv_tab', target);
    });
}

function restaurarPestanaGuardada() {
    const tab = storage.get('cctv_tab');
    if (tab && tab !== '#v-pills-dashboard') {
        const btn = document.querySelector(`[data-ui-target="${tab}"]`);
        if (btn) {
            const panel = document.querySelector(tab);
            mostrarPestanaSinAnimar(btn, panel);
            // Al recargar en otra pestaña: su lista queda oculta hasta que lleguen sus datos y entonces se revela con el
            // blur (produccion.js / stock.js). Sin animar el panel entero, que mostraba los placeholders y parpadeaba.
            const lista = { '#v-pills-produccion': 'produccion', '#v-pills-stock': 'stock' }[tab];
            if (lista) {
                document.documentElement.setAttribute('data-cargando-lista', lista);
                setTimeout(() => document.documentElement.removeAttribute('data-cargando-lista'), 6000);
            }
        }
    }
}

// Navegación directa: click en las tarjetas KPI de Cámaras/Servidores lleva
// a la pestaña correspondiente del panel lateral.
function irAPestana(tabId) {
    const tabBtn = document.getElementById(tabId);
    if (!tabBtn) return;
    UI.modal.cerrarTodos();                                                // se va a otra sección: ningún modal queda tapándola

    const parentPane = tabBtn.closest('.tab-pane');
    if (parentPane && parentPane.id !== 'v-pills-tabContent') {
        const parentTabBtn = document.querySelector(`[data-ui-target="#${parentPane.id}"]`);
        if (parentTabBtn) {
            UI.pestana.mostrar(parentTabBtn);
        }
    }
    
    UI.pestana.mostrar(tabBtn);
    document.getElementById('v-pills-tabContent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Selector de atributo con el valor escapado: el nombre del NVR lo informa el propio equipo y un `"` o `]`
// rompía el querySelector (SyntaxError: el click no hacía nada).
function selectorAtributo(nombre, valor) {
    const v = String(valor);
    const escapado = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
    return `[${nombre}="${escapado}"]`;
}

// Abre en su pestaña el acordeón de un NVR (lo usa "Cámaras de este NVR"). Busca por id directo, luego por IP, luego por nombre (atributo) y por último por el texto.
function abrirAcordeonDeNvr({ tabId, accordionId, idDirecto, nvrIp, nombre, porAtributoNombre = false,
                              claveStorage, antesDeMostrar }) {
    const tabBtn = document.getElementById(tabId);
    const accordion = document.getElementById(accordionId);
    if (!tabBtn || !accordion) return;

    // Si había un filtro de búsqueda que pudiera ocultar este grabador, lo limpiamos
    const searchEl = document.getElementById('global-search');
    if (searchEl && searchEl.value) {
        searchEl.value = '';
        ejecutarFiltro('');
    }

    let target = idDirecto ? document.getElementById(idDirecto) : null;
    if (!target && nvrIp) target = accordion.querySelector('.accordion-collapse' + selectorAtributo('data-nvr-ip', nvrIp));
    if (!target && nombre && porAtributoNombre) {
        target = accordion.querySelector('.accordion-collapse' + selectorAtributo('data-nvr-name', nombre));
    }
    if (!target && nombre) {
        for (const b of accordion.querySelectorAll('.accordion-button')) {
            if (normalizarTextoBusqueda(b.textContent).includes(normalizarTextoBusqueda(nombre))) {
                const sel = b.getAttribute('data-ui-target');
                if (sel) target = document.getElementById(sel.replace(/^#/, ''));
                break;
            }
        }
    }
    if (!target) return;

    const btn = accordion.querySelector(selectorAtributo('data-ui-target', `#${target.id}`));
    const clickedItem = target.closest('.accordion-item');

    if (antesDeMostrar) antesDeMostrar();
    UI.pestana.mostrar(tabBtn);

    // Desactivar temporalmente transiciones de colapso para asentar el layout de inmediato
    const collapses = accordion.querySelectorAll('.grid-collapse');
    collapses.forEach(c => c.style.transition = 'none');

    cerrarAcordeones(accordion);
    if (btn) {
        abrirAcordeon(btn, target);
    } else {
        target.classList.add('show');
    }
    storage.setJSON(claveStorage, [target.id]);

    // Forzar reflow para consolidar alturas y posiciones reales en el layout
    void accordion.offsetHeight;

    // Restaurar transiciones en el siguiente frame para que los clics manuales posteriores se animen normalmente
    requestAnimationFrame(() => {
        collapses.forEach(c => c.style.transition = '');
    });

    if (clickedItem) {
        // Margen bajo el navbar sticky para que el header del grabador no quede pegado ni tape la tabla
        const navbarHeight = typeof obtenerAlturaNavbar === 'function' ? obtenerAlturaNavbar() : 70;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const itemTopDoc = clickedItem.getBoundingClientRect().top + scrollY;
        window.scrollTo({ top: Math.max(0, itemTopDoc - navbarHeight - 12), behavior: 'smooth' });
    }
}

function nombreNvrLimpio(nvrName) {
    return limpiarNombreNvr(nvrName).trim();
}

// Navegación contextual: click en "Cámaras" dentro de un NVR (Servidores)
// lleva a la pestaña Cámaras y abre el acordeón de ese NVR.
function irACamarasDeNvr(nvrName, nvrIp) {
    const nombre = nombreNvrLimpio(nvrName);
    abrirAcordeonDeNvr({
        tabId: 'v-pills-produccion-tab', accordionId: 'produccion-accordion',
        idDirecto: `collapse-nvr-${nombre.replace(/\W/g, '_')}`, nvrIp, nombre, porAtributoNombre: true,
        claveStorage: 'cctv_open_accordions',
        antesDeMostrar: () => {
            // Evitar animación de mutación (scale 0.9 -> 1) al cambiar de pestaña para no distorsionar dimensiones
            const camarasPane = document.getElementById('v-pills-produccion');
            if (!camarasPane) return;
            camarasPane.dataset.skipAnimation = 'true';
            cancelarMutacion(camarasPane);
            camarasPane.classList.remove('mutacion-entrante', 'mutacion-saliente');
        },
    });
}


// Pestaña Ajustes > «Reducir animaciones»: lo maneja apariencia.js (del dispositivo, como el sonido); acá solo el aviso
document.addEventListener('idr:movimiento', (e) => {
    mostrarToast(e.detail.reducido ? 'Animaciones desactivadas.' : 'Animaciones activadas.', 'info', 2500);
});

// Ajustes > «Cambiar de pestaña al buscar» (preferencia de la persona; sin elegir, sí)
const CLAVE_BUSCAR_CAMBIA_PESTANA = 'cctv:buscar_cambia_pestana';
function buscarCambiaPestana() {
    return storage.get(CLAVE_BUSCAR_CAMBIA_PESTANA) !== '0';
}

// Ajustes > «Rueda sobre el panel lateral» (preferencia de la persona; sin elegir, sí): la rueda del mouse sobre el panel
// recorre las pestañas
const CLAVE_RUEDA_PESTANAS = 'cctv:rueda_pestanas';
function ruedaRecorrePestanas() {
    return storage.get(CLAVE_RUEDA_PESTANAS) !== '0';
}

// --- Data Loading ---
let ultimaActualizacionTexto = '';
let cargandoEnProgreso = false;

/** Lee /api/v2/datos (lo arma js/api-local.js desde el stock, sin red) y repinta lo que depende de él. No hay
 *  refresco periódico: se vuelve a leer cuando cambian los datos (`sgc:datos-cambiados`). */
async function cargarDatos() {
    if (cargandoEnProgreso || _cambioClavePendiente) {
        _recargaPendiente = true;
        return;
    }
    cargandoEnProgreso = true;
    try {
        const data = await apiFetchValidado('/api/v2/datos',
            (d) => !!d && typeof d === 'object' && Array.isArray(d.nvrs) && Array.isArray(d.camaras));
        limpiarErrorApi();
        globalData = data;
        document.dispatchEvent(new CustomEvent('cctv:datos'));
        ejecutarFiltro(terminoBusquedaActual());
        ultimaActualizacionTexto = `Última act: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error:', error);
        mostrarErrorApi(error);
        ultimaActualizacionTexto = `Sin actualizar: ${error.message || 'error desconocido'}`;
    } finally {
        uiPonerTexto('last-update', ultimaActualizacionTexto);
        cargandoEnProgreso = false;
        if (_recargaPendiente) {
            _recargaPendiente = false;
            cargarDatos();
        }
    }
}
document.addEventListener('sgc:datos-cambiados', () => { cargarDatos(); });

// ==== MODAL ANIMACION ORIGEN PURO BEGIN ====
/**
 * Calcula las coordenadas relativas en píxeles ('Xpx Ypx') para `transform-origin`
 * de la caja del diálogo del modal con respecto al punto o elemento que lo activó.
 *
 * @param {{ left: number, top: number, width: number, height: number } | null} triggerRect - Rectángulo del elemento disparador
 * @param {{ x: number, y: number } | null} clickCoords - Coordenadas del cursor { x, y }
 * @param {{ left: number, top: number, width: number, height: number } | null} dialogRect - Rectángulo medido del diálogo en pantalla
 * @param {{ width: number, height: number }} viewport - Dimensiones de la ventana { width, height }
 * @returns {string} Valor CSS para transform-origin (ej. "250px 180px")
 */
function calcularOrigenModal(triggerRect, clickCoords, dialogRect, viewport) {
    const vpW = (viewport && viewport.width) || 1024;
    const vpH = (viewport && viewport.height) || 768;

    let origenX = vpW / 2;
    let origenY = vpH / 2;

    if (triggerRect && (triggerRect.width > 0 || triggerRect.height > 0)) {
        origenX = triggerRect.left + triggerRect.width / 2;
        origenY = triggerRect.top + triggerRect.height / 2;
    } else if (clickCoords && typeof clickCoords.x === 'number' && typeof clickCoords.y === 'number') {
        origenX = clickCoords.x;
        origenY = clickCoords.y;
    }

    const dLeft = (dialogRect && typeof dialogRect.left === 'number') ? dialogRect.left : (vpW - 500) / 2;
    const dTop = (dialogRect && typeof dialogRect.top === 'number') ? dialogRect.top : (vpH - 350) / 2;

    const relX = Math.round(origenX - dLeft);
    const relY = Math.round(origenY - dTop);

    return `${relX}px ${relY}px`;
}

/**
 * Calcula la posición { left, top, ladoH, ladoV, transformOrigin } para un popup flotante
 * relativo a un punto de referencia (cursor o elemento disparador) y asegurando que quede
 * dentro del viewport en la dirección con espacio disponible.
 *
 * Si `options.ladoV` o `options.ladoH` ya están definidos (popup ya abierto), se respeta
 * dicha dirección y el popup se expande hacia el lado que tenga espacio disponible
 * (mediante el clampeo dentro de los márgenes) en lugar de voltearse al otro lado.
 *
 * @param {{ x: number, y: number } | null} refPoint - Coordenadas del cursor o punto de referencia
 * @param {{ width: number, height: number } | null} popupDim - Dimensiones del popup { width, height }
 * @param {{ width: number, height: number } | null} viewport - Dimensiones del viewport { width, height }
 * @param {{ margin?: number, offset?: number, ladoH?: 'left'|'right', ladoV?: 'top'|'bottom' }} [options] - Opciones
 * @returns {{ left: number, top: number, ladoH: 'left'|'right', ladoV: 'top'|'bottom', transformOrigin: string }}
 */
function calcularPosicionPopup(refPoint, popupDim, viewport, options = {}) {
    const margin = typeof options.margin === 'number' ? options.margin : 12;
    const offset = typeof options.offset === 'number' ? options.offset : 8;

    const vpW = (viewport && viewport.width) || 1024;
    const vpH = (viewport && viewport.height) || 768;

    const pWidth = (popupDim && popupDim.width) || 270;
    const pHeight = (popupDim && popupDim.height) || 300;

    const refX = (refPoint && typeof refPoint.x === 'number') ? refPoint.x : vpW / 2;
    const refY = (refPoint && typeof refPoint.y === 'number') ? refPoint.y : vpH / 2;

    // Espacios disponibles alrededor del punto de referencia
    const espacioDer = vpW - (refX + offset) - margin;
    const espacioIzq = (refX - offset) - margin;
    const espacioAbajo = vpH - (refY + offset) - margin;
    const espacioArriba = (refY - offset) - margin;

    // Decisión horizontal: si ya tiene ladoH asignado (popup abierto), mantenerlo.
    // Sino, abrir hacia la derecha si cabe, luego a la izquierda si cabe, o hacia el lado con más espacio
    let ladoH = options.ladoH;
    let left;
    if (!ladoH) {
        if (espacioDer >= pWidth) {
            ladoH = 'right';
        } else if (espacioIzq >= pWidth) {
            ladoH = 'left';
        } else if (espacioDer >= espacioIzq) {
            ladoH = 'right';
        } else {
            ladoH = 'left';
        }
    }
    if (ladoH === 'right') {
        left = refX + offset;
    } else {
        left = refX - offset - pWidth;
    }

    // Decisión vertical: si ya tiene ladoV asignado (popup abierto), mantenerlo.
    // Sino, abrir hacia abajo si cabe, luego hacia arriba si cabe, o hacia el lado con más espacio
    let ladoV = options.ladoV;
    let top;
    if (!ladoV) {
        if (espacioAbajo >= pHeight) {
            ladoV = 'bottom';
        } else if (espacioArriba >= pHeight) {
            ladoV = 'top';
        } else if (espacioAbajo >= espacioArriba) {
            ladoV = 'bottom';
        } else {
            ladoV = 'top';
        }
    }
    if (ladoV === 'bottom') {
        top = refY + offset;
    } else {
        top = refY - offset - pHeight;
    }

    // Clamping para asegurar que nunca desborde el viewport
    // Si ladoV === 'bottom' pero pHeight no cabe abajo, el clamping a maxTop (vpH - pHeight - margin)
    // desplaza automáticamente `top` hacia arriba, haciendo que el popup se agrande hacia arriba
    // en vez de salirse de la pantalla o voltearse hacia arriba del trigger.
    const maxLeft = Math.max(margin, vpW - pWidth - margin);
    const maxTop = Math.max(margin, vpH - pHeight - margin);
    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));

    // Origen de transformación relativo al popup (para animación suave desde el cursor)
    const relOriginX = Math.max(0, Math.min(pWidth, Math.round(refX - left)));
    const relOriginY = Math.max(0, Math.min(pHeight, Math.round(refY - top)));

    return {
        left: Math.round(left),
        top: Math.round(top),
        ladoH,
        ladoV,
        transformOrigin: `${relOriginX}px ${relOriginY}px`
    };
}
// ==== MODAL ANIMACION ORIGEN PURO END ====

// Apertura y cierre de los modales "desde el clic" (ui.js abre y cierra; acá solo se calcula el transform-origin).
function inicializarAnimacionModalesApple() {
    let ultimoTrigger = null;
    let ultimoClickCoords = null;
    const origenesPorModal = new WeakMap();

    // Captura global de clics o toques para recordar posición del trigger
    window.addEventListener('pointerdown', (e) => {
        if (e.target instanceof Element && e.target.closest('.modal')) return;
        ultimoClickCoords = { x: e.clientX, y: e.clientY };
        ultimoTrigger = (e.target instanceof Element && e.target.closest('button, [role="button"], a, .card, .clickable, tr, td, [data-ui-toggle="modal"], .btn, .dropdown-item')) || e.target;
    }, true);

    // Captura de activación con teclado (Enter o Espacio)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const active = document.activeElement;
            if (active && active !== document.body && !active.closest('.modal')) {
                ultimoTrigger = active;
                if (typeof active.getBoundingClientRect === 'function') {
                    const r = active.getBoundingClientRect();
                    ultimoClickCoords = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
                }
            }
        }
    }, true);

    // Antes de mostrar el modal
    document.addEventListener('ui:modal-abrir', (e) => {
        const modal = e.target;
        if (!(modal instanceof Element)) return;
        const dialog = modal.querySelector('.modal-dialog');
        if (!dialog) return;

        const trigger = e.detail.disparador || ultimoTrigger;
        let triggerRect = null;
        if (trigger && typeof trigger.getBoundingClientRect === 'function' && document.body.contains(trigger)) {
            const r = trigger.getBoundingClientRect();
            if (r.width > 0 || r.height > 0) triggerRect = r;
        }

        // Si el modal está oculto, medir su diálogo de forma segura
        let dialogRect = null;
        const estabaOculto = getComputedStyle(modal).display === 'none';
        if (estabaOculto) {
            const prevVis = modal.style.visibility;
            const prevDisp = modal.style.display;
            modal.style.visibility = 'hidden';
            modal.style.display = 'block';
            dialogRect = dialog.getBoundingClientRect();
            modal.style.display = prevDisp;
            modal.style.visibility = prevVis;
        } else {
            dialogRect = dialog.getBoundingClientRect();
        }

        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const originStr = calcularOrigenModal(triggerRect, ultimoClickCoords, dialogRect, viewport);

        dialog.style.transformOrigin = originStr;
        origenesPorModal.set(modal, { originStr, trigger, coords: ultimoClickCoords });
    });

    // Al iniciar el cierre del modal, asegurar que colapsa hacia el mismo punto
    document.addEventListener('ui:modal-cerrar', (e) => {
        const modal = e.target;
        if (!(modal instanceof Element)) return;
        const dialog = modal.querySelector('.modal-dialog');
        const info = origenesPorModal.get(modal);
        if (dialog && info?.originStr) {
            dialog.style.transformOrigin = info.originStr;
        }
    });

    // Al finalizar el cierre, limpiar transformOrigin
    document.addEventListener('ui:modal-cerrado', (e) => {
        const modal = e.target;
        if (!(modal instanceof Element)) return;
        const dialog = modal.querySelector('.modal-dialog');
        if (dialog) dialog.style.transformOrigin = '';
        origenesPorModal.delete(modal);

    });

    // Recalcular si cambia la ventana con un modal activo
    window.addEventListener('resize', () => {
        document.querySelectorAll('.modal.show').forEach((modal) => {
            const dialog = modal.querySelector('.modal-dialog');
            const info = origenesPorModal.get(modal);
            if (!dialog || !info) return;

            let triggerRect = null;
            if (info.trigger && document.body.contains(info.trigger)) {
                triggerRect = info.trigger.getBoundingClientRect();
            }
            const dialogRect = dialog.getBoundingClientRect();
            const viewport = { width: window.innerWidth, height: window.innerHeight };
            const newOrigin = calcularOrigenModal(triggerRect, info.coords, dialogRect, viewport);
            dialog.style.transformOrigin = newOrigin;
            info.originStr = newOrigin;
        });
    }, { passive: true });
}

// --- Event Listeners Principales ---
/** Tocar de nuevo la pestaña activa limpia la búsqueda. (DOMContentLoaded) */
function initReclicPestanaLimpiaBusqueda() {
    // Tocar de nuevo la pestaña que ya está activa limpia la búsqueda (mismo comportamiento que Escape).
    // Para no confundir el cambio de pestaña con un re-clic sobre la activa (ya que ui.js
    // conmuta .active de forma síncrona), detectamos si la pestaña ya estaba activa antes de conmutar
    // y si hubo un cambio de pestaña (ui:pestana-mostrar).
    let tabEstabaActivo = false;
    let cambioPestanaReciente = false;

    document.addEventListener('pointerdown', (e) => {
        const tabBtn = e.target.closest('button[data-ui-toggle="pill"], button[data-ui-toggle="tab"]');
        tabEstabaActivo = Boolean(tabBtn && tabBtn.classList.contains('active'));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const tabBtn = e.target.closest('button[data-ui-toggle="pill"], button[data-ui-toggle="tab"]');
            if (tabBtn) tabEstabaActivo = tabBtn.classList.contains('active');
        }
    });

    document.addEventListener('ui:pestana-mostrar', () => {
        cambioPestanaReciente = true;
    });

    document.addEventListener('ui:pestana-mostrada', () => {
        cambioPestanaReciente = false;
    });

    document.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('button[data-ui-toggle="pill"], button[data-ui-toggle="tab"]');
        if (!tabBtn) return;
        const esMismaPestana = tabEstabaActivo && !cambioPestanaReciente;
        tabEstabaActivo = false;
        cambioPestanaReciente = false;

        if (esMismaPestana && tabBtn.classList.contains('active')) {
            limpiarBusqueda();
        }
    });
}

/** Doble clic en una celda copiable (nombre, IP, MAC, modelo, firmware): la copia. (DOMContentLoaded) */
function initCopiarCeldas() {
    // Delegación de eventos para copiar celdas con doble click rápido (Nombre, IP, MAC, Modelo, Firmware)
    document.addEventListener('dblclick', (e) => {
        const target = e.target.closest('.copy-cell, .copy-ip');
        if (!target) return;
        const texto = uiValorInformado(target.dataset.copy || target.dataset.ip || target.textContent);
        if (!texto) return;
        window.getSelection()?.removeAllRanges();
        copiarAlPortapapeles(texto, `${texto} copiado al portapapeles.`);
    });
}

/** Tarjetas KPI clickeables de Estado (clic y teclado). (DOMContentLoaded) */
function initAtajosKpi() {
    // Delegación de eventos para las tarjetas KPI clickeables: Cámaras / Servidores llevan a Activos con lo que está
    // en producción de ese grupo, agrupado por edificio / piso; Offline lleva a Producción con los caídos
    // (búsqueda en todos los campos).
    const ATAJOS_KPI = new Map([
        ['card-kpi-online', { query: 'camara produccion', tab: 'v-pills-stock-tab' }],
        ['card-kpi-nvrs', { query: 'servidores produccion', tab: 'v-pills-stock-tab' }],
        ['card-kpi-offline', { query: 'offline', tab: 'v-pills-produccion-tab' }],
    ]);
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.kpi-clickable');
        const atajo = card && ATAJOS_KPI.get(card.id);
        if (!atajo) return;
        if (e.target.closest('.kpi-grafico-caja')) return;       // el gráfico de disponibilidad lleva a Auditoría (caidas.js)
        if (atajo.tab === 'v-pills-stock-tab' && typeof window.stockFijarAgrupamiento === 'function') {
            window.stockFijarAgrupamiento('edificio');
        }
        window.buscarConAtajo(atajo.query, { campos: CAMPOS_BUSQUEDA, tab: atajo.tab });
    });

    // Soporte de teclado (Enter / Espacio) para las mismas tarjetas: usan
    // role="button" sobre un <div>, así que no reciben activación por teclado
    // de forma nativa como lo haría un <button>.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.kpi-clickable');
        if (!card) return;
        e.preventDefault();
        card.click();
    });
}

/** Menú de campos del buscador global. (DOMContentLoaded) */
function initCamposBusqueda() {
    // Delegación de eventos para selección de campos y paneles en el buscador
    document.addEventListener('click', (e) => {
        const toggleAll = e.target.closest('#btn-toggle-all-filtros');
        if (toggleAll) {
            e.stopPropagation();
            if (busqCamposActivos.size > 0) {
                busqCamposActivos.clear();
            } else {
                CAMPOS_BUSQUEDA.forEach(c => busqCamposActivos.add(c));
            }
            actualizarUIFiltroBusqueda();
            const input = document.getElementById('global-search');
            if (input) {
                ejecutarFiltro(input.value.toLowerCase(), { animar: true });
            }
            return;
        }

        const filterItem = e.target.closest('.search-filter-item');
        if (filterItem) {
            e.stopPropagation();
            const field = filterItem.dataset.field;
            if (field) {
                if (busqCamposActivos.has(field)) {
                    busqCamposActivos.delete(field);
                } else {
                    busqCamposActivos.add(field);
                }
                actualizarUIFiltroBusqueda();
                const input = document.getElementById('global-search');
                if (input) {
                    ejecutarFiltro(input.value.toLowerCase(), { animar: true });
                }
            }
            return;
        }

        const toggleAllPaneles = e.target.closest('#btn-toggle-all-paneles');
        if (toggleAllPaneles) {
            e.stopPropagation();
            if (busqPanelesActivos.size > 0) {
                busqPanelesActivos.clear();
            } else {
                PANELES_BUSQUEDA.forEach(p => busqPanelesActivos.add(p));
            }
            guardarPanelesBusqueda();
            actualizarUIFiltroBusqueda();
            const input = document.getElementById('global-search');
            if (input) {
                ejecutarFiltro(input.value.toLowerCase(), { animar: true });
            }
            return;
        }

        const filterPanelItem = e.target.closest('.search-filter-panel-item');
        if (filterPanelItem) {
            e.stopPropagation();
            const panel = filterPanelItem.dataset.panel;
            if (panel) {
                if (busqPanelesActivos.has(panel)) {
                    busqPanelesActivos.delete(panel);
                } else {
                    busqPanelesActivos.add(panel);
                }
                guardarPanelesBusqueda();
                actualizarUIFiltroBusqueda();
                const input = document.getElementById('global-search');
                if (input) {
                    ejecutarFiltro(input.value.toLowerCase(), { animar: true });
                }
            }
        }
    });
}

/** Acordeones de Producción y Activos: abrir/cerrar, exclusividad y scroll. (DOMContentLoaded) */
function initAcordeones() {
    // Controlador de clics para los acordeones (Exclusividad garantizada, Anti-Race Condition y Auto-Scroll Preciso)
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.accordion-button');
        if (!btn) return;
        if (e.target.closest('.accordion-detalle.copy-cell')) return;    // la IP del grupo se copia con doble clic: sin plegar

        const accordion = btn.closest('.accordion');
        if (!accordion || !ACORDEONES[accordion.id]) return;

        e.preventDefault();
        e.stopPropagation();

        const targetSelector = btn.getAttribute('data-ui-target');
        if (!targetSelector) return;
        const target = document.querySelector(targetSelector);
        if (!target) return;

        const isCurrentlyOpen = target.classList.contains('show');
        const storageKey = ACORDEONES[accordion.id].storageKey;
        const clickedItem = btn.closest('.accordion-item');
        if (!clickedItem) return;

        const navbarHeight = obtenerAlturaNavbar();

        // Detectar si hay un acordeón previamente abierto en este contenedor
        const openCollapse = accordion.querySelector('.accordion-collapse.show');
        let heightAbove = 0;
        if (openCollapse && !isCurrentlyOpen) {
            const openItem = openCollapse.closest('.accordion-item');
            if (openItem && openItem !== clickedItem) {
                // Si el item abierto está antes en el DOM que el clickeado,
                // al cerrarse su altura se restará y el clickeado subirá.
                if (openItem.compareDocumentPosition(clickedItem) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    heightAbove = openCollapse.offsetHeight;
                }
            }
        }

        // Posición actual del botón en pantalla antes de manipular clases
        const btnRect = btn.getBoundingClientRect();

        // Solo se anima la parte visible de lo que se cierra (los grupos de Cámaras miden miles de px)
        accordion.querySelectorAll('.accordion-collapse.show').forEach(c => {
            const interno = c.firstElementChild;
            if (interno) {
                limitarAlturaDuranteAnimacion(c, alturaAnimableAlCerrar(interno.scrollHeight,
                    c.getBoundingClientRect().top, window.innerHeight));
            }
        });

        // Cerrar inmediatamente TODOS los acordeones dentro del contenedor (y proteger la animación de repintados)
        cerrarAcordeones(accordion);
        marcarAnimacionAcordeon(accordion);

        if (isCurrentlyOpen) {
            // Si ya estaba abierto, el clic lo cierra -> ninguno queda abierto
            storage.setJSON(storageKey, []);

            // Si el usuario estaba scrolleado abajo dentro de este grupo (header sticky),
            // restaurar suavemente la vista al encabezado cerrado para evitar el salto al vacío.
            const itemTopDoc = clickedItem.getBoundingClientRect().top + window.scrollY;
            if (window.scrollY > itemTopDoc - navbarHeight) {
                window.scrollTo({
                    top: Math.max(0, itemTopDoc - navbarHeight),
                    behavior: 'smooth'
                });
            }
        } else {
            // Abrir estrictamente el seleccionado (animando como mucho una ventana de alto)
            if (target.firstElementChild) {
                limitarAlturaDuranteAnimacion(target, alturaAnimableAlAbrir(target.firstElementChild.scrollHeight,
                    window.innerHeight));
            }
            abrirAcordeon(btn, target);
            storage.setJSON(storageKey, [target.id]);

            // Dónde quedará el botón en el viewport una vez que el anterior termine de colapsar
            const predictedBtnTop = btnRect.top - heightAbove;

            // Determinar la altura inicial de contenido a verificar en pantalla:
            // - En vista de tarjetas (panel activos) y en panel de producción (canal-grid):
            //   evaluar que los primeros 3 o 4 dispositivos queden en vista (primeras 2 filas en grilla de 2 columnas).
            // - En vista de lista (tabla): la primera fila del tbody y el encabezado thead.
            let firstContentHeight = 45;
            const dispositivos = clickedItem.querySelectorAll('.canal-item, .stock-card');
            if (dispositivos.length > 0) {
                const targetIdx = Math.min(dispositivos.length, 4) - 1;
                const targetDisp = dispositivos[targetIdx];
                const bodyEl = clickedItem.querySelector('.accordion-body') || target;
                if (targetDisp && bodyEl) {
                    const diffRect = targetDisp.getBoundingClientRect().bottom - bodyEl.getBoundingClientRect().top;
                    if (diffRect > 0) {
                        firstContentHeight = diffRect;
                    } else {
                        const diffOffset = (targetDisp.offsetTop - bodyEl.offsetTop) + targetDisp.offsetHeight;
                        firstContentHeight = diffOffset > 0 ? diffOffset : (clickedItem.querySelector('.stock-card') ? 190 : 130);
                    }
                } else {
                    firstContentHeight = clickedItem.querySelector('.stock-card') ? 190 : 130;
                }
            } else {
                const firstRowEl = clickedItem.querySelector('tbody tr') || clickedItem.querySelector('.accordion-body > div');
                firstContentHeight = (firstRowEl ? firstRowEl.offsetHeight : 45) + (clickedItem.querySelector('thead') ? 40 : 0);
            }

            const predictedFirstRowBottom = predictedBtnTop + btn.offsetHeight + firstContentHeight;

            // Evaluar si los primeros dispositivos o el encabezado quedan fuera de vista
            const fueraPorArriba = predictedBtnTop < navbarHeight;
            const fueraPorAbajo = predictedFirstRowBottom > window.innerHeight;

            if (fueraPorArriba || fueraPorAbajo) {
                // Cálculo exacto del scroll objetivo absoluto en el documento
                const targetScrollY = (btnRect.top + window.scrollY) - heightAbove - navbarHeight;
                window.scrollTo({
                    top: Math.max(0, targetScrollY),
                    behavior: 'smooth'
                });
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarAnimacionModalesApple();
    inicializarCierreDropdownsOnScroll();

    initTheme();
    initAtajoCamarasDeNvr();
    initDetalleProduccion();
    initModoVistaProduccion();
    initSelectsPropios();             // selector.js
    inicializarPersistenciaPestanas();
    initTransicionesTabs();
    storage.remove('cctv_search_field');
    actualizarUIFiltroBusqueda();

    initReclicPestanaLimpiaBusqueda();
    initCopiarCeldas();
    initAtajosKpi();
    initCamposBusqueda();
    initAcordeones();
    initSesion();                     // sesion-local.js: sin login, el rol que se muestra

    cargarDatos();
});

// --- Búsqueda Global, Filtrado Multi-Campo y Selección de Paneles ---
// Inicia siempre con todos los campos activos por sesión; no se persiste al recargar
let busqCamposActivos = new Set(CAMPOS_BUSQUEDA);
let currentSearchField = 'todos';

const CLAVE_PANELES_BUSQUEDA = 'cctv:busqueda_paneles';

function leerPanelesBusquedaGuardados() {
    try {
        if (typeof storage !== 'undefined') {
            const guardado = storage.getJSON(CLAVE_PANELES_BUSQUEDA);
            if (Array.isArray(guardado) && typeof validarPanelesBusqueda === 'function') {
                return new Set(validarPanelesBusqueda(guardado));
            }
        }
    } catch (_) { }
    return new Set(typeof PANELES_BUSQUEDA !== 'undefined'
        ? PANELES_BUSQUEDA : ['dashboard', 'stock', 'produccion', 'auditoria']);
}

let busqPanelesActivos = leerPanelesBusquedaGuardados();

function guardarPanelesBusqueda() {
    try {
        if (typeof storage !== 'undefined') {
            storage.setJSON(CLAVE_PANELES_BUSQUEDA, [...busqPanelesActivos]);
        }
    } catch (_) { }
}

const searchPlaceholders = {
    todos: 'Buscar en todo...',
    nombre: 'Buscar por nombre...',
    tipo: 'Buscar por grupo o tipo...',
    ip: 'Buscar por IP...',
    mac: 'Buscar por MAC...',
    modelo: 'Buscar por modelo...',
    firmware: 'Buscar por firmware...',
    estado: 'Buscar por estado...'
};

function actualizarUIFiltroBusqueda() {
    const input = document.getElementById('global-search');
    const filterBtn = document.getElementById('searchFilterBtn');
    const btnToggleAll = document.getElementById('btn-toggle-all-filtros');
    const btnToggleAllPaneles = document.getElementById('btn-toggle-all-paneles');

    if (btnToggleAll) {
        btnToggleAll.textContent = busqCamposActivos.size > 0 ? 'Desactivar todo' : 'Activar todo';
    }
    if (btnToggleAllPaneles) {
        btnToggleAllPaneles.textContent = busqPanelesActivos.size > 0 ? 'Desactivar todo' : 'Activar todo';
    }

    if (input) {
        if (busqCamposActivos.size === CAMPOS_BUSQUEDA.length) {
            input.placeholder = 'Buscar en todo...';
        } else if (busqCamposActivos.size === 1) {
            const unicoCampo = [...busqCamposActivos][0];
            input.placeholder = searchPlaceholders[unicoCampo] || 'Buscar...';
        } else if (busqCamposActivos.size === 0) {
            input.placeholder = 'Sin campos seleccionados...';
        } else {
            input.placeholder = 'Buscar en campos seleccionados...';
        }
    }

    const totalPaneles = typeof PANELES_BUSQUEDA !== 'undefined' ? PANELES_BUSQUEDA.length : 4;
    if (filterBtn) {
        const camposFiltro = busqCamposActivos.size < CAMPOS_BUSQUEDA.length;
        const panelesFiltro = busqPanelesActivos.size < totalPaneles;
        if (camposFiltro || panelesFiltro) {
            filterBtn.classList.add('active-filter');
            const txtCampos = `${busqCamposActivos.size}/${CAMPOS_BUSQUEDA.length} campos`;
            const txtPaneles = `${busqPanelesActivos.size}/${totalPaneles} paneles`;
            filterBtn.title = `Filtros activos (${txtCampos}, ${txtPaneles})`;
        } else {
            filterBtn.classList.remove('active-filter');
            filterBtn.title = 'Filtrar por campos y paneles (todos activos)';
        }
    }

    document.querySelectorAll('.search-filter-item').forEach(item => {
        const field = item.dataset.field;
        const icon = item.querySelector('i');
        const activo = busqCamposActivos.has(field);
        item.classList.toggle('active', activo);
        if (icon) {
            icon.classList.toggle('opacity-0', !activo);
        }
    });

    document.querySelectorAll('.search-filter-panel-item').forEach(item => {
        const panel = item.dataset.panel;
        const icon = item.querySelector('i');
        const activo = busqPanelesActivos.has(panel);
        item.classList.toggle('active', activo);
        if (icon) {
            icon.classList.toggle('opacity-0', !activo);
        }
    });

    if (busqCamposActivos.size === CAMPOS_BUSQUEDA.length) {
        currentSearchField = 'todos';
    } else if (busqCamposActivos.size === 1) {
        currentSearchField = [...busqCamposActivos][0];
    } else {
        currentSearchField = [...busqCamposActivos].join(',');
    }
}

let debounceTimer;
const searchInput = document.getElementById('global-search');
if (searchInput) {
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('autocorrect', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    searchInput.setAttribute('spellcheck', 'false');
}



function actualizarBadgePestana(idTab, total, busquedaActiva) {
    const tabEl = document.getElementById(idTab);
    if (!tabEl) return;
    let badge = tabEl.querySelector('.sidebar-search-badge');
    if (!busquedaActiva) {
        if (badge) {
            badge.classList.add('d-none');
            badge.textContent = '0';
        }
        return;
    }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'badge sidebar-search-badge';
        tabEl.appendChild(badge);
    }
    badge.textContent = String(total);
    badge.classList.remove('d-none');
    badge.classList.toggle('badge-cero', total === 0);
}
window.actualizarBadgePestana = actualizarBadgePestana;

// Historial (la pestaña que era Auditoría) tiene una sola pantalla: la búsqueda filtra los cambios del stock
// (auditoria-bd.js); sin consulta todavía, sin insignia (null).
function obtenerConteoAuditoria(term) {
    if (!term || !String(term).trim()) return null;
    const c = typeof window.obtenerConteoBaseDatos === 'function' ? window.obtenerConteoBaseDatos() : null;
    return Number.isInteger(c) && c >= 0 ? c : null;
}
window.obtenerConteoAuditoria = obtenerConteoAuditoria;

/** Único que pinta la insignia de Auditoría (búsqueda global, cambio de subpestaña y repintado de cada pantalla):
 *  sin conteo (subpestaña que no busca o sin consulta) no hay insignia. Devuelve el conteo (o null). */
function actualizarBadgeAuditoria(term = terminoBusquedaActual()) {
    if (!busqPanelesActivos.has('auditoria')) {
        actualizarBadgePestana('v-pills-auditoria-tab', 0, false);
        return 0;
    }
    const c = obtenerConteoAuditoria(term);
    actualizarBadgePestana('v-pills-auditoria-tab', c || 0, c !== null);
    return c;
}
window.actualizarBadgeAuditoria = actualizarBadgeAuditoria;

function obtenerConteoStock(term) {
    if (!term || !term.trim()) return 0;
    if (typeof window.contarCoincidenciasStock === 'function') {
        const c = window.contarCoincidenciasStock(term);
        if (c !== null && c !== undefined) return c;
    }
    if (_cacheStockResumen && Array.isArray(_cacheStockResumen.dispositivos) && typeof stockFiltrar === 'function') {
        const etiq = typeof stockEtiquetas === 'function' ? stockEtiquetas(_cacheStockResumen.tipos) : new Map();
        return stockFiltrar(_cacheStockResumen.dispositivos, term, etiq, busqCamposActivos, catalogoStockActual()).length;
    }
    return 0;
}
window.obtenerConteoStock = obtenerConteoStock;

// ¿Hay un modal que bloquea la página? El flotante («PiP», `.modal-flotante`) NO: deja seguir usando la página, así que los
// atajos (Escape que limpia la búsqueda, Ctrl + flechas) siguen valiendo con la cámara a la vista.
const SEL_MODAL_BLOQUEANTE = '.modal.show:not(.modal-flotante), [role="dialog"].show:not(.modal-flotante), .modal-backdrop';
function hayModalBloqueante() {
    return Boolean((typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function' && UI.modal.arriba())
        || document.querySelector(SEL_MODAL_BLOQUEANTE));
}

// ==== TECLA BUSQUEDA PURO BEGIN ====
// ¿Esta tecla, con el foco fuera de un campo, empieza la búsqueda? SOLO una letra de la a a la z o un número (sin Ctrl, Meta
// ni Alt): el espacio, el punto, la coma, los símbolos y las teclas de edición no la activan.
function esTeclaDeBusqueda(tecla, conModificador) {
    return !conModificador && typeof tecla === 'string' && /^[a-z0-9]$/i.test(tecla);
}
// ==== TECLA BUSQUEDA PURO END ====

// ==== ESCAPE BUSQUEDA PURO BEGIN ====
// Qué hace Escape respecto de la búsqueda (con el modal, el popup y el modo selección ya atendidos antes). Solo limpia si
// hay una búsqueda activa (texto o filtros de campos): con un resultado enfocado salta al buscador solo para llegar a
// limpiarla, y sin búsqueda ese Escape solo quita el foco; con el cursor en el buscador vacío lo suelta.
function accionEscapeBusqueda({ busquedaActiva, resultadoEnfocado, buscadorEnfocado }) {
    if (resultadoEnfocado) return busquedaActiva ? 'ir-al-buscador' : 'quitar-foco';
    if (busquedaActiva || buscadorEnfocado) return 'limpiar';
    return 'nada';
}
// ==== ESCAPE BUSQUEDA PURO END ====

// ¿Hay texto en el buscador o filtros de campos distintos de los de siempre?
function hayBusquedaActiva() {
    const hayTexto = Boolean(searchInput && searchInput.value.trim().length > 0);
    const totalPaneles = typeof PANELES_BUSQUEDA !== 'undefined' ? PANELES_BUSQUEDA.length : 4;
    const hayFiltros = (busqCamposActivos && busqCamposActivos.size !== CAMPOS_BUSQUEDA.length)
        || (busqPanelesActivos && busqPanelesActivos.size !== totalPaneles)
        || currentSearchField !== 'todos';
    return hayTexto || hayFiltros;
}

function limpiarBusqueda() {
    const teniaTexto = Boolean(searchInput && searchInput.value.trim().length > 0);
    const tenianFiltros = (busqCamposActivos && busqCamposActivos.size !== CAMPOS_BUSQUEDA.length) || currentSearchField !== 'todos';

    if (searchInput) {
        searchInput.value = '';
        searchInput.blur();
        searchInput.classList.remove('search-active');
        const container = searchInput.closest('.search-container');
        if (container) container.classList.remove('search-active');
    }
    busqCamposActivos = new Set(CAMPOS_BUSQUEDA);
    currentSearchField = 'todos';
    actualizarUIFiltroBusqueda();
    actualizarBadgePestana('v-pills-dashboard-tab', 0, false);
    actualizarBadgePestana('v-pills-produccion-tab', 0, false);
    actualizarBadgePestana('v-pills-auditoria-tab', 0, false);
    actualizarBadgePestana('v-pills-stock-tab', 0, false);

    panelLateral('limpiar');

    if (teniaTexto || tenianFiltros) {
        ejecutarFiltro('', { animar: true });
    }
}

// ==== RESOLVER PESTAÑA BUSQUEDA PURO BEGIN ====
/**
 * Determina a qué pestaña cambiar ante una búsqueda con texto, según las reglas:
 * - Si el panel actual tiene resultados (conteo > 0), se queda en él (retorna null).
 * - Si el panel actual no tiene resultados (conteo === 0), busca los paneles que sí tienen.
 * - Si ninguno tiene resultados, se queda donde está (retorna null).
 * - Si uno o varios tienen resultados, elige el más próximo al actual (menor distancia de índice);
 *   en caso de empate de distancia, elige el primero en el orden de la lista.
 *
 * @param {string|null} idActual - ID de la pestaña activa actualmente
 * @param {Array<{id: string, conteo: number}>} paneles - Lista ordenada de paneles con sus conteos
 * @returns {string|null} - ID de la pestaña a la que cambiar, o null si no debe cambiar
 */
function resolverPestanaBusqueda(idActual, paneles) {
    if (!Array.isArray(paneles) || paneles.length === 0) return null;
    const idxActual = paneles.findIndex(p => p.id === idActual);
    if (idxActual !== -1 && (paneles[idxActual].conteo || 0) > 0) {
        return null;
    }

    let mejor = null;
    let minDiferencia = Infinity;

    for (let i = 0; i < paneles.length; i++) {
        const p = paneles[i];
        if ((p.conteo || 0) > 0) {
            const dist = idxActual !== -1 ? Math.abs(i - idxActual) : i;
            if (dist < minDiferencia) {
                minDiferencia = dist;
                mejor = p;
            }
        }
    }

    return mejor ? mejor.id : null;
}
// ==== RESOLVER PESTAÑA BUSQUEDA PURO END ====

// ==== NAVEGACION RESULTADOS PURO BEGIN ====
// Funciones puras para navegación espacial y secuencial de resultados por teclado.
function overlapVertical(ra, rb) {
    if (!ra || !rb) return false;
    const top = Math.max(ra.top, rb.top);
    const bottom = Math.min(ra.bottom, rb.bottom);
    const minAlto = Math.min(ra.height || 0, rb.height || 0);
    return minAlto > 0 ? (bottom - top) > minAlto * 0.3 : (bottom > top);
}

function calcularSiguienteItemResultado(items, indiceActual, direccion) {
    if (!Array.isArray(items) || items.length === 0) return -1;

    // Si ninguno está enfocado actualmente
    if (indiceActual < 0 || indiceActual >= items.length) {
        if (direccion === 'ArrowDown' || direccion === 'ArrowRight') {
            return 0;
        }
        if (direccion === 'ArrowUp' || direccion === 'ArrowLeft') {
            return items.length - 1;
        }
        return 0;
    }

    const itemActual = items[indiceActual];
    const rectActual = (itemActual && itemActual.rect) ? itemActual.rect : (
        (itemActual && typeof itemActual.getBoundingClientRect === 'function')
            ? itemActual.getBoundingClientRect()
            : null
    );

    // Fallback 1D si no hay rects o geometrías con altura
    if (!rectActual || !rectActual.height) {
        if (direccion === 'ArrowDown' || direccion === 'ArrowRight') {
            return Math.min(items.length - 1, indiceActual + 1);
        }
        if (direccion === 'ArrowUp' || direccion === 'ArrowLeft') {
            return indiceActual - 1;
        }
        return indiceActual;
    }

    const rects = items.map(it => (it && it.rect) ? it.rect : (
        (it && typeof it.getBoundingClientRect === 'function')
            ? it.getBoundingClientRect()
            : null
    ));
    const centroXActual = rectActual.left + rectActual.width / 2;

    if (direccion === 'ArrowRight') {
        let mejorIdx = -1;
        let menorDistX = Infinity;
        for (let i = 0; i < items.length; i++) {
            if (i === indiceActual) continue;
            const r = rects[i];
            if (!r) continue;
            if (overlapVertical(rectActual, r) && r.left >= rectActual.right - 2) {
                const distX = r.left - rectActual.right;
                if (distX < menorDistX) {
                    menorDistX = distX;
                    mejorIdx = i;
                }
            }
        }
        if (mejorIdx !== -1) return mejorIdx;
        return Math.min(items.length - 1, indiceActual + 1);
    }

    if (direccion === 'ArrowLeft') {
        let mejorIdx = -1;
        let menorDistX = Infinity;
        for (let i = 0; i < items.length; i++) {
            if (i === indiceActual) continue;
            const r = rects[i];
            if (!r) continue;
            if (overlapVertical(rectActual, r) && r.right <= rectActual.left + 2) {
                const distX = rectActual.left - r.right;
                if (distX < menorDistX) {
                    menorDistX = distX;
                    mejorIdx = i;
                }
            }
        }
        if (mejorIdx !== -1) return mejorIdx;
        return indiceActual - 1;
    }

    if (direccion === 'ArrowDown') {
        const candidatos = [];
        for (let i = 0; i < items.length; i++) {
            if (i === indiceActual) continue;
            const r = rects[i];
            if (!r) continue;
            if (r.top >= rectActual.bottom - 4) {
                candidatos.push({ index: i, rect: r });
            }
        }
        if (candidatos.length === 0) return indiceActual;
        const minTop = Math.min(...candidatos.map(c => c.rect.top));
        const itemsEnFila = candidatos.filter(c => c.rect.top <= minTop + (c.rect.height || 30) * 0.4);
        itemsEnFila.sort((a, b) => {
            const centroA = a.rect.left + a.rect.width / 2;
            const centroB = b.rect.left + b.rect.width / 2;
            return Math.abs(centroA - centroXActual) - Math.abs(centroB - centroXActual);
        });
        return itemsEnFila[0].index;
    }

    if (direccion === 'ArrowUp') {
        const candidatos = [];
        for (let i = 0; i < items.length; i++) {
            if (i === indiceActual) continue;
            const r = rects[i];
            if (!r) continue;
            if (r.bottom <= rectActual.top + 4) {
                candidatos.push({ index: i, rect: r });
            }
        }
        if (candidatos.length === 0) return -1;
        const maxBottom = Math.max(...candidatos.map(c => c.rect.bottom));
        const itemsEnFila = candidatos.filter(c => c.rect.bottom >= maxBottom - (c.rect.height || 30) * 0.4);
        itemsEnFila.sort((a, b) => {
            const centroA = a.rect.left + a.rect.width / 2;
            const centroB = b.rect.left + b.rect.width / 2;
            return Math.abs(centroA - centroXActual) - Math.abs(centroB - centroXActual);
        });
        return itemsEnFila[0].index;
    }

    return indiceActual;
}
// ==== NAVEGACION RESULTADOS PURO END ====

function obtenerPanelResultadosActivo() {
    const tabActiva = document.querySelector('#v-pills-tab button[data-ui-toggle="pill"].active');
    if (!tabActiva) return null;
    if (tabActiva.id === 'v-pills-stock-tab') return 'activos';
    if (tabActiva.id === 'v-pills-produccion-tab') return 'produccion';
    return null;
}

// Por dónde pasa el foco con Ctrl + → y las flechas: los dispositivos y también los encabezados de los grupos y subgrupos, así
// se puede detener uno cerrado y abrirlo (Enter / Espacio) sin salir del teclado; nunca se abren solos.
const SELECTOR_NAVEGABLES_ACTIVOS = '[data-stock-id], .accordion-button, .stock-subgrupo-fila, .stock-subgrupo-header';
const SELECTOR_NAVEGABLES_PRODUCCION = '.canal-item:not(.canal-item-disponible), .accordion-button';
const SELECTOR_NAVEGABLE_ENFOCADO = '[data-stock-id], .canal-item, .accordion-button, .stock-subgrupo-fila, .stock-subgrupo-header';
const PANELES_DE_RESULTADOS = '#stock-accordion, #v-pills-stock, #produccion-accordion, #v-pills-produccion';

/** Lo enfocado que cuenta como un resultado navegable (dispositivo o encabezado de grupo) de Activos o Producción; si no, null. */
function navegableEnfocado() {
    const el = document.activeElement ? document.activeElement.closest(SELECTOR_NAVEGABLE_ENFOCADO) : null;
    return el && el.closest(PANELES_DE_RESULTADOS) ? el : null;
}

function obtenerItemsResultadosBusqueda(tipoPanel) {
    const contenedor = tipoPanel === 'activos'
        ? (document.getElementById('stock-accordion') || document.getElementById('v-pills-stock'))
        : (document.getElementById('produccion-accordion') || document.getElementById('v-pills-produccion'));
    if (!contenedor) return [];

    const selector = tipoPanel === 'activos' ? SELECTOR_NAVEGABLES_ACTIVOS : SELECTOR_NAVEGABLES_PRODUCCION;

    const candidatos = Array.from(contenedor.querySelectorAll(selector));
    return candidatos.filter(el => {
        if (el.closest('.collapse:not(.show)')) return false;
        if (el.closest('.grid-collapse:not(.show)')) return false;      // lo de un grupo cerrado no se ve: el foco no entra
        if (el.closest('.d-none')) return false;
        if (el.closest('.stock-subgrupo-colapsado')) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    });
}

function enfocarItemResultado(el) {
    if (!el) return;
    if (typeof el.focus === 'function') {
        el.focus({ preventScroll: true });
    }
    const tipoPanel = obtenerPanelResultadosActivo();
    const items = tipoPanel ? obtenerItemsResultadosBusqueda(tipoPanel) : [];
    const esPrimerItem = items.length > 0 && items[0] === el;

    if (esPrimerItem && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    if (typeof el.getBoundingClientRect === 'function' && typeof window !== 'undefined') {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0) {
            const nav = document.querySelector('.navbar, nav');
            const navH = nav ? nav.offsetHeight : 58;
            const acordeonHeader = el.closest('.accordion-item')?.querySelector('.accordion-header');
            const acordeonHeaderH = acordeonHeader ? acordeonHeader.offsetHeight : 46;
            const zonaSeguraSuperior = navH + acordeonHeaderH + 28;
            const zonaSeguraInferior = 40;

            if (rect.top < zonaSeguraSuperior) {
                const delta = rect.top - zonaSeguraSuperior;
                if (window.scrollY + delta <= 50) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else if (typeof window.scrollBy === 'function') {
                    window.scrollBy({ top: delta, behavior: 'smooth' });
                }
                return;
            } else if (rect.bottom > window.innerHeight - zonaSeguraInferior) {
                const delta = rect.bottom - (window.innerHeight - zonaSeguraInferior);
                if (typeof window.scrollBy === 'function') {
                    window.scrollBy({ top: delta, behavior: 'smooth' });
                }
                return;
            }
            return;
        }
    }

    if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

let _dispositivoSeleccionado = null;
window.obtenerDispositivoSeleccionado = () => _dispositivoSeleccionado;

document.addEventListener('focusin', (e) => {
    if (!e.target || !(e.target instanceof Element)) return;
    const itemStock = e.target.closest('[data-stock-id]');
    if (itemStock && itemStock.closest('#stock-accordion, #v-pills-stock')) {
        _dispositivoSeleccionado = {
            panel: 'activos',
            stockId: itemStock.dataset.stockId || itemStock.dataset.stockEditar
        };
        return;
    }
    const itemCanal = e.target.closest('.canal-item');
    if (itemCanal && itemCanal.closest('#produccion-accordion, #v-pills-produccion')) {
        _dispositivoSeleccionado = {
            panel: 'produccion',
            channelId: itemCanal.dataset.channelId,
            nvrIp: itemCanal.dataset.nvrIp,
            camIp: itemCanal.dataset.camIp,
            stockId: itemCanal.dataset.stockId,
            camName: itemCanal.dataset.camName
        };
        return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (!e.target.closest('[data-stock-id], .canal-item')) {
            _dispositivoSeleccionado = null;
        }
    }
});

// Variable para controlar el debounce/cooldown del cambio de pestañas con teclado
let ultimoCambioTabTiempo = 0;
const DEBOUNCE_CAMBIO_TAB_MS = DUR_ANIM_MS + 30; // Duración de la mutación (--dur-anim) + margen

document.addEventListener('keydown', (e) => {
    // Ctrl + Flechas: navegar pestañas, buscador y resultados según la orientación del panel
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const keyFlecha = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) ? e.key : e.code;
        const accionFlecha = accionAtajoFlechaCtrl(keyFlecha, typeof posicionPanelActual === 'function' ? posicionPanelActual() : 'left');
        if (accionFlecha === 'resultados') {
            const modalAbierto = hayModalBloqueante();
            if (!modalAbierto) {
                const tipoPanel = obtenerPanelResultadosActivo();
                if (tipoPanel) {
                    const items = obtenerItemsResultadosBusqueda(tipoPanel);
                    if (items.length > 0) {
                        e.preventDefault();
                        enfocarItemResultado(items[0]);
                        return;
                    }
                }
            }
        } else if (accionFlecha === 'buscador') {
            const modalAbierto = hayModalBloqueante();
            if (!modalAbierto) {
                const globalSearch = document.getElementById('global-search');
                if (globalSearch) {
                    const debeAbrir = estadoPanelLateral && estadoPanelLateral.colapsado;
                    if (document.activeElement !== globalSearch || debeAbrir) {
                        e.preventDefault();
                        panelLateral('buscar');
                        globalSearch.focus();
                        if (typeof globalSearch.select === 'function') globalSearch.select();
                        return;
                    }
                }
            }
        } else if (accionFlecha === 'pestana-anterior' || accionFlecha === 'pestana-siguiente') {
            e.preventDefault();
            const ahora = Date.now();
            if (ahora - ultimoCambioTabTiempo >= DEBOUNCE_CAMBIO_TAB_MS) {
                ultimoCambioTabTiempo = ahora;
                const tabs = Array.from(document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]')).filter(t => !t.classList.contains('d-none') && !t.disabled && !t.hasAttribute('data-sin-ciclo'));
                if (tabs.length > 0) {
                    const indiceActual = tabs.findIndex(t => t.classList.contains('active'));
                    const direccion = accionFlecha === 'pestana-siguiente' ? 1 : -1;
                    const siguiente = calcularPestanaRueda(indiceActual, tabs.length, direccion);
                    UI.pestana.mostrar(tabs[siguiente]);
                }
            }
            return;
        }
    }

    // Navegación con flechas cuando un resultado de Activos o Producción está enfocado
    const itemEnfocado = navegableEnfocado();
    if (itemEnfocado && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        const popupEl = document.getElementById('popup-dispositivo-produccion');
        if (popupEl && !popupEl.classList.contains('d-none')) {
            const panelActivo = popupEl.querySelector('.popup-disp-acciones:not(.d-none)');
            const primerBoton = panelActivo ? panelActivo.querySelector('button:not(.d-none):not([disabled])') : null;
            if (primerBoton) primerBoton.focus();
            return;
        }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
            const tipoPanel = itemEnfocado.closest('#stock-accordion, #v-pills-stock')
                ? 'activos'
                : (itemEnfocado.closest('#produccion-accordion, #v-pills-produccion') ? 'produccion' : null);
            if (tipoPanel) {
                const items = obtenerItemsResultadosBusqueda(tipoPanel);
                const idx = items.indexOf(itemEnfocado);
                if (idx !== -1) {
                    const sig = calcularSiguienteItemResultado(items, idx, e.key);
                    if (sig === -1) {
                        const globalSearch = document.getElementById('global-search');
                        if (globalSearch) {
                            e.preventDefault();
                            panelLateral('buscar');
                            globalSearch.focus();
                        }
                    } else if (sig >= 0 && sig < items.length && sig !== idx) {
                        e.preventDefault();
                        enfocarItemResultado(items[sig]);
                    }
                    return;
                }
            }
        }
    }

    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        // `!e.defaultPrevented`: lo que ya atendió quien tenía el foco (un espacio para marcar o abrir un equipo) no es una
        // letra para el buscador
        // con un modal abierto la letra no arranca la búsqueda del panel (el modal decide qué hacer con ella)
        if (esTeclaDeBusqueda(e.key, e.ctrlKey || e.metaKey || e.altKey) && !e.defaultPrevented && !hayModalBloqueante()) {
            panelLateral('buscar');
            if (searchInput) {
                searchInput.focus();
                e.preventDefault();
                searchInput.value = (searchInput.value || '') + e.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
    if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        if (hayModalBloqueante()) return;

        if (typeof ocultarPopupProduccion === 'function') {
            const popupEl = document.getElementById('popup-dispositivo-produccion');
            if (popupEl && !popupEl.classList.contains('d-none')) {
                e.preventDefault();
                const trigger = _canalPopupActivo;
                ocultarPopupProduccion();
                if (trigger) {
                    enfocarItemResultado(trigger);
                }
                return;
            }
        }

        const resultadoEnfocado = navegableEnfocado();
        const accion = accionEscapeBusqueda({
            busquedaActiva: hayBusquedaActiva(),
            resultadoEnfocado: Boolean(resultadoEnfocado),
            buscadorEnfocado: Boolean(searchInput && document.activeElement === searchInput),
        });
        if (accion === 'ir-al-buscador') {
            const globalSearch = document.getElementById('global-search');
            if (globalSearch) {
                e.preventDefault();
                panelLateral('buscar');
                globalSearch.focus();
                return;
            }
        }
        if (accion === 'quitar-foco') {
            e.preventDefault();
            document.activeElement.blur();
            return;
        }
        if (accion === 'limpiar') limpiarBusqueda();
    }

});

if (searchInput) {
    searchInput.addEventListener('focus', () => {
        if (estadoPanelLateral && estadoPanelLateral.colapsado) {
            panelLateral('buscar');
        }
    });

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const valor = e.target.value;
        const tieneTexto = valor.trim().length > 0;
        searchInput.classList.toggle('search-active', tieneTexto);
        const container = searchInput.closest('.search-container');
        if (container) container.classList.toggle('search-active', tieneTexto);

        debounceTimer = setTimeout(() => {
            ejecutarFiltro(valor.toLowerCase(), { autoCambiarPestana: true, animar: true });
        }, 300);
    });

    const botonLimpiar = document.getElementById('search-clear');
    if (botonLimpiar) botonLimpiar.addEventListener('click', limpiarBusqueda);

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (!searchInput.value.trim()) {
                limpiarBusqueda();
            } else {
                clearTimeout(debounceTimer);
                ejecutarFiltro(searchInput.value.toLowerCase(), { autoCambiarPestana: true, animar: true });
            }
        }
    });

    searchInput.addEventListener('blur', (e) => {
        const container = searchInput.closest('.search-container');
        if (container && e.relatedTarget && container.contains(e.relatedTarget)) {
            return;
        }
        setTimeout(() => {
            if (estadoPanelLateral.autoExpandido && !searchInput.value.trim()) {
                const activo = document.activeElement;
                if (container && activo && container.contains(activo)) return;
                limpiarBusqueda();
            }
        }, 150);
    });
}

function ejecutarFiltro(term, opciones = {}) {
    // El servidor ya entrega las listas unificadas (offline primero) con is_offline
    const todasLasCamaras = uiCamarasCargadas();
    const todosLosNVRs = uiNvrsCargados();
    const tieneTexto = Boolean(term && term.trim().length > 0);

    if (searchInput) {
        searchInput.classList.toggle('search-active', tieneTexto);
        const container = searchInput.closest('.search-container');
        if (container) container.classList.toggle('search-active', tieneTexto);
    }

    // Les dice a las pestañas qué se busca (término vacío = sin filtro)
    const avisarBusqueda = (termino, fichas) => document.dispatchEvent(new CustomEvent('cctv:busqueda', {
        detail: { term: termino, tokens: fichas, campos: [...busqCamposActivos], paneles: [...busqPanelesActivos],
            field: currentSearchField, animar: Boolean(opciones.animar) }
    }));

    if (!tieneTexto) {
        actualizarBadgePestana('v-pills-dashboard-tab', 0, false);
        actualizarBadgePestana('v-pills-produccion-tab', 0, false);
        actualizarBadgePestana('v-pills-auditoria-tab', 0, false);
        actualizarBadgePestana('v-pills-stock-tab', 0, false);
        avisarBusqueda('', []);
        renderizarCamarasOnline(todasLasCamaras, false, opciones);
        return;
    }

    const tokens = tokenizarBusqueda(term);

    let conteoProduccion = 0;
    if (busqPanelesActivos.has('produccion')) {
        const camsFiltradas = todasLasCamaras.filter(cam => camaraCumpleBusqueda(cam, tokens, busqCamposActivos));
        renderizarCamarasOnline(camsFiltradas, true, opciones);
        const otrosTodos = obtenerOtrosDispositivosProduccion();
        const otrosFiltrados = otrosTodos.filter(disp =>
            otroDispositivoCumpleBusqueda(disp, tokens, busqCamposActivos));
        conteoProduccion = camsFiltradas.length + otrosFiltrados.length;
        actualizarBadgePestana('v-pills-produccion-tab', conteoProduccion, true);
    } else {
        renderizarCamarasOnline(todasLasCamaras, false, opciones);
        actualizarBadgePestana('v-pills-produccion-tab', 0, false);
    }

    // Estado no lista equipos (sin alertas): no cuenta para la búsqueda
    actualizarBadgePestana('v-pills-dashboard-tab', 0, false);

    let conteoAuditoria = 0;
    if (busqPanelesActivos.has('auditoria')) {
        conteoAuditoria = actualizarBadgeAuditoria(term) || 0;
    } else {
        actualizarBadgePestana('v-pills-auditoria-tab', 0, false);
    }

    let conteoStock = 0;
    if (busqPanelesActivos.has('stock')) {
        if (!_cacheStockResumen && !_stockResumenPedido && typeof cargarStockResumen === 'function') {
            cargarStockResumen();
        }
        conteoStock = obtenerConteoStock(term);
        avisarBusqueda(term, tokens);
    } else {
        actualizarBadgePestana('v-pills-stock-tab', 0, false);
        avisarBusqueda('', []);
    }

    const conteosPorId = new Map([
        ['v-pills-stock-tab', conteoStock],
        ['v-pills-produccion-tab', conteoProduccion],
        ['v-pills-auditoria-tab', conteoAuditoria],
    ]);

    const tabActual = document.querySelector('#v-pills-tab button[data-ui-toggle="pill"].active');
    const paneles = Array.from(document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]')).map(btn => ({
        id: btn.id,
        conteo: conteosPorId.get(btn.id) || 0
    }));

    if (opciones && opciones.autoCambiarPestana && buscarCambiaPestana()) {
        const destinoId = resolverPestanaBusqueda(tabActual ? tabActual.id : null, paneles);
        if (destinoId && typeof UI !== 'undefined' && UI.pestana) {
            const destinoEl = document.getElementById(destinoId);
            if (destinoEl && !destinoEl.classList.contains('active')) {
                UI.pestana.mostrar(destinoEl);
            }
        }
    }
}

window.buscarConAtajo = function(query, opciones = {}) {
    if (opciones.campos && Array.isArray(opciones.campos)) {
        busqCamposActivos = new Set(opciones.campos);
    } else if (opciones.campos instanceof Set) {
        busqCamposActivos = new Set(opciones.campos);
    }
    if (opciones.paneles && Array.isArray(opciones.paneles)) {
        busqPanelesActivos = new Set(opciones.paneles);
        guardarPanelesBusqueda();
    } else if (opciones.paneles instanceof Set) {
        busqPanelesActivos = new Set(opciones.paneles);
        guardarPanelesBusqueda();
    }
    actualizarUIFiltroBusqueda();

    // Si el atajo cambia de pestaña, el filtro se aplica ANTES y sin animar: la pestaña entra ya filtrada con su
    // propia animación. Animar también la búsqueda superponía dos mutaciones con tiempos distintos.
    const tabEl = opciones.tab ? document.getElementById(opciones.tab) : null;
    const cambiaPestana = Boolean(tabEl && typeof UI !== 'undefined' && !tabEl.classList.contains('active'));
    panelLateral('buscar');
    if (searchInput) {
        searchInput.value = query || '';
        searchInput.classList.toggle('search-active', Boolean(query && query.trim().length > 0));
        const container = searchInput.closest('.search-container');
        if (container) container.classList.toggle('search-active', Boolean(query && query.trim().length > 0));
    }
    ejecutarFiltro(query || '', { autoCambiarPestana: !opciones.tab, animar: !cambiaPestana });
    if (cambiaPestana) UI.pestana.mostrar(tabEl);
    if (searchInput) searchInput.focus();
};
