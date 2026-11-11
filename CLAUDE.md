# IDR — suite de aplicaciones estáticas (PWA)

Suite en GitHub Pages, sin servidor ni build: launcher en la raíz (`index.html`, `app.js`) y una carpeta por app
(`SGC`, `SGI`, `SGL`, `SGP`, `SGR`); lo compartido está en `shared/`. Idioma del proyecto: español (código,
mensajes, commits, docs). Lo que pida el usuario manda sobre lo de este archivo.
Cada app tiene su propio `CLAUDE.md` y `docs/ARQUITECTURA.md` si ya se documentó (hoy: `SGC`).

## Flujo de trabajo (vale para todas las apps)
- **Un solo Service Worker, el de la raíz (`sw.js`).** Es cache-first con `ignoreSearch`: los `?v=` de los `<script>` no
  invalidan nada para la PWA instalada. Por eso, después de cada cambio en cualquier app (código, estilos, HTML):
  1. Si se creó, renombró o borró un archivo, ajustar `PRECACHE_URLS` en `sw.js` (se escribe a mano).
  2. `npm run release` sube la versión de la suite: `IDR_VERSION` (`shared/idr-version.js`, `vAAMMDD`, la que se muestra en los
     Ajustes de cada app) y `CACHE_NAME` de `sw.js` (`idr-suite-vAAMMDD.HHMM`). Siempre juntas: lo valida `tests/version.test.mjs`.
  3. `npm test` (suite) y los tests de la app tocada (ver su `CLAUDE.md`; SGC: `npm run test:sgc`).
- Si todo pasa, hacer commit automático (sin esperar a que se pida), en español, con el prefijo de la app
  (`SGC: ...`) e incluyendo `sw.js`. **No hacer push.**
- Una actualización se publica siempre desde la raíz: el cambio de una app solo llega a los usuarios cuando sube
  `CACHE_NAME`. No hay un `sw.js` por app.
- El fallback offline de navegación en `sw.js` usa `pathname.includes('/SGx')`: una app nueva cuyo nombre empiece como
  otra va **antes** en esa cadena. Hoy no hay prefijos repetidos.

## Reglas de la suite
- **Actualizaciones:** `shared/idr-actualizacion.js` (+ `.css`) registra el Service Worker y muestra el toast con barra de progreso
  («Descargando actualización · 40%» → «Actualización lista. Tocá para recargar»). Toda página de la suite lo carga con
  `<script src="../shared/idr-actualizacion.js" data-sw="../sw.js" data-scope="../">` y su hoja; **ninguna app registra el worker
  por su cuenta** (lo vigila `tests/actualizacion.test.mjs`). `sw.js` descarga todo en paralelo, informa el avance y es todo o nada:
  si falla un archivo se conserva la versión anterior, así que un archivo listado en `PRECACHE_URLS` que no exista rompe las
  actualizaciones (el test de la suite lo vigila). Una app nueva: agregar esa línea y su hoja en su `index.html`.
- **Tema claro/oscuro compartido:** la clave `IDR_dark` (`'1'` oscuro, `'0'` claro) es de TODA la suite: el launcher y cada app la
  leen al cargar y la escriben al cambiar el tema, así que se cambia en una y se ve en todas. Las apps nuevas usan
  `shared/idr-tema.js` (`IDRTema.oscuro()` / `guardar()` / `alCambiar()`), cargado en el `<head>` antes de pintar el tema; sin
  valor guardado cada app usa su tema de siempre. SGC mantiene `sgc2/theme` solo como respaldo (lo vigila `tests/tema.test.mjs`).
- Las apps comparten el origen: todas las claves de `localStorage` llevan el prefijo de su app (`sgc2/`, `RCK_`, `PCH_`,
  ...). Lo común entre apps vive solo en `shared/` (hoy `idr-infra.js`: edificios y racks) y se carga con `<script>`;
  una app no lee las claves de otra directamente, pasa por `shared/`.
- Sin dependencias en el cliente que no estén vendorizadas dentro de la app; CSP estricta en cada `index.html`
  (`script-src 'self'`, sin handlers inline, sin `eval`).
- `Utilidades/`: scripts Python sueltos (escáner, monitor, etc.), no forman parte del front ni del precache.
- No subir datos de usuario: `.gitignore` ya excluye `*.json` (salvo manifests), `*.env` y `Utilidades/datos/*`.

## Tests
- Suite (precache, versión, actualización, tema, fallback offline): `npm test` desde la raíz.
- Cada app trae los suyos (SGC: `npm run test:sgc`, ver `SGC/CLAUDE.md`).

## Versión visible en cada app
Cada app muestra la versión de la suite en sus Ajustes con un elemento `<span data-idr-version="NOMBRE"></span>` y el script
`<script src="../shared/idr-version.js">` (nada de código por app; hoy lo hace SGC). Al portar SGR, SGI y SGP al diseño de SGC,
agregar esas dos líneas en sus Ajustes.
