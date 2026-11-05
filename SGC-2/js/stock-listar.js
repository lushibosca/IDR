// Stock > Listar (modal «Listar» de la pestaña Stock): grupos de la vista de Activos o cámaras por grabador, con las columnas elegidas (fichas reordenables) para copiar, y el «Reporte» HTML de la vista. Lo comparte con
// stock.js por `window.StockNucleo` (estado de la última carga, `visibles`, `cargar`, animación y avisos del modal);
// la lógica pura (stockAgruparBloques, stockFormatearRegistro, stockReporteHtml, CAMPOS_LISTAR) está en el bloque STOCK PURO de stock.js. Se carga después de stock.js.
(function initStockListar() {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const nucleo = window.StockNucleo;
    if (!nucleo || !$('stockExportModal')) return;
    const { estado, visibles, armarMapaCamaras, cargar, animarModal, toast, modal } = nucleo;

    let exportacion = null;      // Listar: { modo, columnas, opciones: [{ clave, etiqueta, detalle, deshabilitada }] }

    // Lo que se lista en «Vista» y «Selección»: lo que se ve en Activos, o lo que se eligió en el modo selección (se toma de
    // los datos de ahora, no de una copia: si un dispositivo se borró, ya no figura)
    function listaDelModo() {
        if (exportacion.modo !== 'seleccion') return visibles();
        const { datos } = estado();
        return datos ? datos.dispositivos.filter(d => exportacion.seleccion.has(d.id)) : [];
    }

    function opcionesExportacion() {
        const { datos, etiquetasTipo, catalogo, criterio } = estado();
        if (exportacion.modo === 'vista' || exportacion.modo === 'seleccion') {
            const mapaCamaras = armarMapaCamaras();
            const bloques = stockAgruparBloques(listaDelModo(), criterio, etiquetasTipo, catalogo);
            return bloques.map(bloque => {
                const items = (bloque.items || []).map(dispositivo => {
                    const macNorm = dispositivo.mac ? String(dispositivo.mac).trim().toUpperCase() : '';
                    const ipNorm = dispositivo.instalacion && dispositivo.instalacion.ip
                        ? String(dispositivo.instalacion.ip).trim() : '';
                    const camara = mapaCamaras
                        ? ((macNorm && mapaCamaras.get(macNorm)) || (ipNorm && mapaCamaras.get(ipNorm)) || null)
                        : null;
                    return stockNormalizarDispositivo(dispositivo, camara, etiquetasTipo);
                });
                const ips = items.map(it => it.ip).filter(Boolean);
                return {
                    clave: bloque.etiqueta,
                    etiqueta: bloque.etiqueta,
                    detalle: `${items.length} dispositivo(s)`,
                    deshabilitada: items.length === 0,
                    items,
                    ips
                };
            });
        }
        if (exportacion.modo === 'grabador') {   // el stock por modelo sale de Vista agrupando Activos por modelo
            const camaras = uiCamarasCargadas();
            const stockPorMac = new Map((datos ? datos.dispositivos : [])
                .filter(dispositivo => dispositivo.mac)
                .map(dispositivo => [String(dispositivo.mac).trim().toUpperCase(), dispositivo]));
            const stockPorIp = new Map((datos ? datos.dispositivos : [])
                .filter(dispositivo => dispositivo.instalacion && dispositivo.instalacion.ip)
                .map(dispositivo => [String(dispositivo.instalacion.ip).trim(), dispositivo]));
            const gruposMap = new Map();
            for (const cam of camaras || []) {
                if (!cam || !cam.nvr_ip) continue;
                if (!gruposMap.has(cam.nvr_ip)) {
                    const nombreNvr = cam.nvr_name && cam.nvr_name !== cam.nvr_ip
                        ? `${cam.nvr_name} (${cam.nvr_ip})`
                        : cam.nvr_ip;
                    gruposMap.set(cam.nvr_ip, { clave: cam.nvr_ip, etiqueta: nombreNvr, camaras: [] });
                }
                gruposMap.get(cam.nvr_ip).camaras.push(cam);
            }
            return [...gruposMap.values()]
                .sort((a, b) => stockCompararTexto(a.etiqueta, b.etiqueta))
                .map(g => {
                    const ordenadas = g.camaras.sort((a, b) =>
                        (parseInt(a.channel_id, 10) || 0) - (parseInt(b.channel_id, 10) || 0));
                    const items = ordenadas.map(cam => {
                        const macNorm = cam.mac_address ? String(cam.mac_address).trim().toUpperCase() : '';
                        const ipNorm = cam.ip_address ? String(cam.ip_address).trim() : '';
                        const stockDev = (macNorm && stockPorMac.get(macNorm))
                            || (ipNorm && stockPorIp.get(ipNorm)) || null;
                        return stockNormalizarDispositivo(stockDev, cam, etiquetasTipo);
                    });
                    const ips = items.map(it => it.ip).filter(Boolean);
                    return {
                        clave: g.clave,
                        etiqueta: g.etiqueta,
                        detalle: `${items.length} cámara(s)`,
                        deshabilitada: items.length === 0,
                        items,
                        ips
                    };
                });
        }
        return [];
    }

    function mostrarPasoSeleccion(animar = true) {
        const elSalida = $('stock-exp-paso-preview');
        const elEntrada = $('stock-exp-paso-seleccion');
        if (!elEntrada) return;

        const aplicarDOM = () => {
            elSalida?.classList.add('d-none');
            elEntrada.classList.remove('d-none');
            $('stock-exp-footer-preview')?.classList.add('d-none');
            $('stock-exp-footer-seleccion')?.classList.remove('d-none');
            $('stock-exp-titulo').textContent = 'Listar';
        };

        const debeAnimar = Boolean(animar && elSalida && !elSalida.classList.contains('d-none')
            && typeof mutarContenido === 'function'
            && (!window.prefiereMovimientoReducido || !window.prefiereMovimientoReducido()));

        if (debeAnimar) {
            mutarContenido(elSalida, aplicarDOM, null, () => elEntrada, true);
        } else {
            aplicarDOM();
        }
    }

    let arrastrandoCol = null;
    let huboArrastre = false;

    function renderColumnas() {
        const contenedor = $('stock-exp-chips-columnas');
        if (!contenedor || !exportacion) return;

        // Limpiar clases de arrastre antes de medir para evitar distorsiones por rotación/escala
        contenedor.querySelectorAll('.stock-chip-arrastrando').forEach(chipEl => {
            chipEl.classList.remove('stock-chip-arrastrando');
        });
        contenedor.querySelectorAll('.stock-chip-sobre').forEach(chipEl => {
            chipEl.classList.remove('stock-chip-sobre');
        });

        // Mover o agregar una columna: las fichas se deslizan a su lugar nuevo (uiAnimarReubicacion, el mismo
        // recorrido que las secciones reubicables del panel de Estado)
        const fichas = () => contenedor.querySelectorAll('.stock-chip[data-col-id]');
        uiAnimarReubicacion(fichas, el => el.dataset.colId, () => {
            const activas = exportacion.columnas || [];
            const activasSet = new Set(activas);

            // Fichas activas (con número y arrastrables)
            const chipsActivos = activas.map((colId, idx) => {
                const info = CAMPOS_LISTAR.find(itemInfo => itemInfo.id === colId)
                    || { id: colId, etiqueta: colId };
                const chip = document.createElement('div');
                chip.className = 'stock-chip stock-chip-activa';
                chip.dataset.colId = colId;
                chip.draggable = true;
                chip.title = `${info.etiqueta} (clic para quitar, arrastrar para reordenar)`;

                const badgeNum = document.createElement('span');
                badgeNum.className = 'stock-chip-num';
                badgeNum.textContent = String(idx + 1);

                const texto = document.createElement('span');
                texto.textContent = info.etiqueta;

                chip.append(badgeNum, texto);

                chip.addEventListener('dragstart', (e) => {
                    arrastrandoCol = colId;
                    huboArrastre = true;
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', colId);
                    }
                    chip.classList.add('stock-chip-arrastrando');
                });

                chip.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                });

                chip.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    if (arrastrandoCol && arrastrandoCol !== colId) {
                        chip.classList.add('stock-chip-sobre');
                    }
                });

                chip.addEventListener('dragleave', () => {
                    chip.classList.remove('stock-chip-sobre');
                });

                chip.addEventListener('drop', (e) => {
                    e.preventDefault();
                    chip.classList.remove('stock-chip-sobre');
                    if (arrastrandoCol && arrastrandoCol !== colId) {
                        const origen = exportacion.columnas.indexOf(arrastrandoCol);
                        const destino = exportacion.columnas.indexOf(colId);
                        if (origen !== -1 && destino !== -1) {
                            exportacion.columnas.splice(origen, 1);
                            exportacion.columnas.splice(destino, 0, arrastrandoCol);
                            animarModal('stockExportModal', renderColumnas);
                        }
                    }
                });

                chip.addEventListener('dragend', () => {
                    chip.classList.remove('stock-chip-arrastrando');
                    chip.classList.remove('stock-chip-sobre');
                    arrastrandoCol = null;
                    huboArrastre = true;
                    requestAnimationFrame(() => {
                        huboArrastre = false;
                    });
                });

                chip.addEventListener('click', () => {
                    if (huboArrastre) {
                        huboArrastre = false;
                        return;
                    }
                    if (exportacion.columnas.length <= 1) {
                        toast('Debe haber al menos una columna seleccionada.', 'info');
                        return;
                    }
                    exportacion.columnas = exportacion.columnas.filter(itemCol => itemCol !== colId);
                    animarModal('stockExportModal', renderColumnas);
                });

                return chip;
            });

            // Fichas inactivas (borde punteado, clic para activar)
            const inactivas = CAMPOS_LISTAR.filter(itemDisp => !activasSet.has(itemDisp.id));
            const chipsInactivos = inactivas.map(info => {
                const chip = document.createElement('div');
                chip.className = 'stock-chip';
                chip.dataset.colId = info.id;
                chip.title = `Clic para activar ${info.etiqueta}`;

                const texto = document.createElement('span');
                texto.textContent = info.etiqueta;
                chip.appendChild(texto);

                chip.addEventListener('dragover', (e) => {
                    if (arrastrandoCol) {
                        e.preventDefault();
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    }
                });

                chip.addEventListener('drop', (e) => {
                    if (arrastrandoCol) {
                        e.preventDefault();
                        const origen = exportacion.columnas.indexOf(arrastrandoCol);
                        if (origen !== -1 && origen !== exportacion.columnas.length - 1) {
                            exportacion.columnas.splice(origen, 1);
                            exportacion.columnas.push(arrastrandoCol);
                            animarModal('stockExportModal', renderColumnas);
                        }
                    }
                });

                chip.addEventListener('click', () => {
                    exportacion.columnas.push(info.id);
                    animarModal('stockExportModal', renderColumnas);
                });

                return chip;
            });

            contenedor.replaceChildren(...chipsActivos, ...chipsInactivos);
        });
    }

    function mostrarPasoPreview(lineas) {
        const elSalida = $('stock-exp-paso-seleccion');
        const elEntrada = $('stock-exp-paso-preview');
        if (!elEntrada) return;

        const aplicarDOM = () => {
            elSalida?.classList.add('d-none');
            elEntrada.classList.remove('d-none');
            $('stock-exp-footer-seleccion')?.classList.add('d-none');
            $('stock-exp-footer-preview')?.classList.remove('d-none');
            $('stock-exp-titulo').textContent = 'Listar';
            const plural = lineas.length === 1 ? '' : 's';
            const colsTxt = (exportacion.columnas || ['ip']).map(cid => {
                const inf = CAMPOS_LISTAR.find(itemCol => itemCol.id === cid);
                return inf ? inf.etiqueta : cid;
            }).join(' - ');
            $('stock-exp-preview-ayuda').textContent =
                `${lineas.length} elemento${plural} listo${plural} para copiar (${colsTxt}):`;
            const txt = $('stock-exp-preview-texto');
            if (txt) {
                txt.value = lineas.join('\n');
                txt.focus();
                txt.select();
            }
        };

        const debeAnimar = Boolean(elSalida && !elSalida.classList.contains('d-none')
            && typeof mutarContenido === 'function'
            && (!window.prefiereMovimientoReducido || !window.prefiereMovimientoReducido()));

        if (debeAnimar) {
            mutarContenido(elSalida, aplicarDOM, null, () => elEntrada, true);
        } else {
            aplicarDOM();
        }
    }

    function renderExportacion() {
        const { criterio } = estado();
        mostrarPasoSeleccion(false);
        $('stock-exp-titulo').textContent = 'Listar';
        $('stock-exp-modos').classList.remove('d-none');
        $('stock-exp-columnas-seccion')?.classList.remove('d-none');
        renderColumnas();
        document.querySelectorAll('[data-stock-exp-modo]').forEach(b => {
            b.classList.toggle('active', b.dataset.stockExpModo === exportacion.modo);
            if (b.dataset.stockExpModo === 'seleccion') b.classList.toggle('d-none', !exportacion.seleccion);   // solo desde la selección
        });
        // el reporte es de lo agrupado como en Activos: con Grabador no hay grupos de la vista que elegir
        const btnReporte = $('stock-exp-reporte');
        if (btnReporte) {
            const conGrupos = exportacion.modo === 'vista' || exportacion.modo === 'seleccion';
            btnReporte.disabled = !conGrupos;
            btnReporte.title = !conGrupos ? 'El reporte se arma sobre la pestaña Vista o Selección'
                : (exportacion.modo === 'seleccion' ? 'Reporte HTML de los grupos marcados de lo seleccionado'
                    : 'Reporte HTML de los grupos marcados de la vista de Activos');
        }
        exportacion.opciones = opcionesExportacion();
        $('stock-exp-ayuda').textContent = exportacion.modo === 'vista'
            ? `Vista actual agrupadas por ${STOCK_AGRUPAMIENTOS.get(criterio) || 'grupo'}`
                + `${terminoBusquedaActual().trim() ? ', con la búsqueda aplicada' : ''}.`
            : (exportacion.modo === 'seleccion' ? `Lo seleccionado, agrupado por ${STOCK_AGRUPAMIENTOS.get(criterio) || 'grupo'}.`
                : 'Cámaras de cada grabador');
        $('stock-exp-lista').replaceChildren(...exportacion.opciones.map((o, k) => {
            const label = document.createElement('label');
            label.className = 'list-group-item d-flex gap-2 align-items-start';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'form-check-input mt-1';
            chk.dataset.stockExpOpcion = String(k);
            chk.checked = !o.deshabilitada;
            chk.disabled = o.deshabilitada;
            const texto = document.createElement('span');
            const t = document.createElement('span');
            t.className = 'fw-semibold d-block';
            t.textContent = o.etiqueta;
            const det = document.createElement('span');
            det.className = 'text-secondary';
            det.textContent = o.detalle;
            texto.append(t, det);
            label.append(chk, texto);
            return label;
        }));
        if (!exportacion.opciones.length) {
            const vacio = document.createElement('div');
            vacio.className = 'list-group-item text-secondary';
            let msg = 'No hay cámaras en el último escaneo.';
            if (exportacion.modo === 'seleccion') {
                msg = 'No hay dispositivos seleccionados.';
            } else if (exportacion.modo === 'vista') {
                msg = terminoBusquedaActual().trim()
                    ? 'No hay dispositivos que coincidan con la búsqueda actual.'
                    : 'No hay dispositivos en la vista actual.';
            }
            vacio.textContent = msg;
            $('stock-exp-lista').appendChild(vacio);
        }
        actualizarBotonTodos();
    }

    const casillas = () => [...document.querySelectorAll('[data-stock-exp-opcion]')].filter(chk => !chk.disabled);

    function actualizarBotonTodos() {
        const todas = casillas();
        $('stock-exp-todos').textContent = todas.length && todas.every(chk => chk.checked)
            ? 'Borrar selección' : 'Seleccionar todo';
    }

    // Abre Listar con el foco en «Ver»: marcar, abrir con el atajo y Enter ya muestra el resultado
    function mostrarListar() {
        modal('stockExportModal').show();
        $('stock-exp-descargar').focus({ preventScroll: true });
    }

    async function abrirExportacion() {
        if (!estado().datos) await cargar();
        if (!estado().datos) return;
        exportacion = { modo: 'vista', columnas: ['ip'], opciones: [] };
        renderExportacion();
        mostrarListar();
    }

    // «Listar» desde el modo selección (el ícono de la barra): abre con la pestaña «Selección», que solo existe por esta vía
    async function abrirExportacionSeleccion(ids) {
        if (!estado().datos) await cargar();
        if (!estado().datos || !ids.length) return;
        exportacion = { modo: 'seleccion', columnas: ['ip'], opciones: [], seleccion: new Set(ids) };
        renderExportacion();
        mostrarListar();
    }
    nucleo.seleccion.listar = abrirExportacionSeleccion;

    function descargarExportacion() {
        if (!exportacion) return;
        const elegidas = casillas().filter(chk => chk.checked)
            .map(chk => exportacion.opciones[Number(chk.dataset.stockExpOpcion)]);
        if (!elegidas.length) { toast('Elegí al menos un grupo.', 'info'); return; }
        const items = elegidas.flatMap(o => o.items || []);
        const lineas = [];
        const vistas = new Set();
        for (const it of items) {
            const linea = stockFormatearRegistro(it, exportacion.columnas);
            if (linea && !vistas.has(linea)) {
                vistas.add(linea);
                lineas.push(linea);
            }
        }
        if (!lineas.length) {
            toast('Lo elegido no tiene datos con las columnas seleccionadas.', 'info');
            return;
        }
        mostrarPasoPreview(lineas);
    }

    // «Reporte» de Listar: el HTML por grupos de la vista de Activos (lo visible, con su agrupación y la búsqueda), con
    // los grupos marcados. Solo con la pestaña Vista o Selección (con Grabador el botón queda deshabilitado).
    function generarReporte() {
        if (!exportacion || (exportacion.modo !== 'vista' && exportacion.modo !== 'seleccion')) return;
        const { etiquetasTipo, catalogo, criterio } = estado();
        const claves = new Set(casillas().filter(chk => chk.checked)
            .map(chk => exportacion.opciones[Number(chk.dataset.stockExpOpcion)].clave));
        const bloques = stockAgruparBloques(listaDelModo(), criterio, etiquetasTipo, catalogo)
            .filter(g => claves.has(g.etiqueta));
        if (!bloques.length) { toast('Elegí al menos un grupo con dispositivos.', 'info'); return; }
        const ahora = new Date();
        const html = stockReporteHtml(bloques, { criterio, criterioTexto: STOCK_AGRUPAMIENTOS.get(criterio),
            fecha: ahora.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }),
            busqueda: terminoBusquedaActual().trim(), etiquetasTipo, catalogo });
        uiDescargarTexto(html, uiNombreArchivo(`reporte-stock-${criterio}`, ahora, 'html'), 'text/html;charset=utf-8');
        toast('Reporte descargado.', 'success');
        modal('stockExportModal').hide();
    }


    // ------------------------------------------------------------------ eventos
    document.querySelectorAll('[data-stock-exportar]').forEach(b => b.addEventListener('click', () => abrirExportacion()));
    // Alt+Shift+L: Listar desde la pestaña Stock (también con el foco en el buscador), sin otro modal abierto; en el modo
    // selección abre lo seleccionado, como el ícono de la barra. Respeta los botones deshabilitados (sin dispositivos o
    // sin nada elegido).
    document.addEventListener('keydown', (ev) => {
        if (!stockEsAtajoListar(ev) || !$('v-pills-stock')?.classList.contains('active')) return;
        if (typeof UI !== 'undefined' && UI.modal.arriba()) return;
        ev.preventDefault();
        const boton = nucleo.seleccion.activo() ? $('stock-sel-listar') : document.querySelector('[data-stock-exportar]');
        if (boton && !boton.disabled) boton.click();
    });
    $('stock-exp-modos').addEventListener('click', (ev) => {
        const btnModo = ev.target instanceof Element ? ev.target.closest('[data-stock-exp-modo]') : null;
        if (btnModo && exportacion && btnModo.dataset.stockExpModo
            && btnModo.dataset.stockExpModo !== exportacion.modo) {
            const modos = [...$('stock-exp-modos').querySelectorAll('[data-stock-exp-modo]')].map(b => b.dataset.stockExpModo);
            const paso = Math.sign(modos.indexOf(btnModo.dataset.stockExpModo) - modos.indexOf(exportacion.modo)) || 1;
            exportacion.modo = btnModo.dataset.stockExpModo;
            uiDeslizarCambio($('stock-exp-contenido'),
                () => animarModal('stockExportModal', renderExportacion), paso);
        }
    });
    $('stock-exp-lista').addEventListener('change', actualizarBotonTodos);
    $('stock-exp-todos').addEventListener('click', () => {
        const todas = casillas();
        const marcar = !todas.every(chk => chk.checked);
        todas.forEach(chk => { chk.checked = marcar; });
        actualizarBotonTodos();
    });
    $('stock-exp-descargar').addEventListener('click', descargarExportacion);
    $('stock-exp-reporte').addEventListener('click', generarReporte);
    const contenedorChips = $('stock-exp-chips-columnas');
    if (contenedorChips) {
        contenedorChips.addEventListener('dragover', (e) => {
            if (arrastrandoCol) {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            }
        });
        contenedorChips.addEventListener('drop', (e) => {
            if (arrastrandoCol && (e.target === contenedorChips
                || e.target.classList?.contains('stock-chip-ayuda'))) {
                e.preventDefault();
                const origen = exportacion?.columnas?.indexOf(arrastrandoCol) ?? -1;
                if (origen !== -1 && origen !== exportacion.columnas.length - 1) {
                    exportacion.columnas.splice(origen, 1);
                    exportacion.columnas.push(arrastrandoCol);
                    animarModal('stockExportModal', renderColumnas);
                }
            }
        });
    }
    $('stock-exp-volver').addEventListener('click', () => {
        mostrarPasoSeleccion(true);
    });
    $('stock-exp-copiar').addEventListener('click', async () => {
        const txt = $('stock-exp-preview-texto');
        if (!txt || !txt.value.trim()) return;
        const lineas = txt.value.trim().split('\n').filter(Boolean);
        const cant = lineas.length;
        const msj = `${cant} IP${cant === 1 ? '' : 's'} copiada${cant === 1 ? '' : 's'} al portapapeles.`;
        if (window.copiarAlPortapapeles) {
            await window.copiarAlPortapapeles(txt.value, msj);
        } else if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(txt.value);
            toast(msj, 'success');
        } else {
            txt.focus();
            txt.select();
            document.execCommand('copy');
            toast(msj, 'success');
        }
    });
})();
