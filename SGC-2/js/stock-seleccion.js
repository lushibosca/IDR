// Stock > modo selección de Activos (popup del dispositivo > «Seleccionar»): se marcan dispositivos (clic en la fila o la
// tarjeta; lo marcado se ve por el color) y la barra de abajo («N seleccionados») ofrece «Cambiar datos»: tipo, condición, edificio,
// piso y rack a todos a la vez, con un solo botón: «Revisar» (qué cambia y qué se omite y por qué) y, ya revisado, «Aplicar» (cambiar un campo lo vuelve a «Revisar»). Se carga después de
// stock.js y lo completa por `window.StockNucleo` (estado de la última carga, `visibles`, `cargar`, `toast`, `modal` y los
// ganchos de `seleccion`); la lógica pura está en el bloque STOCK SELECCION PURO.
// ==== STOCK SELECCION PURO BEGIN ====
const STOCK_LOTE_CAMPOS = ['tipo', 'condicion', 'edificio', 'piso', 'rack'];

// Lo que se cambia: solo los campos elegidos (los vacíos quedan en «No cambiar»), sin espacios de más
function stockLoteCambios(valores) {
    const cambios = Object.create(null);
    for (const campo of STOCK_LOTE_CAMPOS) {
        const v = valores && typeof valores[campo] === 'string' ? valores[campo].trim() : '';
        if (v) cambios[campo] = v;
    }
    return cambios;
}

// El cuerpo de POST /api/stock/dispositivos/lote: cada seleccionado con la versión que se conoce (409 por dispositivo si cambió)
function stockLotePedido(ids, porId, cambios, aplicar) {
    const dispositivos = [];
    for (const id of ids) {
        const guardado = porId.get(id);
        if (guardado) dispositivos.push({ id, version: guardado.version });
    }
    return { dispositivos, cambios, aplicar: Boolean(aplicar) };
}

// La respuesta debe tener la forma de LoteResultado (cctv/web/schemas.py)
function stockLoteValido(res) {
    const item = (x) => !!x && typeof x.dispositivo_id === 'string' && typeof x.descripcion === 'string';
    return !!res && typeof res.aplicado === 'boolean'
        && Array.isArray(res.actualizados) && res.actualizados.every(x => item(x) && Number.isInteger(x.cambios))
        && Array.isArray(res.omitidos) && res.omitidos.every(x => item(x) && typeof x.motivo === 'string');
}

// «3 se actualizan (1 sale de producción) · 2 se omiten»
function stockLoteResumen(res) {
    const n = res.actualizados.length;
    const salen = res.actualizados.filter(x => x.sale_de_produccion).length;
    const partes = [`${n} ${n === 1 ? 'se actualiza' : 'se actualizan'}`
        + (salen ? ` (${salen} ${salen === 1 ? 'sale' : 'salen'} de producción)` : '')];
    if (res.omitidos.length) partes.push(`${res.omitidos.length} ${res.omitidos.length === 1 ? 'se omite' : 'se omiten'}`);
    return partes.join(' · ');
}
// ==== STOCK SELECCION PURO END ====

(function initStockSeleccion() {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const nucleo = window.StockNucleo;
    if (!nucleo || !nucleo.seleccion || !$('stock-seleccion-banner') || !$('stockLoteModal')) return;
    const { estado, visibles, cargar, toast, modal, seleccion } = nucleo;

    const acordeon = $('stock-accordion');
    const porId = () => new Map(((estado().datos || {}).dispositivos || []).map(d => [d.id, d]));

    // ------------------------------------------------------------------ la selección (lo común: uiModoSeleccion de comun.js)
    // No sacan del modo: los dispositivos y los encabezados de grupo y subgrupo, la barra de abajo y las opciones de la pestaña
    const modo = uiModoSeleccion({
        panel: $('v-pills-stock'), contenedor: acordeon, banner: $('stock-seleccion-banner'), claseModo: 'stock-modo-seleccion',
        items: () => [...acordeon.querySelectorAll('[data-stock-id]')], claveDe: el => el.dataset.stockId, vigentes: porId,
        contador: $('stock-sel-contador'), botonVisibles: $('stock-sel-visibles'),
        acciones: ['stock-sel-cambiar', 'stock-sel-listar', 'stock-sel-favoritos'].map($),
        sigueEnElModo: '#stock-opciones',
        controlesDeLaLista: '[data-stock-id], .accordion-header, .stock-subgrupo-fila, .stock-subgrupo-header, thead',
    });
    const { elegidos, salir } = modo;

    // «Listar» (ícono): abre el modal de Listar con lo seleccionado en su pestaña «Selección»
    $('stock-sel-listar').addEventListener('click', () => {
        if (seleccion.listar && elegidos.size) seleccion.listar([...elegidos]);
    });

    // «Agregar a favoritos» (estrella): lo seleccionado que el sistema monitorea pasa al panel Estado (favoritos.js)
    $('stock-sel-favoritos').addEventListener('click', () => {
        if (!elegidos.size || typeof window.favoritosAgregarSeleccion !== 'function') return;
        const r = window.favoritosAgregarSeleccion([...elegidos]);
        toast(r.texto, r.agregados ? 'success' : 'warning');
    });

    seleccion.activo = modo.activo;
    seleccion.alternar = modo.alternar;
    seleccion.entrar = modo.entrar;
    seleccion.pintar = modo.pintar;
    seleccion.repintarLista = modo.pintarSinTransicion;          // la lista se rearmó: lo marcado vuelve sin parpadear

    // ------------------------------------------------------------------ cambiar datos (modal)
    let revisado = false;                // lo último que se revisó corresponde a los campos que están hoy
    let revisadoRes = null;
    let ocupado = false;
    let idsLote = elegidos;              // de quién son los datos que se cambian: lo marcado en Activos o lo que pasa Producción
    const campos = [...document.querySelectorAll('#stockLoteModal [data-lote-campo]')];
    function valoresActuales() {
        const v = Object.create(null);
        for (const campo of campos) v[campo.dataset.loteCampo] = campo.value;
        return v;
    }

    function poblarOpciones() {
        const datos = estado().datos;
        if (!datos) return;
        const con = (sel, opciones) => {
            sel.replaceChildren(new Option('No cambiar', ''), ...opciones);
        };
        con($('lote-tipo'), datos.grupos.map(g => {
            const og = document.createElement('optgroup');
            og.label = g.etiqueta;
            og.append(...g.tipos.map(t => new Option(t.etiqueta, t.clave)));
            return og;
        }));
        con($('lote-condicion'), datos.condiciones.map(c => new Option(stockCondicionTexto(c), c)));
        con($('lote-edificio'), datos.edificios.map(e => new Option(e, e)));
        con($('lote-piso'), stockOpcionesPiso(datos.pisos, '').map(([valor, texto]) => new Option(texto, valor)));
        $('lote-rack').value = '';
    }

    function mostrarError(texto) {
        const caja = $('lote-error');
        caja.textContent = texto;
        caja.classList.toggle('d-none', !texto);
    }

    // Un solo botón: «Revisar» hasta que se revisa; después «Aplicar a N» (o «Aplicar» apagado si nada cambia)
    function pintarAplicar() {
        const boton = $('lote-aplicar');
        const n = (revisadoRes ? revisadoRes.actualizados.length : 0);
        boton.disabled = ocupado || (revisado && n === 0);
        boton.classList.toggle('btn-primary', revisado);
        boton.classList.toggle('btn-outline-primary', !revisado);
        boton.firstElementChild.className = revisado ? 'bi bi-check-lg me-1' : 'bi bi-search me-1';
        boton.lastElementChild.textContent = !revisado ? 'Revisar' : (n ? `Aplicar a ${n}` : 'Aplicar');
    }

    // Cambia el análisis: con animación si ya había uno a la vista (la tarjeta se contrae suave, no se quita de golpe)
    function invalidarRevision() {
        const habia = revisado || $('lote-resultado').childNodes.length > 0;
        revisado = false;
        revisadoRes = null;
        if (habia) mutarContenido($('lote-resultado'), () => $('lote-resultado').replaceChildren(), null, null, true);
        pintarAplicar();
    }

    function pintarResultado(res) {
        const caja = $('lote-resultado');
        const nodos = [uiNodo('div', 'fw-semibold', stockLoteResumen(res))];
        const nombres = res.actualizados.filter(x => x.sale_de_produccion).map(x => x.descripcion);
        if (nombres.length) {
            nodos.push(uiNodo('div', 'text-warning-emphasis small mt-1',
                `Salen de producción (pierden su instalación): ${nombres.join(', ')}.`));
        }
        if (res.omitidos.length) {
            const lista = uiNodo('ul', 'list-unstyled small text-secondary mt-2 mb-0');
            for (const om of res.omitidos) lista.append(uiNodo('li', '', `${om.descripcion}: ${om.motivo}`));
            nodos.push(lista);
        }
        caja.replaceChildren(...nodos);
    }

    // Los cambios elegidos (con el aviso si no se eligió nada), o null
    function cambiosElegidos() {
        const cambios = stockLoteCambios(valoresActuales());
        if (!Object.keys(cambios).length) {
            mostrarError('Elegí qué cambiar (algo distinto de «No cambiar»).');
            return null;
        }
        mostrarError('');
        return cambios;
    }

    function enviar(cambios, aplicar) {
        return apiFetchValidado('/api/stock/dispositivos/lote', stockLoteValido, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            mensaje: 'Respuesta inesperada al cambiar en lote.',
            body: JSON.stringify(stockLotePedido(idsLote, porId(), cambios, aplicar)) });
    }

    async function revisar() {
        const cambios = cambiosElegidos();
        if (ocupado || !cambios) return;
        ocupado = true;
        pintarAplicar();
        try {
            const res = await enviar(cambios, false);
            revisado = true;
            revisadoRes = res;
            mutarContenido($('lote-resultado'), () => pintarResultado(res), null, null, true);
        } catch (e) {
            uiErrorConsulta(e, mostrarError, 'No se pudo revisar el cambio.');
            invalidarRevision();
        } finally {
            ocupado = false;
            pintarAplicar();
        }
    }

    async function aplicar() {
        if (ocupado) return;
        if (!revisado) { revisar(); return; }
        const cambios = cambiosElegidos();
        if (!cambios) { pintarAplicar(); return; }
        ocupado = true;
        pintarAplicar();
        let res = null;
        try {
            res = await enviar(cambios, true);
        } catch (e) {
            uiErrorConsulta(e, mostrarError, 'No se pudo aplicar el cambio.');
        } finally {
            ocupado = false;
        }
        if (!res) { pintarAplicar(); return; }
        toast(`${stockLoteResumen(res)}.`, res.omitidos.length ? 'warning' : 'success');
        modal('stockLoteModal').hide();
        salir();
        document.dispatchEvent(new CustomEvent('cctv:lote-aplicado'));        // Producción también sale de su modo selección
        await cargar();
        if (typeof cargarDatos === 'function') cargarDatos();
    }

    $('lote-aplicar').addEventListener('click', aplicar);
    for (const campo of campos) {
        campo.addEventListener('input', invalidarRevision);
        campo.addEventListener('change', invalidarRevision);
    }
    // Abre «Cambiar datos» para `ids` (los de Activos: lo marcado; los de Producción: los dispositivos del stock marcados allá)
    async function abrirLote(ids) {
        if (!estado().datos) await cargar();
        if (!estado().datos || !estado().datos.editable) return false;
        idsLote = ids;
        poblarOpciones();
        mostrarError('');
        invalidarRevision();
        $('lote-titulo').textContent = `Cambiar datos de ${ids.size} ${ids.size === 1 ? 'dispositivo' : 'dispositivos'}`;
        modal('stockLoteModal').show();
        return true;
    }
    $('stock-sel-cambiar').addEventListener('click', () => abrirLote(elegidos));
    seleccion.cambiarDatos = (ids) => abrirLote(new Set(ids));
    pintarAplicar();
})();
