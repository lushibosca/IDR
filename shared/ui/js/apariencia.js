// Ajustes > Apariencia de las apps con el esqueleto común (SGR, SGI, SGP; SGC tiene lo suyo en app.js):
//   #btn-theme       modo oscuro: el tema de TODA la suite (IDRTema, `IDR_dark`); sigue en vivo el cambio hecho en otra app
//   #btn-movimiento  reducir animaciones: de esta app (`<prefijo>movimiento`, el prefijo lo deja arranque.js en <html>)
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

    $('btn-theme')?.addEventListener('click', () => {
        const oscuro = html.getAttribute('data-tema') !== 'dark';
        aplicarTema(oscuro);
        if (typeof IDRTema !== 'undefined') IDRTema.guardar(oscuro);
    });

    $('btn-movimiento')?.addEventListener('click', () => {
        const reducido = html.getAttribute('data-movimiento') !== 'reducido';
        aplicarMovimiento(reducido);
        try { if (prefijo) localStorage.setItem(prefijo + 'movimiento', reducido ? 'reducido' : 'normal'); } catch (_) { /* queda en esta página */ }
    });

    // La fila entera acciona su interruptor (como en SGC); el propio interruptor ya responde solo
    document.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target : null;
        const fila = t && t.closest('.ajuste-fila');
        if (!fila || t.closest('.interruptor, button, a, input, select, textarea, label')) return;
        fila.querySelector('.interruptor')?.click();
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
