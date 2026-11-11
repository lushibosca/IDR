// Navegación por teclado y rueda del panel lateral para las apps con el esqueleto común SIN motor de navegación propio (SGR, SGI;
// SGC tiene el suyo en app.js, con resultados enfocables). Es lo mismo que hace SGC:
//   Ctrl + flechas   según dónde esté el panel (accionAtajoFlechaCtrl, panel.js): con el panel a un costado, ↑/↓ recorren las pestañas y
//                    ← lleva al buscador; con el panel arriba o abajo, ←/→ recorren las pestañas y ↑/↓ llevan al buscador.
//                    Si el panel estaba plegado, el buscador lo despliega.
//   Rueda del mouse  sobre el panel: recorre las pestañas (se apaga en Ajustes con #btn-rueda-pestanas; `<prefijo>rueda_pestanas` = '0').
// Se carga después de panel.js y ui.js.

// ==== NAVEGACION PURO BEGIN ====
/** Pestañas que recorren Ctrl+flechas y la rueda: las visibles y habilitadas (nada de `data-sin-ciclo` ni el ícono de buscar del móvil). */
function navegacionPestanasCiclables(botones) {
    return botones.filter((b) => !b.oculto && !b.deshabilitado && !b.sinCiclo && !b.soloMovil);
}
// ==== NAVEGACION PURO END ====

(function () {
    'use strict';
    const html = document.documentElement;
    const prefijo = html.getAttribute('data-idr-prefijo') || '';
    const clave = `${prefijo}rueda_pestanas`;
    const leer = () => { try { return localStorage.getItem(clave); } catch (_) { return null; } };
    const ruedaActiva = () => leer() !== '0';
    const hayModal = () => typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function' && !!UI.modal.arriba();

    function pestanas() {
        const botones = Array.from(document.querySelectorAll('#v-pills-tab button[data-ui-toggle="pill"]'));
        const util = navegacionPestanasCiclables(botones.map((b) => ({
            b, oculto: b.classList.contains('d-none') || b.hidden, deshabilitado: b.disabled, sinCiclo: b.hasAttribute('data-sin-ciclo'),
            soloMovil: b.classList.contains('solo-movil'),
        })));
        return util.map((x) => x.b);
    }
    let ultimo = 0;
    function recorrer(paso) {
        const ahora = Date.now();
        if (ahora - ultimo < 200) return;                       // un giro de rueda o una tecla repetida no salta varias
        ultimo = ahora;
        const tabs = pestanas();
        if (!tabs.length) return;
        const actual = tabs.findIndex((t) => t.classList.contains('active'));
        const sig = actual < 0 ? (paso > 0 ? 0 : tabs.length - 1) : (actual + paso + tabs.length) % tabs.length;
        UI.pestana.mostrar(tabs[sig]);
    }

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.defaultPrevented) return;
        const posicion = typeof posicionPanelActual === 'function' ? posicionPanelActual() : 'left';
        const accion = accionAtajoFlechaCtrl(e.key, posicion);
        if (!accion || hayModal()) return;
        if (accion === 'pestana-anterior' || accion === 'pestana-siguiente') {
            e.preventDefault();
            recorrer(accion === 'pestana-siguiente' ? 1 : -1);
        } else if (accion === 'buscador') {
            const buscador = document.getElementById('global-search');
            if (!buscador) return;
            const abrir = typeof estadoPanelLateral !== 'undefined' && estadoPanelLateral.colapsado;
            if (document.activeElement !== buscador || abrir) {
                e.preventDefault();
                if (typeof panelLateral === 'function') panelLateral('buscar');
                buscador.focus();
                if (typeof buscador.select === 'function') buscador.select();
            }
        }
    });

    function alRueda(e) {
        if (!ruedaActiva() || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || hayModal()) return;
        if (e.target instanceof Element && e.target.closest('.dropdown-menu')) return;
        const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
        if (!delta) return;
        e.preventDefault();
        e.stopPropagation();
        recorrer(delta > 0 ? 1 : -1);
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('sidebar-col')?.addEventListener('wheel', alRueda, { passive: false });
        const interruptor = document.getElementById('btn-rueda-pestanas');
        if (!interruptor) return;
        interruptor.setAttribute('aria-checked', String(ruedaActiva()));
        interruptor.addEventListener('click', () => {
            const activa = !ruedaActiva();
            try { localStorage.setItem(clave, activa ? '1' : '0'); } catch (_) { /* queda en esta página */ }
            interruptor.setAttribute('aria-checked', String(activa));
        });
    });
})();
