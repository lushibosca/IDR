'use strict';
// Migración desde idr/SGC: el JSON que exporta SGC (o el archivo de su Gist, que tiene la misma forma) pasa al modelo de
// SGC-2. Es un ENSAYO primero: la vista previa cuenta qué entra, qué se corrigió y qué no encontró lugar; recién
// «Aplicar» escribe. Es la versión JS de cctv/stock_sgc.py, con el modelo nuevo (la instalación guarda grabador y canal):
//   · dispositivos[]               → dispositivos (estado '' → operativo; la forma de la cámara pasa a ser su tipo)
//   · grabadores[]                 → el dispositivo del grabador queda instalado (con su ubicación); canales_data[] con
//                                    dispositivoId → instalación {grabador, canal, descripcion, ip...}
//   · otros_prod[]                 → instalación sin grabador
//   · canales con datos y SIN equipo → no tienen dónde ir: se listan en el informe
// Nada se pierde sin avisar: MAC secundarias y valores repetidos pasan al comentario y al informe. Solo textContent.

// ==== MIGRAR SGC PURO BEGIN ====
const MIG_MAX_TEXTO = 8 * 1024 * 1024;
const MIG_FORMAS = { domo: 'domo', bullet: 'bullet', turret: 'turret', minidomo: 'minidomo', minibullet: 'minibullet', 'domo-ptz': 'domo_ptz' };
const MIG_TIPOS_RETIRADOS = { software: 'otro' };
const MIG_MAX_LISTA = 200;

class ErrorMigracion extends Error {}

const _migTs = (v) => {
    if (typeof v !== 'string' || !v) return null;
    const t = new Date(v);
    return Number.isFinite(t.getTime()) ? t.toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
};
const _migObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const _migLista = (v) => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : []);

/** La suma de integridad de SGC (`generarFirma` de idr/SGC/app.js): detecta un archivo dañado o editado a mano. */
async function migFirmaSgc(obj, cripto = globalThis.crypto) {
    const o = (v) => (v ? v : null);
    const nucleo = {
        d: _migLista(obj.dispositivos).map(x => [x.id, x.tipo, o(x.estado), o(x.mac), o(x.serial), o(x.canales), o(x.marca),
            o(x.modelo), o(x.patrimonio), o(x.firmware), o(x.forma), o(x.comentario)]),
        g: _migLista(obj.grabadores).map(x => [x.id, o(x.dispositivoId), x.canales_n || 16, o(x.descripcion), o(x.tipo), o(x.marca),
            o(x.modelo), o(x.ip), o(x.edificio), o(x.piso), o(x.rack), o(x.puerto), o(x.mac), o(x.comentarios),
            _migLista(x.canales_data).map(c => [c.canal, o(c.dispositivoId), o(c.descripcion), o(c.ip), o(c.puerto), o(c.edificio),
                o(c.piso), o(c.rack), o(c.comentarios)])]),
        op: _migLista(obj.otros_prod).map(x => [x.id, o(x.dispositivoId), o(x.descripcion), o(x.ip), o(x.puerto), o(x.edificio),
            o(x.piso), o(x.rack), o(x.comentarios)]),
        t: obj.tiposCustom || {},
        e: obj.edificios || []
    };
    const hash = await cripto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(nucleo)));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** 'ok' | 'alterada' | 'sin_firma'. */
async function migEstadoFirma(obj, cripto = globalThis.crypto) {
    if (!obj || typeof obj.hash !== 'string' || !obj.hash) return 'sin_firma';
    try { return obj.hash === await migFirmaSgc(obj, cripto) ? 'ok' : 'alterada'; } catch (e) { return 'sin_firma'; }
}

/** El texto del archivo de SGC, ya parseado (JSON acotado). Lanza ErrorMigracion si no es una exportación de SGC. */
function migLeer(texto) {
    if (typeof texto !== 'string' || !texto.trim()) throw new ErrorMigracion('el archivo está vacío');
    if (texto.length > MIG_MAX_TEXTO) throw new ErrorMigracion('el archivo es demasiado grande (máximo 8 MB)');
    let bruto;
    try { bruto = JSON.parse(texto, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v)); }
    catch (e) { throw new ErrorMigracion('el archivo no es un JSON válido'); }
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto) || !Array.isArray(bruto.dispositivos)) {
        throw new ErrorMigracion('no es una exportación de SGC (falta la lista «dispositivos»)');
    }
    if (bruto.formato === FORMATO_DATOS) throw new ErrorMigracion('este archivo ya es de SGC-2: usá Importar en Datos');
    return bruto;
}

function _migInstalacion(fuente, donde, avisos) {
    const ipTxt = textoAcotado(fuente.ip, 45);
    const ip = ipTxt ? ipLiteralValida(ipTxt) : null;
    if (ipTxt && ip === null) avisos.push(`${donde}: IP no válida (${ipTxt}); se omite`);
    let comentario = textoAcotado(fuente.comentarios, LARGOS_STOCK.comentario);
    const puerto = textoAcotado(fuente.puerto, 40);
    let puertoOk = '';
    if (puerto) {
        if (RE_PUERTO.test(puerto)) puertoOk = puerto;
        else {
            avisos.push(`${donde}: el puerto «${puerto}» no tiene el formato 3/0/21 o Fa0/1; pasa al comentario`);
            comentario = textoAcotado(`${comentario}${comentario ? ' · ' : ''}puerto: ${puerto}`, LARGOS_STOCK.comentario);
        }
    }
    return { descripcion: textoAcotado(fuente.descripcion, LARGOS_STOCK.descripcion), ip, edificio: espacios(textoAcotado(fuente.edificio, LARGOS_STOCK.edificio)),
        piso: normalizarPiso(fuente.piso), rack: textoAcotado(fuente.rack, LARGOS_STOCK.rack), puerto: puertoOk, comentario,
        asignaciones: [] };
}
/** Un mismo equipo en varios lugares: cada campo vacío se completa; si dos lugares dicen cosas distintas gana el primero. */
function _migFusionar(actual, nueva, nombre, donde, avisos) {
    for (const campo of ['descripcion', 'ip', 'edificio', 'piso', 'rack', 'puerto', 'comentario']) {
        const a = actual[campo], b = nueva[campo];
        if (!b || a === b) continue;
        if (!a) actual[campo] = b;
        else avisos.push(`${nombre}: «${campo}» distinto en ${donde} («${b}»); se conserva «${a}»`);
    }
}

/**
 * Convierte la exportación de SGC. Devuelve {datos (ya saneados, formato SGC-2), avisos, informe}. `nuevoId()` da los ids
 * de los grabadores que SGC no tenía como dispositivo. Pura: no toca almacenamiento.
 */
function migrarDesdeSgc(bruto, { ahora, nuevoId }) {
    const avisos = [];
    const informe = { dispositivos: 0, grabadoresVinculados: 0, grabadoresCreados: 0, canalesAsignados: 0, otrosEnProduccion: 0,
        enDeposito: 0, canalesSinEquipo: [], canalesSinEquipoTotal: 0 };
    const raw = datosVacios();
    const tipos = new Map(raw.catalogo.tipos.map(t => [t.clave, t]));
    for (const [k, v] of Object.entries(_migObj(bruto.tiposCustom))) {
        const clave = claveValida(k);
        if (!clave || tipos.has(clave) || clave in MIG_TIPOS_RETIRADOS) continue;
        const etiqueta = espacios(textoAcotado(_migObj(v).label, LARGOS_STOCK.etiqueta)) || clave;
        tipos.set(clave, { clave, etiqueta, grupo: GRUPO_POR_DEFECTO, sistema: false });
    }
    const edificios = new Set((Array.isArray(bruto.edificios) ? bruto.edificios : []).map(e => espacios(textoAcotado(e, LARGOS_STOCK.edificio))).filter(Boolean));

    // ---- dispositivos
    const disp = new Map();
    const orden = [];
    for (const x of _migLista(bruto.dispositivos)) {
        const id = idValido(x.id);
        if (!id || disp.has(id)) { avisos.push(`dispositivo con id inválido o repetido (${textoAcotado(x.id, 40) || 'sin id'}): se omite`); continue; }
        let tipo = claveValida(x.tipo) || 'otro';
        tipo = MIG_TIPOS_RETIRADOS[tipo] || tipo;
        const forma = textoAcotado(x.forma, 20).toLowerCase().replace(/\s+/g, '-');
        if (forma && tipo === 'camara' && MIG_FORMAS[forma]) tipo = MIG_FORMAS[forma];
        else if (forma && tipo !== 'camara') avisos.push(`${id}: la forma «${forma}» no corresponde a «${tipo}»; se omite`);
        if (!tipos.has(tipo)) tipos.set(tipo, { clave: tipo, etiqueta: tipo, grupo: GRUPO_POR_DEFECTO, sistema: false });
        const estado = textoAcotado(x.estado, 20).toLowerCase();
        let condicion = estado || CONDICION_PRODUCCION;
        if (!CONDICIONES_STOCK.includes(condicion)) { avisos.push(`${id}: estado desconocido «${estado}»; queda «revisar»`); condicion = 'revisar'; }
        // SGC permitía varias MAC en un equipo; el stock una sola: la primera queda y el resto pasa al comentario
        let comentario = textoAcotado(x.comentario, LARGOS_STOCK.comentario);
        const macs = textoAcotado(x.mac, 500).split(/[,;\s]+/).filter(Boolean);
        let mac = null;
        macs.forEach((m, i) => {
            const n = macNormalizada(m);
            if (i === 0 && n) mac = n;
            else {
                avisos.push(`${id}: ${i === 0 ? 'MAC no válida' : 'MAC adicional'} «${m}»; pasa al comentario`);
                comentario = textoAcotado(`${comentario}${comentario ? ' · ' : ''}MAC: ${m}`, LARGOS_STOCK.comentario);
            }
        });
        const d = {
            id, tipo, condicion, marca: normalizarMarca(x.marca), modelo: textoAcotado(x.modelo, LARGOS_STOCK.modelo),
            serie: _opcional(x.serial, 'serie', NULOS_SERIE), mac, patrimonio: _opcional(x.patrimonio, 'patrimonio', NULOS_PATRIMONIO),
            firmware: _opcional(x.firmware, 'firmware'),
            canales: TIPOS_GRABADOR.includes(tipo) ? enteroAcotado(x.canales, 1, CANALES_MAX) : null,
            comentario, instalacion: null, creado: _migTs(x.updatedAt) || ahora, actualizado: _migTs(x.updatedAt) || ahora, version: 1
        };
        disp.set(id, d);
        orden.push(d);
    }
    // serie / MAC / patrimonio únicos: el primero se queda con el dato; el valor repetido pasa al comentario
    const vistos = { serie: new Map(), mac: new Map(), patrimonio: new Map() };
    for (const d of orden) {
        for (const campo of ['serie', 'mac', 'patrimonio']) {
            if (d[campo] === null) continue;
            const clave = d[campo].toLowerCase();
            if (vistos[campo].has(clave)) {
                avisos.push(`${d.id}: ${campo} «${d[campo]}» repetida (ya la tiene ${vistos[campo].get(clave)}); pasa al comentario`);
                d.comentario = textoAcotado(`${d.comentario}${d.comentario ? ' · ' : ''}${campo}: ${d[campo]}`, LARGOS_STOCK.comentario);
                d[campo] = null;
            } else vistos[campo].set(clave, d.id);
        }
    }

    // ---- grabadores: cada uno tiene que ser un dispositivo NVR/DVR del stock
    const grabadores = _migLista(bruto.grabadores);
    const idGrab = new Map();                              // id del grabador de SGC -> id del dispositivo
    const nombreGrab = new Map();
    for (const g of grabadores) {
        const nombre = textoAcotado(g.descripcion, 80) || textoAcotado(g.id, 40) || 'grabador';
        let did = idValido(g.dispositivoId);
        let dev = did ? disp.get(did) : null;
        if (did && !dev) { avisos.push(`grabador «${nombre}»: su dispositivo ${did} no está en el stock`); did = null; }
        const macG = macNormalizada(textoAcotado(g.mac, 500).split(/[,;\s]+/)[0]);
        if (!dev && macG) {
            dev = orden.find(d => d.mac === macG && TIPOS_GRABADOR.includes(d.tipo)) || null;
            if (dev) avisos.push(`grabador «${nombre}»: sin dispositivo asignado; se vinculó al que tiene su MAC`);
        }
        const tipoG = TIPOS_GRABADOR.includes(g.tipo) ? g.tipo : 'nvr';
        const canalesN = enteroAcotado(g.canales_n ?? g.canales, 1, CANALES_MAX) || 16;
        if (dev) {
            informe.grabadoresVinculados++;
            if (!TIPOS_GRABADOR.includes(dev.tipo)) {
                avisos.push(`grabador «${nombre}»: su dispositivo era «${dev.tipo}»; pasa a «${tipoG}»`);
                dev.tipo = tipoG;
            }
            dev.canales = Math.max(dev.canales || 0, canalesN);
        } else {
            let id = idValido(g.id);
            if (!id || disp.has(id)) id = nuevoId();
            const mac = macG && !vistos.mac.has(macG) ? macG : null;
            if (mac) vistos.mac.set(mac, id);
            dev = { id, tipo: tipoG, condicion: CONDICION_PRODUCCION, marca: normalizarMarca(g.marca), modelo: textoAcotado(g.modelo, LARGOS_STOCK.modelo),
                serie: null, mac, patrimonio: null, firmware: null, canales: canalesN, comentario: '', instalacion: null,
                creado: _migTs(g.updatedAt) || ahora, actualizado: _migTs(g.updatedAt) || ahora, version: 1 };
            disp.set(id, dev);
            orden.push(dev);
            informe.grabadoresCreados++;
            avisos.push(`grabador «${nombre}»: no tenía dispositivo; se creó uno (${tipoG})`);
        }
        idGrab.set(g.id, dev.id);
        nombreGrab.set(g.id, nombre);
        if (_migTs(g.updatedAt) && _migTs(g.updatedAt) > dev.actualizado) dev.actualizado = _migTs(g.updatedAt);
    }

    // ---- instalaciones: grabadores, «otros en producción» y canales (ese orden de prioridad)
    const inst = new Map();
    const ocupados = new Map();                            // «grabador#canal» -> dispositivo
    const poner = (did, nueva, nombre, donde) => {
        const dev = disp.get(did);
        if (!dev) { avisos.push(`${donde}: referencia al dispositivo ${did}, que no está en el stock; se omite`); return null; }
        if (inst.has(did)) _migFusionar(inst.get(did), nueva, nombre, donde, avisos);
        else inst.set(did, nueva);
        return inst.get(did);
    };
    for (const g of grabadores) {
        const did = idGrab.get(g.id);
        const donde = `grabador «${nombreGrab.get(g.id)}»`;
        poner(did, _migInstalacion({ ...g, comentarios: g.comentarios }, donde, avisos), disp.get(did).modelo || did, donde);
    }
    for (const o of _migLista(bruto.otros_prod)) {
        const did = idValido(o.dispositivoId);
        const donde = `otro en producción «${textoAcotado(o.descripcion, 80)}»`;
        if (!did) { avisos.push(`${donde}: sin equipo asignado; se omite`); continue; }
        if (poner(did, _migInstalacion(o, donde, avisos), did, donde)) informe.otrosEnProduccion++;
    }
    for (const g of grabadores) {
        const gid = idGrab.get(g.id);
        const nombre = nombreGrab.get(g.id);
        for (const c of _migLista(g.canales_data)) {
            const canal = enteroAcotado(c.canal, 1, CANALES_MAX);
            const did = idValido(c.dispositivoId);
            const donde = `${nombre} canal ${canal || '?'}`;
            if (!did) {
                if (canal && (textoAcotado(c.descripcion, 80) || textoAcotado(c.ip, 45))) {
                    informe.canalesSinEquipoTotal++;
                    if (informe.canalesSinEquipo.length < MIG_MAX_LISTA) {
                        informe.canalesSinEquipo.push({ grabador: nombre, canal, descripcion: textoAcotado(c.descripcion, 80), ip: textoAcotado(c.ip, 45) });
                    }
                }
                continue;
            }
            const i = poner(did, _migInstalacion(c, donde, avisos), did, donde);
            if (!i) continue;
            if (!canal) { avisos.push(`${donde}: canal no válido; queda sin canal`); continue; }
            if (did === gid || TIPOS_GRABADOR.includes(disp.get(did).tipo)) { avisos.push(`${donde}: un grabador no va en el canal de otro; queda sin canal`); continue; }
            if (i.asignaciones.some(x => x.grabador === gid)) {
                avisos.push(`${disp.get(did).modelo || did} está en dos canales del mismo grabador (${donde} y otro); se conserva el primero`);
                continue;
            }
            const clave = `${gid}#${canal}`;
            if (ocupados.has(clave)) { avisos.push(`${donde}: el canal ya lo ocupa ${ocupados.get(clave)}; ${did} queda sin canal`); continue; }
            ocupados.set(clave, disp.get(did).modelo || did);
            i.asignaciones.push({ grabador: gid, canal });
            informe.canalesAsignados++;
        }
    }
    for (const [did, i] of inst) {
        const d = disp.get(did);
        d.instalacion = { ...i, actualizado: d.actualizado };
        if (i.edificio) edificios.add(i.edificio);
    }
    informe.enDeposito = orden.filter(d => !d.instalacion).length;
    informe.dispositivos = orden.length;

    raw.catalogo.tipos = [...tipos.values()];
    raw.edificios = [...edificios];
    raw.dispositivos = orden;
    const lapidas = _migObj(_migObj(bruto.eliminados).dispositivos);
    for (const [id, cuando] of Object.entries(lapidas)) {
        if (idValido(id) && !disp.has(id) && _migTs(cuando)) raw.eliminados.dispositivos[id] = _migTs(cuando);
    }
    raw.historial = [{ n: 1, cuando: ahora, origen: 'migracion', objeto: 'catalogo', clave: 'migracion_sgc', dispositivo_id: null,
        campo: 'migración desde SGC', antes: null, despues: `${informe.dispositivos} dispositivos`, usuario: null }];
    const r = sanearDatos(raw, ahora);
    return { datos: r.datos, avisos: [...avisos, ...r.avisos], informe };
}
// ==== MIGRAR SGC PURO END ====

if (typeof document !== 'undefined') {
    const $ = (id) => document.getElementById(id);
    let bruto = null;
    let firma = 'sin_firma';
    let resultado = null;
    let nombreArchivo = '';

    const ahoraZ = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nuevoIdMig = () => {
        const b = new Uint8Array(10);
        crypto.getRandomValues(b);
        return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    };
    function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function lista(el, filas, hacer) {
        filas.slice(0, MIG_MAX_LISTA).forEach(f => el.append(hacer(f)));
        if (filas.length > MIG_MAX_LISTA) el.append(uiNodo('div', 'ajuste-desc', `… y ${filas.length - MIG_MAX_LISTA} más`));
    }
    const unir = () => {
        const r = document.querySelector('input[name="mig-modo"]:checked');
        return !r || r.value === 'unir';
    };

    function repintar() {
        const cont = $('mig-contenido');
        vaciar(cont);
        $('mig-aplicar').disabled = true;
        $('mig-opciones').classList.toggle('d-none', !bruto);
        $('mig-archivo-info').textContent = bruto ? `${nombreArchivo}: ${bruto.dispositivos.length} dispositivo(s)` : '';
        if (!bruto) return;
        resultado = migrarDesdeSgc(bruto, { ahora: ahoraZ(), nuevoId: nuevoIdMig });
        const i = resultado.informe;
        const filaTexto = (t, clase = 'pars-fila') => cont.append(uiNodo('div', clase, t));
        cont.append(uiNodo('h6', 'pars-titulo', 'Qué entra'));
        filaTexto(`${i.dispositivos} dispositivo(s): ${i.dispositivos - i.enDeposito} instalados, ${i.enDeposito} en depósito.`);
        filaTexto(`${i.grabadoresVinculados} grabador(es) vinculados a su dispositivo, ${i.grabadoresCreados} creados; ${i.canalesAsignados} cámara(s) asignadas a un canal; ${i.otrosEnProduccion} «otros en producción».`);
        const alterada = firma === 'alterada';
        filaTexto(firma === 'ok' ? 'La firma de integridad del archivo coincide.' : alterada
            ? 'La firma del archivo NO coincide: se editó fuera de SGC o está dañado.' : 'El archivo no trae firma de integridad.',
        alterada ? 'pars-fila pars-aviso' : 'pars-fila');
        if (i.canalesSinEquipoTotal) {
            cont.append(uiNodo('h6', 'pars-titulo', `Canales con datos pero sin equipo (${i.canalesSinEquipoTotal}): no se migran`));
            lista(cont, i.canalesSinEquipo, (c) => uiNodo('div', 'pars-fila', `${c.grabador} · CH ${c.canal}: ${c.descripcion || '—'}${c.ip ? ` · ${c.ip}` : ''}`));
        }
        if (resultado.avisos.length) {
            cont.append(uiNodo('h6', 'pars-titulo', `Avisos (${resultado.avisos.length})`));
            lista(cont, resultado.avisos, (a) => uiNodo('div', 'pars-fila pars-aviso', a));
        }
        const hay = ApiLocal.datos().dispositivos.length;
        $('mig-aviso-actual').textContent = hay
            ? (unir() ? `Hay ${hay} dispositivo(s) en este navegador: se unen (por equipo gana la edición más reciente).`
                : `Hay ${hay} dispositivo(s) en este navegador: se REEMPLAZAN. Exportalos antes si hace falta.`) : '';
        $('mig-aplicar').disabled = !i.dispositivos || (alterada && !$('mig-alterada').checked);
        $('mig-alterada-fila').classList.toggle('d-none', !alterada);
    }

    async function leer(f) {
        if (!f) return;
        try {
            if (f.size > MIG_MAX_TEXTO) throw new ErrorMigracion('el archivo es demasiado grande (máximo 8 MB)');
            bruto = migLeer(await f.text());
            firma = await migEstadoFirma(bruto);
            nombreArchivo = String(f.name || 'archivo').slice(0, 80);
            $('mig-alterada').checked = false;
            repintar();
        } catch (e) {
            bruto = null;
            repintar();
            const m = e instanceof ErrorMigracion ? e.message : 'No se pudo leer el archivo.';
            $('mig-archivo-info').textContent = `✗ ${m}`;
            mostrarToast(m, 'error', 5000);
        }
    }
    function aplicar() {
        if (!bruto || !resultado) return;
        try {
            const local = ApiLocal.datos();
            if (unir() && local.dispositivos.length) ApiLocal.reemplazar(gistFusionar(local, resultado.datos, sanearDatos, ahoraZ()).datos);
            else ApiLocal.reemplazarTodo(resultado.datos);
            mostrarToast(`Migración aplicada: ${resultado.informe.dispositivos} dispositivo(s) de SGC.`, 'success', 5000);
            UI.modal.cerrar($('migrarModal'));
        } catch (e) {
            mostrarToast(e && typeof e.detalle === 'function' ? e.detalle() : 'No se pudo aplicar la migración.', 'error', 6000);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('migrarModal')) return;
        const abrir = () => { bruto = null; resultado = null; repintar(); UI.modal.abrir($('migrarModal')); };
        const fila = $('mig-abrir');
        fila.addEventListener('click', abrir);
        fila.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
        $('mig-elegir').addEventListener('click', () => $('mig-archivo').click());
        $('mig-archivo').addEventListener('change', async () => {
            const f = $('mig-archivo').files && $('mig-archivo').files[0];
            $('mig-archivo').value = '';
            await leer(f);
        });
        document.querySelectorAll('input[name="mig-modo"]').forEach(r => r.addEventListener('change', repintar));
        $('mig-alterada').addEventListener('change', repintar);
        $('mig-aplicar').addEventListener('click', aplicar);
    });
}
