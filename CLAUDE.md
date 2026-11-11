# IDR — suite de aplicaciones estáticas (PWA)

Suite en GitHub Pages, sin servidor ni build: launcher en la raíz (`index.html`, `app.js`) y una carpeta por app
(`SGC`, `SGC-2`, `SGI`, `SGL`, `SGP`, `SGR`); lo compartido está en `shared/`. Idioma del proyecto: español (código,
mensajes, commits, docs). Lo que pida el usuario manda sobre lo de este archivo.
Cada app tiene su propio `CLAUDE.md` y `docs/ARQUITECTURA.md` si ya se documentó (hoy: `SGC-2`).

## Flujo de trabajo (vale para todas las apps)
- **Un solo Service Worker, el de la raíz (`sw.js`).** Es cache-first con `ignoreSearch`: los `?v=` de los `<script>` no
  invalidan nada para la PWA instalada. Por eso, después de cada cambio en cualquier app (código, estilos, HTML):
  1. Si se creó, renombró o borró un archivo, ajustar `PRECACHE_URLS` en `sw.js` (se escribe a mano).
  2. `node scripts/release.mjs` sube `CACHE_NAME` (`idr-suite-AAMMDD.HHMM`).
  3. `node --test tests/*.test.mjs` (suite) y los tests de la app tocada (ver su `CLAUDE.md`).
- Si todo pasa, hacer commit automático (sin esperar a que se pida), en español, con el prefijo de la app
  (`SGC-2: ...`) e incluyendo `sw.js`. **No hacer push.**
- Una actualización se publica siempre desde la raíz: el cambio de una app solo llega a los usuarios cuando sube
  `CACHE_NAME`. No hay un `sw.js` por app.
- El fallback offline de navegación en `sw.js` usa `pathname.includes('/SGx')`: una app nueva cuyo nombre empiece como
  otra (`/SGC-2` vs `/SGC`) va **antes** en esa cadena (lo vigila `tests/suite.test.mjs`).

## Reglas de la suite
- Las apps comparten el origen: todas las claves de `localStorage` llevan el prefijo de su app (`sgc2/`, `RCK_`, `PCH_`,
  ...). Lo común entre apps vive solo en `shared/` (hoy `idr-infra.js`: edificios y racks) y se carga con `<script>`;
  una app no lee las claves de otra directamente, pasa por `shared/`.
- Sin dependencias en el cliente que no estén vendorizadas dentro de la app; CSP estricta en cada `index.html`
  (`script-src 'self'`, sin handlers inline, sin `eval`).
- No subir datos de usuario: `.gitignore` ya excluye `*.json` (salvo manifests), `*.env` y `SGC/Utilidades/datos/*`.

## Tests
- Suite (precache, `CACHE_NAME`, fallback offline): `node --test tests/*.test.mjs` desde la raíz.
- Cada app trae los suyos (SGC-2: `node --test tests/js/*.test.mjs`, ver `SGC-2/CLAUDE.md`).
