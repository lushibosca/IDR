// Pestaña Producción: acordeones (compartidos con Activos), modelo puro y DOM de los canales y "Otros dispositivos",
// imágenes de dispositivos, popup del equipo y capacidad de canales por modelo de NVR. Se carga DESPUÉS de app.js
// (usa `storage`, `globalData` y el bloque UI COMUN al cargar o al llamarse).

// --- Acordeones (cámaras, NVRs y stock) ---
// Ambos comparten estado persistido, markup y apertura/cierre; lo único que
// cambia es la clave de localStorage y el contenido de cada grupo.
const ACORDEONES = {
    'produccion-accordion': { storageKey: 'cctv_open_accordions' },
    'stock-accordion': { storageKey: 'cctv_open_stock' }      // pestaña Stock (static/stock.js)
};

// Ids abiertos antes de re-renderizar: como máximo UNO (el guardado en storage
// o, si no hay, el que esté abierto ahora en el DOM).
function leerAcordeonAbierto(accordion) {
    const abiertos = new Set();
    const guardados = storage.getJSON(ACORDEONES[accordion.id].storageKey, []);
    if (Array.isArray(guardados) && guardados.length > 0) {
        abiertos.add(guardados[0]);
    }
    if (abiertos.size === 0) {
        const existente = accordion.querySelector('.accordion-collapse.show');
        if (existente && existente.id) abiertos.add(existente.id);
    }
    return abiertos;
}

// ==== ACORDEON ANIMACION PURO BEGIN ====
// Funciones puras (sin DOM): las prueba tests/js/acordeon_animacion.test.mjs extrayendo este bloque.
const ACORDEON_MARGEN_MS = 60;            // margen sobre la duración de la transición CSS

// "0.22s" | "220ms" -> milisegundos; cualquier otra cosa -> `defecto`
function duracionCssMs(texto, defecto = 250) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*$/.exec(String(texto || ''));
    if (!m) return defecto;
    return Math.round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1));
}

// Milisegundos que faltan para que termine la animación marcada (0 = no hay animación en curso)
function acordeonRestanteMs(animandoHasta, ahora) {
    return Number.isFinite(animandoHasta) ? Math.max(0, animandoHasta - ahora) : 0;
}

// Alto (px) que vale la pena animar al CERRAR un grupo: desde su borde superior hasta el pie de la ventana (si el
// grupo empieza más arriba de la pantalla, `top` es negativo y se conserva lo de arriba: recortarlo movería la vista).
// Lo que queda por debajo de la pantalla no se ve: animarlo solo acelera la parte visible.
function alturaAnimableAlCerrar(alturaContenido, topEnPantalla, altoVentana) {
    const visible = altoVentana - topEnPantalla;
    return Math.max(0, Math.min(alturaContenido, Number.isFinite(visible) ? visible : alturaContenido));
}

// Al ABRIR: como mucho una ventana de alto (después del scroll automático el encabezado puede quedar arriba de todo)
function alturaAnimableAlAbrir(alturaContenido, altoVentana) {
    return Math.max(0, Math.min(alturaContenido, altoVentana));
}
// ==== ACORDEON ANIMACION PURO END ====

// Repintar un acordeón MIENTRAS se anima su apertura corta la transición: el elemento nuevo nace ya
// abierto (.show) y se ve "de golpe". Pasaba al llegar las métricas de un servidor recién abierto (respuesta en caché,
// más rápida que la animación) o si el refresco automático coincidía con el clic. Por eso abrir/cerrar marca el
// acordeón como "animando" y los repintados de ese lapso se postergan hasta que termine (con los datos más nuevos).
const _acordeonAnimandoHasta = new Map();      // id del acordeón -> timestamp (ms) en que termina la animación
const _acordeonRepintado = new Map();          // id del acordeón -> setTimeout pendiente

function duracionColapsoMs() {
    return duracionCssMs(getComputedStyle(document.documentElement).getPropertyValue('--dur-colapso'));
}

function marcarAnimacionAcordeon(accordion) {
    _acordeonAnimandoHasta.set(accordion.id, Date.now() + duracionColapsoMs() + ACORDEON_MARGEN_MS);
}

// La transición dura lo mismo para cualquier altura y su curva hace casi todo el movimiento al principio: en un grupo de
// Cámaras de miles de px la parte visible se llenaba (o vaciaba) en unos milisegundos y se veía "de golpe". Durante la
// animación se limita la altura del contenido a lo que se ve (`max-height` en el hijo que recorta) y al terminar se
// libera: lo que queda fuera de la pantalla aparece/desaparece sin que se note.
const _limiteAnimacion = new WeakMap();       // hijo recortado -> setTimeout que libera el límite

function limitarAlturaDuranteAnimacion(collapse, alturaPx) {
    const interno = collapse && collapse.firstElementChild;
    if (!interno) return;
    clearTimeout(_limiteAnimacion.get(interno));
    interno.style.maxHeight = `${Math.ceil(alturaPx)}px`;
    _limiteAnimacion.set(interno, setTimeout(() => {
        interno.style.maxHeight = '';
        _limiteAnimacion.delete(interno);
    }, duracionColapsoMs() + ACORDEON_MARGEN_MS));
}

// true = se postergó (el llamador no debe repintar ahora); `repintar` se ejecuta al terminar la animación.
// Si llegan varios repintados durante la misma animación, vale el ÚLTIMO (sus datos son los más nuevos).
function postergarSiAnima(accordionId, repintar) {
    const restante = acordeonRestanteMs(_acordeonAnimandoHasta.get(accordionId), Date.now());
    if (restante === 0) return false;
    clearTimeout(_acordeonRepintado.get(accordionId));
    _acordeonRepintado.set(accordionId, setTimeout(() => {
        _acordeonRepintado.delete(accordionId);
        repintar();
    }, restante));
    return true;
}

function cerrarAcordeones(accordion) {
    accordion.querySelectorAll('.accordion-collapse').forEach(el => el.classList.remove('show'));
    accordion.querySelectorAll('.accordion-button').forEach(b => {
        b.classList.add('collapsed');
        b.setAttribute('aria-expanded', 'false');
    });
}

function abrirAcordeon(btn, target) {
    target.classList.add('show');
    btn.classList.remove('collapsed');
    btn.setAttribute('aria-expanded', 'true');
}

// ==== PRODUCCION VISTAS PURO BEGIN ====
// Las vistas de Producción, en el orden en que las recorre Alt+Shift+V: lista, tarjetas y «snapshot» (la tarjeta lleva la
// captura del canal debajo y queda cuadrada). Lo que no es una de ellas es tarjetas.
const PRODUCCION_VISTAS = ['lista', 'tarjetas'];      // la vista «snapshot» (con capturas) no va: no hay capturas
function produccionVistaValida(vista) {
    return PRODUCCION_VISTAS.includes(vista);
}
function produccionVistaSiguiente(actual) {
    const i = PRODUCCION_VISTAS.indexOf(actual);
    return PRODUCCION_VISTAS[(i + 1) % PRODUCCION_VISTAS.length];
}
// ==== PRODUCCION VISTAS PURO END ====

const CLAVE_MODO_VISTA_PRODUCCION = 'cctv_produccion_vista';
let modoVistaProduccion = leerModoVistaProduccion();

function leerModoVistaProduccion() {
    const guardado = (typeof storage !== 'undefined') ? storage.get(CLAVE_MODO_VISTA_PRODUCCION, 'tarjetas') : 'tarjetas';
    if (guardado === 'lista' && uiEsMovil()) return 'tarjetas';      // la lista no entra en un celular (queda guardada para la PC)
    return produccionVistaValida(guardado) ? guardado : 'tarjetas';
}

function guardarModoVistaProduccion(nuevoModo) {
    modoVistaProduccion = nuevoModo;
    if (typeof preferencias !== 'undefined') {
        preferencias.set(CLAVE_MODO_VISTA_PRODUCCION, nuevoModo);
    }
}

// Un botón por vista (lista, tarjetas, snapshot): `produccion-btn-vista-<vista>`
const botonVistaProduccion = (vista) => document.getElementById(`produccion-btn-vista-${vista}`);

function sincronizarBotonesModoVistaProduccion() {
    for (const vista of PRODUCCION_VISTAS) {
        const btn = botonVistaProduccion(vista);
        if (btn) btn.classList.toggle('active', modoVistaProduccion === vista);
    }
}

function initModoVistaProduccion() {
    sincronizarBotonesModoVistaProduccion();
    preferencias.alAplicar(CLAVE_MODO_VISTA_PRODUCCION, () => {
        const nuevo = leerModoVistaProduccion();
        if (nuevo === modoVistaProduccion) return;
        modoVistaProduccion = nuevo;
        sincronizarBotonesModoVistaProduccion();
        ejecutarFiltro(terminoBusquedaActual(), { animar: true });
    });
    for (const vista of PRODUCCION_VISTAS) {
        const btn = botonVistaProduccion(vista);
        if (!btn) continue;
        btn.addEventListener('click', () => {
            if (modoVistaProduccion === vista) return;
            guardarModoVistaProduccion(vista);
            sincronizarBotonesModoVistaProduccion();
            ejecutarFiltro(terminoBusquedaActual(), { animar: true });
        });
    }
}
uiAlCambiarMovil(() => {                                   // girar el aparato: de tarjetas forzadas a la vista guardada y al revés
    const nuevo = leerModoVistaProduccion();
    if (nuevo === modoVistaProduccion) return;
    modoVistaProduccion = nuevo;
    sincronizarBotonesModoVistaProduccion();
    ejecutarFiltro(terminoBusquedaActual(), { animar: true });
});
window.produccionModoVista = () => modoVistaProduccion;

function renderizarCamarasOnline(camaras, isSearching = false, opciones = {}) {
    sincronizarBotonesModoVistaProduccion();
    const accordion = document.getElementById('produccion-accordion');
    if (!accordion) return;
    if (postergarSiAnima(accordion.id, () => renderizarCamarasOnline(camaras, isSearching, opciones))) return;

    // En búsqueda activa se abren todos los grupos con resultados; en modo normal, como máximo UN grupo abierto (el
    // guardado, o el que ya estaba abierto). "Otros dispositivos" sale del stock, filtrado por la misma búsqueda.
    const abiertos = isSearching ? new Set() : leerAcordeonAbierto(accordion);
    const otrosTodos = obtenerOtrosDispositivosProduccion();
    const term = terminoBusquedaActual();
    const tokens = (isSearching && term) ? tokenizarBusqueda(term) : [];
    const campos = (typeof busqCamposActivos !== 'undefined') ? busqCamposActivos : null;
    const otros = tokens.length > 0 ? otrosTodos.filter(d => otroDispositivoCumpleBusqueda(d, tokens, campos)) : otrosTodos;

    const modelo = modeloProduccion(camaras, {
        nvrs: uiNvrsCargados(),
        camarasTodas: uiCamarasCargadas(),
        buscando: isSearching,
        abiertos,
        vista: modoVistaProduccion,
        otros,
        equiposRed: uiDatosCargados('equipos_red'),
        limpiarNombre: limpiarNombreNvr,
        capacidad: (nvrObj) => {
            // La que informó el grabador si se lo consultó en Auditoría > Grabador; si no, la estimada por modelo
            const consultada = (typeof capacidadConsultadaNvr === 'function') ? capacidadConsultadaNvr(nvrObj.ip) : null;
            return consultada || obtenerCapacidadCanalesNvr(nvrObj.modelo);
        },
        completar: completarCanalesDisponibles,
        ubicacion: (equipo) => ubicacionStockTexto(equipo),
        ubicacionInstalacion: (inst) => (typeof stockUbicacionTexto === 'function' && inst) ? stockUbicacionTexto(inst) : '',
        imagen: (m) => buscarImagenDispositivo(m),
        nombre: (d, defecto) => stockNombreVisible(d, defecto),
        icono: (tipo) => stockIconoTipo(tipo, stockCatalogo(_cacheStockResumen && _cacheStockResumen.grupos))
    });

    // Sin cambios (el refresco periódico casi siempre): no se toca el DOM. Repintar cientos de tarjetas recargaba las
    // miniaturas y perdía el hover y el foco.
    const firma = JSON.stringify(modelo);
    if (firma === _produccionFirmaPintada && accordion.firstChild) return;

    const aplicarDOM = () => {
        _produccionFirmaPintada = firma;
        accordion.replaceChildren(...construirProduccion(modelo));
        restaurarSeleccionProduccion(accordion);
        sincronizarAlturasStickyProduccion();
        if (!_produccionCargaAnimada && accordion.firstChild) {
            _produccionCargaAnimada = true;
            if (typeof animarCargaBlur === 'function') animarCargaBlur(accordion, { duracion: 650 });
            document.documentElement.removeAttribute('data-cargando-lista');
        }
    };
    mutarContenido(accordion, aplicarDOM, null, null, Boolean(opciones.animar));
}
let _produccionFirmaPintada = null;
let _produccionCargaAnimada = false;

// ==== PRODUCCION MODELO PURO BEGIN ====
// Qué muestra Producción, sin DOM (lo prueba tests/js/produccion_modelo.test.mjs): un grupo por NVR con sus canales
// (más los libres, si se conoce la capacidad y no se está buscando) y "Otros dispositivos" del stock. Lo pinta
// construirProduccion() con textContent; su JSON es la firma que evita repintar si nada cambió.
// e: { nvrs, buscando, abiertos: Set, vista: 'lista'|'tarjetas'|'snapshot', otros, equiposRed (de /api/v2/datos), limpiarNombre, capacidad(nvr) -> n|null,
//      completar(lista, capacidad, nombre, ip), ubicacion(cam) -> texto, ubicacionInstalacion(inst) -> texto,
//      imagen(modelo) -> ruta|null, nombre(disp, defecto) -> texto, icono(tipo) -> clase }
const PRODUCCION_ID_OTROS = 'collapse-nvr-otros-dispositivos';

// "Anexo A · piso PB" (solo edificio y piso: lo que se muestra en la vista de lista si entra)
function produccionLugar(inst) {
    if (!inst) return '';
    return [inst.edificio, inst.piso ? `piso ${inst.piso}` : ''].filter(Boolean).join(' · ');
}

// "0010 - 3" o "0010" o "Pto. 3" (o '' si no hay datos; racks numéricos a 4 dígitos)
function produccionRackPuerto(inst) {
    if (!inst) return '';
    const rackRaw = inst.rack ? String(inst.rack).trim() : '';
    const rack = /^\d+$/.test(rackRaw) ? rackRaw.padStart(4, '0') : rackRaw;
    const puerto = inst.puerto ? String(inst.puerto).trim() : '';
    if (rack && puerto) return `${rack} - ${puerto}`;
    if (rack) return rack;
    if (puerto) return `Pto. ${puerto}`;
    return '';
}

// Canales de un NVR, por número de canal (los que no son número van al final, en orden natural)
function compararCanales(a, b) {
    const valA = a.channel_id != null ? a.channel_id : '';
    const valB = b.channel_id != null ? b.channel_id : '';
    const numA = parseInt(valA, 10);
    const numB = parseInt(valB, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return String(valA).trim().localeCompare(String(valB).trim(), 'es', { numeric: true, sensitivity: 'base' });
}

// Clave del equipo físico de una cámara (IP, si no MAC, si no el activo del stock); '' si no hay con qué identificarla
function produccionClaveFisica(cam) {
    const ip = uiValorInformado(cam.ip_address).toLowerCase();
    if (ip) return `ip:${ip}`;
    const mac = uiValorInformado(cam.mac_address).toUpperCase();
    if (mac && mac !== '00:00:00:00:00:00') return `mac:${mac}`;
    return (cam.stock && cam.stock.id) ? `stock:${cam.stock.id}` : '';
}

// Claves físicas de las cámaras que aparecen en más de un grabador (canal en violeta). `camaras`: todas las cargadas,
// no solo las que deja la búsqueda.
function camarasEnVariosGrabadores(camaras, limpiarNombre) {
    const nvrsPorCam = new Map();
    const multi = new Set();
    for (const c of camaras) {
        const clave = c ? produccionClaveFisica(c) : '';
        const nvr = clave ? (limpiarNombre(c.nvr_name || '').trim() || String(c.nvr_ip || '').trim()) : '';
        if (!nvr) continue;
        if (!nvrsPorCam.has(clave)) nvrsPorCam.set(clave, new Set());
        const nvrs = nvrsPorCam.get(clave);
        nvrs.add(nvr);
        if (nvrs.size > 1) multi.add(clave);
    }
    return multi;
}

function modeloProduccion(camaras, e) {
    const grupos = [];
    const nvrs = Array.isArray(e.nvrs) ? e.nvrs : [];
    const multiGrabadores = camarasEnVariosGrabadores(
        Array.isArray(e.camarasTodas) && e.camarasTodas.length > 0 ? e.camarasTodas : camaras, e.limpiarNombre);

    // Map y no {}: el nombre lo informa el propio NVR y "__proto__"/"constructor" rompían el agrupado
    const porNvr = new Map();
    // Todo grabador instalado tiene su grupo, aunque todavía no tenga cámaras asignadas (sus canales se ven libres);
    // buscando, solo los que tienen coincidencias
    if (!e.buscando) {
        for (const n of nvrs) {
            const nombre = e.limpiarNombre((n && n.nvr_name) || '');
            if (nombre && !porNvr.has(nombre)) {
                porNvr.set(nombre, { offline: 0, sinSenal: 0, sinRelevar: 0, lista: [], nvr_ip: n.ip || '' });
            }
        }
    }
    for (const cam of camaras) {
        // El backend puede adjuntar la IP al nombre (ej: "Nombre (10.0.0.1)")
        const nvr = e.limpiarNombre(cam.nvr_name || 'Desconocido') || 'Desconocido';
        if (!porNvr.has(nvr)) porNvr.set(nvr, { offline: 0, sinSenal: 0, sinRelevar: 0, lista: [], nvr_ip: cam.nvr_ip || '' });
        const g = porNvr.get(nvr);
        g.lista.push(cam);
        // sin relevar o no: una caída es una caída; «sin señal» (el escaneo no encontró equipo en el canal), no
        if (cam.is_offline && cam.sin_senal) g.sinSenal += 1;
        else if (cam.is_offline) g.offline += 1;
        if (cam.sin_relevar) g.sinRelevar += 1;
        if (cam.nvr_ip && !g.nvr_ip) g.nvr_ip = cam.nvr_ip;
    }
    const nombres = [...porNvr.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
    for (const nvrName of nombres) {
        const data = porNvr.get(nvrName);
        const mismo = (n) => {
            const a = e.limpiarNombre(n.nvr_name).toLowerCase();
            const b = nvrName.trim().toLowerCase();
            return (a && b && a === b) || (n.ip && data.nvr_ip && n.ip.trim() === data.nvr_ip.trim());
        };
        const nvrObj = nvrs.find(mismo);
        const nvrCaido = nvrObj ? Boolean(nvrObj.is_offline) : nvrs.filter(n => n.is_offline).some(mismo);
        const capTotal = nvrObj ? e.capacidad(nvrObj) : null;
        const nvrIp = data.nvr_ip || (nvrObj && nvrObj.ip) || '';
        const lista = (capTotal && capTotal > 0 && !e.buscando)
            ? e.completar(data.lista, capTotal, nvrName, nvrIp)
            : [...data.lista];
        lista.sort(compararCanales);
        const id = `collapse-nvr-${nvrName.replace(/\W/g, '_')}`;
        const insignias = [{ texto: `${data.lista.length} Cámaras`, clase: 'bg-secondary' }];
        if (data.offline > 0) insignias.push({ texto: `${data.offline} Caídas`, clase: 'bg-danger' });
        if (data.sinSenal > 0) insignias.push({ texto: `${data.sinSenal} Sin señal`, clase: 'bg-secondary-subtle text-secondary border border-secondary-subtle' });
        if (data.sinRelevar > 0) insignias.push({ texto: `${data.sinRelevar} Sin relevar`, clase: 'bg-info-subtle text-info border border-info-subtle' });
        if (nvrObj && nvrObj.graba === false) {
            insignias.push({ texto: 'Solo pantalla', clase: 'bg-info-subtle text-info border border-info-subtle' });
        }
        if (nvrCaido) insignias.push({ texto: 'Grabador offline', clase: 'bg-danger' });
        const items = lista.map((cam) => {
            const chNum = uiNumeroCanal(cam.channel_id);
            const comun = {
                canal: chNum ? `CH ${chNum}` : '-',
                canalId: String(cam.channel_id ?? ''),
                nvrIp: cam.nvr_ip || data.nvr_ip || '',
                nvrNombre: cam.nvr_name || nvrName || ''
            };
            if (cam.detalle === 'disponible') {
                return { tipo: 'libre', lugar: '', rackPuerto: '', ...comun };
            }
            const claveDisp = produccionClaveFisica(cam);
            const multiGrabador = Boolean(claveDisp && multiGrabadores.has(claveDisp));
            return {
                tipo: 'camara', ...comun,
                nombre: cam.camera_name || '',
                ip: cam.ip_address || '-',
                mac: cam.mac_address || '',
                modelo: cam.modelo || '',
                firmware: cam.firmware || '',
                offline: Boolean(cam.is_offline) && !cam.sin_senal,
                sinSenal: Boolean(cam.is_offline) && Boolean(cam.sin_senal),
                sinGrabacion: !cam.is_offline && Boolean(cam.fallback_ping),
                sinRelevar: Boolean(cam.sin_relevar),
                sinRelevarMotivo: cam.sin_relevar_motivo || '',
                multiGrabador,
                detalle: cam.detalle || '',
                ubicacion: e.ubicacion(cam),
                lugar: produccionLugar(cam.stock),
                rackPuerto: produccionRackPuerto(cam.stock),
                stockId: (cam.stock && cam.stock.id) || null
            };
        });
        grupos.push({
            id, titulo: nvrName, abierto: e.buscando || e.abiertos.has(id), icono: 'bi bi-hdd-rack', insignias,
            detalle: nvrIp && nvrIp !== nvrName ? nvrIp : '',        // la IP junto a la flecha (si el nombre no es ya la IP)
            datos: { nvrName, nvrIp: data.nvr_ip || '' }, items
        });
    }

    const otros = Array.isArray(e.otros) ? e.otros : [];
    if (otros.length > 0) {
        const ordenados = [...otros].sort((a, b) => e.nombre(a, a.id)
            .localeCompare(e.nombre(b, b.id), 'es', { numeric: true, sensitivity: 'base' }));
        // Equipos de red (decoders, analítica) que vigila el monitor: su estado en vivo, unido por el id del activo
        const red = new Map();
        for (const eq of Array.isArray(e.equiposRed) ? e.equiposRed : []) {
            if (eq && eq.stock && eq.stock.id) red.set(eq.stock.id, eq);
        }
        const items = ordenados.map((disp) => ({
            tipo: 'otro',
            red: red.has(disp.id) ? red.get(disp.id).estado : null,
            redMotivo: red.has(disp.id) ? (red.get(disp.id).motivo || '') : '',
            stockId: disp.id || '',
            nombre: e.nombre(disp, 'Dispositivo'),
            ip: (disp.instalacion && disp.instalacion.ip) || '',
            modelo: disp.modelo || '',
            mac: disp.mac || '',
            firmware: disp.firmware || '',
            tipoDisp: disp.tipo || '',
            averiado: disp.condicion === 'averiado',
            revisar: disp.condicion === 'revisar',
            icono: e.icono(disp.tipo),
            imagen: e.imagen(disp.modelo) || null,
            ubicacion: e.ubicacionInstalacion(disp.instalacion),
            lugar: produccionLugar(disp.instalacion),
            rackPuerto: produccionRackPuerto(disp.instalacion)
        }));
        const averiados = items.filter(i => i.averiado).length;
        const caidos = items.filter(i => i.red === 'offline').length;
        const insignias = [{ texto: `${items.length} Dispositivos`, clase: 'bg-secondary' }];
        if (caidos > 0) insignias.push({ texto: `${caidos} Offline`, clase: 'bg-danger' });
        if (averiados > 0) insignias.push({ texto: `${averiados} Averiados`, clase: 'bg-danger' });
        grupos.push({
            id: PRODUCCION_ID_OTROS, titulo: 'Otros dispositivos', abierto: e.buscando || e.abiertos.has(PRODUCCION_ID_OTROS),
            icono: 'bi bi-hdd-rack', insignias, datos: { nvrName: 'Otros dispositivos' }, items
        });
    }
    return { vista: produccionVistaValida(e.vista) ? e.vista : 'tarjetas', grupos };
}
// ==== PRODUCCION MODELO PURO END ====

function produccionEncabezadoLista() {
    const h = uiNodo('div', 'canal-lista-header');
    h.setAttribute('aria-hidden', 'true');
    h.append(
        uiNodo('div', 'canal-col-ch', 'CANAL'),
        uiNodo('div', 'canal-col-desc', 'DESCRIPCIÓN'),
        uiNodo('div', 'canal-col-ip', 'IP'),
        uiNodo('div', 'canal-col-ubic', 'EDIFICIO / PISO'),
        uiNodo('div', 'canal-col-rack', 'RACK - PUERTO'),
        uiNodo('div', 'canal-col-estado', 'ESTADO')
    );
    return h;
}

// Pinta el modelo de Producción: solo nodos y textContent (lo que informa un equipo nunca se interpreta como HTML).
function construirProduccion(modelo) {
    if (modelo.grupos.length === 0) {
        return [uiNodo('div', 'text-center text-secondary py-4', 'No se encontraron cámaras')];
    }
    const lista = modelo.vista === 'lista';
    const snapshot = modelo.vista === 'snapshot';
    return modelo.grupos.map((g) => {
        const contenedor = uiNodo('div', lista ? 'canal-lista' : (snapshot ? 'canal-grid canal-grid-snapshot' : 'canal-grid'));
        if (lista && g.items.length > 0) {
            contenedor.appendChild(produccionEncabezadoLista());
        }
        for (const it of g.items) contenedor.appendChild(produccionItem(it, lista, snapshot));
        const cuerpo = uiNodo('div', lista ? 'p-0' : 'p-3');
        cuerpo.appendChild(contenedor);
        return uiItemAcordeon({
            id: g.id, abierto: g.abierto, titulo: g.titulo, claseTitulo: 'produccion-acordeon-titulo', icono: g.icono,
            insignias: g.insignias, cuerpo, datos: g.datos, detalle: g.detalle || '', copiar: g.detalle || ''
        });
    });
}

// Estado de un equipo en Producción: texto con color semántico, sin fondo, borde ni ícono.
function produccionEstado(it) {
    if (it.tipo === 'libre') return uiNodo('span', 'text-secondary fw-semibold', 'Disponible');
    if (it.tipo === 'otro') {
        if (it.averiado) return uiNodo('span', 'text-danger fw-semibold', 'Averiado');
        if (it.red === 'offline' || it.red === 'desconocido') {
            const s = it.red === 'offline' ? uiNodo('span', 'text-danger fw-semibold', 'Caído')
                : uiNodo('span', 'text-secondary fw-semibold', 'Sin sonda');
            if (it.redMotivo) s.title = it.redMotivo;
            return s;
        }
        if (it.red === 'online') return uiNodo('span', 'text-success fw-semibold', 'Operativo');
        return it.revisar ? uiNodo('span', 'text-warning-emphasis fw-semibold', 'A revisar') : null;
    }
    if (it.sinSenal) {
        const s = uiNodo('span', 'text-secondary fw-semibold', 'Sin señal');
        s.title = 'El canal sigue configurado en el grabador, pero el último escaneo no encontró la cámara: '
            + 'borrá el canal del grabador o, si la cámara se repuso, volvé a escanear';
        return s;
    }
    if (it.offline) {
        const s = uiNodo('span', 'text-danger fw-semibold', 'Caído');
        const nota = it.sinRelevar ? `sin relevar: ${uiTextoSinRelevar(it.sinRelevarMotivo)}` : '';
        if (it.detalle || nota) s.title = [it.detalle, nota].filter(Boolean).join(' · ');
        return s;
    }
    if (it.sinGrabacion) {
        const s = uiNodo('span', 'text-warning-emphasis fw-semibold', 'Sin grabación');
        s.title = 'Responde ping directo, pero su NVR está caído (sin grabación)';
        return s;
    }
    // Sin monitoreo, un canal ocupado es un equipo en producción: «operativo» es lo único posible ahí, no se marca
    return null;
}

// Las capturas de la vista snapshot se piden de a pocas y solo las que están cerca de la vista (uiColaImagenes): cientos de
// `<img>` a la vez agotarían el tope de pedidos de la API. Lo que ya se pidió (o falló hace poco) se recuerda por canal: cuando un
// cambio de estado rearma la lista se reutiliza la MISMA imagen (sin volver a pedirla ni a mostrar «Cargando...») y un canal sin
// captura no se reintenta en cada repintado.
const _capturasProduccion = new Map();          // `grabador#canal` -> { img } | { fallo: instante }
const CAPTURA_FALLO_MS = 60e3;
const colaCapturasProduccion = uiColaImagenes({
    alCargar: (img) => {
        const caja = img.closest('.canal-item-captura');
        if (!caja) return;
        caja.classList.remove('canal-item-captura-cargando');
        caja.querySelector('.canal-item-captura-vacia')?.remove();        // el aviso «Cargando...» ya no va
    },
    alFallar: (img) => {
        _capturasProduccion.set(img.dataset.clave, { fallo: Date.now() });
        const caja = img.closest('.canal-item-captura');
        if (!caja) return;
        caja.classList.remove('canal-item-captura-cargando');
        caja.replaceChildren(produccionCapturaVacia('Sin captura', 'bi bi-camera-video-off'));
    },
});
// «Actualizar capturas» terminó: lo recordado ya no vale (y la dirección lleva una marca nueva, ver uiRutaCaptura)
window.olvidarCapturasProduccion = () => {
    _capturasProduccion.clear();
    uiCapturasActualizadas();
    _produccionFirmaPintada = null;                      // sin cambios en los datos no se repinta: acá sí, para pedirlas de nuevo
    if (modoVistaProduccion === 'snapshot' && typeof ejecutarFiltro === 'function') ejecutarFiltro(terminoBusquedaActual());
};

function produccionCapturaVacia(texto, icono) {
    const v = uiNodo('div', 'canal-item-captura-vacia');
    v.append(uiNodo('i', `${icono} fs-3`), uiNodo('span', 'small', texto));
    return v;
}

// El recuadro de la captura de una tarjeta de la vista snapshot: la captura del canal (cámara), la foto del modelo (otro
// dispositivo) o un aviso (canal libre, sin captura)
function produccionCaptura(it) {
    const caja = uiNodo('div', 'canal-item-captura');
    const ruta = it.tipo === 'camara' ? uiRutaCaptura(it.nvrIp, it.canalId) : null;
    const clave = `${it.nvrIp}#${it.canalId}`;
    const previa = ruta ? _capturasProduccion.get(clave) : null;
    if (previa && previa.img) {
        if (!(previa.img.complete && previa.img.naturalWidth > 0)) {      // todavía en camino: se mantiene en cola, solo cambia de caja
            caja.classList.add('canal-item-captura-cargando');
            caja.appendChild(produccionCapturaVacia('Cargando captura...', 'bi bi-camera-video'));
        }
        caja.appendChild(previa.img);                                   // la misma imagen: no se pide otra vez
    } else if (previa && Date.now() - previa.fallo < CAPTURA_FALLO_MS) {
        caja.appendChild(produccionCapturaVacia('Sin captura', 'bi bi-camera-video-off'));
    } else if (ruta) {
        const img = uiNodo('img', 'canal-item-captura-img');
        img.alt = '';
        img.decoding = 'async';
        img.dataset.captura = ruta;
        img.dataset.clave = clave;
        caja.classList.add('canal-item-captura-cargando');
        caja.append(produccionCapturaVacia('Cargando captura...', 'bi bi-camera-video'), img);     // el aviso hasta que llega (o falla)
        _capturasProduccion.set(clave, { img });                          // desde ya: un repintado no la vuelve a pedir
        colaCapturasProduccion.observar(img);
    } else if (it.tipo === 'otro' && it.imagen) {
        const img = uiNodo('img', 'canal-item-captura-img canal-item-captura-modelo');
        img.src = it.imagen;
        img.alt = it.modelo || 'Dispositivo';
        img.loading = 'lazy';
        caja.appendChild(img);
    } else {
        caja.appendChild(it.tipo === 'otro' ? uiNodo('i', `${it.icono} fs-1 text-secondary opacity-50`)
            : produccionCapturaVacia(it.tipo === 'libre' ? 'Canal libre' : 'Sin captura', 'bi bi-camera-video-off'));
    }
    return caja;
}

// Vista snapshot: la tarjeta se arma en columna y queda cuadrada: arriba el canal, el estado y la IP (la cabecera de siempre),
// en el medio la captura y abajo la descripción del dispositivo (`nombre`, que en las otras vistas va junto al canal)
function produccionEnSnapshot(el, izq, der, it, nombre) {
    el.classList.add('canal-item-snapshot');
    const cabecera = uiNodo('div', 'canal-item-cabecera');
    cabecera.append(izq, der);
    const pie = uiNodo('div', 'canal-item-pie');
    pie.appendChild(nombre);
    el.append(cabecera, produccionCaptura(it), pie);
}

// `lista`: vista de lista segmentada en columnas (canal, descripción, IP, edificio/piso, rack/puerto, estado).
// `snapshot`: la tarjeta de siempre con la captura debajo, cuadrada.
function produccionItem(it, lista = false, snapshot = false) {
    const el = uiNodo('div', 'canal-item');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    const izq = uiNodo('div', 'canal-item-left');
    const der = uiNodo('div', 'canal-item-right');
    const estado = uiNodo('div', 'canal-item-estado');
    const e = produccionEstado(it);
    if (e) estado.appendChild(e);
    der.appendChild(estado);

    if (it.tipo === 'libre') {
        el.classList.add('canal-item-disponible');
        Object.assign(el.dataset, { stockAlta: '1', channelId: it.canalId, nvrIp: it.nvrIp, nvrName: it.nvrNombre });
        const chBadge = uiNodo('span',
            'badge rounded-pill bg-secondary-subtle text-secondary border border-secondary-subtle '
            + 'canal-ch-badge font-monospace', it.canal);
        if (lista) {
            const colCh = uiNodo('div', 'canal-col-ch');
            colCh.appendChild(chBadge);
            const colDesc = uiNodo('div', 'canal-col-desc');
            colDesc.appendChild(uiNodo('span', 'canal-item-nombre text-muted small', 'Libre'));
            const colIp = uiNodo('div', 'canal-col-ip canal-item-ip small text-muted font-monospace', '—');
            const colUbic = uiNodo('div', 'canal-col-ubic canal-item-lugar small text-muted font-monospace', '—');
            const colRack = uiNodo('div', 'canal-col-rack small text-muted font-monospace', '—');
            estado.classList.add('canal-col-estado');
            el.append(colCh, colDesc, colIp, colUbic, colRack, estado);
            return el;
        }
        const nombreLibre = uiNodo('span', 'canal-item-nombre text-muted small', 'Libre');
        der.appendChild(uiNodo('div', 'canal-item-ip small text-muted font-monospace', '—'));
        if (snapshot) {
            izq.append(chBadge);
            produccionEnSnapshot(el, izq, der, it, nombreLibre);
        } else {
            izq.append(chBadge, nombreLibre);
            el.append(izq, der);
        }
        return el;
    }

    const rojo = it.tipo === 'otro' ? (it.averiado || it.red === 'offline') : it.offline;
    if (rojo) el.classList.add('canal-item-offline');
    const esOnlineSinRelevar = !it.offline && it.sinRelevar;
    if (esOnlineSinRelevar) el.classList.add('canal-item-sin-relevar');
    el.title = 'Doble clic para ver información del dispositivo';
    const nombre = it.tipo === 'camara' ? (it.nombre || '-') : it.nombre;
    const caja = uiNodo('span', 'canal-item-nombre');
    caja.title = it.ubicacion ? `${nombre} · ${it.ubicacion}` : nombre;
    const claseNombre = it.tipo === 'camara' && it.offline ? 'text-danger fw-medium' : 'fw-medium';
    caja.appendChild(uiNodo('span', claseNombre, nombre));
    const ubic = uiNodo('span', 'stock-ubicacion d-none');
    const ip = uiNodo('div', 'canal-item-ip small font-monospace');

    let firstColNode = null;
    if (it.tipo === 'otro') {
        Object.assign(el.dataset, { stockId: it.stockId, camIp: it.ip, camName: it.nombre, modelo: it.modelo,
            mac: it.mac, firmware: it.firmware, tipo: it.tipoDisp });
        const thumb = uiNodo('div', 'canal-item-thumb');
        if (it.imagen) {
            const img = uiNodo('img', 'canal-item-img');
            img.src = it.imagen;
            img.alt = it.modelo || 'Dispositivo';
            img.dataset.fallbackIcon = it.icono;
            thumb.appendChild(img);
        } else {
            thumb.appendChild(uiNodo('i', `${it.icono} text-secondary canal-item-fallback-icon opacity-50`));
        }
        ubic.dataset.stockUbicacion = it.stockId;
        ubic.textContent = it.ubicacion || 'En producción';
        firstColNode = thumb;
        ip.classList.add('copy-cell');
        if (it.ip) {
            const clasesIp = it.averiado || it.red === 'offline'
                ? ['text-danger', 'opacity-75'] : ['text-secondary'];
            ip.classList.add(...clasesIp);
            ip.dataset.copy = it.ip;
            ip.title = 'Doble clic para copiar IP';
        } else {
            ip.classList.add('text-muted', 'opacity-50');
        }
        ip.textContent = it.ip || '—';
    } else {
        Object.assign(el.dataset, { camIp: it.ip, nvrIp: it.nvrIp, channelId: it.canalId, camName: it.nombre,
            nvrName: it.nvrNombre, mac: it.mac, modelo: it.modelo, firmware: it.firmware });
        const colorCanal = it.offline ? 'bg-danger'
            : (it.sinSenal ? 'bg-secondary'
                : (it.sinGrabacion ? 'bg-warning'
                    : (it.multiGrabador ? 'canal-ch-badge-multi' : 'bg-primary')));
        if (it.stockId) ubic.dataset.stockUbicacion = it.stockId; else ubic.dataset.stockAlta = '1';
        ubic.textContent = it.ubicacion || 'Sin alta en stock';
        const chBadge = uiNodo('span', `badge rounded-pill ${colorCanal} canal-ch-badge font-monospace`, it.canal);
        if (it.sinSenal) {
            chBadge.title = 'Sin señal: el último escaneo no encontró la cámara en este canal';
        } else if (it.multiGrabador) {
            chBadge.title = 'Cámara asignada a varios grabadores';
            el.dataset.multiGrabador = '1';
        }
        firstColNode = chBadge;
        const ipInformada = uiValorInformado(it.ip);
        if (ipInformada) {
            ip.classList.add('copy-cell');
            ip.dataset.copy = ipInformada;
        }
        ip.classList.add(...(it.offline ? ['text-danger', 'opacity-75']
            : (it.sinSenal ? ['text-secondary', 'opacity-75'] : [it.sinRelevar ? 'text-info' : 'text-secondary'])));
        if (it.sinRelevar) {                       // en línea o caída: la marca pide un escaneo, no oculta el estado
            ip.classList.remove('font-monospace');
            ip.classList.add('fw-semibold');
            ip.title = `Cámara sin relevar en el inventario. ${uiTextoSinRelevar(it.sinRelevarMotivo)}`;
            ip.textContent = ipInformada ? `${ipInformada} · Sin relevar` : 'Sin relevar';
        } else {
            ip.title = 'Doble clic para copiar IP';
            ip.textContent = it.ip;
        }
    }

    if (lista) {
        const colCh = uiNodo('div', 'canal-col-ch');
        colCh.appendChild(firstColNode);
        const colDesc = uiNodo('div', 'canal-col-desc');
        colDesc.appendChild(caja);
        ip.classList.add('canal-col-ip');
        const colUbic = uiNodo('div', 'canal-col-ubic canal-item-lugar small text-muted text-truncate',
            it.lugar || '—');
        if (it.ubicacion || it.lugar) colUbic.title = it.ubicacion || it.lugar;
        const colRack = uiNodo('div', 'canal-col-rack small text-muted font-monospace text-truncate',
            it.rackPuerto || '—');
        if (it.rackPuerto) colRack.title = it.rackPuerto;
        estado.classList.add('canal-col-estado');
        el.append(colCh, colDesc, ip, colUbic, colRack, estado, ubic);
    } else {
        der.appendChild(ip);
        if (snapshot) {
            izq.append(firstColNode, ubic);
            produccionEnSnapshot(el, izq, der, it, caja);
        } else {
            izq.append(firstColNode, caja, ubic);
            el.classList.add('canal-item-dos-lineas'); el.append(izq, der);   // móvil: canal e IP arriba, descripción abajo
        }
    }

    // Para el modo selección (produccion-seleccion.js): un dispositivo del stock es UNO aunque esté en dos grabadores
    el.dataset.selStock = it.stockId || '';
    el.dataset.selClave = it.stockId ? `s:${it.stockId}` : `c:${it.nvrIp}:${it.canalId}`;
    return el;
}

function sincronizarAlturasStickyProduccion() {
    if (typeof document === 'undefined') return;
    const header = document.querySelector('#produccion-accordion .accordion-header');
    if (header && header.offsetHeight > 0) {
        document.documentElement.style.setProperty('--produccion-header-height', `${header.offsetHeight}px`);
    }
}
window.addEventListener('resize', sincronizarAlturasStickyProduccion, { passive: true });

function restaurarSeleccionProduccion(accordion) {
    if (!accordion || !_dispositivoSeleccionado || _dispositivoSeleccionado.panel !== 'produccion') return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const itemAnterior = _dispositivoSeleccionado;
    let selector = '';
    if (itemAnterior.stockId) {
        selector = `.canal-item[data-stock-id="${CSS.escape(itemAnterior.stockId)}"]`;
    } else if (itemAnterior.channelId && itemAnterior.nvrIp) {
        selector = `.canal-item[data-channel-id="${CSS.escape(itemAnterior.channelId)}"][data-nvr-ip="${CSS.escape(itemAnterior.nvrIp)}"]`;
    } else if (itemAnterior.camIp) {
        selector = `.canal-item[data-cam-ip="${CSS.escape(itemAnterior.camIp)}"]`;
    } else if (itemAnterior.camName) {
        selector = `.canal-item[data-cam-name="${CSS.escape(itemAnterior.camName)}"]`;
    }
    if (selector) {
        uiEnfocarSinScroll(accordion.querySelector(selector));
    }
}

// Fallback de imagen para miniaturas de dispositivos en producción (captura para evitar onerror inline)
window.addEventListener('error', (e) => {
    const target = e.target;
    if (target instanceof Element && target.classList.contains('canal-item-img')) {
        const parent = target.parentElement;
        if (parent) {
            const iconClase = target.dataset.fallbackIcon || 'bi bi-camera-video';
            parent.replaceChildren(uiNodo('i', `${iconClase} text-secondary canal-item-fallback-icon opacity-50`));
        }
    }
}, true);

// Atajo «Canales en uso» de la tarjeta CÁMARAS (Auditoría > Grabador): lleva a la pestaña Cámaras con ese grabador.
// Delegado en document (las tarjetas se redibujan); también por teclado, porque es un <div role="button">.
function initAtajoCamarasDeNvr() {
    const ir = (t) => irACamarasDeNvr(t.dataset.nvrName || '', t.dataset.nvrIp || '');
    document.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target.closest('.camaras-nvr-trigger') : null;
        if (t) ir(t);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target instanceof Element ? e.target.closest('.camaras-nvr-trigger') : null;
        if (!t) return;
        e.preventDefault();
        ir(t);
    });
}

// Navega a la pestaña de Activos (Stock) y filtra inmediatamente por el término indicado.
function irAActivosConBusqueda(termino) {
    const input = document.getElementById('global-search');
    if (input) {
        input.value = termino || '';
    }
    irAPestana('v-pills-stock-tab');
    ejecutarFiltro(termino || '');
}
window.irAActivosConBusqueda = irAActivosConBusqueda;

// Modal de detalle de un dispositivo: delega al modal unificado de datos (static/stock.js)
function abrirModalDetalleProduccion(item) {
    if (!item) return;
    if (typeof window.abrirModalDispositivo === 'function') {
        window.abrirModalDispositivo(item, 'lectura');
    }
}

// Modal de captura/snapshot ampliada (y su «Ver en vivo»: static/video-vivo.js)
// `opciones.rutaModelo`: la foto del modelo (otra vista del mismo modal); `opciones.vista`: con cuál empieza ('captura' o 'modelo').
function abrirModalSnapshot(cam, rutaSnapshot, chNum = '', opciones = {}) {
    const rutaModelo = opciones.rutaModelo || '';
    if (!cam || (!rutaSnapshot && !rutaModelo)) return;
    const modalEl = document.getElementById('snapshotModal');
    if (!modalEl) return;

    const chBadge = document.getElementById('snapshot-modal-ch');
    const nombreEl = document.getElementById('snapshot-modal-nombre');
    const imgEl = document.getElementById('snapshot-modal-img');
    const infoEl = document.getElementById('snapshot-modal-info');
    if (typeof window.detenerVideoVivo === 'function') window.detenerVideoVivo();   // otra cámara: sin video previo

    const canalStr = uiNumeroCanal(chNum || cam.channel_id);
    modalEl.dataset.nvr = cam.nvr_ip || '';             // lo que pide «Ver en vivo» (nunca la IP de la cámara)
    modalEl.dataset.canal = canalStr;
    if (chBadge) {
        chBadge.textContent = canalStr ? `CH ${canalStr}` : 'CH';
    }
    if (nombreEl) {
        nombreEl.textContent = cam.camera_name || 'Cámara';
        nombreEl.title = cam.camera_name || '';
    }
    if (imgEl) {
        const vista = (opciones.vista === 'modelo' && rutaModelo) || !rutaSnapshot ? 'modelo' : 'captura';
        const inicial = vista === 'modelo' ? rutaModelo : rutaSnapshot;
        imgEl.src = inicial;
        imgEl.dataset.captura = rutaSnapshot || '';       // las vistas fijas del modal (video-vivo.js alterna entre ellas)
        imgEl.dataset.modelo = rutaModelo;
        imgEl.dataset.reposo = inicial;                   // a la que vuelve al detener el video en vivo
        modalEl.dataset.vista = vista;
        imgEl.alt = cam.camera_name || (canalStr ? `Canal ${canalStr}` : 'Captura');
    }
    if (infoEl) infoEl.textContent = '';                // el pie queda para los avisos del video en vivo

    modalEl.dispatchEvent(new CustomEvent('snapshot:vista'));
    if (typeof window.UI !== 'undefined' && window.UI.modal) {
        window.UI.modal.abrir(modalEl);
    }
}
window.abrirModalSnapshot = abrirModalSnapshot;


// ==== IMAGENES DISPOSITIVOS PURO BEGIN ====
const IMAGENES_DISPOSITIVOS = [
    'DH-IPC-HDPW1230R1P-0280B-S5', 'DS-1200KL', 'DS-2CD1323G0E-I', 'DS-2CD2012-I',
    'DS-2CD2020-I', 'DS-2CD2020F-IW', 'DS-2CD2023G0-I', 'DS-2CD2112-I',
    'DS-2CD2123G0-I', 'DS-2CD2625FHWD-IZS', 'DS-2CD2625FWD-IZS', 'DS-2CD2721G0-IS',
    'DS-2CD2746G2T-IZS', 'DS-2CD7133-E', 'DS-2CD7153-E', 'DS-2CD7164-E',
    'DS-2DE5220I-AENS', 'DS-2DE5225IW-AE', 'DS-2DE5430W-AE', 'DS-2DF6A236X-AEL',
    'DS-2DF6A436X-AEL', 'DS-6916UDI', 'DS-7104NI-Q14PM', 'DS-7216HVI-SVST',
    'DS-7604', 'DS-7616NI-K2', 'DS-7616NI-SEP', 'DS-9516NI-S',
    'DS-96128NI-I16', 'DS-9632NI-ST', 'DS-9664NI-I16', 'DS-D2046TL-2B',
    'DS-IX2002-A3U-X', 'DS-IX2002-A3UX', 'NBN-921-14IP', 'SDC-415PA'
];

function buscarImagenDispositivo(modelo) {
    if (!modelo || typeof modelo !== 'string') return null;
    const norm = modelo.trim();
    if (!norm || norm === '-' || norm === 'N/A') return null;
    const normUpper = norm.toUpperCase();

    // 1. Coincidencia exacta (case insensitive)
    const exacto = IMAGENES_DISPOSITIVOS.find(img => img.toUpperCase() === normUpper);
    if (exacto) return `img/devices/${encodeURIComponent(exacto)}.png`;

    // 2. Coincidencia normalizando barras (/ y \) a guión medio (-)
    // En Windows y Linux no se permite el caracter '/', por lo que los archivos se guardan con '-' o sin él.
    const normConGuiones = normUpper.replace(/[\/\\]+/g, '-');
    const conGuiones = IMAGENES_DISPOSITIVOS.find(img => img.toUpperCase() === normConGuiones);
    if (conGuiones) return `img/devices/${encodeURIComponent(conGuiones)}.png`;

    // 3. Coincidencia omitiendo barras (ej: DS-IX2002-A3U/X -> DS-IX2002-A3UX)
    const normSinBarras = normUpper.replace(/[\/\\]+/g, '');
    const sinBarras = IMAGENES_DISPOSITIVOS.find(img => img.toUpperCase() === normSinBarras);
    if (sinBarras) return `img/devices/${encodeURIComponent(sinBarras)}.png`;

    // 4. Coincidencia alfanumérica exacta (ignorando guiones, barras, espacios)
    const clean = s => s.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const normClean = clean(normUpper);
    if (normClean.length > 0) {
        const alfanum = IMAGENES_DISPOSITIVOS.find(img => clean(img) === normClean);
        if (alfanum) return `img/devices/${encodeURIComponent(alfanum)}.png`;
    }

    // 5. Modelo empieza con el nombre del archivo o viceversa
    const prefijo = IMAGENES_DISPOSITIVOS.find(img => {
        const u = img.toUpperCase();
        return normUpper.startsWith(u) || u.startsWith(normUpper) ||
               normConGuiones.startsWith(u) || u.startsWith(normConGuiones);
    });
    if (prefijo) return `img/devices/${encodeURIComponent(prefijo)}.png`;

    // 6. Prefijo alfanumérico
    if (normClean.length >= 4) {
        const prefijoAlfanum = IMAGENES_DISPOSITIVOS.find(img => {
            const cImg = clean(img);
            return (cImg.length >= 4) && (normClean.startsWith(cImg) || cImg.startsWith(normClean));
        });
        if (prefijoAlfanum) return `img/devices/${encodeURIComponent(prefijoAlfanum)}.png`;
    }

    // 7. Fallback directo al modelo saneando caracteres no permitidos en sistemas de archivos
    const nombreSaneado = norm.replace(/[\/\\]+/g, '-');
    return `img/devices/${encodeURIComponent(nombreSaneado)}.png`;
}
// ==== IMAGENES DISPOSITIVOS PURO END ====

let _canalPopupActivo = null;
let _popupDispositivoToken = 0;
let _onWheelPopupImagen = null;

let _etiquetasPopup = null;           // etiquetas flotantes de los atajos de ícono del popup (se arman la primera vez)

function ocultarPopupProduccion() {
    const popupEl = document.getElementById('popup-dispositivo-produccion');
    if (_etiquetasPopup) _etiquetasPopup.ocultar();
    if (popupEl) {
        popupEl.classList.add('d-none');
        popupEl.style.animation = '';
        delete popupEl.dataset.abierto;
        delete popupEl.dataset.ladoV;
        delete popupEl.dataset.ladoH;
        popupEl.querySelectorAll('.popup-disp-img-ghost').forEach(el => el.remove());
        const img = popupEl.querySelector('#popup-disp-img');
        if (img) img.classList.remove('popup-disp-slide-in-right', 'popup-disp-slide-in-left');
        const ph = popupEl.querySelector('#popup-disp-placeholder');
        if (ph) ph.classList.remove('popup-disp-slide-in-right', 'popup-disp-slide-in-left');
    }
    _canalPopupActivo = null;
    _onWheelPopupImagen = null;
}
window.ocultarPopupProduccion = ocultarPopupProduccion;

function posicionarPopupProduccion(popupEl, triggerEl, coords = null) {
    if (!popupEl) return null;

    let refPoint = null;
    if (coords && typeof coords.x === 'number' && typeof coords.y === 'number' && (coords.x > 0 || coords.y > 0)) {
        refPoint = { x: coords.x, y: coords.y };
    } else if (triggerEl && typeof triggerEl.getBoundingClientRect === 'function') {
        const rect = triggerEl.getBoundingClientRect();
        refPoint = {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.bottom)
        };
    }

    const popupDim = {
        width: popupEl.offsetWidth || 270,
        height: popupEl.offsetHeight || 300
    };
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
    };

    const yaAbierto = popupEl.dataset.abierto === '1';
    const options = {};
    if (yaAbierto) {
        if (popupEl.dataset.ladoV) options.ladoV = popupEl.dataset.ladoV;
        if (popupEl.dataset.ladoH) options.ladoH = popupEl.dataset.ladoH;
    }

    const pos = calcularPosicionPopup(refPoint, popupDim, viewport, options);

    if (!yaAbierto && pos) {
        popupEl.dataset.abierto = '1';
        popupEl.dataset.ladoV = pos.ladoV;
        popupEl.dataset.ladoH = pos.ladoH;
    }

    popupEl.style.left = `${pos.left}px`;
    popupEl.style.top = `${pos.top}px`;
    popupEl.style.transformOrigin = pos.transformOrigin;

    return pos;
}

// ==== POPUP DISPOSITIVO PURO BEGIN ====
// URL de la página web de un equipo: SOLO una IPv4 literal (nunca un nombre: no se resuelve nada ni se arma una URL con
// texto del equipo). null si no hay IP válida.
function urlPaginaEquipo(ip) {
    const t = String(ip ?? '').trim();
    const octeto = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
    return new RegExp(`^${octeto}(\\.${octeto}){3}$`).test(t) ? `http://${t}/` : null;
}

// Qué acciones ofrece el popup de un equipo (Producción y Activos). `info`: { enProduccion, nvrIp, canal, esGrabador, ip }
//   * Auditoría: en producción y vinculado al escaneo (una cámara con grabador y canal -> Auditoría > Cámara; un
//     grabador -> Auditoría > Grabador);
//   * Ir a la página: en producción y con una IPv4 válida.
//   * Ver caídas: lo mismo que Auditoría (lo que el monitor observa: una cámara por grabador + canal, o un grabador) y,
//     además, un equipo de red (`equipoRed`: decoder, analítica; su historial va por su IP y no tiene Auditoría).
// («Ir al grabador» se quitó del popup: a pedido del usuario.)
function popupAcciones(info) {
    const i = info || {};
    const camara = !!(i.nvrIp && i.canal);
    const monitoreado = !!i.enProduccion && (camara || (!!i.esGrabador && !!i.nvrIp));
    return {
        auditoria: monitoreado,
        auditoriaCamara: camara,
        caidas: monitoreado || (!!i.enProduccion && !!i.equipoRed),
        pagina: !!i.enProduccion && urlPaginaEquipo(i.ip) !== null
    };
}

// El equipo de red (`equipos_red` de /api/v2/datos) que es este dispositivo del popup, o null: sin grabador ni canal y con la
// misma IP (las de equipos_red nunca son de un grabador ni de una cámara).
function equipoRedDelPopup(cam, equipos) {
    const c = cam || {};
    const ip = typeof c.ip_address === 'string' ? c.ip_address.trim() : '';
    if (!ip || c.nvr_ip || (c.channel_id !== null && c.channel_id !== undefined && c.channel_id !== '')) return null;
    return (Array.isArray(equipos) ? equipos : []).find(e => e && typeof e.ip === 'string' && e.ip.trim() === ip) || null;
}
// ==== POPUP DISPOSITIVO PURO END ====

// Muestra un panel del popup (acciones o búsqueda) con desvanecimiento sutil
function mostrarPanelPopup(panelVisible, panelOculto) {
    panelOculto.classList.add('d-none');
    panelVisible.classList.remove('d-none');
    panelVisible.style.animation = 'none';
    if (typeof panelVisible.animate === 'function' && !prefiereMovimientoReducido()) {
        panelVisible.animate([
            { opacity: 0 },
            { opacity: 1 }
        ], {
            duration: 160,
            easing: 'ease-out'
        });
    }
    const primerBoton = panelVisible.querySelector('button:not(.d-none):not([disabled])');
    if (primerBoton) {
        primerBoton.focus();
    }
}

// Busca en todas las pestañas por un dato del equipo (nombre, modelo o firmware), como el antiguo menú contextual
function buscarDatoDeEquipo(campo, valor) {
    const v = String(valor || '').trim();
    if (!v || v === '-' || v === 'N/A') {
        mostrarToast('Dato no disponible para buscar.', 'info');
        return;
    }
    busqCamposActivos = new Set([campo]);
    currentSearchField = campo;
    actualizarUIFiltroBusqueda();
    if (searchInput) {
        searchInput.value = v;
        searchInput.classList.add('search-active');
        const container = searchInput.closest('.search-container');
        if (container) container.classList.add('search-active');
    }
    ejecutarFiltro(v.toLowerCase(), { autoCambiarPestana: true, animar: true });
}

// Popup de un equipo, el MISMO en Producción (canales) y en Activos (stock). `cam`: forma de una cámara de
// /api/v2/datos (camera_name, ip_address, nvr_ip, channel_id, modelo, firmware...). Opciones:
//   enProduccion (por defecto true: un canal en producción), esGrabador (Auditoría = Auditoría > Grabador),
//   verDatos (callback de «Ver datos»; por defecto el modal de datos del dispositivo).
//   seleccionar (callback de «Seleccionar»: el modo selección de Activos; sin él, el botón no se ofrece).
function abrirPopupDispositivo(cam, triggerEl, coords = null, opciones = {}) {
    if (!cam) return;
    const popupEl = document.getElementById('popup-dispositivo-produccion');
    if (!popupEl) return;
    if (!_etiquetasPopup) {
        // Con solo un atajo a la vista ya lleva su texto: ahí la etiqueta sobra
        _etiquetasPopup = uiEtiquetasDeIconos(popupEl, '#popup-disp-iconos [data-etiqueta]',
            (el) => !el.closest('.popup-disp-iconos-solo'));
    }

    if (_canalPopupActivo === triggerEl && !popupEl.classList.contains('d-none')) {
        ocultarPopupProduccion();
        return;
    }
    delete popupEl.dataset.abierto;
    delete popupEl.dataset.ladoV;
    delete popupEl.dataset.ladoH;
    _canalPopupActivo = triggerEl;

    const nombreEl = document.getElementById('popup-disp-nombre');
    const imgEl = document.getElementById('popup-disp-img');
    const placeholderEl = document.getElementById('popup-disp-placeholder');
    const btnImgPrev = document.getElementById('popup-disp-img-prev');
    const btnImgNext = document.getElementById('popup-disp-img-next');
    const modeloEl = document.getElementById('popup-disp-modelo');
    const panelAcciones = document.getElementById('popup-disp-acciones');
    const panelBuscar = document.getElementById('popup-disp-buscar');
    const btnPagina = document.getElementById('popup-disp-btn-pagina');
    const btnBuscar = document.getElementById('popup-disp-btn-buscar');
    const btnVolver = document.getElementById('popup-disp-btn-volver');
    const btnDatos = document.getElementById('popup-disp-btn-datos');
    const btnCerrar = document.getElementById('popup-disp-cerrar');
    const { enProduccion = true, esGrabador = false, verDatos = null, seleccionar = null } = opciones;

    if (btnCerrar) {
        btnCerrar.onclick = (e) => {
            e.stopPropagation();
            const trigger = _canalPopupActivo;
            ocultarPopupProduccion();
            if (trigger) {
                enfocarItemResultado(trigger);
            }
        };
    }

    const chNum = uiNumeroCanal(cam.channel_id);

    if (nombreEl) {
        // Sin la insignia del canal (le quitaba lugar a la descripción): el canal y los avisos van en el title
        const nombre = cam.camera_name || 'Dispositivo';
        const multi = Boolean(opciones.multiGrabador || (triggerEl && triggerEl.dataset && triggerEl.dataset.multiGrabador === '1'));
        const notas = [chNum ? `CH ${chNum}` : '', cam.is_offline && cam.sin_senal ? 'Sin señal: el último escaneo no encontró la cámara en este canal' : '',
            multi ? 'Cámara asignada a varios grabadores' : ''].filter(Boolean);
        nombreEl.textContent = nombre;
        nombreEl.title = notas.length ? `${nombre} (${notas.join(' · ')})` : nombre;
    }

    const modelo = cam.modelo || cam.stock?.modelo || '';
    if (modeloEl) {
        modeloEl.textContent = modelo || 'Modelo no especificado';
        modeloEl.title = modelo || '';
    }

// Imagen del dispositivo: foto del modelo y, si hay, la captura del canal (uiCarruselImagen, el mismo del modal del
    // activo); clic en la captura = modal ampliado con «Ver en vivo»; la rueda del mouse alterna las dos vistas
    const tokenActual = ++_popupDispositivoToken;
    const rutaSnapshot = uiRutaCaptura(cam.nvr_ip, chNum);
    const carrusel = uiCarruselImagen({
        wrapper: popupEl.querySelector('#popup-disp-img-wrapper'), img: imgEl, placeholder: placeholderEl,
        prev: btnImgPrev, next: btnImgNext, rutaModelo: buscarImagenDispositivo(modelo), rutaSnapshot,
        vigente: () => _popupDispositivoToken === tokenActual,
        alAmpliar: (vista, hayCaptura) => {
            ocultarPopupProduccion();
            abrirModalSnapshot(cam, hayCaptura ? rutaSnapshot : '', chNum, { rutaModelo: buscarImagenDispositivo(modelo), vista });
        },
    });

    // Alternar modelo y captura mediante scroll (rueda del mouse) sobre la imagen sin desplazar la página
    let ultimoScrollToggle = 0;
    _onWheelPopupImagen = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ahora = Date.now();
        if (ahora - ultimoScrollToggle < 200) return;
        ultimoScrollToggle = ahora;
        carrusel.alternar();
    };

    // Cada apertura empieza en las acciones (no en la búsqueda que quedó de otro equipo)
    if (panelAcciones && panelBuscar) {
        panelBuscar.classList.add('d-none');
        panelAcciones.classList.remove('d-none');
        panelAcciones.style.animation = '';
    }

    const equipoRed = equipoRedDelPopup(cam, uiDatosCargados('equipos_red'));
    const acciones = popupAcciones({ enProduccion, esGrabador, nvrIp: cam.nvr_ip, canal: cam.channel_id,
        ip: cam.ip_address, equipoRed: !!equipoRed });
    // `navega`: la acción lleva a otra sección: si el popup se abrió dentro de un modal, ese modal se cierra; «Ver datos» y
    // «Ir a la página» no (el primero abre su modal encima, el segundo es otra pestaña del navegador)
    const accion = (boton, visible, hacer, navega = false) => {
        if (!boton) return;
        boton.classList.toggle('d-none', !visible);
        boton.onclick = visible ? (e) => {
            e.stopPropagation();
            ocultarPopupProduccion();
            if (navega) UI.modal.cerrarTodos();
            hacer();
        } : null;
    };
    accion(btnPagina, acciones.pagina, () => {
        const url = urlPaginaEquipo(cam.ip_address);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    accion(btnDatos, true, () => (typeof verDatos === 'function' ? verDatos() : abrirModalDetalleProduccion(cam)));
    accion(document.getElementById('popup-disp-btn-seleccionar'), typeof seleccionar === 'function', () => seleccionar(), true);
    // La estrella de favoritos (favoritos.js): solo para un equipo que el sistema monitorea; no cierra el popup
    if (typeof window.favoritosConfigurarBoton === 'function') {
        window.favoritosConfigurarBoton(document.getElementById('popup-disp-btn-favorito'), cam, esGrabador);
    }
    // Los atajos de ícono (Auditoría, disponibilidad, Buscar) llevan su texto si es el único que queda a la vista
    const filaIconos = document.getElementById('popup-disp-iconos');
    if (filaIconos) {
        const aLaVista = [...filaIconos.children].filter(b => !b.classList.contains('d-none')).length;
        filaIconos.classList.toggle('popup-disp-iconos-solo', aLaVista === 1);
    }

    if (btnBuscar && btnVolver && panelAcciones && panelBuscar) {
        const transicionarPanelesPopup = (mostrar, ocultar) => {
            const prevRect = popupEl.getBoundingClientRect();
            const prevHeight = prevRect.height;
            const prevTop = parseFloat(popupEl.style.top) || prevRect.top;

            mostrarPanelPopup(mostrar, ocultar);
            const pos = posicionarPopupProduccion(popupEl, triggerEl, coords);

            const newRect = popupEl.getBoundingClientRect();
            const newHeight = newRect.height;
            const newTop = pos ? pos.top : (parseFloat(popupEl.style.top) || newRect.top);

            if (typeof popupEl.animate === 'function' && !prefiereMovimientoReducido()) {
                if (Math.abs(prevHeight - newHeight) > 1 || Math.abs(prevTop - newTop) > 1) {
                    popupEl.animate([
                        { height: `${prevHeight}px`, top: `${prevTop}px` },
                        { height: `${newHeight}px`, top: `${newTop}px` }
                    ], {
                        duration: 200,
                        easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
                    });
                }
            }
        };

        btnBuscar.onclick = (e) => {
            e.stopPropagation();
            transicionarPanelesPopup(panelBuscar, panelAcciones);
        };
        btnVolver.onclick = (e) => {
            e.stopPropagation();
            transicionarPanelesPopup(panelAcciones, panelBuscar);
        };
        const valores = new Map([['nombre', cam.camera_name], ['modelo', modelo], ['firmware', cam.firmware]]);
        for (const b of panelBuscar.querySelectorAll('[data-popup-buscar]')) {
            const campo = b.dataset.popupBuscar;
            b.onclick = (e) => {
                e.stopPropagation();
                ocultarPopupProduccion();
                UI.modal.cerrarTodos();                       // la búsqueda lleva a Activos: no queda un modal tapándola
                buscarDatoDeEquipo(campo, valores.get(campo));
            };
        }
    }

    popupEl.classList.remove('d-none');
    const pos = posicionarPopupProduccion(popupEl, triggerEl, coords);

    // Reiniciar y ejecutar animación de entrada suave (evita transiciones abruptas al alternar entre canales)
    const animName = (pos && pos.ladoV === 'top') ? 'dropdownPopupTopIn' : 'dropdownPopupIn';
    popupEl.style.animation = 'none';
    void popupEl.offsetHeight;
    // (el estilo en línea le gana a la regla de «Reducir movimiento»: con menos movimiento el popup aparece sin animar)
    if (!prefiereMovimientoReducido()) popupEl.style.animation = `${animName} var(--dur-pop-soft, 0.22s) var(--ease-pop) forwards`;

    // Mover el foco a la primera opción disponible del popup para permitir navegación inmediata con flechas
    const primerBoton = panelAcciones ? panelAcciones.querySelector('button:not(.d-none):not([disabled])') : null;
    if (primerBoton) {
        primerBoton.focus();
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (document.activeElement !== primerBoton && !popupEl.contains(document.activeElement)) {
                    primerBoton.focus();
                }
            });
        }
    }
}
window.abrirPopupDispositivo = abrirPopupDispositivo;

// Alt+Shift+V: pasa a la vista siguiente de Producción (lista, tarjetas, snapshot) con la pestaña a la vista y sin otro modal abierto
document.addEventListener('keydown', (ev) => {
    if (!uiEsAtajoAltShift(ev, 'v') || !document.getElementById('v-pills-produccion')?.classList.contains('active')) return;
    if (typeof UI !== 'undefined' && UI.modal.arriba()) return;
    let vista = produccionVistaSiguiente(modoVistaProduccion);
    if (vista === 'lista' && uiEsMovil()) vista = produccionVistaSiguiente(vista);     // en el celular no hay lista
    const siguiente = botonVistaProduccion(vista);
    if (!siguiente) return;
    ev.preventDefault();
    siguiente.click();
});

// Delegación de clic y doble clic sobre canales en producción para abrir el popup o el modal
function initDetalleProduccion() {
    function resolverCamara(itemEl) {
        if (!itemEl) return null;
        const stockId = itemEl.dataset.stockId;
        if (stockId) {
            const disp = (_cacheStockResumen?.dispositivos || []).find(x => x && x.id === stockId);
            if (disp) {
                return {
                    id: disp.id,
                    stock: { id: disp.id, modelo: disp.modelo, condicion: disp.condicion },
                    camera_name: stockNombreVisible(disp),
                    ip_address: disp.instalacion?.ip || '',
                    mac_address: disp.mac || '',
                    modelo: disp.modelo || '',
                    firmware: disp.firmware || '',
                    channel_id: null,
                    nvr_name: '',
                    nvr_ip: '',
                    tipo: disp.tipo,
                    is_offline: disp.condicion === 'averiado' || uiDatosCargados('equipos_red')
                        .some(e => e && e.stock && e.stock.id === disp.id && e.estado === 'offline')
                };
            }
        }
        const camIp = itemEl.dataset.camIp;
        const chId = itemEl.dataset.channelId;
        const nvrIp = itemEl.dataset.nvrIp;

        return uiCamarasCargadas().find(c =>
            String(c.ip_address || '').trim() === camIp &&
            String(c.channel_id ?? '').trim() === chId &&
            (!nvrIp || String(c.nvr_ip || '').trim() === nvrIp)
        ) || uiCamarasCargadas().find(c => String(c.ip_address || '').trim() === camIp) || {
            ip_address: itemEl.dataset.camIp,
            channel_id: itemEl.dataset.channelId,
            camera_name: itemEl.dataset.camName,
            nvr_name: itemEl.dataset.nvrName,
            nvr_ip: itemEl.dataset.nvrIp,
            mac_address: itemEl.dataset.mac,
            modelo: itemEl.dataset.modelo,
            firmware: itemEl.dataset.firmware,
            is_offline: itemEl.classList.contains('canal-item-offline')
        };
    }

    // Clic simple: abre el popup flotante con imagen y opciones (Ir al activo, Auditoría, Ver datos)
    document.addEventListener('click', (e) => {
        const popupEl = document.getElementById('popup-dispositivo-produccion');
        if (popupEl && popupEl.contains(e.target)) return;

        // Si fue sobre una celda copiable (IP), ignorar el popup para no interrumpir la selección/copia
        if (e.target instanceof Element && e.target.closest('.canal-item-ip, .copy-cell, .copy-ip')) {
            ocultarPopupProduccion();
            return;
        }

        // Un dispositivo de Activos, Alertas o Favoritos abre el mismo popup: este clic no lo cierra
        if (e.target instanceof Element && e.target.closest('#stock-accordion [data-stock-id], .alerta-card[role="button"], .favorito-tile, .disp-etiqueta-abrible')) return;

        const itemEl = e.target instanceof Element ? e.target.closest('.canal-item') : null;
        // sin equipo, o el clic terminó una selección de texto (para copiar): no se abre el popup
        if (!itemEl || itemEl.classList.contains('canal-item-disponible') || uiSeleccionTextoEn(itemEl)) {
            ocultarPopupProduccion();
            return;
        }

        const cam = resolverCamara(itemEl);
        if (cam) {
            abrirPopupDispositivo(cam, itemEl, { x: e.clientX, y: e.clientY }, {
                seleccionar: window.produccionSeleccion ? () => window.produccionSeleccion.entrar(itemEl.dataset.selClave) : null,
            });
        }
    });

    // Doble clic: abre el modal completo de datos directamente (como en activos)
    document.addEventListener('dblclick', (e) => {
        if (e.target instanceof Element && e.target.closest('.canal-item-ip, .copy-cell, .copy-ip')) {
            return;
        }

        const itemEl = e.target instanceof Element ? e.target.closest('.canal-item') : null;
        if (!itemEl || itemEl.classList.contains('canal-item-disponible')) return;

        ocultarPopupProduccion();
        const cam = resolverCamara(itemEl);
        if (cam) abrirModalDetalleProduccion(cam);
    });

    // Teclado (Enter o Espacio): abre el popup de producción
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const itemEl = e.target instanceof Element ? e.target.closest('.canal-item') : null;
        if (!itemEl || itemEl.classList.contains('canal-item-disponible')) return;
        e.preventDefault();
        const cam = resolverCamara(itemEl);
        if (cam) {
            abrirPopupDispositivo(cam, itemEl, null, {
                seleccionar: window.produccionSeleccion ? () => window.produccionSeleccion.entrar(itemEl.dataset.selClave) : null,
            });
        }
    });

    // Navegación con flechas y Escape dentro del popup de dispositivo
    const popupEl = document.getElementById('popup-dispositivo-produccion');
    if (popupEl) {
        popupEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                const trigger = _canalPopupActivo;
                ocultarPopupProduccion();
                if (trigger) {
                    enfocarItemResultado(trigger);
                }
                return;
            }

            if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                const panelActivo = popupEl.querySelector('.popup-disp-acciones:not(.d-none)');
                if (!panelActivo) return;
                const botones = Array.from(panelActivo.querySelectorAll('button:not(.d-none):not([disabled])'));
                if (!botones.length) return;

                e.preventDefault();
                e.stopPropagation();

                const idx = botones.indexOf(document.activeElement);

                if (e.key === 'Home') {
                    botones[0].focus();
                    return;
                }
                if (e.key === 'End') {
                    botones[botones.length - 1].focus();
                    return;
                }

                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    const sig = (idx === -1) ? 0 : (idx + 1) % botones.length;
                    botones[sig].focus();
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    const ant = (idx === -1) ? (botones.length - 1) : (idx - 1 + botones.length) % botones.length;
                    botones[ant].focus();
                }
            }
        });
    }

    // Interceptar scroll del mouse sobre la imagen para alternar modelo/captura sin cerrar el popup
    const wrapperImg = document.getElementById('popup-disp-img-wrapper')
        || (popupEl ? popupEl.querySelector('.popup-disp-img-wrapper') : null);
    if (wrapperImg) {
        wrapperImg.addEventListener('wheel', (e) => {
            if (typeof _onWheelPopupImagen === 'function') {
                _onWheelPopupImagen(e);
            }
        }, { passive: false });
    }

    // Al hacer scroll en la ventana, ocultar el popup flotante
    window.addEventListener('scroll', () => {
        ocultarPopupProduccion();
    }, { passive: true });
}

// ==== CAPACIDAD CANALES NVR PURO BEGIN ====
// Funciones puras (sin DOM): probadas en tests/js/capacidad_canales_nvr.test.mjs extrayendo este bloque.
// Canales de un grabador: los que dice el stock (`canales` del NVR/DVR, que /api/v2/datos trae como `total_camaras`).
// Sin dato, null (y se estima por el modelo con obtenerCapacidadCanalesNvr). Reemplaza a la capacidad que informaba el
// grabador en Auditoría > Grabador de cctv_monitor (acá no hay consultas a los equipos).
function capacidadConsultadaNvr(ip) {
    if (!ip) return null;
    const nvr = uiNvrsCargados().find(n => n && n.ip === ip);
    const n = nvr ? Number(nvr.total_camaras) : 0;
    return Number.isInteger(n) && n > 0 ? n : null;
}

function obtenerCapacidadCanalesNvr(modelo) {
    if (modelo && typeof modelo === 'object') {
        const directKeys = [
            'capacidad_canales', 'canales_capacidad', 'max_canales',
            'channel_capacity', 'max_channels', 'capacidad_total_canales'
        ];
        for (const k of directKeys) {
            const v = modelo[k];
            if (Number.isInteger(v) && v > 0) return v;
            if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
                const n = parseInt(v.trim(), 10);
                if (n > 0) return n;
            }
        }
        return obtenerCapacidadCanalesNvr(modelo.modelo);
    }

    if (typeof modelo === 'number' && Number.isFinite(modelo) && modelo > 0) {
        return Math.floor(modelo);
    }

    const mod = String(modelo || '').toUpperCase().trim();
    if (!mod || mod === 'N/A' || mod === '-' || mod === 'UNKNOWN') return null;

    // 1. Hikvision NVR/DVR: series 70-79, 80-89, 90-99 + canales (256/128/64/32/24/16/08/04) + letras/fin
    // Ej: DS-96128NI-I16 -> 128, DS-9664NI-I16 -> 64, DS-7616NI-K2 -> 16, DS-7104NI-Q1 -> 4, iDS-96256NXI -> 256
    const mHik = mod.match(/(?:DS|IDS)?[_-]?(?:7[0-9]|8[0-9]|9[0-9])(256|128|64|32|24|16|08|04)(?=[A-Z_\-\/]|$)/);
    if (mHik) return parseInt(mHik[1], 10);

    // 2. Dahua / UNV con separador guión: NVR616-128, NVR608-64, NVR308-64R, NVR301-04L
    const mDash = mod.match(/(?:NVR|XVR|DHI)?[_-]?[A-Z]*\d{3,4}[_-](256|128|64|32|24|16|08|04)(?=[A-Z_\-\/]|$)/);
    if (mDash) return parseInt(mDash[1], 10);

    // 3. Dahua 4 dígitos: DHI-NVR5216, XVR5108, NVR4104
    const mDah = mod.match(/(?:NVR|XVR|DHI)[_-]?[A-Z]*\d{2}(128|64|32|24|16|08|04)(?=[A-Z_\-\/]|$)/);
    if (mDah) return parseInt(mDah[1], 10);

    // 4. TVT u otros NVRs
    const mTvt = mod.match(/TD[_-]?[A-Z]*\d{2}(32|16|08|04)(?=[A-Z_\-\/]|$)/);
    if (mTvt) return parseInt(mTvt[1], 10);

    // 5. Genérico NVR-16, NVR-32, DVR-08, etc.
    const mGen = mod.match(/(?:NVR|DVR)[_-]?(\d{1,3})(?=[A-Z_\-\/]|$)/);
    if (mGen) {
        const val = parseInt(mGen[1], 10);
        const validos = [4, 8, 16, 24, 32, 64, 128, 256];
        if (validos.includes(val)) return val;
        const l2 = val % 100;
        if (validos.includes(l2)) return l2;
    }

    return null;
}

function calcularCanalesDisponibles(enUso, capacidad) {
    if (capacidad === null || capacidad === undefined) return null;
    if (enUso === null || enUso === undefined) return null;
    const c = Number(capacidad);
    const u = Number(enUso);
    if (!Number.isFinite(c) || !Number.isFinite(u) || c <= 0) return null;
    return Math.max(0, c - u);
}

function completarCanalesDisponibles(camarasConfiguradas, capacidad, nvrNombre = '', nvrIp = '') {
    if (!capacidad || capacidad <= 0 || !Array.isArray(camarasConfiguradas)) {
        return Array.isArray(camarasConfiguradas) ? [...camarasConfiguradas] : [];
    }
    const canalesOcupados = new Set();
    camarasConfiguradas.forEach(c => {
        const num = parseInt(String(c.channel_id).trim(), 10);
        if (Number.isFinite(num) && num > 0) {
            canalesOcupados.add(num);
        }
    });

    const maxCh = Math.max(capacidad, ...canalesOcupados);
    const disponibles = [];
    for (let ch = 1; ch <= maxCh; ch++) {
        if (!canalesOcupados.has(ch)) {
            disponibles.push({
                channel_id: ch,
                camera_name: 'Libre',
                detalle: 'disponible',
                is_offline: false,
                fallback_ping: false,
                ip_address: '-',
                mac_address: '-',
                modelo: '-',
                firmware: '-',
                nvr_name: nvrNombre,
                nvr_ip: nvrIp
            });
        }
    }
    return [...camarasConfiguradas, ...disponibles];
}
// Capacidad de canales del parque para el dashboard. `capacidadDe(nvr)` = la informada por la consulta o, si no, la
// estimada por modelo (null si no se sabe). En uso = cámaras configuradas en ese grabador; el total de "en uso" es la
// suma de los grabadores (las mismas cuentas que el detalle) y los libres se suman por grabador (uno lleno no descuenta
// de otro con lugar). Un grabador sin capacidad conocida (caído y sin modelo que la estime) cuenta en «en uso» pero NO en los
// porcentajes (`enUsoMedido`, `sinCapacidad`): su uso no tiene base y mezclarlo daba más de 100 % entre en uso y libres.
// Un grabador SOLO PANTALLA (`graba === false`, sin disco: como una PC con el IVMS) no es capacidad del parque: no suma en
// nada (ni en el total, ni en uso, ni en libres, ni en los anillos) y va aparte en `pantallas`, con la forma del detalle.
function resumirCapacidad(nvrs, camaras, capacidadDe) {
    const detalle = new Map();
    const pantallas = new Map();
    let total = 0, enUso = 0, enUsoMedido = 0, libres = 0, sinCapacidad = 0;
    for (const n of Array.isArray(nvrs) ? nvrs : []) {
        if (!n) continue;
        const cap = capacidadDe(n) || 0;
        const uso = (Array.isArray(camaras) ? camaras : []).filter(c => c && c.nvr_ip === n.ip).length;
        const disp = calcularCanalesDisponibles(uso, cap) || 0;
        const conNombre = Boolean(n.nvr_name && n.nvr_name !== 'N/A');
        const fila = { cap, enUso: uso, libres: disp, nombre: conNombre ? String(n.nvr_name) : String(n.ip), ip: String(n.ip) };
        const clave = conNombre ? `${n.nvr_name} (${n.ip})` : String(n.ip);
        if (n.graba === false) {                 // solo `false` explícito: sin el dato, graba
            pantallas.set(clave, fila);
            continue;
        }
        total += cap;
        enUso += uso;
        if (cap > 0) enUsoMedido += uso; else sinCapacidad++;
        libres += disp;
        detalle.set(clave, fila);
    }
    return { total, enUso, enUsoMedido, sinCapacidad, libres, detalle, pantallas,
        pct: total > 0 ? Math.min(100, Math.round((enUsoMedido / total) * 100)) : 0 };
}
// Color del anillo de canales según lo usado: verde por debajo del umbral de aviso, naranja desde ahí y rojo cuando casi no
// quedan canales libres.
const CAPACIDAD_AVISO_PCT = 70;
const CAPACIDAD_CRITICO_PCT = 90;
function nivelCapacidad(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return 'ok';
    if (n >= CAPACIDAD_CRITICO_PCT) return 'critico';
    return n >= CAPACIDAD_AVISO_PCT ? 'aviso' : 'ok';
}
// ==== CAPACIDAD CANALES NVR PURO END ====

// Sincronizar altura del navbar sticky con variables CSS para el panel lateral y headers de acordeón
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

// Cierre automático de menús dropdown (Búsqueda y Configuración) al hacer scroll
function inicializarCierreDropdownsOnScroll() {
    window.addEventListener('scroll', (e) => {
        // Ignorar si el scroll ocurre dentro del propio menú desplegable
        if (e.target instanceof Element && e.target.closest('.dropdown-menu')) {
            return;
        }

        // Si no hay ningún dropdown visible, omitir procesamiento
        if (!document.querySelector('.dropdown-menu.show')) return;
        UI.desplegable.cerrarTodos();
    }, { capture: true, passive: true });
}

// Botón para volver al inicio al hacer scroll hacia abajo (Estilo IDR)
function inicializarBotonScrollTop() {
    const btn = document.getElementById('btn-scroll-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('show', window.scrollY > 300);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// Stub seguro para compatibilidad (el sticky de las tablas ahora se fija directamente a --navbar-height)
window.actualizarStickyHeader = () => {};
