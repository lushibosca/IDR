/**
 * IDRVersion - Versión de la suite IDR (la misma para el launcher y todas las apps: comparten un solo Service Worker).
 * `IDR_VERSION` (formato vAAMMDD) debe coincidir con el prefijo de CACHE_NAME en sw.js (vAAMMDD.HHMM): `npm run release` sube los
 * dos y `tests/version.test.mjs` lo valida. Para mostrarla basta un elemento con `data-idr-version="NOMBRE"`: este módulo le
 * pone «NOMBRE-vAAMMDD» (o solo la versión si el atributo está vacío). Sin código por app: una línea de HTML en cada una.
 */
const IDR_VERSION = 'v261111';

// ==== VERSION PURO BEGIN ====
/** «NOMBRE-vAAMMDD»; sin nombre, solo la versión. */
function idrEtiquetaVersion(nombre, version) {
    const n = String(nombre == null ? '' : nombre).trim();
    return n ? `${n}-${version}` : String(version);
}
// ==== VERSION PURO END ====

const IDRVersion = (() => {
    'use strict';

    /** Escribe la versión en todo elemento marcado con data-idr-version (se llama sola al cargar la página). */
    function pintar(raiz) {
        for (const el of (raiz || document).querySelectorAll('[data-idr-version]')) {
            el.textContent = idrEtiquetaVersion(el.getAttribute('data-idr-version'), IDR_VERSION);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => pintar());
    else pintar();

    return { version: IDR_VERSION, etiqueta: (nombre) => idrEtiquetaVersion(nombre, IDR_VERSION), pintar };
})();
