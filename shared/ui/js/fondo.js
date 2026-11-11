// Fondo de página (fondo.css): al tocar la marca (el enlace al launcher) el fondo se desvanece (`.exiting`) y recién entonces se va, como
// hacía cada app; al volver con «atrás» desde el caché se quita. Ctrl/Mayús/clic del medio abren aparte sin esperar. Con «reducir
// animaciones» se va directo. Se carga al final.
(function () {
    'use strict';
    const fondo = document.querySelector('.bg-backdrop');
    const enlace = document.querySelector('.brand-launcher');
    if (!fondo) return;
    if (enlace) {
        enlace.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
            if (document.documentElement.getAttribute('data-movimiento') === 'reducido'
                || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
            e.preventDefault();
            fondo.classList.add('exiting');
            setTimeout(() => { window.location.href = enlace.href; }, 220);
        });
    }
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) { fondo.classList.remove('exiting'); void fondo.offsetWidth; }
    });
})();
