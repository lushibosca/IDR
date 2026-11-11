// Producción > modo selección (popup del equipo > «Seleccionar», o pulsación larga, o Espacio sobre un equipo): se marcan equipos
// y una barra abajo ofrece «Agregar a favoritos» y «Listar». Es el mismo modo que el de Activos (stock-seleccion.js), con su barra
// propia. Se selecciona por DISPOSITIVO: uno del stock es uno aunque esté en dos grabadores (`data-sel-clave` = `s:<id del stock>`);
// un canal sin alta en el stock es `c:<NVR>:<canal>`. Solo entrada: favoritos y Listar usan lo que ya hay (favoritos.js, stock-listar.js).

// ==== PRODUCCION SELECCION PURO BEGIN ====
/** Lo marcado, listo para usar: `reps` = Map clave -> { stockId, nvrIp, canal }; `elegidas` = Set de claves.
 *  { stockIds: dispositivos del stock (sin repetir), claves: canales sin alta (`cam:IP:canal`), sinStock: cuántos no tienen alta } */
function produccionPartesSeleccion(reps, elegidas) {
    const stockIds = [];
    const claves = [];
    for (const clave of elegidas) {
        const r = reps.get(clave);
        if (!r) continue;
        if (r.stockId) {
            if (!stockIds.includes(r.stockId)) stockIds.push(r.stockId);
        } else if (r.nvrIp && r.canal) {
            claves.push(`cam:${r.nvrIp}:${r.canal}`);
        }
    }
    return { stockIds, claves, sinStock: claves.length };
}
// ==== PRODUCCION SELECCION PURO END ====

(function initProduccionSeleccion() {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const panel = $('v-pills-produccion');
    const acordeon = $('produccion-accordion');
    if (!$('produccion-seleccion-banner') || !panel || !acordeon) return;

    const SELECTOR_ITEM = '.canal-item:not(.canal-item-disponible)';
    const items = () => [...acordeon.querySelectorAll(SELECTOR_ITEM)];
    const produccionActiva = () => panel.classList.contains('active');
    const representantes = () => new Map(items().map(el => [el.dataset.selClave,
        { stockId: el.dataset.selStock, nvrIp: el.dataset.nvrIp, canal: uiNumeroCanal(el.dataset.channelId) }]));

    // Las claves que existen en los datos, no solo las que hoy están pintadas: una búsqueda deja afuera equipos marcados y no
    // por eso se desmarcan (como en Activos)
    const vigentes = () => {
        const claves = new Set(items().map(el => el.dataset.selClave));
        for (const cam of uiCamarasCargadas()) {
            claves.add(cam.stock && cam.stock.id ? `s:${cam.stock.id}` : `c:${cam.nvr_ip || ''}:${cam.channel_id ?? ''}`);
        }
        if (typeof obtenerOtrosDispositivosProduccion === 'function') {
            for (const d of obtenerOtrosDispositivosProduccion()) if (d && d.id) claves.add(`s:${d.id}`);
        }
        return claves;
    };

    // Lo común (barra, contador, «Visibles», Ctrl + A, Escape, clic afuera): uiModoSeleccion de comun.js. La lista la rearma
    // produccion.js con cada carga o filtro sin avisar: se vuelve a marcar sola (`repintarAlCambiar`).
    const modo = uiModoSeleccion({
        panel, contenedor: acordeon, banner: $('produccion-seleccion-banner'), claseModo: 'produccion-modo-seleccion',
        items, claveDe: el => el.dataset.selClave, vigentes, contador: $('produccion-sel-contador'), botonVisibles: $('produccion-sel-visibles'),
        acciones: ['produccion-sel-favoritos', 'produccion-sel-listar', 'produccion-sel-cambiar'].map($),
        sigueEnElModo: '#produccion-vista-modo', controlesDeLaLista: '.canal-item, .accordion-header', repintarAlCambiar: true,
    });
    const { elegidos, entrar, salir, alternar } = modo;

    window.produccionSeleccion = { entrar, salir, alternar, pintar: modo.pintar, activo: modo.activo };

    const itemDe = (ev) => (ev.target instanceof Element ? ev.target.closest(SELECTOR_ITEM) : null);
    const enAcordeon = (el) => !!el && acordeon.contains(el);

    // Pulsación larga sobre un equipo: entra al modo con ese marcado (ya dentro, lo marca o desmarca). Va ANTES del clic de abajo:
    // así frena el clic que sigue a la pulsación (si no, abriría el popup o lo desmarcaría).
    uiAtajoPulsacionLarga(acordeon, (el) => {
        if (modo.activo()) alternar(el.dataset.selClave); else entrar(el.dataset.selClave);
    }, SELECTOR_ITEM);

    // En el modo, un clic marca o desmarca (no abre el popup ni el modal). Al registrarse en el acordeón después de
    // uiAtajoPulsacionLarga, el clic que sigue a una pulsación larga es tragado por esta sin llegar acá.
    acordeon.addEventListener('click', (ev) => {
        if (!modo.activo() || !produccionActiva()) return;
        if (typeof UI !== 'undefined' && UI.modal.arriba()) return;
        const el = itemDe(ev);
        if (!enAcordeon(el)) return;
        // Sin excepción para la IP ni las celdas copiables: en el modo no se copia (el doble clic no llega a copiar), y un clic
        // sobre ellas que no marcaba parecía una selección trabada
        ev.stopImmediatePropagation();
        alternar(el.dataset.selClave);
    });
    acordeon.addEventListener('dblclick', (ev) => {
        if (!modo.activo() || !produccionActiva() || !enAcordeon(itemDe(ev))) return;
        ev.stopImmediatePropagation();
    });

    // Teclado sobre un equipo: Espacio empieza la selección con ese marcado; Enter abre el popup. Dentro del modo, las dos marcan.
    document.addEventListener('keydown', (ev) => {
        if ((ev.key !== 'Enter' && ev.key !== ' ') || !produccionActiva()) return;
        if (ev.ctrlKey || ev.altKey || ev.metaKey || (ev.shiftKey && ev.key === 'Enter')) return;
        const el = itemDe(ev);
        if (!enAcordeon(el) || ev.target !== el) return;
        if (modo.activo()) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            alternar(el.dataset.selClave);
        } else if (ev.key === ' ') {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            entrar(el.dataset.selClave);
        }
    }, true);

    // Barra de abajo: «Agregar a favoritos», «Listar» y «Cambiar datos»
    $('produccion-sel-favoritos').addEventListener('click', () => {
        if (!elegidos.size || typeof window.favoritosAgregarSeleccion !== 'function') return;
        const p = produccionPartesSeleccion(representantes(), elegidos);
        const r = window.favoritosAgregarSeleccion(p.stockIds, p.claves);
        mostrarToast(r.texto, r.agregados ? 'success' : 'warning');
    });
    $('produccion-sel-listar').addEventListener('click', () => abrirListar());
    // «Cambiar datos»: el mismo modal de Activos, con los dispositivos del stock marcados (rol operador o más: el servidor lo exige)
    $('produccion-sel-cambiar').addEventListener('click', async () => {
        const nucleo = window.StockNucleo;
        if (!elegidos.size || !nucleo || !nucleo.seleccion || typeof nucleo.seleccion.cambiarDatos !== 'function') return;
        const p = produccionPartesSeleccion(representantes(), elegidos);
        if (!p.stockIds.length) {
            mostrarToast('Lo marcado no tiene alta en el stock: no hay datos para cambiar.', 'warning');
            return;
        }
        if (p.sinStock) mostrarToast(`${p.sinStock} sin alta en el stock no se cambian.`, 'info');
        if (!(await nucleo.seleccion.cambiarDatos(p.stockIds))) mostrarToast('No tenés permiso para cambiar datos del stock.', 'warning');
    });
    document.addEventListener('cctv:lote-aplicado', () => { if (modo.activo()) salir(); });

    function abrirListar() {
        const nucleo = window.StockNucleo;
        if (!elegidos.size || !nucleo || !nucleo.seleccion || typeof nucleo.seleccion.listar !== 'function') return;
        const p = produccionPartesSeleccion(representantes(), elegidos);
        if (!p.stockIds.length) {
            mostrarToast('Lo marcado no tiene alta en el stock: no hay nada para listar.', 'warning');
            return;
        }
        if (p.sinStock) mostrarToast(`${p.sinStock} sin alta en el stock no se listan.`, 'info');
        nucleo.seleccion.listar(p.stockIds);
    }

    // Alt+Shift+L lista lo marcado (Ctrl + A y Escape: uiModoSeleccion)
    document.addEventListener('keydown', (ev) => {
        if (!modo.activo() || !produccionActiva() || !uiEsAtajoAltShift(ev, 'l')) return;
        if (typeof UI !== 'undefined' && UI.modal.arriba()) return;
        ev.preventDefault();
        abrirListar();
    });
})();
