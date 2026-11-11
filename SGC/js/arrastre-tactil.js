// Reubicar con el dedo (pulsación larga y arrastre: apartados del panel, tarjetas, chips, fichas) sin que la página haga scroll.
// `touch-action: none` que fija uiArrastreLargo al empezar llega tarde: el navegador decide el gesto al tocar. Por eso, mientras
// dura el arrastre (`html.arrastrando-largo`) se cancelan los `touchmove` (no se desplaza ni rebota la página) y se quita la
// selección de texto. Se carga después de comun.js.
(function () {
    'use strict';
    const raiz = document.documentElement;
    document.addEventListener('touchmove', (e) => {
        if (raiz.classList.contains('arrastrando-largo') && e.cancelable) e.preventDefault();
    }, { passive: false });
})();
