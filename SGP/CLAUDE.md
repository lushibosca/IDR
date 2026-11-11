# SGP — patcheras (parte de la suite IDR)

Front vanilla JS (un `app.js` global) con el **diseño de SGC**: esqueleto, base de estilo y scripts comunes de `../shared/ui/`
(ver `../docs/PORTE-ESTILO-SGC.md`). **Alfa**, pero con los mismos criterios que las demás. Datos en `localStorage` con prefijo
`PCH_` (`PCH_state`: racks con sus patcheras y puertos); los edificios y los racks de SGR se piden a `../shared/idr-infra.js`
(SGP no lee claves de otra app). Idioma: español. Reglas generales (Service Worker único, release, commits, no push): `../CLAUDE.md`.

## Estructura
- `index.html`: barra superior (marca → launcher; instalar, deshacer y rehacer en `.navbar-acciones`), panel lateral
  (`#sidebar-col`) con el buscador (`#global-search`) y las pestañas **Estado · Racks · Ajustes** (`data-ui-toggle="pill"`,
  `data-tab`), fondo de página (`.bg-backdrop`), modales con el marcado de SGC.
  - **Estado**: totales (racks, patcheras, puertos con servicio, ocupación) y resumen por edificio; un clic en un edificio lleva a sus racks.
  - **Racks**: la lista de racks plegables (de a uno) con sus patcheras RJ45 (24/48) y de fibra; filtro por edificio, «+» nuevo rack, importar planilla.
  - **Ajustes**: Apariencia, Navegación, Racks (nuevo rack, planilla, edificios), Datos, Sincronización (Gist, por modal) y Ayuda.
- `css/sgp.css`: solo lo propio (rack, patcheras, puertos, fibra, importación, Gist, Estado), en `@layer app`, sin `!important`; usa las variables
  viejas como alias de los tokens (`../shared/ui/legado/variables.css`) y define los colores del rack y de los puertos. La foto de fondo es suya
  (`../../img/SGP-*.jpeg`).
- `app.js`: `MM` (modales) es el de `../shared/ui/js/mm.js`; avisos: `toast`; confirmar queda **encima** del modal que lo pidió. Las pestañas las cambia
  `UI.pestana`; `_alMostrarPestana` recuerda la pestaña. **Búsqueda**: `idrTokensBusqueda` (frases, `!`/`-`) sobre el nombre del rack, edificio, descripción,
  patcheras y el número, etiqueta y notas de cada puerto; los racks que coinciden se abren y los puertos encontrados se resaltan (`.coincide`).
  **Tooltip de puerto**: con el mouse al pasar; en pantallas táctiles, el primer toque lo muestra y el segundo edita el puerto (`esTactil`).
- `atajos.js`: datos de la ayuda (`ATAJOS`, `AYUDA_SECCIONES`, `AYUDA_BUSQUEDA`); el modal lo arma `../shared/ui/js/ayuda.js`.
- `parser_planilla.js`: lee el relevamiento en Excel (.xlsx), CSV o texto pegado.
- Tema, «reducir animaciones», fondo y panel: `../shared/ui/js/arranque.js`, `apariencia.js` y `panel.js`.

## Después de cada cambio
1. Archivo nuevo o borrado → `../sw.js` (`PRECACHE_URLS`). Desde la raíz: `npm run release`.
2. `npm test` y `node tests/e2e/humo-apps.mjs SGP` (desde la raíz; usa el jsdom de `SGC/tests/e2e`).
3. Commit `SGP: ...` en español, con `sw.js`. No hacer push.

## Pendiente
- Las plantillas del contenido (tarjeta de rack, patcheras y puertos) siguen armándose con `innerHTML` + `esc()`; pasarlas a `createElement`/`textContent` cuando se toquen.
- El Gist se configura por modal (como en SGR y SGI); `SGP/sw.js` (Service Worker viejo por app) sigue en el repo y no se usa.
