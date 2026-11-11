// Resumen de infraestructura y activos del dashboard (capacidad de canales y stock). Se carga DESPUÉS de app.js.

// --- Resumen de Infraestructura y Activos (Capacidad y Stock) ---
let _cacheStockResumen = null;   // última respuesta válida de /api/stock (la renueva el evento 'cctv:stock')
let _stockActual = { de: null, cat: null, porId: new Map() };

// Catálogo (grupos/tipos) e índice por id de la última respuesta de /api/stock: se arman una vez por respuesta
function stockActual() {
    const r = _cacheStockResumen;
    if (!r || typeof stockCatalogo !== 'function') return null;
    if (_stockActual.de !== r) {
        const porId = new Map();
        for (const d of Array.isArray(r.dispositivos) ? r.dispositivos : []) if (d && d.id) porId.set(d.id, d);
        _stockActual = { de: r, cat: stockCatalogo(r.grupos), porId };
    }
    return _stockActual;
}

function catalogoStockActual() {
    const s = stockActual();
    return s ? s.cat : null;
}

function stockEsCamaraActual(tipo) {
    return typeof stockEsCamara === 'function' ? stockEsCamara(tipo, catalogoStockActual()) : tipo === 'camara';
}

// Grupo de un tipo según el catálogo de la última respuesta (dashboard); sin catálogo, el del sistema por defecto
function stockGrupoDeActual(tipo) {
    return typeof stockGrupoDeTipo === 'function' ? stockGrupoDeTipo(tipo, catalogoStockActual()) : grupoResumenPorDefecto(tipo);
}

function stockTipoEtiquetaActual(tipo) {
    const cat = catalogoStockActual();
    return (cat && cat.etiquetaTipo.get(tipo)) || '';
}

// Etiqueta del tipo del dispositivo de stock vinculado a una cámara del escaneo (`cam.stock.id`), o ''
function stockTipoDeCamaraActual(cam) {
    const s = stockActual();
    const d = s && cam && cam.stock && s.porId.get(cam.stock.id);
    return d ? (s.cat.etiquetaTipo.get(d.tipo) || d.tipo) : '';
}
window.obtenerCacheStock = () => _cacheStockResumen;
let _stockResumenPedido = null;  // pedido en vuelo: varios 'cctv:datos' seguidos no repiten la consulta

// ==== RESUMEN STOCK PURO BEGIN ====
const RESUMEN_SIN_MODELO = 'Sin modelo';   // modelo vacío en el detalle de stock
const RESUMEN_TIPOS_GRABADOR = new Set(['nvr', 'dvr']);
const RESUMEN_GRUPOS_SISTEMA = new Set(['servidores', 'camaras', 'otros']);

// Contador de un grupo: t = total, u = en uso, d = disponibles, o = ni en uso ni disponibles.
function resumenContador() {
    return { t: 0, u: 0, d: 0, o: 0 };
}

function resumenSumar(c, d) {
    c.t++;
    if (d.en_uso) c.u++;
    if (d.disponible) c.d++;
    if (!d.en_uso && !d.disponible) c.o++;
}

function resumenEnGrupo(grupos, clave, d) {
    if (!grupos.has(clave)) grupos.set(clave, resumenContador());
    resumenSumar(grupos.get(clave), d);
}

// Grupo de un tipo sin catálogo (respuesta vieja o todavía sin cargar): los del sistema
function grupoResumenPorDefecto(tipo) {
    if (RESUMEN_TIPOS_GRABADOR.has(tipo)) return 'servidores';
    return tipo === 'camara' ? 'camaras' : 'otros';
}

// Tipo -> { c: contador del tipo, modelos: Map modelo -> contador } (los modales de detalle: tipo con sus modelos)
function resumenEnTipo(porTipo, tipo, modelo, d) {
    if (!porTipo.has(tipo)) porTipo.set(tipo, { c: resumenContador(), modelos: new Map() });
    const t = porTipo.get(tipo);
    resumenSumar(t.c, d);
    resumenEnGrupo(t.modelos, modelo, d);
}

// Resumen del stock para el dashboard: un chip por grupo principal del catálogo de /api/stock, los mismos grupos que la
// pestaña Activos: los tres del sistema (Servidores, Cámaras, Otros) y cada grupo creado por el usuario (`personalizados`,
// Map clave → { total, porTipo }). `grupoDe(tipo)` = clave del grupo (en la página, el catálogo); un tipo desconocido cae
// en "otros" (lo decide `grupoDe`). Etiquetas: Map clave → etiqueta (stockEtiquetas de r.tipos). Todos los grupos se
// detallan igual: `porTipo` (tipo con sus modelos). Son Map porque sus claves (grupo, tipo, modelo) vienen de los datos.
function resumirStock(dispositivos, etiquetasTipo, grupoDe = grupoResumenPorDefecto) {
    const etiqueta = (mapa, clave) => (mapa && mapa.get(clave)) || clave;
    const nuevoGrupo = () => ({ total: resumenContador(), porTipo: new Map() });
    const r = { servidores: nuevoGrupo(), camaras: nuevoGrupo(), otros: nuevoGrupo(), personalizados: new Map() };
    for (const d of Array.isArray(dispositivos) ? dispositivos : []) {
        if (!d) continue;
        const clave = grupoDe(d.tipo);
        let g;
        if (RESUMEN_GRUPOS_SISTEMA.has(clave)) {
            g = r[clave];
        } else {
            if (!r.personalizados.has(clave)) r.personalizados.set(clave, nuevoGrupo());
            g = r.personalizados.get(clave);
        }
        resumenSumar(g.total, d);
        resumenEnTipo(g.porTipo, etiqueta(etiquetasTipo, d.tipo) || 'Sin tipo', d.modelo || RESUMEN_SIN_MODELO, d);
    }
    return r;
}

// Grupos del catálogo que no son del sistema, en el orden de presentación: [{ clave, etiqueta }]. Cada uno tiene su chip
// en Activos aunque todavía no tenga equipos. `grupos` = r.grupos de /api/stock (entrada del servidor: se valida).
function gruposPropiosCatalogo(grupos) {
    const vistos = new Set();
    const propios = [];
    for (const g of Array.isArray(grupos) ? grupos : []) {
        if (!g || typeof g.clave !== 'string' || RESUMEN_GRUPOS_SISTEMA.has(g.clave) || vistos.has(g.clave)) continue;
        vistos.add(g.clave);
        propios.push({ clave: g.clave, etiqueta: String(g.etiqueta || g.clave) });
    }
    return propios;
}

// Búsqueda de un modelo del detalle de stock (doble clic en su fila): entre comillas para que un modelo con espacios
// sea un solo término. '' = sin modelo (no se busca).
function busquedaDeModelo(modelo) {
    const m = String(modelo ?? '').replace(/"/g, '').trim();
    if (!m || m === RESUMEN_SIN_MODELO) return '';
    return /\s/.test(m) ? `"${m}"` : m;
}

const METRICAS_STOCK = [
    { id: 'total', rotulo: 'Total', getVal: c => c.t, sufijo: 'total' },
    { id: 'uso', rotulo: 'En uso', getVal: c => c.u, sufijo: 'uso' },
    { id: 'libres', rotulo: 'Disponibles', getVal: c => c.d, sufijo: 'libres' },
    { id: 'fuera', rotulo: 'No disponible', getVal: c => c.o, sufijo: 'fuera' },
];
const EJES_ACTIVOS = new Set(['total', 'uso', 'libres', 'fuera']);
const CLAVE_EJE_ACTIVOS = 'cctv:activos_eje';

function metricasDesgloseStock(eje) {
    const ejeValido = EJES_ACTIVOS.has(eje) ? eje : 'total';
    return METRICAS_STOCK.filter(m => m.id !== ejeValido);
}

// Detalle de canales: «En uso» y «Disponibles» en cantidad (neto) o en % de la capacidad (toggle del pie del modal).
// Sin capacidad conocida no hay porcentaje: va la cantidad.
const MODOS_CAPACIDAD = new Set(['neto', 'pct']);
const CLAVE_MODO_CAPACIDAD = 'cctv:capacidad_modo';

function modoCapacidadValido(modo) {
    return MODOS_CAPACIDAD.has(modo) ? modo : 'neto';
}

function formatoCapacidad(val, base, modo) {
    const n = Number(val) || 0;
    if (modoCapacidadValido(modo) !== 'pct' || !(base > 0)) return String(n);
    return `${Math.round((n / base) * 100)}%`;
}
// ==== RESUMEN STOCK PURO END ====

let _ultimoResumenStock = null;
let _ultimosGruposStock = null;

function obtenerEjeActivos() {
    try {
        const guardado = typeof storage !== 'undefined' ? storage.get(CLAVE_EJE_ACTIVOS) : null;
        return EJES_ACTIVOS.has(guardado) ? guardado : 'total';
    } catch (_) {
        return 'total';
    }
}

// Un valor que se ve ahora: del modal abierto, no en la fila de un modelo plegado (esa no tiene dónde animarse) y dentro de lo
// que muestra su contenedor con scroll (el cuerpo del modal) y la ventana: lo que quedó fuera de vista no se anima (su copia
// fantasma aparecería fuera del modal)
function valorVisible(el) {
    if (el.getClientRects().length === 0 || el.closest('tr.plegada')) return false;
    const cont = el.closest('.modal-body');
    const tabla = el.closest('table');
    const cabecera = tabla ? tabla.querySelector('thead') : null;
    const totales = tabla ? tabla.querySelector('.fila-totales') : null;
    const area = areaVisibleTabla(cont ? cont.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth },
        cabecera && cabecera.getBoundingClientRect(), totales && !totales.contains(el) ? totales.getBoundingClientRect() : null,
        { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth });
    return valorEntero(el.getBoundingClientRect(), area);
}

// Celdas que cambian con el toggle: «En uso» y «Disponibles» (filas y totales). Cada valor va en un `.cap-valor`:
// la mutación anima ese span y no la celda (escalar un <td> corre su texto y mueve sus bordes)
const SELECTOR_CELDAS_CAPACIDAD = '#tabla-detalle-capacidad tbody td:nth-child(3), #tabla-detalle-capacidad tbody td:nth-child(4), '
    + '#tabla-detalle-pantallas tbody td:nth-child(3), #tabla-detalle-pantallas tbody td:nth-child(4), '
    + '#cap-detalle-uso, #cap-detalle-libres';
const SELECTOR_VALORES_CAPACIDAD = '#tabla-detalle-capacidad .cap-valor, #tabla-detalle-pantallas .cap-valor, '
    + '.modal-detalle-tipos .cap-valor';

function envolverValoresCapacidad() {
    for (const td of document.querySelectorAll(SELECTOR_CELDAS_CAPACIDAD)) {
        const hijo = td.firstElementChild;
        if (hijo && hijo.classList.contains('cap-valor')) continue;
        const span = document.createElement('span');
        span.className = 'cap-valor';
        span.textContent = td.textContent;
        td.replaceChildren(span);
    }
}

// Mutación EN PARALELO de lo que cambia (como el cambio de pestaña): `obtener()` da los elementos que cambian; de cada uno
// se deja una copia fantasma sobre él que sale mientras `repintar()` pone lo nuevo y los elementos entran. Origen en el
// centro (con el «top center» estándar el texto se corre unos píxeles). Sin animar si se prefiere menos movimiento.
function mutarEnParalelo(obtener, repintar, crearFantasma) {
    const viejos = [...obtener()];
    if (!viejos.length || prefiereMovimientoReducido()) { repintar(); return; }
    // Primero se mide todo y recién después se agrega al DOM: medir y agregar de a uno obliga al navegador a recalcular toda la
    // página por cada valor (con cientos de valores, el cambio se congelaba un segundo)
    const fantasmas = viejos.map(crearFantasma);
    for (const f of fantasmas) f._padre.appendChild(f);
    repintar();
    for (const el of obtener()) {
        el.style.transformOrigin = '50% 50%';
        animarMutacion(el, 'entrada', () => { el.style.transformOrigin = ''; });
    }
    fantasmas.forEach(f => animarMutacion(f, 'salida', () => f.remove()));
}

// Fantasma de un bloque (el desglose de un chip, su número, su rótulo): un clon sin ids dentro de la misma tarjeta, que
// conserva sus estilos, ubicado sobre el original
function crearFantasmaClon(el) {
    const padre = el.closest('.metric-card') || el.parentElement;
    const r = el.getBoundingClientRect();
    const pr = padre.getBoundingClientRect();
    const f = el.cloneNode(true);
    for (const n of [f, ...f.querySelectorAll('[id]')]) n.removeAttribute('id');
    for (const n of [f, ...f.querySelectorAll('[data-eje-rotulo]')]) n.removeAttribute('data-eje-rotulo');   // no es el rótulo real
    f.setAttribute('aria-hidden', 'true');
    f.classList.add('mutacion-fantasma');
    Object.assign(f.style, fantasmaCaja(r, pr, padre.clientTop, padre.clientLeft),
        { pointerEvents: 'none', zIndex: '1000', transformOrigin: '50% 50%' });
    f._padre = padre;                 // mutarEnParalelo lo agrega
    return f;
}

// Copia visual del valor actual de una celda (sin agregar al DOM todavía: lo hace mutarEnParalelo), para animar su salida
// mientras la celda ya muestra el nuevo
// ==== FANTASMA RECORTE PURO BEGIN ====
// Dónde va un fantasma dentro de su `padre` (el contenedor posicionado, `pr` su rectángulo; `bordeArriba`/`bordeIzquierda` el
// grosor de su borde, que `position: absolute` no cuenta): las mismas medidas del elemento `r` (su rectángulo), en px.
function fantasmaCaja(r, pr, bordeArriba = 0, bordeIzquierda = 0) {
    return { position: 'absolute', top: `${r.top - pr.top - bordeArriba}px`, left: `${r.left - pr.left - bordeIzquierda}px`,
        width: `${r.width}px`, height: `${r.height}px`, margin: '0' };
}

// El fantasma de un valor (lo que sale mientras entra el nuevo) flota sobre la tarjeta del modal, fuera del cuerpo que se desplaza:
// sin recortarlo, un valor a medio camino del borde se vería sobre el encabezado o el pie del modal. `rect`: el del texto;
// `visible`: lo que se ve de la tabla {top, bottom, left, right} (el cuerpo del modal sin lo que tapan el encabezado y la fila de
// totales pegajosos). Devuelve el `clip-path` que deja solo lo visible, o null si no hay nada que recortar.
function fantasmaRecorte(rect, visible) {
    if (!rect || !visible) return null;
    const dentro = (v) => Math.max(0, Math.round(v * 100) / 100);
    const arriba = dentro(visible.top - rect.top);
    const derecha = dentro(rect.right - visible.right);
    const abajo = dentro(rect.bottom - visible.bottom);
    const izquierda = dentro(visible.left - rect.left);
    if (arriba === 0 && derecha === 0 && abajo === 0 && izquierda === 0) return null;
    return `inset(${arriba}px ${derecha}px ${abajo}px ${izquierda}px)`;
}

// Lo que se ve de la tabla de un modal de detalle: el cuerpo del modal (`cuerpo`), sin lo que tapan el encabezado de la tabla
// (`cabecera`, pegajoso arriba) y su fila de totales (`totales`, pegajosa abajo; null para el valor de esa misma fila). Cada
// uno es un rectángulo {top, bottom, left, right} o null.
function fantasmaAreaVisible(cuerpo, cabecera, totales) {
    if (!cuerpo) return null;
    const visible = { top: cuerpo.top, bottom: cuerpo.bottom, left: cuerpo.left, right: cuerpo.right };
    if (cabecera) visible.top = Math.max(visible.top, cabecera.bottom);
    if (totales) visible.bottom = Math.min(visible.bottom, totales.top);
    return visible;
}

// Lo que se ve de la tabla (como `fantasmaAreaVisible`) y además dentro de la ventana (`ventana`: {top, bottom, left, right})
function areaVisibleTabla(cuerpo, cabecera, totales, ventana) {
    const visible = fantasmaAreaVisible(cuerpo, cabecera, totales);
    if (!visible || !ventana) return visible;
    return { top: Math.max(visible.top, ventana.top), bottom: Math.min(visible.bottom, ventana.bottom),
        left: Math.max(visible.left, ventana.left), right: Math.min(visible.right, ventana.right) };
}

// ¿El valor (`rect`) se ve ENTERO dentro del área visible? Uno cortado por el borde del cuerpo, tapado a medias por el
// encabezado o la fila de totales, o a medio salir de la ventana NO se anima: ni su copia que sale ni el valor que entra se
// montan sobre lo que tienen al lado (se repinta sin movimiento). 1 px de tolerancia por el redondeo del navegador.
function valorEntero(rect, area) {
    if (!rect || !area) return false;
    return rect.top >= area.top - 1 && rect.bottom <= area.bottom + 1 && rect.left >= area.left - 1 && rect.right <= area.right + 1;
}
// ==== FANTASMA RECORTE PURO END ====

// ==== PIE TABLA PURO BEGIN ====
// Alto del relleno que empuja la fila de totales al pie del cuerpo del modal cuando hay pocas filas (`cuerpo`: alto visible del
// cuerpo; `tabla`: alto de la tabla SIN relleno). Con muchas filas no hace falta (la fila de totales es pegajosa y queda abajo).
function alturaRellenoPie(cuerpo, tabla) {
    const libre = Math.floor(Number(cuerpo) - Number(tabla));
    return Number.isFinite(libre) && libre > 0 ? libre : 0;
}
// ==== PIE TABLA PURO END ====

// La fila de totales de una tabla de detalle va siempre al pie del cuerpo del modal: con pocas filas un relleno (un tbody vacío
// con el alto que sobra) la baja, así no queda pegada a la última fila con un hueco blanco debajo. Se recalcula cuando cambia
// el cuerpo (ventana, apertura del modal) o las filas (repintado, tipos que se abren y cierran).
function ajustarRellenoPie(tabla) {
    const cuerpo = tabla.closest('.modal-body');
    const pie = tabla.tFoot;
    if (!cuerpo || !pie) return;
    let relleno = tabla.querySelector(':scope > tbody.tabla-relleno');
    if (!relleno) {
        relleno = document.createElement('tbody');
        relleno.className = 'tabla-relleno';
        relleno.setAttribute('aria-hidden', 'true');
        const td = relleno.insertRow().insertCell();
        td.colSpan = Math.max(1, pie.rows[0] ? pie.rows[0].cells.length : 1);
        tabla.insertBefore(relleno, pie);
    }
    const td = relleno.rows[0].cells[0];
    td.style.height = '0px';                                  // se mide la tabla sin relleno
    td.style.height = `${alturaRellenoPie(cuerpo.clientHeight, tabla.offsetHeight)}px`;
}

function iniciarRellenoPie() {
    if (typeof ResizeObserver !== 'function') return;
    for (const tabla of document.querySelectorAll('.tabla-con-pie > table')) {
        const cuerpo = tabla.closest('.modal-body');
        if (!cuerpo) continue;
        const observador = new ResizeObserver(() => ajustarRellenoPie(tabla));
        observador.observe(cuerpo);
        if (tabla.tBodies[0]) observador.observe(tabla.tBodies[0]);
    }
}

function crearFantasmaCelda(celda) {
    // Dentro de la tarjeta del modal (position: relative) y en absoluto: un ancestro con transform (la entrada del modal)
    // vuelve «fixed» relativo a él y el valor aparecería corrido fuera de la tarjeta.
    // Se ubica sobre el rectángulo del TEXTO (no de la celda): así coincide al píxel con el valor que ya está debajo.
    const padre = celda.closest('.modal-content') || document.body;
    const rango = document.createRange();
    rango.selectNodeContents(celda);
    const r = rango.getBoundingClientRect();
    const pr = padre.getBoundingClientRect();
    const est = getComputedStyle(celda);
    const f = document.createElement('div');
    f.textContent = celda.textContent;
    Object.assign(f.style, fantasmaCaja(r, pr, padre.clientTop, padre.clientLeft), {
        whiteSpace: 'nowrap', textAlign: 'center', pointerEvents: 'none',
        zIndex: '1000', transformOrigin: '50% 50%', font: est.font, color: est.color, letterSpacing: est.letterSpacing,
    });
    f.style.lineHeight = `${r.height}px`;       // después de `font`: el atajo reinicia el interlineado (corría el texto ~2 px)
    // Solo se ve lo que se ve del cuerpo del modal: ni sobre el encabezado y el pie del modal, ni debajo del encabezado de la
    // tabla o de su fila de totales (pegajosos)
    const cuerpo = celda.closest('.modal-body');
    if (cuerpo) {
        const tabla = celda.closest('table');
        const cabecera = tabla ? tabla.querySelector('thead') : null;
        const totales = tabla ? tabla.querySelector('.fila-totales') : null;
        const visible = fantasmaAreaVisible(cuerpo.getBoundingClientRect(), cabecera && cabecera.getBoundingClientRect(),
            totales && !totales.contains(celda) ? totales.getBoundingClientRect() : null);
        const recorte = fantasmaRecorte(r, visible);
        if (recorte) f.style.clipPath = recorte;
    }
    f._padre = padre;                 // mutarEnParalelo lo agrega
    return f;
}

let _ultimaCapacidad = null;        // lo último que pintó el resumen: el toggle repinta sin recalcular
preferencias.alAplicar(CLAVE_MODO_CAPACIDAD, () => repintarModoDetalles());

// El modo (cantidad / porcentaje) cambia el detalle de canales y los de stock: se repintan los dos con lo último que se pintó
function repintarModoDetalles() {
    pintarDetalleCapacidad();
    if (_ultimoResumenStock) {
        pintarTablasDetalleStock(_ultimoResumenStock);
        pintarDetalleGrupo();
    }
    const modo = modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
    for (const b of document.querySelectorAll('[data-cap-modo]')) {
        const activo = b.dataset.capModo === modo;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', String(activo));
    }
}

// Un grabador del detalle de canales (la tabla principal y la de «solo pantalla» van igual): columnas y fila.
// Sin capacidad conocida muestra «-» (no 0) y sin porcentaje: no tiene base para calcularlo
function columnasCapacidad(d, fmt, modo) {
    return d.cap > 0 ? [d.cap, fmt(d.enUso, d.cap), fmt(d.libres, d.cap)] : ['-', modo === 'pct' ? '-' : d.enUso, '-'];
}
// Solo el nombre del grabador (la IP sale de la descripción); doble clic = buscarlo en Activos. `conNivel`: el borde y el
// color de Disponibles según el uso (lo que se pide del parque; un solo pantalla no lo lleva)
function ponerFilaCapacidad(tr, d, conNivel) {
    tr.cells[0].textContent = d.nombre;
    tr.dataset.nvrIp = d.ip;
    tr.title = 'Doble clic: buscar en Activos';
    if (conNivel && d.cap > 0) {
        const pct = Math.min(100, Math.round((d.enUso / d.cap) * 100));
        const nivel = typeof nivelCapacidad === 'function' ? nivelCapacidad(pct) : (pct >= 90 ? 'critico' : (pct >= 70 ? 'aviso' : 'ok'));
        tr.classList.add(nivel === 'critico' ? 'cap-fila-critico' : (nivel === 'aviso' ? 'cap-fila-aviso' : 'cap-fila-ok'));
    }
}

function pintarDetalleCapacidad() {
    const cap = _ultimaCapacidad;
    if (!cap) return;
    const modo = modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
    const fmt = (val, base) => formatoCapacidad(val, base, modo);
    pintarTablaResumen('#tabla-detalle-capacidad tbody', cap.detalle, d => columnasCapacidad(d, fmt, modo),
        (tr, d) => ponerFilaCapacidad(tr, d, true));
    // Los grabadores solo pantalla no suman en nada: tabla aparte, sin totales ni colores de uso, y oculta si no hay
    const pantallas = cap.pantallas || new Map();
    pintarTablaResumen('#tabla-detalle-pantallas tbody', pantallas, d => columnasCapacidad(d, fmt, modo),
        (tr, d) => ponerFilaCapacidad(tr, d, false));
    const seccionPantallas = document.getElementById('cap-pantallas-seccion');
    if (seccionPantallas) seccionPantallas.classList.toggle('d-none', pantallas.size === 0);
    uiPonerTexto('cap-detalle-total', cap.total);      // fila de totales: las mismas sumas del chip
    // en porcentaje, el uso de los grabadores con capacidad conocida (los mismos que suman la capacidad total)
    uiPonerTexto('cap-detalle-uso', fmt(modo === 'pct' ? cap.enUsoMedido : cap.enUso, cap.total));
    const nota = document.getElementById('cap-detalle-nota');
    if (nota) {
        nota.classList.toggle('d-none', !(cap.sinCapacidad > 0));
        nota.textContent = cap.sinCapacidad > 0
            ? `«-»: capacidad desconocida (${cap.sinCapacidad}); no cuenta en la capacidad ni en los porcentajes.` : '';
    }
    uiPonerTexto('cap-detalle-libres', fmt(cap.libres, cap.total));
    for (const b of document.querySelectorAll('[data-cap-modo]')) {
        const activo = b.dataset.capModo === modo;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', String(activo));
    }
    envolverValoresCapacidad();
}

document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-cap-modo]') : null;
    if (!b) return;
    const nuevo = modoCapacidadValido(b.dataset.capModo);
    const cambia = nuevo !== modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
    preferencias.set(CLAVE_MODO_CAPACIDAD, nuevo);
    // Cambio de cantidad <-> porcentaje: la mutación estándar y EN PARALELO (como el cambio de pestaña): el valor viejo
    // sale como fantasma sobre la celda mientras el nuevo entra, solo en las celdas que cambian
    if (!cambia || prefiereMovimientoReducido()) { repintarModoDetalles(); return; }
    // solo los del modal abierto: los de los modales cerrados no tienen dónde animarse
    mutarEnParalelo(() => [...document.querySelectorAll(SELECTOR_VALORES_CAPACIDAD)].filter(valorVisible),
        repintarModoDetalles, crearFantasmaCelda);
});

// Lo que cambia al elegir otro eje central en los chips de Activos
const SELECTOR_CAMBIA_CON_EJE = '#infra-chips [data-eje-rotulo], #infra-chips .metric-value:not(.mutacion-fantasma), '
    + '#infra-chips [id$="-desglose"]';

function fijarEjeActivos(nuevoEje) {
    if (!EJES_ACTIVOS.has(nuevoEje)) return;
    const ejeAnterior = obtenerEjeActivos();
    preferencias.set(CLAVE_EJE_ACTIVOS, nuevoEje);
    sincronizarMenuEjeActivos(nuevoEje);
    // Cambia el rótulo, el número central y el desglose de cada chip (no el ícono ni el nombre): mutación en paralelo
    if (nuevoEje === ejeAnterior) return;
    mutarEnParalelo(() => document.querySelectorAll(SELECTOR_CAMBIA_CON_EJE), repintarChipsActivos, crearFantasmaClon);
}

function sincronizarMenuEjeActivos(eje) {
    const btns = document.querySelectorAll('#activos-eje-menu [data-activos-eje]');
    btns.forEach(b => {
        const activo = b.dataset.activosEje === eje;
        b.classList.toggle('active', activo);
        const icon = b.querySelector('.bi-check2');
        if (icon) icon.classList.toggle('d-none', !activo);
    });
    const botonTrigger = document.getElementById('activos-eje-btn');
    if (botonTrigger) {
        const metrica = METRICAS_STOCK.find(m => m.id === eje);
        botonTrigger.title = `Eje central: ${metrica ? metrica.rotulo : 'Total'}`;
    }
}

function repintarChipsActivos() {
    if (!_ultimoResumenStock) return;
    pintarKpisStock('kpi-stock-', _ultimoResumenStock.servidores.total);
    pintarKpisStock('kpi-stock-cam-', _ultimoResumenStock.camaras.total);
    pintarKpisStock('kpi-stock-otros-', _ultimoResumenStock.otros.total);
    sincronizarChipsGrupos(_ultimoResumenStock, _ultimosGruposStock);
}

function initEjeActivos() {
    preferencias.alAplicar(CLAVE_EJE_ACTIVOS, () => {
        sincronizarMenuEjeActivos(obtenerEjeActivos());
        repintarChipsActivos();
    });
    const ejeActual = obtenerEjeActivos();
    sincronizarMenuEjeActivos(ejeActual);
    document.addEventListener('click', (e) => {
        const btn = e.target instanceof Element ? e.target.closest('[data-activos-eje]') : null;
        if (!btn) return;
        const eje = btn.dataset.activosEje;
        if (EJES_ACTIVOS.has(eje)) {
            fijarEjeActivos(eje);
            UI.desplegable.cerrarTodos();          // el menú no se cierra solo (lleva casillas): elegir el eje sí lo cierra
        }
    });
}

async function cargarStockResumen() {
    if (!_stockResumenPedido) {
        // Con la pestaña Stock cargada, la carga pasa por ella (una sola consulta): así el menú ⚙ (Nuevo dispositivo,
        // Catálogos) ya sabe si el usuario edita sin haber abierto Activos; su evento 'cctv:stock' llena la caché
        const viaStock = typeof window.recargarStock === 'function';
        _stockResumenPedido = (viaStock ? window.recargarStock() : apiFetch('/api/stock'))
            .then(r => {
                if (viaStock) return;
                if (stockRespuestaValida(r)) {
                    _cacheStockResumen = r;
                    if (globalData && globalData.camaras) {
                        ejecutarFiltro(terminoBusquedaActual());
                    }
                }
            })
            .catch(e => console.error('No se pudo cargar stock para el resumen', e))
            .finally(() => { _stockResumenPedido = null; });
    }
    return _stockResumenPedido;
}

function actualizarEstructuraChip(prefijo, c, eje) {
    const desglose = document.getElementById(`${prefijo}desglose`);
    if (!desglose) return;
    const card = desglose.closest('.metric-card');
    if (!card) return;
    const elPrincipal = card.querySelector('.metric-value');
    if (elPrincipal) {
        elPrincipal.id = `${prefijo}${eje}`;
        const metrica = METRICAS_STOCK.find(m => m.id === eje);
        if (metrica) elPrincipal.title = metrica.rotulo;
        // Qué es el número central (cambia con el eje): rótulo encima, con el estilo de los del desglose de la derecha
        let rotulo = elPrincipal.parentElement.querySelector('[data-eje-rotulo]');
        if (!rotulo) {
            rotulo = uiNodo('div', 'small text-secondary lh-1 mb-1');
            rotulo.dataset.ejeRotulo = '';
            elPrincipal.before(rotulo);
        }
        rotulo.textContent = metrica ? metrica.rotulo : '';
    }
    const metricas = metricasDesgloseStock(eje);
    const filas = metricas.map((m, idx) => {
        const div = document.createElement('div');
        if (idx < metricas.length - 1) div.className = 'mb-1';
        div.textContent = `${m.rotulo}: `;
        const span = document.createElement('span');
        span.id = `${prefijo}${m.sufijo}`;
        span.className = 'fw-bold';
        span.textContent = c ? String(m.getVal(c)) : '-';
        div.appendChild(span);
        return div;
    });
    desglose.replaceChildren(...filas);
}

// El valor del eje central es el número principal del chip: cuenta desde 0 al cargar (animaciones.js)
function pintarKpisStock(prefijo, c) {
    const eje = obtenerEjeActivos();
    actualizarEstructuraChip(prefijo, c, eje);
    const metrica = METRICAS_STOCK.find(m => m.id === eje) || METRICAS_STOCK[0];
    ponerTextoConteoId(`${prefijo}${eje}`, metrica.getVal(c));
}

// Reescribe el tbody con una fila por grupo, ordenada por nombre: [nombre, ...columnas(valor)]; por defecto el
// contador del stock (total, en uso, disponibles, otros). Solo textContent.
function pintarTablaResumen(selector, grupos, columnas = c => [c.t, c.u, c.d, c.o], fila = null) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    const clases = ['ps-3 fw-medium', 'text-center fw-semibold', 'text-center', 'text-center', 'text-center text-muted'];
    const filas = [...grupos.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([nombre, c]) => {
        const tr = document.createElement('tr');
        const valores = [nombre, ...columnas(c)];
        valores.forEach((v, i) => uiCelda(tr, String(v), clases[i]));
        if (fila) fila(tr, c);
        return tr;
    });
    tbody.replaceChildren(...filas);
}

// Tipos con sus modelos plegables (mismas columnas). Lo que estaba desplegado sigue así al repintar con cada
// /api/v2/datos. Claves de los datos: Set/Map, nunca {}. Solo textContent. Los modelos de un tipo se abren y cierran
// como acordeón (uiFilaPlegable: cada fila anima su alto y el modal la acompaña) y se abre un tipo a la vez: al abrir uno
// se cierra el que estaba abierto (como los grupos de Activos y Producción).
const _tiposDesplegados = new Map();      // selector -> Set de tipos abiertos

// Abre o cierra los modelos de los tipos `tipos` de esa tabla
function fijarTiposDesplegados(tbody, abiertos, tipos, abrir) {
    for (const b of tbody.querySelectorAll('.resumen-tipo-btn')) {
        if (tipos.has(b.dataset.resumenTipo)) b.setAttribute('aria-expanded', String(abrir));
    }
    for (const fila of tbody.querySelectorAll('tr.resumen-modelo')) {
        if (tipos.has(fila.dataset.resumenDe)) uiPlegarFila(fila, abrir);
    }
    for (const t of tipos) {
        if (abrir) abiertos.add(t); else abiertos.delete(t);
    }
}

// Fila de contadores del detalle de stock: «Total» en cantidad y «En uso», «Disponibles» y «No disponible» en cantidad o en
// % del total de esa fila (el mismo toggle y la misma preferencia que el detalle de canales). Cada valor va en un `.cap-valor`.
function celdasContador(tr, c, clases, modo) {
    uiCelda(tr, String(c.t), clases[0]);
    [c.u, c.d, c.o].forEach((v, i) => {
        const td = uiCelda(tr, '', clases[i + 1]);
        td.append(uiNodo('span', 'cap-valor', formatoCapacidad(v, c.t, modo)));
    });
}

// Pie fijo de la tabla con el total general (la suma de todos los tipos), como el de canales (`.fila-totales`)
function pintarTotalGeneral(tabla, porTipo, modo) {
    if (!tabla) return;
    const total = { t: 0, u: 0, d: 0, o: 0 };
    for (const { c } of porTipo.values()) {
        total.t += c.t; total.u += c.u; total.d += c.d; total.o += c.o;
    }
    let pie = tabla.tFoot;
    if (!pie) {
        pie = tabla.createTFoot();
        pie.className = 'fila-totales';
    }
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'ps-3';
    th.scope = 'row';
    th.textContent = 'Total';
    tr.appendChild(th);
    celdasContador(tr, total, ['text-center', 'text-center', 'text-center', 'text-center'], modo);
    pie.replaceChildren(tr);
}

function pintarTablaTipos(selector, porTipo) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    const modo = modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
    if (!_tiposDesplegados.has(selector)) _tiposDesplegados.set(selector, new Set());
    const abiertos = _tiposDesplegados.get(selector);
    const clases = ['', 'text-center fw-semibold', 'text-center', 'text-center', 'text-center text-muted'];
    const porNombre = ([a], [b]) => String(a).localeCompare(String(b));
    const filas = [];
    for (const [tipo, { c, modelos }] of [...porTipo.entries()].sort(porNombre)) {
        const abierto = abiertos.has(tipo);
        const tr = document.createElement('tr');
        tr.className = 'resumen-tipo';                  // toda la fila abre o cierra el tipo (no solo el nombre)
        tr.title = 'Clic para abrir o cerrar (se abre un tipo a la vez)';
        const td = document.createElement('td');
        td.className = 'ps-3';
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'resumen-tipo-btn';
        boton.setAttribute('aria-expanded', String(abierto));
        boton.dataset.resumenTipo = tipo;
        const icono = document.createElement('i');
        icono.className = 'bi bi-chevron-right resumen-tipo-chevron me-2';
        const nombre = document.createElement('span');
        nombre.className = 'fw-semibold';
        nombre.textContent = tipo;
        const cant = document.createElement('span');
        cant.className = 'badge bg-secondary ms-2';          // solo la cantidad de modelos, como las insignias de los grupos
        cant.textContent = String(modelos.size);
        cant.title = `${modelos.size} ${modelos.size === 1 ? 'modelo' : 'modelos'}`;
        boton.append(icono, nombre, cant);
        td.appendChild(boton);
        tr.appendChild(td);
        celdasContador(tr, c, clases.slice(1), modo);
        filas.push(tr);
        for (const [modelo, m] of [...modelos.entries()].sort(porNombre)) {
            const sub = document.createElement('tr');
            sub.className = 'resumen-modelo';
            sub.dataset.resumenDe = tipo;
            sub.appendChild(celdaModeloResumen(modelo));
            if (busquedaDeModelo(modelo)) {
                sub.dataset.resumenModelo = modelo;
                sub.title = 'Doble clic: ver este modelo en Activos';
            }
            celdasContador(sub, m, clases.slice(1), modo);
            filas.push(uiFilaPlegable(sub, abierto));
        }
    }
    tbody.replaceChildren(...filas);
    pintarTotalGeneral(tbody.closest('table'), porTipo, modo);
    if (!tbody.dataset.resumenPlegable) {           // una sola delegación por tabla: el clic abre o cierra ese tipo
        tbody.dataset.resumenPlegable = '1';
        tbody.addEventListener('click', (e) => {
            const fila = e.target instanceof Element ? e.target.closest('tr.resumen-tipo') : null;
            const b = fila ? fila.querySelector('.resumen-tipo-btn') : null;
            if (!b) return;
            const tipo = b.dataset.resumenTipo, abrir = b.getAttribute('aria-expanded') !== 'true';
            // uno a la vez, como los grupos de Activos y Producción: abrir uno cierra el que estaba abierto
            if (abrir) fijarTiposDesplegados(tbody, abiertos, new Set([...tbody.querySelectorAll('.resumen-tipo-btn')]
                .map((x) => x.dataset.resumenTipo).filter((t) => t !== tipo)), false);
            fijarTiposDesplegados(tbody, abiertos, new Set([tipo]), abrir);
        });
        // doble clic en un modelo: cierra el modal y busca ese modelo en Activos
        tbody.addEventListener('dblclick', (e) => {
            const fila = e.target instanceof Element ? e.target.closest('tr.resumen-modelo[data-resumen-modelo]') : null;
            const query = fila ? busquedaDeModelo(fila.dataset.resumenModelo) : '';
            if (!query) return;
            window.getSelection()?.removeAllRanges();
            const modal = tbody.closest('.modal');
            if (modal && typeof UI !== 'undefined' && UI.modal) UI.modal.cerrar(modal);
            window.buscarConAtajo(query, { campos: CAMPOS_BUSQUEDA, tab: 'v-pills-stock-tab' });
        });
    }
}

// Doble clic en un grabador del detalle de canales: cierra el modal y lo busca en Activos (por su IP)
function iniciarIrAGrabadorDesdeCapacidad() {
    for (const tbody of document.querySelectorAll('#tabla-detalle-capacidad tbody, #tabla-detalle-pantallas tbody')) {
        irAGrabadorAlDobleClic(tbody);
    }
}
function irAGrabadorAlDobleClic(tbody) {
    tbody.addEventListener('dblclick', (e) => {
        const fila = e.target instanceof Element ? e.target.closest('tr[data-nvr-ip]') : null;
        if (!fila) return;
        window.getSelection()?.removeAllRanges();
        const modal = tbody.closest('.modal');
        if (modal && typeof UI !== 'undefined' && UI.modal) UI.modal.cerrar(modal);
        const query = fila.dataset.nvrIp;
        if (query && typeof window.buscarConAtajo === 'function') {
            window.buscarConAtajo(query, { campos: CAMPOS_BUSQUEDA, tab: 'v-pills-stock-tab' });
        }
    });
}

// Primera celda de un modelo del detalle de stock: miniatura (si hay imagen del modelo) + nombre. Solo textContent.
function celdaModeloResumen(modelo) {
    const td = document.createElement('td');
    td.className = 'resumen-modelo-nombre';
    const thumb = document.createElement('span');
    thumb.className = 'resumen-modelo-thumb';
    const ruta = buscarImagenDispositivo(modelo);
    if (ruta) {
        const img = document.createElement('img');
        img.className = 'resumen-modelo-img';
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => img.remove();
        img.src = ruta;
        thumb.appendChild(img);
    }
    const nombre = document.createElement('span');
    nombre.textContent = modelo;
    td.append(thumb, nombre);
    return td;
}

// ---- Chips de los grupos creados por el usuario (Activos) ----
// Un chip por grupo propio del catálogo, después de los tres del sistema, con los mismos datos (total, en uso, disponibles,
// no disponible). Todos abren el MISMO modal de detalle, que se llena con el grupo tocado. Ids de los números: contador
// propio, nunca la clave del grupo (la define el usuario).
const _chipsGrupo = new Map();        // clave del grupo -> { col, prefijo, etiqueta }
let _chipsGrupoSerie = 0;
let _grupoDetalle = null;             // grupo que muestra el modal compartido

function filaChipGrupo(prefijo, rotulo, valorId, clase) {
    const fila = uiNodo('div', clase, `${rotulo}: `);
    const valor = uiNodo('span', 'fw-bold', '-');
    valor.id = `${prefijo}${valorId}`;
    fila.appendChild(valor);
    return fila;
}

function crearChipGrupo(clave, etiqueta) {
    const prefijo = `kpi-stock-g${++_chipsGrupoSerie}-`;
    const col = uiNodo('div', 'col-12 col-infra-half col-xxl-6');
    col.dataset.activosChip = clave;
    const card = uiNodo('div', 'card metric-card chip-compact position-relative kpi-clickable border-0 shadow-sm h-100');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.dataset.uiToggle = 'modal';
    card.dataset.uiTarget = '#modal-detalle-stock-grupo';
    card.addEventListener('click', () => mostrarDetalleGrupo(clave));      // antes que el delegado de ui.js que abre el modal
    const fila = uiNodo('div', 'd-flex align-items-center justify-content-between w-100 h-100');
    const izq = uiNodo('div', 'd-flex align-items-center gap-2');
    const icono = uiNodo('div', 'metric-icon text-primary bg-primary bg-opacity-10 rounded p-2');
    icono.appendChild(uiNodo('i', 'bi bi-box-seam fs-4'));
    const textos = uiNodo('div', 'text-start');
    const total = uiNodo('div', 'metric-value fs-3 fw-bold lh-1', '-');
    total.id = `${prefijo}total`;
    const nombre = uiNodo('div', 'metric-label-text text-secondary small text-uppercase mt-1 kpi-etiqueta-compacta', etiqueta);
    textos.append(total, nombre);
    izq.append(icono, textos);
    const der = uiNodo('div', 'text-end small text-secondary border-start ps-2 py-1 text-nowrap');
    der.id = `${prefijo}desglose`;
    der.append(filaChipGrupo(prefijo, 'En uso', 'uso', 'mb-1'), filaChipGrupo(prefijo, 'Disponibles', 'libres', 'mb-1'),
        filaChipGrupo(prefijo, 'No disponible', 'fuera', ''));
    fila.append(izq, der);
    card.appendChild(fila);
    col.appendChild(card);
    return { col, prefijo, nombre, card, etiqueta };
}

// Deja en Activos exactamente los chips de los grupos propios del catálogo (los crea, renombra, ordena y quita) y los
// pinta con `res.personalizados`. Después de los tres chips fijos, en el orden de presentación del catálogo.
function sincronizarChipsGrupos(res, grupos) {
    const fila = document.getElementById('activos-fila');
    if (!fila) return;
    const propios = gruposPropiosCatalogo(grupos);
    const claves = new Set(propios.map(g => g.clave));
    for (const [clave, chip] of [..._chipsGrupo.entries()]) {
        if (!claves.has(clave)) {
            chip.col.remove();
            _chipsGrupo.delete(clave);
        }
    }
    for (const { clave, etiqueta } of propios) {
        if (!_chipsGrupo.has(clave)) _chipsGrupo.set(clave, crearChipGrupo(clave, etiqueta));
        const chip = _chipsGrupo.get(clave);
        if (chip.etiqueta !== etiqueta) {
            chip.etiqueta = etiqueta;
            chip.nombre.textContent = etiqueta;
        }
        chip.card.title = `Ver el detalle de ${etiqueta}`;
        if (chip.col.parentElement !== fila) fila.appendChild(chip.col);
        const datos = res.personalizados.get(clave);
        pintarKpisStock(chip.prefijo, datos ? datos.total : resumenContador());
    }
    if (_grupoDetalle && !_chipsGrupo.has(_grupoDetalle)) _grupoDetalle = null;
    aplicarOrdenChipsActivos(propios.map(g => g.clave));
}

// Orden de los chips de Activos: el que eligió la persona (`panel.activos_orden`) y, lo que no nombra (un grupo nuevo), en el
// orden de fábrica: los tres del sistema y después los grupos del catálogo. Un id que ya no existe se descarta.
const CLAVE_ORDEN_CHIPS_ACTIVOS = 'cctv:activos_orden';
const CHIPS_ACTIVOS_SISTEMA = ['camaras', 'servidores', 'otros'];
let _reordenChipsActivos = null;                 // uiReordenable de la fila (con uno en movimiento no se acomoda debajo)

const CLAVE_ACTIVOS_OCULTOS = 'cctv:activos_ocultos';
const ETIQUETAS_CHIPS_ACTIVOS = { camaras: 'Cámaras', servidores: 'Servidores', otros: 'Otros dispositivos' };

function itemsChipsActivos() {
    const fila = document.getElementById('activos-fila');
    return fila ? [...fila.children].filter(c => c.dataset.activosChip).map(c => ({
        id: c.dataset.activosChip,
        etiqueta: ETIQUETAS_CHIPS_ACTIVOS[c.dataset.activosChip] || (_chipsGrupo.get(c.dataset.activosChip) || {}).etiqueta
            || c.dataset.activosChip,
    })) : [];
}

let _pintarVisibilidadActivos = null;           // uiVisibilidadElementos de la fila (lo arma iniciarReordenChipsActivos)
function aplicarVisibilidadChipsActivos(animar = false) {
    if (_pintarVisibilidadActivos) _pintarVisibilidadActivos(animar);
}

function aplicarOrdenChipsActivos(clavesPropias = [..._chipsGrupo.keys()]) {
    const fila = document.getElementById('activos-fila');
    if (!fila || (_reordenChipsActivos && _reordenChipsActivos.activo())) return;
    const existentes = [...fila.children].map(c => c.dataset.activosChip);
    const deFabrica = [...CHIPS_ACTIVOS_SISTEMA, ...clavesPropias].filter(c => existentes.includes(c));
    const orden = ordenarIdsSecciones(deFabrica, storage.getJSON(CLAVE_ORDEN_CHIPS_ACTIVOS, null));
    if (orden.join() !== existentes.join()) {
        for (const clave of orden) {
            const col = [...fila.children].find(c => c.dataset.activosChip === clave);
            if (col) fila.appendChild(col);
        }
    }
    aplicarVisibilidadChipsActivos(false);        // (con el orden y los grupos al día, también cuáles se ven y el menú)
}

function iniciarReordenChipsActivos() {
    const fila = document.getElementById('activos-fila');
    if (!fila) return;
    _reordenChipsActivos = uiReordenable(fila, {
        selector: '[data-activos-chip]', clave: c => c.dataset.activosChip,
        alGuardar: () => preferencias.setJSON(CLAVE_ORDEN_CHIPS_ACTIVOS, [...fila.children].map(c => c.dataset.activosChip)),
    });
    preferencias.alAplicar(CLAVE_ORDEN_CHIPS_ACTIVOS, () => aplicarOrdenChipsActivos());
    _pintarVisibilidadActivos = uiVisibilidadElementos({
        menu: document.getElementById('activos-eje-menu'), clave: CLAVE_ACTIVOS_OCULTOS, items: itemsChipsActivos,
        idDe: c => c.dataset.activosChip, elementos: () => [...fila.children].filter(c => c.dataset.activosChip),
    });
    _pintarVisibilidadActivos(false);
}

// Las tablas de los modales de detalle de stock (servidores, otros y cámaras; el grupo propio lo pinta pintarDetalleGrupo)
function pintarTablasDetalleStock(res) {
    pintarTablaTipos('#tabla-detalle-stock tbody', res.servidores.porTipo);
    pintarTablaTipos('#tabla-detalle-stock-otros tbody', res.otros.porTipo);
    pintarTablaTipos('#tabla-stock-cam-tipo tbody', res.camaras.porTipo);
}

// Llena el modal compartido con el grupo `clave` (el chip lo pide al tocarlo; después se renueva con cada resumen)
function mostrarDetalleGrupo(clave) {
    if (_grupoDetalle !== clave) _tiposDesplegados.delete('#tabla-stock-grupo-tipo tbody');
    _grupoDetalle = clave;
    pintarDetalleGrupo();
}

function pintarDetalleGrupo() {
    const chip = _grupoDetalle ? _chipsGrupo.get(_grupoDetalle) : null;
    if (!chip || !_cacheStockResumen) return;
    const res = resumirStock(_cacheStockResumen.dispositivos, stockEtiquetas(_cacheStockResumen.tipos), stockGrupoDeActual);
    const datos = res.personalizados.get(_grupoDetalle);
    uiPonerTexto('modal-stock-grupo-texto', `Detalle de ${chip.etiqueta}`);
    pintarTablaTipos('#tabla-stock-grupo-tipo tbody', datos ? datos.porTipo : new Map());
}

// Pinta el color del anillo (`progress-ring-ok|aviso|critico`) según el porcentaje usado (nivelCapacidad)
const NIVELES_ANILLO = ['ok', 'aviso', 'critico'];
function pintarNivelAnillo(circulo, pct) {
    if (!circulo) return;
    const nivel = nivelCapacidad(pct);
    for (const n of NIVELES_ANILLO) circulo.classList.toggle(`progress-ring-${n}`, n === nivel);
}

// Canales: un anillo por grabador (porcentaje en uso de su capacidad) dentro de la tarjeta del chip, en el espacio libre;
// visible solo si la sección ocupa mucho ancho (CSS). Se rearma solo si cambió algún número.
let _firmaGraficosGrabadores = '';
const ANILLO_GRABADOR = { tam: 48, radio: 19, trazo: 5 };
function nodoAnilloGrabador(clave, c) {
    const nombre = c.nombre || clave;                  // solo el nombre del grabador (la IP está en el tooltip)
    const { tam, radio, trazo } = ANILLO_GRABADOR;
    const pct = c.cap > 0 ? Math.min(100, Math.round((c.enUso / c.cap) * 100)) : 0;
    const circ = 2 * Math.PI * radio;
    const tarjeta = uiNodo('div', 'cap-grabador');       // sin tarjeta propia: va dentro de la del chip, que abre el detalle
    tarjeta.title = `${clave}: ${c.enUso} de ${c.cap} canales en uso`;
    const fila = uiNodo('div', 'd-flex align-items-center gap-2');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'progress-ring flex-shrink-0');
    svg.setAttribute('width', String(tam));
    svg.setAttribute('height', String(tam));
    svg.setAttribute('viewBox', `0 0 ${tam} ${tam}`);
    for (const clase of ['progress-ring-bg', 'progress-ring-circle']) {
        const c2 = document.createElementNS(NS, 'circle');
        c2.setAttribute('class', clase);
        c2.setAttribute('cx', String(tam / 2));
        c2.setAttribute('cy', String(tam / 2));
        c2.setAttribute('r', String(radio));
        c2.setAttribute('stroke-width', String(trazo));
        c2.setAttribute('fill', 'none');
        if (clase === 'progress-ring-circle') {
            pintarNivelAnillo(c2, pct);
            c2.setAttribute('stroke-linecap', 'round');
            c2.style.strokeDasharray = String(circ);
            c2.style.strokeDashoffset = String(circ - (pct / 100) * circ);
        }
        svg.appendChild(c2);
    }
    const caja = uiNodo('div', 'position-relative d-flex align-items-center justify-content-center flex-shrink-0');
    const centro = uiNodo('span', 'position-absolute fw-bold small lh-1', `${pct}%`);
    caja.append(svg, centro);
    const textos = uiNodo('div', 'min-w-0');
    textos.append(uiNodo('div', 'small fw-semibold text-truncate', nombre),
        uiNodo('div', 'small text-secondary', `${c.enUso} / ${c.cap} CH`));
    fila.append(caja, textos);
    tarjeta.appendChild(fila);
    return tarjeta;
}

function pintarGraficosGrabadores(cap) {
    const caja = document.getElementById('cap-grabadores');
    if (!caja) return;
    const entradas = [...cap.detalle.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
    const firma = JSON.stringify(entradas);
    caja.classList.toggle('d-none', entradas.length === 0);
    if (firma === _firmaGraficosGrabadores) return;
    _firmaGraficosGrabadores = firma;
    caja.replaceChildren(...entradas.map(([clave, c]) => nodoAnilloGrabador(clave, c)));
}

async function actualizarResumenInfraestructura() {
    const contenedorChips = document.getElementById('infra-chips');
    const secCanales = document.getElementById('canales-section');
    if (!contenedorChips && !secCanales) return;

    // 1. Capacidad instalada (grabadores en producción)
    const cap = resumirCapacidad(globalData.nvrs, globalData.camaras,
        (n) => capacidadConsultadaNvr(n.ip) || obtenerCapacidadCanalesNvr(n.modelo));
    // El % cuenta desde 0 al cargar (animaciones.js) y el anillo lo acompaña cuadro a cuadro: su transición CSS no
    // corre en la primera carga (la sección todavía está oculta) y durante la cuenta se apaga para no ir detrás; con
    // a = 1 vuelve, así los cambios posteriores siguen animándose por CSS.
    const circulo = document.getElementById('kpi-cap-circle');
    pintarNivelAnillo(circulo, cap.pct);
    const circunferencia = circulo ? 2 * Math.PI * Number(circulo.getAttribute('r')) : 0;   // el radio sale del SVG
    ponerTextoConteoId('kpi-cap-pct', `${cap.pct}%`, circulo ? (a) => {
        circulo.style.transition = a < 1 ? 'none' : '';
        circulo.style.strokeDashoffset = circunferencia - (cap.pct * a / 100) * circunferencia;
    } : null);
    uiPonerTexto('kpi-cap-total', cap.total);
    uiPonerTexto('kpi-cap-uso', cap.enUso);
    uiPonerTexto('kpi-cap-libres', cap.libres);
    _ultimaCapacidad = cap;
    pintarDetalleCapacidad();
    pintarGraficosGrabadores(cap);

    // 2. Stock: lo avisa la pestaña Stock con 'cctv:stock' cada vez que carga; si todavía no, se pide una vez acá
    if (!_cacheStockResumen) await cargarStockResumen();
    if (_cacheStockResumen) {
        const res = resumirStock(_cacheStockResumen.dispositivos, stockEtiquetas(_cacheStockResumen.tipos), stockGrupoDeActual);
        _ultimoResumenStock = res;
        _ultimosGruposStock = _cacheStockResumen.grupos;
        pintarKpisStock('kpi-stock-', res.servidores.total);
        pintarKpisStock('kpi-stock-cam-', res.camaras.total);
        pintarKpisStock('kpi-stock-otros-', res.otros.total);
        pintarTablasDetalleStock(res);
        sincronizarChipsGrupos(res, _cacheStockResumen.grupos);
        pintarDetalleGrupo();
    }
    
    if (secCanales) secCanales.classList.remove('d-none');
    if (contenedorChips) contenedorChips.classList.remove('d-none');
    if (typeof animarCargaBlur === 'function') animarCargaDashboard();
}

let _animacionCargaDashboardHecha = false;
const CASCADA_PASO_MS = 140;          // entre una fila de secciones y la siguiente
const CASCADA_VENTANA_MS = 4000;      // secciones que aparecen tarde (sin datos al principio) entran igual en la cascada
// ==== CASCADA DE CARGA BEGIN ====
// Fila de cada sección según su lugar en el panel (zona y posición dentro de ella), no según lo que mida al pintar:
// las que empiezan ocultas (d-none) ocupan su lugar igual, así la medición temprana no desordena la cascada.
// `zonas` = {arriba: [ids], izq: [ids], der: [ids]}; las dos columnas arrancan debajo de las de «arriba».
function filaCascada(zonas, id) {
    const arriba = zonas.arriba || [];
    const i = arriba.indexOf(id);
    if (i >= 0) return i;
    for (const z of ['izq', 'der']) {
        const k = (zonas[z] || []).indexOf(id);
        if (k >= 0) return arriba.length + k;
    }
    return arriba.length;
}
function retrasoCascada(zonas, id, paso) {
    const lado = (zonas.der || []).indexOf(id) >= 0 ? 0.5 : 0;   // a igual fila, primero la columna izquierda
    return Math.round((filaCascada(zonas, id) + lado) * paso);
}
// ==== CASCADA DE CARGA END ====
function zonasActuales() {
    const zonas = {};
    for (const z of ZONAS_DASHBOARD) {
        const cont = document.querySelector(`.dashboard-zona[data-zona="${z}"]`);
        zonas[z] = cont ? Array.from(cont.children).map((h) => h.id).filter((id) => IDS_SECCIONES_REUBICABLES.includes(id)) : [];
    }
    return zonas;
}
function animarCargaDashboard() {
    if (_animacionCargaDashboardHecha) return;
    _animacionCargaDashboardHecha = true;
    const inicio = performance.now();
    const secciones = IDS_SECCIONES_REUBICABLES.map((id) => document.getElementById(id)).filter(Boolean);
    const zonas = zonasActuales();
    // El retraso sale del lugar de la sección en el panel (más cerca del encabezado = antes): un solo criterio para
    // todas, también para las que se muestran más tarde (se descuenta lo ya transcurrido).
    const animar = (el) => {
        const espera = retrasoCascada(zonas, el.id, CASCADA_PASO_MS) - (performance.now() - inicio);
        animarCargaBlur(el, { delay: Math.max(0, Math.round(espera)), duracion: 650 });
    };
    const visibles = secciones.filter((el) => !el.classList.contains('d-none'));
    visibles.forEach(animar);
    // Las que todavía estaban ocultas (d-none) y se muestran dentro de la ventana
    const pendientes = secciones.filter((el) => el.classList.contains('d-none'));
    if (pendientes.length && typeof MutationObserver === 'function') {
        const obs = new MutationObserver(() => {
            for (const el of pendientes) {
                if (!el.classList.contains('d-none')) { animar(el); pendientes.splice(pendientes.indexOf(el), 1); }
            }
            if (!pendientes.length) obs.disconnect();
        });
        pendientes.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
        setTimeout(() => obs.disconnect(), CASCADA_VENTANA_MS);
    }
    document.documentElement.removeAttribute('data-cargando');
}

// Rueda del mouse sobre el panel lateral: recorre las pestañas (el panel mismo —plegar, mover, popups— es de ../shared/ui/js/panel.js)
function inicializarRuedaPanel() {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebarCol = document.getElementById('sidebar-col');
    if (!sidebarCol || !btnToggle) return;

    let ultimaRuedaPanel = 0;
    const onWheelPanel = (ev) => {
        if (!ruedaRecorrePestanas()) return;                 // Ajustes: apagado, la rueda desplaza el panel como siempre
        if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return;
        if (document.documentElement.classList.contains('modo-kiosco')) return;
        if (typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function' && UI.modal.arriba()) return;
        if (document.querySelector('.modal.show:not(.modal-flotante), [role="dialog"].show:not(.modal-flotante), .modal-backdrop')) return;
        if (ev.target instanceof Element && ev.target.closest('.dropdown-menu')) return;

        const delta = ev.deltaY !== 0 ? ev.deltaY : ev.deltaX;
        if (!delta) return;

        ev.preventDefault();
        ev.stopPropagation();
        const ahora = Date.now();
        if (ahora - ultimaRuedaPanel < 200) return;
        ultimaRuedaPanel = ahora;

        const tabs = Array.from(document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]'))
            .filter(t => !t.classList.contains('d-none') && !t.disabled && !t.hasAttribute('data-sin-ciclo'));
        if (!tabs.length) return;
        const indiceActual = tabs.findIndex(t => t.classList.contains('active'));
        const siguiente = calcularPestanaRueda(indiceActual, tabs.length, delta);
        if (siguiente >= 0 && tabs[siguiente] && typeof UI !== 'undefined' && UI.pestana) {
            UI.pestana.mostrar(tabs[siguiente]);
        }
    };
    sidebarCol.addEventListener('wheel', onWheelPanel, { passive: false });
    const zonaOcultar = btnToggle.parentElement;
    if (zonaOcultar && zonaOcultar !== sidebarCol) {
        zonaOcultar.addEventListener('wheel', (ev) => {
            if (!sidebarCol.contains(zonaOcultar)) onWheelPanel(ev);
        }, { passive: false });
    }
}

// ==== REORDEN SECCIONES PURO BEGIN ====
const IDS_SECCIONES_REUBICABLES = [
    'canales-section',
    'infra-chips',
    'favoritos-section'
];
// Zonas del panel Estado: «arriba» (todo el ancho) y las dos columnas. Disposición de fábrica.
const ZONAS_DASHBOARD = ['arriba', 'izq', 'der'];
const DISPOSICION_POR_DEFECTO = {
    arriba: ['favoritos-section'],
    izq: ['canales-section'],
    der: ['infra-chips']
};

/**
 * Calcula la lista ordenada de IDs combinando los IDs existentes con el orden guardado.
 * Mantiene elementos existentes válidos según el orden guardado y agrega al final los faltantes.
 * @param {string[]} idsExistentes
 * @param {string[]|null} ordenGuardado
 * @returns {string[]}
 */
function ordenarIdsSecciones(idsExistentes, ordenGuardado) {
    if (!Array.isArray(ordenGuardado)) return [...idsExistentes];
    const validos = ordenGuardado.filter(id => idsExistentes.includes(id));
    const restantes = idsExistentes.filter(id => !validos.includes(id));
    return [...validos, ...restantes];
}

/**
 * Reparte las secciones entre las zonas con lo guardado en el navegador (entrada no confiable: se valida).
 * Cada sección queda en UNA sola zona (la primera que la nombra); las que no aparecen (o ids que no existen más) vuelven a
 * su zona de fábrica, al final. Un arreglo suelto es el formato anterior (solo el orden de la columna izquierda).
 * @param {Object<string,string[]>} porDefecto - zona -> ids
 * @param {*} guardado
 * @returns {Object<string,string[]>}
 */
function distribuirSecciones(porDefecto, guardado) {
    const zonas = Object.keys(porDefecto);
    const conocidos = zonas.flatMap(z => porDefecto[z]);
    let guardadoPorZona = Object.create(null);
    if (Array.isArray(guardado)) {
        guardadoPorZona.izq = guardado;
    } else if (guardado && typeof guardado === 'object') {
        for (const z of zonas) {
            if (Array.isArray(guardado[z])) guardadoPorZona[z] = guardado[z];
        }
    }
    const puestos = new Set();
    const resultado = {};
    for (const z of zonas) {
        resultado[z] = [];
        for (const id of (guardadoPorZona[z] || [])) {
            if (conocidos.includes(id) && !puestos.has(id)) {
                puestos.add(id);
                resultado[z].push(id);
            }
        }
    }
    for (const z of zonas) {
        for (const id of porDefecto[z]) {
            if (!puestos.has(id)) {
                puestos.add(id);
                resultado[z].push(id);
            }
        }
    }
    return resultado;
}

/**
 * Zona que contiene el punto (x, y), o null si cae entre zonas.
 * @param {{ zona: string, left: number, right: number, top: number, bottom: number }[]} rectsZonas
 * @returns {string|null}
 */
function zonaEnPunto(rectsZonas, x, y) {
    for (const r of rectsZonas) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r.zona;
    }
    return null;
}

/**
 * Posición donde entra una sección que llega a una zona: tras todas las secciones cuyo punto medio queda arriba del puntero.
 * @param {{ top: number, height: number }[]} rectsVisibles - secciones visibles de la zona de destino, en orden
 * @returns {number} 0..rectsVisibles.length
 */
function indiceInsercion(rectsVisibles, clientY) {
    let n = 0;
    for (const r of rectsVisibles) {
        if (clientY > r.top + r.height / 2) n++;
    }
    return n;
}

/**
 * Alt+flecha sobre una sección: a qué zona pasa (null = se queda y se reordena dentro de su zona o no hace nada).
 * Izquierda/derecha cambian de columna conservando la posición; arriba desde el primero de una columna sube a la zona de
 * arriba (al final); abajo desde el último de la zona de arriba baja a la columna izquierda (al principio).
 * @param {string} zona
 * @param {string} tecla - 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
 * @param {number} idx - posición entre las visibles de su zona
 * @param {number} total - cuántas visibles tiene su zona
 * @returns {{ zona: string, indice: number }|null}
 */
function destinoTeclado(zona, tecla, idx, total) {
    if (tecla === 'ArrowLeft' && zona === 'der') return { zona: 'izq', indice: idx };
    if (tecla === 'ArrowRight' && zona === 'izq') return { zona: 'der', indice: idx };
    if (tecla === 'ArrowUp' && idx === 0 && (zona === 'izq' || zona === 'der')) return { zona: 'arriba', indice: Infinity };
    if (tecla === 'ArrowDown' && zona === 'arriba' && idx === total - 1) return { zona: 'izq', indice: 0 };
    return null;
}

/**
 * Determina si debe intercambiarse la posición de la sección arrastrada con un vecino
 * según la coordenada Y del puntero y los puntos medios de los vecinos.
 * @param {number} idxActual - Índice de la sección arrastrada en la lista de secciones visibles
 * @param {{ top: number, height: number }[]} rectsVisibles - Rectángulos de cada sección visible
 * @param {number} clientY - Coordenada vertical del puntero
 * @returns {'arriba'|'abajo'|null} - Dirección del intercambio o null si no corresponde
 */
function evaluarIntercambioSecciones(idxActual, rectsVisibles, clientY) {
    if (idxActual < 0 || idxActual >= rectsVisibles.length) return null;

    // Verificar con el vecino de arriba: si el puntero sube más allá de su punto medio
    if (idxActual > 0) {
        const rArriba = rectsVisibles[idxActual - 1];
        if (rArriba) {
            const puntoMedioArriba = rArriba.top + rArriba.height / 2;
            if (clientY < puntoMedioArriba) return 'arriba';
        }
    }

    // Verificar con el vecino de abajo: si el puntero baja más allá de su punto medio
    if (idxActual < rectsVisibles.length - 1) {
        const rAbajo = rectsVisibles[idxActual + 1];
        if (rAbajo) {
            const puntoMedioAbajo = rAbajo.top + rAbajo.height / 2;
            if (clientY > puntoMedioAbajo) return 'abajo';
        }
    }

    return null;
}
// ==== REORDEN SECCIONES PURO END ====

const CLAVE_COLAPSO_CANALES = 'cctv:colapso_canales';
const CLAVE_COLAPSO_ACTIVOS = 'cctv:colapso_activos';
const CLAVE_COLAPSO_FAVORITOS = 'cctv:colapso_favoritos';
const CLAVE_ORDEN_RESUMEN = 'cctv:orden_resumen';                 // formato anterior: solo el orden de la columna izquierda
const CLAVE_DISPOSICION_RESUMEN = 'cctv:disposicion_resumen';     // zona -> ids de sus secciones
let _ignorarClickToggle = false;
let _bloquearClickTimeout = null;

function alternarSeccionDashboard(idColapso, idToggle, claveStorage) {
    if (_ignorarClickToggle) return;
    const colapso = document.getElementById(idColapso);
    const toggle = document.getElementById(idToggle);
    if (!colapso || !toggle) return;
    const estaAbierto = colapso.classList.contains('show');
    const nuevoAbierto = !estaAbierto;
    colapso.classList.toggle('show', nuevoAbierto);
    toggle.setAttribute('aria-expanded', nuevoAbierto ? 'true' : 'false');
    if (typeof preferencias !== 'undefined') {
        preferencias.set(claveStorage, nuevoAbierto ? '0' : '1');
    }
}

// Abre o contrae la sección según lo guardado (al iniciar y cuando llegan las preferencias de la persona)
function aplicarColapsoDashboard(colapso, toggle, claveStorage) {
    const colapsado = (typeof storage !== 'undefined') && storage.get(claveStorage) === '1';
    colapso.classList.toggle('show', !colapsado);
    toggle.setAttribute('aria-expanded', colapsado ? 'false' : 'true');
}

function inicializarSeccionDashboard(idColapso, idToggle, claveStorage) {
    const colapso = document.getElementById(idColapso);
    const toggle = document.getElementById(idToggle);
    if (!colapso || !toggle) return;
    aplicarColapsoDashboard(colapso, toggle, claveStorage);
    preferencias.alAplicar(claveStorage, () => aplicarColapsoDashboard(colapso, toggle, claveStorage));
    toggle.addEventListener('click', (e) => {
        if (_ignorarClickToggle) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        alternarSeccionDashboard(idColapso, idToggle, claveStorage);
    });
    toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            alternarSeccionDashboard(idColapso, idToggle, claveStorage);
        }
    });
}

function inicializarSeccionesColapsablesDashboard() {
    inicializarSeccionDashboard('canales-collapse', 'canales-toggle', CLAVE_COLAPSO_CANALES);
    inicializarSeccionDashboard('activos-collapse', 'activos-toggle', CLAVE_COLAPSO_ACTIVOS);
    inicializarSeccionDashboard('favoritos-collapse', 'favoritos-toggle', CLAVE_COLAPSO_FAVORITOS);
}

function zonasDashboard() {
    const zonas = [];
    for (const zona of ZONAS_DASHBOARD) {
        const el = document.querySelector(`.dashboard-zona[data-zona="${zona}"]`);
        if (el) zonas.push({ zona, el });
    }
    return zonas;
}

// Secciones reubicables de una zona, en orden (con `soloVisibles`, sin las que todavía no tienen datos: d-none).
function seccionesDeZona(elZona, soloVisibles) {
    return Array.from(elZona.children).filter(
        el => IDS_SECCIONES_REUBICABLES.includes(el.id) && !(soloVisibles && el.classList.contains('d-none'))
    );
}

function guardarOrdenSeccionesResumen() {
    if (typeof storage === 'undefined') return;
    const disposicion = {};
    for (const { zona, el } of zonasDashboard()) {
        disposicion[zona] = seccionesDeZona(el, false).map(sec => sec.id);
    }
    preferencias.setJSON(CLAVE_DISPOSICION_RESUMEN, disposicion);
}

function aplicarOrdenSeccionesResumen() {
    if (typeof storage === 'undefined') return;
    const zonas = zonasDashboard();
    if (zonas.length !== ZONAS_DASHBOARD.length) return;
    const guardado = storage.getJSON(CLAVE_DISPOSICION_RESUMEN, null) || storage.getJSON(CLAVE_ORDEN_RESUMEN, null);
    const disposicion = distribuirSecciones(DISPOSICION_POR_DEFECTO, guardado);
    for (const { zona, el } of zonas) {
        for (const id of disposicion[zona]) {
            const sec = document.getElementById(id);
            if (sec) el.appendChild(sec);
        }
    }
}

// Pone `seccion` en la posición `indice` entre las visibles de `elZona` (pasado el final = al final).
function colocarSeccionEnZona(seccion, elZona, indice) {
    const visibles = seccionesDeZona(elZona, true).filter(sec => sec !== seccion);
    if (indice >= visibles.length) {
        const ultima = visibles[visibles.length - 1];
        if (ultima) ultima.after(seccion);
        else elZona.appendChild(seccion);
    } else {
        visibles[Math.max(0, indice)].before(seccion);
    }
}

// Mueve secciones con recorrido visible (uiAnimarReubicacion, el mismo de las columnas de Listar): las que cambian de
// lugar se deslizan, la arrastrada por encima. Devuelve true si algo se movió (para no evaluar otro intercambio
// mientras se deslizan: las posiciones a medias harían ir y venir a la sección).
function reubicarSecciones(cambiar, arrastrada = null) {
    const visibles = () => IDS_SECCIONES_REUBICABLES.map(id => document.getElementById(id))
        .filter(el => el && !el.classList.contains('d-none'));
    return uiAnimarReubicacion(visibles, el => el.id, cambiar, { encima: arrastrada }).length > 0;
}

function inicializarReordenSeccionesDashboard() {
    if (zonasDashboard().length === 0) return;

    let seccionArrastrada = null;
    let toggleArrastrado = null;
    let ultimoCambioZona = null;        // dónde cambió de zona por última vez: evita ir y venir mientras el diseño se acomoda
    let deslizandoHasta = 0;            // hasta cuándo se deslizan las secciones movidas (no se evalúa otro cambio)
    const reubicar = (cambiar) => {
        if (reubicarSecciones(cambiar, seccionArrastrada)) deslizandoHasta = performance.now() + REUBICACION_MS;
    };

    // Cambio de zona: solo si el puntero está dentro de otra y se movió lo suficiente desde el último cambio
    const moverAOtraZona = (e) => {
        const zonas = zonasDashboard();
        const rects = zonas.map(({ zona, el }) => {
            const r = el.getBoundingClientRect();
            return { zona, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
        const destino = zonas.find(z => z.zona === zonaEnPunto(rects, e.clientX, e.clientY));
        if (!destino || destino.el === seccionArrastrada.parentElement) return false;
        if (ultimoCambioZona && Math.hypot(e.clientX - ultimoCambioZona.x, e.clientY - ultimoCambioZona.y) < 24) return false;
        const vecinas = seccionesDeZona(destino.el, true).map(sec => sec.getBoundingClientRect());
        reubicar(() => colocarSeccionEnZona(seccionArrastrada, destino.el, indiceInsercion(vecinas, e.clientY)));
        ultimoCambioZona = { x: e.clientX, y: e.clientY };
        return true;
    };

    // Mantener presionado el encabezado y arrastrar (uiArrastreLargo): entre zonas y dentro de cada una
    const alMover = (e) => {
        if (performance.now() < deslizandoHasta) return;
        if (moverAOtraZona(e)) return;

        const visibles = seccionesDeZona(seccionArrastrada.parentElement, true);
        const idxActual = visibles.indexOf(seccionArrastrada);
        if (idxActual === -1) return;

        const rects = visibles.map(el => el.getBoundingClientRect());
        const accion = evaluarIntercambioSecciones(idxActual, rects, e.clientY);

        if (accion === 'arriba') {
            const vecino = visibles[idxActual - 1];
            if (vecino) reubicar(() => vecino.before(seccionArrastrada));
        } else if (accion === 'abajo') {
            const vecino = visibles[idxActual + 1];
            if (vecino) reubicar(() => vecino.after(seccionArrastrada));
        }
    };
    uiArrastreLargo(document, {
        elegir: (e) => {
            const toggle = e.target instanceof Element ? e.target.closest('.dashboard-zona .resumen-seccion-toggle') : null;
            const seccion = toggle ? toggle.closest('.resumen-seccion-reubicable') : null;
            if (!seccion || !IDS_SECCIONES_REUBICABLES.includes(seccion.id)) return null;
            toggleArrastrado = toggle;
            return seccion;
        },
        capturar: () => toggleArrastrado,
        alEmpezar: (seccion) => {
            seccionArrastrada = seccion;
            _ignorarClickToggle = true;
            seccion.classList.add('resumen-seccion-reordenando');
            toggleArrastrado.classList.add('resumen-toggle-arrastrando');
            document.body.classList.add('resumen-arrastrando-activo');
        },
        alMover,
        alTerminar: (seccion) => {             // lo movido ya quedó en su lugar (también con Escape)
            seccion.classList.remove('resumen-seccion-reordenando');
            toggleArrastrado.classList.remove('resumen-toggle-arrastrando');
            document.body.classList.remove('resumen-arrastrando-activo');
            guardarOrdenSeccionesResumen();
            _ignorarClickToggle = true;
            if (_bloquearClickTimeout) clearTimeout(_bloquearClickTimeout);
            _bloquearClickTimeout = setTimeout(() => {
                _ignorarClickToggle = false;
                _bloquearClickTimeout = null;
            }, 100);
            seccionArrastrada = null;
            toggleArrastrado = null;
            ultimoCambioZona = null;
        },
    });

    // Con teclado (Alt + flechas sobre el encabezado), el mismo recorrido
    const toggles = document.querySelectorAll('.dashboard-zona .resumen-seccion-toggle');
    toggles.forEach(toggle => {
        toggle.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const seccion = toggle.closest('.resumen-seccion-reubicable');
            if (!seccion || !IDS_SECCIONES_REUBICABLES.includes(seccion.id)) return;

            const elZona = seccion.parentElement;
            const visibles = seccionesDeZona(elZona, true);
            const idx = visibles.indexOf(seccion);
            if (idx === -1) return;

            let mover = null;
            const cambio = destinoTeclado(elZona.dataset.zona, e.key, idx, visibles.length);
            if (cambio) {
                const destino = zonasDashboard().find(z => z.zona === cambio.zona);
                if (destino) mover = () => colocarSeccionEnZona(seccion, destino.el, cambio.indice);
            } else if (e.key === 'ArrowUp' && idx > 0) {
                mover = () => visibles[idx - 1].before(seccion);
            } else if (e.key === 'ArrowDown' && idx < visibles.length - 1) {
                mover = () => visibles[idx + 1].after(seccion);
            }
            if (!mover) return;
            reubicarSecciones(mover, seccion);                  // con teclado (Alt + flechas), el mismo recorrido
            e.preventDefault();
            guardarOrdenSeccionesResumen();
            toggle.focus();
        });
    });
}

// Las tarjetas de capacidad y stock abren su modal por data-ui-toggle (index.html): no necesitan listeners
document.addEventListener('DOMContentLoaded', () => {
    aplicarOrdenSeccionesResumen();
    preferencias.alAplicar(CLAVE_DISPOSICION_RESUMEN, aplicarOrdenSeccionesResumen);
    inicializarRuedaPanel();
    inicializarSeccionesColapsablesDashboard();
    inicializarReordenSeccionesDashboard();
    iniciarReordenChipsActivos();
    iniciarIrAGrabadorDesdeCapacidad();
    initEjeActivos();
    iniciarRellenoPie();
});

document.addEventListener('cctv:datos', actualizarResumenInfraestructura);
// La pestaña Stock avisa cada carga (también tras alta, edición o borrado): el resumen nunca queda viejo.
document.addEventListener('cctv:stock', (e) => {
    if (!e.detail || !stockRespuestaValida(e.detail)) return;
    _cacheStockResumen = e.detail;
    actualizarResumenInfraestructura();
    if (globalData && globalData.camaras) {
        ejecutarFiltro(terminoBusquedaActual());
    }
});
