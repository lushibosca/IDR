// Resumen del stock: base de la columna «% del total» de los detalles de stock (sobre el total de dispositivos o sobre los
// que están en producción). Se carga después de resumen.js (usa sus globales al llamarse).

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

const SELECTOR_VALORES_PARTICIPACION = '.modal-detalle-tipos .part-valor';
preferencias.alAplicar(CLAVE_PARTICIPACION_STOCK, () => repintarModoDetalles());

function sincronizarParticipacionStock(modoPart) {
    const modo = modoParticipacionStockValido(modoPart);
    sincronizarBotonesModo('[data-part-modo]', 'partModo', modo);
    const etiqueta = etiquetaParticipacionStock(modo);
    for (const modal of document.querySelectorAll('.modal-detalle-tipos')) {
        modal.dataset.stockPart = modo;
    }
    for (const th of document.querySelectorAll('.modal-detalle-tipos thead th:nth-child(6)')) {
        th.textContent = etiqueta;
    }
}

document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-part-modo]') : null;
    if (!b) return;
    const nuevo = modoParticipacionStockValido(b.dataset.partModo);
    const cambia = nuevo !== modoParticipacionStockValido(storage.get(CLAVE_PARTICIPACION_STOCK));
    preferencias.set(CLAVE_PARTICIPACION_STOCK, nuevo);
    if (!cambia || prefiereMovimientoReducido()) { repintarModoDetalles(); return; }
    mutarEnParalelo(() => [...document.querySelectorAll(SELECTOR_VALORES_PARTICIPACION)].filter(valorVisible),
        repintarModoDetalles, crearFantasmaCelda);
});
