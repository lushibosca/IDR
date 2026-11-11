// Portado de cctv_monitor/static/consultas.js (sin cambios salvo `alMostrar` en lo que devuelve, para abrir el Historial
// desde su ventana). Controlador común de las pantallas de consulta A DEMANDA con resultado filtrable (hoy: Historial). Antes cada una repetía el mismo ciclo: estado de la última consulta, botón ocupado, banner
// de error, «Cargar más», Limpiar, rango personalizado, búsqueda global, repintado al mostrar la pestaña y el conteo
// de la insignia. Acá está una sola vez; cada pantalla aporta solo lo suyo (qué pedir y cómo pintarlo).
//
// Sin temporizadores ni polling: la consulta sale al enviar el formulario (o «Cargar más», o un atajo). Se carga
// después de app.js (usa uiMostrarBanner, uiBotonOcupado, uiErrorConsulta, terminoBusquedaActual,
// actualizarBadgeAuditoria) y de animaciones.js (mostrarResultadoConsulta, animarAlturaDe, ocultarContenido).

/**
 * @param {object} op
 * @param {string} op.prefijo   ids `${prefijo}-form|-error|-card|-resultado|-consultar` y, si existen, `-mas`,
 *                              `-limpiar`, `-exportar`, `-rango`/`-personalizado`/`-desde`/`-hasta`
 * @param {Function} op.leer    (opciones) -> base de la consulta, o un texto = error de validación del formulario
 * @param {Function} op.pedir   async (base, anterior, opciones) -> consulta nueva; `anterior` es la consulta que se
 *                              continúa con «Cargar más» (si no, null). null = no hay resultado (el error ya se mostró)
 * @param {Function} op.filtrar (consulta, termino) -> lo visible (búsqueda global y filtros propios)
 * @param {Function} op.pintar  (consulta, vistos) -> pinta el panel (solo con consulta)
 * @param {Function} [op.antesDePintar] () -> lo que se pinta haya o no consulta (chips, iconos de orden)
 * @param {Function} [op.exportar] (vistos, consulta) -> descarga
 * @param {Function} [op.alLimpiar] () -> reinicia el estado propio de la pantalla al tocar Limpiar
 * @param {Function} [op.poblar] () -> llena los selectores (al cargar, con cada /api/v2/datos y al mostrar la pestaña)
 * @param {string[]} [op.pestanas] ids de las pestañas que, al mostrarse, repintan con la búsqueda vigente
 * @param {Function} [op.alMostrar] () -> true si ya se ocupó de la pestaña mostrada (p. ej. la primera lectura)
 * @param {object} [op.rango] { sugerenciaMs }: al elegir «personalizado» sin fechas propone esa ventana hasta ahora
 * @returns {{consultar: Function, repintar: Function, repintarAnimado: Function, conteo: Function,
 *            mostrarError: Function, alMostrar: Function, readonly consulta: object|null, readonly enCurso: boolean}}
 */
function uiConsultaDemanda(op) {
    const id = (sufijo) => document.getElementById(`${op.prefijo}-${sufijo}`);
    const form = id('form');
    if (!form) return null;
    const panel = id('resultado');
    const card = id('card');
    const btnConsultar = id('consultar');
    const btnMas = id('mas');
    const btnExportar = id('exportar');

    let consulta = null;
    let enCurso = false;

    const mostrarError = (texto) => uiMostrarBanner(id('error'), texto);
    const vistos = () => (consulta ? op.filtrar(consulta, terminoBusquedaActual()) : []);

    function repintar() {
        if (op.antesDePintar) op.antesDePintar();
        panel.classList.toggle('d-none', !consulta);
        if (!consulta) return;
        const lista = vistos();
        actualizarBadgeAuditoria();
        op.pintar(consulta, lista);
        if (btnExportar) btnExportar.disabled = lista.length === 0;
        if (btnMas) btnMas.classList.toggle('d-none', consulta.siguiente === null || consulta.siguiente === undefined);
    }

    const repintarAnimado = () => { if (consulta) animarAlturaDe(card, repintar); };

    function ocupado(si) {
        enCurso = si;
        btnConsultar.disabled = si;
        if (btnMas) btnMas.disabled = si;
        uiBotonOcupado(btnConsultar, si);
    }

    // masPaginas: continúa la consulta vigente (misma ventana); `opciones` llega a leer y pedir (forzar, origen...)
    async function consultar(masPaginas = false, opciones = {}) {
        if (enCurso) return;
        mostrarError('');
        const anterior = masPaginas ? consulta : null;
        const base = anterior || op.leer(opciones);
        if (typeof base === 'string') { mostrarError(base); return; }
        ocupado(true);
        try {
            const nueva = await op.pedir(base, anterior, opciones);
            if (!nueva) return;
            const aplicar = () => { consulta = nueva; repintar(); };
            if (anterior) animarAlturaDe(card, aplicar);
            else await mostrarResultadoConsulta(panel, aplicar);
        } catch (e) {
            uiErrorConsulta(e, mostrarError);
        } finally {
            ocupado(false);
        }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); consultar(false, { desdeFormulario: true }); });
    if (btnMas) btnMas.addEventListener('click', () => consultar(true));
    if (btnExportar && op.exportar) {
        btnExportar.addEventListener('click', () => { if (consulta) op.exportar(vistos(), consulta); });
    }
    const btnLimpiar = id('limpiar');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            mostrarError('');
            if (op.alLimpiar) op.alLimpiar();
            ocultarContenido(panel, () => { consulta = null; repintar(); });
        });
    }
    document.addEventListener('cctv:busqueda', repintarAnimado);

    const selRango = id('rango');
    if (selRango && op.rango) {
        selRango.addEventListener('change', () => {
            const custom = selRango.value === 'custom';
            id('personalizado').classList.toggle('show', custom);
            if (custom && !id('desde').value && !id('hasta').value) {
                const ahora = new Date();
                id('hasta').value = uiValorFechaLocal(ahora);
                id('desde').value = uiValorFechaLocal(new Date(ahora.getTime() - op.rango.sugerenciaMs));
            }
        });
    }

    // Abrir la pestaña no consulta la red: repinta lo que ya había con la búsqueda vigente
    function alMostrarPestana() {
        if (op.poblar) op.poblar();
        if (op.alMostrar && op.alMostrar()) return;
        if (consulta) repintar();
    }
    for (const t of op.pestanas || []) {
        const tab = document.getElementById(t);
        if (tab) tab.addEventListener('ui:pestana-mostrada', alMostrarPestana);
    }
    if (op.poblar) {
        document.addEventListener('cctv:datos', op.poblar);
        op.poblar();
    }

    return {
        consultar,
        repintar,
        repintarAnimado,
        mostrarError,
        alMostrar: alMostrarPestana,      // lo que hace al mostrarse la pestaña (o la ventana) de la consulta
        // para la insignia de Auditoría: null si todavía no hay una consulta a la vista
        conteo: () => (consulta && !panel.classList.contains('d-none') ? vistos().length : null),
        get consulta() { return consulta; },
        get enCurso() { return enCurso; },
    };
}
window.uiConsultaDemanda = uiConsultaDemanda;
