// Launcher: lo que no es de la base de la suite. El tema (idr-tema.js, arranque.js, apariencia.js), el botón de instalar (instalar.js), la
// versión (idr-version.js) y el aviso de actualización (idr-actualizacion.js) son compartidos; acá quedan el ícono del tema, la animación de
// salida al abrir una app, la navegación con teclado y la limpieza de los Service Workers viejos por app.
(function initLauncher() {
    'use strict';

    // --- Ícono y ayuda del botón de tema (el cambio lo hace apariencia.js y avisa con `idr:tema`) ---
    function pintarTema() {
        const oscuro = document.documentElement.getAttribute('data-tema') === 'dark';
        const btn = document.getElementById('btn-dark-mode');
        const icono = document.getElementById('icono-tema');
        if (btn) btn.title = oscuro ? 'Activar modo claro' : 'Activar modo oscuro';
        if (icono) icono.className = oscuro ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
    }
    document.addEventListener('idr:tema', pintarTema);

    // Saneamiento: los Service Workers de las subcarpetas (uno por app, de antes del unificado) se desregistran
    function limpiarWorkersViejos() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.getRegistrations().then((registros) => {
                const raiz = new URL('./', window.location.href).href;
                registros.forEach((reg) => {
                    if (reg.scope !== raiz && /\/(SGC|SGI|SGL|SGP|SGR)\//.test(reg.scope)) reg.unregister();
                });
            }).catch(() => {});
        });
    }

    // --- Navegación animada: las tarjetas y el fondo se desvanecen y recién entonces se abre la app ---
    function setupNavigation() {
        const tarjetas = document.querySelectorAll('.app-card');
        const fondo = document.querySelector('.bg-backdrop');

        tarjetas.forEach((card) => {
            card.addEventListener('click', (e) => {
                // Ctrl/Cmd/Mayús + clic abren aparte sin bloquear el comportamiento nativo
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                const destino = card.href;
                const reducido = document.documentElement.getAttribute('data-movimiento') === 'reducido'
                    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (reducido) { window.location.href = destino; return; }

                tarjetas.forEach((c) => {
                    c.style.animationDelay = '0s';
                    c.classList.add('exiting');
                });
                if (fondo) fondo.classList.add('exiting');

                let fue = false;
                const ir = () => {
                    if (!fue) { fue = true; window.location.href = destino; }
                };
                card.addEventListener('animationend', ir, { once: true });
                setTimeout(ir, 250);                 // lo que dura el desenfoque de salida
            });
        });
    }

    // --- LÓGICA DE NAVEGACIÓN CON TECLADO (DESKTOP) ---
    function setupKeyboardNavigation() {
        const getCards = () => Array.from(document.querySelectorAll('.app-card:not(.disabled)'));
        const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.innerWidth >= 768;

        function getGridColumns(cards) {
            if (cards.length < 2) return 1;
            const firstTop = cards[0].offsetTop;
            let cols = 0;
            for (const c of cards) {
                if (Math.abs(c.offsetTop - firstTop) < 15) cols++;
                else break;
            }
            return Math.max(1, cols);
        }

        // Foco inicial automático al cargar la página en desktop
        if (isDesktop()) {
            const cards = getCards();
            if (cards.length > 0) {
                setTimeout(() => {
                    if (!document.activeElement || document.activeElement === document.body) {
                        cards[0].focus();
                    }
                }, 60);
            }
        }

        window.addEventListener('keydown', (e) => {
            // Evitar interferir con combinaciones que usen Ctrl, Alt o Meta
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            const cards = getCards();
            if (cards.length === 0) return;

            const active = document.activeElement;
            const currentIndex = cards.indexOf(active);
            const cols = getGridColumns(cards);
            const hasMultipleRows = cols < cards.length;

            switch (e.key) {
                case 'ArrowRight': {
                    e.preventDefault();
                    if (currentIndex === -1) {
                        cards[0].focus();
                    } else {
                        const next = (currentIndex + 1) % cards.length;
                        cards[next].focus();
                    }
                    break;
                }
                case 'ArrowLeft': {
                    e.preventDefault();
                    if (currentIndex === -1) {
                        cards[cards.length - 1].focus();
                    } else {
                        const prev = (currentIndex - 1 + cards.length) % cards.length;
                        cards[prev].focus();
                    }
                    break;
                }
                case 'ArrowDown': {
                    e.preventDefault();
                    if (currentIndex === -1) {
                        cards[0].focus();
                    } else if (!hasMultipleRows) {
                        // En 1 fila, avanza a la siguiente tarjeta
                        const next = (currentIndex + 1) % cards.length;
                        cards[next].focus();
                    } else {
                        // En grid multi-fila, baja a la misma columna en la siguiente fila
                        let target = currentIndex + cols;
                        if (target >= cards.length) {
                            target = currentIndex % cols;
                            if (target >= cards.length) target = 0;
                        }
                        cards[target].focus();
                    }
                    break;
                }
                case 'ArrowUp': {
                    e.preventDefault();
                    if (currentIndex === -1) {
                        cards[cards.length - 1].focus();
                    } else if (!hasMultipleRows) {
                        // En 1 fila, retrocede a la tarjeta anterior
                        const prev = (currentIndex - 1 + cards.length) % cards.length;
                        cards[prev].focus();
                    } else {
                        // En grid multi-fila, sube a la misma columna en la fila previa
                        let target = currentIndex - cols;
                        if (target < 0) {
                            const colIndex = currentIndex % cols;
                            const totalRows = Math.ceil(cards.length / cols);
                            target = (totalRows - 1) * cols + colIndex;
                            if (target >= cards.length) target -= cols;
                        }
                        cards[target].focus();
                    }
                    break;
                }
                case ' ': {
                    if (currentIndex !== -1) {
                        e.preventDefault();
                        cards[currentIndex].click();
                    }
                    break;
                }
            }
        });
    }

    // --- Caché de navegación (Firefox): al volver con «atrás» las tarjetas y el fondo salen de su estado de salida ---
    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        document.querySelectorAll('.app-card').forEach((card) => {
            card.classList.remove('exiting');
            card.style.animationDelay = '';
            void card.offsetWidth;                   // fuerza el redibujo: sin esto, los íconos quedaban invisibles en Firefox
        });
        const fondo = document.querySelector('.bg-backdrop');
        if (fondo) { fondo.classList.remove('exiting'); void fondo.offsetWidth; }
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.innerWidth >= 768) {
            const activas = Array.from(document.querySelectorAll('.app-card:not(.disabled)'));
            if (activas.length > 0) setTimeout(() => activas[0].focus(), 50);
        }
    });

    function boot() {
        pintarTema();
        limpiarWorkersViejos();
        setupNavigation();
        setupKeyboardNavigation();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
