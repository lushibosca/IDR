// Resumen del stock: lógica pura del modal de detalle (base de «% del total», agrupamiento, orden y columnas visibles).
// Se carga después de resumen.js y antes de resumen-detalle.js.

// ==== PARTICIPACION STOCK PURO BEGIN ====
// Base de la columna «% del total» en los detalles de stock: sobre el total de dispositivos ('total') o sobre los
// dispositivos en producción / en uso ('uso').
const MODOS_PARTICIPACION_STOCK = new Set(['total', 'uso']);
const CLAVE_PARTICIPACION_STOCK = 'cctv:stock_participacion';

function modoParticipacionStockValido(modo) {
    return MODOS_PARTICIPACION_STOCK.has(modo) ? modo : 'total';
}

function participacionStock(c, baseTotal, totalUso, modoPart) {
    if (modoParticipacionStockValido(modoPart) === 'uso') {
        return { parte: c ? Number(c.u) || 0 : 0, base: totalUso };
    }
    return { parte: c ? Number(c.t) || 0 : 0, base: baseTotal };
}

function etiquetaParticipacionStock(modoPart) {
    return modoParticipacionStockValido(modoPart) === 'uso' ? '% de producción' : '% del total';
}
// ==== PARTICIPACION STOCK PURO END ====

// ==== DETALLE STOCK PURO BEGIN ====
const CLAVE_AGRUPAR_STOCK = 'cctv:stock_agrupar';
const AGRUPAMIENTOS_DETALLE_STOCK = new Map([
    ['tipo', 'Tipo / Modelo'],
    ['edificio', 'Edificio'],
    ['edificio-piso', 'Edificio / Piso'],
    ['patrimonio', 'Patrimonio'],
]);
const ETIQUETAS_COLUMNA_DETALLE_STOCK = new Map([
    ['tipo', 'Tipo / Modelo'],
    ['edificio', 'Edificio / Modelo'],
    ['edificio-piso', 'Edificio / Piso'],
    ['patrimonio', 'Patrimonio / Modelo'],
]);
const RESUMEN_FIN = '\uffff';

function agrupamientoDetalleStockValido(criterio) {
    return AGRUPAMIENTOS_DETALLE_STOCK.has(criterio) ? criterio : 'tipo';
}

function etiquetaColumnaDetalleStock(criterio) {
    return ETIQUETAS_COLUMNA_DETALLE_STOCK.get(agrupamientoDetalleStockValido(criterio)) || 'Tipo / Modelo';
}

// Agrupa los dispositivos de un modal de detalle según `criterio` -> Map clave -> { c, orden, pesoPiso, modelos }
function agruparDetalleStock(dispositivos, etiquetasTipo, criterio = 'tipo',
    pesoPisoDe = (typeof stockPisoPeso === 'function' ? stockPisoPeso : null)) {
    const crit = agrupamientoDetalleStockValido(criterio);
    const etiqueta = (clave) => (etiquetasTipo && etiquetasTipo.get(clave)) || clave || 'Sin tipo';
    const grupos = new Map();
    for (const d of Array.isArray(dispositivos) ? dispositivos : []) {
        if (!d) continue;
        const tipo = etiqueta(d.tipo);
        const modelo = d.modelo || RESUMEN_SIN_MODELO;
        let clave;
        let orden;
        let pesoPiso = 0;
        if (crit === 'edificio') {
            if (!d.instalacion) {
                clave = 'Sin instalar';
                orden = `${RESUMEN_FIN}2`;
            } else {
                const ed = String(d.instalacion.edificio || '').trim();
                clave = ed || 'Instalado, sin edificio';
                orden = ed ? ed : `${RESUMEN_FIN}1`;
            }
        } else if (crit === 'edificio-piso') {
            if (!d.instalacion) {
                clave = 'Sin instalar';
                orden = `${RESUMEN_FIN}3`;
            } else {
                const ed = String(d.instalacion.edificio || '').trim();
                const piso = String(d.instalacion.piso || '').trim();
                pesoPiso = pesoPisoDe ? pesoPisoDe(piso) : 0;
                if (ed && piso) { clave = `${ed} · piso ${piso}`; orden = ed; }
                else if (ed) { clave = `${ed} · Sin piso`; orden = ed; }
                else if (piso) { clave = `Sin edificio · piso ${piso}`; orden = `${RESUMEN_FIN}1`; }
                else { clave = 'Instalado, sin ubicación'; orden = `${RESUMEN_FIN}2`; }
            }
        } else if (crit === 'patrimonio') {
            const tiene = Boolean(String(d.patrimonio || '').trim());
            clave = tiene ? 'Con patrimonio' : 'Sin patrimonio';
            orden = tiene ? '0' : '1';
        } else {
            clave = tipo;
            orden = tipo;
        }
        if (!grupos.has(clave)) grupos.set(clave, { c: resumenContador(), orden, pesoPiso, modelos: new Map() });
        const g = grupos.get(clave);
        resumenSumar(g.c, d);
        const subClave = crit === 'tipo' ? modelo : `${tipo}\u0000${modelo}`;
        if (!g.modelos.has(subClave)) {
            g.modelos.set(subClave, { ...resumenContador(), tipo: crit === 'tipo' ? '' : tipo, modelo });
        }
        resumenSumar(g.modelos.get(subClave), d);
    }
    return grupos;
}

const CLAVE_ORDEN_STOCK = 'cctv:stock_orden';
const CLAVE_COLS_OCULTAS_STOCK = 'cctv:stock_columnas_ocultas';
const COLUMNAS_DETALLE_STOCK = [
    { id: 'total', etiqueta: 'Total' },
    { id: 'uso', etiqueta: 'En uso' },
    { id: 'libres', etiqueta: 'Disponibles' },
    { id: 'fuera', etiqueta: 'No disponible' },
    { id: 'part', etiqueta: '% del total' },
];
const IDS_COLUMNAS_DETALLE_STOCK = COLUMNAS_DETALLE_STOCK.map(c => c.id);

function ordenDetalleStockValido(valor) {
    if (typeof valor !== 'string' || !valor) return ['', ''];
    const [col, dir, extra] = valor.split(':');
    if (extra !== undefined || !IDS_COLUMNAS_DETALLE_STOCK.includes(col) || (dir !== 'asc' && dir !== 'desc')) return ['', ''];
    return [col, dir];
}

// Clic en columna ordenable: sin orden -> asc -> desc -> sin orden (natural)
function siguienteOrdenDetalleStock(actual, columna) {
    if (!IDS_COLUMNAS_DETALLE_STOCK.includes(columna)) return '';
    const [col, dir] = ordenDetalleStockValido(actual);
    const [sigCol, sigDir] = uiSiguienteOrden(col || null, dir || 'asc', columna, IDS_COLUMNAS_DETALLE_STOCK);
    return sigCol ? `${sigCol}:${sigDir}` : '';
}

function valorOrdenDetalleStock(c, columna, modo, modoPart) {
    if (!c) return 0;
    if (columna === 'total') return Number(c.t) || 0;
    const pct = modoCapacidadValido(modo) === 'pct';
    if (columna === 'uso') return pct ? (c.t > 0 ? c.u / c.t : -1) : (Number(c.u) || 0);
    if (columna === 'libres') return pct ? (c.t > 0 ? c.d / c.t : -1) : (Number(c.d) || 0);
    if (columna === 'fuera') return pct ? (c.t > 0 ? c.o / c.t : -1) : (Number(c.o) || 0);
    if (columna === 'part') return modoParticipacionStockValido(modoPart) === 'uso' ? (Number(c.u) || 0) : (Number(c.t) || 0);
    return 0;
}
// ==== DETALLE STOCK PURO END ====
