// Envolvemos el código en una IIFE para no contaminar el objeto window (Cybersecurity Best Practice)
(function initLauncher() {
    'use strict';

    const STORAGE_KEY_DARK_MODE = 'IDR_dark';
    const btnDarkMode = document.getElementById('btn-dark-mode');
    const iconThemeUse = document.getElementById('icon-theme-use');
    
    // Elementos PWA
    const btnInstallApp = document.getElementById('btn-install-app');
    let deferredPrompt;

    // --- LÓGICA DE MODO OSCURO ---
    function isDarkModeActive() {
        try { return localStorage.getItem(STORAGE_KEY_DARK_MODE) === '1'; } 
        catch (e) { return false; }
    }

    function setDarkMode(isActive) {
        try { localStorage.setItem(STORAGE_KEY_DARK_MODE, isActive ? '1' : '0'); } 
        catch (e) {}
    } 

    function renderTheme(isDark) {
        if (isDark) document.documentElement.classList.add('dark-mode');
        else document.documentElement.classList.remove('dark-mode');

        if (btnDarkMode && iconThemeUse) {
            btnDarkMode.title = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
            iconThemeUse.setAttribute('href', isDark ? '#icon-sun' : '#icon-moon');
        }
    }

    // --- LÓGICA PWA (INSTALADOR) ---
    function setupPWA() {
        // Escuchar si el navegador permite la instalación
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); // Evita el cartel automático
            deferredPrompt = e; // Guarda el evento para dispararlo luego
            if (btnInstallApp) {
                btnInstallApp.style.display = 'flex'; // Muestra nuestro botón
            }
        });

        // Acción al hacer clic en nuestro botón
        if (btnInstallApp) {
            btnInstallApp.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                
                deferredPrompt.prompt(); // Muestra el prompt nativo
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`PWA Installation outcome: ${outcome}`);
                
                deferredPrompt = null;
                btnInstallApp.style.display = 'none'; // Oculta el botón
            });
        }

        // Detectar si ya se instaló
        window.addEventListener('appinstalled', () => {
            if (btnInstallApp) btnInstallApp.style.display = 'none';
            deferredPrompt = null;
            console.log('PWA instalada con éxito.');
        });

        // ═══════════════════════════════════════════════════════
        //  SISTEMA TOAST ESTANDARIZADO (PATRÓN HORARIOS)
        // ═══════════════════════════════════════════════════════
        const _toastQueue = [];
        let _toastBusy = false;
        let _toastTimeout = null;
        const MAX_TOAST_QUEUE = 5;

        function _cerrarToastActual() {
            if (_toastTimeout) { clearTimeout(_toastTimeout); _toastTimeout = null; }
            const toastEl = document.getElementById('toast');
            if (!toastEl || !toastEl.classList.contains('show')) return;
            toastEl.classList.remove('show');
            setTimeout(() => _procesarToastQueue(), 300);
        }

        function _habilitarInteraccionToast(toastEl) {
            if (!toastEl || toastEl.dataset.toastInit) return;
            toastEl.dataset.toastInit = '1';

            // Cierre al hacer click o tocar
            toastEl.addEventListener('click', () => _cerrarToastActual());

            // Gesto Swipe horizontal para descartar en móviles
            let startX = null, startY = null;
            toastEl.addEventListener('touchstart', e => {
                if (e.touches.length === 1) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }
            }, { passive: true });

            toastEl.addEventListener('touchend', e => {
                if (startX === null) return;
                const diffX = e.changedTouches[0].clientX - startX;
                const diffY = e.changedTouches[0].clientY - startY;
                startX = null; startY = null;
                if (Math.abs(diffY) > 60) return;
                if (Math.abs(diffX) > 40) _cerrarToastActual();
            }, { passive: true });
        }

        function _procesarToastQueue() {
            if (_toastQueue.length === 0) {
                _toastBusy = false;
                return;
            }

            _toastBusy = true;
            const actual = _toastQueue.shift();
            let toastEl = document.getElementById('toast');
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.id = 'toast';
                toastEl.className = 'toast';
                document.body.appendChild(toastEl);
            }

            _habilitarInteraccionToast(toastEl);

            toastEl.classList.remove('show');
            toastEl.textContent = actual.msg;
            toastEl.className = `toast ${actual.tipo}`;

            let duracionFinal = actual.duracion || 3000;
            if (_toastQueue.length >= 1) {
                duracionFinal = Math.floor(duracionFinal / 2);
            }

            setTimeout(() => {
                toastEl.classList.add('show');
                _toastTimeout = setTimeout(() => {
                    toastEl.classList.remove('show');
                    _toastTimeout = null;
                    setTimeout(() => _procesarToastQueue(), 300);
                }, duracionFinal);
            }, 20);
        }

        function toast(msg, tipo = 'info', duracion = 3000) {
            if (!msg) return;
            const ultimo = _toastQueue[_toastQueue.length - 1];
            const toastEl = document.getElementById('toast');
            const actual = _toastBusy && toastEl ? toastEl.textContent : null;

            if ((ultimo && ultimo.msg === msg) || actual === msg) return;

            _toastQueue.push({ msg, tipo, duracion });
            if (_toastQueue.length > MAX_TOAST_QUEUE) {
                _toastQueue.splice(0, _toastQueue.length - MAX_TOAST_QUEUE);
            }

            if (!_toastBusy) _procesarToastQueue();
        }

        // Alias para compatibilidad
        const showToast = (msg, duracion = 4000) => toast(msg, 'info', duracion);

        // Registrar Service Worker Unificado
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(registration => {
                        console.log('PWA: Service Worker del Launcher registrado.', registration.scope);

                        // Detectar si hay una actualización disponible en segundo plano
                        registration.addEventListener('updatefound', () => {
                            const newWorker = registration.installing;
                            if (!newWorker) return;

                            newWorker.addEventListener('statechange', () => {
                                // Solo notificar si ya existía un controller previo (es una actualización, no la primera instalación)
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    toast('Nueva versión disponible. Se aplicará al recargar o volver a abrir.', 'info', 4500);
                                }
                            });
                        });
                    })
                    .catch(err => console.error('PWA: Error al registrar Service Worker:', err));

                // Saneamiento: Desregistrar workers secundarios obsoletos en subcarpetas
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    const rootScope = new URL('./', window.location.href).href;
                    registrations.forEach(reg => {
                        if (reg.scope !== rootScope && (reg.scope.includes('/SGC/') || reg.scope.includes('/SGI/') || reg.scope.includes('/SGL/') || reg.scope.includes('/SGR/'))) {
                            reg.unregister().then(unregistered => {
                                if (unregistered) console.log('PWA: Worker secundario obsoleto desregistrado:', reg.scope);
                            });
                        }
                    });
                }).catch(() => {});
            });
        }
    }

    // --- LÓGICA DE NAVEGACIÓN ANIMADA ---
    function setupNavigation() {
        const appCards = document.querySelectorAll('.app-card');
        
        appCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Permitimos abrir en nueva pestaña con Ctrl/Cmd + click sin bloquear el comportamiento nativo
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;

                e.preventDefault(); // Evitamos el salto inmediato
                const targetUrl = card.href;

                // Aplicamos la clase de salida a todas las tarjetas
                appCards.forEach((c, index) => {
                    // Reasignamos el delay para que la salida también sea escalonada
                    c.style.animationDelay = `${index * 0.05}s`;
                    c.classList.add('exiting');
                });

                // Esperamos a que termine la animación (400ms de animación + delays) para redirigir
                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 500);
            });
        });
    }

    // --- MANEJO DE CACHÉ DE NAVEGACIÓN (Bugfix Firefox) ---
    window.addEventListener('pageshow', (event) => {
        // event.persisted es true si la página se restauró desde la caché (botón "Atrás")
        if (event.persisted) {
            const appCards = document.querySelectorAll('.app-card');
            appCards.forEach(card => {
                // 1. Quitamos la clase de animación de salida
                card.classList.remove('exiting');
                
                // 2. Este "truco" fuerza al navegador a redibujar el elemento inmediatamente, 
                // solucionando el problema de los íconos SVG invisibles en Firefox.
                void card.offsetWidth; 
            });
        }
    });

    // --- INICIALIZACIÓN ---
    function boot() {
        renderTheme(isDarkModeActive());
        
        if (btnDarkMode) {
            btnDarkMode.addEventListener('click', (event) => {
                event.preventDefault();
                const newDarkState = !document.documentElement.classList.contains('dark-mode');
                setDarkMode(newDarkState);
                renderTheme(newDarkState);
            });
        }

        setupPWA();
        setupNavigation(); // Llamamos a la nueva función aquí
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();