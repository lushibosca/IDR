// Stock: funciones PURAS (sin DOM ni red) de la pestaña, separadas de static/stock.js, que se carga después y las usa.
// Se prueban en node (tests/js/stock.test.mjs) extrayendo el bloque entre marcadores; globales de página, no módulos.

// ==== STOCK PURO BEGIN ====
// Funciones puras (sin DOM ni red): las prueba tests/js/stock.test.mjs extrayendo este bloque.
const STOCK_ND = '—';
const STOCK_CONDICIONES = new Map([
    ['operativo', 'Operativo'], ['revisar', 'A revisar'], ['averiado', 'Averiado'],
    ['descontinuado', 'Descontinuado'], ['desafectado', 'Desafectado'], ['perdido', 'Perdido'], ['baja', 'Baja']
]);
// Criterios de agrupamiento (los mismos del SGC). El primero es el de defecto.
const STOCK_AGRUPAMIENTOS = new Map([
    ['tipo', 'Grupo / Tipo'], ['edificio', 'Edificio / Piso'], ['estado', 'Estado'], ['marca', 'Marca'],
    ['modelo', 'Modelo'], ['modelo-firmware', 'Modelo / Firmware'], ['patrimonio', 'Patrimonio'], ['ninguno', 'Sin agrupar']
]);
// Estado "efectivo" de un dispositivo: en producción si está instalado; si no, disponible o su condición
const STOCK_ESTADOS = new Map([
    ['produccion', 'En producción'], ['disponible', 'Disponibles'], ['revisar', 'A revisar'], ['averiado', 'Averiados'],
    ['desafectado', 'Desafectados'], ['perdido', 'Perdidos'], ['descontinuado', 'Descontinuados'], ['baja', 'Dados de baja']
]);
const STOCK_TODOS = 'Todos';   // el único grupo de «Sin agrupar» (con su contador, como cualquier otro)
const STOCK_SIN = '￿';          // ordena los grupos "Sin ..." al final

// La respuesta debe tener la forma de StockV1 (cctv/web/schemas.py); si no, se rechaza antes de pintar nada
function stockRespuestaValida(r) {
    return !!r && typeof r.inicializado === 'boolean' && typeof r.editable === 'boolean' && Array.isArray(r.dispositivos)
        && Array.isArray(r.grupos) && Array.isArray(r.tipos) && Array.isArray(r.condiciones)
        && Array.isArray(r.edificios) && Array.isArray(r.pisos)
        && r.dispositivos.every(d => stockDispositivoValido(d));
}

function stockDispositivoValido(d) {
    return !!d && typeof d.id === 'string' && typeof d.tipo === 'string' && typeof d.condicion === 'string'
        && typeof d.en_uso === 'boolean' && typeof d.disponible === 'boolean' && Number.isInteger(d.version);
}

function stockEtiquetas(opciones) {
    return new Map(opciones.map(o => [o.clave, o.etiqueta]));
}

const STOCK_GRUPO_CAMARAS = 'camaras';
const STOCK_GRUPO_SERVIDORES = 'servidores';
const STOCK_GRUPO_OTROS = 'otros';
// «servidores» busca el GRUPO (NVR, DVR, analítica, decoder...); «nvr»/«grabador»/«dvr», solo los grabadores
const STOCK_RE_TOKEN_SERVIDORES = /^servidor(es)?$/i;
// En producción SOLO un equipo operativo (no hay dos estados a la vez); el servidor lo vuelve a validar
const STOCK_CONDICION_PRODUCCION = 'operativo';
const STOCK_SIN_RELEVAR = 'Sin relevar';      // serie o MAC vacías (nunca se muestra el id interno)
const STOCK_CLASE_AVISO = new Map([['info', 'alert alert-info py-1 px-2 small mb-2'],
    ['warning', 'alert alert-warning py-1 px-2 small mb-2'], ['danger', 'alert alert-danger py-1 px-2 small mb-2']]);

// Dónde ve el monitoreo a un dispositivo del stock (la cámara o el NVR de /api/v2/datos con ese `stock.id`), o ''
function stockVistoEn(id, camaras, nvrs) {
    if (!id) return '';
    const cam = (Array.isArray(camaras) ? camaras : []).find(c => c && c.stock && c.stock.id === id);
    if (cam) {
        const canal = uiNumeroCanal(cam.channel_id);
        return `cámara «${cam.camera_name || cam.ip_address || 'sin nombre'}»${canal ? ` canal ${canal}` : ''}`
            + ` del NVR «${cam.nvr_name || cam.nvr_ip || 'sin nombre'}»`;
    }
    const nvr = (Array.isArray(nvrs) ? nvrs : []).find(g => g && g.stock && g.stock.id === id);
    return nvr ? `NVR «${nvr.nvr_name || nvr.ip}»` : '';
}

// Lo que el escaneo informó de un dispositivo que el monitoreo ve: { ip, firmware } ('' = no informó; «N/A», «-» y similares
// cuentan como sin dato, igual que en el servidor), o null si no lo ve. Esos dos datos no se editan a mano.
const STOCK_SIN_DATO_ESCANEO = new Set(['', '-', 'n/a', 'na', 'desconocida', 'fallo/offline']);
function stockDatosEscaneo(id, camaras, nvrs) {
    if (!id) return null;
    const limpio = (v) => {
        const t = String(v ?? '').trim();
        return STOCK_SIN_DATO_ESCANEO.has(t.toLowerCase()) ? '' : t;
    };
    const cam = (Array.isArray(camaras) ? camaras : []).find(c => c && c.stock && c.stock.id === id);
    if (cam) return { ip: limpio(cam.ip_address), firmware: limpio(cam.firmware) };
    const nvr = (Array.isArray(nvrs) ? nvrs : []).find(g => g && g.stock && g.stock.id === id);
    return nvr ? { ip: limpio(nvr.ip), firmware: limpio(nvr.firmware) } : null;
}

// ¿Se bloquea un campo (IP, firmware) del formulario? Si el monitoreo ve el dispositivo que se edita y el escaneo informó ese dato.
function stockCampoBloqueadoPorEscaneo(visto, escaneo, valorEscaneo) {
    return Boolean(visto) && !!escaneo && !!valorEscaneo;
}

// Aviso del formulario sobre producción: { nivel, texto } o null. `vistoEn` = stockVistoEn ('' = no lo ve).
function stockAvisoProduccion(valores, editando, vistoEn = '') {
    if (vistoEn && editando) {
        return { nivel: 'info', texto: `En producción según el último escaneo (${vistoEn}): no se puede borrar, `
            + 'cambiar la condición ni quitar de producción; la IP y el firmware los informa el escaneo.' };
    }
    if (!valores || !valores.instalado || valores.condicion === STOCK_CONDICION_PRODUCCION) return null;
    const cond = stockCondicionTexto(valores.condicion);
    if (editando && editando.instalacion) {
        return { nivel: 'warning', texto: `Al guardar sale de producción: un equipo «${cond}» no puede estar en producción.` };
    }
    return { nivel: 'danger', texto: 'Un equipo en producción tiene que estar operativo: cambiá la condición o '
        + 'destildá «Instalado».' };
}

// Mensaje después de guardar: si estaba en producción, se mandó instalado y el servidor lo sacó, se avisa
function stockMensajeGuardado(editando, enviado, guardado) {
    if (!editando) return { texto: 'Dispositivo agregado.', nivel: 'success' };
    if (editando.instalacion && enviado && enviado.instalacion && guardado && !guardado.instalacion) {
        return { texto: `Dispositivo actualizado. Salió de producción: un equipo «${stockCondicionTexto(guardado.condicion)}» `
            + 'no puede estar en producción.', nivel: 'warning' };
    }
    return { texto: 'Dispositivo actualizado.', nivel: 'success' };
}

// Catálogo de StockV1 (`r.grupos`, ya en el orden de presentación) en Map: las claves las define el usuario, nunca {}.
function stockCatalogo(grupos) {
    const cat = { etiquetaTipo: new Map(), grupoDe: new Map(), etiquetaGrupo: new Map(), ordenGrupo: new Map(),
        ordenTipo: new Map() };
    (Array.isArray(grupos) ? grupos : []).forEach((g, i) => {
        if (!g || typeof g.clave !== 'string') return;
        cat.etiquetaGrupo.set(g.clave, g.etiqueta || g.clave);
        cat.ordenGrupo.set(g.clave, i);
        (Array.isArray(g.tipos) ? g.tipos : []).forEach((t, j) => {
            if (!t || typeof t.clave !== 'string') return;
            cat.etiquetaTipo.set(t.clave, t.etiqueta || t.clave);
            cat.grupoDe.set(t.clave, g.clave);
            cat.ordenTipo.set(t.clave, j);
        });
    });
    return cat;
}

// Grupo de un tipo: el del catálogo; sin catálogo (o un tipo que no figura en él), el del sistema por defecto
// (nvr/dvr = Servidores, camara = Cámaras, el resto Otros). Lo usa también app.js (dashboard, búsqueda).
function stockGrupoDeTipo(tipo, cat) {
    if (cat && cat.grupoDe.has(tipo)) return cat.grupoDe.get(tipo);
    if (tipo === 'nvr' || tipo === 'dvr') return STOCK_GRUPO_SERVIDORES;
    return tipo === 'camara' ? STOCK_GRUPO_CAMARAS : STOCK_GRUPO_OTROS;
}

// Ícono (bootstrap-icons) de un equipo sin foto: el de su tipo si es conocido; si no, el de su grupo en el catálogo
// (un subgrupo creado por el usuario dentro de Cámaras es una cámara; dentro de Servidores, un grabador; en Otros, una
// caja genérica, ya no una cámara). Una sola tabla para Activos y Producción.
const STOCK_ICONO_TIPO = new Map([['nvr', 'bi bi-hdd-network'], ['dvr', 'bi bi-hdd-network'], ['switch', 'bi bi-hdd-rack'],
    ['monitor', 'bi bi-display'], ['pc', 'bi bi-pc-display'], ['teclado_red', 'bi bi-controller'],
    ['ups', 'bi bi-battery-charging']]);
function stockIconoTipo(tipo, cat) {
    if (STOCK_ICONO_TIPO.has(tipo)) return STOCK_ICONO_TIPO.get(tipo);
    const grupo = stockGrupoDeTipo(tipo, cat);
    if (grupo === STOCK_GRUPO_SERVIDORES) return 'bi bi-hdd-network';
    return grupo === STOCK_GRUPO_CAMARAS ? 'bi bi-camera-video' : 'bi bi-box';
}

// ¿Un tipo de cámara? Todo tipo del grupo Cámaras (domo, bullet, «sin especificar», uno creado por el usuario...).
function stockEsCamara(tipo, cat) {
    return stockGrupoDeTipo(tipo, cat) === STOCK_GRUPO_CAMARAS;
}

function stockGrupoTexto(d, cat) {
    return (cat && cat.etiquetaGrupo.get(cat.grupoDe.get(d.tipo))) || '';
}

// Respuesta de toda edición del catálogo (CatalogoStock en cctv/web/schemas.py): si no, no se pinta nada
function stockCatalogoValido(r) {
    const texto = (x) => typeof x === 'string';
    return !!r && Array.isArray(r.tipos) && Array.isArray(r.grupos)
        && r.grupos.every(g => !!g && texto(g.clave) && texto(g.etiqueta) && typeof g.sistema === 'boolean'
            && Array.isArray(g.tipos) && g.tipos.every(t => !!t && texto(t.clave) && texto(t.etiqueta)
                && typeof t.sistema === 'boolean' && Number.isInteger(t.cantidad) && t.cantidad >= 0));
}

// Por qué NO se puede borrar o mover (texto del botón deshabilitado), o '' si se puede. El servidor lo vuelve a validar.
function stockMotivoNoBorrarGrupo(g) {
    if (g.sistema) return 'Grupo del sistema: se puede renombrar, no borrar.';
    const conEquipos = g.tipos.filter(t => t.cantidad);
    if (conEquipos.length) return `Tiene dispositivos en ${conEquipos.length} subgrupo(s): no se puede borrar.`;
    return '';
}

function stockMotivoNoBorrarTipo(t) {
    if (t.sistema) return 'Subgrupo del sistema: se puede renombrar, no borrar.';
    if (t.cantidad) return `Tiene ${t.cantidad} dispositivo(s): no se puede borrar.`;
    return '';
}

function stockMotivoNoMoverTipo(t) {
    if (t.sistema) return 'Subgrupo del sistema: no se mueve de grupo.';
    if (t.cantidad) return `Tiene ${t.cantidad} dispositivo(s): para moverlo de grupo no tiene que tener equipos.`;
    return '';
}

function stockCondicionTexto(c) {
    return STOCK_CONDICIONES.get(c) || c;
}

function stockMacTexto(mac) {
    return mac ? String(mac).toUpperCase() : '';
}

function stockUbicacionTexto(inst) {
    if (!inst) return '';
    const partes = [];
    if (inst.edificio) partes.push(inst.edificio);
    if (inst.piso) partes.push(`piso ${inst.piso}`);
    if (inst.rack) partes.push(`rack ${inst.rack}`);
    if (inst.puerto) partes.push(`puerto ${inst.puerto}`);
    return partes.join(' · ');
}

function stockMarcaModelo(d) {
    return [d.marca, d.modelo].filter(Boolean).join(' ');
}

// Nombre de un equipo fuera de la tabla (Producción, popup): la descripción de su instalación; si no, marca y modelo.
function stockNombreVisible(d, defecto = 'Dispositivo') {
    return (d.instalacion && d.instalacion.descripcion) || stockMarcaModelo(d) || defecto;
}

function stockTipoTexto(d, etiquetasTipo) {
    return etiquetasTipo.get(d.tipo) || d.tipo;
}

function stockEstadoEfectivo(d) {
    if (d.en_uso) return 'produccion';
    return d.disponible ? 'disponible' : d.condicion;
}

// Texto en el que busca el buscador global
function stockMatchTexto(valor, term) {
    if (valor === null || valor === undefined || !term) return false;
    return normalizarTextoBusqueda(valor).includes(normalizarTextoBusqueda(term));
}

function stockMatchMac(mac, term) {
    if (!mac || !term) return false;
    const sMac = normalizarTextoBusqueda(mac);
    const sTerm = normalizarTextoBusqueda(term);
    if (sMac.includes(sTerm)) return true;
    const cleanMac = sMac.replace(/[:\-\s]/g, '');
    const cleanTerm = sTerm.replace(/[:\-\s]/g, '');
    return cleanTerm.length > 0 && cleanMac.includes(cleanTerm);
}

function stockNormalizarCampos(campos) {
    if (!campos || campos === 'todos') return new Set(['nombre', 'tipo', 'ip', 'mac', 'modelo', 'firmware', 'estado']);
    if (campos instanceof Set) return campos;
    if (Array.isArray(campos)) return new Set(campos);
    return new Set([String(campos)]);
}

function stockCoincideUbicacion(inst, token) {
    if (typeof coincideTokenUbicacion === 'function') return coincideTokenUbicacion(inst, token);
    if (typeof window !== 'undefined' && typeof window.coincideTokenUbicacion === 'function') {
        return window.coincideTokenUbicacion(inst, token);
    }
    if (!inst || !token) return false;
    const t = normalizarTextoBusqueda(token).trim();
    if (!t) return false;

    if (typeof inst === 'string') {
        const sNorm = normalizarTextoBusqueda(inst);
        if (t.startsWith('piso ')) {
            const valPiso = t.slice(5).trim();
            const rx = new RegExp('(^|[^a-z0-9])piso\\s+' + valPiso + '([^a-z0-9]|$)', 'i');
            return rx.test(sNorm);
        }
        if (t === 'piso') {
            const rxPiso = /(^|[^a-z0-9])piso([^a-z0-9]|$)/i;
            return rxPiso.test(sNorm);
        }
        return sNorm.includes(t);
    }

    if (t.startsWith('piso ')) {
        const valPiso = t.slice(5).trim();
        if (inst.piso && normalizarTextoBusqueda(inst.piso).trim() === valPiso) return true;
        if (inst.descripcion) {
            const rx = new RegExp('(^|[^a-z0-9])piso\\s+' + valPiso + '([^a-z0-9]|$)', 'i');
            if (rx.test(normalizarTextoBusqueda(inst.descripcion))) return true;
        }
        return false;
    }
    if (t === 'piso') return Boolean(inst.piso);

    if (t.startsWith('rack ')) {
        const valRack = t.slice(5).trim();
        if (inst.rack && normalizarTextoBusqueda(inst.rack).includes(valRack)) return true;
        return false;
    }

    if (t.startsWith('puerto ')) {
        const valPuerto = t.slice(7).trim();
        if (inst.puerto && normalizarTextoBusqueda(inst.puerto).includes(valPuerto)) return true;
        return false;
    }

    if (inst.edificio && normalizarTextoBusqueda(inst.edificio).includes(t)) return true;
    if (inst.piso && normalizarTextoBusqueda(inst.piso).trim() === t) return true;
    if (inst.rack && normalizarTextoBusqueda(inst.rack).includes(t)) return true;
    if (inst.puerto && normalizarTextoBusqueda(inst.puerto).includes(t)) return true;
    if (inst.descripcion && normalizarTextoBusqueda(inst.descripcion).includes(t)) return true;
    if (inst.comentario && normalizarTextoBusqueda(inst.comentario).includes(t)) return true;

    const uTexto = (typeof stockUbicacionTexto === 'function') ? stockUbicacionTexto(inst) : '';
    if (uTexto && normalizarTextoBusqueda(uTexto).includes(t)) return true;

    return false;
}

// La tokenización es una sola: la de busqueda.js (se carga antes). No se duplica su tabla de frases compuestas.
function stockTokenizar(texto) {
    return tokenizarBusqueda(texto);
}

function _stockDispositivoCoincideTokenPositivo(d, tok, campos, etiquetasTipo = new Map(), cat = null) {
    if (!d || !tok) return true;
    if (!campos || campos.size === 0) return false;

    const tokNorm = normalizarTextoBusqueda(tok);
    const tipoD = normalizarTextoBusqueda(d.tipo || '');
    const rxCamFallback = /^(c[aá]maras?)$/i;
    const rxNvrFallback = /^(nvrs?|grabador(es)?|dvrs?)$/i;

    // 1. Grupo / Tipo
    if (campos.has('tipo')) {
        const esTokenCam = typeof RE_TOKEN_CAMARA !== 'undefined' ? RE_TOKEN_CAMARA.test(tok) : rxCamFallback.test(tokNorm);
        if (esTokenCam) {
            return stockEsCamara(d.tipo, cat) || tipoD.startsWith('cam');
        }
        if (STOCK_RE_TOKEN_SERVIDORES.test(tokNorm)) {
            return stockGrupoDeTipo(d.tipo, cat) === STOCK_GRUPO_SERVIDORES;
        }
        const esTokenNvr = typeof RE_TOKEN_NVR !== 'undefined' ? RE_TOKEN_NVR.test(tok) : rxNvrFallback.test(tokNorm);
        if (esTokenNvr) {
            return ['nvr', 'grabador', 'servidor', 'dvr'].includes(tipoD);
        }
        if (tipoD && stockMatchTexto(tipoD, tok)) return true;
        const etiqTipo = etiquetasTipo.get(d.tipo);
        if (etiqTipo && stockMatchTexto(etiqTipo, tok)) return true;
        const etiqGrupo = stockGrupoTexto(d, cat);
        if (etiqGrupo && stockMatchTexto(etiqGrupo, tok)) return true;
    }

    // 2. Estado
    if (campos.has('estado')) {
        if (typeof coincideTokenSemanticoEstado === 'function' && coincideTokenSemanticoEstado(d, tok)) {
            return true;
        }
        const condTexto = stockCondicionTexto(d.condicion);
        if (condTexto && stockMatchTexto(condTexto, tok)) return true;
        if (d.condicion && stockMatchTexto(d.condicion, tok)) return true;
        if (d.en_uso && (stockMatchTexto('produccion', tok) || stockMatchTexto('en uso', tok) || stockMatchTexto('operativo', tok))) return true;
        if (d.disponible && stockMatchTexto('disponible', tok)) return true;
        if (!d.en_uso && !d.disponible && stockMatchTexto('fuera de servicio', tok)) return true;
    }

    // 3. Nombre / Ubicación
    if (campos.has('nombre')) {
        const i = d.instalacion || {};
        if (stockCoincideUbicacion(i, tok)) return true;
        if (stockMatchTexto(d.comentario, tok)) return true;
        if (stockMatchTexto(d.patrimonio, tok)) return true;
    }

    // 4. IP
    if (campos.has('ip')) {
        const ip = d.instalacion && d.instalacion.ip;
        if (ip && stockMatchTexto(ip, tok)) return true;
    }

    // 5. MAC
    if (campos.has('mac')) {
        if (stockMatchMac(d.mac, tok)) return true;
        if (stockMatchTexto(d.serie, tok)) return true;
    }

    // 6. Modelo
    if (campos.has('modelo')) {
        if (stockMatchTexto(d.modelo, tok)) return true;
        if (stockMatchTexto(d.marca, tok)) return true;
    }

    // 7. Firmware
    if (campos.has('firmware')) {
        if (stockMatchTexto(d.firmware, tok)) return true;
    }

    return false;
}

function stockDispositivoCumpleToken(d, tok, campos, etiquetasTipo = new Map(), cat = null) {
    if (!d || !tok) return true;
    if (!campos || campos.size === 0) return false;

    const esExcl = typeof tok === 'string' && (tok.startsWith('!') || tok.startsWith('-')) && tok.length > 1;
    const t = esExcl ? tok.slice(1).trim() : tok;
    if (!t) return true;

    const coincide = _stockDispositivoCoincideTokenPositivo(d, t, campos, etiquetasTipo, cat);
    return esExcl ? !coincide : coincide;
}

function stockFiltrar(lista, texto = '', etiquetasTipo = new Map(), camposActivos = null, cat = null) {
    const t = String(texto).trim();
    if (!t) return lista;
    const tokens = (typeof tokenizarBusqueda === 'function')
        ? tokenizarBusqueda(t)
        : (typeof window !== 'undefined' && typeof window.tokenizarBusqueda === 'function')
            ? window.tokenizarBusqueda(t)
            : stockTokenizar(t);
    if (!tokens.length) return lista;

    const campos = stockNormalizarCampos(camposActivos);
    if (campos.size === 0) return [];

    return lista.filter(d => tokens.every(tok => stockDispositivoCumpleToken(d, tok, campos, etiquetasTipo, cat)));
}

// Peso de un piso para ordenar de abajo hacia arriba (como el SGC): 2SS < 1SS < PB < EP < 1 < 2 ... < terraza
function stockPisoPeso(piso) {
    const s = String(piso || '').trim().toUpperCase();
    if (!s || s === 'SIN PISO' || s.startsWith('SIN ')) return 9999;
    const n = parseInt(s.replace(/\D/g, ''), 10);
    if (s.includes('SS')) return -(n || 1);
    if (s === 'PB') return 0;
    if (s.includes('EP')) return (n || 1) * 0.1;
    if (s === 'TERRAZA' || s === 'AZOTEA' || s === 'TZ') return 1000;
    return /^\d+$/.test(s) ? Number(s) : 500;
}

function stockCompararTexto(a, b) {
    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

// Grupo de un dispositivo según el criterio: { etiqueta, orden } (el orden decide la posición del acordeón)
function stockGrupoDe(d, criterio, etiquetasTipo, cat = null) {
    const sin = (etiqueta) => ({ etiqueta, orden: STOCK_SIN + etiqueta });
    switch (criterio) {
        case 'edificio':
            if (!d.instalacion) return sin('Sin instalar');
            return d.instalacion.edificio ? { etiqueta: d.instalacion.edificio, orden: d.instalacion.edificio }
                : sin('Instalado, sin edificio');
        case 'estado': {
            const e = stockEstadoEfectivo(d);
            return { etiqueta: STOCK_ESTADOS.get(e) || stockCondicionTexto(e), orden: String([...STOCK_ESTADOS.keys()].indexOf(e) + 10) };
        }
        case 'marca':
            return d.marca ? { etiqueta: d.marca, orden: d.marca } : sin('Sin marca');
        case 'modelo':
        case 'modelo-firmware':
            return d.modelo ? { etiqueta: stockMarcaModelo(d), orden: d.modelo } : sin('Sin modelo');
        case 'patrimonio':
            return d.patrimonio ? { etiqueta: 'Con patrimonio', orden: '0' } : { etiqueta: 'Sin patrimonio', orden: '1' };
        case 'ninguno':                 // «Sin agrupar»: un solo grupo, «Todos», con todo
            return { etiqueta: STOCK_TODOS, orden: '0' };
        default: {                      // 'tipo': el grupo (Servidores, Cámaras...) en el orden del catálogo
            if (cat && cat.grupoDe.has(d.tipo)) {
                const g = cat.grupoDe.get(d.tipo);
                return { etiqueta: cat.etiquetaGrupo.get(g), orden: String(cat.ordenGrupo.get(g)).padStart(4, '0') };
            }
            const t = stockTipoTexto(d, etiquetasTipo);
            return { etiqueta: t, orden: t };
        }
    }
}

// Orden dentro de un grupo: por piso (edificio), por firmware (modelo/firmware) o por tipo/modelo/descripción
function stockOrdenInterno(criterio) {
    const desc = (d) => (d.instalacion && (d.instalacion.descripcion || d.instalacion.ip)) || '';
    const base = (a, b) => stockCompararTexto(a.tipo, b.tipo) || stockCompararTexto(a.modelo || STOCK_SIN, b.modelo || STOCK_SIN)
        || stockCompararTexto(desc(a) || STOCK_SIN, desc(b) || STOCK_SIN) || stockCompararTexto(a.id, b.id);
    if (criterio === 'edificio') {
        return (a, b) => stockPisoPeso(a.instalacion && a.instalacion.piso) - stockPisoPeso(b.instalacion && b.instalacion.piso)
            || base(a, b);
    }
    if (criterio === 'modelo-firmware') {
        return (a, b) => stockCompararTexto(a.firmware || STOCK_SIN, b.firmware || STOCK_SIN) || base(a, b);
    }
    return base;
}

// Columnas ordenables de la lista de Activos: clave del encabezado -> los dos textos de su celda (el principal y el de abajo,
// que desempata). Lo vacío va siempre al final, en cualquier sentido.
const STOCK_COLUMNAS_ORDEN = new Map([
    ['tipo', (d, etiquetas) => [stockTipoTexto(d, etiquetas), stockCondicionTexto(d.condicion)]],
    ['mac', (d) => [d.mac || '', d.serie || '']],
    ['modelo', (d) => [d.modelo || '', d.marca || '']],
    ['patrimonio', (d) => [d.patrimonio || '', d.firmware || '']],
    ['ubicacion', (d) => [(d.instalacion && (d.instalacion.descripcion || d.instalacion.ip)) || '',
        d.instalacion ? stockUbicacionTexto(d.instalacion) : '']],
    ['comentario', (d) => [[d.comentario, d.instalacion && d.instalacion.comentario].filter(Boolean).join(' | '), '']],
]);

// Orden de las columnas de la lista de Activos (la imagen siempre va primera y no se mueve): lo que eligió la persona
// (arreglo, o su JSON guardado) y, lo que no nombra o repite, en el orden de fábrica. Siempre devuelve todas, una vez.
function stockOrdenColumnas(guardado) {
    let lista = guardado;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); } catch (e) { lista = []; }
    }
    const claves = [...STOCK_COLUMNAS_ORDEN.keys()];
    const elegidas = Array.isArray(lista) ? lista.filter((c, i) => claves.includes(c) && lista.indexOf(c) === i) : [];
    return [...elegidas, ...claves.filter(c => !elegidas.includes(c))];
}

// Comparador de una columna (`dir`: 'asc' | 'desc'), o null si la columna no se ordena
function stockComparadorColumna(columna, dir, etiquetasTipo = new Map()) {
    const claves = STOCK_COLUMNAS_ORDEN.get(columna);
    if (!claves) return null;
    const signo = dir === 'desc' ? -1 : 1;
    return (a, b) => {
        const [a1, a2] = claves(a, etiquetasTipo);
        const [b1, b2] = claves(b, etiquetasTipo);
        if (!a1 !== !b1) return a1 ? -1 : 1;
        return signo * (stockCompararTexto(a1, b1) || stockCompararTexto(a2, b2));
    };
}

// [{ etiqueta, items }] en el orden de los acordeones; `comparador` (opcional) ordena lo de adentro de cada grupo
function stockAgruparBloques(lista, criterio, etiquetasTipo = new Map(), cat = null, comparador = null) {
    const grupos = new Map();
    for (const d of lista) {
        const g = stockGrupoDe(d, criterio, etiquetasTipo, cat);
        if (!grupos.has(g.etiqueta)) grupos.set(g.etiqueta, { etiqueta: g.etiqueta, orden: g.orden, items: [] });
        grupos.get(g.etiqueta).items.push(d);
    }
    const orden = stockOrdenInterno(criterio);
    return [...grupos.values()]
        .sort((a, b) => stockCompararTexto(a.orden, b.orden) || stockCompararTexto(a.etiqueta, b.etiqueta))
        .map(g => ({ etiqueta: g.etiqueta, items: g.items.slice().sort(comparador ? (x, y) => comparador(x, y) || orden(x, y) : orden) }));
}

// id de un acordeón, estable entre repintados (se guarda cuál quedó abierto); `usados` evita choques ("A-1"/"A_1")
function stockIdGrupo(criterio, etiqueta, usados) {
    const baseId = `stock-g-${criterio}-${String(etiqueta).replace(/[^A-Za-z0-9]/g, '_').slice(0, 60)}`;
    let id = baseId;
    for (let n = 2; usados.has(id); n++) id = `${baseId}-${n}`;
    usados.add(id);
    return id;
}

// Subsecciones (como el SGC): por piso al agrupar por edificio, por firmware al agrupar por modelo/firmware y por
// tipo (en el orden del catálogo) al agrupar por grupo
function stockSubsecciones(items, criterio, etiquetasTipo = new Map(), cat = null) {
    if (criterio === 'tipo') {
        if (!cat) return [{ titulo: '', items }];
        const porTipo = new Map();
        for (const d of items) {
            if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, []);
            porTipo.get(d.tipo).push(d);
        }
        const orden = (t) => (cat.ordenTipo.has(t) ? cat.ordenTipo.get(t) : Number.MAX_SAFE_INTEGER);
        return [...porTipo.entries()].sort((a, b) => orden(a[0]) - orden(b[0]) || stockCompararTexto(a[0], b[0]))
            .map(([t, lista]) => ({ titulo: stockTipoTexto({ tipo: t }, etiquetasTipo), clave: t, items: lista }));
    }
    const clave = criterio === 'edificio' ? (d) => (d.instalacion && d.instalacion.piso) || 'Sin piso'
        : criterio === 'modelo-firmware' ? (d) => d.firmware || 'Firmware no relevado' : null;
    if (!clave) return [{ titulo: '', items }];
    const m = new Map();
    for (const d of items) {
        const k = clave(d);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(d);
    }
    const prefijo = criterio === 'edificio' ? 'Piso' : 'Firmware';
    let entradas = [...m.entries()];
    if (criterio === 'edificio') {
        entradas.sort((a, b) => stockPisoPeso(a[0]) - stockPisoPeso(b[0]) || stockCompararTexto(a[0], b[0]));
    }
    return entradas.map(([k, lista]) => ({
        titulo: `${prefijo}: ${k}`,
        clave: k,
        items: lista
    }));
}

function stockEscHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Reporte imprimible por grupos (documento HTML autónomo, como el del SGC; sin scripts: se imprime con Ctrl+P).
// TODO dato pasa por stockEscHtml. `bloques`: [{ etiqueta, items }] ya elegidos.
function stockReporteHtml(bloques, { criterio, criterioTexto, fecha, busqueda = '', etiquetasTipo = new Map(),
    catalogo = null }) {
    const e = stockEscHtml;
    const total = bloques.reduce((acc, b) => acc + b.items.length, 0);
    const resumen = bloques.map(b => `<tr><td><strong>${e(b.etiqueta)}</strong></td><td>${b.items.length}</td></tr>`).join('');
    const fila = (d) => {
        const i = d.instalacion || {};
        const estado = d.en_uso ? (i.descripcion || 'En producción') : (STOCK_ESTADOS.get(stockEstadoEfectivo(d)) || d.condicion);
        return `<tr><td><strong>${e(stockMacTexto(d.mac) || STOCK_ND)}</strong></td><td>${e(i.ip || STOCK_ND)}</td>`
            + `<td>${e(d.modelo || STOCK_ND)}</td><td>${e(d.serie || STOCK_ND)}</td>`
            + `<td>${e(stockGrupoTexto(d, catalogo) || STOCK_ND)}</td><td>${e(stockTipoTexto(d, etiquetasTipo))}</td>`
            + `<td>${e(d.patrimonio || 'Sin patrimonio')}</td>`
            + `<td>${e(estado)}</td><td>${e(stockUbicacionTexto(i))}</td></tr>`;
    };
    const cab = '<tr><th>MAC</th><th>IP</th><th>Modelo</th><th>Serie</th><th>Grupo</th><th>Tipo</th><th>Patrimonio</th>'
        + '<th>Estado / Descripción</th><th>Ubicación</th></tr>';
    const secciones = bloques.flatMap(b => stockSubsecciones(b.items, criterio, etiquetasTipo, catalogo).map(sub =>
        `<section><h2>${e(sub.titulo ? `${b.etiqueta} — ${sub.titulo}` : b.etiqueta)} (${sub.items.length})</h2>`
        + `<table><thead>${cab}</thead><tbody>${sub.items.map(fila).join('')}</tbody></table></section>`)).join('\n');
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte de stock CCTV — ${e(fecha)}</title>
<style>
  :root { --azul: #1a73e8; --borde: #e2e6ef; --tenue: #5a6070; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f6fa; color: #1a1d23; padding: 2rem 1.5rem; }
  .reporte { max-width: 1280px; margin: 0 auto; }
  header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--azul); display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; }
  header h1 { font-size: 1.3rem; color: var(--azul); }
  header .meta { font-size: .8rem; color: var(--tenue); text-align: right; line-height: 1.5; }
  section { background: #fff; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem; border: 1px solid var(--borde); }
  h2 { font-size: .95rem; color: var(--azul); margin-bottom: .75rem; padding-bottom: .4rem; border-bottom: 1px solid var(--borde); }
  table { width: 100%; border-collapse: collapse; font-size: .7rem; table-layout: fixed; }
  th { text-align: left; color: var(--tenue); padding: .25rem; border-bottom: 1px solid var(--borde); background: #f0f2f8; text-transform: uppercase; }
  td { padding: .25rem; border-bottom: 1px solid var(--borde); word-break: break-word; }
  @media print { body { background: #fff; padding: 0; } section { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="reporte">
  <header>
    <h1>Reporte de stock CCTV</h1>
    <div class="meta">Exportado el ${e(fecha)}<br>Agrupado por: ${e(criterioTexto)}${busqueda ? `<br>Búsqueda: ${e(busqueda)}` : ''}</div>
  </header>
  <section><h2>Resumen</h2><table><thead><tr><th>Grupo</th><th>Cantidad</th></tr></thead><tbody>${resumen}</tbody>
  <tfoot><tr><td><strong>TOTAL DE DISPOSITIVOS</strong></td><td><strong>${total}</strong></td></tr></tfoot></table></section>
${secciones}
</div>
</body>
</html>
`;
}

// ---- edición

const STOCK_EDIFICIO_NUEVO = '__nuevo__';
const STOCK_PISO_NUEVO = '__nuevo__';


// Opciones del select de piso: la lista de la base de abajo hacia arriba (2SS, 1SS, PB, EP1, 1, 2...); el piso que ya
// tiene el dispositivo aparece aunque no esté en la lista (dato viejo: se puede seguir editando lo demás)
function stockOpcionesPiso(pisos, actual) {
    const lista = (Array.isArray(pisos) ? pisos : []).filter(p => typeof p === 'string' && p);
    if (actual && !lista.includes(actual)) lista.push(actual);
    return lista.sort((a, b) => stockPisoPeso(a) - stockPisoPeso(b) || stockCompararTexto(a, b)).map(p => [p, p]);
}

// La respuesta de /api/stock/ubicaciones (UbicacionesStock)
function stockUbicacionesValidas(ub) {
    const lista = (l) => Array.isArray(l) && l.every(u => !!u && typeof u.nombre === 'string' && Number.isInteger(u.usos));
    return !!ub && lista(ub.edificios) && lista(ub.pisos) && (ub.guardado === null || typeof ub.guardado === 'string');
}
const STOCK_CAMPOS = new Map([
    ['alta', 'Alta'], ['tipo', 'Tipo'], ['condicion', 'Condición'], ['forma', 'Forma'], ['marca', 'Marca'],
    ['modelo', 'Modelo'], ['serie', 'Serie'], ['mac', 'MAC'], ['patrimonio', 'Patrimonio'], ['firmware', 'Firmware'],
    ['pagina_modelo', 'Página del modelo'], ['canales', 'Canales'], ['comentario', 'Comentario'], ['instalacion', 'Instalado'],
    ['instalacion.descripcion', 'Descripción'], ['instalacion.ip', 'IP'], ['instalacion.edificio', 'Edificio'],
    ['instalacion.piso', 'Piso'], ['instalacion.rack', 'Rack'], ['instalacion.puerto', 'Puerto'],
    ['instalacion.comentario', 'Comentario de la instalación'], ['eliminado', 'Eliminado']
]);
const STOCK_TIPOS_ESCANEO = new Map([['camara', 'Cámara'], ['nvr', 'NVR']]);

// La página del modelo (la fija Catálogos > Modelos) solo se vuelve enlace si es http(s) (nunca `javascript:` ni `data:`); si no, null.
function stockUrlPagina(valor) {
    const txt = String(valor ?? '').trim();
    if (!txt.match(/^https?:\/\/[^\s\u0000-\u001f]+$/i)) return null;
    try {
        const u = new URL(txt);
        return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password ? u.href : null;
    } catch (e) {
        return null;
    }
}

// Las asignaciones [{grabador, canal}] de una instalación (de la API: `asignaciones`; de lo viejo: el par grabador+canal)
function stockAsignacionesDe(i) {
    if (!i) return [];
    if (Array.isArray(i.asignaciones)) return i.asignaciones.filter(a => a && a.grabador && a.canal);
    return i.grabador && i.canal ? [{ grabador: i.grabador, canal: i.canal }] : [];
}

// Valores del formulario (todo texto/booleano) a partir de un dispositivo; sin dispositivo, los de un alta
function stockValoresDeDispositivo(d) {
    const i = (d && d.instalacion) || {};
    const t = (v) => (v === null || v === undefined) ? '' : String(v);
    return {
        tipo: d ? d.tipo : 'camara', condicion: d ? d.condicion : 'operativo',
        marca: t(d && d.marca), modelo: t(d && d.modelo), serie: t(d && d.serie), mac: stockMacTexto(d && d.mac),
        patrimonio: t(d && d.patrimonio), firmware: t(d && d.firmware), canales: t(d && d.canales),
        comentario: t(d && d.comentario), instalado: !!(d && d.instalacion), descripcion: t(i.descripcion),
        ip: t(i.ip), edificio: t(i.edificio), piso: t(i.piso), rack: t(i.rack), puerto: t(i.puerto),
        instComentario: t(i.comentario),
        asignaciones: stockAsignacionesDe(d && d.instalacion).map(a => ({ grabador: t(a.grabador), canal: t(a.canal) }))
    };
}

// Cuerpo de POST/PUT (DispositivoEntrada en cctv/web/schemas.py).
// Opcionales vacíos -> null; canales: entero si son dígitos (si no, se manda tal cual y el servidor responde 422).
function stockPayload(v) {
    const txt = (x) => String(x ?? '').trim();
    const opt = (x) => txt(x) || null;
    const canales = txt(v.canales);
    return {
        tipo: txt(v.tipo), condicion: txt(v.condicion) || 'operativo',
        marca: txt(v.marca), modelo: txt(v.modelo), serie: opt(v.serie), mac: opt(v.mac), patrimonio: opt(v.patrimonio),
        firmware: opt(v.firmware), canales: canales === '' ? null : (/^[0-9]{1,4}$/.test(canales) ? Number(canales) : canales),
        comentario: txt(v.comentario),
        instalacion: v.instalado ? {
            descripcion: txt(v.descripcion), ip: opt(v.ip), edificio: txt(v.edificio), piso: txt(v.piso),
            rack: txt(v.rack), puerto: txt(v.puerto), comentario: txt(v.instComentario),
            asignaciones: (Array.isArray(v.asignaciones) ? v.asignaciones : []).filter(a => a && txt(a.grabador))
                .map(a => ({ grabador: txt(a.grabador), canal: /^[0-9]{1,4}$/.test(txt(a.canal)) ? Number(txt(a.canal)) : opt(a.canal) }))
        } : null
    };
}

// Producción manual: los grabadores (NVR/DVR) instalados a los que se puede asignar `idPropio` ([[id, texto]], por nombre),
// y los canales de uno: [{ canal, ocupante (nombre de otro dispositivo) | '' }] (sin capacidad cargada, `porDefecto`).
const STOCK_TIPOS_GRABADOR = ['nvr', 'dvr'];
function stockGrabadoresAsignables(dispositivos, idPropio, nombre) {
    return (Array.isArray(dispositivos) ? dispositivos : [])
        .filter(d => d && d.id !== idPropio && STOCK_TIPOS_GRABADOR.includes(d.tipo) && d.instalacion)
        .map(d => [d.id, nombre(d) + (d.instalacion.ip ? ` (${d.instalacion.ip})` : '')])
        .sort((a, b) => a[1].localeCompare(b[1], 'es', { numeric: true, sensitivity: 'base' }));
}
function stockCanalesDe(dispositivos, idGrabador, idPropio, nombre, porDefecto = 64) {
    const lista = Array.isArray(dispositivos) ? dispositivos : [];
    const g = lista.find(d => d && d.id === idGrabador);
    if (!g) return [];
    const ocupantes = new Map();
    for (const d of lista) {
        if (!d || d.id === idPropio) continue;
        for (const a of stockAsignacionesDe(d.instalacion)) if (a.grabador === idGrabador) ocupantes.set(Number(a.canal), nombre(d));
    }
    const total = Math.max(Number(g.canales) || porDefecto, ...ocupantes.keys());
    return Array.from({ length: total }, (_, k) => ({ canal: k + 1, ocupante: ocupantes.get(k + 1) || '' }));
}
// El primer canal libre (o '' si no hay)
function stockPrimerCanalLibre(canales) {
    const libre = canales.find(c => !c.ocupante);
    return libre ? String(libre.canal) : '';
}

// Valores distintos (no vacíos) de un campo, ordenados: sugerencias para marca/modelo
function stockValoresUnicos(lista, clave) {
    return [...new Set(lista.map(d => d[clave]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Texto sin espacios de más
function stockEspaciosUnicos(t) {
    return String(t ?? '').trim().split(/\s+/).join(' ');
}

// Identidad de un texto de marca o modelo: sin espacios de más ni mayúsculas (como la clave del modelo en el servidor)
function stockClaveTexto(t) {
    return stockEspaciosUnicos(t).toLowerCase();
}

// Modelos que ya existen, para sugerirlos al escribir: uno por modelo (la forma más usada, aunque haya variantes de
// mayúsculas) y, si la marca escrita ya tiene dispositivos, solo los de esa marca; con otra marca, todos.
function stockModelosSugeridos(dispositivos, marca = '') {
    const m = stockClaveTexto(marca);
    const deLaMarca = m ? dispositivos.filter(d => stockClaveTexto(d.marca) === m) : [];
    const base = deLaMarca.length ? deLaMarca : dispositivos;
    const escrituras = new Map();                      // clave -> Map(escritura -> cuántos la usan)
    for (const d of base) {
        const modelo = stockEspaciosUnicos(d.modelo);
        if (!modelo) continue;
        const cuentas = escrituras.get(stockClaveTexto(modelo)) || new Map();
        cuentas.set(modelo, (cuentas.get(modelo) || 0) + 1);
        escrituras.set(stockClaveTexto(modelo), cuentas);
    }
    const elegidas = [...escrituras.values()].map(c => [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
    return elegidas.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Distancia de edición entre dos textos (insertar, borrar o cambiar una letra cuenta 1)
function stockDistanciaTexto(a, b) {
    let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const fila = [i];
        for (let j = 1; j <= b.length; j++) {
            fila.push(Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
        }
        previa = fila;
    }
    return previa[b.length];
}

// El modelo existente que se parece a lo escrito y no es igual (null = está bien: igual a uno o no se parece a ninguno).
// Se parece si solo cambian mayúsculas o espacios, o si difiere en una letra (dos si tiene más de 8) y mide 4 o más.
function stockModeloParecido(texto, sugeridos) {
    const escrito = stockEspaciosUnicos(texto);
    const clave = escrito.toLowerCase();
    if (!clave) return null;
    if (sugeridos.includes(escrito)) return null;
    const igual = sugeridos.find(s => stockClaveTexto(s) === clave);
    if (igual) return igual;
    if (clave.length < 4) return null;
    const tope = clave.length > 8 ? 2 : 1;
    let mejor = null;
    let distancia = tope + 1;
    for (const s of sugeridos) {
        const d = stockDistanciaTexto(clave, stockClaveTexto(s));
        if (d < distancia) { mejor = s; distancia = d; }
    }
    return mejor;
}

// El edificio recién agregado tal como quedó en el catálogo (el servidor normaliza espacios y no duplica por mayúsculas)
function stockEdificioDelCatalogo(edificios, nombre) {
    const n = String(nombre).trim().replace(/\s+/g, ' ').toLowerCase();
    return edificios.find(e => e.toLowerCase() === n) || null;
}

// Una línea del historial: "2026-10-08 05:00 · Firmware: V1 → V2"
function stockHistorialTexto(e) {
    const cuando = String(e.cuando || '').replace('T', ' ').replace(/:\d{2}Z$/, '');
    const origen = e.campo === 'alta' || e.campo === 'eliminado' || e.origen === 'manual' ? '' : ` [${e.origen}]`;
    return `${cuando} · ${stockHistorialCambio(e)}${origen}`;
}

// Qué cambió en una entrada del historial (de un dispositivo o del catálogo), sin fecha ni origen:
// «Condición: operativo → revisar», «Alta (domo …)», «Edificio: Anexo A → Anexo B», «Baja (Lector)»
function stockHistorialCambio(e) {
    const valor = (x) => (x === null || x === undefined || x === '') ? '(vacío)' : x;
    const campo = String(e.campo || '');
    if (campo === 'alta' || campo.endsWith('.alta')) return `Alta (${e.despues || ''})`;
    if (campo === 'eliminado') return `Eliminado (${e.antes || ''})`;
    if (campo === 'baja' || campo.endsWith('.baja')) return `Baja (${e.antes || ''})`;
    if (campo.startsWith('migracion')) return String(e.despues || 'Migración de la base');
    const accion = campo.split('.').pop();
    const etiqueta = e.objeto && e.objeto !== 'dispositivo'
        ? (STOCK_CAMPOS_CATALOGO.get(accion) || accion) : (STOCK_CAMPOS.get(campo) || campo);
    return `${etiqueta}: ${valor(e.antes)} → ${valor(e.despues)}`;
}

// ---- Auditoría > Base de datos: los últimos cambios de dispositivos y catálogo (GET /api/stock/historial)
const STOCK_CAMPOS_CATALOGO = new Map([['renombrar', 'Renombrado'], ['unificar', 'Unificado con'],
    ['etiqueta', 'Nombre'], ['grupo', 'Grupo']]);
const STOCK_ACCIONES = new Map([['agregar', { texto: 'Agregado', plural: 'Agregados', clase: 'bg-success' }],
    ['modificar', { texto: 'Modificado', plural: 'Modificados', clase: 'bg-primary' }],
    ['borrar', { texto: 'Borrado', plural: 'Borrados', clase: 'bg-danger' }]]);
const STOCK_ORIGENES = new Map([['manual', 'Manual'], ['scanner', 'Escaneo'], ['importacion', 'Importación'],
    ['migracion', 'Sistema']]);
const STOCK_OBJETOS_CATALOGO = new Map([['grupo', 'Grupo'], ['tipo', 'Tipo'], ['edificio', 'Edificio'],
    ['piso', 'Piso']]);

// URL de una página: solo los parámetros con valor (accion de la lista cerrada, q acotado como el servidor)
function stockHistorialUrl({ accion = '', q = '', offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (STOCK_ACCIONES.has(accion)) params.set('accion', accion);
    const texto = String(q || '').trim().slice(0, 60);
    if (texto) params.set('q', texto);
    if (Number.isInteger(offset) && offset > 0) params.set('offset', String(offset));
    const qs = params.toString();
    return `/api/stock/historial${qs ? `?${qs}` : ''}`;
}

// La respuesta debe tener la forma de HistorialRecienteStock (cctv/web/schemas.py)
function stockHistorialRecienteValido(hist) {
    return !!hist && Array.isArray(hist.cambios)
        && (hist.siguiente_offset === null || Number.isInteger(hist.siguiente_offset))
        && hist.cambios.every(cambio => !!cambio && typeof cambio.cuando === 'string'
            && typeof cambio.campo === 'string' && STOCK_ACCIONES.has(cambio.accion) && typeof cambio.objeto === 'string');
}

// De qué es el cambio: el resumen del equipo (el de su borrado si ya no está) o «Edificio Anexo B», «Tipo lector»
function stockHistorialElemento(cambio) {
    if (cambio.objeto === 'dispositivo') return cambio.equipo || 'Dispositivo (sin datos)';
    if (String(cambio.campo || '').startsWith('migracion')) return 'Base de datos';
    const clase = cambio.objeto === 'catalogo' ? String(cambio.campo || '').split('.')[0] : cambio.objeto;
    return `${STOCK_OBJETOS_CATALOGO.get(clase) || 'Catálogo'} ${cambio.clave || ''}`.trim();
}

// Línea del historial con quién lo hizo (usuario del login; las entradas viejas, la importación y la CLI no lo traen)
function stockHistorialLinea(e) {
    const quien = typeof e.usuario === 'string' && e.usuario ? ` · por ${e.usuario}` : '';
    return stockHistorialTexto(e) + quien;
}

// Alta precargada con lo que informó el escaneo (una fila de Cámaras, un NVR de Servidores o un equipo "sin alta" de
// la conciliación). "-", "N/A", "Desconocida": sin dato. `tipo`: 'camara' (por defecto) o 'nvr'.
function stockValoresDesdeEscaneo(eq) {
    const dato = (x) => {
        const t = String(x ?? '').trim();
        return (t === '-' || t === 'N/A' || t === 'Desconocida') ? '' : t;
    };
    return { ...stockValoresDeDispositivo(null), tipo: eq.tipo === 'nvr' ? 'nvr' : 'camara', modelo: dato(eq.modelo),
        mac: dato(eq.mac).toUpperCase(), serie: dato(eq.serie), firmware: dato(eq.firmware), instalado: true,
        ip: dato(eq.ip), descripcion: dato(eq.nombre) };
}

// La respuesta debe tener la forma de ConciliacionStockModel (cctv/web/schemas.py)
function stockConciliacionValida(conc) {
    const conId = (x) => !!x && typeof x.dispositivo_id === 'string';
    return !!conc && (conc.escaneado === null || typeof conc.escaneado === 'string') && typeof conc.editable === 'boolean'
        && Array.isArray(conc.propuestas) && conc.propuestas.every(conId) && Array.isArray(conc.conflictos)
        && (conc.informativas === undefined || (Array.isArray(conc.informativas) && conc.informativas.every(conId)))
        && conc.conflictos.every(conId) && Array.isArray(conc.no_vistos) && conc.no_vistos.every(conId)
        && Array.isArray(conc.sin_alta) && conc.sin_alta.every(eq => !!eq && (eq.tipo === 'camara' || eq.tipo === 'nvr'))
        && Array.isArray(conc.a_produccion) && conc.a_produccion.every(conId)
        && Array.isArray(conc.reemplazos) && conc.reemplazos.every(reemp => !!reemp && typeof reemp.nuevo_id === 'string'
            && typeof reemp.anterior_id === 'string');
}

// Lo que escribe «Aplicar»: los datos a completar/actualizar y cada dispositivo a poner en producción
function stockConciliacionAplicables(conc) {
    return conc.propuestas.length + conc.a_produccion.length;
}

// "Averiado · sin instalar" / "Revisar" / "Sin instalar": cómo figura en el stock algo que el escaneo ve en producción
function stockProduccionTexto(pr) {
    const partes = [];
    if (pr.condicion && pr.condicion !== 'operativo') partes.push(stockCondicionTexto(pr.condicion));
    if (!pr.instalado) partes.push(partes.length ? 'sin instalar' : 'Sin instalar');
    return partes.join(' · ');
}

// "1 dato a completar o actualizar · 1 a poner en producción · 0 diferencias · 2 sin alta · 1 instalado no visto
// (escaneo del 2026-10-08 05:00 UTC)"
function stockConciliacionResumen(conc) {
    if (!conc.escaneado) return 'Todavía no hay un escaneo de la red con el que comparar.';
    const n = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
    const cuando = conc.escaneado.replace('T', ' ').replace(/:\d{2}Z$/, ' UTC');
    return [n(conc.propuestas.length, 'dato a completar o actualizar', 'datos a completar o actualizar'),
        `${conc.a_produccion.length} a poner en producción`, n(conc.reemplazos.length, 'reemplazo', 'reemplazos'),
        n(conc.conflictos.length, 'diferencia', 'diferencias'), `${conc.sin_alta.length} sin alta`,
        n(conc.no_vistos.length, 'instalado no visto', 'instalados no vistos')].join(' · ') + ` (escaneo del ${cuando})`;
}

function stockHistorialValido(h) {
    return !!h && typeof h.dispositivo_id === 'string' && Array.isArray(h.entradas)
        && h.entradas.every(e => !!e && typeof e.cuando === 'string' && typeof e.campo === 'string');
}

// `enVariosGrabadores`: la cámara de esa tarjeta está en más de un grabador (mismo criterio que el canal violeta de
// Producción, `camarasEnVariosGrabadores`). Solo cambia la insignia «normal» (azul); una condición a revisar o averiada
// sigue avisando con su color.
function stockTarjetaDatos(dispositivo, camara, etiquetasTipo, enVariosGrabadores = false) {
    const prefijo = (etiquetasTipo && etiquetasTipo.get ? etiquetasTipo.get(dispositivo.tipo) : dispositivo.tipo)
        || 'Equipo';
    const macTxt = stockMacTexto(dispositivo.mac);
    const titulo = `${String(prefijo).toUpperCase()} - ${macTxt || `MAC ${STOCK_SIN_RELEVAR.toLowerCase()}`}`;

    let badgeTexto = '';
    let badgeClase = 'primary';

    if (dispositivo.instalacion && (dispositivo.instalacion.descripcion || dispositivo.instalacion.edificio)) {
        badgeTexto = String(dispositivo.instalacion.descripcion || dispositivo.instalacion.edificio).toUpperCase();
        badgeClase = (dispositivo.condicion && dispositivo.condicion !== 'operativo')
            ? (dispositivo.condicion === 'revisar' ? 'warning' : 'danger')
            : 'primary';
    } else if (dispositivo.condicion && dispositivo.condicion !== 'operativo') {
        badgeTexto = stockCondicionTexto(dispositivo.condicion);
        badgeClase = dispositivo.condicion === 'revisar' ? 'warning' : 'danger';
    } else if (dispositivo.instalacion || dispositivo.en_uso) {
        // Instalado sin descripción ni edificio: sigue estando en uso (no puede decir "Sin instalar").
        badgeTexto = 'INSTALADO';
        badgeClase = 'primary';
    } else {
        badgeTexto = dispositivo.disponible ? 'Disponible' : 'Sin instalar';
        badgeClase = dispositivo.disponible ? 'success' : 'secondary';
    }

    const multiGrabador = Boolean(camara) && enVariosGrabadores === true && badgeClase === 'primary';
    if (multiGrabador) badgeClase = 'multi';

    const modelo = dispositivo.modelo || dispositivo.marca || STOCK_ND;

    let nvrCanal = '';
    if (camara) {
        const nvrNombre = camara.nvr_name || camara.nvr_ip || 'NVR';
        const chNum = uiNumeroCanal(camara.channel_id);
        nvrCanal = chNum ? `${nvrNombre} · CANAL ${chNum}` : nvrNombre;
    } else if (dispositivo.instalacion && dispositivo.instalacion.edificio) {
        nvrCanal = [dispositivo.instalacion.edificio, dispositivo.instalacion.piso ? `P${dispositivo.instalacion.piso}` : ''].filter(Boolean).join(' · ');
    }

    const partesIdent = [`S/N: ${dispositivo.serie || STOCK_SIN_RELEVAR}`];
    if (dispositivo.patrimonio) partesIdent.push(`PAT: ${dispositivo.patrimonio}`);
    const seriePat = partesIdent.join(' · ');

    const ip = (camara && camara.ip_address) || (dispositivo.instalacion && dispositivo.instalacion.ip) || '';

    return {
        titulo,
        badgeTexto,
        badgeClase,
        multiGrabador,
        modelo,
        nvrCanal,
        seriePat,
        ip
    };
}

function stockInsigniaLista(d) {
    if (!d) return null;
    if (d.condicion && d.condicion !== 'operativo') {
        const clase = d.condicion === 'revisar' ? 'warning' : 'danger';
        return { texto: stockCondicionTexto(d.condicion), clase };
    }
    if (d.disponible) {
        return { texto: 'Disponible', clase: 'success' };
    }
    if (!d.instalacion && !d.en_uso) {
        return { texto: 'Sin instalar', clase: 'secondary' };
    }
    return null;
}
// Equipo monitoreado que corresponde a un dispositivo del stock (para su historial de caídas): el vínculo lo calcula
// el servidor (`stock.id` de cada cámara y NVR de /api/v2/datos); `cam` = la cámara desde la que se abrió el modal.
// {nvr, canal, nombre} ('' de canal = el grabador; con `equipo`: un equipo de red) o null si no lo observa el monitor.
function stockEquipoMonitoreado(d, cam, panel) {
    const camara = cam || (d && panel && Array.isArray(panel.camaras)
        ? panel.camaras.find(x => x && x.stock && x.stock.id === d.id) : null);
    if (camara && camara.nvr_ip && camara.channel_id !== null && camara.channel_id !== undefined) {
        return { nvr: String(camara.nvr_ip), canal: String(camara.channel_id), nombre: String(camara.camera_name || '') };
    }
    const grab = d && panel && Array.isArray(panel.nvrs) ? panel.nvrs.find(x => x && x.stock && x.stock.id === d.id) : null;
    if (grab && grab.ip) return { nvr: String(grab.ip), canal: '', nombre: String(grab.nvr_name || '') };
    // Equipo de red (decoder, analítica: config.toml > equipos_red): su historial va por su IP (`equipo`)
    const eq = d && panel && Array.isArray(panel.equipos_red)
        ? panel.equipos_red.find(x => x && x.stock && x.stock.id === d.id) : null;
    return eq && eq.ip ? { nvr: String(eq.ip), canal: '', nombre: String(eq.nombre || ''), equipo: true } : null;
}

// ¿Se muestra el gráfico de disponibilidad en la ficha? Solo si el monitor lo sondea (`monitoreado`, de stockEquipoMonitoreado)
// Y está en producción: un dispositivo del stock sin instalar (en depósito) no. Sin ficha (`d` nulo: una cámara que solo
// conoce el escaneo) cuenta como en producción: está en los datos del panel.
function stockMuestraGraficoDisponibilidad(d, monitoreado) {
    return !!monitoreado && (!d || d.en_uso === true);
}

const CAMPOS_LISTAR = [
    { id: 'ip', etiqueta: 'IP' },
    { id: 'mac', etiqueta: 'MAC' },
    { id: 'modelo', etiqueta: 'Modelo' },
    { id: 'patrimonio', etiqueta: 'Patrimonio' },
    { id: 'tipo', etiqueta: 'Tipo' },
    { id: 'descripcion', etiqueta: 'Descripción' },
    { id: 'serial', etiqueta: 'Serial' },
    { id: 'firmware', etiqueta: 'Firmware' },
    { id: 'canal', etiqueta: 'Canal' },
    { id: 'grabador', etiqueta: 'Grabador' },
    { id: 'rack', etiqueta: 'Rack' },
    { id: 'puerto', etiqueta: 'Puerto' },
    { id: 'edificio', etiqueta: 'Edificio' },
    { id: 'piso', etiqueta: 'Piso' }
];

function stockNormalizarDispositivo(dispositivo, camara = null, etiquetasTipo = new Map()) {
    const inst = (dispositivo && dispositivo.instalacion) || (camara && camara.stock) || {};
    let ip = (inst.ip && String(inst.ip).trim())
        || (camara && camara.ip_address && camara.ip_address !== 'N/A' ? String(camara.ip_address).trim() : '');
    const mac = stockMacTexto((dispositivo && dispositivo.mac) || (camara && camara.mac_address) || '');
    const modelo = (dispositivo && (dispositivo.modelo || stockMarcaModelo(dispositivo)))
        || (camara && (camara.model || camara.modelo)) || '';
    const patrimonio = (dispositivo && dispositivo.patrimonio) || '';
    const tipo = (dispositivo && (etiquetasTipo.get(dispositivo.tipo) || dispositivo.tipo))
        || (camara && (camara.device_type || 'Cámara')) || '';
    const descripcion = inst.descripcion || (dispositivo && dispositivo.descripcion)
        || (camara && (camara.camera_name || camara.nombre)) || '';
    const serial = (dispositivo && dispositivo.serie)
        || (camara && (camara.serial_number || camara.serial)) || '';
    const firmware = (dispositivo && dispositivo.firmware)
        || (camara && camara.firmware) || '';
    const chNum = camara && camara.channel_id !== undefined && camara.channel_id !== null
        ? (typeof uiNumeroCanal === 'function' ? uiNumeroCanal(camara.channel_id) : String(camara.channel_id))
        : '';
    const canal = chNum ? String(chNum).trim() : '';
    const grabador = (camara && (camara.nvr_name || camara.nvr_ip))
        ? String(camara.nvr_name || camara.nvr_ip).trim()
        : (dispositivo && (dispositivo.tipo === 'nvr' || dispositivo.tipo === 'dvr')
            ? String((dispositivo.instalacion && (dispositivo.instalacion.descripcion || dispositivo.instalacion.ip))
                || dispositivo.descripcion || dispositivo.modelo || '').trim()
            : '');
    const rackRaw = inst.rack ? String(inst.rack).trim() : '';
    const rack = /^\d+$/.test(rackRaw) ? rackRaw.padStart(4, '0') : rackRaw;
    const puerto = inst.puerto ? String(inst.puerto).trim() : '';
    const edificio = inst.edificio ? String(inst.edificio).trim() : '';
    const piso = inst.piso ? String(inst.piso).trim() : '';
    return {
        ip, mac, modelo, patrimonio, tipo, descripcion, serial, firmware,
        canal, grabador, rack, puerto, edificio, piso
    };
}

// Atajo de «Listar»: Alt+Shift+L (por qué Alt+Shift: `uiEsAtajoAltShift`, comun.js)
function stockEsAtajoListar(ev) {
    return uiEsAtajoAltShift(ev, 'l');
}

function stockFormatearRegistro(item, columnas) {
    if (!item || !columnas || !columnas.length) return '';
    const valores = columnas.map(col => {
        const val = item[col];
        if (val === null || val === undefined) return '';
        return String(val).trim();
    });
    if (!valores.some(v => v.length > 0)) return '';
    const formateados = columnas.length === 1
        ? valores
        : valores.map(v => v || '-');
    return formateados.join(' - ');
}

// Catálogos: arrastrar un subgrupo vacío a otro grupo. Lo arrastrado lleva SOLO la clave, con un tipo de dato propio
// (lo que se suelta desde otra pestaña u otro sitio no lo trae); el resto sale del catálogo cargado.
const TIPO_ARRASTRE_SUBGRUPO = 'application/x-cctv-subgrupo';

// El subgrupo `clave` a mover al grupo `destino` ({ clave, etiqueta }), o null: que exista, que se pueda mover (la
// misma regla que habilita arrastrarlo) y que no esté ya en ese grupo
function stockSubgrupoAMover(grupos, clave, destino) {
    if (typeof clave !== 'string' || !clave || !Array.isArray(grupos)) return null;
    for (const g of grupos) {
        const t = (g && Array.isArray(g.tipos) ? g.tipos : []).find(x => x && x.clave === clave);
        if (!t) continue;
        return g.clave !== destino && !stockMotivoNoMoverTipo(t) ? { clave: t.clave, etiqueta: t.etiqueta } : null;
    }
    return null;
}

// Si una cámara figura en varios grabadores, la que representa al dispositivo es la del grabador «más capaz» (más canales en
// total); con la misma capacidad, la que ya estaba (la primera). `capacidadDe(camara)` = canales totales de su grabador.
function stockCamaraRepresentante(actual, candidata, capacidadDe) {
    if (!actual) return candidata;
    if (!candidata) return actual;
    return capacidadDe(candidata) > capacidadDe(actual) ? candidata : actual;
}
// ==== STOCK PURO END ====
