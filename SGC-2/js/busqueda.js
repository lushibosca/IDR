// Búsqueda tokenizada (bloque puro): tokens, sinónimos de estado y tipo, filtros por campo de cámaras, NVR y "Otros
// dispositivos". La usan app.js (búsqueda global), produccion.js y stock.js. Se carga ANTES que app.js (app.js usa
// CAMPOS_BUSQUEDA al cargar); no depende de nada de app.js al cargar.

// ==== BUSQUEDA TOKENIZADA PURO BEGIN ====
const CAMPOS_BUSQUEDA = ['nombre', 'tipo', 'ip', 'mac', 'modelo', 'firmware', 'estado'];
const PANELES_BUSQUEDA = ['dashboard', 'stock', 'produccion', 'auditoria'];

function validarPanelesBusqueda(guardado) {
    if (!Array.isArray(guardado)) return [...PANELES_BUSQUEDA];
    return guardado.filter(p => PANELES_BUSQUEDA.includes(p));
}
const RE_TOKEN_CAMARA = /^(c[aá]maras?)$/i;
const RE_TOKEN_NVR = /^(servidor(es)?|nvrs?|grabador(es)?|dvrs?)$/i;

const ESTADOS_OFFLINE = new Set([
    'offline', 'caido', 'caida', 'caidos', 'caidas',
    'desconectado', 'desconectada', 'desconectados', 'desconectadas',
    'inactivo', 'inactiva', 'inactivos', 'inactivas'
]);
const ESTADOS_ONLINE = new Set([
    'online', 'levantado', 'levantada', 'levantados', 'levantadas', 'conectado', 'conectada', 'conectados', 'conectadas',
    'activo', 'activa', 'activos', 'activas',
    'en linea', 'en línea', 'operativo', 'operativa', 'operativos', 'operativas', 'en servicio'
]);
const ESTADOS_DEGRADADO = new Set([
    'sin grabacion', 'sin grabación', 'ping', 'degradado', 'degradada', 'degradados', 'degradadas'
]);
const ESTADOS_STOCK = {
    produccion: new Set(['produccion', 'producción', 'en uso', 'operativo', 'operativa']),
    disponible: new Set(['disponible', 'disponibles', 'libre', 'libres']),
    averiado: new Set(['averiado', 'averiada', 'averiados', 'averiadas', 'roto', 'rotos']),
    revisar: new Set(['revisar', 'a revisar', 'revision', 'revisión']),
    perdido: new Set(['perdido', 'perdida', 'perdidos', 'perdidas']),
    desafectado: new Set(['desafectado', 'desafectada', 'desafectados', 'desafectadas', 'baja', 'bajas']),
    descontinuado: new Set(['descontinuado', 'descontinuada', 'descontinuados', 'descontinuadas', 'discontinuado'])
};
const ESTADOS_FUERA_SERVICIO = new Set(['fuera', 'fuera de servicio', 'fuera-de-servicio']);

function normalizarTextoBusqueda(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function esTokenExclusion(token) {
    return typeof token === 'string' && (token.startsWith('!') || token.startsWith('-')) && token.length > 1;
}

function limpiarTokenExclusion(token) {
    return esTokenExclusion(token) ? token.slice(1).trim() : String(token ?? '').trim();
}

function tokenizarBusqueda(query) {
    if (!query || typeof query !== 'string') return [];
    let qNorm = query
        .replace(/(^|\s)([\!\-])\s+(\S)/g, '$1$2$3')
        .replace(/\bdomo\s+ptz\b/gi, 'domo-ptz')
        .replace(/\bmini\s+domo\b/gi, 'minidomo')
        .replace(/\bmini\s+bullet\b/gi, 'minibullet')
        .replace(/\ben\s+l[ií]nea\b/gi, 'en-linea')
        .replace(/\bsin\s+grabaci[oó]n\b/gi, 'sin-grabacion')
        .replace(/\ba\s+revisar\b/gi, 'a-revisar')
        .replace(/\ben\s+uso\b/gi, 'en-uso')
        .replace(/\bfuera\s+de\s+servicio\b/gi, 'fuera-de-servicio')
        .replace(/\banexo\s+([a-z0-9]+)\b/gi, 'anexo-$1')
        .replace(/\b(callao|pasco|rivadavia|yrigoyen)\s+(\d+)\b/gi, '$1-$2')
        .replace(/\bpiso[:\s]*([a-z0-9]+)\b/gi, 'piso-$1')
        .replace(/\bp([0-9]+|pb|ep[0-9]+|[0-9]+ss)\b/gi, 'piso-$1')
        .replace(/\brack[:\s]*([a-z0-9\-_]+)\b/gi, 'rack-$1')
        .replace(/\bpuerto[:\s]*([a-z0-9\/_\-]+)\b/gi, 'puerto-$1');

    const rawMatches = qNorm.match(/[\!\-]?"[^"]+"|[\!\-]\S+|\S+/g) || [];
    return rawMatches
        .map(raw => {
            let esExcl = false;
            let t = raw;
            if (/^[\!\-]/.test(t)) {
                esExcl = true;
                t = t.slice(1);
            }
            t = t.replace(/^"|"$/g, '').trim();
            if (!t) return '';

            t = t.replace(/^en-linea$/i, 'en linea')
                 .replace(/^sin-grabacion$/i, 'sin grabacion')
                 .replace(/^a-revisar$/i, 'a revisar')
                 .replace(/^en-uso$/i, 'en uso')
                 .replace(/^fuera-de-servicio$/i, 'fuera de servicio')
                 .replace(/^domo-ptz$/i, 'domo ptz')
                 .replace(/^minidomo$/i, 'mini domo')
                 .replace(/^minibullet$/i, 'mini bullet')
                 .replace(/^anexo-([a-z0-9]+)$/i, 'anexo $1')
                 .replace(/^(callao|pasco|rivadavia|yrigoyen)-(\d+)$/i, '$1 $2')
                 .replace(/^piso-([a-z0-9]+)$/i, 'piso $1')
                 .replace(/^rack-([a-z0-9\-_]+)$/i, 'rack $1')
                 .replace(/^puerto-([a-z0-9\/_\-]+)$/i, 'puerto $1');

            const norm = normalizarTextoBusqueda(t);
            if (!norm) return '';
            return esExcl ? ('!' + norm) : norm;
        })
        .filter(Boolean);
}

function coincideTokenUbicacion(inst, token) {
    if (!inst || !token) return false;
    const t = normalizarTextoBusqueda(token).trim();
    if (!t) return false;

    // Si inst es un string con el texto formateado de ubicación
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

    // inst es un objeto de instalación o stock
    // 1. Filtro específico de piso: "piso 3", "piso pb", "piso 1ss"
    if (t.startsWith('piso ')) {
        const valPiso = t.slice(5).trim();
        if (inst.piso && normalizarTextoBusqueda(inst.piso).trim() === valPiso) return true;
        if (inst.descripcion) {
            const rx = new RegExp('(^|[^a-z0-9])piso\\s+' + valPiso + '([^a-z0-9]|$)', 'i');
            if (rx.test(normalizarTextoBusqueda(inst.descripcion))) return true;
        }
        return false;
    }
    if (t === 'piso') {
        return Boolean(inst.piso);
    }

    // 2. Filtro específico de rack: "rack 0200"
    if (t.startsWith('rack ')) {
        const valRack = t.slice(5).trim();
        if (inst.rack && normalizarTextoBusqueda(inst.rack).includes(valRack)) return true;
        return false;
    }

    // 3. Filtro específico de puerto: "puerto 4/0/45"
    if (t.startsWith('puerto ')) {
        const valPuerto = t.slice(7).trim();
        if (inst.puerto && normalizarTextoBusqueda(inst.puerto).includes(valPuerto)) return true;
        return false;
    }

    // 4. Edificio
    if (inst.edificio && normalizarTextoBusqueda(inst.edificio).includes(t)) return true;

    // 5. Piso directo (ej: si busca "pb", "1ss", "3")
    if (inst.piso && normalizarTextoBusqueda(inst.piso).trim() === t) return true;

    // 6. Rack directo
    if (inst.rack && normalizarTextoBusqueda(inst.rack).includes(t)) return true;

    // 7. Puerto directo
    if (inst.puerto && normalizarTextoBusqueda(inst.puerto).includes(t)) return true;

    // 8. Descripción y comentarios de instalación
    if (inst.descripcion && normalizarTextoBusqueda(inst.descripcion).includes(t)) return true;
    if (inst.comentario && normalizarTextoBusqueda(inst.comentario).includes(t)) return true;

    // 9. Texto formateado completo de ubicación
    const uTexto = (typeof stockUbicacionTexto === 'function') ? stockUbicacionTexto(inst) : '';
    if (uTexto && normalizarTextoBusqueda(uTexto).includes(t)) return true;

    return false;
}

function matchTexto(valor, term) {
    if (!valor || !term) return false;
    return normalizarTextoBusqueda(valor).includes(normalizarTextoBusqueda(term));
}

function matchMAC(mac, term) {
    if (!mac || !term) return false;
    const sMac = normalizarTextoBusqueda(mac);
    const sTerm = normalizarTextoBusqueda(term);
    if (sMac.includes(sTerm)) return true;
    // Búsqueda flexible ignorando dos puntos, guiones y espacios (ej: 40b0 vs 40:b0)
    const cleanMac = sMac.replace(/[:\-\s]/g, '');
    const cleanTerm = sTerm.replace(/[:\-\s]/g, '');
    if (cleanTerm.length > 0 && cleanMac.includes(cleanTerm)) return true;
    return false;
}

function obtenerEstadoCamara(cam) {
    if (!cam) return '';
    if (cam.is_offline && cam.sin_senal) return "sin señal sin senal";
    if (cam.is_offline) return "caída caida offline caido caidos";
    if (cam.fallback_ping) return "sin grabación sin grabacion";
    return "levantado levantada en línea en linea online activo";
}

function obtenerEstadoNVR(nvr) {
    if (!nvr) return '';
    if (nvr.is_offline) return "caído caido offline caidos";
    return "levantado levantada en servicio online activo";
}

function coincideTokenSemanticoTipo(tipo, token) {
    const t = normalizarTextoBusqueda(token).trim();
    if (tipo === 'camara') {
        if (RE_TOKEN_CAMARA.test(t)) return true;
        if (RE_TOKEN_NVR.test(t)) return false;
    } else if (tipo === 'nvr') {
        if (RE_TOKEN_NVR.test(t)) return true;
        if (RE_TOKEN_CAMARA.test(t)) return false;
    }
    return null;
}

function coincideTokenSemanticoEstado(disp, token) {
    if (!disp || !token) return false;
    const t = normalizarTextoBusqueda(token).trim();

    // 1. Estado en monitoreo (Cámaras y NVRs)
    if (disp.is_offline !== undefined) {
        if (disp.is_offline) {
            if (ESTADOS_OFFLINE.has(t) || ESTADOS_FUERA_SERVICIO.has(t)) return true;
        } else if (disp.fallback_ping) {
            if (ESTADOS_DEGRADADO.has(t)) return true;
        } else {
            if (ESTADOS_ONLINE.has(t) || ESTADOS_STOCK.produccion.has(t)) return true;
        }
    }

    // 2. Estado/condición de stock vinculado (si tiene disp.stock o es dispositivo de stock)
    const stockInfo = disp.stock || (disp.condicion !== undefined || disp.en_uso !== undefined ? disp : null);
    if (stockInfo) {
        if (stockInfo.en_uso && (ESTADOS_STOCK.produccion.has(t) || ESTADOS_ONLINE.has(t))) return true;
        if (stockInfo.disponible && ESTADOS_STOCK.disponible.has(t)) return true;
        if (!stockInfo.en_uso && !stockInfo.disponible && ESTADOS_FUERA_SERVICIO.has(t)) return true;
        if (stockInfo.condicion) {
            const cond = normalizarTextoBusqueda(stockInfo.condicion).trim();
            if (ESTADOS_STOCK[cond] && ESTADOS_STOCK[cond].has(t)) return true;
            if (cond === t || cond.includes(t) || t.includes(cond)) return true;
        }
    }

    return false;
}

function normalizarCamposActivos(campos) {
    if (!campos) return new Set(CAMPOS_BUSQUEDA);
    if (typeof campos === 'string') {
        if (campos === 'todos') return new Set(CAMPOS_BUSQUEDA);
        return new Set([campos]);
    }
    if (campos instanceof Set) return campos;
    if (Array.isArray(campos)) return new Set(campos);
    return new Set(CAMPOS_BUSQUEDA);
}

function camaraCoincideToken(cam, token, campos) {
    // A. Comprobar filtro semántico de tipo si el campo 'tipo' está activo
    if (campos.has('tipo')) {
        const matchTipo = coincideTokenSemanticoTipo('camara', token);
        if (matchTipo === true) return true;
        if (matchTipo === false) return false;
        // el tipo del stock vinculado a la cámara («Domo PTZ», «Bullet»...): lo resuelve app.js (no puro)
        const tipoStock = typeof stockTipoDeCamaraActual === 'function' ? stockTipoDeCamaraActual(cam) : '';
        if (tipoStock && matchTexto(tipoStock, token)) return true;
    }

    // B. Comprobar filtro semántico de estado si el campo 'estado' está activo
    if (campos.has('estado')) {
        if (coincideTokenSemanticoEstado(cam, token)) return true;
        if (matchTexto(obtenerEstadoCamara(cam), token)) return true;
    }

    // C. Comprobar campos activos
    const uStock = (typeof ubicacionStockTexto === 'function') ? ubicacionStockTexto(cam) : '';
    if (campos.has('nombre')) {
        if (matchTexto(cam.camera_name, token)) return true;
        if (matchTexto(cam.nvr_name, token)) return true;
        if (cam.stock && coincideTokenUbicacion(cam.stock, token)) return true;
        if (uStock && coincideTokenUbicacion(uStock, token)) return true;
    }
    if (campos.has('ip') && matchTexto(cam.ip_address, token)) return true;
    if (campos.has('mac') && matchMAC(cam.mac_address, token)) return true;
    if (campos.has('modelo') && matchTexto(cam.modelo, token)) return true;
    if (campos.has('firmware') && matchTexto(cam.firmware, token)) return true;

    return false;
}

// Regla común de «cumple este token»: sin entidad o sin token no filtra; sin campos activos no cumple nada;
// un token de exclusión (! o -) invierte la coincidencia. `coincide` es la función propia de cada tipo de equipo.
function cumpleTokenCon(coincide, entidad, token, camposActivos) {
    if (!entidad || !token) return true;
    const campos = normalizarCamposActivos(camposActivos);
    if (campos.size === 0) return false;

    const esExcl = esTokenExclusion(token);
    const tok = esExcl ? limpiarTokenExclusion(token) : token;
    if (!tok) return true;

    const hay = coincide(entidad, tok, campos);
    return esExcl ? !hay : hay;
}

function camaraCumpleToken(cam, token, camposActivos) {
    return cumpleTokenCon(camaraCoincideToken, cam, token, camposActivos);
}

function camaraCumpleBusqueda(cam, tokens, camposActivos) {
    if (!tokens || tokens.length === 0) return true;
    return tokens.every(tok => camaraCumpleToken(cam, tok, camposActivos));
}

function nvrCoincideToken(nvr, token, campos) {
    // A. Comprobar filtro semántico de tipo si el campo 'tipo' está activo. Un equipo de red (decoder, analítica)
    //    trae su `tipo` del activo: no es un grabador, se busca por ese tipo.
    if (campos.has('tipo')) {
        if (nvr.tipo) {
            if (matchTexto(nvr.tipo, token)) return true;
        } else {
            const matchTipo = coincideTokenSemanticoTipo('nvr', token);
            if (matchTipo === true) return true;
            if (matchTipo === false) return false;
        }
    }

    // B. Comprobar filtro semántico de estado si el campo 'estado' está activo
    if (campos.has('estado')) {
        if (coincideTokenSemanticoEstado(nvr, token)) return true;
        if (matchTexto(obtenerEstadoNVR(nvr), token)) return true;
    }

    // C. Comprobar campos activos
    const uStock = (typeof ubicacionStockTexto === 'function') ? ubicacionStockTexto(nvr) : '';
    if (campos.has('nombre')) {
        if (matchTexto(nvr.nvr_name, token)) return true;
        if (nvr.stock && coincideTokenUbicacion(nvr.stock, token)) return true;
        if (uStock && coincideTokenUbicacion(uStock, token)) return true;
    }
    if (campos.has('ip') && matchTexto(nvr.ip, token)) return true;
    if (campos.has('mac') && matchMAC(nvr.mac_address, token)) return true;
    if (campos.has('modelo') && matchTexto(nvr.modelo, token)) return true;
    if (campos.has('firmware') && matchTexto(nvr.firmware, token)) return true;

    return false;
}

function nvrCumpleToken(nvr, token, camposActivos) {
    return cumpleTokenCon(nvrCoincideToken, nvr, token, camposActivos);
}

function nvrCumpleBusqueda(nvr, tokens, camposActivos) {
    if (!tokens || tokens.length === 0) return true;
    return tokens.every(tok => nvrCumpleToken(nvr, tok, camposActivos));
}

function cumpleFiltroCamara(cam, term, field) {
    if (!term || !String(term).trim()) return true;
    const tokens = tokenizarBusqueda(term);
    return camaraCumpleBusqueda(cam, tokens, field);
}

function cumpleFiltroNVR(nvr, term, field) {
    if (!term || !String(term).trim()) return true;
    const tokens = tokenizarBusqueda(term);
    return nvrCumpleBusqueda(nvr, tokens, field);
}

// `esCamara`: el tipo es del grupo Cámaras (la insignia sale del tipo: BULLET, DOMO, PTZ...)
function tipoInsigniaTexto(tipo, esCamara = false) {
    if (!tipo) return 'DEV';
    const tipoStr = String(tipo).toLowerCase().trim();
    if (tipoStr === 'camara') return 'CAM';
    if (esCamara) {
        const conocidas = new Map([['bullet', 'BULLET'], ['domo', 'DOMO'], ['domo_ptz', 'PTZ'], ['turret', 'TURRET']]);
        return conocidas.get(tipoStr) || tipoStr.replace(/_/g, '').slice(0, 6).toUpperCase();
    }
    if (tipoStr === 'nvr') return 'NVR';
    if (tipoStr === 'dvr') return 'DVR';
    if (tipoStr === 'switch') return 'SW';
    if (tipoStr === 'ups') return 'UPS';
    if (tipoStr === 'monitor') return 'MON';
    if (tipoStr === 'pc') return 'PC';
    if (tipoStr === 'teclado_red') return 'TEC';
    if (tipoStr === 'servidor') return 'SRV';
    return tipoStr.slice(0, 4).toUpperCase();
}

function otroDispositivoCoincideToken(disp, token, campos) {
    // A. Comprobar filtro semántico de tipo si el campo 'tipo' está activo
    if (campos.has('tipo')) {
        // «servidores» = el grupo (analítica, decoder... también); un domo o un bullet son cámaras para «cámaras»/«nvr»;
        // el resto, por su clave y su etiqueta
        if (/^servidor(es)?$/.test(normalizarTextoBusqueda(token).trim())) {
            return typeof stockGrupoDeActual === 'function' ? stockGrupoDeActual(disp.tipo) === 'servidores'
                : (disp.tipo === 'nvr' || disp.tipo === 'dvr');
        }
        const esCam = typeof stockEsCamaraActual === 'function' ? stockEsCamaraActual(disp.tipo) : disp.tipo === 'camara';
        const matchTipo = coincideTokenSemanticoTipo(esCam ? 'camara' : disp.tipo, token);
        if (matchTipo === true) return true;
        if (matchTipo === false) return false;
        if (matchTexto(disp.tipo, token)) return true;
        const etiqueta = typeof stockTipoEtiquetaActual === 'function' ? stockTipoEtiquetaActual(disp.tipo) : '';
        if (etiqueta && matchTexto(etiqueta, token)) return true;
    }

    // B. Comprobar filtro semántico de estado si el campo 'estado' está activo
    if (campos.has('estado')) {
        if (coincideTokenSemanticoEstado(disp, token)) return true;
        const estadoTexto = disp.condicion === 'averiado' ? 'averiado caido offline' : 'levantado en linea online produccion operativo';
        if (matchTexto(estadoTexto, token)) return true;
    }

    // C. Comprobar campos activos
    const inst = disp.instalacion || {};
    const uStock = (typeof stockUbicacionTexto === 'function') ? stockUbicacionTexto(inst) : '';
    if (campos.has('nombre')) {
        if (coincideTokenUbicacion(inst, token)) return true;
        if (uStock && coincideTokenUbicacion(uStock, token)) return true;
        if (matchTexto(disp.comentario, token)) return true;
    }
    if (campos.has('ip') && matchTexto(inst.ip, token)) return true;
    if (campos.has('mac') && matchMAC(disp.mac, token)) return true;
    if (campos.has('modelo')) {
        if (matchTexto(disp.modelo, token)) return true;
        if (matchTexto(disp.marca, token)) return true;
    }
    if (campos.has('firmware') && matchTexto(disp.firmware, token)) return true;
    return false;
}

function otroDispositivoCumpleToken(disp, token, camposActivos) {
    return cumpleTokenCon(otroDispositivoCoincideToken, disp, token, camposActivos);
}

function otroDispositivoCumpleBusqueda(disp, tokens, camposActivos) {
    if (!tokens || tokens.length === 0) return true;
    return tokens.every(tok => otroDispositivoCumpleToken(disp, tok, camposActivos));
}

function obtenerOtrosDispositivosProduccion(
    stockDispositivos = (typeof _cacheStockResumen !== 'undefined' ? _cacheStockResumen?.dispositivos : null),
    camaras = (typeof globalData !== 'undefined' ? globalData?.camaras : null),
    nvrs = (typeof globalData !== 'undefined' ? globalData?.nvrs : null)
) {
    const listaStock = Array.isArray(stockDispositivos) ? stockDispositivos : [];
    if (listaStock.length === 0) return [];

    const listaCamaras = Array.isArray(camaras) ? camaras : [];
    const listaNvrs = Array.isArray(nvrs) ? nvrs : [];

    const macsMonitoreadas = new Set();
    const ipsMonitoreadas = new Set();
    const stockIdsMonitoreados = new Set();

    for (const camItem of listaCamaras) {
        if (camItem.stock && camItem.stock.id) stockIdsMonitoreados.add(camItem.stock.id);
        if (camItem.mac_address && camItem.mac_address !== '-' && camItem.mac_address !== 'N/A') {
            const m = camItem.mac_address.replace(/[:\-\s]/g, '').toUpperCase();
            if (m) macsMonitoreadas.add(m);
        }
        if (camItem.ip_address && camItem.ip_address !== '-' && camItem.ip_address !== 'N/A') {
            ipsMonitoreadas.add(camItem.ip_address.trim());
        }
    }

    for (const nvrItem of listaNvrs) {
        if (nvrItem.stock && nvrItem.stock.id) stockIdsMonitoreados.add(nvrItem.stock.id);
        if (nvrItem.mac_address && nvrItem.mac_address !== '-' && nvrItem.mac_address !== 'N/A') {
            const m = nvrItem.mac_address.replace(/[:\-\s]/g, '').toUpperCase();
            if (m) macsMonitoreadas.add(m);
        }
        if (nvrItem.ip && nvrItem.ip !== '-' && nvrItem.ip !== 'N/A') {
            ipsMonitoreadas.add(nvrItem.ip.trim());
        }
    }

    return listaStock.filter(disp => {
        if (!disp) return false;
        if (!disp.en_uso && !disp.instalacion) return false;

        if (disp.id && stockIdsMonitoreados.has(disp.id)) return false;

        if (disp.mac) {
            const m = disp.mac.replace(/[:\-\s]/g, '').toUpperCase();
            if (m && macsMonitoreadas.has(m)) return false;
        }

        if (disp.instalacion && disp.instalacion.ip) {
            const ip = disp.instalacion.ip.trim();
            if (ip && ipsMonitoreadas.has(ip)) return false;
        }

        return true;
    });
}
// ==== BUSQUEDA TOKENIZADA PURO END ====

// Exportar funciones y constantes para acceso global y módulos
window.normalizarTextoBusqueda = normalizarTextoBusqueda;
window.CAMPOS_BUSQUEDA = CAMPOS_BUSQUEDA;
window.RE_TOKEN_CAMARA = RE_TOKEN_CAMARA;
window.RE_TOKEN_NVR = RE_TOKEN_NVR;
window.tokenizarBusqueda = tokenizarBusqueda;
window.coincideTokenSemanticoTipo = coincideTokenSemanticoTipo;
window.coincideTokenSemanticoEstado = coincideTokenSemanticoEstado;
window.cumpleFiltroCamara = cumpleFiltroCamara;
window.tipoInsigniaTexto = tipoInsigniaTexto;
window.obtenerOtrosDispositivosProduccion = obtenerOtrosDispositivosProduccion;
window.otroDispositivoCumpleBusqueda = otroDispositivoCumpleBusqueda;
window.cumpleFiltroNVR = cumpleFiltroNVR;
window.PANELES_BUSQUEDA = PANELES_BUSQUEDA;
window.validarPanelesBusqueda = validarPanelesBusqueda;
window.coincideTokenUbicacion = coincideTokenUbicacion;
window.esTokenExclusion = esTokenExclusion;
window.limpiarTokenExclusion = limpiarTokenExclusion;
