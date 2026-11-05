'use strict';
// Stock de SGC-2: las reglas de cctv_monitor (cctv/stock.py, stock_db.py y web/servicios/stock.py) portadas a funciones
// PURAS sobre un objeto de datos (el JSON que se guarda en el navegador y se sincroniza). Nada de DOM, red, disco ni
// reloj propio: el instante y el id nuevo se inyectan (`ctx.ahora`, `ctx.nuevoId`). Lo usa js/api-local.js, que
// responde lo mismo que respondía la API del servidor (así el front del stock no cambia).
// Todo lo que entra (archivo importado, localStorage, Gist) es NO confiable: `sanearDatos` lo revisa entero.

// ==== DATOS PURO BEGIN ====
const FORMATO_DATOS = 'sgc2';
const VERSION_DATOS = 1;
const CONDICIONES_STOCK = ['operativo', 'revisar', 'averiado', 'descontinuado', 'desafectado', 'perdido', 'baja'];
const CONDICION_PRODUCCION = 'operativo';
const LARGOS_STOCK = {
    id: 40, tipo: 30, etiqueta: 40, forma: 20, marca: 60, modelo: 80, serie: 80, mac: 17, patrimonio: 40,
    firmware: 80, pagina_modelo: 300, comentario: 500, descripcion: 120, ip: 45, edificio: 60, piso: 20, rack: 40,
    puerto: 40
};
const GRUPO_CAMARAS = 'camaras';
const TIPOS_GRABADOR = ['nvr', 'dvr'];
const ORDEN_GRUPOS_SISTEMA = ['servidores', 'camaras', 'otros'];
const GRUPO_POR_DEFECTO = 'otros';
const GRUPOS_BASE = [['servidores', 'Servidores'], ['camaras', 'Cámaras'], ['otros', 'Otros']];
const CATALOGO_BASE = [
    ['nvr', 'NVR', 'servidores', true], ['dvr', 'DVR', 'servidores', true], ['analitica', 'Analítica', 'servidores'],
    ['decoder', 'Decoder', 'servidores'], ['switch', 'Switch', 'servidores'],
    ['camara', 'Cámara (sin especificar)', 'camaras', true], ['domo', 'Domo', 'camaras'], ['bullet', 'Bullet', 'camaras'],
    ['turret', 'Turret', 'camaras'], ['minidomo', 'Mini domo', 'camaras'], ['minibullet', 'Mini bullet', 'camaras'],
    ['domo_ptz', 'Domo PTZ', 'camaras'],
    ['monitor', 'Monitor', 'otros'], ['teclado_red', 'Teclado / joystick PTZ', 'otros'], ['pc', 'PC', 'otros'],
    ['otro', 'Otro', 'otros']
];
const TIPOS_SISTEMA = CATALOGO_BASE.filter(t => t[3]).map(t => t[0]);
const MAX_GRUPOS = 20;
const MAX_TIPOS = 200;
const MAX_DISPOSITIVOS = 20000;
const MAX_UBICACIONES = 2000;
const MAX_MODELOS_PAGINA = 2000;
const MAX_HISTORIAL = 2000;               // cambios que se conservan (los más viejos se descartan)
const MAX_HISTORIAL_DISPOSITIVO = 200;
const MAX_HISTORIAL_PAGINA = 100;
const MAX_TEXTO_BUSQUEDA = 60;
const MAX_ALTAS_LOTE = 500;
const MAX_PROBLEMAS_LOTE = 8;
const MAX_LOTE = 200;
const CANALES_MAX = 4096;
const CAMPOS_DISPOSITIVO = ['tipo', 'condicion', 'marca', 'modelo', 'serie', 'mac', 'patrimonio', 'firmware', 'canales',
    'comentario'];
// `asignaciones`: lista de {grabador (id del NVR/DVR), canal}: en qué canales está (una cámara puede estar en varios grabadores,
// todas por igual; vacía = «Otros dispositivos»). La API además da `grabador`/`canal` de la primera, solo para quien lee.
const CAMPOS_INSTALACION = ['descripcion', 'ip', 'edificio', 'piso', 'rack', 'puerto', 'comentario', 'asignaciones'];
const MAX_ASIGNACIONES = 16;
/** Las asignaciones de una instalación (siempre una lista). */
const asignacionesDe = (i) => (i && Array.isArray(i.asignaciones) ? i.asignaciones : []);
/** Texto estable de una lista de asignaciones (para comparar y para el historial): «id#3, id2#5» o null. */
const textoAsignaciones = (lista) => {
    const l = (Array.isArray(lista) ? lista : []).map(a => `${a.grabador}#${a.canal}`).sort();
    return l.length ? l.join(', ') : null;
};
const CAMPOS_LOTE = ['tipo', 'condicion', 'edificio', 'piso', 'rack'];
const EQUIVALENCIAS_MARCA = new Map([['bosh', 'Bosch']]);
const NULOS_SERIE = new Set(['relevar', 'n/a', 's/n', 'sn', '-', 'no']);
const NULOS_PATRIMONIO = new Set(['no', 'n/a', '-', 's/p', 'sin']);
const ORIGENES = ['manual', 'scanner', 'importacion', 'migracion'];
const OBJETOS_HISTORIAL = ['dispositivo', 'grupo', 'tipo', 'catalogo', 'modelo'];
const ACCIONES_HISTORIAL = ['agregar', 'modificar', 'borrar'];
const OBJETOS_UBICACION = ['edificio', 'piso'];
const ACCIONES_UBICACION = ['agregar', 'renombrar', 'borrar'];
const RE_FECHA_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const RE_ID = /^[A-Za-z0-9_-]+$/;
const RE_CLAVE = /^[a-z0-9_]+$/;
const RE_PUERTO = /^[A-Za-z]{0,20}[0-9]{1,4}(?:\/[0-9]{1,4}){0,3}$/;
const RE_MAC = /^[0-9A-Fa-f]{2}(?:([:-]?)[0-9A-Fa-f]{2})(?:\1[0-9A-Fa-f]{2}){4}$/;
const RE_IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// Caracteres de control y de dirección (bidi) que no se guardan ni se muestran (como security._RE_CONTROL)
const RE_CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u034f\\u061c\\u115f\\u1160\\u17b4\\u17b5\\u180e'
    + '\\u200b\\u200e\\u200f\\u2028-\\u202e\\u2060-\\u206f\\u3164\\ufeff\\uffa0]|\\udb40[\\udc00-\\udc7f]', 'g');

/** Un error de una regla, con el estado HTTP que daba la API y el mensaje crudo (sin prefijo). */
class ErrorDatos extends Error {
    constructor(tipo, mensaje, estado) {
        super(mensaje);
        this.tipo = tipo;                    // validacion | regla | no_encontrado | duplicado | conflicto
        this.estado = estado || ({ validacion: 422, no_encontrado: 404 })[tipo] || 409;
    }
    /** El texto que mostraba la API (servicios/stock.py `_traducir`). */
    detalle() {
        if (this.tipo === 'validacion') return `Datos no válidos: ${this.message}`;
        if (this.tipo === 'duplicado') return `Datos repetidos: ${this.message}`;
        if (this.tipo === 'conflicto') {
            return 'El dispositivo cambió desde que lo abriste (¿lo editó otra persona?): recargá y volvé a intentar.';
        }
        return this.message;
    }
}
const errValidacion = (m) => new ErrorDatos('validacion', m);
const errRegla = (m, estado = 409) => new ErrorDatos('regla', m, estado);
const errNoEncontrado = (m = 'El dispositivo no existe.') => new ErrorDatos('no_encontrado', m);
const errDuplicado = (m) => new ErrorDatos('duplicado', m);
const errConflicto = () => new ErrorDatos('conflicto', 'el dispositivo cambió desde que se abrió');

// ---------------------------------------------------------------------------------------------- textos y formatos
function quitarControl(texto) {
    return String(texto).replace(RE_CONTROL, '');
}

/** Texto para guardar o mostrar: sin control/bidi, sin espacios en los extremos y acotado; lo que no es texto ni
 *  entero, "" (security.texto_acotado). */
function textoAcotado(valor, largo) {
    if (typeof valor === 'string' || (typeof valor === 'number' && Number.isInteger(valor))) {
        return quitarControl(String(valor)).trim().slice(0, largo);
    }
    return '';
}
const _t = (valor, campo) => textoAcotado(valor, LARGOS_STOCK[campo]);

function _opcional(valor, campo, nulos = null) {
    const t = _t(valor, campo);
    return !t || (nulos && nulos.has(t.toLowerCase())) ? null : t;
}

/** Entero en [minimo, maximo] o null: rechaza booleanos, decimales y texto que no sea un entero ASCII. */
function enteroAcotado(valor, minimo, maximo) {
    let n;
    if (typeof valor === 'number') {
        if (!Number.isInteger(valor)) return null;
        n = valor;
    } else if (typeof valor === 'string') {
        const t = valor.trim();
        if (!/^[+-]?[0-9]+$/.test(t)) return null;
        n = Number(t);
    } else {
        return null;
    }
    return n >= minimo && n <= maximo ? n : null;
}

/** MAC en forma canónica "aa:bb:cc:dd:ee:ff" (con ':' o '-' o sin separador, siempre el mismo), o null. */
function macNormalizada(valor) {
    const t = quitarControl(valor === null || valor === undefined || valor === false ? '' : String(valor)).trim();
    if (t.length > 17 || !RE_MAC.test(t)) return null;
    const hexa = t.replace(/[:-]/g, '').toLowerCase();
    return hexa.match(/../g).join(':');
}

/** IP literal (v4 o v6, con zona `%eth0`) normalizada, o null. Nunca un nombre de host. */
function ipLiteralValida(valor) {
    if (valor === null || valor === undefined) return null;
    const t = String(valor).trim();
    if (RE_IPV4.test(t)) return t;
    const [direccion, zona, ...resto] = t.split('%');
    if (resto.length || zona === '' || (zona !== undefined && !/^[A-Za-z0-9_.-]{1,32}$/.test(zona))) return null;
    if (!/^[0-9A-Fa-f:.]{2,45}$/.test(direccion) || !direccion.includes(':')) return null;
    try {
        const host = new URL(`http://[${direccion}]/`).hostname;
        const normal = host.slice(1, -1);
        return zona === undefined ? normal : `${normal}%${zona}`;
    } catch (e) {
        return null;
    }
}

/** `valor` si es una dirección http(s) completa (con host, sin usuario ni clave, sin espacios): solo se muestra como
 *  enlace. */
function urlWeb(valor, largo = LARGOS_STOCK.pagina_modelo) {
    if (typeof valor !== 'string') return null;
    const t = valor.trim();
    if (!t || t.length > largo || /[\s\u0000-\u001f\u007f]/.test(t)) return null;
    try {
        const u = new URL(t);
        if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname || u.username || u.password) return null;
    } catch (e) {
        return null;
    }
    return t;
}

function sinAcentos(texto) {
    return String(texto).normalize('NFKD').replace(/\p{M}/gu, '');
}
/** Para ordenar y comparar etiquetas: sin acentos ni mayúsculas («Árbol» va con la A). */
function ordenTexto(texto) {
    return sinAcentos(texto).toLowerCase();
}
const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const compararTuplas = (a, b) => {
    for (let i = 0; i < a.length; i++) {
        const c = comparar(a[i], b[i]);
        if (c) return c;
    }
    return 0;
};

function normalizarMarca(valor) {
    const t = _t(valor, 'marca');
    return EQUIVALENCIAS_MARCA.get(t.toLowerCase()) || t;
}

const ORDINAL = '(?:ER|RO|DO|TO|MO|VO|NO|°|º)?';
function _nPiso(...grupos) {
    for (const g of grupos) {
        const n = g ? enteroAcotado(g, 0, 999) : null;
        if (n !== null) return n;
    }
    return 1;
}
const ALIAS_PISO = [
    [/^(?:PB|P\.? ?B\.?|PLANTA BAJA|BAJA)$/, () => 'PB'],
    [new RegExp(`^(?:([0-9]{1,2})${ORDINAL} ?(?:SS|SUBSUELO|SOTANO)|(?:SS|SUBSUELO|SOTANO) ?([0-9]{1,2})?)$`),
        (m) => `${_nPiso(m[1], m[2])}SS`],
    [new RegExp(`^(?:([0-9]{1,2})${ORDINAL} ?(?:EP|ENTREPISO)|(?:EP|ENTREPISO) ?([0-9]{1,2})?)$`),
        (m) => `EP${_nPiso(m[1], m[2])}`],
    [/^(?:TERRAZA|AZOTEA|TZ)$/, () => 'TERRAZA'],
    [new RegExp(`^([0-9]{1,3})${ORDINAL}$`), (m) => String(_nPiso(m[1]))]
];

/** UNA forma de escribir cada piso: "pb" -> "PB", "1er piso" -> "1", "subsuelo 1" -> "1SS", "entrepiso 2" -> "EP2",
 *  "azotea" -> "TERRAZA"; lo que no reconoce, en mayúsculas y con los espacios normalizados. */
function normalizarPiso(valor) {
    const t = _t(valor, 'piso').toUpperCase().split(/\s+/).filter(Boolean).join(' ');
    let plano = String(t).normalize('NFD').replace(/\p{M}/gu, '');
    plano = plano.replace(/\bPISO\b/g, ' ').split(/\s+/).filter(Boolean).join(' ');
    for (const [patron, forma] of ALIAS_PISO) {
        const m = plano.match(patron);
        if (m) return forma(m);
    }
    return t;
}

function idValido(valor) {
    const t = _t(valor, 'id');
    return t && RE_ID.test(t) ? t : null;
}
function claveValida(valor) {
    const t = _t(valor, 'tipo');
    return t && RE_CLAVE.test(t) ? t : null;
}
const espacios = (t) => String(t).split(/\s+/).filter(Boolean).join(' ');

/** «Cámara térmica» -> "camara_termica"; si ya existe, "_2", "_3"... */
function claveDesdeNombre(nombre, existentes) {
    const largo = LARGOS_STOCK.tipo;
    const plano = sinAcentos(nombre).toLowerCase();
    const base = plano.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, largo).replace(/_+$/, '');
    if (!base) throw errValidacion('nombre: no deja una clave válida (usá letras o números)');
    const usadas = new Set(existentes);
    if (!usadas.has(base)) return base;
    for (let n = 2; n < usadas.size + 3; n++) {
        const sufijo = `_${n}`;
        const candidata = base.slice(0, largo - sufijo.length).replace(/_+$/, '') + sufijo;
        if (!usadas.has(candidata)) return candidata;
    }
    throw errRegla('no se pudo generar una clave libre');
}

function claveModelo(modelo) {
    return espacios(textoAcotado(modelo, LARGOS_STOCK.modelo)).toLowerCase();
}
function claveSerie(serie) {
    const s = serie ? espacios(String(serie).toUpperCase()) : '';
    return s || null;
}

// ---------------------------------------------------------------------------------------------- datos y catálogo
function catalogoBase() {
    return {
        grupos: GRUPOS_BASE.map(([clave, etiqueta]) => ({ clave, etiqueta, sistema: true })),
        tipos: CATALOGO_BASE.map(([clave, etiqueta, grupo, sistema]) => ({ clave, etiqueta, grupo, sistema: !!sistema }))
    };
}

/** Datos de una instalación nueva: catálogo base, sin dispositivos. */
function datosVacios() {
    return {
        formato: FORMATO_DATOS, version: VERSION_DATOS, dispositivos: [], catalogo: catalogoBase(), edificios: [],
        pisos: [], modelos_pagina: [], historial: [], historial_seq: 0, eliminados: { dispositivos: {} }
    };
}

function gruposPorTipo(datos) {
    const grupos = new Set(datos.catalogo.grupos.map(g => g.clave));
    return new Map(datos.catalogo.tipos.map(t => [t.clave, grupos.has(t.grupo) ? t.grupo : GRUPO_POR_DEFECTO]));
}
function esCamara(tipo, grupos) {
    return grupos.get(tipo) === GRUPO_CAMARAS;
}

/** Grupos con sus tipos y cuántos dispositivos tiene cada tipo, en el orden de presentación. */
function catalogoOrdenado(datos) {
    const cantidad = new Map();
    for (const d of datos.dispositivos) cantidad.set(d.tipo, (cantidad.get(d.tipo) || 0) + 1);
    const porGrupo = new Map(datos.catalogo.grupos.map(g => [g.clave, { ...g, tipos: [] }]));
    for (const t of datos.catalogo.tipos) {
        let g = porGrupo.get(t.grupo);
        if (!g) {
            if (!porGrupo.has(GRUPO_POR_DEFECTO)) {
                porGrupo.set(GRUPO_POR_DEFECTO, { clave: GRUPO_POR_DEFECTO, etiqueta: 'Otros', sistema: true, tipos: [] });
            }
            g = porGrupo.get(GRUPO_POR_DEFECTO);
        }
        g.tipos.push({ clave: t.clave, etiqueta: t.etiqueta, grupo: g.clave, sistema: !!t.sistema,
            cantidad: cantidad.get(t.clave) || 0 });
    }
    const claveGrupo = (g) => (ORDEN_GRUPOS_SISTEMA.includes(g.clave)
        ? [0, ORDEN_GRUPOS_SISTEMA.indexOf(g.clave), '', ''] : [1, 0, ordenTexto(g.etiqueta), g.clave]);
    return [...porGrupo.values()]
        .sort((a, b) => compararTuplas(claveGrupo(a), claveGrupo(b)))
        .map(g => ({ ...g, tipos: g.tipos.sort((a, b) => compararTuplas([ordenTexto(a.etiqueta), a.clave],
            [ordenTexto(b.etiqueta), b.clave])) }));
}

/** `grupos` y `tipos` de la respuesta de /api/stock y de cada edición del catálogo. */
function catalogoApi(datos) {
    const ordenados = catalogoOrdenado(datos);
    return {
        grupos: ordenados.map(g => ({ clave: g.clave, etiqueta: g.etiqueta, sistema: !!g.sistema,
            tipos: g.tipos.map(t => ({ clave: t.clave, etiqueta: t.etiqueta, sistema: t.sistema, cantidad: t.cantidad })) })),
        tipos: ordenados.flatMap(g => g.tipos.map(t => ({ clave: t.clave, etiqueta: t.etiqueta, grupo: g.clave })))
    };
}

function paginasModelo(datos) {
    const paginas = new Map();
    for (const p of datos.modelos_pagina) paginas.set(claveModelo(p.modelo), p);
    return paginas;
}

function instalacionApi(i) {
    if (!i) return null;
    const r = {};
    for (const c of CAMPOS_INSTALACION) {
        if (c === 'asignaciones') continue;
        r[c] = i[c] === undefined ? (c === 'ip' ? null : '') : i[c];
    }
    const lista = asignacionesDe(i).map(a => ({ grabador: a.grabador, canal: a.canal }));
    r.asignaciones = lista;
    r.grabador = lista.length ? lista[0].grabador : null;      // solo lectura: la primera (lo viejo del front lee estos dos)
    r.canal = lista.length ? lista[0].canal : null;
    return r;
}

function dispositivoApi(d, paginas) {
    const p = paginas.get(claveModelo(d.modelo));
    return {
        id: d.id, tipo: d.tipo, condicion: d.condicion, marca: d.marca, modelo: d.modelo, serie: d.serie, mac: d.mac,
        patrimonio: d.patrimonio, firmware: d.firmware, pagina_modelo: p ? p.pagina : null, canales: d.canales,
        comentario: d.comentario, instalacion: instalacionApi(d.instalacion), version: d.version,
        en_uso: !!d.instalacion, disponible: !d.instalacion && d.condicion === 'operativo'
    };
}

/** GET /api/stock */
function listado(datos) {
    const paginas = paginasModelo(datos);
    return {
        inicializado: true, editable: true, condiciones: [...CONDICIONES_STOCK], ...catalogoApi(datos),
        edificios: [...datos.edificios].sort(comparar), pisos: [...datos.pisos].sort(comparar),
        dispositivos: [...datos.dispositivos].sort((a, b) => comparar(a.id, b.id)).map(d => dispositivoApi(d, paginas))
    };
}

// ---------------------------------------------------------------------------------------------- historial
function _registrar(datos, ctx, entradas) {
    for (const e of entradas) {
        datos.historial_seq += 1;
        datos.historial.push({ n: datos.historial_seq, cuando: ctx.ahora(), origen: e.origen || ctx.origen || 'manual',
            objeto: e.objeto, clave: e.clave || '', dispositivo_id: e.dispositivo_id || null, campo: e.campo,
            antes: e.antes === undefined ? null : e.antes, despues: e.despues === undefined ? null : e.despues,
            usuario: ctx.usuario || null });
    }
    if (datos.historial.length > MAX_HISTORIAL) datos.historial.splice(0, datos.historial.length - MAX_HISTORIAL);
}
const _cambioDispositivo = (c) => ({ objeto: 'dispositivo', dispositivo_id: c.dispositivo_id, campo: c.campo,
    antes: c.antes, despues: c.despues });

function _plano(d) {
    if (!d) return new Map();
    const p = new Map(CAMPOS_DISPOSITIVO.map(c => [c, d[c] === null || d[c] === undefined ? null : String(d[c])]));
    p.set('instalacion', d.instalacion ? 'sí' : null);
    if (d.instalacion) {
        for (const c of CAMPOS_INSTALACION) {
            const v = c === 'asignaciones' ? textoAsignaciones(d.instalacion[c]) : d.instalacion[c];
            p.set(`instalacion.${c}`, v === null || v === undefined || v === '' ? null : String(v));
        }
    }
    return p;
}

/** Campos que cambian de `actual` (null = alta) a `nuevo`. Un alta es UN cambio: campo "alta". */
function diferencias(actual, nuevo) {
    if (!actual) {
        return [{ dispositivo_id: nuevo.id, campo: 'alta', antes: null,
            despues: [nuevo.tipo, nuevo.marca, nuevo.modelo].join(' ').trim() }];
    }
    const a = _plano(actual), b = _plano(nuevo);
    const campos = [...b.keys(), ...[...a.keys()].filter(k => !b.has(k))];
    const valor = (m, c) => (m.has(c) ? m.get(c) : null);
    return campos.filter(c => valor(a, c) !== valor(b, c))
        .map(c => ({ dispositivo_id: nuevo.id, campo: c, antes: valor(a, c), despues: valor(b, c) }));
}

function etiquetaDispositivo(d) {
    const nombre = d.instalacion && d.instalacion.descripcion ? d.instalacion.descripcion : '';
    return nombre || [d.tipo, d.marca, d.modelo].filter(Boolean).join(' ') || d.id;
}

function resumenDispositivo(d) {
    const partes = [[d.tipo, d.marca, d.modelo].filter(Boolean).join(' ')];
    for (const [etiqueta, valor] of [['serie', d.serie], ['MAC', d.mac], ['patrimonio', d.patrimonio]]) {
        if (valor) partes.push(`${etiqueta} ${valor}`);
    }
    if (d.instalacion) partes.push([d.instalacion.descripcion, d.instalacion.edificio].filter(Boolean).join(' ') || 'instalado');
    return textoAcotado(partes.join(' · '), 500);
}

const _accionHistorial = (e) => {
    if (e.objeto === 'dispositivo') return e.campo === 'alta' ? 'agregar' : e.campo === 'eliminado' ? 'borrar' : 'modificar';
    if (e.campo === 'alta' || e.campo.endsWith('.alta')) return 'agregar';
    if (e.campo === 'baja' || e.campo.endsWith('.baja')) return 'borrar';
    return 'modificar';
};

/** GET /api/stock/dispositivos/{id}/historial */
function historialDispositivo(datos, id) {
    if (!datos.dispositivos.some(d => d.id === id)) throw errNoEncontrado();
    const entradas = datos.historial.filter(e => e.objeto === 'dispositivo' && e.dispositivo_id === id)
        .sort((a, b) => b.n - a.n).slice(0, MAX_HISTORIAL_DISPOSITIVO)
        .map(e => ({ cuando: e.cuando, origen: e.origen, campo: e.campo, antes: e.antes, despues: e.despues,
            usuario: e.usuario }));
    return { dispositivo_id: id, entradas };
}

/** GET /api/stock/historial (Historial): del más nuevo al más viejo, con filtro por acción y texto (literal, sin
 *  distinguir mayúsculas), `limite` por página. */
function historialReciente(datos, { accion = null, texto = null, offset = 0, limite = 30 } = {}) {
    if (accion !== null && !ACCIONES_HISTORIAL.includes(accion)) throw errValidacion('acción no válida');
    const lim = Math.max(1, Math.min(MAX_HISTORIAL_PAGINA, limite));
    const desde = Math.max(0, enteroAcotado(offset, 0, 100000) || 0);
    const buscado = textoAcotado(texto || '', MAX_TEXTO_BUSQUEDA).toLowerCase();
    const porId = new Map(datos.dispositivos.map(d => [d.id, d]));
    const borrado = new Map();
    for (const e of datos.historial) {
        if (e.objeto === 'dispositivo' && e.campo === 'eliminado') borrado.set(e.dispositivo_id, e.antes || '');
    }
    const filas = [];
    for (const e of datos.historial) {
        const acc = _accionHistorial(e);
        if (accion && acc !== accion) continue;
        let equipo = null, eliminado = false, buscable;
        if (e.objeto === 'dispositivo') {
            const d = porId.get(e.dispositivo_id);
            eliminado = !d;
            equipo = d ? resumenDispositivo(d) : (borrado.get(e.dispositivo_id) || null);
            const i = d && d.instalacion;
            buscable = [e.usuario, e.origen, e.campo, e.antes, e.despues, d && d.tipo, d && d.marca, d && d.modelo,
                d && d.serie, d && d.mac, d && d.patrimonio, i && i.descripcion, i && i.ip, i && i.edificio, i && i.piso,
                borrado.get(e.dispositivo_id)];
        } else {
            buscable = [e.usuario, e.origen, e.objeto, e.clave, e.campo, e.antes, e.despues];
        }
        if (buscado && !buscable.map(x => x || '').join(' ').toLowerCase().includes(buscado)) continue;
        filas.push({ e, acc, equipo, eliminado });
    }
    filas.sort((x, y) => compararTuplas([y.e.cuando, y.e.objeto, y.e.n], [x.e.cuando, x.e.objeto, x.e.n]));
    const pagina = filas.slice(desde, desde + lim);
    return {
        cambios: pagina.map(({ e, acc, equipo, eliminado }) => ({
            cuando: e.cuando, origen: e.origen, accion: acc, objeto: e.objeto, clave: e.clave || '', campo: e.campo,
            antes: e.antes, despues: e.despues, usuario: e.usuario, dispositivo_id: e.dispositivo_id,
            equipo: equipo || null, dispositivo_borrado: e.objeto === 'dispositivo' && eliminado })),
        siguiente_offset: filas.length > desde + lim ? desde + pagina.length : null
    };
}

// ---------------------------------------------------------------------------------------------- dispositivos
/** Datos de un formulario -> dispositivo normalizado; todos los problemas juntos en un ErrorDatos de validación.
 *  `pisos` = la lista de pisos (null = no controlarlo). */
function validarDispositivo(entrada, { id, datos, pisos = null }) {
    const e = entrada && typeof entrada === 'object' ? entrada : {};
    const errores = [];
    const tipo = _t(e.tipo, 'tipo');
    if (!datos.catalogo.tipos.some(t => t.clave === tipo)) errores.push('tipo: no está en el catálogo');
    const condicion = _t(e.condicion, 'tipo') || 'operativo';
    if (!CONDICIONES_STOCK.includes(condicion)) errores.push('condición: no válida');
    const macTxt = _t(e.mac, 'mac');
    const mac = macTxt ? macNormalizada(macTxt) : null;
    if (macTxt && mac === null) errores.push('MAC: formato no válido (aa:bb:cc:dd:ee:ff)');
    let canales = null;
    if (e.canales !== null && e.canales !== undefined) {
        canales = enteroAcotado(e.canales, 1, CANALES_MAX);
        if (canales === null) errores.push(`canales: entre 1 y ${CANALES_MAX}`);
    }
    let instalacion = null;
    const bruta = e.instalacion;
    if (bruta !== null && bruta !== undefined) {
        if (typeof bruta !== 'object' || Array.isArray(bruta)) throw errValidacion('instalación: formato no válido');
        const ipTxt = _t(bruta.ip, 'ip');
        const ip = ipTxt ? ipLiteralValida(ipTxt) : null;
        if (ipTxt && ip === null) errores.push('IP: no es una dirección IP');
        const edificio = _t(bruta.edificio, 'edificio');
        if (edificio && !datos.edificios.includes(edificio)) {
            errores.push('edificio: no está en el catálogo (agregalo primero)');
        }
        const piso = normalizarPiso(bruta.piso);
        if (piso && pisos !== null && !pisos.has(piso)) {
            errores.push(`piso: «${piso}» no está en la lista de pisos (agregalo con «Otro piso…» o en ⚙ > Edificios y pisos)`);
        }
        const puerto = _t(bruta.puerto, 'puerto');
        if (puerto && !RE_PUERTO.test(puerto)) errores.push('puerto: formato no válido (p. ej. 3/0/21 o Fa0/1)');
        const asignaciones = _validarAsignaciones(bruta, { id, tipo, datos, errores });
        instalacion = { descripcion: _t(bruta.descripcion, 'descripcion'), ip, edificio, piso, rack: _t(bruta.rack, 'rack'),
            puerto, comentario: _t(bruta.comentario, 'comentario'), asignaciones };
    }
    if (errores.length) throw errValidacion(errores.join('; '));
    return {
        id, tipo, condicion, marca: normalizarMarca(e.marca), modelo: _t(e.modelo, 'modelo'),
        serie: _opcional(e.serie, 'serie', NULOS_SERIE), mac,
        patrimonio: _opcional(e.patrimonio, 'patrimonio', NULOS_PATRIMONIO), firmware: _opcional(e.firmware, 'firmware'),
        canales, comentario: _t(e.comentario, 'comentario'), instalacion
    };
}

/** Las asignaciones de una instalación (`asignaciones: [{grabador, canal}]`, o el par suelto `grabador`+`canal` de antes):
 *  cada una con grabador Y canal; el grabador es un NVR/DVR instalado (no él mismo) y el canal entra en su capacidad (sin
 *  capacidad cargada, hasta CANALES_MAX); un mismo grabador no puede estar dos veces. Que el canal esté libre lo ve
 *  `_exigirUnicos`. */
function _validarAsignaciones(bruta, { id, tipo, datos, errores }) {
    const vacio = (v) => v === null || v === undefined || v === '';
    let crudas;
    if (Array.isArray(bruta.asignaciones)) crudas = bruta.asignaciones;
    else if (bruta.asignaciones !== undefined && bruta.asignaciones !== null) { errores.push('asignaciones: formato no válido'); crudas = []; }
    else crudas = vacio(bruta.grabador) && vacio(bruta.canal) ? [] : [{ grabador: bruta.grabador, canal: bruta.canal }];
    if (crudas.length > MAX_ASIGNACIONES) { errores.push(`asignaciones: como máximo ${MAX_ASIGNACIONES}`); return []; }
    const lista = [], usados = new Set();
    for (const c of crudas) {
        const x = c && typeof c === 'object' ? c : {};
        const grabador = vacio(x.grabador) ? null : idValido(x.grabador);
        const canal = vacio(x.canal) ? null : enteroAcotado(x.canal, 1, CANALES_MAX);
        if (!vacio(x.grabador) && grabador === null) errores.push('grabador: no válido');
        if (!vacio(x.canal) && canal === null) errores.push(`canal: entre 1 y ${CANALES_MAX}`);
        if (grabador === null && canal === null) continue;
        if (grabador === null || canal === null) { errores.push('grabador y canal: van los dos juntos (o ninguno)'); continue; }
        if (TIPOS_GRABADOR.includes(tipo)) { errores.push('un grabador no va en el canal de otro grabador'); continue; }
        const g = datos.dispositivos.find(d => d.id === grabador);
        if (!g || g.id === id || !TIPOS_GRABADOR.includes(g.tipo) || !g.instalacion) {
            errores.push('grabador: tiene que ser un NVR/DVR instalado');
            continue;
        }
        if (g.canales && canal > g.canales) errores.push(`canal: «${etiquetaDispositivo(g)}» tiene ${g.canales} canales`);
        if (usados.has(grabador)) { errores.push(`«${etiquetaDispositivo(g)}» está dos veces: un equipo ocupa un solo canal de cada grabador`); continue; }
        usados.add(grabador);
        lista.push({ grabador, canal });
    }
    return lista;
}

/** Los dispositivos asignados a los canales del grabador `id`. */
function asignadosA(datos, id) {
    return datos.dispositivos.filter(x => asignacionesDe(x.instalacion).some(a => a.grabador === id));
}

/** Un grabador con cámaras en sus canales no sale de producción, no deja de ser grabador ni se achica por debajo del
 *  canal más alto ocupado (las cámaras quedarían apuntando a la nada). */
function _exigirGrabadorConsistente(datos, actual, nuevo) {
    if (!actual) return;
    const asignados = asignadosA(datos, actual.id);
    if (!asignados.length) return;
    const cuantas = asignados.length === 1 ? '1 dispositivo asignado' : `${asignados.length} dispositivos asignados`;
    if (!nuevo || !nuevo.instalacion || !TIPOS_GRABADOR.includes(nuevo.tipo)) {
        throw errRegla(`Tiene ${cuantas} a sus canales: pasalos a otro grabador o sacalos de producción antes.`);
    }
    const maximo = Math.max(...asignados.map(x => asignacionesDe(x.instalacion).find(a => a.grabador === actual.id).canal));
    if (nuevo.canales && nuevo.canales < maximo) {
        throw errRegla(`El canal ${maximo} está ocupado: no se puede bajar a ${nuevo.canales} canales.`);
    }
}

/** En producción (instalado) SOLO un equipo operativo: si estaba instalado y pasa a otra condición, sale de producción
 *  (copia sin instalación); en un alta, o si no estaba instalado, es un error. */
function aplicarReglasProduccion(actual, nuevo) {
    if (!nuevo.instalacion || nuevo.condicion === CONDICION_PRODUCCION) return nuevo;
    if (actual && actual.instalacion) return { ...nuevo, instalacion: null };
    throw errValidacion(`un equipo en producción tiene que estar operativo (no '${nuevo.condicion}'): cambiá la `
        + 'condición o destildá «Instalado»');
}

/** [campo, id del otro] de serie/MAC/patrimonio que ya tiene OTRO dispositivo (serie y patrimonio sin distinguir
 *  mayúsculas). `ademas`: otros dispositivos que también cuentan (las filas anteriores de un lote). */
function duplicados(datos, d, ademas = []) {
    const encontrados = [];
    for (const campo of ['serie', 'mac', 'patrimonio']) {
        const valor = d[campo];
        if (valor === null || valor === undefined) continue;
        const igual = campo === 'mac' ? (x) => x === valor : (x) => !!x && x.toLowerCase() === valor.toLowerCase();
        const otro = [...datos.dispositivos, ...ademas].find(x => x.id !== d.id && igual(x[campo]));
        if (otro) encontrados.push([campo, otro.id]);
    }
    return encontrados;
}
function _exigirUnicos(datos, d) {
    const r = duplicados(datos, d);
    const i = d.instalacion;
    for (const a of asignacionesDe(i)) {
        const otro = datos.dispositivos.find(x => x.id !== d.id && asignacionesDe(x.instalacion)
            .some(y => y.grabador === a.grabador && y.canal === a.canal));
        const g = datos.dispositivos.find(x => x.id === a.grabador);
        if (otro) {
            r.push([`canal ${a.canal} de «${g ? etiquetaDispositivo(g) : a.grabador}»`, `«${etiquetaDispositivo(otro)}»`]);
        }
    }
    if (r.length) {
        throw errDuplicado(r.map(([campo, otro]) => (campo.startsWith('canal')
            ? `${campo}: ya lo ocupa ${otro}` : `${campo}: ya la tiene el dispositivo ${otro}`)).join('; '));
    }
}

const _pisosDe = (datos, extra = null) => new Set([...datos.pisos, ...(extra ? [extra] : [])]);

function _guardado(d, actual, ctx) {
    const ahora = ctx.ahora();
    const inst = d.instalacion ? { ...d.instalacion,
        actualizado: actual && actual.instalacion && !_instalacionCambio(actual.instalacion, d.instalacion)
            ? actual.instalacion.actualizado : ahora } : null;
    return { ...d, instalacion: inst, creado: actual ? actual.creado : ahora, actualizado: ahora,
        version: actual ? actual.version + 1 : 1 };
}
const _instalacionCambio = (a, b) => CAMPOS_INSTALACION.some(c => (c === 'asignaciones'
    ? textoAsignaciones(a[c]) !== textoAsignaciones(b[c]) : (a[c] ?? null) !== (b[c] ?? null)));

/** Alta manual. Devuelve el dispositivo como la API. */
function crearDispositivo(datos, entrada, ctx) {
    let d = validarDispositivo(entrada, { id: ctx.nuevoId(), datos, pisos: _pisosDe(datos) });
    d = aplicarReglasProduccion(null, d);
    _exigirUnicos(datos, d);
    const g = _guardado(d, null, ctx);
    datos.dispositivos.push(g);
    _registrar(datos, ctx, diferencias(null, g).map(_cambioDispositivo));
    return dispositivoApi(g, paginasModelo(datos));
}

/** Alta en lote (una compra en el depósito): todo o nada; ninguna MAC/serie/patrimonio repetida dentro del lote. */
function crearLote(datos, comunes, filas, ctx) {
    if (!Array.isArray(filas) || !filas.length) throw errValidacion('el lote no tiene filas');
    if (filas.length > MAX_ALTAS_LOTE) throw errValidacion(`el lote tiene ${filas.length} filas: el máximo es ${MAX_ALTAS_LOTE}`);
    const c = comunes && typeof comunes === 'object' ? comunes : {};
    const pisos = _pisosDe(datos);
    const nuevos = [], problemas = [];
    const vistos = new Map();
    filas.forEach((fila, i) => {
        const n = i + 1;
        const f = fila && typeof fila === 'object' ? fila : {};
        const entrada = { tipo: c.tipo, condicion: c.condicion, marca: c.marca, modelo: c.modelo, canales: c.canales,
            comentario: c.comentario, mac: f.mac || null, serie: f.serie || null, patrimonio: f.patrimonio || null,
            instalacion: null };
        try {
            const d = aplicarReglasProduccion(null, validarDispositivo(entrada, { id: ctx.nuevoId(), datos, pisos }));
            _exigirUnicos(datos, d);
            for (const campo of ['mac', 'serie', 'patrimonio']) {
                const valor = d[campo];
                if (valor === null) continue;
                const clave = `${campo}\u0000${valor.toLowerCase()}`;
                if (vistos.has(clave)) throw errDuplicado(`${campo} ${valor}: ya está en la fila ${vistos.get(clave)} del lote`);
                vistos.set(clave, n);
            }
            nuevos.push(d);
        } catch (e) {
            if (!(e instanceof ErrorDatos)) throw e;
            problemas.push(`fila ${n}: ${e.message}`);
        }
    });
    if (problemas.length) {
        const resto = problemas.length - MAX_PROBLEMAS_LOTE;
        throw errValidacion(problemas.slice(0, MAX_PROBLEMAS_LOTE).join('; ') + (resto > 0 ? `; y ${resto} más` : '')
            + '. No se guardó ninguna.');
    }
    const guardados = nuevos.map(d => _guardado(d, null, ctx));
    datos.dispositivos.push(...guardados);
    _registrar(datos, ctx, guardados.flatMap(g => diferencias(null, g)).map(_cambioDispositivo));
    return { creados: guardados.length, ids: guardados.map(g => g.id) };
}

function _buscar(datos, id) {
    const i = datos.dispositivos.findIndex(d => d.id === id);
    return [i, i >= 0 ? datos.dispositivos[i] : null];
}

/** Modificación de un dispositivo y su instalación (null = retirarlo), con la `version` leída (409 si cambió). */
function modificarDispositivo(datos, id, entrada, version, ctx) {
    const [i, actual] = _buscar(datos, id);
    if (!actual) throw errNoEncontrado();
    if (actual.version !== version) throw errConflicto();
    let d = validarDispositivo(entrada, { id, datos,
        pisos: _pisosDe(datos, actual.instalacion ? actual.instalacion.piso : null) });
    d = aplicarReglasProduccion(actual, d);
    const cambios = diferencias(actual, d);
    if (!cambios.length) return dispositivoApi(actual, paginasModelo(datos));
    _exigirGrabadorConsistente(datos, actual, d);
    _exigirUnicos(datos, d);
    const g = _guardado(d, actual, ctx);
    datos.dispositivos[i] = g;
    _registrar(datos, ctx, cambios.map(_cambioDispositivo));
    return dispositivoApi(g, paginasModelo(datos));
}

function _formulario(d) {
    const r = {};
    for (const c of CAMPOS_DISPOSITIVO) r[c] = d[c];
    r.instalacion = d.instalacion ? Object.fromEntries(CAMPOS_INSTALACION.map(c => [c, c === 'asignaciones'
        ? asignacionesDe(d.instalacion).map(a => ({ ...a })) : d.instalacion[c]])) : null;
    return r;
}

/** Cambio en lote de lo seleccionado: cada uno con las mismas reglas que la edición individual; el que no puede se
 *  omite con su motivo. `aplicar=false` solo simula. */
function modificarLote(datos, pedidos, cambios, aplicar, ctx) {
    const lista = Array.isArray(pedidos) ? pedidos : [];
    if (!lista.length) throw errValidacion('elegí al menos un dispositivo');
    if (lista.length > MAX_LOTE) throw errValidacion(`como máximo ${MAX_LOTE} dispositivos por vez`);
    if (new Set(lista.map(p => p && p.id)).size !== lista.length) throw errValidacion('hay dispositivos repetidos');
    const nuevos = new Map();
    for (const [k, v] of Object.entries(cambios && typeof cambios === 'object' ? cambios : {})) {
        if (v !== null && v !== undefined) nuevos.set(k, _t(v, 'etiqueta'));
    }
    if (!nuevos.size || [...nuevos.keys()].some(k => !CAMPOS_LOTE.includes(k)) || [...nuevos.values()].some(v => !v)) {
        throw errValidacion(`elegí qué cambiar: ${CAMPOS_LOTE.join(', ')}`);
    }
    const porId = new Map(datos.dispositivos.map(d => [d.id, d]));
    const nombres = new Map(lista.filter(p => porId.has(p.id)).map(p => [p.id, etiquetaDispositivo(porId.get(p.id))]));
    const actualizados = [], omitidos = [], escrituras = [];
    const omitir = (id, motivo) => omitidos.push({ dispositivo_id: id, descripcion: nombres.get(id) || id, motivo });
    for (const { id, version } of lista) {
        const actual = porId.get(id);
        if (!actual) { omitir(id, 'no existe'); continue; }
        if (actual.version !== version) { omitir(id, 'cambió desde que lo seleccionaste (¿lo editó otra persona?)'); continue; }
        const form = _formulario(actual);
        for (const campo of ['tipo', 'condicion']) if (nuevos.has(campo)) form[campo] = nuevos.get(campo);
        const enPuesto = ['edificio', 'piso', 'rack'].filter(c => nuevos.has(c));
        if (enPuesto.length) {
            if (!form.instalacion) { omitir(id, 'no está instalado (depósito): sin edificio, piso ni rack'); continue; }
            for (const c of enPuesto) form.instalacion[c] = nuevos.get(c);
        }
        try {
            let d = validarDispositivo(form, { id, datos,
                pisos: _pisosDe(datos, actual.instalacion ? actual.instalacion.piso : null) });
            d = aplicarReglasProduccion(actual, d);
            const diff = diferencias(actual, d);
            if (!diff.length) { omitir(id, 'ya tiene esos valores'); continue; }
            _exigirGrabadorConsistente(datos, actual, d);
            _exigirUnicos(datos, d);
            escrituras.push([d, actual, diff]);
            actualizados.push({ dispositivo_id: id, descripcion: nombres.get(id) || id, cambios: diff.length,
                sale_de_produccion: !!actual.instalacion && !d.instalacion });
        } catch (e) {
            if (!(e instanceof ErrorDatos)) throw e;
            omitir(id, e.message);
        }
    }
    if (aplicar) {
        for (const [d, actual, diff] of escrituras) {
            datos.dispositivos[datos.dispositivos.indexOf(actual)] = _guardado(d, actual, ctx);
            _registrar(datos, ctx, diff.map(_cambioDispositivo));
        }
    }
    return { aplicado: !!aplicar, actualizados, omitidos };
}

/** Borrado definitivo (cargas por error; un equipo que deja el parque va con la condición «baja»). El historial queda,
 *  con una entrada «eliminado», y la lápida para que el borrado se propague al sincronizar. */
function eliminarDispositivo(datos, id, version, ctx) {
    const [i, actual] = _buscar(datos, id);
    if (!actual) throw errNoEncontrado();
    if (actual.version !== version) throw errConflicto();
    _exigirGrabadorConsistente(datos, actual, null);
    datos.dispositivos.splice(i, 1);
    datos.eliminados.dispositivos[id] = ctx.ahora();
    _registrar(datos, ctx, [{ objeto: 'dispositivo', dispositivo_id: id, campo: 'eliminado',
        antes: resumenDispositivo(actual), despues: null }]);
    return { status: 'success', message: `Dispositivo ${id} eliminado.` };
}

// ---------------------------------------------------------------------------------------------- grupos y tipos
function _etiquetaCatalogo(nombre) {
    const etiqueta = espacios(_t(nombre, 'etiqueta'));
    if (!etiqueta) throw errValidacion('nombre: está vacío');
    return etiqueta;
}
function _exigirEtiquetaLibre(usadas, etiqueta, propia, que) {
    for (const [clave, otra] of usadas) {
        if (clave !== propia && ordenTexto(otra) === ordenTexto(etiqueta)) throw errRegla(`Ya existe ${que} «${otra}».`);
    }
}
function _grupo(datos, clave, estado = 404) {
    const g = datos.catalogo.grupos.find(x => x.clave === clave);
    if (!g) throw errRegla('El grupo no existe.', estado);
    return g;
}
function _tipo(datos, clave) {
    const t = datos.catalogo.tipos.find(x => x.clave === clave);
    if (!t) throw errRegla('El subgrupo no existe.', 404);
    return t;
}
const _cantidadTipo = (datos, clave) => datos.dispositivos.filter(d => d.tipo === clave).length;
const _catalogo = (datos, ctx, cambios) => {
    _registrar(datos, ctx, cambios);
    return catalogoApi(datos);
};

function crearGrupo(datos, nombre, ctx) {
    const etiqueta = _etiquetaCatalogo(nombre);
    if (datos.catalogo.grupos.length >= MAX_GRUPOS) throw errRegla(`Ya hay ${MAX_GRUPOS} grupos: es el máximo.`);
    _exigirEtiquetaLibre(datos.catalogo.grupos.map(g => [g.clave, g.etiqueta]), etiqueta, null, 'un grupo');
    const clave = claveDesdeNombre(etiqueta, datos.catalogo.grupos.map(g => g.clave));
    datos.catalogo.grupos.push({ clave, etiqueta, sistema: false });
    return _catalogo(datos, ctx, [{ objeto: 'grupo', clave, campo: 'alta', antes: null, despues: etiqueta }]);
}

function renombrarGrupo(datos, clave, nombre, ctx) {
    const etiqueta = _etiquetaCatalogo(nombre);
    const g = _grupo(datos, clave);
    if (etiqueta === g.etiqueta) return catalogoApi(datos);
    _exigirEtiquetaLibre(datos.catalogo.grupos.map(x => [x.clave, x.etiqueta]), etiqueta, clave, 'un grupo');
    const antes = g.etiqueta;
    g.etiqueta = etiqueta;
    return _catalogo(datos, ctx, [{ objeto: 'grupo', clave, campo: 'etiqueta', antes, despues: etiqueta }]);
}

function borrarGrupo(datos, clave, ctx) {
    const g = _grupo(datos, clave);
    if (g.sistema) throw errRegla(`«${g.etiqueta}» es un grupo del sistema: se puede renombrar, no borrar.`);
    const tipos = datos.catalogo.tipos.filter(t => t.grupo === clave);
    const conEquipos = tipos.map(t => [t, _cantidadTipo(datos, t.clave)]).filter(([, n]) => n);
    if (conEquipos.length) {
        const detalle = conEquipos.map(([t, n]) => `«${t.etiqueta}» (${n})`).join(', ');
        throw errRegla(`«${g.etiqueta}» tiene dispositivos en ${conEquipos.length} subgrupo(s): ${detalle}. No se puede borrar.`);
    }
    datos.catalogo.tipos = datos.catalogo.tipos.filter(t => t.grupo !== clave);
    datos.catalogo.grupos = datos.catalogo.grupos.filter(x => x.clave !== clave);
    return _catalogo(datos, ctx, [
        ...tipos.map(t => ({ objeto: 'tipo', clave: t.clave, campo: 'baja', antes: t.etiqueta, despues: null })),
        { objeto: 'grupo', clave, campo: 'baja', antes: g.etiqueta, despues: null }]);
}

function crearTipo(datos, nombre, grupo, ctx) {
    const etiqueta = _etiquetaCatalogo(nombre);
    const destino = _grupo(datos, grupo, 422);
    if (datos.catalogo.tipos.length >= MAX_TIPOS) throw errRegla(`Ya hay ${MAX_TIPOS} subgrupos: es el máximo.`);
    _exigirEtiquetaLibre(datos.catalogo.tipos.map(t => [t.clave, t.etiqueta]), etiqueta, null, 'un subgrupo');
    const clave = claveDesdeNombre(etiqueta, datos.catalogo.tipos.map(t => t.clave));
    datos.catalogo.tipos.push({ clave, etiqueta, grupo: destino.clave, sistema: false });
    return _catalogo(datos, ctx, [{ objeto: 'tipo', clave, campo: 'alta', antes: null,
        despues: `${etiqueta} (${destino.clave})` }]);
}

/** Renombra y/o mueve de grupo: mover solo si no es de sistema y no tiene equipos (su comportamiento depende del
 *  grupo: un domo que pasara a Otros dejaría de contarse como cámara). */
function modificarTipo(datos, clave, nombre, grupo, ctx) {
    const etiqueta = _etiquetaCatalogo(nombre);
    const t = _tipo(datos, clave);
    const actual = gruposPorTipo(datos).get(clave);
    const destino = _grupo(datos, grupo, 422);
    const cambios = [];
    if (etiqueta !== t.etiqueta) {
        _exigirEtiquetaLibre(datos.catalogo.tipos.map(x => [x.clave, x.etiqueta]), etiqueta, clave, 'un subgrupo');
        cambios.push({ objeto: 'tipo', clave, campo: 'etiqueta', antes: t.etiqueta, despues: etiqueta });
    }
    if (destino.clave !== actual) {
        if (t.sistema) throw errRegla(`«${t.etiqueta}» es un subgrupo del sistema: no se puede mover de grupo.`);
        const n = _cantidadTipo(datos, clave);
        if (n) {
            throw errRegla(`«${t.etiqueta}» tiene ${n} dispositivo(s): para moverlo de grupo no tiene que tener equipos `
                + '(cambiales el tipo uno por uno).');
        }
        cambios.push({ objeto: 'tipo', clave, campo: 'grupo', antes: actual, despues: destino.clave });
    }
    if (cambios.length) {
        t.etiqueta = etiqueta;
        t.grupo = destino.clave;
    }
    return _catalogo(datos, ctx, cambios);
}

function borrarTipo(datos, clave, ctx) {
    const t = _tipo(datos, clave);
    if (t.sistema) throw errRegla(`«${t.etiqueta}» es un subgrupo del sistema: se puede renombrar, no borrar.`);
    const n = _cantidadTipo(datos, clave);
    if (n) throw errRegla(`«${t.etiqueta}» tiene ${n} dispositivo(s): no se puede borrar.`);
    datos.catalogo.tipos = datos.catalogo.tipos.filter(x => x.clave !== clave);
    return _catalogo(datos, ctx, [{ objeto: 'tipo', clave, campo: 'baja', antes: t.etiqueta, despues: null }]);
}

// ---------------------------------------------------------------------------------------------- edificios y pisos
function nombreUbicacion(objeto, valor) {
    const n = objeto === 'piso' ? normalizarPiso(valor) : espacios(_t(valor, 'edificio'));
    if (!n) throw errValidacion(`${objeto}: el nombre está vacío`);
    return n;
}
const _listaUbicacion = (datos, objeto) => (objeto === 'piso' ? datos.pisos : datos.edificios);
const _usosUbicacion = (datos, objeto, nombre) => datos.dispositivos
    .filter(d => d.instalacion && d.instalacion[objeto] === nombre).length;

/** GET /api/stock/ubicaciones: edificios y pisos con cuántas instalaciones usan cada uno. */
function ubicaciones(datos, guardado = null) {
    const lista = (objeto) => [..._listaUbicacion(datos, objeto)].sort(comparar)
        .map(nombre => ({ nombre, usos: _usosUbicacion(datos, objeto, nombre) }));
    return { edificios: lista('edificio'), pisos: lista('piso'), guardado };
}

function _agregarUbicacion(datos, objeto, nombre, ctx) {
    const lista = _listaUbicacion(datos, objeto);
    if (lista.length >= MAX_UBICACIONES) throw errRegla(`Ya hay ${MAX_UBICACIONES} en la lista: es el máximo.`);
    lista.push(nombre);
    _registrar(datos, ctx, [{ objeto: 'catalogo', clave: nombre, campo: `${objeto}.alta`, antes: null, despues: nombre }]);
}

/** Agrega, renombra (si el nuevo ya existe, se UNIFICAN) o borra (solo si nadie lo usa) un edificio o piso. */
function editarUbicacion(datos, { objeto, accion, nombre, nuevo }, ctx) {
    if (!OBJETOS_UBICACION.includes(objeto) || !ACCIONES_UBICACION.includes(accion)) {
        throw errValidacion('objeto o acción no válidos');
    }
    if (accion === 'renombrar' && !nuevo) throw errValidacion('falta el nombre nuevo.');
    const lista = _listaUbicacion(datos, objeto);
    const existente = (n) => (lista.includes(n) ? n
        : (lista.find(x => objeto === 'edificio' && x.toLowerCase() === n.toLowerCase()) || null));
    if (accion === 'agregar') {
        const n = nombreUbicacion(objeto, nombre);
        const guardado = existente(n);
        if (guardado === null) _agregarUbicacion(datos, objeto, n, ctx);
        return ubicaciones(datos, guardado || n);
    }
    const actual = _t(nombre, objeto);
    if (!lista.includes(actual)) throw errNoEncontrado(`El ${objeto} «${actual}» no existe.`);
    const usos = _usosUbicacion(datos, objeto, actual);
    if (accion === 'borrar') {
        if (usos) throw errRegla(`«${actual}» lo usan ${usos} instalaciones: renombralo o unificalo con otro antes de borrarlo`);
        lista.splice(lista.indexOf(actual), 1);
        _registrar(datos, ctx, [{ objeto: 'catalogo', clave: actual, campo: `${objeto}.baja`, antes: actual, despues: null }]);
        return ubicaciones(datos, null);
    }
    let destino = nombreUbicacion(objeto, nuevo);
    const otro = existente(destino);
    if (otro !== null && otro !== actual) destino = otro;
    if (destino !== actual) {
        const unifica = lista.includes(destino);
        const ahora = ctx.ahora();
        const movidos = [];
        datos.dispositivos = datos.dispositivos.map(d => {
            if (!d.instalacion || d.instalacion[objeto] !== actual) return d;
            movidos.push(d.id);
            return { ...d, version: d.version + 1, actualizado: ahora,
                instalacion: { ...d.instalacion, [objeto]: destino, actualizado: ahora } };
        });
        if (!unifica) lista.push(destino);
        lista.splice(lista.indexOf(actual), 1);
        _registrar(datos, ctx, [
            ...movidos.map(id => ({ objeto: 'dispositivo', dispositivo_id: id, campo: `instalacion.${objeto}`,
                antes: actual, despues: destino })),
            { objeto: 'catalogo', clave: destino, campo: `${objeto}.${unifica ? 'unificar' : 'renombrar'}`,
                antes: actual, despues: destino }]);
    }
    return ubicaciones(datos, destino);
}

/** POST /api/stock/edificios: agrega un edificio (sin duplicar por mayúsculas) y devuelve la lista. */
function agregarEdificio(datos, nombre, ctx) {
    const n = espacios(_t(nombre, 'edificio'));
    if (!n) throw errValidacion('edificio: el nombre está vacío');
    if (!datos.edificios.some(e => e.toLowerCase() === n.toLowerCase())) _agregarUbicacion(datos, 'edificio', n, ctx);
    return { edificios: [...datos.edificios].sort(comparar) };
}

// ---------------------------------------------------------------------------------------------- páginas de los modelos
const _masUsada = (cuentas) => {
    let mejor = '', n = -1;
    for (const [k, v] of cuentas) if (v > n || (v === n && k > mejor)) { mejor = k; n = v; }
    return mejor;
};

/** Modelos únicos del stock (sin distinguir mayúsculas; la marca no cuenta) con sus usos y su página oficial. */
function modelos(datos) {
    const paginas = paginasModelo(datos);
    const escrituras = new Map(), marcas = new Map(), usos = new Map();
    const contar = (mapa, clave, valor) => {
        if (!mapa.has(clave)) mapa.set(clave, new Map());
        const m = mapa.get(clave);
        m.set(valor, (m.get(valor) || 0) + 1);
    };
    for (const d of datos.dispositivos) {
        const modelo = espacios(textoAcotado(d.modelo, LARGOS_STOCK.modelo));
        if (!modelo) continue;
        const clave = claveModelo(modelo);
        usos.set(clave, (usos.get(clave) || 0) + 1);
        contar(escrituras, clave, modelo);
        if (d.marca) contar(marcas, clave, d.marca);
    }
    const lista = [...new Set([...usos.keys(), ...paginas.keys()])].map(clave => {
        const p = paginas.get(clave);
        return {
            marca: _masUsada(marcas.get(clave) || new Map()) || (p ? p.marca : ''),
            modelo: escrituras.has(clave) ? _masUsada(escrituras.get(clave)) : (p ? p.modelo : ''),
            usos: usos.get(clave) || 0, pagina: p ? p.pagina : null
        };
    });
    lista.sort((a, b) => compararTuplas([a.marca.toLowerCase(), a.modelo.toLowerCase(), a.marca, a.modelo],
        [b.marca.toLowerCase(), b.modelo.toLowerCase(), b.marca, b.modelo]));
    return { modelos: lista };
}

/** PUT /api/stock/modelos: fija (o con `pagina` vacía, quita) la página oficial de un modelo que está en el stock. */
function fijarPaginaModelo(datos, modelo, pagina, ctx) {
    const modeloTxt = espacios(_t(modelo, 'modelo'));
    const texto = _t(pagina, 'pagina_modelo');
    const url = texto ? urlWeb(texto) : null;
    if (texto && url === null) throw errValidacion('página del modelo: tiene que ser una dirección http:// o https:// completa');
    const clave = claveModelo(modeloTxt);
    const existente = modelos(datos).modelos.find(m => claveModelo(m.modelo) === clave);
    if (!existente) throw errNoEncontrado(`El modelo «${modeloTxt}» no está en el stock.`);
    const i = datos.modelos_pagina.findIndex(p => claveModelo(p.modelo) === clave);
    const antes = i >= 0 ? datos.modelos_pagina[i].pagina : null;
    if (antes === url) return modelos(datos);
    if (url === null) datos.modelos_pagina.splice(i, 1);
    else if (i >= 0) datos.modelos_pagina[i] = { marca: existente.marca, modelo: existente.modelo, pagina: url };
    else {
        if (datos.modelos_pagina.length >= MAX_MODELOS_PAGINA) throw errRegla('Hay demasiadas páginas de modelos.');
        datos.modelos_pagina.push({ marca: existente.marca, modelo: existente.modelo, pagina: url });
    }
    _registrar(datos, ctx, [{ objeto: 'modelo', clave: `${existente.marca} ${existente.modelo}`.trim(),
        campo: url === null ? 'pagina.baja' : antes === null ? 'pagina.alta' : 'pagina', antes, despues: url }]);
    return modelos(datos);
}

// ---------------------------------------------------------------------------------------------- vista de producción
/** /api/v2/datos (lo que el dashboard, Producción y la búsqueda leen) armado desde el stock: los grabadores instalados
 *  y lo asignado a sus canales (como las cámaras que informaba el monitor). Sin monitoreo: nada está «caído». */
function datosProduccion(datos) {
    const paginas = paginasModelo(datos);
    const stockDe = (d) => {
        const i = d.instalacion || {};
        return { id: d.id, vinculo: 'ip', condicion: d.condicion, tipo: d.tipo, descripcion: i.descripcion || '',
            edificio: i.edificio || '', piso: i.piso || '', rack: i.rack || '', puerto: i.puerto || '' };
    };
    const nvrs = datos.dispositivos
        .filter(d => d.instalacion && TIPOS_GRABADOR.includes(d.tipo))
        .sort((a, b) => comparar(etiquetaDispositivo(a), etiquetaDispositivo(b)))
        .map(d => ({ ip: d.instalacion.ip || '', nvr_name: etiquetaDispositivo(d), modelo: d.modelo || 'N/A',
            firmware: d.firmware || 'N/A', nro_serie: d.serie || 'N/A', mac_address: d.mac || 'N/A',
            protocolo_conexion: 'N/A', total_camaras: d.canales || 0, is_offline: false, motivo: null,
            stock: stockDe(d), pagina_modelo: (paginas.get(claveModelo(d.modelo)) || {}).pagina || null }));
    const porId = new Map(datos.dispositivos.map(d => [d.id, d]));
    const camaras = datos.dispositivos
        .flatMap(d => asignacionesDe(d.instalacion).filter(a => porId.has(a.grabador)).map(a => [d, a]))
        .map(([d, a]) => {
            const g = porId.get(a.grabador);
            return { ip_address: d.instalacion.ip || 'N/A', camera_name: etiquetaDispositivo(d),
                nvr_ip: (g.instalacion && g.instalacion.ip) || '', nvr_name: etiquetaDispositivo(g),
                channel_id: a.canal, modelo: d.modelo || '-', firmware: d.firmware || '-',
                mac_address: d.mac || '-', is_offline: false, fallback_ping: false, sin_relevar: false,
                sin_relevar_motivo: '', sin_senal: false, motivo: null, detalle: '', stock: stockDe(d) };
        })
        .sort((a, b) => compararTuplas([a.nvr_name, a.channel_id], [b.nvr_name, b.channel_id]));
    return { nvrs, camaras, equipos_red: [], online_file_missing: false, estado_timestamp: null,
        estado_stale: false, monitor_process_alive: true, monitor_exit_code: null, intervalo_segundos: 3600,
        resumen: {}, host: { estado: 'ok', congelado: false, motivo: '', confianza: '', desde: null, escalado: false,
            zonas_caidas: [] } };
}

// ---------------------------------------------------------------------------------------------- saneo de lo que entra
const _fecha = (v, defecto) => (typeof v === 'string' && RE_FECHA_Z.test(v) ? v : defecto);

/** Datos que vienen de afuera (localStorage, un archivo, el Gist): se revisa TODO. Devuelve {datos, avisos}: lo que
 *  no pasa se descarta o se corrige, y se cuenta en `avisos` (nunca se lanza: una fila rota no tumba el resto). */
function sanearDatos(bruto, ahora) {
    const r = datosVacios();
    const avisos = [];
    const avisar = (m) => { if (avisos.length < 50) avisos.push(m); };
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { datos: r, avisos: ['sin datos'] };
    if (bruto.formato !== FORMATO_DATOS) return { datos: r, avisos: ['no es un archivo de SGC-2'] };

    // catálogo: los grupos y tipos de sistema siempre están (y solo ellos son de sistema)
    const cat = bruto.catalogo && typeof bruto.catalogo === 'object' ? bruto.catalogo : {};
    const grupos = new Map(GRUPOS_BASE.map(([clave, etiqueta]) => [clave, { clave, etiqueta, sistema: true }]));
    for (const g of Array.isArray(cat.grupos) ? cat.grupos : []) {
        const clave = g && claveValida(g.clave);
        const etiqueta = g && espacios(_t(g.etiqueta, 'etiqueta'));
        if (!clave || !etiqueta) continue;
        if (grupos.has(clave)) grupos.get(clave).etiqueta = etiqueta;
        else if (grupos.size < MAX_GRUPOS) grupos.set(clave, { clave, etiqueta, sistema: false });
    }
    const tipos = new Map(CATALOGO_BASE.map(([clave, etiqueta, grupo, sistema]) => [clave,
        { clave, etiqueta, grupo, sistema: !!sistema }]));
    for (const t of Array.isArray(cat.tipos) ? cat.tipos : []) {
        const clave = t && claveValida(t.clave);
        const etiqueta = t && espacios(_t(t.etiqueta, 'etiqueta'));
        if (!clave || !etiqueta) continue;
        const grupo = grupos.has(t.grupo) ? t.grupo : GRUPO_POR_DEFECTO;
        if (tipos.has(clave)) {
            const base = tipos.get(clave);
            base.etiqueta = etiqueta;
            if (!base.sistema) base.grupo = grupo;
        } else if (tipos.size < MAX_TIPOS) {
            tipos.set(clave, { clave, etiqueta, grupo, sistema: false });
        }
    }
    r.catalogo = { grupos: [...grupos.values()], tipos: [...tipos.values()] };

    const lista = (v, objeto) => {
        const vistos = new Set();
        for (const x of Array.isArray(v) ? v : []) {
            const n = objeto === 'piso' ? normalizarPiso(x) : espacios(_t(x, 'edificio'));
            if (n && !vistos.has(n) && vistos.size < MAX_UBICACIONES) vistos.add(n);
        }
        return vistos;
    };
    const edificios = lista(bruto.edificios, 'edificio');
    const pisos = lista(bruto.pisos, 'piso');

    const ids = new Set(), unicos = new Map();
    let descartados = 0, repetidos = 0, noOperativos = 0;
    for (const d of Array.isArray(bruto.dispositivos) ? bruto.dispositivos : []) {
        if (r.dispositivos.length >= MAX_DISPOSITIVOS) { descartados++; continue; }
        const id = d && typeof d === 'object' ? idValido(d.id) : null;
        if (!id || ids.has(id)) { descartados++; continue; }
        ids.add(id);
        const tipo = tipos.has(d.tipo) ? d.tipo : 'otro';
        const condicion = CONDICIONES_STOCK.includes(d.condicion) ? d.condicion : 'revisar';
        const x = {
            id, tipo, condicion, marca: normalizarMarca(d.marca), modelo: _t(d.modelo, 'modelo'),
            serie: _opcional(d.serie, 'serie', NULOS_SERIE), mac: macNormalizada(d.mac),
            patrimonio: _opcional(d.patrimonio, 'patrimonio', NULOS_PATRIMONIO), firmware: _opcional(d.firmware, 'firmware'),
            canales: d.canales === null || d.canales === undefined ? null : enteroAcotado(d.canales, 1, CANALES_MAX),
            comentario: _t(d.comentario, 'comentario'), instalacion: null,
            creado: _fecha(d.creado, ahora), actualizado: _fecha(d.actualizado, ahora),
            version: enteroAcotado(d.version, 1, 1e12) || 1
        };
        for (const campo of ['serie', 'mac', 'patrimonio']) {
            if (x[campo] === null) continue;
            const clave = `${campo}\u0000${campo === 'mac' ? x[campo] : x[campo].toLowerCase()}`;
            if (unicos.has(clave)) { x[campo] = null; repetidos++; } else unicos.set(clave, id);
        }
        const i = d.instalacion;
        if (i && typeof i === 'object' && !Array.isArray(i)) {
            const edificio = espacios(_t(i.edificio, 'edificio'));
            const piso = normalizarPiso(i.piso);
            if (edificio) edificios.add(edificio);
            if (piso) pisos.add(piso);
            const puerto = _t(i.puerto, 'puerto');
            x.instalacion = { descripcion: _t(i.descripcion, 'descripcion'), ip: ipLiteralValida(i.ip), edificio, piso,
                rack: _t(i.rack, 'rack'), puerto: RE_PUERTO.test(puerto) ? puerto : '',
                comentario: _t(i.comentario, 'comentario'), actualizado: _fecha(i.actualizado, x.actualizado),
                asignaciones: [] };
            // asignaciones: la lista, o el par grabador+canal de los datos guardados antes de que hubiera lista
            const crudas = Array.isArray(i.asignaciones) ? i.asignaciones
                : i.grabador !== undefined || i.canal !== undefined ? [{ grabador: i.grabador, canal: i.canal }] : [];
            const vistos = new Set();
            for (const c of crudas.slice(0, MAX_ASIGNACIONES)) {
                const g = c && typeof c === 'object' ? idValido(c.grabador) : null;
                const canal = c && typeof c === 'object' ? enteroAcotado(c.canal, 1, CANALES_MAX) : null;
                if (g && canal && !vistos.has(g)) { vistos.add(g); x.instalacion.asignaciones.push({ grabador: g, canal }); }
            }
            if (x.condicion !== CONDICION_PRODUCCION) noOperativos++;
        }
        r.dispositivos.push(x);
    }
    // canales: el grabador existe, es un NVR/DVR instalado, el canal entra y nadie más lo ocupa; si no, sin canal
    const porId = new Map(r.dispositivos.map(x => [x.id, x]));
    const ocupados = new Set();
    let canalesMal = 0;
    for (const x of r.dispositivos) {
        const i = x.instalacion;
        if (!i || !i.asignaciones.length) continue;
        i.asignaciones = i.asignaciones.filter((a) => {
            const g = porId.get(a.grabador);
            const clave = `${a.grabador}#${a.canal}`;
            const valido = g && g.id !== x.id && TIPOS_GRABADOR.includes(g.tipo) && g.instalacion
                && !TIPOS_GRABADOR.includes(x.tipo) && (!g.canales || a.canal <= g.canales) && !ocupados.has(clave);
            if (valido) ocupados.add(clave); else canalesMal++;
            return valido;
        });
    }
    if (canalesMal) avisar(`${canalesMal} asignación(es) a canales no válidas (grabador inexistente, canal fuera de rango o repetido): se quitaron`);
    if (descartados) avisar(`${descartados} dispositivo(s) sin id válido o repetido: no se cargaron`);
    if (noOperativos) {
        avisar(`${noOperativos} dispositivo(s) instalados que no están operativos: al editarlos salen de producción`);
    }
    if (repetidos) avisar(`${repetidos} serie/MAC/patrimonio repetidos: se dejó el primero`);
    r.edificios = [...edificios];
    r.pisos = [...pisos];

    const paginas = new Map();
    for (const p of Array.isArray(bruto.modelos_pagina) ? bruto.modelos_pagina : []) {
        const modelo = p && espacios(_t(p.modelo, 'modelo'));
        const url = p && urlWeb(p.pagina);
        if (modelo && url && paginas.size < MAX_MODELOS_PAGINA) {
            paginas.set(claveModelo(modelo), { marca: _t(p.marca, 'marca'), modelo, pagina: url });
        }
    }
    r.modelos_pagina = [...paginas.values()];

    const historial = [];
    for (const e of Array.isArray(bruto.historial) ? bruto.historial : []) {
        if (!e || typeof e !== 'object' || !OBJETOS_HISTORIAL.includes(e.objeto)) continue;
        const campo = textoAcotado(e.campo, 40);
        const cuando = _fecha(e.cuando, null);
        if (!campo || !cuando) continue;
        historial.push({ n: enteroAcotado(e.n, 1, 1e12) || 0, cuando, origen: ORIGENES.includes(e.origen) ? e.origen : 'manual',
            objeto: e.objeto, clave: textoAcotado(e.clave, 80),
            dispositivo_id: e.objeto === 'dispositivo' ? idValido(e.dispositivo_id) : null, campo,
            antes: textoAcotado(e.antes, 500) || null, despues: textoAcotado(e.despues, 500) || null,
            usuario: textoAcotado(e.usuario, 32) || null });
    }
    historial.sort((a, b) => compararTuplas([a.n, a.cuando], [b.n, b.cuando]));
    r.historial = historial.slice(-MAX_HISTORIAL).map((e, i) => ({ ...e, n: i + 1 }));
    r.historial_seq = r.historial.length;

    const lapidas = bruto.eliminados && typeof bruto.eliminados === 'object' ? bruto.eliminados.dispositivos : null;
    for (const [id, cuando] of Object.entries(lapidas && typeof lapidas === 'object' ? lapidas : {})) {
        if (idValido(id) && !ids.has(id) && _fecha(cuando, null)) r.eliminados.dispositivos[id] = cuando;
    }
    return { datos: r, avisos };
}

/** `nuevos` (ya saneados) pasa a reemplazar a `actuales`: los dispositivos que estaban y ya no están quedan con lápida, para que
 *  la sincronización con el Gist los BORRE en las otras PC en vez de volver a traerlos. Se conservan las lápidas anteriores. */
function reemplazarConLapidas(actuales, nuevos, ahora) {
    const r = { ...nuevos, eliminados: { dispositivos: { ...actuales.eliminados.dispositivos, ...nuevos.eliminados.dispositivos } } };
    const quedan = new Set(nuevos.dispositivos.map(d => d.id));
    for (const d of actuales.dispositivos) if (!quedan.has(d.id)) r.eliminados.dispositivos[d.id] = ahora;
    for (const id of quedan) delete r.eliminados.dispositivos[id];
    return r;
}

/** Lo que se exporta (y se guarda): los datos más su formato. */
function exportarDatos(datos, cuando) {
    return { ...datos, formato: FORMATO_DATOS, version: VERSION_DATOS, exportado: cuando };
}
// ==== DATOS PURO END ====
