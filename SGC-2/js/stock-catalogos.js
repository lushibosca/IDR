// Stock > Catálogos (menú ⚙ > Catálogos; rol operador o más): edificios, pisos y grupos/subgrupos de dispositivos, con
// búsqueda, filtros, renombrar/borrar en dos pasos y el arrastre de subgrupos vacíos entre grupos (solo lo arrastrado
// desde este modal). Todo con textContent: las etiquetas las escribe el usuario. Comparte con stock.js por
// `window.StockNucleo` (estado de la última carga, `cargar`, animación y avisos del modal); la lógica pura (validación,
// motivos de no borrar/mover, stockSubgrupoAMover) está en el bloque STOCK PURO de stock.js. Se carga después de stock.js.
// ==== STOCK CATALOGOS PURO BEGIN ====
// ¿Esta tecla, con el foco fuera de un campo en Catálogos, empieza la búsqueda? Solo letras (A-Z) o números
// sin Ctrl, Meta ni Alt (igual que la búsqueda global en app.js).
function stockEsTeclaBusquedaCatalogo(tecla, conModificador) {
    return !conModificador && typeof tecla === 'string' && /^[a-z0-9]$/i.test(tecla);
}

// Devuelve el id del input de búsqueda/filtro correspondiente a la pestaña activa del modal Catálogos.
function stockIdInputBusquedaPestana(pestana) {
    if (pestana === 'edificio') return 'stock-ubi-input-edificio';
    if (pestana === 'piso') return 'stock-ubi-input-piso';
    if (pestana === 'dispositivos') return 'stock-cat-grupo-nombre';
    if (pestana === 'modelos') return 'stock-mod-input';
    return null;
}

// Forma de la respuesta de /api/stock/modelos (antes de pintar nada)
function stockModelosValidos(r) {
    return !!r && Array.isArray(r.modelos) && r.modelos.every(m => !!m && typeof m.modelo === 'string'
        && typeof m.marca === 'string' && Number.isInteger(m.usos) && (m.pagina === null || typeof m.pagina === 'string'));
}

// Clave de un modelo en pantalla (el modelo sin espacios de más ni mayúsculas; la marca no cuenta), como la del servidor
function stockClaveModelo(m) {
    return String(m.modelo || '').trim().split(/\s+/).join(' ').toLowerCase();
}

// Texto de un modelo en pantalla: «modelo - marca» (sin marca, solo el modelo)
function stockEtiquetaModelo(m) {
    return [m.modelo, m.marca].filter(Boolean).join(' - ');
}

// Los modelos que se ven: filtro «sin página» y búsqueda por marca o modelo (sin página primero, después alfabético por
// modelo y marca)
function stockModelosVisibles(modelos, { soloSinPagina = false, texto = '' } = {}) {
    let lista = soloSinPagina ? modelos.filter(m => !m.pagina) : [...modelos];
    if (texto) lista = lista.filter(m => stockMatchTexto(`${m.marca} ${m.modelo}`, texto));
    return lista.sort((a, b) => Number(!!a.pagina) - Number(!!b.pagina)
        || stockCompararTexto(a.modelo, b.modelo) || stockCompararTexto(a.marca, b.marca));
}
// ==== STOCK CATALOGOS PURO END ====
(function initStockCatalogos() {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const nucleo = window.StockNucleo;
    if (!nucleo || !$('stockCatalogoModal')) return;
    const { estado, cargar, animarModal, toast, modal } = nucleo;

    function inputBusquedaPestanaActual() {
        const id = stockIdInputBusquedaPestana(pestanaCatActual);
        return id ? $(id) : null;
    }

    // ------------------------------------------------------------------ catálogo (edificios, pisos y dispositivos)
    // Solo con rol operador o admin (como el alta). Todo con textContent: las etiquetas las escribe el usuario.
    let catalogoGrupos = [];          // lo último que mandó el servidor (ya ordenado)
    // Estado de una lista editable (grupos y subgrupos, edificios y pisos, modelos): qué fila se edita, cuál espera el segundo
    // clic de «Borrar» (3 s: después vuelve sola al botón original) y si hay un guardado en curso. `repintar` pinta la lista.
    function crearEstadoLista(repintar) {
        const e = {
            editando: null,               // id de la fila cuyo nombre (o página) se edita
            confirmando: null,            // id de la fila cuyo «Borrar» espera el segundo clic
            ocupado: false,
            repintar,
            vencer: uiConfirmacionTemporizada(() => {
                if (e.confirmando === null) return;
                e.confirmando = null;
                repintar();
            }),
            soltar() {                    // descarta lo pendiente (al guardar o al cambiar de pestaña), sin repintar
                e.editando = null;
                e.confirmando = null;
                e.vencer.cancelar();
            },
            editar(id) {                  // empieza (o, con null, termina) la edición de una fila
                e.soltar();
                e.editando = id;
                repintar();
            },
        };
        return e;
    }
    const estCat = crearEstadoLista(() => renderCatalogo());     // ids 'g:<clave>' | 't:<clave>'
    const estUbi = crearEstadoLista(() => renderUbicaciones());  // ids 'edificio:<nombre>' | 'piso:<nombre>'
    const estMod = crearEstadoLista(() => renderModelos());      // id: clave del modelo (stockClaveModelo)
    let pestanaCatActual = 'edificio'; // 'edificio' | 'piso' | 'dispositivos' | 'modelos'
    let filtroUbi = 'todos';           // 'todos' | 'sin-uso'
    let ordenUbiMasUsados = false;     // true: más usados, false: alfabético (por defecto)
    let busquedaUbi = '';              // búsqueda en edificios / pisos
    let busquedaCat = '';              // búsqueda en grupos / subgrupos
    const gruposColapsados = new Set(); // claves de grupos colapsados

    const TXT_UBI = 'Renombrar cambia todas las instalaciones; si el nombre nuevo ya existe, se unifican. '
        + 'Solo se borra lo que ninguna instalación usa.';
    const TXT_DISP = 'Los del sistema se renombran pero no se borran. Un subgrupo con equipos no se borra '
        + 'ni se mueve de grupo; los vacíos se pueden arrastrar a otro grupo. Un grupo se borra con sus subgrupos '
        + 'si ninguno tiene equipos.';

    const TXT_MOD = 'Los modelos salen solos de los dispositivos (la marca no los distingue). La página oficial es del modelo: '
        + 'la ven todos sus dispositivos en su ficha.';

    const urlCatalogo = (objeto, clave = '') =>
        `/api/stock/${objeto === 'g' ? 'grupos' : 'tipos'}${clave ? `/${encodeURIComponent(clave)}` : ''}`;

    function mostrarErrorCat(msg) {
        const errCat = $('stock-cat-error');
        if (errCat) {
            errCat.textContent = msg;
            errCat.classList.toggle('d-none', !msg);
        }
        const errUbi = $('stock-ubi-error');
        if (errUbi && errUbi !== errCat) {
            errUbi.textContent = msg;
            errUbi.classList.toggle('d-none', !msg);
        }
    }

    // Una edición del catálogo: el servidor responde cómo quedó todo; después se recarga el stock (la pestaña, los
    // selects y el dashboard ven los nombres y grupos nuevos). Devuelve si se guardó.
    async function editarCatalogo(url, metodo, cuerpo = null) {
        if (estCat.ocupado) return false;
        estCat.ocupado = true;
        mostrarErrorCat('');
        let guardado = false;
        try {
            const opciones = { method: metodo };
            if (cuerpo) {
                opciones.headers = { 'Content-Type': 'application/json' };
                opciones.body = JSON.stringify(cuerpo);
            }
            const r = await apiFetchValidado(url, stockCatalogoValido,
                { ...opciones, mensaje: 'Respuesta inesperada al guardar el catálogo.' });
            catalogoGrupos = r.grupos;
            estCat.soltar();
            renderCatalogo();
            guardado = true;
        } catch (e) {
            uiErrorConsulta(e, mostrarErrorCat, 'No se pudo guardar el cambio.');
        } finally {
            estCat.ocupado = false;     // el cambio ya quedó guardado: recargar el stock no traba la edición siguiente
        }
        if (guardado) await cargar();
        return guardado;
    }

    function botonCat(icono, texto, titulo, alClick, { peligro = false, motivo = '' } = {}) {
        const b = uiNodo('button', peligro ? 'btn btn-sm btn-outline-danger text-nowrap'
            : 'btn btn-sm btn-outline-secondary text-nowrap');
        b.type = 'button';
        b.append(uiNodo('i', texto ? `bi ${icono} me-1` : `bi ${icono}`));
        if (texto) b.append(document.createTextNode(texto));
        b.title = motivo || titulo;
        b.setAttribute('aria-label', titulo);
        b.disabled = !!motivo;
        if (!motivo && alClick) b.addEventListener('click', alClick);
        return b;
    }

    function botonCatIcon(icono, titulo, alClick, { peligro = false, motivo = '', activo = false } = {}) {
        let clases = 'stock-cat-btn-icon';
        if (activo) clases += ' stock-cat-btn-borrar-activo';
        const b = uiNodo('button', clases);
        b.type = 'button';
        b.title = motivo || titulo;
        b.setAttribute('aria-label', titulo);
        b.disabled = !!motivo;
        b.append(uiNodo('i', `bi ${icono}`));
        if (!motivo && alClick) b.addEventListener('click', alClick);
        return b;
    }

    // «Borrar» en dos clicks (como el borrado de un dispositivo); deshabilitado con el motivo si no se puede. `estado`: el de su lista
    function botonBorrar(estado, id, titulo, motivo, borrar) {
        const confirmando = estado.confirmando === id;
        const b = uiNodo('button', motivo
            ? 'stock-cat-btn-icon'
            : 'stock-cat-btn-icon stock-cat-btn-borrar-activo');
        b.type = 'button';
        b.title = motivo || titulo;
        b.setAttribute('aria-label', titulo);
        b.disabled = !!motivo;
        if (confirmando) {
            b.classList.add('px-2', 'w-auto');
            b.append(uiNodo('i', 'bi bi-exclamation-triangle me-1'));
            b.append(document.createTextNode('Confirmar'));
        } else {
            b.append(uiNodo('i', 'bi bi-x-lg'));
        }
        if (!motivo) {
            b.addEventListener('click', () => {
                if (estado.confirmando === id) {
                    borrar();
                } else {
                    estado.confirmando = id;
                    estado.vencer.armar();
                    estado.repintar();
                }
            });
        }
        return b;
    }

    // Nombre en edición (grupos/tipos y también edificios/pisos): `cancelar` y el largo, según la lista
    function formNombreCat(actual, guardar, cancelar = () => estCat.editar(null), maxLength = 40) {
        const f = uiNodo('form', 'd-flex align-items-center gap-2 flex-grow-1 min-w-0');
        f.autocomplete = 'off';
        const input = uiNodo('input', 'form-control form-control-sm');
        input.type = 'text';
        input.maxLength = maxLength;
        input.required = true;
        input.value = actual;
        input.setAttribute('aria-label', 'Nombre');
        input.dataset.stockCatNombre = '';
        const ok = botonCat('bi-check-lg', '', 'Guardar', null);
        ok.type = 'submit';
        f.append(input, ok, botonCat('bi-x-lg', '', 'Cancelar', cancelar));
        f.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const v = input.value.trim();
            if (v) guardar(v);
        });
        return f;
    }

    function insigniaSistema() {
        const s = uiNodo('span', 'stock-badge-sistema', 'Sistema');
        s.title = 'El código depende de él: se puede renombrar, no borrar';
        return s;
    }

    function filaTipoCat(g, t) {
        const li = uiNodo('div', 'stock-cat-item');
        li.dataset.stockCatTipo = t.clave;
        const id = `t:${t.clave}`;
        if (estCat.editando === id) {
            li.append(formNombreCat(t.etiqueta, (v) =>
                editarCatalogo(urlCatalogo('t', t.clave), 'PUT', { etiqueta: v, grupo: g.clave })));
            return li;
        }
        const izq = uiNodo('div', 'stock-cat-item-izq');
        const motivoMover = stockMotivoNoMoverTipo(t);
        if (!motivoMover) {
            const handle = uiNodo('span', 'stock-cat-drag-handle bi bi-grip-vertical');
            handle.title = 'Arrastrar a otro grupo';
            li.draggable = true;
            li.addEventListener('dragstart', (ev) => {
                ev.dataTransfer.setData(TIPO_ARRASTRE_SUBGRUPO, t.clave);   // solo la clave: el resto sale del catálogo
                ev.dataTransfer.effectAllowed = 'move';
            });
            izq.append(handle);
        }
        izq.append(uiNodo('span', 'stock-cat-item-nombre', t.etiqueta));
        if (t.sistema) izq.append(insigniaSistema());

        const der = uiNodo('div', 'stock-cat-item-der');

        const cant = uiNodo('span', 'stock-cat-item-conteo', String(t.cantidad));
        cant.title = `${t.cantidad} dispositivo(s)`;

        const mover = uiNodo('select', 'stock-cat-mover-select');
        mover.setAttribute('aria-label', 'Mover a otro grupo');
        mover.dataset.stockCatMover = '';
        for (const x of catalogoGrupos) mover.add(new Option(x.etiqueta, x.clave, x.clave === g.clave, x.clave === g.clave));
        mover.disabled = !!motivoMover;
        mover.title = motivoMover || 'Mover a otro grupo';
        mover.addEventListener('change', () => {
            editarCatalogo(urlCatalogo('t', t.clave), 'PUT', { etiqueta: t.etiqueta, grupo: mover.value })
                .then(ok => { if (!ok) mover.value = g.clave; });
        });

        const motivoBorrar = stockMotivoNoBorrarTipo(t);
        der.append(cant, mover,
            botonCatIcon('bi-pencil', 'Renombrar subgrupo', () => estCat.editar(id)),
            botonBorrar(estCat, id, 'Borrar subgrupo', motivoBorrar,
                () => editarCatalogo(urlCatalogo('t', t.clave), 'DELETE')));

        li.append(izq, der);
        return li;
    }

    function formAltaTipoCat(g) {
        const f = uiNodo('form', 'stock-cat-pie-grupo d-flex gap-2');
        f.autocomplete = 'off';
        const input = uiNodo('input', 'form-control form-control-sm');
        input.type = 'text';
        input.maxLength = 40;
        input.placeholder = `Subgrupo nuevo en ${g.etiqueta}`;
        input.setAttribute('aria-label', 'Nombre del subgrupo nuevo');
        const b = uiNodo('button', 'stock-cat-btn-subgrupo text-nowrap');
        b.type = 'submit';
        b.textContent = '+ Agregar subgrupo';
        f.append(input, b);
        f.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const v = input.value.trim();
            if (v) editarCatalogo(urlCatalogo('t'), 'POST', { etiqueta: v, grupo: g.clave });
        });
        return f;
    }

    function tarjetaGrupoCat(g) {
        const card = uiNodo('div', 'stock-cat-card-grupo');
        card.dataset.stockCatGrupo = g.clave;
        const cab = uiNodo('div', 'stock-cat-header-grupo');
        const id = `g:${g.clave}`;
        const colapsado = gruposColapsados.has(g.clave);

        if (estCat.editando === id) {
            cab.append(formNombreCat(g.etiqueta, (v) =>
                editarCatalogo(urlCatalogo('g', g.clave), 'PUT', { etiqueta: v })));
        } else {
            const izq = uiNodo('div', 'stock-cat-grupo-izq');
            const chevron = uiNodo('i', colapsado
                ? 'bi bi-caret-right-fill stock-cat-chevron'
                : 'bi bi-caret-down-fill stock-cat-chevron');
            izq.append(chevron, uiNodo('span', 'text-truncate', g.etiqueta));

            const der = uiNodo('div', 'stock-cat-grupo-der');
            if (g.sistema) der.append(insigniaSistema());
            const equipos = g.tipos.reduce((acc, t) => acc + t.cantidad, 0);
            der.append(uiNodo('span', 'stock-cat-grupo-equipos', `${equipos} equipo${equipos === 1 ? '' : 's'}`));
            der.append(botonCatIcon('bi-pencil', 'Renombrar grupo', () => estCat.editar(id)));
            der.append(botonBorrar(estCat, id, 'Borrar grupo', stockMotivoNoBorrarGrupo(g),
                () => editarCatalogo(urlCatalogo('g', g.clave), 'DELETE')));

            cab.append(izq, der);
            cab.setAttribute('aria-expanded', String(!colapsado));
            // abrir o cerrar el grupo es un acordeón (grid-collapse, como los grupos de Activos): anima el alto del grupo
            // y el modal lo acompaña; no se vuelve a pintar la lista
            cab.addEventListener('click', (ev) => {
                if (ev.target.closest('button, form, input, select')) return;
                const cerrar = !gruposColapsados.has(g.clave);
                if (cerrar) gruposColapsados.add(g.clave); else gruposColapsados.delete(g.clave);
                envoltura.classList.toggle('show', !cerrar);
                cab.setAttribute('aria-expanded', String(!cerrar));
                chevron.className = cerrar ? 'bi bi-caret-right-fill stock-cat-chevron'
                    : 'bi bi-caret-down-fill stock-cat-chevron';
            });
        }

        const envoltura = uiNodo('div', colapsado ? 'grid-collapse' : 'grid-collapse show');
        const cuerpo = uiNodo('div', 'stock-cat-cuerpo-grupo');
        const filas = g.tipos.length
            ? g.tipos.map(t => filaTipoCat(g, t))
            : [uiNodo('div', 'stock-cat-item small text-secondary', 'Sin subgrupos.')];
        cuerpo.append(...filas, formAltaTipoCat(g));

        // Drag and drop para mover subgrupos vacíos a este grupo
        card.addEventListener('dragover', (ev) => {
            if (!Array.from(ev.dataTransfer?.types || []).includes(TIPO_ARRASTRE_SUBGRUPO)) return;   // otra cosa: no
            ev.preventDefault();
            card.classList.add('stock-cat-card-drop-target');
        });
        card.addEventListener('dragleave', () => {
            card.classList.remove('stock-cat-card-drop-target');
        });
        card.addEventListener('drop', (ev) => {
            ev.preventDefault();
            card.classList.remove('stock-cat-card-drop-target');
            // Solo un subgrupo arrastrado desde ESTE modal (tipo de dato propio). Lo que se suelta desde otra pestaña u
            // otro sitio trae texto cualquiera: antes se parseaba y se mandaba tal cual (clave y nombre) en un PUT.
            const mover = stockSubgrupoAMover(catalogoGrupos, ev.dataTransfer.getData(TIPO_ARRASTRE_SUBGRUPO), g.clave);
            if (mover) editarCatalogo(urlCatalogo('t', mover.clave), 'PUT', { etiqueta: mover.etiqueta, grupo: g.clave });
        });

        envoltura.append(cuerpo);
        card.append(cab, envoltura);
        return card;
    }

    function actualizarConteosTabs() {
        const cEdif = $('stock-cat-conteo-edificios');
        if (cEdif) cEdif.textContent = String(ubicaciones ? ubicaciones.edificios.length : 0);
        const cPiso = $('stock-cat-conteo-pisos');
        if (cPiso) cPiso.textContent = String(ubicaciones ? ubicaciones.pisos.length : 0);
        const cDisp = $('stock-cat-conteo-dispositivos');
        if (cDisp) cDisp.textContent = String(catalogoGrupos.length);
        const cMod = $('stock-cat-conteo-modelos');
        if (cMod) cMod.textContent = String(modelos ? modelos.length : 0);
    }

    function renderCatalogo() {
        let lista = catalogoGrupos;
        if (busquedaCat) {
            lista = catalogoGrupos.filter(g =>
                stockMatchTexto(g.etiqueta, busquedaCat) ||
                g.tipos.some(t => stockMatchTexto(t.etiqueta, busquedaCat)));
        }
        $('stock-cat-lista').replaceChildren(...lista.map(tarjetaGrupoCat));
        actualizarConteosTabs();
        const enEdicion = $('stock-cat-lista').querySelector('[data-stock-cat-nombre]');
        if (enEdicion) enEdicion.focus();
    }

    // ------------------------------------------------------------------ edificios y pisos (⚙ > Edificios y pisos)
    let ubicaciones = null;           // última respuesta de /api/stock/ubicaciones
    const UBI_LARGO = new Map([['edificio', 60], ['piso', 20]]);

    // Una acción sobre la lista; el servidor responde cómo quedaron las dos. Se recarga el stock (las instalaciones
    // pudieron cambiar de edificio o piso) y el panel. Devuelve el nombre guardado, o null si falló.
    async function editarUbicacion(objeto, accion, nombre, nuevo = null) {
        if (estUbi.ocupado) return null;
        estUbi.ocupado = true;
        mostrarErrorCat('');
        try {
            const ub = await apiFetchValidado('/api/stock/ubicaciones', stockUbicacionesValidas, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                mensaje: 'Respuesta inesperada al guardar.',
                body: JSON.stringify(nuevo === null ? { objeto, accion, nombre } : { objeto, accion, nombre, nuevo }) });
            const antes = ubicaciones;
            ubicaciones = ub;
            estUbi.soltar();
            renderUbicaciones();
            if (accion === 'renombrar' && antes && ub.guardado
                && antes[objeto === 'piso' ? 'pisos' : 'edificios'].some(u => u.nombre === ub.guardado && u.nombre !== nombre)) {
                toast(`«${nombre}» se unificó con «${ub.guardado}».`, 'success');
            }
            await cargar();
            cargarDatos();
            return ub.guardado || nombre;
        } catch (e) {
            uiErrorConsulta(e, mostrarErrorCat, 'No se pudo guardar el cambio.');
            return null;
        } finally {
            estUbi.ocupado = false;
        }
    }

    function filaUbicacion(objeto, u) {
        const id = `${objeto}:${u.nombre}`;
        const li = uiNodo('li', 'stock-cat-item');
        if (estUbi.editando === id) {
            li.append(formNombreCat(u.nombre, (v) => editarUbicacion(objeto, 'renombrar', u.nombre, v),
                () => estUbi.editar(null), UBI_LARGO.get(objeto)));
            return li;
        }
        const izq = uiNodo('div', 'stock-cat-item-izq');
        izq.append(uiNodo('span', 'stock-cat-item-nombre', u.nombre));

        const der = uiNodo('div', 'stock-cat-item-der');
        const conteo = uiNodo('span', 'stock-cat-item-conteo', String(u.usos));
        conteo.title = `${u.usos} instalación(es)`;
        conteo.setAttribute('aria-label', conteo.title);           // el número solo, con su significado para lectores

        der.append(conteo,
            botonCatIcon('bi-pencil', 'Renombrar o unificar', () => estUbi.editar(id)),
            botonBorrar(estUbi, id, 'Borrar', u.usos > 0 ? 'En uso: renombralo o unificalo con otro antes de borrarlo' : '',
                () => editarUbicacion(objeto, 'borrar', u.nombre)));
        li.append(izq, der);
        return li;
    }

    function renderUbicaciones() {
        if (!ubicaciones) return;
        actualizarConteosTabs();
        for (const [objeto, lista] of [['edificio', ubicaciones.edificios], ['piso', ubicaciones.pisos]]) {
            const cantSinUso = lista.filter(x => x.usos === 0).length;
            if (objeto === pestanaCatActual) {
                const badgeSinUso = $('stock-ubi-conteo-sin-uso');
                if (badgeSinUso) badgeSinUso.textContent = String(cantSinUso);
                $('stock-ubi-filtro-todos').classList.toggle('stock-cat-filtro-activo', filtroUbi === 'todos');
                $('stock-ubi-filtro-sin-uso').classList.toggle('stock-cat-filtro-activo', filtroUbi === 'sin-uso');
                $('stock-ubi-btn-orden').textContent = ordenUbiMasUsados
                    ? 'Ordenar: más usados'
                    : 'Ordenar: alfabético';
            }
            let filtrada = filtroUbi === 'sin-uso' ? lista.filter(x => x.usos === 0) : [...lista];
            if (busquedaUbi && objeto === pestanaCatActual) {
                filtrada = filtrada.filter(x => stockMatchTexto(x.nombre, busquedaUbi));
            }
            if (ordenUbiMasUsados) {
                filtrada.sort((a, b) => b.usos - a.usos || stockCompararTexto(a.nombre, b.nombre));
            } else if (objeto === 'piso') {
                filtrada.sort((a, b) => stockPisoPeso(a.nombre) - stockPisoPeso(b.nombre)
                    || stockCompararTexto(a.nombre, b.nombre));
            } else {
                filtrada.sort((a, b) => stockCompararTexto(a.nombre, b.nombre));
            }
            $(`stock-ubi-lista-${objeto}`).replaceChildren(...(filtrada.length
                ? filtrada.map(u => filaUbicacion(objeto, u))
                : [uiNodo('li', 'stock-cat-item small text-secondary', 'Todavía no hay ninguno.')]));
        }
        const modalEl = $('stockCatalogoModal');
        const enEdicion = modalEl ? modalEl.querySelector('[data-stock-cat-nombre]') : null;
        if (enEdicion) enEdicion.focus();
    }

    // ------------------------------------------------------------------ modelos (página oficial de cada uno)
    let modelos = null;               // última respuesta de /api/stock/modelos (lista de modelos únicos)
    let filtroMod = 'todos';          // 'todos' | 'sin-pagina'
    let busquedaMod = '';

    // Fija (o, con '' , quita) la página de un modelo; el servidor responde la lista nueva y se recarga el stock (la
    // ficha de cada dispositivo de ese modelo la trae). Devuelve si se guardó.
    async function guardarPaginaModelo(m, pagina) {
        if (estMod.ocupado) return false;
        estMod.ocupado = true;
        mostrarErrorCat('');
        let guardado = false;
        try {
            const r = await apiFetchValidado('/api/stock/modelos', stockModelosValidos, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                mensaje: 'Respuesta inesperada al guardar.',
                body: JSON.stringify({ modelo: m.modelo, pagina: pagina || null }) });
            modelos = r.modelos;
            estMod.soltar();
            renderModelos();
            guardado = true;
        } catch (e) {
            uiErrorConsulta(e, mostrarErrorCat, 'No se pudo guardar la página del modelo.');
        } finally {
            estMod.ocupado = false;
        }
        if (guardado) await cargar();
        return guardado;
    }

    function formPaginaModelo(m) {
        const f = uiNodo('form', 'd-flex align-items-center gap-2 flex-grow-1 min-w-0');
        f.autocomplete = 'off';
        const input = uiNodo('input', 'form-control form-control-sm');
        input.type = 'url';
        input.inputMode = 'url';
        input.maxLength = 300;
        input.value = m.pagina || '';
        input.placeholder = 'https://… (página oficial; vacío la quita)';
        input.setAttribute('aria-label', `Página oficial de ${stockEtiquetaModelo(m)}`);
        input.dataset.stockCatNombre = '';
        const ok = botonCat('bi-check-lg', '', 'Guardar', null);
        ok.type = 'submit';
        f.append(input, ok, botonCat('bi-x-lg', '', 'Cancelar', () => estMod.editar(null)));
        f.addEventListener('submit', (ev) => {
            ev.preventDefault();
            guardarPaginaModelo(m, input.value.trim());
        });
        return f;
    }

    function filaModelo(m) {
        const li = uiNodo('li', 'stock-cat-item');
        const clave = stockClaveModelo(m);
        const izq = uiNodo('div', 'stock-cat-item-izq');
        izq.append(uiNodo('span', 'stock-cat-item-nombre seleccionable', stockEtiquetaModelo(m)));   // se puede copiar el modelo
        if (estMod.editando === clave) {
            li.append(izq, formPaginaModelo(m));
            return li;
        }
        const der = uiNodo('div', 'stock-cat-item-der');
        const url = stockUrlPagina(m.pagina);
        if (url) {
            const enlace = uiNodo('a', 'stock-cat-btn-icon');
            enlace.href = url;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            enlace.title = `Abrir ${url}`;
            enlace.setAttribute('aria-label', 'Abrir la página oficial');
            enlace.append(uiNodo('i', 'bi bi-box-arrow-up-right'));
            der.append(enlace);
        } else {
            der.append(uiNodo('span', 'small text-secondary', 'Sin página'));
        }
        const conteo = uiNodo('span', 'stock-cat-item-conteo', String(m.usos));
        conteo.title = `${m.usos} dispositivo(s)`;
        conteo.setAttribute('aria-label', conteo.title);
        der.append(conteo, botonCatIcon('bi-pencil', url ? 'Cambiar o quitar la página' : 'Agregar la página', () => {
            estMod.editar(clave);
        }));
        li.append(izq, der);
        return li;
    }

    function renderModelos() {
        actualizarConteosTabs();
        if (!modelos) return;
        const sinPagina = modelos.filter(m => !m.pagina).length;
        const badge = $('stock-mod-conteo-sin-pagina');
        if (badge) badge.textContent = String(sinPagina);
        $('stock-mod-filtro-todos').classList.toggle('stock-cat-filtro-activo', filtroMod === 'todos');
        $('stock-mod-filtro-sin-pagina').classList.toggle('stock-cat-filtro-activo', filtroMod === 'sin-pagina');
        const visibles = stockModelosVisibles(modelos, { soloSinPagina: filtroMod === 'sin-pagina', texto: busquedaMod });
        $('stock-mod-lista').replaceChildren(...(visibles.length
            ? visibles.map(filaModelo)
            : [uiNodo('li', 'stock-cat-item small text-secondary', 'No hay modelos para mostrar.')]));
        const enEdicion = $('stock-mod-lista').querySelector('[data-stock-cat-nombre]');
        if (enEdicion) enEdicion.focus();
    }

    function actualizarPestanaCat(pestana) {
        pestanaCatActual = pestana;
        estCat.soltar();
        estUbi.soltar();
        estMod.soltar();
        busquedaUbi = '';
        busquedaCat = '';
        busquedaMod = '';
        mostrarErrorCat('');

        const tabEdif = $('stock-cat-tab-edificio');
        const tabPiso = $('stock-cat-tab-piso');
        const tabDisp = $('stock-cat-tab-dispositivos');
        if (tabEdif) tabEdif.classList.toggle('active', pestana === 'edificio');
        if (tabPiso) tabPiso.classList.toggle('active', pestana === 'piso');
        if (tabDisp) tabDisp.classList.toggle('active', pestana === 'dispositivos');
        const tabMod = $('stock-cat-tab-modelos');
        if (tabMod) tabMod.classList.toggle('active', pestana === 'modelos');

        const subtitulo = $('stock-cat-subtitulo');
        if (subtitulo) {
            subtitulo.textContent = pestana === 'dispositivos' ? TXT_DISP : pestana === 'modelos' ? TXT_MOD : TXT_UBI;
        }

        const panelUbi = $('stock-cat-panel-ubicaciones');
        const panelDisp = $('stock-cat-panel-dispositivos');
        const panelMod = $('stock-cat-panel-modelos');
        const esUbi = pestana === 'edificio' || pestana === 'piso';
        if (panelUbi) panelUbi.classList.toggle('d-none', !esUbi);
        if (panelDisp) panelDisp.classList.toggle('d-none', pestana !== 'dispositivos');
        if (panelMod) panelMod.classList.toggle('d-none', pestana !== 'modelos');

        const formEdif = $('stock-ubi-nuevo-edificio');
        const formPiso = $('stock-ubi-nuevo-piso');
        const listaEdif = $('stock-ubi-lista-edificio');
        const listaPiso = $('stock-ubi-lista-piso');
        if (formEdif) formEdif.classList.toggle('d-none', pestana !== 'edificio');
        if (formPiso) formPiso.classList.toggle('d-none', pestana !== 'piso');
        if (listaEdif) listaEdif.classList.toggle('d-none', pestana !== 'edificio');
        if (listaPiso) listaPiso.classList.toggle('d-none', pestana !== 'piso');

        const inputEdif = $('stock-ubi-input-edificio');
        const inputPiso = $('stock-ubi-input-piso');
        const inputGrupo = $('stock-cat-grupo-nombre');
        if (inputEdif) inputEdif.value = '';
        if (inputPiso) inputPiso.value = '';
        if (inputGrupo) inputGrupo.value = '';
        if ($('stock-mod-input')) $('stock-mod-input').value = '';
        renderUbicaciones();
        renderCatalogo();
        renderModelos();
    }

    async function abrirCatalogos(pestana = 'edificio') {
        if (typeof UI === 'undefined') return;
        if (!estado().datos) await cargar();
        const { datos } = estado();
        if (!datos || !datos.editable) return;
        catalogoGrupos = Array.isArray(datos.grupos) ? datos.grupos : [];
        if (!ubicaciones) {
            try {
                const ub = await apiFetch('/api/stock/ubicaciones');
                if (stockUbicacionesValidas(ub)) ubicaciones = ub;
            } catch (e) {
                uiErrorConsulta(e, mostrarErrorCat, 'No se pudieron leer los edificios y pisos.');
            }
        }
        try {            // siempre al abrir: los modelos salen de los dispositivos, que pudieron cambiar
            modelos = (await apiFetchValidado('/api/stock/modelos', stockModelosValidos,
                { mensaje: 'Respuesta inesperada al leer los modelos.' })).modelos;
        } catch (e) {
            uiErrorConsulta(e, mostrarErrorCat, 'No se pudieron leer los modelos.');
        }
        actualizarPestanaCat(pestana);
        modal('stockCatalogoModal').show();
    }
    const abrirUbicaciones = () => abrirCatalogos('edificio');

    // ------------------------------------------------------------------ eventos
    if ($('stock-ubicaciones')) $('stock-ubicaciones').addEventListener('click', abrirUbicaciones);
    for (const objeto of ['edificio', 'piso']) {
        $(`stock-ubi-nuevo-${objeto}`).addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const input = ev.currentTarget.querySelector('input');
            const v = input.value.trim();
            if (v && await editarUbicacion(objeto, 'agregar', v) !== null) {
                input.value = '';
                busquedaUbi = '';
                animarModal('stockCatalogoModal', renderUbicaciones);      // la lista se pintó con el filtro puesto
            }
        });
    }
    const tabEdifBtn = $('stock-cat-tab-edificio');
    const tabPisoBtn = $('stock-cat-tab-piso');
    const tabDispBtn = $('stock-cat-tab-dispositivos');
    const tabModBtn = $('stock-cat-tab-modelos');
    const PESTANAS_CAT = ['edificio', 'piso', 'dispositivos', 'modelos'];
    const mostrarPestanaCat = (pestana) => {
        if (pestana === pestanaCatActual) return;
        const paso = Math.sign(PESTANAS_CAT.indexOf(pestana) - PESTANAS_CAT.indexOf(pestanaCatActual)) || 1;
        uiDeslizarCambio($('stock-cat-contenido'),
            () => animarModal('stockCatalogoModal', () => actualizarPestanaCat(pestana)), paso);
    };
    if (tabEdifBtn) tabEdifBtn.addEventListener('click', () => mostrarPestanaCat('edificio'));
    if (tabPisoBtn) tabPisoBtn.addEventListener('click', () => mostrarPestanaCat('piso'));
    if (tabDispBtn) tabDispBtn.addEventListener('click', () => mostrarPestanaCat('dispositivos'));
    if (tabModBtn) tabModBtn.addEventListener('click', () => mostrarPestanaCat('modelos'));
    for (const [id, filtro] of [['stock-mod-filtro-todos', 'todos'], ['stock-mod-filtro-sin-pagina', 'sin-pagina']]) {
        $(id).addEventListener('click', () => {
            filtroMod = filtro;
            animarModal('stockCatalogoModal', renderModelos);
        });
    }
    const inMod = $('stock-mod-input');
    if (inMod) {
        inMod.addEventListener('input', () => {
            busquedaMod = inMod.value.trim();
            animarModal('stockCatalogoModal', renderModelos);
        });
    }

    const btnFiltroTodos = $('stock-ubi-filtro-todos');
    const btnFiltroSinUso = $('stock-ubi-filtro-sin-uso');
    if (btnFiltroTodos) {
        btnFiltroTodos.addEventListener('click', () => {
            filtroUbi = 'todos';
            animarModal('stockCatalogoModal', renderUbicaciones);
        });
    }
    if (btnFiltroSinUso) {
        btnFiltroSinUso.addEventListener('click', () => {
            filtroUbi = 'sin-uso';
            animarModal('stockCatalogoModal', renderUbicaciones);
        });
    }

    const btnOrdenUbi = $('stock-ubi-btn-orden');
    if (btnOrdenUbi) {
        btnOrdenUbi.addEventListener('click', () => {
            ordenUbiMasUsados = !ordenUbiMasUsados;
            // el reordenamiento entra con la mutación del proyecto (sale la lista, entra la nueva), no de golpe
            mutarContenido($(`stock-ubi-lista-${pestanaCatActual}`), renderUbicaciones, null, null, true);
        });
    }

    const inEdif = $('stock-ubi-input-edificio');
    if (inEdif) {
        inEdif.addEventListener('input', () => {
            busquedaUbi = inEdif.value.trim();
            animarModal('stockCatalogoModal', renderUbicaciones);
        });
    }
    const inPiso = $('stock-ubi-input-piso');
    if (inPiso) {
        inPiso.addEventListener('input', () => {
            busquedaUbi = inPiso.value.trim();
            animarModal('stockCatalogoModal', renderUbicaciones);
        });
    }
    const inCat = $('stock-cat-grupo-nombre');
    if (inCat) {
        inCat.addEventListener('input', () => {
            busquedaCat = inCat.value.trim();
            animarModal('stockCatalogoModal', renderCatalogo);
        });
    }

    // Atajos de teclado en el modal Catálogos:
    // - Escape con algo escrito en el buscador / alta de la pestaña activa: lo limpia (y el modal sigue abierto);
    //   con los campos vacíos, cierra el modal como siempre (ui.js ignora el Escape que ya se atendió).
    // - Letra (A-Z) o número con el foco fuera de un campo: empieza la búsqueda en la pestaña activa.
    document.addEventListener('keydown', (ev) => {
        const modalEl = $('stockCatalogoModal');
        if (!modalEl || !modalEl.classList.contains('show')) return;
        if (typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function'
            && UI.modal.arriba() !== modalEl) return;

        if (ev.key === 'Escape') {
            if (ev.defaultPrevented) return;
            const escritos = [inEdif, inPiso, inCat, inMod].filter(i => i && i.value !== '' && !i.closest('.d-none'));
            if (!escritos.length) return;
            ev.preventDefault();
            for (const input of escritos) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        if (ev.defaultPrevented) return;
        if (document.activeElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
            || document.activeElement.isContentEditable)) return;
        if (!stockEsTeclaBusquedaCatalogo(ev.key, ev.ctrlKey || ev.metaKey || ev.altKey)) return;

        const input = inputBusquedaPestanaActual();
        if (!input || input.disabled || input.closest('.d-none')) return;

        input.focus();
        ev.preventDefault();
        input.value = (input.value || '') + ev.key;
        input.setSelectionRange(input.value.length, input.value.length);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    $('stock-catalogo').addEventListener('click', () => abrirCatalogos('edificio'));
    $('stock-cat-nuevo-grupo').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const input = $('stock-cat-grupo-nombre');
        const v = input.value.trim();
        if (v && await editarCatalogo(urlCatalogo('g'), 'POST', { etiqueta: v })) {
            input.value = '';
            busquedaCat = '';
            animarModal('stockCatalogoModal', renderCatalogo);          // la lista se pintó con el filtro puesto
        }
    });
})();
