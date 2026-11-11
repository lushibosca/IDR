# SGC — stock de CCTV estático (parte de la suite IDR)

Front vanilla JS (scripts globales, sin módulos ES) y CSS propio, todo en el navegador (`localStorage`, prefijo `sgc2/`).
Idioma: español. Reglas generales de la suite (Service Worker único, release, commits, no push): `../CLAUDE.md`.
Estructura y capas: `docs/ARQUITECTURA.md` (fuente de verdad). Contexto y entregas: `README.md`, `ANALISIS-IMPLEMENTACION.md`.

## Después de cada cambio
1. Si cambió un `js/` o `css/`, subir su `?v=` en `index.html`. Si se creó o borró un archivo, ajustar `../sw.js`
   (`PRECACHE_URLS`) y el `<script>`/`<link>` de `index.html` (el orden de los `<script>` es el de dependencias).
2. Desde la raíz `idr/`: `npm run release` (sube `IDR_VERSION` y `CACHE_NAME`; la versión se ve en Ajustes).
3. `npm run test:sgc` y `npm test` (desde la raíz). Sin npm: `node --test tests/js/*.test.mjs` en `SGC/` (no pasar el directorio).
   Tocar la UI o el `index.html`: también `(cd tests/e2e && npm ci) && node tests/e2e/humo.mjs`.
4. Si pasan, commit automático (`SGC: ...`, en español, incluyendo `../sw.js`). No hacer push.

## Normas (las vigila `tests/js/arquitectura.test.mjs`)
- **Lógica pura aparte.** Las decisiones van en funciones puras entre marcadores `// ==== X PURO BEGIN/END ====`, sin
  `document`, `localStorage`, `sessionStorage`, `fetch` ni `navigator`; el reloj y los efectos se inyectan. Cada bloque
  puro tiene su test que lo extrae por los marcadores.
- **Sin `innerHTML`** (ni `outerHTML`, `insertAdjacentHTML`, `document.write`): el DOM se arma con `createElement` y
  `textContent`. Sin handlers inline, `eval` ni `new Function` (CSP: `script-src 'self'`).
- **Errores esperados como valor**: una regla de `datos-puro.js` devuelve `{ error }` / `{ ok: true }` (y `api-local.js`
  lo traduce a 422/404/409); `throw` solo para lo inesperado.
- **Archivos chicos.** Tope de 500 líneas por `js/`. Los que hoy lo pasan están congelados en el test (`TOPES`): no
  pueden crecer, y al partirlos el tope baja. Lo nuevo va en un archivo propio con prefijo del padre
  (`stock-<parte>.js`, `produccion-<parte>.js`); el hijo no depende del padre.
- **Sin pasamanos**: no reexportar ni envolver `(...a) => Otro.fn(...a)`; se llama a la función del dueño. Antes de
  escribir un helper, buscar si ya existe (`comun.js`: bloques `UI COMUN`, `FECHAS Y CSV PURO`, ...).
- **Claves de `localStorage`** siempre con prefijo `sgc2/`. Todo lo que entra (storage, archivo, Gist) pasa por
  `sanearDatos`. No tocar `img/devices/` ni `vendor/`.
- **Seguridad de base** en todo cambio: validar y acotar lo que entra, no meter datos del usuario en HTML ni en URLs,
  nada de tokens ni claves en el repo.
