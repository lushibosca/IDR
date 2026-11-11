// Stock > «Nuevo dispositivo» > «Lotes»: agrega de una vez varios dispositivos de una compra que están en el depósito. A la
// izquierda lo que tienen en común (tipo, condición, marca, modelo, canales, comentario); a la derecha una lista por campo (MAC,
// serie, patrimonio): la línea N de cada una es el mismo dispositivo. El cambio de modo usa la mutación estándar del modal
// (`cambiarModoAnimado` de stock.js); se carga después de stock.js y lo completa por `window.StockNucleo`. Todo o nada en el
// servidor (POST /api/stock/dispositivos/altas): si una fila falla, no se guarda ninguna y el mensaje nombra las filas.
// ==== STOCK ALTA LOTE PURO BEGIN ====
const STOCK_ALTA_LOTE_MAX = 500;          // lo mismo que acepta el servidor (cctv/stock.py MAX_ALTAS_LOTE)

// Las líneas de un campo, sin espacios y sin las vacías del final (las del medio quedan: mantienen la correspondencia)
function stockLineasLote(texto) {
    const lineas = String(texto ?? '').split(/\r?\n/).map(l => l.trim());
    while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    return lineas;
}

// Una fila por dispositivo: la línea N de la MAC, de la serie y del patrimonio (lo que falta, null)
function stockFilasLote(valores) {
    const l = { mac: stockLineasLote(valores && valores.mac), serie: stockLineasLote(valores && valores.serie),
        patrimonio: stockLineasLote(valores && valores.patrimonio) };
    const n = Math.max(l.mac.length, l.serie.length, l.patrimonio.length);
    return Array.from({ length: n }, (_, i) => ({ mac: l.mac[i] || null, serie: l.serie[i] || null, patrimonio: l.patrimonio[i] || null }));
}

// Número (1-based) de la primera fila sin ningún dato (una línea en blanco entre medio), o 0
function stockFilaLoteVacia(filas) {
    const i = filas.findIndex(f => !f.mac && !f.serie && !f.patrimonio);
    return i + 1;
}

// Qué se ve debajo de las listas: cuántos dispositivos salen y cuántas líneas con datos tiene cada campo
function stockResumenLote(valores) {
    const filas = stockFilasLote(valores);
    const cuentas = {};
    for (const campo of ['mac', 'serie', 'patrimonio']) cuentas[campo] = filas.filter(f => f[campo]).length;
    const n = filas.length;
    const desparejos = Object.entries(cuentas).filter(([, c]) => c > 0 && c < n).map(([campo, c]) => ({ campo, lineas: c }));
    return { filas: n, cuentas, desparejos, excede: n > STOCK_ALTA_LOTE_MAX };
}

// El cuerpo de POST /api/stock/dispositivos/altas
function stockPedidoLote(comunes, filas) {
    const canales = String(comunes.canales === undefined || comunes.canales === null ? '' : comunes.canales).trim();
    return { tipo: comunes.tipo, condicion: comunes.condicion, marca: String(comunes.marca || '').trim(),
        modelo: String(comunes.modelo || '').trim(), comentario: String(comunes.comentario || '').trim(),
        canales: /^\d{1,4}$/.test(canales) ? Number(canales) : null, filas };
}

function stockAltasLoteValida(r) {
    return !!r && Number.isInteger(r.creados) && r.creados >= 0 && Array.isArray(r.ids) && r.ids.every(i => typeof i === 'string');
}
// ==== STOCK ALTA LOTE PURO END ====

(function initStockAltaLote() {
    const $ = (id) => document.getElementById(id);
    const nucleo = window.StockNucleo;
    if (!nucleo || !$('stock-vista-lote')) return;
    const CAMPOS = ['mac', 'serie', 'patrimonio'];
    const areas = () => CAMPOS.map(c => $(`stock-l-${c}`));
    let guardando = false;

    const valoresListas = () => Object.fromEntries(CAMPOS.map(c => [c, $(`stock-l-${c}`).value]));

    // Las tres listas crecen juntas, a la altura de la más larga, y el resumen dice cuántas líneas tiene cada una
    function pintarResumen() {
        uiAutoAltura(areas(), { minFilas: 4, maxPx: 360 });
        const r = stockResumenLote(valoresListas());
        for (const c of CAMPOS) $(`stock-l-${c}-n`).textContent = r.cuentas[c] ? `(${r.cuentas[c]})` : '';
        const resumen = $('stock-l-resumen');
        resumen.className = `small ${r.excede || r.desparejos.length ? 'text-warning-emphasis' : 'text-secondary'}`;
        let texto = r.filas === 0 ? 'Sin dispositivos todavía.'
            : `${r.filas} ${r.filas === 1 ? 'dispositivo' : 'dispositivos'} para agregar.`;
        if (r.excede) texto += ` El máximo por lote es ${STOCK_ALTA_LOTE_MAX}.`;
        else if (r.desparejos.length) {
            texto += ' ' + r.desparejos.map(d => `${{ mac: 'La MAC', serie: 'La serie', patrimonio: 'El patrimonio' }[d.campo]} tiene `
                + `${d.lineas} ${d.lineas === 1 ? 'línea' : 'líneas'}: las que faltan quedan vacías.`).join(' ');
        }
        resumen.textContent = texto;
    }
    for (const a of areas()) a.addEventListener('input', pintarResumen);

    // Modelo: las mismas sugerencias y el mismo «¿Quisiste decir…?» que el alta individual (stockSugerirModelos, de stock.js)
    function sugerirModelos() {
        stockSugerirModelos({ dispositivos: nucleo.estado().datos.dispositivos, marcaEl: $('stock-l-marca'),
            modeloEl: $('stock-l-modelo'), avisoEl: $('stock-l-modelo-aviso'), listaEl: $('stock-dl-modelos') });
    }
    for (const id of ['stock-l-marca', 'stock-l-modelo']) $(id).addEventListener('input', sugerirModelos);

    function poblarSelectores() {
        const origen = nucleo.selectoresDelFormulario();
        $('stock-l-tipo').replaceChildren(...[...origen.tipo.children].map(n => n.cloneNode(true)));
        $('stock-l-condicion').replaceChildren(...[...origen.condicion.children].map(n => n.cloneNode(true)));
        $('stock-l-tipo').value = origen.tipo.value;
        $('stock-l-condicion').value = origen.condicion.value;
        // lo que ya se tipeó en el formulario individual pasa con el cambio de modo
        for (const c of ['marca', 'modelo', 'canales', 'comentario']) $(`stock-l-${c}`).value = $(`stock-f-${c}`).value;
        sugerirModelos();
    }

    function limpiar() {
        for (const id of ['marca', 'modelo', 'canales', 'comentario', ...CAMPOS]) $(`stock-l-${id}`).value = '';
        $('stock-l-modelo-aviso').classList.add('d-none');
        pintarResumen();
    }

    // «Lotes» / «Individual»: solo en el alta de un dispositivo nuevo
    const boton = $('stock-btn-lotes');
    nucleo.altaLote.sincronizarBoton = (modo, esAltaNueva) => {
        boton.classList.toggle('d-none', !esAltaNueva || (modo !== 'edicion' && modo !== 'lote'));
        const enLote = modo === 'lote';
        boton.querySelector('span').textContent = enLote ? 'Individual' : 'Lotes';
        boton.querySelector('i').className = `bi ${enLote ? 'bi-box-seam' : 'bi-collection'} me-1`;
        boton.title = enLote ? 'Volver al alta de un dispositivo'
            : 'Agregar varios dispositivos de una compra de una vez (una lista de MAC, serie y patrimonio)';
    };
    boton.addEventListener('click', () => {
        if (nucleo.modoActual() === 'lote') {
            for (const c of ['marca', 'modelo', 'canales', 'comentario']) $(`stock-f-${c}`).value = $(`stock-l-${c}`).value;
            nucleo.cambiarModoAnimado('edicion');
        } else {
            poblarSelectores();
            nucleo.cambiarModoAnimado('lote');
            requestAnimationFrame(pintarResumen);
        }
    });
    $('stockModal').addEventListener('ui:modal-cerrado', limpiar);

    nucleo.altaLote.guardar = async () => {
        if (guardando) return;
        const filas = stockFilasLote(valoresListas());
        const vacia = stockFilaLoteVacia(filas);
        if (!$('stock-l-tipo').value) { nucleo.mostrarErrorForm('Elegí el tipo de los dispositivos.'); return; }
        if (!filas.length) { nucleo.mostrarErrorForm('Pegá al menos una MAC, serie o patrimonio: una línea por dispositivo.'); return; }
        if (filas.length > STOCK_ALTA_LOTE_MAX) { nucleo.mostrarErrorForm(`El máximo por lote es ${STOCK_ALTA_LOTE_MAX} dispositivos.`); return; }
        if (vacia) { nucleo.mostrarErrorForm(`La línea ${vacia} no tiene MAC, serie ni patrimonio (¿una línea en blanco de más?).`); return; }
        guardando = true;
        const guardar = $('stock-form-guardar');
        guardar.disabled = true;
        uiBotonOcupado(guardar, true, { libre: 'Guardar', enCurso: 'Guardando...', icono: 'bi bi-check-lg' });
        nucleo.mostrarErrorForm('');
        try {
            const comunes = Object.fromEntries(['tipo', 'condicion', 'marca', 'modelo', 'canales', 'comentario']
                .map(c => [c, $(`stock-l-${c}`).value]));
            const r = await apiFetchValidado('/api/stock/dispositivos/altas', stockAltasLoteValida,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stockPedidoLote(comunes, filas)),
                    mensaje: 'La respuesta del servidor no tiene el formato esperado.' });
            await nucleo.despuesDeEscribir(`Se agregaron ${r.creados} ${r.creados === 1 ? 'dispositivo' : 'dispositivos'} al stock.`);
        } catch (e) {
            uiErrorConsulta(e, nucleo.mostrarErrorForm, 'No se pudo guardar el lote.');
        } finally {
            guardando = false;
            guardar.disabled = false;
            uiBotonOcupado(guardar, false, { libre: 'Guardar', icono: 'bi bi-check-lg' });
        }
    };
    pintarResumen();
})();
