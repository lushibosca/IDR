'use strict';
// SGC-2 no tiene servidor ni login: quien abre la página edita el stock de su navegador (la sincronización con el
// Gist decide después quién puede subir, con su token). Este archivo reemplaza a sesion.js de cctv_monitor con lo que
// el resto del front usa de él: el banner de error, el rol que se MUESTRA y la recarga.

let _recargaPendiente = false;     // se pidió recargar mientras otra carga seguía en curso (app.js)
const _cambioClavePendiente = false;

function limpiarErrorApi() {
    const banner = document.getElementById('api-error-alert');
    if (banner) alternarBannerMutacion(banner, false);
}

function mostrarErrorApi(err) {
    const banner = document.getElementById('api-error-alert');
    if (!banner) return;
    const msg = err && err.message ? err.message : 'Revisá la consola del navegador.';
    uiPonerTexto('api-error-title', 'No se pudieron mostrar los datos.');
    uiPonerTexto('api-error-detail', msg);
    alternarBannerMutacion(banner, true);
}

// ==== ROLES PURO BEGIN ====
// La escala se conserva para el front que la consulta (`rolAlcanza`); sin login, el rol es siempre el que edita.
const ESCALA_ROLES = ['visor', 'operador', 'admin'];
function rolAlcanza(rol, minimo) {
    const i = ESCALA_ROLES.indexOf(rol);
    const j = ESCALA_ROLES.indexOf(minimo);
    return i >= 0 && j >= 0 && i >= j;
}
function kioscoRechazaPestana() {
    return false;
}
// ==== ROLES PURO END ====

const rolActual = 'operador';

/** Muestra lo marcado con `data-rol-minimo` que el rol alcanza (sin login: lo de operador). */
function uiAplicarRol(rol) {
    for (const el of document.querySelectorAll('[data-rol-minimo]')) {
        el.classList.toggle('d-none', !rolAlcanza(rol, el.getAttribute('data-rol-minimo')));
    }
}

/** Vuelve a leer todo lo que muestra la página (Actualizar del menú). */
async function recargarTodo() {
    const promesas = [cargarDatos()];
    if (typeof window.recargarStock === 'function') promesas.push(window.recargarStock());
    await Promise.allSettled(promesas);
}

function initSesion() {
    uiAplicarRol(rolActual);
}
