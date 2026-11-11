# SGI — materiales (parte de la suite IDR)

Front vanilla JS (un `app.js` global) con el **diseño de SGC**: esqueleto, base de estilo y scripts comunes de `../shared/ui/`
(ver `../docs/PORTE-ESTILO-SGC.md`). Datos en `localStorage` con prefijo `SGI_` (`SGI_activos`: materiales, movimientos,
categorías y herramientas). Idioma: español. Reglas generales (Service Worker único, release, commits, no push): `../CLAUDE.md`.

## Estructura
- `index.html`: barra superior (marca → launcher; instalar, deshacer y rehacer en `.navbar-acciones`), panel lateral
  (`#sidebar-col`) con el buscador (`#global-search`: material, ticket, tipo, duplicados, rangos de fechas) y las pestañas
  Dashboard · Movimientos · Ajustes (`data-ui-toggle="pill"`, `data-tab`), modales con el marcado de SGC.
  El filtro por año sigue en el encabezado de la tarjeta Inventario (`AnioCombo`).
- `css/sgi.css`: solo lo propio, en `@layer app`, sin `!important`; usa las variables viejas como alias de los tokens
  (`../shared/ui/legado/variables.css`).
- `app.js`: los modales son `MM` (`../shared/ui/js/mm.js`, sobre `UI.modal`); al cerrar cualquier modal se cierra el portal de
  sugerencias. El objeto de vistas se llama `Vistas` (`UI` es de ui.js). Las pestañas las cambia `UI.pestana`;
  `_alMostrarPestana` recuerda la pestaña (una hora, `SGI_tab` / `SGI_tab_time`) y redibuja el dashboard.
- Tema y «reducir animaciones»: `../shared/ui/js/arranque.js` y `apariencia.js`. El swipe entre pestañas es el de la suite.

## Después de cada cambio
1. Archivo nuevo o borrado → `../sw.js` (`PRECACHE_URLS`). Desde la raíz: `npm run release`.
2. `npm test` y `node tests/e2e/humo-apps.mjs SGI` (desde la raíz; usa el jsdom de `SGC/tests/e2e`).
3. Commit `SGI: ...` en español, con `sw.js`. No hacer push.

## Pendiente
- Las plantillas del contenido (tabla, chips, historial, líneas de material) siguen con `innerHTML` + `esc()`; pasarlas a
  `createElement`/`textContent` cuando se toquen.
