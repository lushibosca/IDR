/**
 * IDRAtras - El botón «atrás» (el de Android, el gesto de volver, Alt+←) cierra la capa de arriba (un modal, un buscador, un panel)
 * en vez de salir a la página anterior (el launcher). Cada capa que se abre guarda una entrada del historial; si se cierra por su
 * cuenta (X, fondo, Escape) esa entrada se saca; si el sistema vuelve atrás, se cierra la capa de arriba. Igual al esquema de
 * horarios (gestor de modales), pero sin atarlo a un tipo de modal: sirve para cualquier capa.
 *
 *   IDRAtras.abrir(id, cerrar)  la capa `id` se abrió; `cerrar()` la cierra (devuelve false si no se pudo cerrar)
 *   IDRAtras.cerrada(id)        la capa `id` se cerró por su cuenta
 * Las apps lo conectan a sus modales (SGC: js/atras-modales.js). Sin dependencias.
 */

// ==== ATRAS PURO BEGIN ====
/**
 * Pila de capas con una entrada de historial cada una. Pura: la «historia» (pushState / go) se le inyecta.
 * `abrir` apila y pide una entrada; `cerrada` desapila y anota cuántas entradas sacar (se sacan juntas, con un solo go(-n));
 * `alVolverAtras` cierra la capa de arriba (si no se pudo cerrar, la vuelve a apilar y pide su entrada de nuevo).
 */
function idrCrearPilaAtras(historia) {
    const pila = [];
    let ignorar = 0;          // popstates que provoca el propio código al sacar entradas
    let porQuitar = 0;

    return {
        abrir(id, cerrar) {
            if (pila.some((c) => c.id === id)) return;
            pila.push({ id, cerrar });
            historia.empujar(id);
        },
        cerrada(id) {
            const i = pila.findIndex((c) => c.id === id);
            if (i < 0) return false;                 // ya estaba fuera (la cerró el propio «atrás»)
            pila.splice(i, 1);
            porQuitar++;
            return true;
        },
        /** Saca de la historia las entradas de las capas ya cerradas, de una sola vez. Devuelve cuántas. */
        vaciar() {
            const n = porQuitar;
            porQuitar = 0;
            if (n > 0) { ignorar++; historia.volver(n); }
            return n;
        },
        /** popstate: false si lo provocó este mismo código (se ignora), true si el sistema volvió atrás y se cerró una capa. */
        alVolverAtras() {
            if (ignorar > 0) { ignorar--; return false; }
            const tope = pila.pop();
            if (!tope) return false;
            if (tope.cerrar() === false) {           // no se dejó cerrar (p. ej. pide confirmar): sigue abierta y con su entrada
                pila.push(tope);
                historia.empujar(tope.id);
                return false;
            }
            return true;
        },
        get abiertas() { return pila.map((c) => c.id); },
    };
}
// ==== ATRAS PURO END ====

const IDRAtras = (() => {
    'use strict';
    let programado = false;
    const pila = idrCrearPilaAtras({
        empujar: (id) => { try { history.pushState({ idrCapa: id }, ''); } catch (_) { /* sin historial: el atrás sale de la página */ } },
        volver: (n) => { try { history.go(-n); } catch (_) { /* nada */ } },
    });

    // Un cierre en cadena (cerrar varios modales de una vez) saca todas sus entradas con un solo go(-n)
    function programarVaciado() {
        if (programado) return;
        programado = true;
        setTimeout(() => { programado = false; pila.vaciar(); }, 0);
    }

    window.addEventListener('popstate', () => { pila.alVolverAtras(); });

    // Una entrada de capa que sobrevive a una recarga no tiene capa que cerrar: se deja como una entrada normal
    try { if (history.state && history.state.idrCapa) history.replaceState(null, ''); } catch (_) { /* nada */ }

    return {
        abrir: (id, cerrar) => pila.abrir(id, cerrar),
        cerrada: (id) => { if (pila.cerrada(id)) programarVaciado(); },
        get abiertas() { return pila.abiertas; },
    };
})();
