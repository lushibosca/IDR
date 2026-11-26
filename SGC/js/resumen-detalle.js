// Modales de detalle del panel Estado: modal único de stock (#modal-detalle-stock: tabla plegable, agrupamiento,
// orden por columnas, columnas visibles, relleno CSS del pie y repintado diferido al abrir) y controles de modo de
// #modal-detalle-capacidad. Se carga DESPUÉS de resumen.js, resumen-distribucion.js y resumen-participacion.js.
(() => {
    const SELECTOR_VALORES_CAPACIDAD = '#tabla-detalle-capacidad .cap-valor, #tabla-detalle-pantallas .cap-valor, .modal-detalle-tipos .cap-valor';
    const SELECTOR_VALORES_PARTICIPACION = '.modal-detalle-tipos .part-valor';
    const IDS_MODALES_DETALLE = ['modal-detalle-capacidad', 'modal-detalle-stock'];
    const ESTADOS_CELDA_STOCK = ['en uso', 'disponible', 'no disponible'];
    const DETALLE_STOCK_SISTEMA = new Map([
        ['camaras', { etiqueta: 'Cámaras', icono: 'bi-camera-video' }],
        ['servidores', { etiqueta: 'Servidores', icono: 'bi-hdd-rack' }],
        ['otros', { etiqueta: 'Otros Dispositivos', icono: 'bi-cpu' }],
    ]);

    const _modalesDetalleSucios = new Set();
    const _tiposDesplegados = new Map();
    let _grupoDetalle = null;

    function asegurarRellenoPie(tabla) {
        const pie = tabla ? tabla.tFoot : null;
        if (!pie || tabla.querySelector(':scope > tbody.tabla-relleno')) return;
        const relleno = document.createElement('tbody');
        relleno.className = 'tabla-relleno';
        relleno.setAttribute('aria-hidden', 'true');
        const td = relleno.insertRow().insertCell();
        td.colSpan = Math.max(1, pie.rows[0] ? pie.rows[0].cells.length : 1);
        tabla.insertBefore(relleno, pie);
    }

    function crearFantasmaCelda(celda) {
        const padre = celda.closest('.modal-content') || document.body;
        const rango = document.createRange();
        rango.selectNodeContents(celda);
        const r = rango.getBoundingClientRect();
        const pr = padre.getBoundingClientRect();
        const est = getComputedStyle(celda);
        const f = document.createElement('div');
        f.textContent = celda.textContent;
        Object.assign(f.style, fantasmaCaja(r, pr, padre.clientTop, padre.clientLeft), {
            whiteSpace: 'nowrap', textAlign: 'center', pointerEvents: 'none',
            zIndex: '1000', transformOrigin: '50% 50%', font: est.font, color: est.color, letterSpacing: est.letterSpacing,
        });
        f.style.lineHeight = `${r.height}px`;
        const cuerpo = celda.closest('.modal-body');
        if (cuerpo) {
            const tabla = celda.closest('table');
            const cabecera = tabla ? tabla.querySelector('thead') : null;
            const totales = tabla ? tabla.querySelector('.fila-totales') : null;
            const visible = fantasmaAreaVisible(cuerpo.getBoundingClientRect(), cabecera && cabecera.getBoundingClientRect(),
                totales && !totales.contains(celda) ? totales.getBoundingClientRect() : null);
            const recorte = fantasmaRecorte(r, visible);
            if (recorte) f.style.clipPath = recorte;
        }
        f._padre = padre;
        return f;
    }

    function sincronizarBotonesModo(selector, datasetClave, valor) {
        for (const b of document.querySelectorAll(selector)) {
            const activo = b.dataset[datasetClave] === valor;
            b.classList.toggle('active', activo);
            b.setAttribute('aria-pressed', String(activo));
        }
    }

    function sincronizarAgrupamientoStock(criterio) {
        const crit = agrupamientoDetalleStockValido(criterio);
        const texto = AGRUPAMIENTOS_DETALLE_STOCK.get(crit) || 'Tipo / Modelo';
        for (const el of document.querySelectorAll('[data-stock-detalle-agrupar-texto]')) el.textContent = texto;
        for (const b of document.querySelectorAll('[data-stock-detalle-agrupar]')) {
            const activo = b.dataset.stockDetalleAgrupar === crit;
            b.classList.toggle('active', activo);
            b.setAttribute('aria-current', activo ? 'true' : 'false');
        }
        const col = etiquetaColumnaDetalleStock(crit);
        for (const th of document.querySelectorAll('.modal-detalle-tipos thead th:first-child')) th.textContent = col;
    }

    function sincronizarParticipacionStock(modoPart) {
        const modo = modoParticipacionStockValido(modoPart);
        sincronizarBotonesModo('[data-part-modo]', 'partModo', modo);
        const etiqueta = etiquetaParticipacionStock(modo);
        for (const modal of document.querySelectorAll('.modal-detalle-tipos')) modal.dataset.stockPart = modo;
        for (const th of document.querySelectorAll('.modal-detalle-tipos thead th:nth-child(6)')) {
            const rotulo = th.querySelector('[data-th-rotulo]');
            if (rotulo) rotulo.textContent = etiqueta; else th.textContent = etiqueta;
        }
    }

    function pintarModalDetallePorId(id) {
        _modalesDetalleSucios.delete(id);
        if (id === 'modal-detalle-capacidad') { pintarDetalleCapacidad(); return; }
        if (id === 'modal-detalle-stock') pintarDetalleGrupo();
    }

    function repintarModoDetalles(modalObjetivo = null) {
        const objetivoId = modalObjetivo && modalObjetivo.id ? modalObjetivo.id : null;
        for (const id of IDS_MODALES_DETALLE) {
            const el = document.getElementById(id);
            if (id === objetivoId || (el && el.classList.contains('show'))) pintarModalDetallePorId(id);
            else _modalesDetalleSucios.add(id);
        }
        sincronizarBotonesModo('[data-cap-modo]', 'capModo', modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD)));
        sincronizarParticipacionStock(storage.get(CLAVE_PARTICIPACION_STOCK));
        sincronizarAgrupamientoStock(storage.get(CLAVE_AGRUPAR_STOCK));
    }

    function repintarDetalleStockAnimado(modal) {
        const repintar = () => repintarModoDetalles(modal);
        const tbody = modal ? modal.querySelector('tbody:not(.tabla-relleno)') : null;
        if (tbody) mutarContenido(tbody, repintar, null, () => tbody, true);
        else repintar();
    }

    function fijarTiposDesplegados(tbody, abiertos, tipos, abrir) {
        for (const b of tbody.querySelectorAll('.resumen-tipo-btn')) {
            if (tipos.has(b.dataset.resumenTipo)) b.setAttribute('aria-expanded', String(abrir));
        }
        for (const fila of tbody.querySelectorAll('tr.resumen-modelo')) {
            if (tipos.has(fila.dataset.resumenDe)) uiPlegarFila(fila, abrir);
        }
        for (const t of tipos) {
            if (abrir) abiertos.add(t); else abiertos.delete(t);
        }
    }

    function celdasContador(tr, c, clases, modo, participacion = null, modeloFiltro = '') {
        uiCelda(tr, String(c.t), clases[0]);
        [c.u, c.d, c.o].forEach((v, i) => {
            const td = uiCelda(tr, '', clases[i + 1]);
            if (modeloFiltro) {
                td.dataset.stockFiltro = ESTADOS_CELDA_STOCK[i];
                td.title = `Doble clic: ver «${modeloFiltro}» (${ESTADOS_CELDA_STOCK[i]}) en Activos`;
            }
            td.append(uiNodo('span', 'cap-valor', formatoCapacidad(v, c.t, modo)));
        });
        if (participacion !== null) {
            const { parte, base } = typeof participacion === 'object' ? participacion : { parte: c.t, base: participacion };
            const td = uiCelda(tr, '', clases[4] || 'text-center text-muted');
            td.append(uiNodo('span', 'part-valor', formatoParticipacion(parte, base)));
        }
    }

    function pintarTotalGeneral(tabla, porTipo, modo, modoPart) {
        if (!tabla) return;
        const total = { t: 0, u: 0, d: 0, o: 0 };
        for (const { c } of porTipo.values()) {
            total.t += c.t; total.u += c.u; total.d += c.d; total.o += c.o;
        }
        let pie = tabla.tFoot;
        if (!pie) {
            pie = tabla.createTFoot();
            pie.className = 'fila-totales';
        }
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.className = 'ps-3';
        th.scope = 'row';
        th.textContent = 'Total';
        tr.appendChild(th);
        celdasContador(tr, total, ['text-center', 'text-center', 'text-center', 'text-center', 'text-center'], modo,
            participacionStock(total, total.t, total.u, modoPart));
        pie.replaceChildren(tr);
        asegurarRellenoPie(tabla);
    }

    function sincronizarColumnasYOrdenDetalle(tabla, ordenCol, ordenDir, modoPart, ocultas) {
        if (!tabla) return;
        const ocultasSet = new Set(ocultas);
        const filaCab = tabla.tHead && tabla.tHead.rows[0];
        if (filaCab) {
            let ultima = null;
            COLUMNAS_DETALLE_STOCK.forEach((col, i) => {
                const th = filaCab.cells[1 + i];
                if (!th) return;
                const rotulo = col.id === 'part' ? etiquetaParticipacionStock(modoPart) : col.etiqueta;
                th.dataset.sort = col.id;
                th.tabIndex = 0;
                th.setAttribute('role', 'columnheader');
                th.title = 'Clic para ordenar';
                const activa = ordenCol === col.id && !ocultasSet.has(col.id);
                let span = th.querySelector('[data-th-rotulo]');
                let icono = th.querySelector('i[data-sort-icono]');
                if (!span || !icono) {
                    span = uiNodo('span', '', rotulo);
                    span.dataset.thRotulo = '1';
                    icono = uiNodo('i', '');
                    icono.dataset.sortIcono = '1';
                    th.replaceChildren(span, ' ', icono);
                } else {
                    span.textContent = rotulo;
                }
                uiAplicarCabeceraOrden(th, { activa, dir: ordenDir, icono });
                const oculta = ocultasSet.has(col.id);
                th.classList.toggle('d-none', oculta);
                th.classList.remove('detalle-col-ultima');
                if (!oculta) ultima = th;
            });
            if (ultima) ultima.classList.add('detalle-col-ultima');
        }
        for (const seccion of [tabla.tBodies[0], tabla.tFoot]) {
            if (!seccion) continue;
            for (const fila of seccion.rows) {
                COLUMNAS_DETALLE_STOCK.forEach((col, i) => {
                    const celda = fila.cells[1 + i];
                    if (celda) celda.classList.toggle('d-none', ocultasSet.has(col.id));
                });
            }
        }
        const rellenoTd = tabla.querySelector(':scope > tbody.tabla-relleno td');
        if (rellenoTd) rellenoTd.colSpan = Math.max(1, 1 + IDS_COLUMNAS_DETALLE_STOCK.length - ocultasSet.size);
        const cont = tabla.closest('.tabla-con-pie');
        const menu = cont ? cont.querySelector('[data-detalle-cols-menu]') : null;
        if (menu) {
            const items = COLUMNAS_DETALLE_STOCK.map(c => ({
                id: c.id,
                etiqueta: c.id === 'part' ? etiquetaParticipacionStock(modoPart) : c.etiqueta,
            }));
            uiMenuVisibilidad(menu, items, ocultas, (id) => {
                preferencias.setLista(CLAVE_COLS_OCULTAS_STOCK,
                    alternarOculto(storage.getJSON(CLAVE_COLS_OCULTAS_STOCK, []), id, IDS_COLUMNAS_DETALLE_STOCK));
                repintarModoDetalles(tabla.closest('.modal'));
            });
        }
    }

    function celdaModeloResumen(modelo, tipoPrefijo = '') {
        const td = document.createElement('td');
        td.className = 'resumen-modelo-nombre';
        const thumb = document.createElement('span');
        thumb.className = 'resumen-modelo-thumb';
        const ruta = buscarImagenDispositivo(modelo);
        if (ruta) {
            const img = document.createElement('img');
            img.className = 'resumen-modelo-img';
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = () => img.remove();
            img.src = ruta;
            thumb.appendChild(img);
        }
        const nombre = document.createElement('span');
        if (tipoPrefijo) {
            const pref = uiNodo('span', 'text-secondary small me-1', `${tipoPrefijo} ·`);
            nombre.append(pref, uiNodo('span', '', modelo));
        } else {
            nombre.textContent = modelo;
        }
        td.append(thumb, nombre);
        return td;
    }

    function pintarTablaTipos(selector, porTipo, dispositivos = null) {
        const tbody = document.querySelector(selector);
        if (!tbody) return;
        const modo = modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
        const modoPart = modoParticipacionStockValido(storage.get(CLAVE_PARTICIPACION_STOCK));
        const criterio = agrupamientoDetalleStockValido(storage.get(CLAVE_AGRUPAR_STOCK));
        const ocultas = ocultosVigentes(storage.getJSON(CLAVE_COLS_OCULTAS_STOCK, []), IDS_COLUMNAS_DETALLE_STOCK);
        const [ordenColRaw, ordenDir] = ordenDetalleStockValido(storage.get(CLAVE_ORDEN_STOCK));
        const ordenCol = ordenColRaw && !ocultas.includes(ordenColRaw) ? ordenColRaw : '';
        const signoOrden = ordenDir === 'desc' ? -1 : 1;
        sincronizarParticipacionStock(modoPart);
        sincronizarAgrupamientoStock(criterio);
        const etiquetasTipo = _cacheStockResumen ? stockEtiquetas(_cacheStockResumen.tipos) : null;
        const grupos = (criterio !== 'tipo' && Array.isArray(dispositivos))
            ? agruparDetalleStock(dispositivos, etiquetasTipo, criterio) : porTipo;
        const claveAbiertos = `${selector}|${_grupoDetalle || 'servidores'}|${criterio}`;
        tbody.dataset.resumenClave = claveAbiertos;
        if (!_tiposDesplegados.has(claveAbiertos)) _tiposDesplegados.set(claveAbiertos, new Set());
        const abiertos = _tiposDesplegados.get(claveAbiertos);
        const clases = ['', 'text-center fw-semibold', 'text-center', 'text-center', 'text-center text-muted'];
        const porNombre = ([a], [b]) => uiCompararTexto(a, b);
        const porGrupoNatural = ([ka, va], [kb, vb]) => {
            const oa = va && va.orden !== undefined ? va.orden : ka;
            const ob = vb && vb.orden !== undefined ? vb.orden : kb;
            return uiCompararTexto(oa, ob) || ((va.pesoPiso || 0) - (vb.pesoPiso || 0)) || uiCompararTexto(ka, kb);
        };
        const porGrupo = ordenCol
            ? (a, b) => signoOrden * (valorOrdenDetalleStock(a[1].c, ordenCol, modo, modoPart)
                - valorOrdenDetalleStock(b[1].c, ordenCol, modo, modoPart)) || porGrupoNatural(a, b)
            : porGrupoNatural;
        const porModelo = ordenCol
            ? (a, b) => signoOrden * (valorOrdenDetalleStock(a[1], ordenCol, modo, modoPart)
                - valorOrdenDetalleStock(b[1], ordenCol, modo, modoPart)) || porNombre(a, b)
            : porNombre;
        const todosLosTipos = new Set(grupos.keys());
        let totalGeneral = 0;
        let totalUso = 0;
        for (const { c } of grupos.values()) { totalGeneral += c.t; totalUso += c.u; }
        const filas = [];
        for (const [tipo, { c, modelos }] of [...grupos.entries()].sort(porGrupo)) {
            const abierto = abiertos.has(tipo);
            const tr = document.createElement('tr');
            tr.className = 'resumen-tipo';
            tr.title = 'Clic para abrir o cerrar; mantené presionado (o Shift + clic) para todos';
            const td = document.createElement('td');
            td.className = 'ps-3';
            const boton = uiNodo('button', 'resumen-tipo-btn');
            boton.type = 'button';
            boton.setAttribute('aria-expanded', String(abierto));
            boton.title = 'Mantené presionado (o Shift + clic) para abrir o cerrar todos';
            boton.dataset.resumenTipo = tipo;
            const cant = uiNodo('span', 'badge bg-secondary ms-2', String(modelos.size));
            cant.title = `${modelos.size} ${modelos.size === 1 ? 'modelo' : 'modelos'}`;
            boton.append(uiNodo('i', 'bi bi-chevron-right resumen-tipo-chevron me-2'), uiNodo('span', 'fw-semibold', tipo), cant);
            uiAtajoPulsacionLarga(tr, () => fijarTiposDesplegados(tbody, abiertos, todosLosTipos,
                boton.getAttribute('aria-expanded') !== 'true'));
            td.appendChild(boton);
            tr.appendChild(td);
            celdasContador(tr, c, clases.slice(1), modo, participacionStock(c, totalGeneral, totalUso, modoPart));
            filas.push(tr);
            for (const [subClave, m] of [...modelos.entries()].sort(porModelo)) {
                const modelo = m && typeof m.modelo === 'string' ? m.modelo : subClave;
                const tipoPrefijo = m && typeof m.tipo === 'string' ? m.tipo : '';
                const sub = document.createElement('tr');
                sub.className = 'resumen-modelo';
                sub.dataset.resumenDe = tipo;
                sub.appendChild(celdaModeloResumen(modelo, tipoPrefijo));
                const tieneModelo = Boolean(busquedaDeModelo(modelo));
                if (tieneModelo) {
                    sub.dataset.resumenModelo = modelo;
                    sub.title = 'Doble clic: ver este modelo en Activos';
                }
                celdasContador(sub, m, clases.slice(1), modo, participacionStock(m, c.t, totalUso, modoPart),
                    tieneModelo ? modelo : '');
                filas.push(uiFilaPlegable(sub, abierto));
            }
        }
        tbody.replaceChildren(...filas);
        const tabla = tbody.closest('table');
        pintarTotalGeneral(tabla, grupos, modo, modoPart);
        sincronizarColumnasYOrdenDetalle(tabla, ordenCol, ordenDir, modoPart, ocultas);
        if (!tbody.dataset.resumenPlegable) {
            tbody.dataset.resumenPlegable = '1';
            tbody.addEventListener('click', (e) => {
                const fila = e.target instanceof Element ? e.target.closest('tr.resumen-tipo') : null;
                const b = fila ? fila.querySelector('.resumen-tipo-btn') : null;
                if (!b) return;
                const clave = tbody.dataset.resumenClave || selector;
                if (!_tiposDesplegados.has(clave)) _tiposDesplegados.set(clave, new Set());
                fijarTiposDesplegados(tbody, _tiposDesplegados.get(clave), new Set([b.dataset.resumenTipo]),
                    b.getAttribute('aria-expanded') !== 'true');
            });
            tbody.addEventListener('dblclick', (e) => {
                const fila = e.target instanceof Element ? e.target.closest('tr.resumen-modelo[data-resumen-modelo]') : null;
                if (!fila) return;
                const celda = e.target instanceof Element ? e.target.closest('td[data-stock-filtro]') : null;
                const filtro = celda && fila.contains(celda) ? celda.dataset.stockFiltro : '';
                const query = busquedaDeModelo(fila.dataset.resumenModelo, filtro);
                if (!query) return;
                window.getSelection()?.removeAllRanges();
                const modal = tbody.closest('.modal');
                if (modal && typeof UI !== 'undefined' && UI.modal) UI.modal.cerrar(modal);
                window.buscarConAtajo(query, { campos: CAMPOS_BUSQUEDA, tab: 'v-pills-stock-tab' });
            });
        }
    }

    function mostrarDetalleGrupo(clave) {
        _grupoDetalle = clave;
        _modalesDetalleSucios.delete('modal-detalle-stock');
        pintarDetalleGrupo();
    }

    function descartarGrupoDetalle(existeChipPropio) {
        if (_grupoDetalle && !DETALLE_STOCK_SISTEMA.has(_grupoDetalle) && !existeChipPropio(_grupoDetalle)) _grupoDetalle = null;
    }

    function pintarDetalleGrupo(resResumen = null) {
        const clave = _grupoDetalle || 'servidores';
        const sys = DETALLE_STOCK_SISTEMA.get(clave);
        const chip = sys ? null : _chipsGrupo.get(clave);
        if (!sys && !chip) return;
        const res = resResumen || _ultimoResumenStock
            || (_cacheStockResumen ? resumirStock(_cacheStockResumen.dispositivos, stockEtiquetas(_cacheStockResumen.tipos), stockGrupoDeActual) : null);
        if (!res) return;
        const datos = sys ? res[clave] : res.personalizados.get(clave);
        const etiqueta = sys ? sys.etiqueta : chip.etiqueta;
        const iconoEl = document.getElementById('modal-stock-icono');
        if (iconoEl) iconoEl.className = `bi ${sys ? sys.icono : 'bi-box-seam'} me-2`;
        uiPonerTexto('modal-stock-texto', `Detalle de Stock (${etiqueta})`);
        pintarTablaTipos('#tabla-detalle-stock tbody', datos ? datos.porTipo : new Map(), datos ? datos.dispositivos : []);
    }

    for (const k of [CLAVE_MODO_CAPACIDAD, CLAVE_PARTICIPACION_STOCK, CLAVE_AGRUPAR_STOCK, CLAVE_ORDEN_STOCK, CLAVE_COLS_OCULTAS_STOCK]) {
        preferencias.alAplicar(k, () => repintarModoDetalles());
    }

    document.addEventListener('ui:modal-abrir', (e) => {
        const id = e.target && e.target.id;
        if (id === 'modal-detalle-stock') {
            const disp = e.detail && e.detail.disparador;
            const col = disp && typeof disp.closest === 'function' ? disp.closest('[data-activos-chip]') : null;
            if (col && col.dataset.activosChip) { mostrarDetalleGrupo(col.dataset.activosChip); return; }
        }
        if (id && _modalesDetalleSucios.has(id)) pintarModalDetallePorId(id);
    });

    document.addEventListener('click', (e) => {
        if (!(e.target instanceof Element)) return;
        const bCap = e.target.closest('[data-cap-modo]');
        if (bCap) {
            const nuevo = modoCapacidadValido(bCap.dataset.capModo);
            const cambia = nuevo !== modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
            preferencias.set(CLAVE_MODO_CAPACIDAD, nuevo);
            const modal = bCap.closest('.modal');
            if (!cambia || prefiereMovimientoReducido()) { repintarModoDetalles(modal); return; }
            mutarEnParalelo(() => [...document.querySelectorAll(SELECTOR_VALORES_CAPACIDAD)].filter(valorVisible),
                () => repintarModoDetalles(modal), crearFantasmaCelda);
            return;
        }
        const bPart = e.target.closest('[data-part-modo]');
        if (bPart) {
            const nuevo = modoParticipacionStockValido(bPart.dataset.partModo);
            const cambia = nuevo !== modoParticipacionStockValido(storage.get(CLAVE_PARTICIPACION_STOCK));
            preferencias.set(CLAVE_PARTICIPACION_STOCK, nuevo);
            const modal = bPart.closest('.modal');
            if (!cambia || prefiereMovimientoReducido()) { repintarModoDetalles(modal); return; }
            mutarEnParalelo(() => [...document.querySelectorAll(SELECTOR_VALORES_PARTICIPACION)].filter(valorVisible),
                () => repintarModoDetalles(modal), crearFantasmaCelda);
            return;
        }
        const bAgr = e.target.closest('[data-stock-detalle-agrupar]');
        if (bAgr) {
            const nuevo = agrupamientoDetalleStockValido(bAgr.dataset.stockDetalleAgrupar);
            const cambia = nuevo !== agrupamientoDetalleStockValido(storage.get(CLAVE_AGRUPAR_STOCK));
            preferencias.set(CLAVE_AGRUPAR_STOCK, nuevo);
            const modal = bAgr.closest('.modal-detalle-tipos');
            if (!cambia) { repintarModoDetalles(modal); return; }
            repintarDetalleStockAnimado(modal);
        }
    });

    uiDelegarOrdenTabla(document, '.modal-detalle-tipos thead th[data-sort]', (col, th) => {
        const nuevo = siguienteOrdenDetalleStock(storage.get(CLAVE_ORDEN_STOCK), col);
        preferencias.set(CLAVE_ORDEN_STOCK, nuevo);
        repintarDetalleStockAnimado(th.closest('.modal-detalle-tipos'));
    });

    document.addEventListener('DOMContentLoaded', () => {
        for (const tabla of document.querySelectorAll('.tabla-con-pie > table')) asegurarRellenoPie(tabla);
        for (const tbody of document.querySelectorAll('#tabla-detalle-capacidad tbody, #tabla-detalle-pantallas tbody')) {
            tbody.addEventListener('dblclick', (e) => {
                const fila = e.target instanceof Element ? e.target.closest('tr[data-nvr-ip]') : null;
                if (!fila) return;
                window.getSelection()?.removeAllRanges();
                const modal = tbody.closest('.modal');
                if (modal && typeof UI !== 'undefined' && UI.modal) UI.modal.cerrar(modal);
                if (fila.dataset.nvrIp && typeof window.buscarConAtajo === 'function') {
                    window.buscarConAtajo(fila.dataset.nvrIp, { campos: CAMPOS_BUSQUEDA, tab: 'v-pills-stock-tab' });
                }
            });
        }
    });

    Object.assign(window, { mostrarDetalleGrupo, pintarDetalleGrupo, descartarGrupoDetalle, repintarModoDetalles, sincronizarParticipacionStock });
})();
