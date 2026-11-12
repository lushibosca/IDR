/**
 * IDRActualizacion - Registro del Service Worker de la suite y aviso de actualización (toda la suite, un solo código).
 * Cuando el navegador detecta una versión nueva muestra un toast con barra de progreso mientras el worker descarga los
 * archivos («Descargando actualización · 40%»); al terminar, «Actualización lista. Tocá para recargar» (tocar recarga la
 * página; si no, se aplica al volver a abrir). Si la descarga falla avisa y se conserva la versión actual.
 * El progreso lo informa sw.js con postMessage ({ tipo: 'sw-progreso', progreso } / { tipo: 'sw-error' }).
 *
 * Uso: un solo <script> por página, con la ruta del worker y su scope (así no hay código de registro en cada app):
 *   <script src="../shared/idr-actualizacion.js" data-sw="../sw.js" data-scope="../" defer></script>
 * Lleva su hoja de estilo: <link rel="stylesheet" href="../shared/idr-actualizacion.css">. Sin dependencias de la app.
 */

// ==== ACTUALIZACION PURO BEGIN ====
/** Porcentaje entero válido (0 a 100) o `null` si el valor no es un número. */
function idrPorcentajeValido(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
}

/** Texto del aviso mientras se descarga: con porcentaje si ya se conoce. */
function idrTextoDescarga(porcentaje) {
    const p = idrPorcentajeValido(porcentaje);
    return p === null ? 'Descargando actualización' : `Descargando actualización · ${p}%`;
}

/** ¿Hay que buscar una versión nueva al volver a la app? Sí si pasó al menos `minimoMs` (60 s si no es válido) desde la última. */
function idrDebeBuscar(ahora, ultima, minimoMs) {
    const minimo = Number.isFinite(minimoMs) && minimoMs >= 0 ? minimoMs : 60000;
    return ahora - ultima >= minimo;
}
// ==== ACTUALIZACION PURO END ====

const IDRActualizacion = (() => {
    'use strict';

    const DURACION_LISTO_MS = 10000;
    const DURACION_ERROR_MS = 6000;
    let aviso = null;
    let temporizador = null;

    function construirAviso() {
        if (aviso) return aviso;
        const caja = document.createElement('div');
        caja.className = 'idr-aviso';
        caja.setAttribute('role', 'status');
        caja.setAttribute('aria-live', 'polite');
        caja.hidden = true;
        const texto = document.createElement('span');
        texto.className = 'idr-aviso-texto';
        const barra = document.createElement('div');
        barra.className = 'idr-aviso-barra';
        const relleno = document.createElement('div');
        relleno.className = 'idr-aviso-relleno';
        barra.appendChild(relleno);
        caja.append(texto, barra);
        document.body.appendChild(caja);
        aviso = { caja, texto, barra, relleno, alTocar: null };
        caja.addEventListener('click', () => { if (aviso.alTocar) aviso.alTocar(); });
        return aviso;
    }

    /** Muestra el aviso. opciones: tipo ('info' | 'ok' | 'error'), progreso (0-100 o null = sin barra), alTocar, duracion (ms). */
    function mostrar(texto, { tipo = 'info', progreso = null, alTocar = null, duracion = 0 } = {}) {
        const a = construirAviso();
        clearTimeout(temporizador);
        a.texto.textContent = texto;
        a.caja.dataset.tipo = tipo;
        a.caja.classList.toggle('idr-aviso-tocable', !!alTocar);
        a.alTocar = alTocar;
        a.barra.hidden = progreso === null;
        if (progreso !== null) a.relleno.style.width = `${progreso}%`;
        a.caja.hidden = false;
        void a.caja.offsetWidth;                          // reflow: la entrada vuelve a animarse
        a.caja.classList.add('idr-aviso-visible');
        if (duracion > 0) temporizador = setTimeout(ocultar, duracion);
    }

    function ocultar() {
        clearTimeout(temporizador);
        if (!aviso) return;
        aviso.caja.classList.remove('idr-aviso-visible');
        aviso.alTocar = null;
        setTimeout(() => { if (aviso && !aviso.caja.classList.contains('idr-aviso-visible')) aviso.caja.hidden = true; }, 300);
    }

    function iniciarDescarga() { mostrar(idrTextoDescarga(null), { progreso: 0 }); }
    function avance(p) {
        const v = idrPorcentajeValido(p);
        if (v !== null) mostrar(idrTextoDescarga(v), { progreso: v });
    }
    function listo() {
        mostrar('Actualización lista. Tocá para recargar', { tipo: 'ok', alTocar: () => window.location.reload(),
            duracion: DURACION_LISTO_MS });
    }
    function fallo() {
        mostrar('No se pudo descargar la actualización', { tipo: 'error', duracion: DURACION_ERROR_MS });
    }

    /** Registra el worker y engancha el aviso. cfg: { sw, scope }. */
    function registrar(cfg) {
        if (!('serviceWorker' in navigator) || !cfg || !cfg.sw) return;
        let actualizando = false;

        navigator.serviceWorker.addEventListener('message', (e) => {
            if (!actualizando) return;                    // lo que informa el worker solo importa durante una actualización
            const d = e.data;
            if (d && d.tipo === 'sw-progreso') avance(d.progreso);
            else if (d && d.tipo === 'sw-error') { actualizando = false; fallo(); }
        });

        // Sigue a un worker nuevo hasta que queda activo. La descarga no ocurre dentro de su `install` (Chromium la limita a
        // 3 pedidos simultáneos ahí, ver sw.js) sino después: al quedar instalado (en espera) se le pide con 'sw-descargar', y
        // recién cuando termina se activa. Por eso «lista» es al activarse, no al instalarse.
        const seguir = (reg, worker, avisar) => {
            if (avisar) {
                actualizando = true;
                iniciarDescarga();                        // ya se sabe que hay versión nueva aunque siga descargando
            }
            const pedirDescarga = () => worker.postMessage({ tipo: 'sw-descargar' });
            if (worker.state === 'installed') pedirDescarga();
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed') pedirDescarga();
                if (!avisar) return;
                if (worker.state === 'activated') {
                    if (actualizando) { actualizando = false; listo(); }
                } else if (worker.state === 'redundant' && actualizando && !reg.installing && !reg.waiting) {
                    // descartado: es un error salvo que lo haya reemplazado una versión todavía más nueva (esa tiene su seguimiento)
                    actualizando = false;
                    fallo();
                }
            });
        };

        const registro = () => navigator.serviceWorker.register(cfg.sw, cfg.scope ? { scope: cfg.scope } : undefined)
            .then((reg) => {
                reg.addEventListener('updatefound', () => {
                    const nuevo = reg.installing;
                    if (!nuevo) return;
                    seguir(reg, nuevo, !!reg.active);     // sin versión activa es la primera instalación: se descarga sin avisar
                });
                // Quedó una versión en espera de una apertura anterior (la descarga se cortó o falló): se retoma
                if (reg.waiting) seguir(reg, reg.waiting, !!reg.active);
                buscarAlVolver(reg);
            })
            .catch((err) => console.error('IDR: error al registrar el Service Worker:', err));

        // Con una versión ya instalada se registra enseguida; en la primera visita, al terminar de cargar (sin competir con ella)
        if (navigator.serviceWorker.controller || document.readyState === 'complete') registro();
        else window.addEventListener('load', registro);
    }

    // Al volver a la app (pestaña que vuelve a verse, PWA que se reabre) se busca una versión nueva, sin abusar
    function buscarAlVolver(reg) {
        let ultima = Date.now();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (!idrDebeBuscar(Date.now(), ultima, 60000)) return;
            ultima = Date.now();
            reg.update().catch(() => {});
        });
    }

    return { registrar, mostrar, ocultar };
})();

// Arranque por atributos del propio <script>: data-sw (ruta del worker) y data-scope
(function () {
    const s = document.currentScript;
    if (s && s.dataset && s.dataset.sw) IDRActualizacion.registrar({ sw: s.dataset.sw, scope: s.dataset.scope || '' });
})();
