// Pestaña "Stock": todos los dispositivos del parque (cámaras, grabadores, monitores, teclados, ...), instalados,
// guardados o fuera de servicio, agrupados en acordeones (como Cámaras y Servidores) según el criterio elegido.
// Opciones: nuevo dispositivo y edición (modal; solo si el usuario tiene rol operador o admin: `editable`), actualizar,
// exportar (reporte por grupos, lista de IPs, CSV), conciliar con el último escaneo (modal) y agrupar.
// Las reglas (listas cerradas, formatos, unicidad, versión) las aplica el servidor; acá solo se arma el pedido.
//
// La consulta es LOCAL (la base de stock del servidor, sin tráfico a los equipos): se pide al abrir la pestaña y con
// «Actualizar»; no hay polling. "En uso" y "disponible" llegan calculados del servidor (una sola definición).
// Todo pasa por apiFetch() (app.js) y se pinta con textContent; claves que vienen de datos: Map, nunca {}.

// (La lógica pura de este archivo vive en static/stock-puro.js, que se carga antes: lo prueba tests/js con los marcadores
// STOCK PURO.)


// Modelo en un formulario de alta (individual o en lote): llena la lista con los modelos que ya existen (de la marca escrita) y,
// si lo escrito se parece a uno existente sin ser igual, avisa «¿Quisiste decir…?» con un botón para usarlo, para no cargar un
// modelo con una letra de más o de menos. Los elementos: `marcaEl`/`modeloEl` (inputs), `avisoEl` (donde sale el aviso) y
// `listaEl` (el <datalist> del modelo).
function stockSugerirModelos({ dispositivos, marcaEl, modeloEl, avisoEl, listaEl }) {
    const sugeridos = stockModelosSugeridos(dispositivos, marcaEl.value);
    listaEl.replaceChildren(...sugeridos.map(v => new Option(v, v)));
    const parecido = modeloEl.disabled ? null : stockModeloParecido(modeloEl.value, sugeridos);
    avisoEl.replaceChildren();
    avisoEl.classList.toggle('d-none', !parecido);
    if (!parecido) return;
    const usar = uiNodo('button', 'btn btn-sm btn-outline-secondary py-0 ms-2', 'Usar');
    usar.type = 'button';
    usar.addEventListener('click', () => {
        modeloEl.value = parecido;
        stockSugerirModelos({ dispositivos, marcaEl, modeloEl, avisoEl, listaEl });
        modeloEl.focus();
    });
    avisoEl.append(uiNodo('span', '', `¿Quisiste decir «${parecido}»?`), usar);
}

(function initStock() {
    const $ = (id) => document.getElementById(id);
    const tab = $('v-pills-stock-tab');
    if (!tab) return;

    // El modal crece o se achica suave mientras `cambiar()` toca su contenido: la MISMA animación de los modales de
    // detalle de stock de Estado (animarAlturaDe de animaciones.js sobre el cuerpo: congela el alto, aplica y lo lleva
    // al nuevo; sin animación si el modal no se ve o se prefiere movimiento reducido). Listar, Catálogos y Conciliación.
    // Sin recortar: el cuerpo es el que scrollea (con el recorte se iba la barra y el contenido se ensanchaba).
    const animarModal = (idModal, cambiar) =>
        animarAlturaDe(document.querySelector(`#${idModal} .modal-body`), cambiar, { recortar: false });

    const CLAVE_AGRUPAR = 'cctv_stock_agrupar';
    const CLAVE_MODO_VISTA = 'cctv_stock_vista_modo';
    const CLAVE_SUBGRUPOS = 'cctv_stock_subgrupos_colapsados';
    const CLAVE_ORDEN = 'cctv_stock_orden';
    const CLAVE_COLUMNAS = 'cctv_stock_columnas';          // orden de las columnas de la lista (arreglo JSON)

    function leerSubgruposColapsados() {
        const guardados = (typeof storage !== 'undefined') ? storage.getJSON(CLAVE_SUBGRUPOS, []) : [];
        return new Set(Array.isArray(guardados) ? guardados : []);
    }

    function guardarSubgruposColapsados(conjunto) {
        if (typeof preferencias !== 'undefined') {
            preferencias.setJSON(CLAVE_SUBGRUPOS, Array.from(conjunto));
        }
    }
    let datos = null;            // última respuesta válida de /api/stock
    let porId = new Map();
    let etiquetasTipo = new Map();
    let catalogo = stockCatalogo([]);
    let criterio = leerCriterio();
    let modoVista = leerModoVista();
    let ordenColumnas = leerColumnas();                    // claves de las columnas de la lista, en su orden
    let [ordenColumna, ordenDir] = leerOrden();             // la columna de la lista por la que se ordena (o ninguna)

    function leerModoVista() {
        if (uiEsMovil()) return 'tarjetas';                    // la lista no entra en un celular (lo guardado queda para la PC)
        const guardado = (typeof storage !== 'undefined') ? storage.get(CLAVE_MODO_VISTA, 'lista') : 'lista';
        return guardado === 'tarjetas' ? 'tarjetas' : 'lista';
    }

    function guardarModoVista(nuevoModo) {
        modoVista = nuevoModo;
        if (typeof preferencias !== 'undefined') {
            preferencias.set(CLAVE_MODO_VISTA, nuevoModo);
        }
    }

    function armarMapaCamaras() {
        const mapa = new Map();
        const cams = uiCamarasCargadas();
        // Canales totales del grabador de cada cámara: el que informó el equipo si se lo consultó, si no el estimado por modelo
        const capacidadPorNvr = new Map();
        for (const nvr of uiNvrsCargados()) {
            const consultada = typeof capacidadConsultadaNvr === 'function' ? capacidadConsultadaNvr(nvr.ip) : null;
            capacidadPorNvr.set(nvr.ip, Number(consultada || obtenerCapacidadCanalesNvr(nvr.modelo)) || 0);
        }
        const capacidadDe = (cam) => capacidadPorNvr.get(cam.nvr_ip) || 0;
        const poner = (clave, cam) => mapa.set(clave, stockCamaraRepresentante(mapa.get(clave), cam, capacidadDe));
        for (const camItem of cams) {
            if (camItem.mac_address) poner(String(camItem.mac_address).trim().toUpperCase(), camItem);
            if (camItem.ip_address) poner(String(camItem.ip_address).trim(), camItem);
        }
        return mapa;
    }
    let cargaEnCurso = null;     // promesa de la carga de /api/stock en vuelo
    let cargaSiguiente = null;   // la que se encadena si piden otra mientras esa vuela
    let editando = null;         // dispositivo abierto en el modal (null = alta)
    let guardando = false;
    let confirmarEliminar = false;   // borrado en dos pasos: el primer click pide confirmación (3 s: después vuelve solo)
    const vencerConfirmarEliminar = uiConfirmacionTemporizada(() => { if (confirmarEliminar) botonEliminar(false); });
    let desdeCamaras = false;        // el modal se abrió desde Cámaras/Servidores (al guardar, refrescar el panel)
    let revisando = false;
    // Modo selección (static/stock-seleccion.js, se carga después y completa estos ganchos): lo que stock.js necesita saber
    // para no abrir el popup mientras se elige, ofrecer «Seleccionar» y repintar las marcas tras cada render. `listar` lo completa
    // stock-listar.js: abre «Listar» con lo seleccionado.
    // stock-alta-lote.js completa estos ganchos: el botón «Lotes» (se muestra en el alta de un dispositivo nuevo) y guardar un lote
    const altaLote = { sincronizarBoton: () => {}, guardar: () => {} };
    const seleccion = { activo: () => false, alternar: (_id) => {}, entrar: null, pintar: () => {}, repintarLista: () => {}, listar: null, cambiarDatos: null };
    let modoModal = 'lectura';
    let _dispActual = null;
    let _camActual = null;
    let _vistoEn = '';          // dónde ve el monitoreo al dispositivo abierto ('' = no lo ve)
    let _escaneoDe = null;      // { ip, firmware } que informó el escaneo de ese dispositivo (null = no lo ve)
    let _origenProd = false;
    let _terminoBusquedaActivo = '';
    let tituloLectura = '';
    const _subgruposColapsados = leerSubgruposColapsados();

    const mostrarError = (texto) => uiMostrarBanner($('stock-error'), texto);
    const mostrarErrorForm = (texto) => uiMostrarBanner($('stock-form-error'), texto);
    const celda = uiCelda;
    const toast = (mensaje, tipo) => mostrarToast(mensaje, tipo);
    const modal = (id) => ({ show: () => UI.modal.abrir($(id)), hide: () => UI.modal.cerrar($(id)) });

    // «columna:asc|desc» guardado (se recuerda como el agrupamiento); lo que no se reconoce, sin orden
    function leerOrden() {
        const guardado = String((typeof storage !== 'undefined') ? storage.get(CLAVE_ORDEN, '') : '').split(':');
        return STOCK_COLUMNAS_ORDEN.has(guardado[0]) && (guardado[1] === 'asc' || guardado[1] === 'desc')
            ? [guardado[0], guardado[1]] : [null, 'asc'];
    }

    function leerColumnas() {
        return stockOrdenColumnas(typeof storage !== 'undefined' ? storage.get(CLAVE_COLUMNAS, '') : '');
    }

    function alternarOrden(columna) {
        if (!STOCK_COLUMNAS_ORDEN.has(columna)) return;
        if (ordenColumna === columna) ordenDir = ordenDir === 'asc' ? 'desc' : 'asc';
        else { ordenColumna = columna; ordenDir = 'asc'; }
        if (typeof preferencias !== 'undefined') preferencias.set(CLAVE_ORDEN, `${ordenColumna}:${ordenDir}`);
        if (datos) renderLista({ animar: true });
    }

    function leerCriterio() {
        const guardado = (typeof storage !== 'undefined') ? storage.get(CLAVE_AGRUPAR, '') : '';
        return STOCK_AGRUPAMIENTOS.has(guardado) ? guardado : STOCK_AGRUPAMIENTOS.keys().next().value;
    }

    function poblarSelect(sel, opciones, etiquetaTodos = null) {
        const previo = sel.value;
        sel.replaceChildren();
        if (etiquetaTodos !== null) sel.add(new Option(etiquetaTodos, ''));
        for (const [valor, texto] of opciones) sel.add(new Option(texto, valor));
        if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    }

    // Tipo agrupado por grupo (<optgroup>): un solo select («Cámaras › Domo», «Servidores › NVR»...)
    function poblarSelectTipos(sel, grupos) {
        const previo = sel.value;
        sel.replaceChildren(...grupos.map(g => {
            const og = document.createElement('optgroup');
            og.label = g.etiqueta;
            og.append(...g.tipos.map(t => new Option(t.etiqueta, t.clave)));
            return og;
        }));
        if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    }

    // ------------------------------------------------------------------ agrupamiento
    function renderMenuAgrupar() {
        $('stock-agrupar-texto').textContent = STOCK_AGRUPAMIENTOS.get(criterio);
        $('stock-agrupar-menu').replaceChildren(...[...STOCK_AGRUPAMIENTOS.entries()].map(([clave, texto]) => {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `dropdown-item${clave === criterio ? ' active' : ''}`;
            b.dataset.stockAgrupar = clave;
            b.textContent = texto;
            li.appendChild(b);
            return li;
        }));
    }

    function badgeCondicion(td, c) {
        const b = document.createElement('span');
        const clase = c === 'operativo' ? 'success' : (c === 'revisar' ? 'warning' : 'danger');
        b.className = `badge bg-${clase}`;           // la insignia normalizada: color lleno, texto -on del tema
        b.textContent = stockCondicionTexto(c);
        td.appendChild(b);
    }

    // Chevron, título y contador de un subgrupo: iguales en la lista (fila) y en las tarjetas (encabezado)
    function nodosSubgrupo(sub) {
        return [uiNodo('i', 'bi bi-chevron-down stock-subgrupo-chevron me-1'),
            uiNodo('span', 'fw-semibold text-main small', sub.titulo),
            uiNodo('span', 'badge rounded-pill bg-secondary ms-1', String(sub.items.length))];
    }

    // Las columnas de la lista tal como las arma `renderFilaDispositivo` (la imagen y después estas, en este orden de fábrica);
    // lo que cambia con el orden elegido es dónde se ponen sus celdas (`ordenarCeldas`) y sus encabezados
    const COLUMNA_IMAGEN = { titulo: '', clase: 'col-stock-img' };
    const COLUMNAS_LISTA = new Map([
        ['tipo', { titulo: 'Tipo / Estado', clase: 'col-stock-tipo', orden: 'tipo' }],
        ['mac', { titulo: 'MAC / Serie', clase: 'col-stock-mac', orden: 'mac' }],
        ['modelo', { titulo: 'Modelo / Marca', clase: 'col-stock-mod', orden: 'modelo' }],
        ['patrimonio', { titulo: 'Patrimonio / Firmware', clase: 'col-stock-pat', orden: 'patrimonio' }],
        ['ubicacion', { titulo: 'Descripción / Ubicación', clase: 'col-stock-ubic', orden: 'ubicacion' }],
        ['comentario', { titulo: 'Comentario', clase: 'col-stock-com', orden: 'comentario' }],
    ]);

    // Celdas de una fila (creadas en el orden de fábrica) en el orden de columnas elegido; la imagen sigue primera
    function ordenarCeldas(tr) {
        const fabrica = [...COLUMNAS_LISTA.keys()];
        if (ordenColumnas.every((clave, i) => clave === fabrica[i])) return;
        const celdas = [...tr.cells];
        tr.append(celdas[0], ...ordenColumnas.map(clave => celdas[1 + fabrica.indexOf(clave)]));
    }

    function renderFilaDispositivo(tbody, d, editable) {
        const tr = tbody.insertRow();
        tr.dataset.stockId = d.id;
        tr.tabIndex = 0;
        tr.title = editable ? 'Clic para editar activo' : 'Clic para ver activo';
        if (editable) {
            tr.dataset.stockEditar = d.id;
        }

        // 0. Imagen del modelo (miniatura chica; sin foto, el ícono del tipo)
        const tdImg = celda(tr, '', 'col-stock-img');
        const rutaImg = buscarImagenDispositivo(d.modelo);
        const miniatura = uiNodo('div', 'stock-lista-thumb');
        if (rutaImg) {
            const imgEl = document.createElement('img');
            imgEl.className = 'stock-lista-img';
            imgEl.src = rutaImg;
            imgEl.alt = '';
            imgEl.loading = 'lazy';
            imgEl.onerror = () => {
                imgEl.remove();
                miniatura.appendChild(uiNodo('i', `${stockIconoTipo(d.tipo, catalogo)} text-secondary opacity-50`));
            };
            miniatura.appendChild(imgEl);
        } else {
            miniatura.appendChild(uiNodo('i', `${stockIconoTipo(d.tipo, catalogo)} text-secondary opacity-50`));
        }
        tdImg.appendChild(miniatura);

        // 1. Tipo / Estado (tipo arriba, estado/condición debajo si corresponde)
        const tdTipo = celda(tr, '');
        const tipoDiv = document.createElement('div');
        tipoDiv.className = 'text-nowrap stock-celda-truncate';
        const tipoTxt = stockTipoTexto(d, etiquetasTipo);
        tipoDiv.textContent = tipoTxt;
        tipoDiv.title = tipoTxt;
        const badgeInfo = stockInsigniaLista(d);
        if (badgeInfo) {
            const condDiv = document.createElement('div');
            condDiv.className = 'mt-1';
            const b = document.createElement('span');
            b.className = `badge rounded-pill stock-card-pill stock-pill-${badgeInfo.clase}`;
            b.textContent = badgeInfo.texto;
            b.title = badgeInfo.texto;
            condDiv.appendChild(b);
            tdTipo.append(tipoDiv, condDiv);
        } else {
            tdTipo.appendChild(tipoDiv);
        }

        // 2. MAC / Serie (mac arriba, serie abajo)
        const tdMac = celda(tr, '');
        const macTxt = stockMacTexto(d.mac);
        const serieTxt = d.serie || '';
        const macDiv = document.createElement('div');
        macDiv.className = macTxt ? 'seleccionable font-monospace text-nowrap stock-celda-truncate' : 'text-secondary small text-nowrap';
        macDiv.textContent = macTxt || STOCK_SIN_RELEVAR;
        if (macTxt) macDiv.title = macTxt;
        const serieDiv = document.createElement('div');
        serieDiv.className = 'seleccionable font-monospace text-secondary small text-nowrap stock-celda-truncate';
        serieDiv.textContent = serieTxt || STOCK_SIN_RELEVAR;
        if (serieTxt) serieDiv.title = serieTxt;
        tdMac.append(macDiv, serieDiv);

        // 3. Modelo / Marca (modelo arriba, marca abajo)
        const tdMod = celda(tr, '');
        const modTxt = d.modelo || '';
        const marcaTxt = d.marca || '';
        if (!modTxt && !marcaTxt) {
            tdMod.textContent = STOCK_ND;
            tdMod.className = 'text-secondary';
        } else {
            const modDiv = document.createElement('div');
            modDiv.className = 'fw-medium stock-celda-truncate';
            modDiv.textContent = modTxt || STOCK_ND;
            if (modTxt) modDiv.title = modTxt;
            const marcaDiv = document.createElement('div');
            marcaDiv.className = 'text-secondary small stock-celda-truncate';
            marcaDiv.textContent = marcaTxt || STOCK_ND;
            if (marcaTxt) marcaDiv.title = marcaTxt;
            tdMod.append(modDiv, marcaDiv);
        }

        // 4. Patrimonio / Firmware (patrimonio arriba, firmware debajo)
        const tdPat = celda(tr, '', 'col-stock-pat');
        const patTxt = d.patrimonio || '';
        const fwTxt = d.firmware || '';
        if (!patTxt && !fwTxt) {
            tdPat.textContent = STOCK_ND;
            tdPat.className = 'text-secondary font-monospace col-stock-pat';
        } else {
            const patDiv = document.createElement('div');
            patDiv.className = 'seleccionable font-monospace text-nowrap stock-celda-truncate';
            patDiv.textContent = patTxt || STOCK_ND;
            if (patTxt) patDiv.title = patTxt;
            const fwDiv = document.createElement('div');
            fwDiv.className = 'seleccionable font-monospace text-secondary small text-nowrap stock-celda-truncate';
            fwDiv.textContent = fwTxt || STOCK_ND;
            if (fwTxt) fwDiv.title = fwTxt;
            tdPat.append(patDiv, fwDiv);
        }

        // 5. Ubicación (máximo 2 líneas)
        const ubic = celda(tr, '');
        if (d.instalacion) {
            const desc = document.createElement('div');
            desc.className = 'stock-celda-truncate';
            const descTxt = d.instalacion.descripcion || 'Instalado';
            desc.textContent = descTxt;
            desc.title = descTxt;
            const det = document.createElement('div');
            det.className = 'text-secondary small stock-celda-truncate';
            const detTexto = [d.instalacion.ip, stockUbicacionTexto(d.instalacion)].filter(Boolean).join(' · ');
            det.textContent = detTexto;
            det.title = detTexto;
            ubic.append(desc, det);
        } else {
            ubic.textContent = 'Sin instalar';
            ubic.className = 'text-secondary text-nowrap';
        }

        // 6. Comentario (máximo 2 líneas)
        const tdCom = celda(tr, '');
        const comTexto = [d.comentario, d.instalacion && d.instalacion.comentario].filter(Boolean).join(' | ');
        if (comTexto) {
            const comDiv = document.createElement('div');
            comDiv.className = 'stock-celda-clamp2';
            comDiv.textContent = comTexto;
            comDiv.title = comTexto;
            tdCom.appendChild(comDiv);
        } else {
            tdCom.textContent = STOCK_ND;
            tdCom.className = 'text-secondary';
        }
        ordenarCeldas(tr);
    }

    // Pulsación larga (o Shift + clic) en el encabezado de un subgrupo: abre o cierra TODOS los del grupo (si el
    // presionado estaba abierto, se cierran; si no, se abren). El clic normal sigue con uno solo. (`uiAtajoPulsacionLarga`)
    function atajoTodosLosSubgrupos(header, subgrupos, propio) {
        uiAtajoPulsacionLarga(header, () => {
            const colapsar = !propio.colapsado();
            for (const sg of subgrupos) sg.fijar(colapsar);
            guardarSubgruposColapsados(_subgruposColapsados);
        });
    }

    function tablaGrupo(items, editable, subsecciones = null, idGrupo = '') {
        const caja = document.createElement('div');
        caja.className = 'table-responsive';
        const tabla = document.createElement('table');
        tabla.className = 'table table-hover table-sm align-middle mb-0 small tabla-stock';
        const trh = tabla.createTHead().insertRow();
        const columnas = [COLUMNA_IMAGEN, ...ordenColumnas.map(clave => COLUMNAS_LISTA.get(clave))];
        function crearColgroup() {
            const cg = document.createElement('colgroup');
            for (const col of columnas) {
                const colEl = document.createElement('col');
                if (col.clase) colEl.className = col.clase;
                cg.appendChild(colEl);
            }
            return cg;
        }
        tabla.appendChild(crearColgroup());
        for (const col of columnas) {
            const th = document.createElement('th');
            th.textContent = col.titulo;
            if (col.clase) th.className = col.clase;
            if (col.orden) {                       // ordenable (como la tabla de Auditoría de video): flecha según el estado
                const activa = ordenColumna === col.orden;
                th.dataset.sort = col.orden;
                th.title = 'Clic: ordenar. Mantené presionado y arrastrá: mover la columna';
                th.tabIndex = 0;
                th.setAttribute('role', 'columnheader');
                th.setAttribute('aria-sort', activa ? (ordenDir === 'desc' ? 'descending' : 'ascending') : 'none');
                th.append(' ', uiNodo('i', activa ? `bi ${ordenDir === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up'} ms-1 text-primary`
                    : 'bi bi-arrow-down-up ms-1 text-secondary opacity-50'));
            }
            trh.appendChild(th);
        }
        const buscando = !!terminoBusquedaActual().trim();

        if (Array.isArray(subsecciones) && subsecciones.length > 0) {
            const subgrupos = [];
            for (const sub of subsecciones) {
                if (!sub.items.length) continue;
                const claveSub = `${idGrupo}-${sub.clave}`;
                const estaColapsado = !buscando && _subgruposColapsados.has(claveSub);

                const tbodySub = tabla.createTBody();
                tbodySub.className = 'stock-subgrupo-tbody';
                if (estaColapsado) {
                    tbodySub.classList.add('stock-subgrupo-colapsado');
                }

                const trSub = tbodySub.insertRow();
                trSub.className = 'stock-subgrupo-fila';
                trSub.tabIndex = 0;
                trSub.setAttribute('role', 'button');
                trSub.setAttribute('aria-expanded', String(!estaColapsado));

                const tdSub = trSub.insertCell();
                tdSub.colSpan = columnas.length;
                tdSub.className = 'stock-subgrupo-celda';

                const divSub = document.createElement('div');
                divSub.className = 'd-flex align-items-center gap-2';

                divSub.append(...nodosSubgrupo(sub));
                tdSub.appendChild(divSub);

                const trCuerpo = tbodySub.insertRow();
                trCuerpo.className = 'stock-subgrupo-cuerpo-tr';

                const tdCuerpo = trCuerpo.insertCell();
                tdCuerpo.colSpan = columnas.length;
                tdCuerpo.className = 'p-0 border-0';

                const colWrapper = document.createElement('div');
                colWrapper.className = estaColapsado ? 'grid-collapse' : 'grid-collapse show';

                const subTablaWrap = document.createElement('div');

                const subTabla = document.createElement('table');
                subTabla.className = 'table table-hover table-sm align-middle mb-0 small tabla-stock';
                subTabla.appendChild(crearColgroup());

                const tbodyInner = subTabla.createTBody();
                for (const d of sub.items) {
                    renderFilaDispositivo(tbodyInner, d, editable);
                }

                subTablaWrap.appendChild(subTabla);
                colWrapper.appendChild(subTablaWrap);
                tdCuerpo.appendChild(colWrapper);

                const subgrupo = {
                    colapsado: () => tbodySub.classList.contains('stock-subgrupo-colapsado'),
                    fijar: (colapsar) => {
                        tbodySub.classList.toggle('stock-subgrupo-colapsado', colapsar);
                        colWrapper.classList.toggle('show', !colapsar);
                        trSub.setAttribute('aria-expanded', String(!colapsar));
                        if (colapsar) _subgruposColapsados.add(claveSub);
                        else _subgruposColapsados.delete(claveSub);
                    }
                };
                subgrupos.push(subgrupo);
                atajoTodosLosSubgrupos(trSub, subgrupos, subgrupo);
                const toggleSub = () => {
                    subgrupo.fijar(!subgrupo.colapsado());
                    guardarSubgruposColapsados(_subgruposColapsados);
                };
                trSub.addEventListener('click', toggleSub);
                trSub.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        toggleSub();
                    }
                });
            }
        } else {
            const tbody = tabla.createTBody();
            for (const d of items) {
                renderFilaDispositivo(tbody, d, editable);
            }
        }

        caja.appendChild(tabla);
        return caja;
    }

    function crearIconoFallback(tipo) {
        return uiNodo('i', `${stockIconoTipo(tipo, catalogo)} text-secondary fs-3 opacity-50`);
    }

    function renderTarjetaDispositivo(contenedor, item, editable, mapaCamaras) {
        const camara = mapaCamaras ? (
            (item.mac && mapaCamaras.get(String(item.mac).trim().toUpperCase())) ||
            (item.instalacion && item.instalacion.ip && mapaCamaras.get(String(item.instalacion.ip).trim())) ||
            null
        ) : null;

        const cardInfo = stockTarjetaDatos(item, camara, etiquetasTipo);

        const card = document.createElement('div');
        card.className = 'stock-card';
        card.dataset.stockId = item.id;
        card.tabIndex = 0;
        card.title = editable ? 'Clic para editar activo' : 'Clic para ver activo';
        if (editable) {
            card.dataset.stockEditar = item.id;
        }

        // Miniatura izquierda
        const thumb = document.createElement('div');
        thumb.className = 'stock-card-thumb';
        const rutaImg = buscarImagenDispositivo(item.modelo);
        if (rutaImg) {
            const imgEl = document.createElement('img');
            imgEl.className = 'stock-card-img';
            imgEl.src = rutaImg;
            imgEl.alt = item.modelo || 'Dispositivo';
            imgEl.onerror = () => {
                imgEl.remove();
                thumb.appendChild(crearIconoFallback(item.tipo));
            };
            thumb.appendChild(imgEl);
        } else {
            thumb.appendChild(crearIconoFallback(item.tipo));
        }
        card.appendChild(thumb);

        // Bloque de información derecha
        const info = document.createElement('div');
        info.className = 'stock-card-info';

        // Fila 1: Título e Insignia / Ubicación
        const fila1 = document.createElement('div');
        fila1.className = 'd-flex justify-content-between align-items-center gap-2 mb-1';

        const tituloSpan = document.createElement('span');
        tituloSpan.className = 'stock-card-titulo fw-semibold text-truncate';
        tituloSpan.textContent = cardInfo.titulo;
        tituloSpan.title = cardInfo.titulo;
        fila1.appendChild(tituloSpan);

        if (cardInfo.badgeTexto) {
            const pillSpan = document.createElement('span');
            pillSpan.className = `badge rounded-pill stock-card-pill stock-pill-${cardInfo.badgeClase}`;
            pillSpan.textContent = cardInfo.badgeTexto;
            pillSpan.title = cardInfo.badgeTexto;
            fila1.appendChild(pillSpan);
        }
        info.appendChild(fila1);

        // Fila 2: Modelo y Grabador · Canal
        const fila2 = document.createElement('div');
        fila2.className = 'd-flex justify-content-between align-items-center gap-2 mb-1 small text-secondary stock-card-sub';

        const modeloSpan = document.createElement('span');
        modeloSpan.className = 'text-truncate fw-medium text-main';
        modeloSpan.textContent = cardInfo.modelo;
        modeloSpan.title = cardInfo.modelo;
        fila2.appendChild(modeloSpan);

        if (cardInfo.nvrCanal) {
            const canalSpan = document.createElement('span');
            canalSpan.className = 'text-truncate text-end flex-shrink-0';
            canalSpan.textContent = cardInfo.nvrCanal;
            canalSpan.title = cardInfo.nvrCanal;
            fila2.appendChild(canalSpan);
        }
        info.appendChild(fila2);

        // Fila 3: S/N y Patrimonio, e IP
        const fila3 = document.createElement('div');
        fila3.className = 'd-flex justify-content-between align-items-center gap-2 text-secondary stock-card-pie';

        const serieSpan = document.createElement('span');
        serieSpan.className = 'text-truncate font-monospace small';
        serieSpan.textContent = cardInfo.seriePat || STOCK_ND;
        if (cardInfo.seriePat) serieSpan.title = cardInfo.seriePat;
        fila3.appendChild(serieSpan);

        if (cardInfo.ip) {
            const ipSpan = document.createElement('span');
            ipSpan.className = 'font-monospace small text-end text-nowrap flex-shrink-0';
            ipSpan.textContent = cardInfo.ip;
            ipSpan.title = cardInfo.ip;
            fila3.appendChild(ipSpan);
        }
        info.appendChild(fila3);

        card.appendChild(info);
        contenedor.appendChild(card);
    }

    function tarjetasGrupo(items, editable, mapaCamaras, subsecciones = null, idGrupo = '') {
        if (Array.isArray(subsecciones) && subsecciones.length > 0) {
            const contenedor = document.createElement('div');
            contenedor.className = 'stock-subgrupos-tarjetas';
            const buscando = !!terminoBusquedaActual().trim();

            const subgrupos = [];
            for (const sub of subsecciones) {
                if (!sub.items.length) continue;
                const claveSub = `${idGrupo}-${sub.clave}`;
                const estaColapsado = !buscando && _subgruposColapsados.has(claveSub);

                const bloque = document.createElement('div');
                bloque.className = 'stock-subgrupo-bloque';
                if (estaColapsado) {
                    bloque.classList.add('stock-subgrupo-colapsado');
                }

                const header = document.createElement('button');
                header.type = 'button';
                header.className = 'stock-subgrupo-header d-flex align-items-center gap-2 px-3 py-2 w-100 text-start';
                header.setAttribute('aria-expanded', String(!estaColapsado));

                header.append(...nodosSubgrupo(sub));

                const colWrapper = document.createElement('div');
                colWrapper.className = estaColapsado ? 'grid-collapse' : 'grid-collapse show';

                const gridWrap = document.createElement('div');

                const grid = document.createElement('div');
                grid.className = 'stock-cards-grid';
                for (const item of sub.items) {
                    renderTarjetaDispositivo(grid, item, editable, mapaCamaras);
                }
                gridWrap.appendChild(grid);
                colWrapper.appendChild(gridWrap);

                const subgrupo = {
                    colapsado: () => bloque.classList.contains('stock-subgrupo-colapsado'),
                    fijar: (colapsar) => {
                        bloque.classList.toggle('stock-subgrupo-colapsado', colapsar);
                        colWrapper.classList.toggle('show', !colapsar);
                        header.setAttribute('aria-expanded', String(!colapsar));
                        if (colapsar) _subgruposColapsados.add(claveSub);
                        else _subgruposColapsados.delete(claveSub);
                    }
                };
                subgrupos.push(subgrupo);
                atajoTodosLosSubgrupos(header, subgrupos, subgrupo);
                const toggleSub = () => {
                    subgrupo.fijar(!subgrupo.colapsado());
                    guardarSubgruposColapsados(_subgruposColapsados);
                };
                header.addEventListener('click', toggleSub);

                bloque.append(header, colWrapper);
                contenedor.appendChild(bloque);
            }
            return contenedor;
        }

        const caja = document.createElement('div');
        caja.className = 'stock-cards-grid';
        for (const item of items) {
            renderTarjetaDispositivo(caja, item, editable, mapaCamaras);
        }
        return caja;
    }

    // Un acordeón con el MISMO marcado que Cámaras/Servidores (app.js maneja apertura, animación y cuál queda abierto)
    function itemAcordeon(id, abierto, etiqueta, cantidad, cuerpo) {
        return uiItemAcordeon({ id, abierto, titulo: etiqueta, claseTitulo: 'stock-acordeon-titulo',   // naranja, abierto o cerrado
            insignias: [{ texto: String(cantidad), clase: 'bg-secondary' }], cuerpo });
    }

    let camposStockActuales = null;

    function obtenerCamposStockActivos() {
        if (camposStockActuales) return camposStockActuales;
        if (typeof busqCamposActivos !== 'undefined' && busqCamposActivos) return busqCamposActivos;
        return null;
    }

    function visibles() {
        return datos ? stockFiltrar(datos.dispositivos, terminoBusquedaActual(), etiquetasTipo, obtenerCamposStockActivos(), catalogo) : [];
    }

    function contarStockActual(term) {
        const campos = obtenerCamposStockActivos();
        const fuenteStock = datos || window.obtenerCacheStock();
        if (fuenteStock && Array.isArray(fuenteStock.dispositivos)) {
            const etiq = (datos ? etiquetasTipo : stockEtiquetas(fuenteStock.tipos));
            // con el catálogo, como la lista: sin él «servidores» contaría solo NVR/DVR (23 en vez de 27)
            const cat = datos ? catalogo : stockCatalogo(fuenteStock.grupos);
            return stockFiltrar(fuenteStock.dispositivos, term, etiq, campos, cat).length;
        }
        const cams = uiCamarasCargadas();
        const nvrs = uiNvrsCargados();
        const camsStock = cams.filter(camItem => camItem.stock && cumpleFiltroCamara(camItem, term, campos || currentSearchField));
        const nvrsStock = nvrs.filter(nvrItem => nvrItem.stock && cumpleFiltroNVR(nvrItem, term, campos || currentSearchField));
        return camsStock.length + nvrsStock.length;
    }

    function actualizarBadgeStock(term) {
        const texto = String(term !== undefined ? term : terminoBusquedaActual()).trim();
        if (!texto) {
            window.actualizarBadgePestana('v-pills-stock-tab', 0, false);
            return;
        }
        const cant = contarStockActual(texto);
        window.actualizarBadgePestana('v-pills-stock-tab', cant, true);
    }

    // Rendimiento: abrir la pestaña (o recargar /api/stock sin cambios) no rearma cientos de filas/tarjetas si lo que se
    // ve sería idéntico. La firma junta todo lo que cambia la lista; las tarjetas usan además el canal de cada cámara.
    let firmaDatos = '';                      // JSON de la última respuesta de /api/stock
    let firmaPintada = null;                  // firma de lo que está en pantalla
    function firmaRender() {
        const campos = obtenerCamposStockActivos();
        let camaras = '';
        if (modoVista === 'tarjetas') {
            camaras = uiCamarasCargadas().map(cam => `${cam.ip_address}|${cam.mac_address}|${cam.nvr_name}|${cam.channel_id}`).join(';');
        }
        return [firmaDatos, criterio, modoVista, `${ordenColumna}:${ordenDir}`, ordenColumnas.join(), terminoBusquedaActual(), campos ? [...campos].sort().join(',') : '*',
            camaras].join('\u0000');
    }
    function renderListaSiCambio() {
        if (datos && firmaRender() !== firmaPintada) renderLista();
    }

    let criterioPintado = null;          // el agrupamiento de la última lista pintada
    let _stockCargaAnimada = false;

    function renderLista(opciones = {}) {
        const acordeon = $('stock-accordion');
        if (postergarSiAnima(acordeon.id, () => renderLista(opciones))) return;
        firmaPintada = firmaRender();
        const editable = !!(datos && datos.editable);
        $('stock-vacio-base').classList.toggle('d-none', !datos || datos.inicializado || editable);
        for (const id of ['stock-nuevo', 'stock-catalogo']) {          // la fila de Ajustes se va con su botón
            $(id).classList.toggle('d-none', !editable);
            $(id).closest('.ajuste-fila')?.classList.toggle('d-none', !editable);
        }
        $('stock-ubicaciones').classList.toggle('d-none', !editable);
        $('stock-solo-lectura').classList.toggle('d-none', !datos || editable);
        const hayDisp = Boolean(datos && datos.dispositivos && datos.dispositivos.length);
        if ($('stock-exportar')) $('stock-exportar').disabled = !hayDisp;
        document.querySelectorAll('[data-stock-exportar]').forEach(b => { b.disabled = !hayDisp; });
        renderMenuAgrupar();

        const btnLista = $('stock-btn-vista-lista');
        const btnTarjetas = $('stock-btn-vista-tarjetas');
        if (btnLista) btnLista.classList.toggle('active', modoVista === 'lista');
        if (btnTarjetas) btnTarjetas.classList.toggle('active', modoVista === 'tarjetas');

        const buscando = !!terminoBusquedaActual().trim();
        const vis = visibles();
        const abiertos = buscando ? null : leerAcordeonAbierto(acordeon);
        const usados = new Set();
        const mapaCamaras = modoVista === 'tarjetas' ? armarMapaCamaras() : null;

        // «Sin agrupar» es un grupo más, «Todos», con su contador; abierto al elegirlo (después se recuerda como cualquier grupo)
        const sinAgrupar = criterio === 'ninguno';
        const abrirTodos = sinAgrupar && criterioPintado !== criterio;
        criterioPintado = criterio;
        const comparador = ordenColumna ? stockComparadorColumna(ordenColumna, ordenDir, etiquetasTipo) : null;
        const nuevosHijos = stockAgruparBloques(vis, criterio, etiquetasTipo, catalogo, comparador).map(g => {
            const id = stockIdGrupo(criterio, g.etiqueta, usados);
            const subsecciones = (criterio === 'edificio' || criterio === 'modelo-firmware' || criterio === 'tipo')
                ? stockSubsecciones(g.items, criterio, etiquetasTipo, catalogo)
                : null;
            const cuerpo = (modoVista === 'tarjetas')
                ? tarjetasGrupo(g.items, editable, mapaCamaras, subsecciones, id)
                : tablaGrupo(g.items, editable, subsecciones, id);
            return itemAcordeon(id, buscando || abrirTodos || abiertos.has(id), g.etiqueta, g.items.length, cuerpo);
        });

        const aplicarDOM = () => {
            acordeon.replaceChildren(...nuevosHijos);
            restaurarSeleccionStock(acordeon);
            seleccion.repintarLista();
            const vacio = $('stock-vacio');
            const hayDatos = !!datos && datos.dispositivos.length > 0;
            vacio.classList.toggle('d-none', !datos || vis.length > 0 || (!hayDatos && !editable && !datos.inicializado));
            vacio.textContent = hayDatos ? 'Ningún dispositivo coincide con la búsqueda.' : 'No hay dispositivos cargados.';
            sincronizarAlturasSticky();
            if (!_stockCargaAnimada && nuevosHijos.length > 0) {
                _stockCargaAnimada = true;
                if (typeof animarCargaBlur === 'function') animarCargaBlur(acordeon, { duracion: 650 });
                document.documentElement.removeAttribute('data-cargando-lista');
            }
        };

        // Sale lo que se ve (el acordeón, o el aviso de vacío) y entra lo que quedó visible tras el cambio
        const visible = () => (acordeon.children.length > 0 ? acordeon : ($('stock-vacio') || acordeon));
        mutarContenido(visible(), aplicarDOM, null, visible, Boolean(opciones.animar));
    }

    function sincronizarAlturasSticky() {
        if (typeof document === 'undefined') return;
        const header = document.querySelector('#stock-accordion .accordion-header');
        if (header && header.offsetHeight > 0) {
            document.documentElement.style.setProperty('--stock-header-height', `${header.offsetHeight}px`);
        }
        const th = document.querySelector('#stock-accordion .tabla-stock thead th');
        if (th && th.offsetHeight > 0) {
            document.documentElement.style.setProperty('--stock-th-height', `${th.offsetHeight}px`);
        }
    }

    function restaurarSeleccionStock(acordeon) {
        if (!acordeon) return;
        const sel = window.obtenerDispositivoSeleccionado();
        if (!sel || sel.panel !== 'activos' || !sel.stockId) return;
        if (document.activeElement && document.activeElement !== document.body) return;
        const reItem = acordeon.querySelector(`[data-stock-id="${CSS.escape(sel.stockId)}"]`);
        uiEnfocarSinScroll(reItem);
    }

    // Una carga a la vez, pero sin perder pedidos: la que está en vuelo pudo salir ANTES de un cambio (alta, edición,
    // catálogo), así que un pedido que llega mientras vuela encadena UNA carga más al terminar (los que lleguen en el
    // medio la comparten) y quien la espera ve datos posteriores a su cambio. Antes se descartaba (`if (cargando)
    // return`) y la pantalla podía quedar con el estado anterior al cambio.
    function cargar() {
        if (!cargaEnCurso) {
            cargaEnCurso = cargarUnaVez().finally(() => { cargaEnCurso = null; });
            return cargaEnCurso;
        }
        if (!cargaSiguiente) cargaSiguiente = cargaEnCurso.then(() => { cargaSiguiente = null; return cargar(); });
        return cargaSiguiente;
    }

    async function cargarUnaVez() {
        const boton = $('stock-actualizar');
        if (boton) {
            boton.disabled = true;
            uiBotonOcupado(boton, true, { libre: '', enCurso: '', icono: 'bi bi-arrow-clockwise' });
        }
        mostrarError('');
        try {
            const r = await apiFetchValidado('/api/stock', stockRespuestaValida);
            const firma = JSON.stringify(r);
            if (firma !== firmaDatos || !datos) {
                firmaDatos = firma;
                datos = r;
                porId = new Map(r.dispositivos.map(d => [d.id, d]));
                etiquetasTipo = stockEtiquetas(r.tipos);
                catalogo = stockCatalogo(r.grupos);
            }
            renderListaSiCambio();
            actualizarBadgeStock();
            document.dispatchEvent(new CustomEvent('cctv:stock', { detail: r }));   // resumen del dashboard (app.js)
        } catch (e) {
            uiErrorConsulta(e, mostrarError, 'No se pudo cargar el stock.');
        } finally {
            if (boton) {
                boton.disabled = false;
                uiBotonOcupado(boton, false, { libre: '', icono: 'bi bi-arrow-clockwise' });
            }
        }
    }

    // ------------------------------------------------------------------ modal de alta / edición
    const CAMPOS_FORM = [['tipo', 'stock-f-tipo'], ['condicion', 'stock-f-condicion'],
        ['marca', 'stock-f-marca'], ['modelo', 'stock-f-modelo'], ['serie', 'stock-f-serie'], ['mac', 'stock-f-mac'],
        ['patrimonio', 'stock-f-patrimonio'], ['firmware', 'stock-f-firmware'], ['canales', 'stock-f-canales'],
        ['comentario', 'stock-f-comentario'], ['descripcion', 'stock-f-descripcion'], ['ip', 'stock-f-ip'],
        ['edificio', 'stock-f-edificio'], ['piso', 'stock-f-piso'], ['rack', 'stock-f-rack'], ['puerto', 'stock-f-puerto'],
        ['instComentario', 'stock-f-inst-comentario'], ['grabador', 'stock-f-grabador'], ['canal', 'stock-f-canal']];

    // Producción: aviso según condición/«Instalado» y, si el monitoreo lo ve, sin borrar ni sacarlo de producción
    function actualizarProduccion() {
        const aviso = stockAvisoProduccion({ instalado: $('stock-f-instalado').checked,
            condicion: $('stock-f-condicion').value }, editando, _vistoEn);
        const caja = $('stock-f-aviso-produccion');
        caja.textContent = aviso ? aviso.texto : '';
        caja.className = aviso && modoModal !== 'lectura' ? STOCK_CLASE_AVISO.get(aviso.nivel) : 'd-none';
        const visto = !!_vistoEn && !!editando;
        $('stock-f-condicion').disabled = visto && $('stock-f-condicion').value === STOCK_CONDICION_PRODUCCION;
        $('stock-f-instalado').disabled = visto && $('stock-f-instalado').checked;
        // La IP y el firmware salen del escaneo: no se editan mientras lo vea (si el stock tiene otro valor, se actualiza en
        // Conciliar). Sin firmware informado, el campo sigue editable.
        const bloqueo = (id, valorEscaneo, nombre) => {
            const campo = $(id);
            const bloquear = stockCampoBloqueadoPorEscaneo(visto, _escaneoDe, valorEscaneo);
            campo.disabled = bloquear;
            campo.title = !bloquear ? '' : (campo.value.trim() === valorEscaneo
                ? `${nombre} informado por el escaneo`
                : `${nombre} informado por el escaneo (${valorEscaneo}): el stock tiene otro valor; se actualiza en Conciliar escaneo`);
        };
        bloqueo('stock-f-ip', _escaneoDe && _escaneoDe.ip, 'IP');
        bloqueo('stock-f-firmware', _escaneoDe && _escaneoDe.firmware, 'Firmware');
        const eliminar = $('stock-form-eliminar');
        eliminar.disabled = visto;
        eliminar.title = visto ? 'En producción según el último escaneo: no se puede borrar' : '';
    }

    // Producción manual: el selector de grabador (los NVR/DVR instalados) y el de sus canales, con el que ocupa cada uno.
    // Un grabador no va en el canal de otro: para él no se muestran.
    const nombreDisp = (d) => stockNombreVisible(d, String(d.tipo || '').toUpperCase() || 'Dispositivo');
    function poblarGrabadores(valor) {
        poblarSelect($('stock-f-grabador'), stockGrabadoresAsignables(datos.dispositivos, editando && editando.id, nombreDisp),
            'Sin grabador (otros dispositivos)');
        $('stock-f-grabador').value = [...$('stock-f-grabador').options].some(o => o.value === valor) ? valor : '';
    }
    function poblarCanales(valor) {
        const sel = $('stock-f-canal');
        const canales = stockCanalesDe(datos.dispositivos, $('stock-f-grabador').value, editando && editando.id, nombreDisp);
        sel.replaceChildren(...canales.map(c => {
            const o = new Option(c.ocupante ? `CH ${c.canal} · ${c.ocupante}` : `CH ${c.canal} · libre`, String(c.canal));
            o.disabled = !!c.ocupante;
            return o;
        }));
        const libre = canales.some(c => String(c.canal) === String(valor) && !c.ocupante);
        sel.value = libre ? String(valor) : stockPrimerCanalLibre(canales);
    }
    function sincronizarCanal() {
        const esGrabador = STOCK_TIPOS_GRABADOR.includes($('stock-f-tipo').value);
        if (esGrabador) $('stock-f-grabador').value = '';
        $('stock-f-grabador-fila').classList.toggle('d-none', esGrabador);
        $('stock-f-canal-fila').classList.toggle('d-none', esGrabador || !$('stock-f-grabador').value);
    }

    function sincronizarFormulario() {
        actualizarProduccion();
        sincronizarCanal();
        $('stock-f-inst').classList.toggle('d-none', !$('stock-f-instalado').checked);
        const nuevo = $('stock-f-edificio').value === STOCK_EDIFICIO_NUEVO;
        $('stock-f-edificio-nuevo').classList.toggle('d-none', !nuevo);
        $('stock-f-piso-nuevo').classList.toggle('d-none', $('stock-f-piso').value !== STOCK_PISO_NUEVO);
    }

    function llenarDatalist(id, valores) {
        $(id).replaceChildren(...valores.map(v => new Option(v, v)));
    }

    // Modelo: sugerencias de los que ya existen y «¿Quisiste decir…?» (stockSugerirModelos, compartida con el alta en lote)
    function sugerirModelos() {
        stockSugerirModelos({ dispositivos: datos.dispositivos, marcaEl: $('stock-f-marca'), modeloEl: $('stock-f-modelo'),
            avisoEl: $('stock-f-modelo-aviso'), listaEl: $('stock-dl-modelos-form') });
    }

    function poblarFormulario(d, valores = null) {
        poblarSelectTipos($('stock-f-tipo'), datos.grupos);
        poblarSelect($('stock-f-condicion'), datos.condiciones.map(c => [c, stockCondicionTexto(c)]));
        poblarSelect($('stock-f-edificio'), [...datos.edificios.map(e => [e, e]), [STOCK_EDIFICIO_NUEVO, 'Otro edificio…']],
            'Sin edificio');
        llenarDatalist('stock-dl-marcas', stockValoresUnicos(datos.dispositivos, 'marca'));
        const v = valores || stockValoresDeDispositivo(d);
        poblarSelect($('stock-f-piso'), [...stockOpcionesPiso(datos.pisos, v.piso), [STOCK_PISO_NUEVO, 'Otro piso…']],
            'Sin piso');
        poblarGrabadores(v.grabador);
        for (const [clave, id] of CAMPOS_FORM) if (clave !== 'grabador' && clave !== 'canal') $(id).value = v[clave];
        poblarCanales(v.canal);
        $('stock-f-instalado').checked = v.instalado;
        $('stock-f-edificio-nuevo').value = '';
        $('stock-f-piso-nuevo').value = '';
        sugerirModelos();
        sincronizarFormulario();
    }

    // «NVR Anexo (10.0.0.1) (CH 3)»: el canal de la instalación del dispositivo, o ''
    function textoCanal(d) {
        const i = d && d.instalacion;
        const g = i && i.grabador ? porId.get(i.grabador) : null;
        if (!g) return '';
        const ip = g.instalacion && g.instalacion.ip ? ` (${g.instalacion.ip})` : '';
        return `${nombreDisp(g)}${ip} (CH ${i.canal})`;
    }

    function stockNvrTexto(infoCam) {
        if (!infoCam || (!infoCam.nvr_name && !infoCam.nvr_ip)) return '';
        const nom = infoCam.nvr_name || 'NVR';
        const ipTxt = infoCam.nvr_ip ? ` (${infoCam.nvr_ip})` : '';
        const chNum = uiNumeroCanal(infoCam.channel_id);
        const chTxt = chNum ? ` (CH ${chNum})` : '';
        return `${nom}${ipTxt}${chTxt}`;
    }

    function leerFormulario() {
        const v = Object.create(null);
        for (const [clave, id] of CAMPOS_FORM) v[clave] = $(id).value;
        v.instalado = $('stock-f-instalado').checked;
        return v;
    }

    function botonEliminar(confirmando) {
        confirmarEliminar = confirmando;
        if (confirmando) vencerConfirmarEliminar.armar(); else vencerConfirmarEliminar.cancelar();
        const b = $('stock-form-eliminar');
        b.className = `btn btn-sm me-auto ${confirmando ? 'btn-danger' : 'btn-outline-danger'}`;
        b.classList.toggle('d-none', !editando);
        b.textContent = confirmando ? 'Confirmar' : 'Eliminar';
    }

    // Foto del modelo y, si el activo está en un canal monitoreado, su captura (uiCarruselImagen, como el popup); clic
    // en la captura = el modal ampliado con «Ver en vivo» y, al cerrarlo, se vuelve a este activo
    let _imagenToken = 0;
    function actualizarImagenModal(modelo) {
        const w = $('stock-modal-img-wrapper');
        const img = $('stock-modal-img');
        if (!w || !img) return;
        const token = ++_imagenToken;
        const cam = _camActual;
        const rutaSnapshot = cam ? uiRutaCaptura(cam.nvr_ip, cam.channel_id) : null;
        carruselModal = uiCarruselImagen({
            wrapper: w, img, prev: $('stock-modal-img-prev'), next: $('stock-modal-img-next'),
            rutaModelo: buscarImagenDispositivo(modelo), rutaSnapshot,
            vigente: () => token === _imagenToken,
            alVisible: (hay) => w.classList.toggle('d-none', !hay),
            alAmpliar: cam ? (vista, hayCaptura) => ampliarCaptura(cam, hayCaptura ? rutaSnapshot : '', vista,
                buscarImagenDispositivo(modelo)) : null,
        });
    }
    // La rueda del mouse sobre la imagen alterna la foto del modelo y la captura (como en el popup del equipo)
    let carruselModal = null;
    let ultimaRuedaImagen = 0;
    const wrapperImagenModal = $('stock-modal-img-wrapper');
    if (wrapperImagenModal) {
        wrapperImagenModal.addEventListener('wheel', (e) => {
            if (!carruselModal) return;
            e.preventDefault();
            e.stopPropagation();
            if (Date.now() - ultimaRuedaImagen < 200) return;
            ultimaRuedaImagen = Date.now();
            carruselModal.alternar();
        }, { passive: false });
    }

    function ampliarCaptura(cam, rutaSnapshot, vista = 'captura', rutaModelo = '') {
        if (typeof window.abrirModalSnapshot !== 'function' || !cam || (!rutaSnapshot && !rutaModelo)) return;
        const d = _dispActual;
        const reabrir = () => {
            if (d) abrirModal(d, null, 'lectura');
            else abrirModalDispositivo(cam, 'lectura');
        };
        $('stockModal').addEventListener('ui:modal-cerrado', () => {
            window.abrirModalSnapshot(cam, rutaSnapshot, cam.channel_id, { rutaModelo, vista });
            $('snapshotModal').addEventListener('ui:modal-cerrado', reabrir, { once: true });
        }, { once: true });
        modal('stockModal').hide();
    }

    function renderVistaLectura(d, infoCam) {
        const contenedor = $('stock-vista-lectura-cuerpo');                // columna izquierda: red y dispositivo
        const contenedorInst = $('stock-vista-lectura-instalacion');       // columna derecha: detalles de instalación
        if (!contenedor || !contenedorInst) return;
        contenedor.replaceChildren();
        contenedorInst.replaceChildren();

        const filas = [];

        // --- SECCIÓN 1: RED Y DISPOSITIVO ---
        filas.push({ seccion: 'RED Y DISPOSITIVO' });

        // (sin monitoreo no hay «estado de conexión»: la condición del stock ya está en la ficha)

        const tipoTxt = d ? stockTipoTexto(d, etiquetasTipo) : (infoCam ? 'Cámara' : 'Dispositivo');
        filas.push({ etiqueta: 'Tipo', valor: tipoTxt });

        if (d && d.condicion) {
            const cWrap = uiNodo('span');
            badgeCondicion(cWrap, d.condicion);
            filas.push({ etiqueta: 'Condición', valor: cWrap });
        } else if (infoCam && !d) {
            filas.push({ etiqueta: 'Condición', valor: 'Sin alta en stock', tenue: true });
        }

        const marca = (d && d.marca) || '';
        if (marca) {
            filas.push({ etiqueta: 'Marca', valor: marca });
        }

        const modelo = (d && d.modelo) || (infoCam && (infoCam.modelo || infoCam.stock?.modelo)) || '—';
        const paginaUrl = stockUrlPagina(d && d.pagina_modelo);      // la fija Catálogos > Modelos
        if (paginaUrl) {
            const conEnlace = uiNodo('span', 'd-inline-flex align-items-center gap-2', modelo);
            const enlace = uiNodo('a', 'text-primary');
            enlace.append(uiNodo('i', 'bi bi-box-arrow-up-right'));
            enlace.href = paginaUrl;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            enlace.title = `Página oficial del modelo: ${paginaUrl}`;
            enlace.setAttribute('aria-label', 'Abrir la página oficial del modelo');
            conEnlace.append(enlace);
            filas.push({ etiqueta: 'Modelo', valor: conEnlace });
        } else {
            filas.push({ etiqueta: 'Modelo', valor: modelo });
        }

        const ip = (d && d.instalacion && d.instalacion.ip) || (infoCam && infoCam.ip_address) || '—';
        filas.push({ etiqueta: 'Dirección IP', valor: ip, mono: true });

        const mac = stockMacTexto(d && d.mac) || (infoCam && infoCam.mac_address) || '';
        filas.push({ etiqueta: 'Dirección MAC', valor: mac || STOCK_SIN_RELEVAR, mono: !!mac, tenue: !mac });

        const serie = (d && d.serie) || (infoCam && infoCam.stock?.serie) || '';
        filas.push({ etiqueta: 'Nº Serie', valor: serie || STOCK_SIN_RELEVAR, mono: !!serie, tenue: !serie });

        const pat = (d && d.patrimonio) || '—';
        if (pat !== '—' || d) {
            filas.push({ etiqueta: 'Patrimonio', valor: pat });
        }

        const fw = (d && d.firmware) || (infoCam && infoCam.firmware) || '—';
        filas.push({ etiqueta: 'Firmware', valor: fw });

        const can = (d && d.canales) ? String(d.canales) : (infoCam && infoCam.nvr_canales ? String(infoCam.nvr_canales) : '');
        if (can) {
            filas.push({ etiqueta: 'Canales', valor: can });
        }

        if (d && d.comentario) {
            filas.push({ etiqueta: 'Comentario', valor: d.comentario, tenue: true });
        }

        const filasInst = [];
        // --- SECCIÓN 2: DETALLES DE INSTALACIÓN ---
        filasInst.push({ seccion: 'DETALLES DE INSTALACIÓN' });

        const nvrTxt = textoCanal(d) || stockNvrTexto(infoCam);
        if (nvrTxt) {
            filasInst.push({ etiqueta: 'Grabador (NVR)', valor: nvrTxt });
        }

        const inst = d ? d.instalacion : null;
        const stockCam = infoCam ? infoCam.stock : null;

        if (inst) {
            if (inst.descripcion) {
                filasInst.push({ etiqueta: 'Descripción', valor: inst.descripcion, tenue: true });
            }
            filasInst.push(
                { etiqueta: 'Edificio', valor: inst.edificio || 'Sin edificio' },
                { etiqueta: 'Piso', valor: inst.piso ? `Piso ${inst.piso}` : '—', tenue: !inst.piso },
                { etiqueta: 'Rack', valor: inst.rack ? `Rack ${inst.rack}` : '—', tenue: !inst.rack },
                { etiqueta: 'Puerto', valor: inst.puerto ? `Puerto ${inst.puerto}` : '—', tenue: !inst.puerto, mono: !!inst.puerto }
            );
            if (inst.comentario) {
                filasInst.push({ etiqueta: 'Comentario de instalación', valor: inst.comentario, tenue: true });
            }
        } else if (stockCam) {
            if (stockCam.descripcion) {
                filasInst.push({ etiqueta: 'Descripción', valor: stockCam.descripcion, tenue: true });
            }
            filasInst.push(
                { etiqueta: 'Edificio', valor: stockCam.edificio || 'Sin edificio' },
                { etiqueta: 'Piso', valor: stockCam.piso ? `Piso ${stockCam.piso}` : '—', tenue: !stockCam.piso },
                { etiqueta: 'Rack', valor: stockCam.rack ? `Rack ${stockCam.rack}` : '—', tenue: !stockCam.rack },
                { etiqueta: 'Puerto', valor: stockCam.puerto ? `Puerto ${stockCam.puerto}` : '—', tenue: !stockCam.puerto, mono: !!stockCam.puerto }
            );
        } else if (infoCam) {
            filasInst.push(
                { etiqueta: 'Edificio', valor: 'Sin alta en stock', tenue: true },
                { etiqueta: 'Piso', valor: '—', tenue: true },
                { etiqueta: 'Rack', valor: '—', tenue: true },
                { etiqueta: 'Puerto', valor: '—', tenue: true }
            );
        } else {
            filasInst.push(
                { etiqueta: 'Estado de stock', valor: d.disponible ? 'Disponible para instalar' : 'Sin instalar', tenue: true }
            );
        }

        uiFilas(contenedor, filas);
        uiFilas(contenedorInst, filasInst);
    }

    function cambiarModo(modo) {
        modoModal = modo;
        const esLectura = modo === 'lectura';
        const esLote = modo === 'lote';                 // alta de varios dispositivos de una compra (stock-alta-lote.js)

        const vistaLectura = $('stock-vista-lectura');
        const vistaEdicion = $('stock-vista-edicion');
        const vistaLote = $('stock-vista-lote');
        if (vistaLectura) vistaLectura.classList.toggle('d-none', !esLectura);
        if (vistaEdicion) vistaEdicion.classList.toggle('d-none', modo !== 'edicion');
        if (vistaLote) vistaLote.classList.toggle('d-none', !esLote);

        $('stock-form-titulo').textContent = esLectura
            ? tituloLectura
            : (esLote ? 'Nuevos dispositivos por lote'
                : (editando ? `Editar: ${stockMarcaModelo(editando) || etiquetasTipo.get(editando.tipo) || editando.tipo}` : 'Nuevo dispositivo'));
        altaLote.sincronizarBoton(modo, !editando && !_dispActual && !!datos && datos.editable);

        $('stock-btn-editar').classList.toggle('d-none', !esLectura || !datos || !datos.editable);

        const btnActivo = $('stock-btn-ir-activo');
        if (btnActivo) {
            btnActivo.classList.toggle('d-none', !esLectura || !_origenProd);
        }

        const btnAuditoria = $('stock-btn-auditoria');
        if (btnAuditoria) {
            btnAuditoria.classList.toggle('d-none', !esLectura || (!_camActual?.nvr_ip && (!_dispActual || _dispActual.tipo !== 'nvr')));
        }

        botonEliminar(false);
        if (esLectura) {
            $('stock-form-eliminar').classList.add('d-none');
        }
        actualizarProduccion();
        $('stock-btn-cancelar-edicion').classList.toggle('d-none', esLectura);
        $('stock-form-guardar').classList.toggle('d-none', esLectura);
    }

    // Lectura <-> edición dentro del modal ya abierto: sale lo que había, se cambia y entra lo nuevo (la mutación estándar),
    // y la tarjeta crece o se achica animada (no a saltos). Un segundo pedido a mitad de camino se aplica directo.
    let animandoModo = false;
    function cambiarModoAnimado(modo) {
        const vistas = $('stock-vistas');
        const tarjeta = $('stock-form');
        if (animandoModo || !vistas || !tarjeta || prefiereMovimientoReducido() || !elementoVisible(vistas)) {
            if (animandoModo) { cancelarMutacion(vistas); animandoModo = false; }
            cambiarModo(modo);
            return;
        }
        animandoModo = true;
        fijarAlturaAnimable(tarjeta, false);          // la altura queda quieta mientras sale lo viejo
        fijarOrigenVisible(vistas);
        animarMutacion(vistas, 'salida', () => {
            cambiarModo(modo);
            animarAlturaAlContenido(tarjeta);           // y recién ahora va hasta la altura de lo nuevo
            fijarOrigenVisible(vistas);
            animarMutacion(vistas, 'entrada', () => { vistas.style.transformOrigin = ''; animandoModo = false; });
        });
    }

    function abrirModal(d, valores = null, modo = 'lectura') {
        if (!datos || typeof UI === 'undefined') return;
        mostrarErrorForm('');
        botonEliminar(false);

        _dispActual = d || null;
        _camActual = null;
        _vistoEn = d && typeof globalData !== 'undefined' && globalData
            ? stockVistoEn(d.id, globalData.camaras, globalData.nvrs) : '';
        _escaneoDe = d && typeof globalData !== 'undefined' && globalData
            ? stockDatosEscaneo(d.id, globalData.camaras, globalData.nvrs) : null;
        _origenProd = false;
        _terminoBusquedaActivo = '';

        if (!d && modo !== 'lectura') {
            modo = 'edicion';
        }

        editando = d || null;
        tituloLectura = d ? (stockMarcaModelo(d) || etiquetasTipo.get(d.tipo) || d.tipo) : 'Nuevo dispositivo';

        const chBadgeEl = $('stock-modal-ch');
        if (chBadgeEl) chBadgeEl.classList.add('d-none');

        const iconoEl = $('stock-modal-icono');
        if (iconoEl) {
            if (d && d.tipo === 'nvr') iconoEl.className = 'bi bi-hdd-rack me-2';
            else if (d && d.tipo === 'switch') iconoEl.className = 'bi bi-diagram-3 me-2';
            else iconoEl.className = 'bi bi-box-seam me-2';
        }

        $('stock-historial-bloque').classList.toggle('d-none', !d);
        $('stock-historial').classList.add('d-none');
        $('stock-historial').replaceChildren();

        if (d) {
            const ipD = d.instalacion ? d.instalacion.ip : null;
            const macD = d.mac;
            const mapaCam = armarMapaCamaras();            // con varios grabadores, el más capaz
            _camActual = (ipD && mapaCam.get(String(ipD).trim())) || (macD && mapaCam.get(String(macD).trim().toUpperCase())) || null;
        }

        poblarFormulario(d, valores);

        const mod = d ? d.modelo : (valores ? valores.modelo : '');
        actualizarImagenModal(mod);

        if (d) {
            renderVistaLectura(d, _camActual);
        }

        cambiarModo(d ? modo : 'edicion');
        modal('stockModal').show();
    }

    async function abrirModalDispositivo(item, modo = 'lectura') {
        if (typeof UI === 'undefined') return;
        if (!datos) await cargar();

        if (!item) {
            desdeCamaras = false;
            abrirModal(null, null, 'edicion');
            return;
        }

        if (typeof item === 'string') {
            const d = porId.get(item);
            if (d) {
                desdeCamaras = false;
                abrirModal(d, null, modo);
            }
            return;
        }

        if (item.id && porId.has(item.id)) {
            const d = porId.get(item.id);
            desdeCamaras = false;
            abrirModal(d, null, modo);
            return;
        }

        mostrarErrorForm('');
        botonEliminar(false);

        const cam = item;
        _camActual = cam;
        _origenProd = true;
        _terminoBusquedaActivo = (cam.mac_address && cam.mac_address !== '-' && cam.mac_address !== 'N/A')
            ? cam.mac_address
            : (cam.stock?.serie || cam.ip_address || cam.camera_name || '');

        let d = null;
        if (cam.stock?.id && porId.has(cam.stock.id)) {
            d = porId.get(cam.stock.id);
        } else if (cam.mac_address) {
            d = datos?.dispositivos?.find(x => x.mac && x.mac.toUpperCase() === cam.mac_address.toUpperCase()) || null;
        }
        if (!d && cam.ip_address) {
            d = datos?.dispositivos?.find(x => x.instalacion && x.instalacion.ip === cam.ip_address) || null;
        }
        if (!d && cam.stock?.serie) {
            d = datos?.dispositivos?.find(x => x.serie && x.serie === cam.stock.serie) || null;
        }

        _dispActual = d;
        editando = d;

        const chBadgeEl = $('stock-modal-ch');
        if (chBadgeEl) {
            if (cam.channel_id !== undefined && cam.channel_id !== null) {
                const chNum = uiNumeroCanal(cam.channel_id);
                const chLabel = chNum ? `CH ${chNum}` : '-';
                chBadgeEl.textContent = chLabel;
                chBadgeEl.className = 'badge rounded-pill canal-ch-badge font-monospace flex-shrink-0';
                if (cam.is_offline && cam.sin_senal) {
                    chBadgeEl.classList.add('bg-secondary');
                    chBadgeEl.title = 'Sin señal: el último escaneo no encontró la cámara en este canal';
                } else if (cam.is_offline) {
                    chBadgeEl.classList.add('bg-danger');
                } else if (cam.fallback_ping) {
                    chBadgeEl.classList.add('bg-warning');
                } else {
                    chBadgeEl.classList.add('bg-primary');
                }
                chBadgeEl.classList.remove('d-none');
            } else {
                chBadgeEl.classList.add('d-none');
            }
        }

        const iconoEl = $('stock-modal-icono');
        if (iconoEl) {
            iconoEl.className = 'bi bi-camera-video me-2';
        }

        tituloLectura = cam.camera_name || (d ? (stockMarcaModelo(d) || 'Cámara') : 'Cámara');

        const modeloItem = (d && d.modelo) || cam.modelo || cam.stock?.modelo || '';
        actualizarImagenModal(modeloItem);

        $('stock-historial-bloque').classList.toggle('d-none', !d);
        $('stock-historial').classList.add('d-none');
        $('stock-historial').replaceChildren();

        if (d) {
            poblarFormulario(d);
        } else {
            poblarFormulario(null, stockValoresDesdeEscaneo({
                tipo: 'camara',
                ip: cam.ip_address,
                mac: cam.mac_address,
                modelo: cam.modelo,
                firmware: cam.firmware,
                nombre: cam.camera_name
            }));
        }

        renderVistaLectura(d, cam);
        cambiarModo(modo);
        modal('stockModal').show();
    }
    window.abrirModalDispositivo = abrirModalDispositivo;

    // Desde Cámaras o Servidores: editar el dispositivo vinculado o darlo de alta con lo que informó el escaneo
    async function abrirDesdePanel(celdaUbicacion) {
        if (!datos) await cargar();
        if (!datos) return;
        const id = celdaUbicacion.dataset.stockUbicacion;
        if (id) {
            const d = porId.get(id);
            if (!d) { toast('El dispositivo ya no está en el stock.', 'warning'); return; }
            desdeCamaras = true;
            abrirModal(d, null, 'lectura');
            return;
        }
        if (!datos.editable) {
            toast('El stock está en solo lectura: editar requiere un usuario operador o admin.', 'warning');
            return;
        }
        desdeCamaras = true;
        if (celdaUbicacion.dataset.stockAlta === '1' && celdaUbicacion.dataset.channelId
            && typeof window.abrirAsignarCanal === 'function') {
            window.abrirAsignarCanal(celdaUbicacion.dataset);
            return;
        }
        if (celdaUbicacion.dataset.stockAlta === 'nvr') {
            const e = celdaUbicacion.dataset;
            abrirModal(null, stockValoresDesdeEscaneo({ tipo: 'nvr', ip: e.equipoIp, mac: e.equipoMac, modelo: e.equipoModelo,
                firmware: e.equipoFirmware, serie: e.equipoSerie, nombre: e.equipoNombre }), 'edicion');
            return;
        }
        const fila = celdaUbicacion.closest('tr, [data-cam-ip]');
        if (!fila) return;
        abrirModal(null, stockValoresDesdeEscaneo({ tipo: 'camara', ip: fila.dataset.camIp, mac: fila.dataset.mac,
            modelo: fila.dataset.modelo, firmware: fila.dataset.firmware, nombre: fila.dataset.camName }), 'edicion');
    }

    // Poner en producción en un canal (Producción > canal libre): el formulario de `d` (o de uno nuevo) con «Instalado»,
    // el grabador y el canal ya elegidos y, si no tiene, la ubicación del grabador. Se guarda con «Guardar», como siempre
    // (las reglas son las del stock: en producción solo operativo, un canal por dispositivo).
    async function abrirParaCanal(d, idGrabador, canal) {
        await cargar();                                   // lo último (otro canal pudo ocuparse recién)
        if (!datos) return;
        if (d) d = porId.get(d.id) || null;
        const g = porId.get(idGrabador);
        if (!g) { toast('El grabador ya no está en el stock.', 'warning'); return; }
        const base = d ? stockValoresDeDispositivo(d) : { ...stockValoresDeDispositivo(null), tipo: 'camara' };
        const gi = g.instalacion || {};
        const valores = { ...base, instalado: true, condicion: 'operativo', grabador: g.id, canal: String(canal),
            edificio: base.edificio || gi.edificio || '', piso: base.piso || gi.piso || '' };
        desdeCamaras = true;
        abrirModal(d || null, valores, 'edicion');
    }

    async function despuesDeEscribir(mensaje, nivel = 'success') {
        const refrescarPanel = desdeCamaras;        // se lee ANTES: el cierre del modal lo reinicia
        modal('stockModal').hide();
        toast(mensaje, nivel);
        editando = null;
        await cargar();
        if (refrescarPanel) cargarDatos();     // la Ubicación de Cámaras/Servidores
    }

    async function eliminar() {
        if (!editando || guardando) return;
        if (!confirmarEliminar) { botonEliminar(true); return; }
        guardando = true;
        mostrarErrorForm('');
        try {
            const params = new URLSearchParams({ version: String(editando.version) });
            await apiFetch(`/api/stock/dispositivos/${encodeURIComponent(editando.id)}?${params}`, { method: 'DELETE' });
            await despuesDeEscribir('Dispositivo eliminado.');
        } catch (e) {
            botonEliminar(false);
            uiErrorConsulta(e, mostrarErrorForm, 'No se pudo eliminar.');
        } finally {
            guardando = false;
        }
    }

    // Si eligió "Otro piso…", primero se agrega a la lista (el servidor lo lleva a su forma única: «ss1» -> 1SS, y si
    // ya existía usa el existente) y se guarda con ese nombre
    async function resolverPiso(v) {
        if (!v.instalado || v.piso !== STOCK_PISO_NUEVO) return v;
        const nombre = $('stock-f-piso-nuevo').value.trim();
        if (!nombre) throw new ApiError('Escribí el piso nuevo.', { tipo: 'validacion' });
        const ub = await apiFetchValidado('/api/stock/ubicaciones', (x) => stockUbicacionesValidas(x) && !!x.guardado,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, mensaje: 'No se pudo agregar el piso.',
                body: JSON.stringify({ objeto: 'piso', accion: 'agregar', nombre }) });
        datos.pisos = ub.pisos.map(u => u.nombre);
        return { ...v, piso: ub.guardado };
    }

    // Si eligió "Otro edificio…", primero se agrega al catálogo y se usa el nombre tal como quedó guardado
    async function resolverEdificio(v) {
        if (!v.instalado || v.edificio !== STOCK_EDIFICIO_NUEVO) return v;
        const nombre = $('stock-f-edificio-nuevo').value.trim();
        if (!nombre) throw new ApiError('Escribí el nombre del edificio nuevo.', { tipo: 'validacion' });
        const resp = await apiFetch('/api/stock/edificios', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre }) });
        const edificios = resp && Array.isArray(resp.edificios) ? resp.edificios : [];
        const guardado = stockEdificioDelCatalogo(edificios, nombre);
        if (!guardado) throw new ApiError('No se pudo agregar el edificio.', { tipo: 'formato' });
        datos.edificios = edificios;
        return { ...v, edificio: guardado };
    }

    async function guardar() {
        if (modoModal === 'lote') { altaLote.guardar(); return; }
        if (guardando || !datos) return;
        guardando = true;
        const boton = $('stock-form-guardar');
        boton.disabled = true;
        uiBotonOcupado(boton, true, { libre: 'Guardar', enCurso: 'Guardando...', icono: 'bi bi-check-lg' });
        mostrarErrorForm('');
        try {
            const valores = await resolverPiso(await resolverEdificio(leerFormulario()));
            const cuerpo = stockPayload(valores);
            const opciones = { headers: { 'Content-Type': 'application/json' },
                mensaje: 'La respuesta del servidor no tiene el formato esperado.' };
            const guardado = editando
                ? await apiFetchValidado(`/api/stock/dispositivos/${encodeURIComponent(editando.id)}`,
                    stockDispositivoValido,
                    { ...opciones, method: 'PUT', body: JSON.stringify({ ...cuerpo, version: editando.version }) })
                : await apiFetchValidado('/api/stock/dispositivos', stockDispositivoValido,
                    { ...opciones, method: 'POST', body: JSON.stringify(cuerpo) });
            const mensaje = stockMensajeGuardado(editando, cuerpo, guardado);
            await despuesDeEscribir(mensaje.texto, mensaje.nivel);
        } catch (e) {
            uiErrorConsulta(e, mostrarErrorForm, 'No se pudo guardar.');
        } finally {
            guardando = false;
            boton.disabled = false;
            uiBotonOcupado(boton, false, { libre: 'Guardar', icono: 'bi bi-check-lg' });
        }
    }

    async function verHistorial() {
        if (!editando) return;
        const lista = $('stock-historial');
        lista.classList.remove('d-none');
        lista.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'Cargando...' }));
        try {
            const h = await apiFetchValidado(`/api/stock/dispositivos/${encodeURIComponent(editando.id)}/historial`,
                stockHistorialValido, { mensaje: 'Respuesta inesperada del historial.' });
            const items = h.entradas.map(e => Object.assign(document.createElement('li'), { textContent: stockHistorialLinea(e) }));
            lista.replaceChildren(...(items.length ? items : [Object.assign(document.createElement('li'), { textContent: 'Sin cambios registrados.' })]));
        } catch (e) {
            lista.replaceChildren();
            uiErrorConsulta(e, mostrarErrorForm, 'No se pudo leer el historial.');
        }
    }

    // ------------------------------------------------------------------ eventos
    tab.addEventListener('ui:pestana-mostrada', () => {
        renderListaSiCambio();
        cargar();
    });          // abrir la pestaña = la demanda (lectura local, sin red)
    const btnStockActualizar = $('stock-actualizar');
    const btnNuevo = $('stock-nuevo');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', async () => {
            desdeCamaras = false;
            if (!datos) await cargar();
            abrirModal(null, null, 'edicion');
        });
    }
    // Cambia el agrupamiento de Activos (menú «Agrupar» y atajos de los chips del dashboard); lo recuerda
    function fijarAgrupamiento(clave) {
        if (!STOCK_AGRUPAMIENTOS.has(clave)) return;
        criterio = clave;
        if (typeof preferencias !== 'undefined') {
            preferencias.set(CLAVE_AGRUPAR, criterio);
            storage.setJSON('cctv_open_stock', []);
        }
        renderMenuAgrupar();
        if (datos) renderLista({ animar: true });
    }
    // Las preferencias de la persona traídas de otra PC: se releen y se repinta la lista
    function aplicarPreferenciasActivos() {
        const antes = [criterio, modoVista, ordenColumna, ordenDir, ordenColumnas.join(), [..._subgruposColapsados].sort().join()].join('\u0000');
        criterio = leerCriterio();
        modoVista = leerModoVista();
        [ordenColumna, ordenDir] = leerOrden();
        ordenColumnas = leerColumnas();
        _subgruposColapsados.clear();
        for (const id of leerSubgruposColapsados()) _subgruposColapsados.add(id);
        renderMenuAgrupar();
        // una clave que llega sin cambiar nada (cada una de las cinco avisa por separado) no rearma la lista
        const despues = [criterio, modoVista, ordenColumna, ordenDir, ordenColumnas.join(), [..._subgruposColapsados].sort().join()].join('\u0000');
        if (datos && despues !== antes) renderLista({ animar: true });
    }
    for (const clave of [CLAVE_AGRUPAR, CLAVE_MODO_VISTA, CLAVE_ORDEN, CLAVE_COLUMNAS, CLAVE_SUBGRUPOS]) {
        preferencias.alAplicar(clave, aplicarPreferenciasActivos);
    }
    uiAlCambiarMovil(aplicarPreferenciasActivos);              // girar el aparato: de tarjetas forzadas a la vista guardada y al revés
    window.stockFijarAgrupamiento = fijarAgrupamiento;
    $('stock-agrupar-menu').addEventListener('click', (ev) => {
        const b = ev.target instanceof Element ? ev.target.closest('[data-stock-agrupar]') : null;
        if (b) fijarAgrupamiento(b.dataset.stockAgrupar);
    });
    // Alt+Shift+G: abre «Agrupar» (con el foco en su primera opción; otra vez, lo cierra). Alt+Shift+V: alterna lista y tarjetas.
    // Solo con la pestaña Activos a la vista y sin otro modal abierto (como Alt+Shift+L: también con el foco en el buscador).
    document.addEventListener('keydown', (ev) => {
        const agrupar = uiEsAtajoAltShift(ev, 'g');
        if ((!agrupar && !uiEsAtajoAltShift(ev, 'v')) || !$('v-pills-stock')?.classList.contains('active')) return;
        if (typeof UI !== 'undefined' && UI.modal.arriba()) return;
        ev.preventDefault();
        if (agrupar) {
            const boton = $('stock-agrupar');
            if (!boton || boton.disabled) return;
            boton.click();
            const primera = $('stock-agrupar-menu').querySelector('.dropdown-item');
            if (primera && $('stock-agrupar-menu').classList.contains('show')) primera.focus();
        } else {
            if (uiEsMovil()) return;                              // en el celular solo hay tarjetas
            (modoVista === 'lista' ? $('stock-btn-vista-tarjetas') : $('stock-btn-vista-lista')).click();
        }
    });
    const btnLista = $('stock-btn-vista-lista');
    const btnTarjetas = $('stock-btn-vista-tarjetas');
    if (btnLista) {
        btnLista.addEventListener('click', () => {
            if (modoVista === 'lista') return;
            guardarModoVista('lista');
            renderLista({ animar: true });
        });
    }
    if (btnTarjetas) {
        btnTarjetas.addEventListener('click', () => {
            if (modoVista === 'tarjetas') return;
            guardarModoVista('tarjetas');
            renderLista({ animar: true });
        });
    }
    // Lo que muestra el popup de un dispositivo: si el escaneo lo ve (el vínculo del servidor, `stock.id` en
    // /api/v2/datos), la cámara o el grabador del escaneo (la Auditoría de una cámara necesita grabador y canal);
    // si no, sus datos del stock. «En producción» = instalado.
    function popupDeDispositivo(d) {
        const g = (typeof globalData !== 'undefined' && globalData) ? globalData : null;
        const i = d.instalacion || {};
        const base = { camera_name: i.descripcion || [d.marca, d.modelo].filter(Boolean).join(' ') || 'Dispositivo',
            ip_address: i.ip || '', modelo: d.modelo || '', firmware: d.firmware || '', mac_address: d.mac || '' };
        const cam = g && Array.isArray(g.camaras) ? g.camaras.find(c => c && c.stock && c.stock.id === d.id) : null;
        if (cam) return { cam: { ...cam, modelo: cam.modelo && cam.modelo !== '-' ? cam.modelo : base.modelo }, esGrabador: false };
        const nvr = g && Array.isArray(g.nvrs) ? g.nvrs.find(x => x && x.stock && x.stock.id === d.id) : null;
        if (nvr) {
            return { cam: { ...base, camera_name: nvr.nvr_name && nvr.nvr_name !== 'N/A' ? nvr.nvr_name : base.camera_name,
                ip_address: nvr.ip, nvr_ip: nvr.ip, is_offline: !!nvr.is_offline }, esGrabador: true };
        }
        return { cam: base, esGrabador: false };
    }

    function abrirPopupDesdeElemento(itemEl, coords) {
        const d = porId.get(itemEl.dataset.stockId);
        if (!d) return;
        const { cam, esGrabador } = popupDeDispositivo(d);
        window.abrirPopupDispositivo(cam, itemEl, coords, {
            enProduccion: !!d.en_uso, esGrabador,
            verDatos: () => { desdeCamaras = false; abrirModal(d, null, 'lectura'); },
            seleccionar: datos && datos.editable && seleccion.entrar ? () => seleccion.entrar(d.id) : null
        });
    }

    const abrirModalDesdeElemento = (ev) => {
        if (seleccion.activo()) return;
        const itemEl = ev.target instanceof Element ? ev.target.closest('[data-stock-id]') : null;
        if (!itemEl || !itemEl.dataset.stockId) return;
        window.ocultarPopupProduccion();
        desdeCamaras = false;
        abrirModal(porId.get(itemEl.dataset.stockId), null, 'lectura');
    };
    // Pulsación larga sobre un dispositivo: entra al modo selección con ese marcado (ya dentro, lo marca o desmarca como un clic).
    // Se registra ANTES del clic de abajo: así frena el clic que sigue a la pulsación (si no, abriría el popup o lo desmarcaría).
    uiAtajoPulsacionLarga($('stock-accordion'), (itemEl) => {
        const id = itemEl.dataset.stockId;
        if (!id) return;
        if (seleccion.activo()) seleccion.alternar(id);
        else if (datos && datos.editable && seleccion.entrar) seleccion.entrar(id);
    }, '[data-stock-id]');
    // Clic: el popup del equipo (como en Producción); doble clic: directo a sus datos
    $('stock-accordion').addEventListener('click', (ev) => {
        const itemEl = ev.target instanceof Element ? ev.target.closest('[data-stock-id]') : null;
        if (!itemEl || !itemEl.dataset.stockId) return;
        if (seleccion.activo()) {                  // modo selección: el clic marca o desmarca, no abre nada
            seleccion.alternar(itemEl.dataset.stockId);
            return;
        }
        if (uiSeleccionTextoEn(itemEl)) {          // el clic terminó una selección de texto (para copiar)
            window.ocultarPopupProduccion();
            return;
        }
        abrirPopupDesdeElemento(itemEl, { x: ev.clientX, y: ev.clientY });
    });
    $('stock-accordion').addEventListener('click', () => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(sincronizarAlturasSticky);
    });
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', sincronizarAlturasSticky, { passive: true });
    }
    // Encabezados de la lista: clic (o Enter / espacio) ordena por esa columna; otro clic invierte el sentido
    const columnaDe = (ev) => {
        const th = ev.target instanceof Element ? ev.target.closest('th[data-sort]') : null;
        return th ? th.dataset.sort : null;
    };
    $('stock-accordion').addEventListener('click', (ev) => {
        const columna = columnaDe(ev);
        if (columna) alternarOrden(columna);
    });
    $('stock-accordion').addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const columna = columnaDe(ev);
        if (!columna) return;
        ev.preventDefault();                       // el espacio no es una letra para el buscador
        alternarOrden(columna);
    });
    // Mantener presionado un encabezado y arrastrar (o Alt + flechas) mueve la columna entre las de SU tabla; al soltar se
    // guarda el orden y toda la lista (todos los grupos) lo toma. Un solo manejador para todos los encabezados.
    uiReordenable($('stock-accordion'), {
        selector: 'th[data-sort]',
        clave: (th) => th.dataset.sort,
        ambito: (th) => th.parentElement,
        alGuardar: (th) => {
            ordenColumnas = stockOrdenColumnas([...th.parentElement.querySelectorAll('th[data-sort]')].map(enc => enc.dataset.sort));
            if (typeof preferencias !== 'undefined') preferencias.setLista(CLAVE_COLUMNAS, ordenColumnas);
            if (datos) renderLista();
        },
    });
    $('stock-accordion').addEventListener('dblclick', abrirModalDesdeElemento);
    $('stock-accordion').addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const itemEl = ev.target instanceof Element ? ev.target.closest('[data-stock-id]') : null;
        if (!itemEl || !itemEl.dataset.stockId) return;
        ev.preventDefault();
        const id = itemEl.dataset.stockId;
        if (seleccion.activo()) seleccion.alternar(id);                     // en el modo selección, las dos marcan o desmarcan
        else if (ev.key === 'Enter') abrirPopupDesdeElemento(itemEl, null);  // Enter: el popup del equipo
        else if (seleccion.entrar && datos && datos.editable) seleccion.entrar(id);   // Espacio: empieza la selección con este marcado
    });
    $('stock-btn-editar').addEventListener('click', () => {
        if (!datos || !datos.editable) return;
        if (!_dispActual && _camActual) {
            editando = null;
            poblarFormulario(null, stockValoresDesdeEscaneo({
                tipo: 'camara',
                ip: _camActual.ip_address,
                mac: _camActual.mac_address,
                modelo: _camActual.modelo,
                firmware: _camActual.firmware,
                nombre: _camActual.camera_name
            }));
        } else if (_dispActual) {
            editando = _dispActual;
            poblarFormulario(_dispActual);
        }
        cambiarModoAnimado('edicion');
    });
    $('stock-btn-cancelar-edicion').addEventListener('click', () => {
        if (editando || _dispActual || _camActual) {
            cambiarModoAnimado('lectura');
        } else {
            modal('stockModal').hide();
        }
    });
    function cerrarParaNavegar() {
        modal('stockModal').hide();
    }
    $('stock-btn-ir-activo').addEventListener('click', () => {
        cerrarParaNavegar();
        const termino = _terminoBusquedaActivo || '';
        irAActivosConBusqueda(termino);
    });
    $('stock-f-modelo').addEventListener('input', () => {
        if (modoModal === 'edicion') {
            actualizarImagenModal($('stock-f-modelo').value);
        }
    });
    $('stock-f-modelo').addEventListener('change', () => {
        if (modoModal === 'edicion') {
            actualizarImagenModal($('stock-f-modelo').value);
        }
    });
    $('stock-f-ip').addEventListener('input', () => {
        if ($('stock-f-ip').value.trim() && !$('stock-f-instalado').checked) {
            $('stock-f-instalado').checked = true;
            sincronizarFormulario();
        }
    });
    $('stock-form-eliminar').addEventListener('click', eliminar);
    $('stockModal').addEventListener('ui:modal-cerrado', () => {
        desdeCamaras = false;
        _origenProd = false;
        _dispActual = null;
        _camActual = null;
    });
    for (const id of ['produccion-accordion']) {      // Producción
        const panel = $(id);
        if (!panel) continue;
        const destino = (ev) => ev.target instanceof Element ? ev.target.closest('[data-stock-ubicacion], [data-stock-alta]') : null;
        panel.addEventListener('click', (ev) => { const c = destino(ev); if (c) abrirDesdePanel(c); });
        panel.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            const c = destino(ev);
            if (c) { ev.preventDefault(); abrirDesdePanel(c); }
        });
    }
    $('stock-form').addEventListener('submit', (ev) => { ev.preventDefault(); guardar(); });
    for (const id of ['stock-f-tipo', 'stock-f-condicion', 'stock-f-instalado', 'stock-f-edificio', 'stock-f-piso']) {
        $(id).addEventListener('change', sincronizarFormulario);
    }
    $('stock-f-grabador').addEventListener('change', () => {
        poblarCanales('');
        const g = porId.get($('stock-f-grabador').value);
        // la ubicación del grabador como punto de partida (si todavía no se cargó otra)
        if (g && g.instalacion) {
            if (!$('stock-f-edificio').value && g.instalacion.edificio) $('stock-f-edificio').value = g.instalacion.edificio;
            if (!$('stock-f-piso').value && g.instalacion.piso) $('stock-f-piso').value = g.instalacion.piso;
        }
        sincronizarFormulario();
    });
    for (const id of ['stock-f-marca', 'stock-f-modelo']) $(id).addEventListener('input', sugerirModelos);
    $('stock-historial-ver').addEventListener('click', verHistorial);
    document.addEventListener('cctv:busqueda', (e) => {
        const term = (e.detail && e.detail.term !== undefined) ? e.detail.term : terminoBusquedaActual();
        if (e.detail && e.detail.campos) {
            camposStockActuales = new Set(e.detail.campos);
        }
        actualizarBadgeStock(term);
        if (datos && tab.classList.contains('active')) renderLista({ animar: Boolean(e.detail?.animar) });
    });
    renderMenuAgrupar();
    if (tab.classList.contains('active')) cargar();         // pestaña restaurada al recargar la página
    // Los datos cambiaron (otra pantalla, otra pestaña del navegador, una importación): se releen si ya se habían leído
    document.addEventListener('sgc:datos-cambiados', () => { if (datos) cargar(); });

    window.contarCoincidenciasStock = function(term) {
        return contarStockActual(term || '');
    };
    window.recargarStock = cargar;
    // Lo que usan las partes de la pestaña en archivos aparte (stock-listar.js): el estado se lee en el momento
    // (`estado()`), nunca se copia al cargar el archivo, porque cada /api/stock lo reemplaza.
    window.StockNucleo = Object.freeze({
        estado: () => ({ datos, etiquetasTipo, catalogo, criterio }),
        visibles, armarMapaCamaras, cargar, animarModal, toast, modal, seleccion,
        // el alta por lote (stock-alta-lote.js): cambia de modo con la mutación estándar y guarda como el resto del modal
        altaLote, cambiarModoAnimado, modoActual: () => modoModal, mostrarErrorForm, despuesDeEscribir, abrirParaCanal,
        selectoresDelFormulario: () => ({ tipo: $('stock-f-tipo'), condicion: $('stock-f-condicion') }),
    });
})();
