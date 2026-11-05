'use strict';
// Sincronización con un GitHub Gist SECRETO, cifrado en el navegador (AES-GCM, clave PBKDF2-SHA-256 de una frase).
// El Gist guarda un solo archivo, `sgc2.json`, con un sobre cifrado: GitHub (y quien tenga el ID) no ve IPs, MACs ni
// ubicaciones; AES-GCM detecta cualquier alteración (cubre también las lápidas de `eliminados`).
// Sincronizar = bajar → descifrar → sanear → fusionar con lo local (por dispositivo, gana el más reciente) → guardar
// local → subir el resultado. Sin token solo baja (lectura). Solo textContent.

// ==== GIST PURO BEGIN ====
const GIST_ARCHIVO = 'sgc2.json';
const GIST_FORMATO_SOBRE = 'sgc2-cifrado';
const GIST_VERSION_SOBRE = 1;
const GIST_ITERACIONES = 600000;
const GIST_ITERACIONES_MAX = 2000000;      // un Gist ajeno no puede pedir un cálculo eterno
const GIST_MAX_TEXTO = 8 * 1024 * 1024;
const GIST_FRASE_MIN = 20;
const GIST_AAD = 'sgc2-cifrado/1';
const GIST_RE_ID = /^[0-9a-f]{20,40}$/i;
const GIST_RE_TOKEN = /^[A-Za-z0-9_]{20,255}$/;
const GIST_CONSONANTES = 'bcdfgjklmnprstvz';     // 16 × 5 vocales = 80 sílabas
const GIST_VOCALES = 'aeiou';
const GIST_PALABRAS = 5;                          // 5 palabras de 3 sílabas: 80^15 ≈ 2^95

class ErrorGist extends Error {
    constructor(mensaje, codigo = 'gist') {
        super(mensaje);
        this.codigo = codigo;
    }
}

// ---- base64 (por tramos: un archivo grande no desborda la pila)
function gistABase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
function gistDesdeBase64(texto, largoMax = GIST_MAX_TEXTO) {
    if (typeof texto !== 'string' || texto.length > largoMax * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) {
        throw new ErrorGist('el archivo del Gist no tiene el formato esperado', 'formato');
    }
    const s = atob(texto);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
}

// ---- la frase
function gistNormalizarFrase(frase) {
    return String(frase === null || frase === undefined ? '' : frase).normalize('NFC').trim();
}
/** {ok, frase, motivo, debil}: `ok` solo exige el largo; `debil` es un aviso (pocos caracteres distintos, solo números...). */
function gistEvaluarFrase(frase) {
    const f = gistNormalizarFrase(frase);
    if (f.length < GIST_FRASE_MIN) {
        return { ok: false, frase: f, debil: false, motivo: `La frase tiene que tener al menos ${GIST_FRASE_MIN} caracteres (tiene ${f.length}).` };
    }
    const distintos = new Set(f.toLowerCase()).size;
    const debil = distintos < 8 || /^[\d\s]+$/.test(f) || /^(.{1,4})\1+$/.test(f);
    return { ok: true, frase: f, debil, motivo: debil ? 'La frase parece fácil de adivinar: conviene generar una.' : '' };
}
/** Una frase al azar: palabras pronunciables (sílabas consonante+vocal), con `bytesAleatorios(n)` inyectable. */
function gistGenerarFrase(bytesAleatorios) {
    const silabas = GIST_CONSONANTES.length * GIST_VOCALES.length;
    const tope = Math.floor(256 / silabas) * silabas;          // descarta lo que sesgaría el resto
    const pila = [];
    const siguiente = () => {
        for (;;) {
            if (!pila.length) pila.push(...bytesAleatorios(64));
            const b = pila.pop();
            if (b < tope) return b % silabas;
        }
    };
    const palabras = [];
    for (let p = 0; p < GIST_PALABRAS; p++) {
        let w = '';
        for (let s = 0; s < 3; s++) {
            const i = siguiente();
            w += GIST_CONSONANTES[Math.floor(i / GIST_VOCALES.length)] + GIST_VOCALES[i % GIST_VOCALES.length];
        }
        palabras.push(w);
    }
    return palabras.join('-');
}

// ---- cifrado
let _claveCache = null;      // {frase, sal, iter, clave}: derivar tarda ~medio segundo; se reutiliza con la misma sal
async function gistClave(frase, sal, iter, cripto) {
    const c = _claveCache;
    if (c && c.frase === frase && c.sal === sal && c.iter === iter) return c.clave;
    const material = await cripto.subtle.importKey('raw', new TextEncoder().encode(frase), 'PBKDF2', false, ['deriveKey']);
    const clave = await cripto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: gistDesdeBase64(sal, 64), iterations: iter }, material,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    _claveCache = { frase, sal, iter, clave };
    return clave;
}
function gistOlvidarClave() {
    _claveCache = null;
}
/** Texto → sobre {formato, version, kdf, iter, sal, iv, datos}. `sal` (base64) se reutiliza si ya hay un sobre. */
async function gistCifrar(texto, frase, { sal = null, cripto = globalThis.crypto } = {}) {
    const e = gistEvaluarFrase(frase);
    if (!e.ok) throw new ErrorGist(e.motivo, 'frase');
    const salB64 = sal || gistABase64(cripto.getRandomValues(new Uint8Array(16)));
    const iv = cripto.getRandomValues(new Uint8Array(12));
    const clave = await gistClave(e.frase, salB64, GIST_ITERACIONES, cripto);
    const cifrado = new Uint8Array(await cripto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(GIST_AAD) }, clave, new TextEncoder().encode(texto)));
    return { formato: GIST_FORMATO_SOBRE, version: GIST_VERSION_SOBRE, kdf: 'PBKDF2-SHA-256', iter: GIST_ITERACIONES,
        sal: salB64, iv: gistABase64(iv), datos: gistABase64(cifrado) };
}
/** Valida la forma de un sobre que viene de afuera; devuelve el sobre o lanza ErrorGist. */
function gistSobreValido(s) {
    const mal = (m) => new ErrorGist(m, 'formato');
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw mal('el archivo del Gist no es un sobre de SGC-2');
    if (s.formato !== GIST_FORMATO_SOBRE) throw mal('el archivo del Gist no está cifrado por SGC-2 (¿es de otra app?)');
    if (s.version !== GIST_VERSION_SOBRE || s.kdf !== 'PBKDF2-SHA-256') throw mal('el Gist es de una versión que esta página no conoce');
    if (!Number.isInteger(s.iter) || s.iter < GIST_ITERACIONES || s.iter > GIST_ITERACIONES_MAX) throw mal('el Gist tiene parámetros de cifrado no válidos');
    if (gistDesdeBase64(s.sal, 64).length !== 16 || gistDesdeBase64(s.iv, 64).length !== 12) throw mal('el Gist tiene parámetros de cifrado no válidos');
    if (typeof s.datos !== 'string' || s.datos.length < 24) throw mal('el Gist no tiene datos');
    return s;
}
/** Sobre → texto. Con frase equivocada o contenido alterado AES-GCM falla: «frase incorrecta o Gist alterado». */
async function gistDescifrar(sobre, frase, { cripto = globalThis.crypto } = {}) {
    const s = gistSobreValido(sobre);
    const e = gistEvaluarFrase(frase);
    if (!e.ok) throw new ErrorGist(e.motivo, 'frase');
    const clave = await gistClave(e.frase, s.sal, s.iter, cripto);
    try {
        const plano = await cripto.subtle.decrypt(
            { name: 'AES-GCM', iv: gistDesdeBase64(s.iv, 64), additionalData: new TextEncoder().encode(GIST_AAD) },
            clave, gistDesdeBase64(s.datos));
        return new TextDecoder('utf-8', { fatal: true }).decode(plano);
    } catch (err) {
        if (err instanceof ErrorGist) throw err;
        throw new ErrorGist('No se pudo descifrar: la frase es incorrecta o el Gist fue alterado.', 'descifrado');
    }
}

// ---- fusión
const _gistFecha = (v) => (typeof v === 'string' ? v : '');
const _gistSinExportado = (d) => JSON.stringify({ ...d, exportado: null });
function _gistFirmaHistorial(e) {
    return [e.cuando, e.objeto, e.clave, e.dispositivo_id, e.campo, e.antes, e.despues].join('\u0000');
}
/** Une dos listas de claves por `clave`: lo local manda y lo que solo tiene el otro se agrega. */
function _gistUnirPorClave(local, remoto, clave) {
    const vistos = new Set();
    const r = [];
    for (const x of [...(Array.isArray(local) ? local : []), ...(Array.isArray(remoto) ? remoto : [])]) {
        if (!x || typeof x !== 'object') continue;
        const k = clave(x);
        if (k && !vistos.has(k)) { vistos.add(k); r.push(x); }
    }
    return r;
}
/**
 * Fusiona los datos locales con los del Gist. Los dos ya vienen saneados. Por dispositivo gana el más reciente
 * (`actualizado`, y a igual fecha la versión mayor, y a igual todo lo local). Una lápida borra el dispositivo si es
 * igual o posterior a su última edición; si lo editaron después, el dispositivo revive. Catálogo, edificios, pisos y
 * páginas de modelo se unen (lo local manda); el historial se une sin repetir. Después se pasa por `sanear`, que
 * vuelve a exigir TODAS las invariantes (serie/MAC únicas, canales...): lo que choque se corrige y queda en `avisos`.
 * Devuelve {datos, avisos, resumen:{agregados, actualizados, eliminados, revividos}, cambiaLocal, cambiaRemoto}.
 */
function gistFusionar(local, remoto, sanear, ahora) {
    const lapidas = new Map();
    for (const origen of [local.eliminados.dispositivos, remoto.eliminados.dispositivos]) {
        for (const [id, cuando] of Object.entries(origen)) {
            if (!lapidas.has(id) || cuando > lapidas.get(id)) lapidas.set(id, cuando);
        }
    }
    const rem = new Map(remoto.dispositivos.map(d => [d.id, d]));
    const loc = new Map(local.dispositivos.map(d => [d.id, d]));
    const resumen = { agregados: 0, actualizados: 0, eliminados: 0, revividos: 0 };
    const salida = [];
    const nuevos = [];
    const lapidasFinales = {};
    const decidir = (id, l, r) => {
        const ganador = !l ? r : !r ? l
            : (_gistFecha(r.actualizado) > _gistFecha(l.actualizado)
                || (r.actualizado === l.actualizado && r.version > l.version)) ? r : l;
        const t = lapidas.get(id);
        if (t && t >= ganador.actualizado) {
            if (l) resumen.eliminados++;
            lapidasFinales[id] = t;
            return null;
        }
        if (t) resumen.revividos++;
        if (!l) resumen.agregados++;
        else if (ganador === r && _gistSinExportado(l) !== _gistSinExportado(r)) resumen.actualizados++;
        return { ...ganador, version: Math.max(l ? l.version : 1, r ? r.version : 1) };
    };
    for (const l of local.dispositivos) {
        const d = decidir(l.id, l, rem.get(l.id));
        if (d) salida.push(d);
    }
    for (const r of remoto.dispositivos) {
        if (loc.has(r.id)) continue;
        const d = decidir(r.id, null, r);
        if (d) nuevos.push(d);
    }
    nuevos.sort((a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : a.id < b.id ? -1 : 1));
    for (const [id, t] of lapidas) if (!loc.has(id) && !rem.has(id)) lapidasFinales[id] = t;

    const historial = _gistUnirPorClave(local.historial, remoto.historial, _gistFirmaHistorial)
        .sort((a, b) => (a.cuando < b.cuando ? -1 : a.cuando > b.cuando ? 1 : a.n - b.n));
    const bruto = {
        ...local,
        dispositivos: [...salida, ...nuevos],
        catalogo: {
            grupos: _gistUnirPorClave(local.catalogo.grupos, remoto.catalogo.grupos, x => x.clave),
            tipos: _gistUnirPorClave(local.catalogo.tipos, remoto.catalogo.tipos, x => x.clave)
        },
        edificios: [...new Set([...local.edificios, ...remoto.edificios])],
        pisos: [...new Set([...local.pisos, ...remoto.pisos])],
        modelos_pagina: _gistUnirPorClave(local.modelos_pagina, remoto.modelos_pagina, x => String(x.modelo).trim().toLowerCase()),
        historial,
        eliminados: { dispositivos: lapidasFinales }
    };
    const r = sanear(bruto, ahora);
    const sl = sanear(local, ahora).datos;
    const sr = sanear(remoto, ahora).datos;
    return { datos: r.datos, avisos: r.avisos, resumen,
        cambiaLocal: _gistSinExportado(r.datos) !== _gistSinExportado(sl),
        cambiaRemoto: _gistSinExportado(r.datos) !== _gistSinExportado(sr) };
}

/** Texto que ve la persona tras sincronizar. */
function gistResumenTexto(res) {
    const partes = [];
    if (res.resumen.agregados) partes.push(`${res.resumen.agregados} dispositivo(s) nuevo(s)`);
    if (res.resumen.actualizados) partes.push(`${res.resumen.actualizados} actualizado(s)`);
    if (res.resumen.eliminados) partes.push(`${res.resumen.eliminados} eliminado(s)`);
    if (res.resumen.revividos) partes.push(`${res.resumen.revividos} recuperado(s) por una edición posterior`);
    return partes.length ? partes.join(', ') : 'sin cambios en los dispositivos';
}

// ---- Gist: respuestas de la API
function gistExtraerArchivo(respuesta) {
    const f = respuesta && respuesta.files && respuesta.files[GIST_ARCHIVO];
    return f && typeof f === 'object' ? f : null;
}
function gistRawValida(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && u.hostname === 'gist.githubusercontent.com';
    } catch (e) { return false; }
}
function gistErrorHttp(estado, accion) {
    if (estado === 401) return 'GitHub rechazó el token (vencido o mal copiado).';
    if (estado === 403 || estado === 429) return 'GitHub rechazó el pedido (permisos del token o demasiados pedidos): reintentá en unos minutos.';
    if (estado === 404) return accion === 'leer' ? 'No existe un Gist con ese ID (o el token no lo ve).' : 'GitHub no encontró el Gist (¿el token es de otra cuenta?).';
    if (estado === 422) return 'GitHub no aceptó el contenido.';
    return `GitHub respondió con el error ${estado}.`;
}
// ==== GIST PURO END ====

if (typeof document !== 'undefined') {
    const GIST_API = 'https://api.github.com';
    const ESPERA_AUTO_MS = 5000;
    const TIEMPO_MAX_MS = 25000;
    const $ = (id) => document.getElementById(id);

    // ---- configuración y secretos: el token y la frase solo se guardan si la persona lo pide («Recordar»)
    const config = {
        leer() {
            const c = storage.getJSON('gist_cfg', {});
            return { gistId: GIST_RE_ID.test(c.gistId || '') ? c.gistId : '', auto: c.auto === true,
                recordarToken: c.recordarToken === true, recordarFrase: c.recordarFrase === true,
                ultima: typeof c.ultima === 'string' ? c.ultima : '' };
        },
        guardar(c) { storage.setJSON('gist_cfg', c); }
    };
    const secreto = {
        leer(nombre) {
            const persistido = storage.get(nombre);
            if (persistido) return persistido;
            try { return sessionStorage.getItem(PREFIJO_ALMACEN + nombre) || ''; } catch (e) { return ''; }
        },
        guardar(nombre, valor, recordar) {
            storage.remove(nombre);
            try { sessionStorage.removeItem(PREFIJO_ALMACEN + nombre); } catch (e) { /* sin sessionStorage */ }
            if (!valor) return;
            if (recordar) storage.set(nombre, valor);
            else { try { sessionStorage.setItem(PREFIJO_ALMACEN + nombre, valor); } catch (e) { /* queda solo en el campo */ } }
        }
    };

    const ahoraZ = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    // ---- transporte
    async function pedir(metodo, ruta, token, cuerpo) {
        const control = new AbortController();
        const reloj = setTimeout(() => control.abort(), TIEMPO_MAX_MS);
        const accion = metodo === 'GET' ? 'leer' : 'escribir';
        try {
            const cabeceras = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
            if (token) cabeceras.Authorization = `Bearer ${token}`;
            if (cuerpo) cabeceras['Content-Type'] = 'application/json';
            const r = await fetch(GIST_API + ruta, { method: metodo, headers: cabeceras, signal: control.signal,
                cache: 'no-store', body: cuerpo ? JSON.stringify(cuerpo) : undefined });
            if (!r.ok) throw new ErrorGist(gistErrorHttp(r.status, accion), 'http');
            return await r.json();
        } catch (e) {
            if (e instanceof ErrorGist) throw e;
            throw new ErrorGist(e && e.name === 'AbortError' ? 'GitHub tardó demasiado en responder.'
                : 'No se pudo conectar con GitHub (¿sin red?).', 'red');
        } finally {
            clearTimeout(reloj);
        }
    }
    /** El texto del archivo del Gist (o null si el Gist existe pero todavía no lo tiene). */
    async function leerGist(id, token) {
        const g = await pedir('GET', `/gists/${id}`, token);
        const f = gistExtraerArchivo(g);
        if (!f) return null;
        let texto = typeof f.content === 'string' ? f.content : '';
        if (f.truncated) {
            if (!gistRawValida(f.raw_url)) throw new ErrorGist('GitHub devolvió una dirección no válida para el archivo.', 'formato');
            const r = await fetch(f.raw_url, { cache: 'no-store' });
            if (!r.ok) throw new ErrorGist(gistErrorHttp(r.status, 'leer'), 'http');
            texto = await r.text();
        }
        if (texto.length > GIST_MAX_TEXTO) throw new ErrorGist('El archivo del Gist es demasiado grande.', 'formato');
        return texto.trim() ? texto : null;
    }
    const contenido = (sobre) => ({ [GIST_ARCHIVO]: { content: JSON.stringify(sobre) } });

    function parsearSobre(texto) {
        try { return JSON.parse(texto); } catch (e) { throw new ErrorGist('el archivo del Gist no es un JSON válido', 'formato'); }
    }

    // ---- sincronizar
    let ocupado = false;
    let pendiente = null;
    let reloj = null;
    const estado = { texto: '', tipo: 'info' };

    function fraseActual() {
        return gistNormalizarFrase(secreto.leer('gist_frase'));
    }
    function listoParaAuto() {
        const c = config.leer();
        return !!(c.gistId && c.auto && secreto.leer('gist_token') && gistEvaluarFrase(fraseActual()).ok);
    }

    /**
     * Baja, fusiona, guarda y sube. `crear`: si no hay Gist, lo crea (secreto) con lo local. Devuelve
     * {accion, texto, avisos}; lanza ErrorGist/ErrorDatos con un mensaje para la persona.
     */
    async function sincronizar({ crear = false } = {}) {
        if (ocupado) { pendiente = { crear }; return { accion: 'pendiente', texto: 'Ya se está sincronizando.', avisos: [] }; }
        ocupado = true;
        try {
            const cfg = config.leer();
            const token = secreto.leer('gist_token');
            const frase = fraseActual();
            const f = gistEvaluarFrase(frase);
            if (!f.ok) throw new ErrorGist(f.motivo, 'frase');
            if (token && !GIST_RE_TOKEN.test(token)) throw new ErrorGist('El token no parece válido (solo letras, números y «_»).', 'token');
            const local = ApiLocal.datos();
            const guardarLocal = (datos) => ApiLocal.reemplazar(datos);

            if (!cfg.gistId) {
                if (!crear) throw new ErrorGist('Falta el ID del Gist. Pegalo, o creá uno nuevo con un token.', 'config');
                if (!token) throw new ErrorGist('Para crear el Gist hace falta un token con permiso «gist».', 'token');
                const sobre = await gistCifrar(JSON.stringify(exportarDatos(local, ahoraZ())), frase);
                const g = await pedir('POST', '/gists', token, { description: 'SGC-2 (datos cifrados)', public: false, files: contenido(sobre) });
                if (!g || !GIST_RE_ID.test(String(g.id || ''))) throw new ErrorGist('GitHub no devolvió el ID del Gist.', 'formato');
                config.guardar({ ...cfg, gistId: g.id, ultima: ahoraZ() });
                return { accion: 'creado', texto: 'Gist secreto creado y subido (cifrado).', avisos: [], gistId: g.id };
            }

            const texto = await leerGist(cfg.gistId, token);
            if (texto === null) {
                if (!token) throw new ErrorGist('El Gist está vacío y no hay token para subir.', 'token');
                const sobre = await gistCifrar(JSON.stringify(exportarDatos(local, ahoraZ())), frase);
                await pedir('PATCH', `/gists/${cfg.gistId}`, token, { files: contenido(sobre) });
                config.guardar({ ...cfg, ultima: ahoraZ() });
                return { accion: 'subido', texto: 'El Gist estaba vacío: se subieron los datos.', avisos: [] };
            }
            const sobreRemoto = gistSobreValido(parsearSobre(texto));
            const plano = await gistDescifrar(sobreRemoto, frase);
            const bruto = parsearSobre(plano);
            if (!bruto || bruto.formato !== FORMATO_DATOS) throw new ErrorGist('El contenido del Gist no es de SGC-2.', 'formato');
            const remoto = sanearDatos(bruto, ahoraZ());
            const res = gistFusionar(local, remoto.datos, sanearDatos, ahoraZ());
            const avisos = [...remoto.avisos, ...res.avisos];
            if (res.cambiaLocal) guardarLocal(res.datos);
            let subido = false;
            if (res.cambiaRemoto) {
                if (token) {
                    const sobre = await gistCifrar(JSON.stringify(exportarDatos(res.datos, ahoraZ())), frase, { sal: sobreRemoto.sal });
                    await pedir('PATCH', `/gists/${cfg.gistId}`, token, { files: contenido(sobre) });
                    subido = true;
                } else {
                    avisos.push('hay cambios locales que no se subieron (sin token solo se baja)');
                }
            }
            config.guardar({ ...cfg, ultima: ahoraZ() });
            const que = [];
            if (res.cambiaLocal) que.push(`bajado: ${gistResumenTexto(res)}`);
            if (subido) que.push('subido');
            return { accion: res.cambiaLocal || subido ? 'sincronizado' : 'al_dia',
                texto: que.length ? `Sincronizado (${que.join('; ')}).` : 'Todo al día: no había diferencias.', avisos };
        } finally {
            ocupado = false;
            if (pendiente) {
                const p = pendiente;
                pendiente = null;
                setTimeout(() => ejecutar(p), 0);
            }
        }
    }

    function mostrarEstado(texto, tipo = 'info') {
        estado.texto = texto;
        estado.tipo = tipo;
        const el = $('gist-estado');
        if (!el) return;
        el.textContent = texto;
        el.classList.toggle('text-danger', tipo === 'error');
    }
    function pintarUltima() {
        const el = $('gist-ultima');
        if (!el) return;
        const c = config.leer();
        el.textContent = c.ultima ? `Última sincronización: ${new Date(c.ultima).toLocaleString()}.` : 'Todavía no se sincronizó.';
    }
    async function ejecutar(opciones, { silencioso = false } = {}) {
        const botones = document.querySelectorAll('.gist-accion');
        botones.forEach(b => { b.disabled = true; });
        mostrarEstado('Sincronizando…');
        try {
            const r = await sincronizar(opciones);
            if (r.accion === 'pendiente') return;
            const resto = r.avisos.length ? ` Observaciones: ${r.avisos.join('; ')}.` : '';
            mostrarEstado(r.texto + resto, r.avisos.length ? 'warning' : 'success');
            if (!silencioso || r.avisos.length || r.accion === 'sincronizado') {
                mostrarToast(r.texto + resto, r.avisos.length ? 'warning' : 'success', r.avisos.length ? 8000 : 3500);
            }
            if (r.gistId && $('gist-id')) $('gist-id').value = r.gistId;
        } catch (e) {
            const m = e && typeof e.detalle === 'function' ? e.detalle() : e && e.message ? e.message : 'No se pudo sincronizar.';
            mostrarEstado(m, 'error');
            mostrarToast(m, 'error', 7000);
        } finally {
            botones.forEach(b => { b.disabled = false; });
            pintarUltima();
        }
    }

    // ---- autosincronización: un cambio local sube a los pocos segundos (si hay token y está activada)
    document.addEventListener('sgc:datos-cambiados', () => {
        if (ocupado || !listoParaAuto()) return;
        clearTimeout(reloj);
        reloj = setTimeout(() => ejecutar({}, { silencioso: true }), ESPERA_AUTO_MS);
    });

    // ---- pantalla de Ajustes
    function leerCampos() {
        const c = config.leer();
        const gistId = ($('gist-id').value || '').trim();
        if (gistId && !GIST_RE_ID.test(gistId)) throw new ErrorGist('El ID del Gist no es válido (letras a-f y números).', 'config');
        const recordarToken = $('gist-recordar-token').checked;
        const recordarFrase = $('gist-recordar-frase').checked;
        secreto.guardar('gist_token', ($('gist-token').value || '').trim(), recordarToken);
        secreto.guardar('gist_frase', gistNormalizarFrase($('gist-frase').value), recordarFrase);
        config.guardar({ ...c, gistId, recordarToken, recordarFrase });
    }
    function pintarAuto() {
        uiInterruptor($('gist-auto'), config.leer().auto);
    }
    function pintarFrase() {
        const e = gistEvaluarFrase($('gist-frase').value);
        const el = $('gist-frase-aviso');
        if (!el) return;
        el.textContent = $('gist-frase').value ? e.motivo : '';
        el.classList.toggle('text-danger', !e.ok);
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('gist-id')) return;
        const c = config.leer();
        $('gist-id').value = c.gistId;
        $('gist-token').value = secreto.leer('gist_token');
        $('gist-frase').value = secreto.leer('gist_frase');
        $('gist-recordar-token').checked = c.recordarToken;
        $('gist-recordar-frase').checked = c.recordarFrase;
        pintarAuto();
        pintarUltima();
        pintarFrase();
        $('gist-frase').addEventListener('input', pintarFrase);

        const alPulsar = (id, fn) => $(id).addEventListener('click', fn);
        const conCampos = (opciones) => () => {
            try { leerCampos(); } catch (e) { mostrarEstado(e.message, 'error'); mostrarToast(e.message, 'error', 5000); return; }
            ejecutar(opciones);
        };
        alPulsar('gist-sincronizar', conCampos({}));
        alPulsar('gist-crear', conCampos({ crear: true }));
        alPulsar('gist-generar', () => {
            const f = gistGenerarFrase((n) => [...crypto.getRandomValues(new Uint8Array(n))]);
            $('gist-frase').value = f;
            $('gist-frase').type = 'text';
            pintarFrase();
            mostrarToast('Frase generada: anotala en un lugar seguro. Sin ella no se puede leer el Gist.', 'warning', 9000);
        });
        alPulsar('gist-ver', () => {
            for (const id of ['gist-token', 'gist-frase']) $(id).type = $(id).type === 'password' ? 'text' : 'password';
        });
        alPulsar('gist-auto', () => {
            const actual = config.leer();
            const auto = !actual.auto;
            try { leerCampos(); } catch (e) { mostrarToast(e.message, 'error', 5000); return; }
            config.guardar({ ...config.leer(), auto });
            pintarAuto();
            mostrarToast(auto ? 'Los cambios se suben solos a los pocos segundos.' : 'Sincronización automática desactivada.', 'info', 3000);
        });
        alPulsar('gist-olvidar', () => {
            secreto.guardar('gist_token', '', false);
            secreto.guardar('gist_frase', '', false);
            gistOlvidarClave();
            $('gist-token').value = '';
            $('gist-frase').value = '';
            config.guardar({ ...config.leer(), auto: false });
            pintarAuto();
            pintarFrase();
            mostrarToast('Token y frase olvidados en este navegador.', 'info', 3000);
        });

        // al abrir: si está todo guardado y la automática activa, se baja lo que hayan subido otros
        if (listoParaAuto()) ejecutar({}, { silencioso: true });
    });
}
