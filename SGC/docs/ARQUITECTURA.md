# Arquitectura del front — SGC

**Última actualización:** 2026-11-10
**Estado:** front vanilla (scripts globales, sin módulos ni build) con la lógica del stock en funciones puras y una API local
que responde en el navegador. Las normas de abajo las vigila `tests/js/arquitectura.test.mjs`.

---

## 1. Principios y restricciones

1. **Zero-build.** Se sirve tal cual desde GitHub Pages (o `python3 -m http.server -d ..`). Sin bundler ni `npm` en el
   cliente (`tests/e2e` tiene su propio `package.json` solo para jsdom).
2. **Scripts globales, no módulos ES.** Cada `js/` se carga con `<script src>` en `index.html`; **el orden de los
   `<script>` es el grafo de dependencias**: un archivo solo puede usar lo definido por los anteriores (o dentro de
   funciones que se llaman después de cargar todo).
3. **Lógica pura aparte.** Las decisiones viven en bloques `// ==== X PURO BEGIN/END ====`: sin `document`,
   `localStorage`, `sessionStorage`, `navigator` ni `fetch`; el reloj, los ids y los efectos se inyectan. Cada bloque
   se prueba en Node extrayéndolo por los marcadores.
4. **Sin sinks de HTML.** Nada de `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` ni
   `new Function`: el DOM se arma con `createElement` y `textContent`. CSP en `<meta>` de `index.html`:
   `script-src 'self'`, `style-src 'self'`, `connect-src` solo GitHub (Gist), sin handlers inline.
5. **Datos solo en el navegador.** Un JSON en `localStorage` (`sgc2/datos_v1`); cada escritura trabaja sobre una copia y
   se guarda si salió bien. Todo lo que entra (storage, archivo, Gist) pasa por `sanearDatos`.
6. **Prefijo `sgc2/`** en toda clave de `localStorage`: las apps de la suite comparten el origen en GitHub Pages.
7. **Offline-first desde la raíz de la suite.** El único Service Worker es `../sw.js` (cache-first, `ignoreSearch`):
   todo archivo nuevo va en su `PRECACHE_URLS` y cada cambio sube `CACHE_NAME` (`node scripts/release.mjs` en `idr/`).
   Los `?v=N` de `index.html` solo sirven al navegador sin PWA. Lo vigila `../tests/suite.test.mjs`.
8. **Sin Bootstrap ni `!important`.** CSS propio en capas (abajo). La base común de la suite (tokens, base, grilla,
   componentes, utilidades) vive en `../shared/ui/` y los íconos y fuentes en `../shared/vendor/`: la comparten las apps
   que se portan al diseño de SGC (`../docs/PORTE-ESTILO-SGC.md`). Los tests de CSS de SGC también revisan esas hojas.

---

## 2. Estructura

```text
SGC/
├── index.html              # DOM, CSP, <link> en orden de capas y <script> en orden de dependencias
├── CLAUDE.md               # directivas de trabajo (flujo, normas); las de la suite están en ../CLAUDE.md
├── css/
│   └── app/                # estilos de cada sección (produccion, activos, ajustes, tema, ...)
│                           # (tokens, base, grilla, componentes/ y utilidades: en ../shared/ui/, comunes a la suite)
├── js/                     # ver capas (3)
├── img/devices/            # fotos de modelos (no tocar; se guardan al verlas, no están en el precache)
│                           # (bootstrap-icons y fuentes: ../shared/vendor/, no tocar)
├── tests/js/               # node --test: lógica pura de cada js + arquitectura
└── tests/e2e/humo.mjs      # la página real en jsdom, sin servidor
```

---

## 3. Capas de `js/` (en orden de carga)

Cada capa solo usa las de arriba. `app.js` es el eje histórico (heredado de cctv_monitor); lo nuevo no se agrega ahí.

| Capa | Archivos | Qué hace | Qué **no** hace |
|---|---|---|---|
| **0. Arranque** | `preload.js` | Aplica la posición del panel, la privacidad y la pestaña recordada antes del primer pintado (el tema y «reducir animaciones» los pone `../shared/ui/js/arranque.js`). | Lógica de negocio. |
| **1. Reglas del stock** | `datos-puro.js` | Reglas portadas de `cctv/stock.py`: validación, unicidad de serie/MAC/patrimonio, catálogos, edificios y pisos, historial, «en producción solo operativo», `sanearDatos`. | DOM, red, disco ni reloj propio (`ctx.ahora`, `ctx.nuevoId`). |
| **2. API local** | `api-local.js`, `sesion-local.js` | Responde `/api/stock*` y `/api/v2/datos` sobre el JSON guardado, con los mismos estados (422, 404, 409). `sesion-local` reemplaza al login de cctv_monitor. | Reglas de negocio (las llama de la capa 1). |
| **3. Infraestructura UI** | `../shared/ui/js/ui.js` (común a la suite), `animaciones.js`, `busqueda.js`, `comun.js` | `UI` (pestañas, modales, desplegables), animaciones de mutación, búsqueda tokenizada, `storage`, `apiFetch`, toasts y los bloques `UI COMUN`, `FECHAS Y CSV`. | Conocer pestañas concretas. |
| **4. Núcleo de la app** | `app.js`, `selector.js` | Pestañas, panel lateral, búsqueda global, tema, select propio. | Reglas del stock. |
| **5. Pestañas y funciones** | `produccion*.js`, `resumen.js`, `favoritos.js`, `atajos.js`, `stock*.js`, `consultas.js`, `auditoria-bd.js`, `historial-modal.js`, `../shared/ui/js/busqueda-movil.js`, `../shared/ui/js/swipe-pestanas.js`, `imagen-ampliada.js`, `ajustes.js`, `datos-ui.js`, `privacidad.js` | Una vista o función cada uno; el DOM con `textContent`. | Hablar con `localStorage` directo: pasan por `storage` o `apiFetch`. |
| **6. Servicios sin vista propia** | `gist.js`, `parseador.js`, `migrar-sgc.js` | Sincronización cifrada (AES-GCM), parseadores de `cctv_online.json` y migración desde SGC; cada uno con su bloque puro y su ventana. | Escribir datos sin vista previa ni confirmar. |

`stock-puro.js` (puras de la pestaña Stock) se carga antes que `stock.js`; los hijos `stock-*.js` y `produccion-*.js`
comparten con su padre por un objeto global (`window.StockNucleo`) y el hijo no depende de que el padre lo conozca.

### Vista móvil (< 768 px)
El esqueleto (panel lateral, buscador, barra móvil, Ajustes) y sus scripts (`ui.js`, `atras-modales.js`, `busqueda-movil.js`,
`swipe-pestanas.js`) son comunes a la suite: viven en `../shared/ui/` y sus tests en `../tests/`. Lo de abajo describe cómo los usa SGC.

El panel lateral pasa a ser una **barra fija abajo** (Estado, Activos, Producción, búsqueda, Ajustes; `../shared/ui/esqueleto.css`, común a la suite,
variable `--alto-barra-movil`, que sube lo flotante: toast, «volver arriba» y la barra de selección). El buscador está oculto y
lo abre el ícono (`../shared/ui/js/busqueda-movil.js`, `html.busqueda-movil-abierta`). Sin menú ⚙: Historial, Listar y Ayuda y atajos están en
Ajustes (sección `.solo-movil`). **La cabecera queda arriba**, pegajosa y de ~29 px, y el panel de pestañas es una barra fija abajo; ninguna se oculta. `--alto-barra-movil` es el alto de la barra de abajo y sube lo flotante (toast, «volver arriba», barra de selección, el aviso de actualización). En móvil `#v-pills-tabContent` no tiene alto mínimo: con poco contenido la página no se desplaza de más. **Swipe de lado** (`swipe-pestanas.js`, decisión pura `swipePestanaDestino`) cambia de pestaña; no actúa desde los bordes, en campos, tablas que se desplazan, ventanas abiertas ni con más de un dedo, y `overscroll-behavior-x: none` evita el «atrás» del navegador. Al abrir la búsqueda el campo recibe el foco en el mismo toque (abre el teclado). En móvil el `.row` de `#app-main-row` va sin márgenes negativos: con el padding de 8 px del contenedor se pasaba 4 px y causaba scroll horizontal (y movía lo fijo). **Historial** es una ventana (`#modal-historial`): `historial-modal.js` mueve ahí la tarjeta
`#bd-card` de la pestaña (que sigue en el escritorio) mientras está abierta. `.solo-escritorio` / `.solo-movil` (utilidades.css)
muestran u ocultan por ancho: son el mecanismo para lo que existe en una sola vista.

**Imagen ampliada** (`#snapshotModal`): tocar la foto de un equipo la abre grande solo en escritorio (`uiAmpliarImagenPermitido`, `imagen-ampliada.js`); en móvil el toque no hace nada. Solo se ofrece si el equipo está instalado (hay cámara asociada). Sin video en vivo ni ventana flotante: no hay servidor.

**Canales de Producción en móvil:** un canal ocupado va en dos líneas (`.canal-item-dos-lineas`): canal e IP arriba, la descripción completa abajo. Un canal en producción no muestra estado (siempre es operativo); solo «Disponible» en los libres.

**Cambio de pestaña en móvil:** el contenido desliza de lado (eje X), porque la barra de pestañas es horizontal (abajo); en escritorio el eje sale de dónde esté el panel (izquierda o derecha: vertical; arriba o abajo: horizontal). `_ejeDeslizePestanas` en `animaciones.js`.

**Reubicar con el dedo (móvil):** durante una pulsación larga y arrastre (`html.arrastrando-largo`) `arrastre-tactil.js` cancela los `touchmove`: `touch-action: none` fijado al empezar llega tarde (el navegador decide el gesto al tocar) y la página hacía scroll.

**Detalles en tarjetas (móvil):** los modales de detalle de stock (cámaras, servidores, otros, grupos) y de canales muestran cada fila como una tarjeta (nombre arriba, números en columnas con su rótulo; los modelos, sub-tarjetas; el total, una tarjeta fija abajo). Es solo CSS (`css/app/detalle-movil.css`, selectores genéricos con `:where()`); el JS arma las mismas filas de tabla.

**Tema compartido con la suite:** `IDRTema` (`../shared/idr-tema.js`, clave `IDR_dark`) manda sobre `sgc2/theme`: `arranque.js` lo aplica antes de pintar (con `sgc2/theme` de respaldo) y `apariencia.js` lo cambia y lo sigue en vivo (evento `storage`, y al volver del caché de «atrás»); SGC guarda su respaldo al oír `idr:tema`.

**Doble toque** (`doble-toque.js`): dentro de lo marcado con `data-doble-toque` (los modales de detalle) dos toques seguidos emiten un `dblclick` propio y se descarta el nativo, que en los teléfonos no es confiable.

**Botón «atrás»:** `../shared/ui/js/atras-modales.js` conecta `UI.modal` (eventos `ui:modal-abrir` / `ui:modal-cerrar`) y el buscador móvil con `IDRAtras` (`../shared/idr-atras.js`): cada capa abierta guarda una entrada del historial, cerrar por la X, el fondo o Escape la saca (varias juntas, con un solo `go(-n)`) y «atrás» del sistema cierra la de arriba; si una capa no se deja cerrar, recupera su entrada.

**Detalles de stock (acordeón):** los modelos de un tipo se abren y cierran con animación (en móvil, `max-height`/relleno/margen/borde de la tarjeta en `detalle-movil.css`; en escritorio, el colapso por celdas) y **se abre un tipo a la vez**: abrir uno cierra el anterior, como los grupos de Activos y Producción.

**Versión visible:** en Ajustes (`.ajustes-version`, `data-idr-version="SGC"` → «SGC-vAAMMDD»); la escribe `../shared/idr-version.js` y `npm run release` la sube junto con `CACHE_NAME`.

**Actualización de la PWA:** la registra `../shared/idr-actualizacion.js` (toast con barra de progreso); SGC no registra el worker por su cuenta.

### Comunicación entre archivos
- **Globales de página**: `storage`, `apiFetch`, `mostrarToast`, `UI`, `globalData`, `StockNucleo`. Lo que otro archivo necesita
  se expone explícitamente en uno de esos objetos; no se esparcen funciones sueltas nuevas sin motivo.
- **Eventos** `ui:*` para avisar cambios sin esperar respuesta.
- **Errores**: una regla esperada (dato inválido, duplicado, no existe) **no lanza**: devuelve `{ error }` o `{ ok: true }` y
  `api-local.js` lo traduce a 422/404/409; `throw` es para lo inesperado y para la red (Gist).

---

## 4. Guía de decisión: ¿dónde va una función nueva?

- **Es una regla del stock** (validar, buscar duplicados, qué cambia en un catálogo) → `datos-puro.js`, pura, con su test.
  Si hay que exponerla como pedido, además una ruta en `api-local.js`.
- **Es un cálculo o formato sin DOM** (agrupar, formatear, ordenar, parsear) → bloque `PURO` en el archivo de la vista que
  la usa; si ese archivo ya pasó de 500 líneas, en un `<padre>-puro.js` o `<padre>-<parte>.js` nuevo.
- **Dibuja o lee la pantalla** → archivo de la vista. Si supera ~300 líneas o tiene ciclo de vida propio → archivo propio
  con el prefijo del padre (`stock-<parte>.js`, `produccion-<parte>.js`); el hijo no depende del padre.
- **Lo usan varias pestañas** → `comun.js` (bloque nuevo con marcadores). Buscar antes si ya existe un helper.
- **Habla con GitHub o con un archivo externo** → módulo de la capa 6 con su bloque puro (formato y validación) y la
  parte con efectos aparte.

### Tope de tamaño
500 líneas por archivo. Los 14 que ya lo pasaban están congelados en `TOPES` del test: no pueden crecer, y al partir uno
hay que bajar su número (o quitarlo si queda por debajo). Los mayores: `app.js`, `comun.js`, `stock.js`, `produccion.js`,
`resumen.js`, `datos-puro.js`.

### Checklist al crear, renombrar o borrar un archivo
1. `<script>` o `<link>` en `index.html` en su lugar de la cascada o de las dependencias (con `?v=1`).
2. `../sw.js`: alta en `PRECACHE_URLS` (el test de la suite falla si falta); `node scripts/release.mjs` desde `idr/`.
3. Si lleva lógica pura: bloque con marcadores y `tests/js/<nombre>.test.mjs` que lo extraiga.
4. `node --test tests/js/*.test.mjs` y `node --test ../tests/*.test.mjs`; con cambios de pantalla, `node tests/e2e/humo.mjs`.

---

## 5. Pruebas

| Qué | Dónde | Cómo |
|---|---|---|
| Lógica pura de cada archivo (datos, merge, parseadores, migración, selección, favoritos, ...) | `tests/js/*.test.mjs` | `node --test tests/js/*.test.mjs` (sin pasar el directorio) |
| Normas: tope de líneas, `<script>` ↔ archivos, bloques puros sin DOM, sin sinks de HTML, CSP sin inline, prefijo `sgc2/` | `tests/js/arquitectura.test.mjs` | idem |
| Clases CSS usadas ↔ definidas | `tests/js/clases_css.test.mjs` | idem |
| Página completa (ventanas, ensayo y aplicar) | `tests/e2e/humo.mjs` | `(cd tests/e2e && npm ci) && node tests/e2e/humo.mjs` |
| Precache y `CACHE_NAME` del `sw.js` de la suite | `../tests/suite.test.mjs` | `node --test ../tests/*.test.mjs` |

---

## 6. Pendiente de arquitectura

- Partir los archivos de más de 500 líneas (primero `app.js`, 2135, y `comun.js`, 2018), bajando su tope en el test.
- Convertir los accesos a `window.*` entre archivos en objetos con nombre (`StockNucleo` ya lo es).
- ~~Entrega 6 (renombrar `SGC-2` → `SGC`)~~: hecha el 2026-11-10; el SGC anterior se borró. Falta solo un `flash.js` propio si se quiere
  evitar el parpadeo de tema (hoy lo cubre `preload.js`).
