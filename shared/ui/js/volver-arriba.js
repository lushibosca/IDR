// Botón «Volver arriba» (#btn-scroll-top, marcado único): aparece (`.show`) al bajar más de 300 px y sube con scroll suave
// (instantáneo si la persona eligió «reducir animaciones», `data-movimiento="reducido"`, o el sistema lo pide).
(function () {
    'use strict';
    const btn = document.getElementById('btn-scroll-top');
    if (!btn) return;
    window.addEventListener('scroll', () => btn.classList.toggle('show', window.scrollY > 300), { passive: true });
    btn.addEventListener('click', () => {
        const quieto = document.documentElement.getAttribute('data-movimiento') === 'reducido'
            || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' });
    });
})();
