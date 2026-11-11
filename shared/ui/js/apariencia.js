// Ajustes > Apariencia de todas las apps con el esqueleto común (SGC, SGR, SGI, SGP):
//   #btn-theme y [data-idr-tema-alternar]  modo oscuro: el tema de TODA la suite (IDRTema, `IDR_dark`); sigue en vivo el
//                    cambio hecho en otra app. Emite `idr:tema` también cuando el cambio vino de afuera
//   #btn-movimiento  reducir animaciones: de esta app (clave y valores que dejó arranque.js en <html>); emite `idr:movimiento`
// Los dos son `.interruptor` con role="switch" (aria-checked). Además, en la pestaña Ajustes: tocar una `.ajuste-fila` con
// interruptor lo acciona, y Enter o Espacio sobre una fila `role="button"` hace clic. Emite `idr:tema` (detail.oscuro) en
// document al cambiar el tema. Se carga al final, después de ui.js.
(function () {
    'use strict';
    const html = document.documentElement;
    const prefijo = html.getAttribute('data-idr-prefijo') || '';
    const $ = (id) => document.getElementById(id);
    const marcar = (boton, on) => { if (boton) boton.setAttribute('aria-checked', String(Boolean(on))); };

    function aplicarTema(oscuro) {
        html.classList.add('theme-transition');
        setTimeout(() => html.classList.remove('theme-transition'), 350);
        const tema = oscuro ? 'dark' : 'light';
        html.setAttribute('data-tema', tema);
        html.style.colorScheme = tema;
        marcar($('btn-theme'), oscuro);
        document.dispatchEvent(new CustomEvent('idr:tema', { detail: { oscuro } }));
    }

    function aplicarMovimiento(reducido) {
        if (reducido) html.setAttribute('data-movimiento', 'reducido');
        else html.removeAttribute('data-movimiento');
        marcar($('btn-movimiento'), reducido);
    }

    document.querySelectorAll('#btn-theme, [data-idr-tema-alternar]').forEach((b) => b.addEventListener('click', () => {
        const oscuro = html.getAttribute('data-tema') !== 'dark';
        aplicarTema(oscuro);
        if (typeof IDRTema !== 'undefined') IDRTema.guardar(oscuro);
    }));

    $('btn-movimiento')?.addEventListener('click', () => {
        const reducido = html.getAttribute('data-movimiento') !== 'reducido';
        aplicarMovimiento(reducido);
        const clave = html.getAttribute('data-idr-clave-movimiento');
        const valor = html.getAttribute(reducido ? 'data-idr-valor-reducido' : 'data-idr-valor-normal');
        try { if (clave) localStorage.setItem(clave, valor); } catch (_) { /* queda en esta página */ }
        document.dispatchEvent(new CustomEvent('idr:movimiento', { detail: { reducido } }));
    });

    // La fila entera acciona su interruptor (como en SGC); el propio interruptor ya responde solo
    document.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const fila = t && t.closest('.ajuste-fila');
        if (!fila || t.closest('.interruptor, button, a, input, select, textarea, label')) return;
        const sw = fila.querySelector('.interruptor');
        if (!sw || sw.disabled || sw.getAttribute('aria-disabled') === 'true') return;
        sw.click();
    });
    document.addEventListener('keydown', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        if (!t || !t.matches('.ajuste-fila[role="button"]') || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        t.click();
    });

    // El tema cambiado en otra app (o en otra ventana), y al volver del caché de «atrás» con el tema viejo
    if (typeof IDRTema !== 'undefined') {
        IDRTema.alCambiar(aplicarTema);
        window.addEventListener('pageshow', (e) => {
            if (!e.persisted) return;
            const suite = IDRTema.oscuro();
            if (suite !== null) aplicarTema(suite);
        });
    }

    marcar($('btn-theme'), html.getAttribute('data-tema') === 'dark');
    marcar($('btn-movimiento'), html.getAttribute('data-movimiento') === 'reducido');
})();
