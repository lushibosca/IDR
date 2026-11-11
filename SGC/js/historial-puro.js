'use strict';
// Deshacer y rehacer de los datos de SGC (lógica pura; la usan api-local.js y historial.js). Cada cambio que pasa por ApiLocal
// guarda el estado ANTERIOR en una pila (hasta HISTORIAL_TOPE); deshacer vuelve a él y deja el actual en la pila de rehacer; un
// cambio nuevo vacía lo que se podía rehacer. Vive en memoria (se pierde al recargar, como en SGR y SGI).
//
// Deshacer es un cambio NUEVO, no un viaje en el tiempo: la sincronización con el Gist (gist.js) decide por dispositivo con
// `actualizado` y lápidas, y devolver una copia vieja «tal cual» perdería contra lo que ya se subió o volvería a borrarse. Por eso
// `restaurarEstado` pone los dispositivos devueltos con fecha de ahora y versión mayor, y deja lápida de ahora en los que se van.

// ==== HISTORIAL PURO BEGIN ====
const HISTORIAL_TOPE = 30;

function pilasVacias() {
    return { pasado: [], futuro: [] };
}

/** Un cambio nuevo: se guarda el estado anterior con su etiqueta y lo que se podía rehacer se pierde. */
function pilasEmpujar(pilas, anterior, etiqueta, tope = HISTORIAL_TOPE) {
    return { pasado: [...pilas.pasado, { estado: anterior, etiqueta }].slice(-tope), futuro: [] };
}

/** Deshacer: {pilas, destino, etiqueta} (destino = estado al que se vuelve) o null si no hay nada. `actual` pasa a rehacer. */
function pilasDeshacer(pilas, actual, tope = HISTORIAL_TOPE) {
    if (!pilas.pasado.length) return null;
    const ultimo = pilas.pasado[pilas.pasado.length - 1];
    return { destino: ultimo.estado, etiqueta: ultimo.etiqueta, pilas: {
        pasado: pilas.pasado.slice(0, -1), futuro: [...pilas.futuro, { estado: actual, etiqueta: ultimo.etiqueta }].slice(-tope) } };
}

/** Rehacer: lo mismo al revés. */
function pilasRehacer(pilas, actual, tope = HISTORIAL_TOPE) {
    if (!pilas.futuro.length) return null;
    const ultimo = pilas.futuro[pilas.futuro.length - 1];
    return { destino: ultimo.estado, etiqueta: ultimo.etiqueta, pilas: {
        pasado: [...pilas.pasado, { estado: actual, etiqueta: ultimo.etiqueta }].slice(-tope), futuro: pilas.futuro.slice(0, -1) } };
}

/** Cómo se llama el cambio que hace un pedido a la API local (para «Deshecho: …»). */
function etiquetaDeRuta(metodo, ruta) {
    const m = String(metodo || '').toUpperCase();
    const r = String(ruta || '');
    if (/\/dispositivos\/altas$/.test(r)) return 'Alta en lote';
    if (/\/dispositivos\/lote$/.test(r)) return 'Cambio en lote';
    if (/\/dispositivos(\/[^/]+)?$/.test(r)) return m === 'POST' ? 'Alta de dispositivo' : m === 'DELETE' ? 'Baja de dispositivo' : 'Edición de dispositivo';
    const que = /\/(grupos|tipos)(\/|$)/.exec(r);
    if (que) {
        const nombre = que[1] === 'grupos' ? 'grupo' : 'tipo';
        return `${m === 'POST' ? 'Alta' : m === 'DELETE' ? 'Baja' : 'Cambio'} de ${nombre}`;
    }
    if (/\/edificios$/.test(r)) return 'Alta de edificio';
    if (/\/ubicaciones$/.test(r)) return 'Cambio de edificios y pisos';
    if (/\/modelos$/.test(r)) return 'Página de un modelo';
    return 'Cambio';
}

/**
 * Los datos `destino` como un cambio nuevo sobre `actual`. Todo sale de `destino` salvo el historial de cambios (el registro de lo
 * que pasó se conserva) y las lápidas, que se recalculan: un dispositivo que vuelve pierde su lápida y sale con `actualizado` de
 * ahora y una versión mayor que las dos conocidas (un formulario abierto con la versión vieja da conflicto, como corresponde); uno
 * que se va deja lápida de ahora. Lo que no cambió queda idéntico (con sus fechas).
 */
function restaurarEstado(actual, destino, ahora) {
    const copia = JSON.parse(JSON.stringify(destino));
    const hoy = new Map(actual.dispositivos.map(d => [d.id, d]));
    const queda = new Set(destino.dispositivos.map(d => d.id));
    const lapidas = { ...actual.eliminados.dispositivos };
    const dispositivos = copia.dispositivos.map((d) => {
        const c = hoy.get(d.id);
        if (c && JSON.stringify(c) === JSON.stringify(d)) return c;
        delete lapidas[d.id];
        return { ...d, actualizado: ahora, version: Math.max(d.version, c ? c.version : 0) + 1,
            instalacion: d.instalacion ? { ...d.instalacion, actualizado: ahora } : d.instalacion };
    });
    for (const c of actual.dispositivos) if (!queda.has(c.id)) lapidas[c.id] = ahora;
    return { ...copia, dispositivos, eliminados: { dispositivos: lapidas },
        historial: actual.historial, historial_seq: actual.historial_seq };
}
// ==== HISTORIAL PURO END ====
