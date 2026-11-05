'use strict';
// Parseadores del `cctv_online.json` que genera el escáner (Python, fuera de esta app). Un solo archivo, dos usos:
//  · Datos: cada dispositivo del stock con esa MAC recibe serie, firmware y modelo del archivo (nunca se pisa con vacío).
//  · Canales: cada grabador del archivo se vincula a uno del stock (MAC > serie > IP, nunca por nombre parcial) y cada
//    cámara se pone en su canal (por MAC > serie): descripción e IP del archivo. Lo que no encaja es un CONFLICTO que se
//    muestra y no se aplica (un equipo que ya está en otro canal no se mueve solo).
// Es una vista previa: nada cambia hasta «Aplicar», y todo entra al historial (origen «importación»). Solo textContent.
// Usa las reglas de datos-puro.js (crearDispositivo, modificarDispositivo...): el archivo no tiene atajos.

// ==== PARSEADOR PURO BEGIN ====
const PARS_MAX_TEXTO = 8 * 1024 * 1024;
const PARS_MAX_NVRS = 500;
const PARS_MAX_CAMARAS = 20000;
const PARS_ESCALONES = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
const PARS_MAX_FILAS = 200;                       // filas que se muestran por sección (el resto se cuenta)

class ErrorParseo extends Error {}

const _parsTexto = (v, largo = 200) => textoAcotado(v, largo);
function _parsSerie(v) {
    return _opcional(v, 'serie', NULOS_SERIE);
}
const _parsClaveSerie = (s) => (s ? String(s).toLowerCase() : null);

/** El archivo del escáner, revisado: {nvrs, camaras}. Lanza ErrorParseo si no tiene la forma esperada. */
function parsearArchivoEscaner(texto) {
    if (typeof texto !== 'string' || !texto.trim()) throw new ErrorParseo('el archivo está vacío');
    if (texto.length > PARS_MAX_TEXTO) throw new ErrorParseo('el archivo es demasiado grande (máximo 8 MB)');
    let bruto;
    try { bruto = JSON.parse(texto); } catch (e) { throw new ErrorParseo('el archivo no es un JSON válido'); }
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)
        || (!Array.isArray(bruto.nvrs) && !Array.isArray(bruto.camaras))) {
        throw new ErrorParseo('el archivo no tiene el formato esperado (nvrs / camaras)');
    }
    const nvrs = [], camaras = [];
    const nombres = new Set();
    for (const n of (Array.isArray(bruto.nvrs) ? bruto.nvrs : []).slice(0, PARS_MAX_NVRS)) {
        if (!n || typeof n !== 'object') continue;
        const nombre = _parsTexto(n.nvr_name, 80);
        if (!nombre || nombres.has(nombre)) continue;
        nombres.add(nombre);
        nvrs.push({ nombre, ip: ipLiteralValida(_parsTexto(n.ip, 45)), modelo: _parsTexto(n.modelo, 80),
            serie: _parsSerie(n.nro_serie), mac: macNormalizada(_parsTexto(n.mac_address || n.mac, 40)),
            firmware: _opcional(n.firmware, 'firmware'), total: enteroAcotado(n.total_camaras, 0, 4096) });
    }
    for (const c of (Array.isArray(bruto.camaras) ? bruto.camaras : []).slice(0, PARS_MAX_CAMARAS)) {
        if (!c || typeof c !== 'object') continue;
        camaras.push({ nombre: _parsTexto(c.camera_name, 120), ip: ipLiteralValida(_parsTexto(c.ip_address, 45)),
            mac: macNormalizada(_parsTexto(c.mac_address || c.mac, 40)), modelo: _parsTexto(c.modelo, 80),
            serie: _parsSerie(c.nro_serie), firmware: _opcional(c.firmware, 'firmware'),
            nvr: _parsTexto(c.nvr_name, 80), canal: enteroAcotado(c.channel_id, 1, CANALES_MAX) });
    }
    if (!nvrs.length && !camaras.length) throw new ErrorParseo('el archivo no trae grabadores ni cámaras');
    return { nvrs, camaras };
}

/** Índices del stock por MAC y por serie (los dos únicos en el stock). */
function parsIndice(datos) {
    const porMac = new Map(), porSerie = new Map();
    for (const d of datos.dispositivos) {
        if (d.mac) porMac.set(d.mac, d);
        if (d.serie) porSerie.set(_parsClaveSerie(d.serie), d);
    }
    return { porMac, porSerie };
}
const _parsBuscar = (idx, mac, serie) => (mac && idx.porMac.get(mac)) || (serie && idx.porSerie.get(_parsClaveSerie(serie))) || null;
const _parsNombre = (d) => (d.instalacion && d.instalacion.descripcion) || [d.marca, d.modelo].filter(Boolean).join(' ') || d.id;
const _parsEscalon = (n) => PARS_ESCALONES.find(e => e >= n) || CANALES_MAX;
const _parsMarca = (modelo) => (/^DS-/i.test(modelo) ? 'Hikvision' : '');

// ---------------------------------------------------------------------------------------------------- datos
/** Qué cambiaría en serie/firmware/modelo de los dispositivos que tienen una MAC del archivo. */
function parsPlanDatos(datos, arch) {
    const porMac = new Map();
    for (const f of [...arch.nvrs, ...arch.camaras]) {
        if (!f.mac) continue;
        if (!porMac.has(f.mac)) porMac.set(f.mac, []);
        porMac.get(f.mac).push(f);
    }
    const idx = parsIndice(datos);
    const plan = { actualizaciones: [], omitidas: [], nuevos: 0, sinCambios: 0 };
    for (const [mac, filas] of porMac) {
        const dev = idx.porMac.get(mac);
        if (!dev) { plan.nuevos++; continue; }
        const valor = (campo) => [...new Set(filas.map(f => f[campo]).filter(Boolean))];
        const campos = [];
        for (const campo of ['serie', 'firmware', 'modelo']) {
            const vals = valor(campo);
            if (vals.length > 1) { plan.omitidas.push({ mac, nombre: _parsNombre(dev), motivo: `${campo}: el archivo trae ${vals.length} valores distintos para esta MAC` }); continue; }
            if (!vals.length || vals[0] === (dev[campo] || '')) continue;
            if (campo === 'serie') {
                if (_parsClaveSerie(vals[0]) === _parsClaveSerie(dev.serie)) continue;       // solo cambian mayúsculas
                const otro = idx.porSerie.get(_parsClaveSerie(vals[0]));
                if (otro && otro.id !== dev.id) {
                    plan.omitidas.push({ mac, nombre: _parsNombre(dev), motivo: `serie ${vals[0]}: ya la tiene «${_parsNombre(otro)}»` });
                    continue;
                }
            }
            campos.push({ campo, antes: dev[campo] || '', despues: vals[0] });
        }
        if (campos.length) plan.actualizaciones.push({ id: dev.id, nombre: _parsNombre(dev), mac, campos });
        else plan.sinCambios++;
    }
    return plan;
}

// ---------------------------------------------------------------------------------------------------- canales
/** El grabador del stock que corresponde a un NVR del archivo: MAC > serie > IP de la instalación. Nunca por nombre. */
function parsGrabadorDe(datos, idx, nvr) {
    const esGrab = (d) => d && TIPOS_GRABADOR.includes(d.tipo);
    const porId = _parsBuscar(idx, nvr.mac, nvr.serie);
    if (esGrab(porId)) return porId;
    if (nvr.ip) {
        const porIp = datos.dispositivos.filter(d => esGrab(d) && d.instalacion && d.instalacion.ip === nvr.ip);
        if (porIp.length === 1) return porIp[0];
    }
    return null;
}

/**
 * Plan de canales. `opciones`: {modo: 'conservar'|'reemplazar', mapeo: {nombreNvr: id | 'crear' | 'ignorar'},
 * altas: bool (dar de alta las cámaras que no están en el stock), tipoAlta}. Sin `mapeo` para un NVR se usa su vínculo
 * automático (o 'ignorar' si no hay). Devuelve {grabadores, acciones, conflictos, sinMatch, sinCambios}.
 */
function parsPlanCanales(datos, arch, opciones = {}) {
    const modo = opciones.modo === 'reemplazar' ? 'reemplazar' : 'conservar';
    const tipoAlta = opciones.tipoAlta || 'camara';
    const idx = parsIndice(datos);
    const porId = new Map(datos.dispositivos.map(d => [d.id, d]));
    const plan = { grabadores: [], acciones: [], conflictos: [], sinMatch: [], sinCambios: 0, modo };
    const conflicto = (c, motivo) => plan.conflictos.push({ nvr: c.nvr, canal: c.canal, nombre: c.nombre, mac: c.mac, motivo });

    // cada canal y cada MAC pueden aparecer una sola vez en el archivo; si se repiten no se sabe cuál vale
    const veces = (clave) => {
        const m = new Map();
        for (const c of arch.camaras) { const k = clave(c); if (k) m.set(k, (m.get(k) || 0) + 1); }
        return m;
    };
    const canales = veces(c => (c.nvr && c.canal ? `${c.nvr}\u0000${c.canal}` : null));
    const macsEnNvr = veces(c => (c.mac && c.nvr ? `${c.nvr}\u0000${c.mac}` : null));      // en OTRO grabador no es repetida: es redundancia
    const tocados = new Set();                                        // equipos que ya tienen una acción en este plan

    for (const nvr of arch.nvrs) {
        const auto = parsGrabadorDe(datos, idx, nvr);
        const eleccion = opciones.mapeo && opciones.mapeo[nvr.nombre] !== undefined ? opciones.mapeo[nvr.nombre] : (auto ? auto.id : 'ignorar');
        const filas = arch.camaras.filter(c => c.nvr === nvr.nombre);
        const maxCanal = filas.reduce((m, c) => Math.max(m, c.canal || 0), 0);
        const g = { nombre: nvr.nombre, ip: nvr.ip, modelo: nvr.modelo, camaras: filas.length, auto: auto ? auto.id : null,
            estado: 'ignorado', grabadorId: null, etiqueta: '', canalesN: _parsEscalon(Math.max(maxCanal, nvr.total || 0)), nvr };
        if (eleccion === 'crear') {
            const sinTipo = nvr.mac || nvr.serie;
            if (auto) { g.estado = 'ignorado'; g.motivo = 'ya está en el stock: elegilo en la lista'; }
            else if (!sinTipo) { g.estado = 'ignorado'; g.motivo = 'sin MAC ni serie no se puede dar de alta'; }
            else { g.estado = 'crear'; g.etiqueta = nvr.nombre; }
        } else if (eleccion !== 'ignorar' && porId.has(eleccion) && TIPOS_GRABADOR.includes(porId.get(eleccion).tipo)) {
            const dev = porId.get(eleccion);
            g.estado = 'vinculado';
            g.grabadorId = dev.id;
            g.etiqueta = _parsNombre(dev);
            if (!dev.instalacion) { g.estado = 'ignorado'; g.motivo = 'el grabador del stock no está instalado'; }
        }
        plan.grabadores.push(g);
        if (g.estado === 'ignorado') continue;

        const dev = g.grabadorId ? porId.get(g.grabadorId) : null;
        const capacidad = dev ? dev.canales : null;
        const ocupantes = new Map();
        if (dev) for (const x of datos.dispositivos) for (const a of asignacionesDe(x.instalacion)) if (a.grabador === dev.id) ocupantes.set(a.canal, x);
        const enArchivo = new Set();
        for (const c of filas) {
            if (!c.canal) { conflicto(c, 'sin número de canal'); continue; }
            enArchivo.add(c.canal);
            if (canales.get(`${c.nvr}\u0000${c.canal}`) > 1) { conflicto(c, 'el canal aparece más de una vez en el archivo'); continue; }
            if (c.mac && macsEnNvr.get(`${c.nvr}\u0000${c.mac}`) > 1) { conflicto(c, 'la MAC aparece en más de un canal de este grabador'); continue; }
            if (capacidad && c.canal > capacidad) { conflicto(c, `el grabador tiene ${capacidad} canales`); continue; }
            const disp = _parsBuscar(idx, c.mac, c.serie);
            if (!disp) {
                if (!c.mac && !c.serie) { conflicto(c, 'sin MAC ni serie no se puede identificar'); continue; }
                if (opciones.altas) plan.acciones.push({ tipo: 'alta', nvr: nvr.nombre, grabadorId: g.grabadorId, canal: c.canal, camara: c, tipoAlta });
                else plan.sinMatch.push({ nvr: c.nvr, canal: c.canal, nombre: c.nombre, mac: c.mac });
                continue;
            }
            if (TIPOS_GRABADOR.includes(disp.tipo)) { conflicto(c, `«${_parsNombre(disp)}» es un grabador`); continue; }
            if (disp.condicion !== CONDICION_PRODUCCION) { conflicto(c, `«${_parsNombre(disp)}» no está operativo (${disp.condicion})`); continue; }
            const cur = disp.instalacion;
            const mismo = g.grabadorId ? asignacionesDe(cur).find(a => a.grabador === g.grabadorId) : null;
            if (mismo && mismo.canal !== c.canal) {
                conflicto(c, `«${_parsNombre(disp)}» ya está en el CH ${mismo.canal} de este grabador`);
                continue;
            }
            const ocupa = ocupantes.get(c.canal);
            if (ocupa && ocupa.id !== disp.id) { conflicto(c, `el canal lo ocupa «${_parsNombre(ocupa)}»`); continue; }
            const cambia = [];
            const primera = !tocados.has(disp.id);                          // un equipo en dos grabadores: descripción e IP, la primera fila
            if (!mismo) cambia.push({ campo: 'canal', antes: cur ? (asignacionesDe(cur).length ? 'ya en otros grabadores' : 'sin canal') : 'en depósito', despues: `+ CH ${c.canal}` });
            if (primera && c.nombre && (!cur || cur.descripcion !== c.nombre)) cambia.push({ campo: 'descripción', antes: cur ? cur.descripcion : '', despues: c.nombre });
            if (primera && c.ip && (!cur || cur.ip !== c.ip)) cambia.push({ campo: 'IP', antes: cur && cur.ip || '', despues: c.ip });
            if (!cambia.length) { plan.sinCambios++; continue; }
            tocados.add(disp.id);
            plan.acciones.push({ tipo: 'asignar', nvr: nvr.nombre, grabadorId: g.grabadorId, canal: c.canal, dispositivoId: disp.id,
                nombre: _parsNombre(disp), camara: c, cambia, conTexto: primera });
        }
        if (modo === 'reemplazar' && dev && filas.length) {
            for (const [canal, x] of ocupantes) {
                if (!enArchivo.has(canal)) plan.acciones.push({ tipo: 'liberar', nvr: nvr.nombre, grabadorId: dev.id, canal, dispositivoId: x.id, nombre: _parsNombre(x) });
            }
        }
    }
    return plan;
}

// ---------------------------------------------------------------------------------------------------- aplicar
function _parsFallo(fallos, que, e) {
    if (!(e instanceof ErrorDatos)) throw e;
    fallos.push({ que, motivo: e.detalle() });
}
/** Aplica el plan de datos sobre `datos` (una copia) con las reglas del stock. Devuelve {actualizados, fallos}. */
function parsAplicarDatos(datos, plan, ctx) {
    const r = { actualizados: 0, fallos: [] };
    for (const a of plan.actualizaciones) {
        const d = datos.dispositivos.find(x => x.id === a.id);
        if (!d) continue;
        const f = _formulario(d);
        for (const c of a.campos) f[c.campo] = c.despues;
        try { modificarDispositivo(datos, d.id, f, d.version, ctx); r.actualizados++; } catch (e) { _parsFallo(r.fallos, a.nombre, e); }
    }
    return r;
}
/** Aplica el plan de canales: primero los grabadores nuevos, después liberar y asignar. {asignados, altas, liberados, grabadoresCreados, fallos}. */
function parsAplicarCanales(datos, plan, ctx) {
    const r = { asignados: 0, altas: 0, liberados: 0, grabadoresCreados: 0, fallos: [] };
    const creados = new Map();                       // nombre del NVR del archivo -> id nuevo
    for (const g of plan.grabadores) {
        if (g.estado !== 'crear') continue;
        const n = g.nvr;
        try {
            const d = crearDispositivo(datos, { tipo: /dvr/i.test(n.modelo) && !/nvr/i.test(n.modelo) ? 'dvr' : 'nvr',
                condicion: CONDICION_PRODUCCION, marca: _parsMarca(n.modelo), modelo: n.modelo, serie: n.serie, mac: n.mac,
                firmware: n.firmware, canales: g.canalesN, instalacion: { descripcion: n.nombre, ip: n.ip } }, ctx);
            creados.set(n.nombre, d.id);
            r.grabadoresCreados++;
        } catch (e) { _parsFallo(r.fallos, `grabador ${n.nombre}`, e); }
    }
    const destino = (a) => a.grabadorId || creados.get(a.nvr) || null;
    const ordenadas = [...plan.acciones.filter(a => a.tipo === 'liberar'), ...plan.acciones.filter(a => a.tipo !== 'liberar')];
    for (const a of ordenadas) {
        const gid = destino(a);
        if (!gid) { r.fallos.push({ que: a.nombre || a.camara.nombre, motivo: 'su grabador no se pudo crear' }); continue; }
        try {
            const ya = a.tipo === 'alta' ? datos.dispositivos.find(x => (a.camara.mac && x.mac === a.camara.mac)
                || (a.camara.serie && x.serie && x.serie.toLowerCase() === a.camara.serie.toLowerCase())) : null;
            if (a.tipo === 'alta' && !ya) {                 // la misma cámara en dos grabadores: la segunda fila se suma a la que se acaba de crear
                const grab = datos.dispositivos.find(x => x.id === gid);
                const gi = grab && grab.instalacion || {};
                const c = a.camara;
                crearDispositivo(datos, { tipo: a.tipoAlta, condicion: CONDICION_PRODUCCION, marca: _parsMarca(c.modelo), modelo: c.modelo,
                    serie: c.serie, mac: c.mac, firmware: c.firmware,
                    instalacion: { descripcion: c.nombre, ip: c.ip, edificio: gi.edificio || '', piso: gi.piso || '', asignaciones: [{ grabador: gid, canal: a.canal }] } }, ctx);
                r.altas++;
                continue;
            }
            const d = ya || datos.dispositivos.find(x => x.id === a.dispositivoId);
            if (!d) continue;
            const f = _formulario(d);
            const cur = f.instalacion || {};
            const otras = (cur.asignaciones || []).filter(x => x.grabador !== gid);
            if (a.tipo === 'liberar') {
                f.instalacion = { ...cur, asignaciones: otras };
            } else {
                const grab = datos.dispositivos.find(x => x.id === gid);
                const gi = grab && grab.instalacion || {};
                const conTexto = a.conTexto !== false && !ya;
                f.instalacion = { ...cur, descripcion: conTexto ? (a.camara.nombre || cur.descripcion || '') : cur.descripcion || '',
                    ip: conTexto ? (a.camara.ip || cur.ip || null) : cur.ip || null,
                    edificio: cur.edificio || gi.edificio || '', piso: cur.piso || gi.piso || '', asignaciones: [...otras, { grabador: gid, canal: a.canal }] };
            }
            modificarDispositivo(datos, d.id, f, d.version, ctx);
            if (a.tipo === 'liberar') r.liberados++; else if (ya) r.altas++; else r.asignados++;
        } catch (e) { _parsFallo(r.fallos, a.nombre || a.camara.nombre, e); }
    }
    return r;
}
// ==== PARSEADOR PURO END ====

if (typeof document !== 'undefined') {
    const $ = (id) => document.getElementById(id);
    let archivo = null;                 // lo parseado
    let modo = 'datos';                 // 'datos' | 'canales'
    let nombreArchivo = '';
    const opciones = { modo: 'conservar', mapeo: {}, altas: false, tipoAlta: 'camara' };

    function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function fila(clase, ...textos) {
        const f = uiNodo('div', clase);
        textos.forEach(t => f.append(uiNodo('span', 'pars-celda', t)));
        return f;
    }
    function titulo(texto, n) {
        return uiNodo('h6', 'pars-titulo', n === undefined ? texto : `${texto} (${n})`);
    }
    function lista(el, filas, hacer, vacio) {
        if (!filas.length) { if (vacio) el.append(uiNodo('div', 'ajuste-desc', vacio)); return; }
        filas.slice(0, PARS_MAX_FILAS).forEach(f => el.append(hacer(f)));
        if (filas.length > PARS_MAX_FILAS) el.append(uiNodo('div', 'ajuste-desc', `… y ${filas.length - PARS_MAX_FILAS} más`));
    }

    function pintarDatos(cont, plan) {
        cont.append(titulo('Se actualizarían', plan.actualizaciones.length));
        lista(cont, plan.actualizaciones, (a) => fila('pars-fila', a.nombre, a.mac,
            a.campos.map(c => `${c.campo}: ${c.antes || '—'} → ${c.despues}`).join(' · ')), 'Ningún dispositivo del stock cambia.');
        if (plan.omitidas.length) {
            cont.append(titulo('Omitidos', plan.omitidas.length));
            lista(cont, plan.omitidas, (o) => fila('pars-fila pars-aviso', o.nombre, o.motivo));
        }
        cont.append(uiNodo('div', 'ajuste-desc', `${plan.sinCambios} ya estaban al día · ${plan.nuevos} MAC del archivo no están en el stock.`));
    }

    function pintarCanales(cont, plan) {
        cont.append(titulo('Grabadores del archivo'));
        const grabadores = ApiLocal.datos().dispositivos.filter(d => TIPOS_GRABADOR.includes(d.tipo) && d.instalacion);
        for (const g of plan.grabadores) {
            const f = uiNodo('div', 'pars-fila');
            f.append(uiNodo('span', 'pars-celda', `${g.nombre} · ${g.modelo || ''} · ${g.ip || ''} · ${g.camaras} ch`));
            const sel = uiNodo('select', 'form-select form-select-sm pars-select');
            sel.setAttribute('aria-label', `Grabador del stock para ${g.nombre}`);
            const op = (valor, texto) => { const o = uiNodo('option', '', texto); o.value = valor; sel.append(o); };
            op('ignorar', '— Ignorar —');
            if (!g.auto) op('crear', `✚ Dar de alta (${g.canalesN} canales)`);
            grabadores.forEach(x => op(x.id, `${_parsNombre(x)}${x.canales ? ` (${x.canales} ch)` : ''}`));
            sel.value = g.estado === 'crear' ? 'crear' : g.grabadorId || 'ignorar';
            sel.addEventListener('change', () => { opciones.mapeo[g.nombre] = sel.value; repintar(); });
            f.append(sel);
            if (g.motivo) f.append(uiNodo('span', 'pars-celda pars-aviso', g.motivo));
            cont.append(f);
        }
        const asignar = plan.acciones.filter(a => a.tipo === 'asignar');
        const altas = plan.acciones.filter(a => a.tipo === 'alta');
        const liberar = plan.acciones.filter(a => a.tipo === 'liberar');
        cont.append(titulo('Se asignarían a su canal', asignar.length));
        lista(cont, asignar, (a) => fila('pars-fila', `${a.nvr} · CH ${a.canal}`, a.nombre,
            a.cambia.map(c => `${c.campo}: ${c.antes || '—'} → ${c.despues}`).join(' · ')), 'Ninguna.');
        if (altas.length) {
            cont.append(titulo('Se darían de alta', altas.length));
            lista(cont, altas, (a) => fila('pars-fila', `${a.nvr} · CH ${a.canal}`, a.camara.nombre, a.camara.mac || a.camara.serie || ''));
        }
        if (liberar.length) {
            cont.append(titulo('Se liberarían (no están en el archivo)', liberar.length));
            lista(cont, liberar, (a) => fila('pars-fila', `${a.nvr} · CH ${a.canal}`, a.nombre));
        }
        if (plan.conflictos.length) {
            cont.append(titulo('Conflictos (no se aplican)', plan.conflictos.length));
            lista(cont, plan.conflictos, (c) => fila('pars-fila pars-aviso', `${c.nvr || '—'} · CH ${c.canal || '—'}`, c.nombre || c.mac || '', c.motivo));
        }
        cont.append(uiNodo('div', 'ajuste-desc', `${plan.sinCambios} ya estaban en su canal · ${plan.sinMatch.length} cámaras del archivo no están en el stock.`));
    }

    function planActual() {
        const datos = ApiLocal.datos();
        return modo === 'datos' ? parsPlanDatos(datos, archivo) : parsPlanCanales(datos, archivo, opciones);
    }
    function hayQueAplicar(plan) {
        return modo === 'datos' ? plan.actualizaciones.length > 0
            : plan.acciones.length > 0 || plan.grabadores.some(g => g.estado === 'crear');
    }
    function repintar() {
        const cont = $('pars-contenido');
        vaciar(cont);
        $('pars-opciones-canales').classList.toggle('d-none', modo !== 'canales');
        $('pars-archivo-info').textContent = archivo ? `${nombreArchivo}: ${archivo.nvrs.length} grabador(es), ${archivo.camaras.length} cámara(s)` : '';
        $('pars-aplicar').disabled = true;
        if (!archivo) return;
        const plan = planActual();
        (modo === 'datos' ? pintarDatos : pintarCanales)(cont, plan);
        $('pars-aplicar').disabled = !hayQueAplicar(plan);
    }

    async function leer(f) {
        if (!f) return;
        try {
            if (f.size > PARS_MAX_TEXTO) throw new ErrorParseo('el archivo es demasiado grande (máximo 8 MB)');
            archivo = parsearArchivoEscaner(await f.text());
            nombreArchivo = String(f.name || 'archivo').slice(0, 80);
            opciones.mapeo = {};
            repintar();
        } catch (e) {
            archivo = null;
            repintar();
            const m = e instanceof ErrorParseo ? e.message : 'No se pudo leer el archivo.';
            $('pars-archivo-info').textContent = `✗ ${m}`;
            mostrarToast(m, 'error', 5000);
        }
    }

    function aplicar() {
        if (!archivo) return;
        const plan = planActual();
        if (!hayQueAplicar(plan)) return;
        try {
            const r = ApiLocal.importacion((d, ctx) => (modo === 'datos' ? parsAplicarDatos(d, plan, ctx) : parsAplicarCanales(d, plan, ctx)));
            const partes = modo === 'datos' ? [`${r.actualizados} actualizado(s)`]
                : [`${r.asignados} asignado(s)`, r.altas ? `${r.altas} alta(s)` : '', r.grabadoresCreados ? `${r.grabadoresCreados} grabador(es) nuevo(s)` : '',
                    r.liberados ? `${r.liberados} liberado(s)` : ''].filter(Boolean);
            const fallos = r.fallos.length ? ` No se pudieron aplicar ${r.fallos.length}: ${r.fallos.slice(0, 3).map(x => `${x.que} (${x.motivo})`).join('; ')}.` : '';
            mostrarToast(`Importado: ${partes.join(', ')}.${fallos}`, r.fallos.length ? 'warning' : 'success', r.fallos.length ? 10000 : 4000);
            cerrar();
        } catch (e) {
            mostrarToast(e && typeof e.detalle === 'function' ? e.detalle() : 'No se pudo aplicar.', 'error', 6000);
        }
    }

    function abrir(m) {
        modo = m;
        archivo = null;
        opciones.mapeo = {};
        $('pars-titulo-texto').textContent = m === 'datos' ? 'Parseador de datos' : 'Parseador de canales';
        $('pars-ayuda').textContent = m === 'datos'
            ? 'Copia serie, firmware y modelo del archivo a los dispositivos del stock con la misma MAC. Nunca pisa con un valor vacío.'
            : 'Pone cada cámara del archivo en su canal (por MAC o serie): descripción e IP. Un equipo que ya está en otro canal es un conflicto y no se mueve.';
        repintar();
        UI.modal.abrir($('parseadorModal'));
    }
    function cerrar() {
        UI.modal.cerrar($('parseadorModal'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('parseadorModal')) return;
        const abrirFila = (id, m) => {
            const el = $(id);
            if (!el) return;
            const f = () => abrir(m);
            el.addEventListener('click', f);
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } });
        };
        abrirFila('pars-abrir-datos', 'datos');
        abrirFila('pars-abrir-canales', 'canales');
        $('pars-archivo').addEventListener('change', async () => {
            const f = $('pars-archivo').files && $('pars-archivo').files[0];
            $('pars-archivo').value = '';
            await leer(f);
        });
        $('pars-elegir').addEventListener('click', () => $('pars-archivo').click());
        $('pars-aplicar').addEventListener('click', aplicar);
        document.querySelectorAll('input[name="pars-modo"]').forEach(r => r.addEventListener('change', () => {
            opciones.modo = r.value;
            repintar();
        }));
        $('pars-altas').addEventListener('change', () => { opciones.altas = $('pars-altas').checked; repintar(); });
        const tipos = $('pars-tipo-alta');
        tipos.addEventListener('change', () => { opciones.tipoAlta = tipos.value; repintar(); });
        // los tipos de cámara del catálogo, para dar de alta lo que falta
        const llenarTipos = () => {
            const cat = ApiLocal.datos().catalogo;
            const grupos = new Set(cat.grupos.filter(g => g.clave === GRUPO_CAMARAS).map(g => g.clave));
            vaciar(tipos);
            cat.tipos.filter(t => grupos.has(t.grupo)).forEach(t => { const o = uiNodo('option', '', t.etiqueta); o.value = t.clave; tipos.append(o); });
            tipos.value = opciones.tipoAlta;
            if (tipos.value !== opciones.tipoAlta) opciones.tipoAlta = tipos.value;
        };
        llenarTipos();
        document.addEventListener('sgc:datos-cambiados', llenarTipos);
    });
}
