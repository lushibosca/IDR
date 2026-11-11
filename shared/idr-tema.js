/**
 * IDRTema - Tema (claro / oscuro) compartido por toda la suite IDR.
 * Una sola clave de localStorage, `IDR_dark` ('1' = oscuro, '0' = claro), que leen y escriben el launcher y todas las apps:
 * cambiarlo en una se ve en las demás al abrirlas (y en vivo en las que ya están abiertas, por el evento `storage`).
 * Sin valor guardado (nadie eligió todavía) devuelve null y cada app usa su tema de siempre.
 * Va en el <head>, antes del script que pinta el tema, así que no depende de nada y es síncrono.
 */

// ==== TEMA SUITE PURO BEGIN ====
/** Lo guardado en `IDR_dark` -> true (oscuro), false (claro) o null (sin elegir o con un valor que no es de la suite). */
function idrTemaDesdeValor(valor) {
    if (valor === '1') return true;
    if (valor === '0') return false;
    return null;
}
// ==== TEMA SUITE PURO END ====

const IDRTema = (() => {
    'use strict';
    const CLAVE = 'IDR_dark';

    /** true (oscuro), false (claro) o null (sin elegir). Sin acceso al almacenamiento también da null. */
    function oscuro() {
        try { return idrTemaDesdeValor(localStorage.getItem(CLAVE)); } catch (_) { return null; }
    }

    /** Guarda la elección para toda la suite. */
    function guardar(esOscuro) {
        try { localStorage.setItem(CLAVE, esOscuro ? '1' : '0'); } catch (_) { /* sin almacenamiento: queda solo en esta página */ }
    }

    /** `fn(esOscuro)` cuando OTRA pestaña o ventana (otra app de la suite incluida) cambia el tema. */
    function alCambiar(fn) {
        window.addEventListener('storage', (e) => {
            if (e.key === CLAVE) { const v = idrTemaDesdeValor(e.newValue); if (v !== null) fn(v); }
        });
    }

    return { CLAVE, oscuro, guardar, alCambiar };
})();
