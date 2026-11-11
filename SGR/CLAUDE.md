# SGR — racks (parte de la suite IDR)

Front vanilla JS (un `app.js` global) con el **diseño de SGC**: esqueleto, base de estilo y scripts comunes de `../shared/ui/`
(ver `../docs/PORTE-ESTILO-SGC.md`). Datos en `localStorage` con prefijo `RCK_` (`RCK_data`); los edificios son de la suite
(`../shared/idr-infra.js`). Idioma: español. Reglas generales (Service Worker único, release, commits, no push): `../CLAUDE.md`.

## Estructura
- `index.html`: barra superior (marca → launcher; deshacer/rehacer en `.navbar-acciones`), panel lateral (`#sidebar-col`) con el
  buscador (`#global-search`, campos en `#search-filter-menu`) y las pestañas Dashboard · Inventario · Servicio · Ajustes
  (`data-ui-toggle="pill"`, `data-tab`), modales con el marcado de SGC (`.modal.fade > .modal-dialog > .modal-content`).
- `css/sgr.css`: solo lo propio (dashboard, tablas agrupadas, tarjetas, menú de vista, FAB...), en `@layer app`, sin
  `!important`. Arriba tiene alias de las variables viejas de SGR (`--text-main`, `--accent`...) a los tokens de la suite.
- `app.js`: `MM` (modales) es la API de siempre sobre `UI.modal` (`../shared/ui/js/ui.js`): descartar un modal (Escape, fondo,
  X, «atrás») vuelve al modal padre si se abrió con `MM.alternar`. El objeto de vistas se llama `Vistas` (`UI` es de ui.js).
  Las pestañas las cambia `UI.pestana`; `_alMostrarPestana` (evento `ui:pestana-mostrada`) recuerda y redibuja.
- Ayuda y atajos: `atajos.js` (datos) + `../shared/ui/js/ayuda.js`; navegación por teclado y rueda: `navegacion.js`; búsqueda: `busqueda-tokens.js`.
- Tema y «reducir animaciones»: `../shared/ui/js/arranque.js` (en el `<head>`) y `apariencia.js` (interruptores de Ajustes).

## Después de cada cambio
1. Archivo nuevo o borrado → `../sw.js` (`PRECACHE_URLS`). Desde la raíz: `npm run release`.
2. `npm test` y `node tests/e2e/humo-apps.mjs SGR` (desde la raíz; usa el jsdom de `SGC/tests/e2e`).
3. Commit `SGR: ...` en español, con `sw.js`. No hacer push.

## Pendiente
- Las plantillas del contenido (tablas, tarjetas, dashboard, menús de vista) siguen armándose con `innerHTML` + `esc()`; pasarlas
  a `createElement`/`textContent` cuando se toquen.
