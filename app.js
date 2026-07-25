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

        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('PWA: Service Worker del Launcher registrado.', reg.scope))
                    .catch(err => console.error('PWA: Error al registrar Service Worker:', err));
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