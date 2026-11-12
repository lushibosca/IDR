# IDR — suite de aplicaciones estáticas (PWA)

Suite en GitHub Pages, sin servidor ni build: launcher en la raíz (`index.html`, `app.js`) y una carpeta por app
(`SGC`, `SGI`, `SGL`, `SGP`, `SGR`); lo compartido está en `shared/`. Idioma del proyecto: español (código,
mensajes, commits, docs). Lo que pida el usuario manda sobre lo de este archivo.
Cada app tiene su propio `CLAUDE.md` y `docs/ARQUITECTURA.md` si ya se documentó (hoy: `SGC`; `SGR`, `SGI` y `SGP` tienen su `CLAUDE.md`).

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
  por su cuenta** (lo vigila `tests/actualizacion.test.mjs`). `sw.js` descarga todo en paralelo **después** del evento `install` (dentro de él Chromium limita a 3 descargas simultáneas y la actualización tardaba varios segundos; la página la pide con `sw-descargar` y avisa «lista» al activarse el worker), informa el avance y es todo o nada:
  si falla un archivo se conserva la versión anterior, así que un archivo listado en `PRECACHE_URLS` que no exista rompe las
  actualizaciones (el test de la suite lo vigila). Una app nueva: agregar esa línea y su hoja en su `index.html`.
- **Botón «atrás» (Android, gesto de volver):** cierra el modal o la capa de arriba en vez de volver al launcher.
  `shared/idr-atras.js` (`IDRAtras.abrir(id, cerrar)` / `cerrada(id)`) guarda una entrada del historial por capa abierta; cada app lo
  conecta a sus modales (`shared/ui/js/atras-modales.js`, por los eventos de `UI.modal`, para toda app con el esqueleto común). Una capa nueva que tape la pantalla (panel,
  buscador, vista previa) tiene que registrarse; sin capas abiertas, «atrás» sale como siempre (`tests/atras.test.mjs`).
- **Tema claro/oscuro compartido:** la clave `IDR_dark` (`'1'` oscuro, `'0'` claro) es de TODA la suite: el launcher y cada app la
  leen al cargar y la escriben al cambiar el tema, así que se cambia en una y se ve en todas. Las apps nuevas usan
  `shared/idr-tema.js` (`IDRTema.oscuro()` / `guardar()` / `alCambiar()`), cargado en el `<head>` antes de pintar el tema; sin
  valor guardado cada app usa su tema de siempre. SGC mantiene `sgc2/theme` solo como respaldo (lo vigila `tests/tema.test.mjs`).
- **Panel, transición y barra superior son de la suite.** El panel lateral (plegar con `#btn-toggle-sidebar`, mover a los cuatro lados),
  el deslizamiento al cambiar de pestaña, la barra superior (marca → launcher, instalar, deshacer, rehacer), los avisos (`mostrarToast`),
  «volver arriba», el fondo de página (con su interruptor en Ajustes), el modal de ayuda y atajos y las columnas de Ajustes viven en `shared/ui/` (`js/panel*.js`, `transicion-pestanas.js`,
  `toast.js`, `ayuda.js`...); una app no los reescribe: carga el script y pone el marcado (receta: `docs/PORTE-ESTILO-SGC.md`, sección 3).
  `tests/estilo.test.mjs` vigila que las apps portadas lo tengan.
- Las apps comparten el origen: todas las claves de `localStorage` llevan el prefijo de su app (`sgc2/`, `RCK_`, `PCH_`,
  ...). Lo común entre apps vive solo en `shared/` (hoy `idr-infra.js`: edificios y racks) y se carga con `<script>`;
  una app no lee las claves de otra directamente, pasa por `shared/`.
- Sin dependencias en el cliente que no estén vendorizadas (dentro de la app o, si las comparte la suite, en `shared/vendor/`:
  hoy bootstrap-icons y la fuente Inter); CSP estricta en cada `index.html` (`script-src 'self'`, sin handlers inline, sin `eval`).
- **Estilo común (diseño de SGC):** `shared/ui/` tiene la base de estilo de la suite (tokens, base, grilla, `componentes/`,
  utilidades, por `@layer`); cada app carga esas hojas y pone lo suyo en su propio CSS. Un cambio en `shared/ui/` se ve en
  todas las apps que la cargan. El porte de SGR, SGI y SGP a este diseño se sigue en `docs/PORTE-ESTILO-SGC.md`.
- `Utilidades/`: scripts Python sueltos (escáner, monitor, etc.), no forman parte del front ni del precache.
- No subir datos de usuario: `.gitignore` ya excluye `*.json` (salvo manifests), `*.env` y `Utilidades/datos/*`.

## Tests
- Suite (precache de cada app y de `shared/`, versión, actualización, tema, fallback offline de cada app): `npm test` desde la raíz.
- Cada app trae los suyos (SGC: `npm run test:sgc`, ver `SGC/CLAUDE.md`). Las portadas al diseño de SGC (`tests/_apps.mjs`) tienen
  una prueba de humo en jsdom: `node tests/e2e/humo-apps.mjs [APP]` (usa el jsdom de `SGC/tests/e2e`).

## Versión visible en cada app
Cada app muestra la versión de la suite en sus Ajustes con un elemento `<span data-idr-version="NOMBRE"></span>` y el script
`<script src="../shared/idr-version.js">` (nada de código por app; hoy SGC, SGR, SGI, SGP y el launcher). Al portar SGP al diseño de SGC,
agregar esas dos líneas en sus Ajustes (receta completa: `docs/PORTE-ESTILO-SGC.md`, sección 3).
