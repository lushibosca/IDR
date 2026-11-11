// Auditoría > Base de datos: los últimos cambios de la base de stock (dispositivos y catálogo), 30 por página con
// «Cargar más», filtro por acción y la búsqueda del panel (va al servidor: «juan» trae TODOS los eventos
// de juan, no solo los de las páginas ya cargadas). Lectura local de la base: no consulta a los equipos; sin polling.
// La lógica pura (URL, validación, textos) está en el bloque STOCK PURO de stock.js; acá solo el DOM.
// Se carga después de consultas.js (uiConsultaDemanda) y de stock.js. La tarjeta se ve en la pestaña Historial (escritorio) o
// en la ventana de Ajustes > Historial (historial-modal.js, que llama a `window.historialMostrar`).
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    if (!$('bd-form') || typeof uiConsultaDemanda !== 'function') return;

    const ESPERA_BUSQUEDA_MS = 350;       // escribir en el buscador no consulta en cada tecla
    let cargadaUnaVez = false;
    let esperaBusqueda = null;

    const termino = () => String(terminoBusquedaActual() || '').trim().slice(0, 60);
    const visible = () => {
        const p = $('auditoria-bd');
        return (!!p && p.classList.contains('active') && !!$('bd-card').closest('#auditoria-bd'))
            || !!$('bd-card').closest('#modal-historial.show');
    };

    function leer() {
        return { accion: $('bd-accion').value, q: termino() };
    }

    async function pedir(base, anterior) {
        const hist = await apiFetchValidado(stockHistorialUrl({ ...base, offset: anterior ? anterior.siguiente : 0 }),
            stockHistorialRecienteValido);
        return { ...base, cambios: (anterior ? anterior.cambios : []).concat(hist.cambios),
            siguiente: hist.siguiente_offset, hora: new Date().toLocaleTimeString() };
    }

    function pintar(consulta, lista) {
        const tbody = $('bd-tbody');
        tbody.replaceChildren();
        for (const cambio of lista) {
            const tr = document.createElement('tr');

            // 1. Fecha / Acción: Fecha arriba, badge de acción debajo
            const tdFechaAccion = uiCelda(tr, '', 'text-nowrap');
            const fechaTxt = uiFechaHora(cambio.cuando);
            const divFecha = uiNodo('div', 'fw-medium', fechaTxt);
            divFecha.title = fechaTxt;

            const accion = STOCK_ACCIONES.get(cambio.accion);
            const divAccion = uiNodo('div', 'mt-1');
            divAccion.appendChild(uiNodo('span', `badge ${accion ? accion.clase : 'bg-secondary'}`, accion ? accion.texto : cambio.accion));
            tdFechaAccion.append(divFecha, divAccion);

            // 2. Usuario / Origen: Usuario arriba, origen debajo
            const tdUsuario = uiCelda(tr, '');
            const usr = cambio.usuario || '';
            const orig = STOCK_ORIGENES.get(cambio.origen) || cambio.origen || '';
            if (!usr && !orig) {
                tdUsuario.textContent = '—';
                tdUsuario.className = 'text-secondary';
            } else {
                const divUsr = uiNodo('div', usr ? 'fw-medium text-break' : 'text-secondary small', usr || '—');
                if (usr) divUsr.title = usr;
                const divOrig = uiNodo('div', orig ? 'text-secondary small text-break' : 'text-secondary small', orig || '—');
                if (orig) divOrig.title = orig;
                tdUsuario.append(divUsr, divOrig);
            }

            // 3. Elemento (máximo 2 líneas, tooltip si no se llega a mostrar completo)
            const tdElemento = uiCelda(tr, '', 'text-break');
            const textoElemento = (stockHistorialElemento(cambio) || '').trim();
            const resumenElemento = textoElemento.replace(/\s+/g, ' ');
            const esLargoElemento = resumenElemento.length > 95;
            const mostradoElemento = esLargoElemento ? resumenElemento.slice(0, 92) + '…' : resumenElemento;

            const abrir = typeof window.abrirModalDispositivo === 'function';
            if (abrir && cambio.dispositivo_id && !cambio.dispositivo_borrado) {
                const btn = uiNodo('button', 'btn btn-link btn-sm p-0 text-start text-break', mostradoElemento);
                btn.type = 'button';
                btn.title = textoElemento ? `${textoElemento} · Clic para ver el dispositivo` : 'Ver el dispositivo';
                btn.addEventListener('click', () => window.abrirModalDispositivo(cambio.dispositivo_id));
                if (esLargoElemento) {
                    btn.classList.add('cursor-ayuda');
                    tdElemento.classList.add('cursor-ayuda');
                }
                tdElemento.title = btn.title;
                tdElemento.appendChild(btn);
            } else {
                tdElemento.textContent = mostradoElemento || '—';
                if (textoElemento) tdElemento.title = textoElemento;
                if (esLargoElemento) tdElemento.classList.add('cursor-ayuda');
            }

            // 4. Cambio (máximo 2 líneas, tooltip si no se llega a mostrar completo)
            const tdCambio = uiCelda(tr, '', 'text-secondary small text-break');
            const textoCambio = (stockHistorialCambio(cambio) || '').trim();
            if (textoCambio) {
                tdCambio.title = textoCambio;
                const resumenCambio = textoCambio.replace(/\s+/g, ' ');
                if (resumenCambio.length > 95) {
                    tdCambio.textContent = resumenCambio.slice(0, 92) + '…';
                    tdCambio.classList.add('cursor-ayuda');
                } else {
                    tdCambio.textContent = resumenCambio;
                }
            } else {
                tdCambio.textContent = '—';
            }

            tbody.appendChild(tr);
        }
        const vacio = $('bd-vacio');
        vacio.classList.toggle('d-none', lista.length > 0);
        if (!lista.length) {
            vacio.textContent = consulta.q || consulta.accion
                ? 'Ningún cambio coincide con la búsqueda o el filtro.'
                : 'La base de stock todavía no tiene cambios.';
        }
        const filtro = [consulta.accion && `Solo ${STOCK_ACCIONES.get(consulta.accion).plural.toLowerCase()}`,
            consulta.q && `«${consulta.q}»`].filter(Boolean).join(' · ');
        $('bd-titulo').textContent = filtro ? `Últimos cambios · ${filtro}` : 'Últimos cambios';
        const s = lista.length === 1 ? '' : 's';
        $('bd-pie').textContent = [`${lista.length} cambio${s} cargado${s}`, `consultado ${consulta.hora}`,
            'horas de este navegador'].join(' · ');
    }

    const ctl = uiConsultaDemanda({
        prefijo: 'bd',
        leer,
        pedir,
        filtrar: (consulta) => consulta.cambios,   // la búsqueda ya la aplicó el servidor (sobre TODA la base)
        pintar,
        alLimpiar: () => {
            const sel = $('bd-accion');
            sel.value = '';
            sel.dispatchEvent(new Event('change'));             // el desplegable con estilo refleja el cambio
        },
        pestanas: ['v-pills-auditoria-tab'],
        // al abrir la subpestaña se lee una vez; si la búsqueda cambió mientras estaba oculta, se vuelve a leer
        alMostrar: () => {
            if (cargadaUnaVez && ctl.consulta && ctl.consulta.q === termino()) return false;
            cargadaUnaVez = true;
            ctl.consultar(false);
            return true;
        },
    });
    if (!ctl) return;

    // Búsqueda del panel: con la subpestaña a la vista, vuelve a consultar con el texto nuevo (con una espera corta)
    document.addEventListener('cctv:busqueda', () => {
        if (!visible() || !cargadaUnaVez) return;
        clearTimeout(esperaBusqueda);
        esperaBusqueda = setTimeout(() => {
            if (!ctl.consulta || ctl.consulta.q !== termino()) ctl.consultar(false);
        }, ESPERA_BUSQUEDA_MS);
    });
    $('bd-accion').addEventListener('change', () => { if (cargadaUnaVez && !ctl.enCurso) ctl.consultar(false); });

    window.obtenerConteoBaseDatos = ctl.conteo;
    window.historialMostrar = ctl.alMostrar;
})();
