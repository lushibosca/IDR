# Porte del estilo de SGC al resto de la suite (SGR, SGI, SGP; pendientes de planificar: SGL y launcher)

**Inicio:** 2026-11-11 · **Estado:** fases 0, 1 (SGR) y 2 (SGI) hechas; **pausado antes de la fase 3 (SGP)**: ver
«Para retomar» al final. La revisión de cobertura del 2026-11-11 (sección 6) encontró partes de la base que este plan
no contemplaba: **SGL y el launcher quedaron afuera**, y entre SGC, SGR y SGI todavía hay piezas de la base que no son
la misma (cabecera `<head>`, arranque del tema, avisos, panel plegable). Conviene resolverlas antes de portar SGP.

Objetivo: que SGR (Racks), SGI (Materiales) y SGP (Patcheras) usen el mismo diseño que SGC: panel lateral de pestañas,
buscador con filtro de campos, Ajustes como pestaña y la vista móvil (barra fija abajo, swipe, tablas en tarjetas,
botón «atrás»). Es un porte **de estilo y estructura de pantalla**: los datos, las claves de `localStorage` (`SGI_*`,
`RCK_*`, `PCH_*`) y la lógica de cada app no cambian.

---

## 1. Decisiones (2026-11-11)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿Copiar el estilo en cada app o compartirlo? | **Compartido** en `shared/ui/`: una sola copia, un solo precache, un ajuste llega a todas. |
| 2 | ¿Íconos? | **bootstrap-icons compartido** en `shared/vendor/` (con la fuente Inter). Los sprites SVG de cada app se dejan de usar a medida que se porta. La regla de «vendorizado dentro de la app» de `CLAUDE.md` ahora admite `shared/vendor/`. |
| 3 | SGP no tiene pestañas ni búsqueda | Pestañas **Estado** (resumen por edificio, como el dashboard de SGR), **Racks** (la lista actual) y **Ajustes**, más búsqueda por rack, patchera, puerto y etiqueta. |
| 4 | ¿Alcance? | **Solo estilo y estructura.** El esqueleto, los modales y Ajustes se reescriben con el marcado de SGC. Las plantillas del contenido (tablas, tarjetas, dashboard; todas escapan con `esc()`) se **reestilan por CSS** con los tokens de la suite y quedan con `innerHTML` (ajustado el 2026-11-11: convertirlas multiplicaba el trabajo; se pasan a `createElement` cuando se toquen). Partir `app.js` y los bloques puros con tests de SGC, para después. |

Orden: **SGR → SGI → SGP** (de la más parecida a SGC a la que necesita diseño propio).

---

## 2. Punto de partida

| | SGC (destino) | SGR | SGI | SGP |
|---|---|---|---|---|
| Navegación | panel lateral (Estado, Activos, Producción, Historial, Ajustes), movible y plegable | 3 pestañas arriba: Dashboard, Inventario, Servicio | 2 pestañas: Dashboard, Movimientos | ninguna: una lista de racks |
| Búsqueda | en el panel, filtro de campos y de paneles; en móvil detrás de un ícono | global con filtro de campos | global (fechas, duplicados) + filtro por año | no tiene (solo `<select>` de edificio) |
| Ajustes | pestaña con `.ajuste-seccion` / `.ajuste-fila` / `.interruptor` | modal | modal | modal + botón de tema en la cabecera |
| Móvil | barra fija abajo, swipe, tarjetas, «atrás» | 3 `@media` sueltos | 1 `@media` | ninguno |
| CSS | capas `@layer` (tokens → utilidades) | `styles.css` 3.293 líneas | 2.837 | 2.627 |
| `app.js` | ~40 archivos | 3.888 líneas, 24 `innerHTML` | 4.694, 29 `innerHTML` | 3.275, 18 `innerHTML` |
| Íconos | bootstrap-icons | sprite SVG (45) | sprite SVG (48) | sprite SVG (29) |
| `shared/` | tema, atrás, versión, actualización | infra, actualización | actualización | infra, actualización |

Las tres comparten la misma base vieja: `header` con logo y título, pestañas `.tab-btn`, modales `.modal` que se abren
con `.show` (una sola función por app, cerca de las líneas 300–600 de `app.js`), `mostrarToast`/`toast` y `switchTab`.
Por eso el porte es el mismo procedimiento en las tres.

### Problemas encontrados (se arreglan en el porte)
- [ ] Versión escrita a mano y vieja en los Ajustes (`v260610` SGI, `v260612` SGR, `v260921` SGP) → `data-idr-version`. *(SGR y SGI: hecho)*
- [ ] «Atrás» del sistema con modales: SGI y SGP no lo manejaban, y SGR tenía su propio `pushState` → `IDRAtras` vía `UI.modal`. *(SGR y SGI: hecho)*
- [ ] Tema a mano (`IDR_dark` + `flash.js` propio), no sigue en vivo el cambio hecho en otra app → `IDRTema`. *(SGR y SGI: hecho)*
- [ ] SGP lee `RCK_data` directamente (`SGP/app.js:1117`); tiene que pasar por `IDRInfra.getRacks`.
- [x] SGP no tenía fallback offline de navegación en `sw.js` (caía en el launcher). Arreglado en la fase 0; lo vigila `tests/suite.test.mjs`.

---

## 3. Base común (`shared/ui/`, `shared/vendor/`)

```text
shared/
├── ui/
│   ├── tokens.css        # primera hoja: orden de capas (@layer tokens, base, iconos, grilla, componentes, app, utilidades),
│   │                     # variables de color/tamaños de los dos temas e @import de bootstrap-icons
│   ├── base.css  grilla.css
│   ├── componentes/      # acordeón, alertas, botones, desplegables, formularios, insignias, listas, modal,
│   │                     # navegación, progreso, spinner, tablas, tarjetas, toast, transiciones
│   └── utilidades.css    # al final de la cascada
└── vendor/
    ├── bootstrap-icons/  # no tocar
    └── fonts/            # Inter (no tocar)
```

Orden de los `<link>` en una app: `tokens`, `base`, `grilla`, `../shared/idr-actualizacion.css`, `componentes/*`, las hojas
propias de la app (capa `app`), `utilidades`, `vendor/fonts/inter.css`. Ver `SGC/index.html`.

**Reglas de la base:** sin `!important` (la capa decide), cada selector en un solo lugar, sin CSS muerto. Lo vigila
`tests/estilo.test.mjs` contra todas las apps de `tests/_apps.mjs` (una clase cuenta como usada si la usa al menos una app
portada), además de los tests de CSS de SGC (`SGC/tests/js/css_limpio.test.mjs`, `clases_css.test.mjs`). Ojo: por eso mismo
una regla que solo usa SGC (p. ej. el panel plegado) pasa el test aunque las otras apps no la puedan usar: ver sección 6.

**Esqueleto común (fase 1):**
- `shared/ui/esqueleto.css`: panel lateral y su versión plegada, buscador, vista móvil (barra fija abajo, buscador que baja,
  lo flotante sobre la barra), «volver arriba», acciones de la barra superior (`.navbar-acciones`) y la pestaña Ajustes
  (`.ajuste-seccion`, `.ajuste-fila`, `.interruptor`). Lo propio de SGC (dashboard, posición del panel, kiosco) quedó en `SGC/css/app/`.
- `shared/ui/js/`: `ui.js` (`UI.pestana`, `UI.modal`, `UI.desplegable`), `atras-modales.js`, `busqueda-movil.js`,
  `swipe-pestanas.js` (de SGC, sin cambios) y, para las apps portadas, `arranque.js` (tema y «reducir animaciones» antes de
  pintar; reemplaza a `flash.js`), `apariencia.js` (interruptores de Ajustes) y `mm.js` (el gestor de modales `MM` que
  usaban SGR, SGI y SGP, con la misma API, sobre `UI.modal`).
- `shared/ui/legado/variables.css`: las variables viejas de SGR/SGI/SGP (`--text-main`, `--accent`, `--c-green`...) como alias
  de los tokens; así el CSS propio portado toma los colores de SGC. `--legado-hover` es su `filter` al pasar el mouse.
- Ids que espera el esqueleto: `#app-main-row`, `#sidebar-col`, `#main-content-col`, `#v-pills-tab`, `#v-pills-tabContent`,
  `#sidebar-search-container`, `#global-search`, `#btn-buscar-movil` (más `#btn-theme` y `#btn-movimiento` en Ajustes).
- Tests: `tests/estilo.test.mjs` (normas de los JS compartidos, CSS sin `!important` ni muerto contra todas las apps de
  `tests/_apps.mjs`, esqueleto completo en cada app portada), `tests/ui|busqueda_movil|swipe_pestanas.test.mjs` y la humo
  `tests/e2e/humo-apps.mjs` (jsdom; una función por app).

**Receta de una app portada** (la de SGR, `SGR/index.html`): en el `<head>` `idr-tema.js`, `idr-version.js`, `idr-atras.js` y
`ui/js/arranque.js` (con `data-prefijo` y `data-tema`), las hojas en el orden de capas (`legado/variables.css` y la de la app
entre `esqueleto.css` y `utilidades.css`); al final `ui.js`, `atras-modales.js`, `mm.js`, lo de la app, `busqueda-movil.js`,
`swipe-pestanas.js` y `apariencia.js`. Las variables viejas de la app se mantienen como alias de los tokens de la suite al principio de su hoja.

---

## 4. Fases

### Fase 0 — base común (hecha, 2026-11-11)
- [x] `SGC/css/{tokens,base,grilla,utilidades}.css` y `SGC/css/componentes/` → `shared/ui/`; `SGC/vendor/` → `shared/vendor/`
      (con `git mv`, sin cambiar contenido).
- [x] `SGC/index.html` carga desde `../shared/ui/` y `../shared/vendor/`; `sw.js` actualizado.
- [x] Tests de CSS de SGC leen también `../shared/ui/`; test de suite: todo `shared/` precacheado y fallback offline de cada app.
- [x] SGC sin cambios visibles: `npm run test:sgc`, `npm test` y `node tests/e2e/humo.mjs` en verde.

### Fase 1 — SGR (hecha, 2026-11-11)
- [x] Extraer a `shared/ui/` lo general de estructura, ajustes y barra móvil, y el JS genérico (sección 3). *(El «detalle
      móvil» de SGC usa selectores de sus modales: quedó en SGC.)*
- [x] Esqueleto: navbar (ícono → launcher, deshacer/rehacer a la derecha), panel lateral con buscador + filtro de campos y
      pestañas **Dashboard · Inventario · Servicio · Ajustes**, `tab-content`.
- [x] Ajustes como pestaña: *Apariencia* (modo oscuro, reducir animaciones), *Datos* (exportar, importar, restablecer),
      *Edificios*, *Sincronización (Gist)*, versión `data-idr-version="SGR"`.
- [x] Modales al marcado y API de `UI.modal` (reemplaza la función propia de abrir/cerrar).
- [x] Tablas de inventario y servicio: las de SGR, reestiladas con los tokens (en móvil ya usaba tarjetas).
- [x] Móvil: barra fija abajo, buscador por ícono, swipe, «atrás».
- [x] `IDRTema` (sale `flash.js` y el botón de tema), `idr-version`, `idr-atras`.
- [x] `styles.css` → `css/sgr.css`: solo lo propio, en capa `app`, sin `!important`, con alias a los tokens.
- [x] El selector de módulos del título (popup) no está en el diseño de SGC: la marca lleva al launcher.
- [x] `MM` (modales) sobre `UI.modal`, con la misma API; el objeto propio `UI` pasó a llamarse `Vistas`.
- [x] Prueba de humo en jsdom (`tests/e2e/humo-apps.mjs SGR`) y capturas en Firefox headless (escritorio, oscuro, móvil).

### Fase 2 — SGI (hecha, 2026-11-11)
- [x] Esqueleto de SGC: pestañas **Dashboard · Movimientos · Ajustes**; el buscador del panel conserva la búsqueda
      inteligente (material, ticket, tipo, duplicados, fechas); el filtro por año queda en la tarjeta Inventario.
- [x] Ajustes como pestaña: Apariencia, Movimientos (entrada, salida, nuevo material), Inventario (reporte, categorías,
      herramientas), Datos, Sincronización, Ayuda (atajos, solo escritorio) y la versión de la suite.
- [x] 16 modales al marcado de SGC; `MM` compartido (`shared/ui/js/mm.js`, también lo usa SGR); `UI` propio → `Vistas`.
- [x] Sin swipe ni selector de módulos propios; botón «Instalar» en la barra superior (oculto hasta que el navegador lo ofrece).
- [x] `css/sgi.css` (capa `app`, sin `!important`); salen `styles.css` y `flash.js`.
- [x] Humo `node tests/e2e/humo-apps.mjs SGI` y capturas (escritorio, oscuro, móvil, entrada).

### Fase 3 — SGP
Además del porte: pestañas **Estado · Racks · Ajustes**, búsqueda nueva (rack, patchera, puerto, etiqueta) y el tooltip de
jack, que hoy es por *hover*, abierto con un toque en móvil. Pasar la lectura de `RCK_data` a `IDRInfra.getRacks`.

### Fase 4 — SGL (sin planificar)
No estaba en el plan original (ver 6.1). Falta definir pestañas y buscador; el resto es el procedimiento de la sección 5.

### Fase 5 — Launcher (a decidir)
Sin esqueleto; solo tokens, fuente, íconos, `IDRTema` y versión de la suite (ver 6.1).

---

## 5. Procedimiento por app (para no olvidar nada)

1. **Mantener los `id`** de inputs y botones que usa `app.js`: el cableado de eventos casi no cambia.
2. Lo que se dibuja desde JS con clases viejas se reestila por CSS y queda con `innerHTML` + `esc()` (decisión 4); se pasa a
   `createElement`/`textContent` cuando se toque.
3. Las claves de `localStorage` no se tocan (los datos de los usuarios siguen igual).
4. Cada archivo nuevo o borrado → `PRECACHE_URLS` en `sw.js`; `npm run release`; `npm test` y los tests de la app.
5. Probar en el teléfono: sin scroll horizontal, la barra de abajo no tapa contenido, «atrás» cierra el modal de arriba.
6. Marcar acá lo hecho y anotar en el `CLAUDE.md` de la app (crearlo si no existe) lo que quede como norma.
7. Antes de copiar algo de SGR o SGI a la app nueva, revisar la lista 6.3: si ya está dos veces, va a `shared/ui/`.

---

## 6. Revisión de cobertura (2026-11-11): lo que el plan no contemplaba

Se comparó este documento contra las seis páginas de la suite (launcher, SGC, SGR, SGI, SGP, SGL), `shared/`, `sw.js` y los
tests. Nada de esto está hecho; cada punto dice qué falta decidir o hacer.

### 6.1 Páginas que quedaron fuera del plan
- [ ] **SGL (Licencias)**: no aparece en ninguna fase ni en la tabla de la sección 2. Tiene la misma base vieja que SGP:
      `flash.js`, `styles.css` (2.259 líneas, sin ningún `@media`), `app.js` (3.509 líneas, 26 `innerHTML`), sprite SVG
      (53 símbolos), Ajustes en modal (`#modal-config`), `pushState`/`popstate` propios para «atrás», tema leyendo `IDR_dark` a
      mano, sin versión visible y sin pestañas ni buscador. Prefijo de claves: `sgl_`. **Falta una fase 4 — SGL**, con el mismo
      procedimiento, y antes definir sus pestañas (como se hizo con SGP en la decisión 3).
- [ ] **Launcher (raíz)**: `index.html`, `styles.css` (596 líneas), `flash.js` y `app.js` propios, sprite SVG, tema con
      `IDR_dark` a mano (no `IDRTema`, no sigue en vivo el cambio hecho en otra pestaña) y sin versión visible. No lleva el
      esqueleto (no tiene pestañas), pero para que la base sea la misma debería tomar de `shared/`: `tokens.css` (colores y
      tipografía), la fuente Inter, bootstrap-icons, `idr-tema.js` y `idr-version.js`. **Decidir** si entra como fase 5 o si
      queda con diseño propio a propósito (y anotarlo acá).
- [ ] El launcher **no tiene tarjeta de SGL** (enlaza SGC, SGI, SGR, SGP y SGM deshabilitada): a SGL solo se llega por URL.

### 6.2 La base que todavía no es la misma en SGC, SGR y SGI
- [ ] **`<head>` distinto en cada app y sin test.** `viewport`: SGR y SGI llevan `viewport-fit=cover`, SGC no, y
      `esqueleto.css` usa `env(safe-area-inset-*)` en la barra móvil (en SGC vale siempre 0: en teléfonos con muesca la barra
      queda distinta). `color-scheme`: solo SGC. `mobile-web-app-capable` / `apple-mobile-web-app-*`: SGR los tres, SGI dos, SGC
      ninguno. `theme-color`: ninguna. CSP: SGC sin `frame-ancestors` ni `upgrade-insecure-requests`; SGR/SGI con
      `font-src 'self' data:` que ya no hace falta (la fuente es un archivo). `?v=` en los `<link>`/`<script>`: solo SGC (no
      sirve con el Service Worker `ignoreSearch`). → Definir **un `<head>` de referencia** en la receta de la sección 3 y
      vigilarlo en `tests/estilo.test.mjs`.
- [ ] **Dos arranques de tema.** SGR y SGI usan `shared/ui/js/arranque.js` + `apariencia.js`; SGC sigue con
      `js/preload.js` + `js/tema-suite.js` + `initTheme` en `app.js`. Lo común (tema y «reducir animaciones» antes de pintar,
      interruptores de Ajustes) debería ser una sola implementación; `preload.js` quedaría solo con lo de SGC (panel, privacidad,
      pestaña recordada, `data-cargando`).
- [ ] **Panel plegable y movible**: el CSS del panel plegado está en `esqueleto.css`, pero el botón `#btn-toggle-sidebar` y su
      JS solo existen en SGC. En SGR y SGI el panel no se puede plegar. **Decidir**: portar el botón (y su JS a
      `shared/ui/js/`) o declararlo propio de SGC y mover ese CSS a `SGC/css/app/estructura.css`.
- [ ] **Avisos (toast)**: `toast.css` es común, pero `mostrarToast` está escrito tres veces (`SGC/js/comun.js`, `SGR/app.js`,
      `SGI/app.js`) y el `#toast` de SGC no lleva `role="status"` ni `aria-live`. → `shared/ui/js/toast.js`.
- [ ] **«Volver arriba»**: CSS común, JS repetido en las tres apps, y `sgr.css` y `sgi.css` vuelven a definir `.btn-scroll-top`.
- [ ] **Barra superior**: SGC tiene el menú ⚙ (`#menu-config`: listar, tema, ayuda y atajos) y `#last-update`; SGR y SGI tienen
      `.navbar-acciones` (deshacer, rehacer, instalar). **Decidir** qué es base (propuesta: marca → launcher + `.navbar-acciones`)
      y qué es de cada app; el botón «Instalar» hoy solo lo tiene SGI (y el launcher).
- [ ] **Ajustes**: las secciones cambian de app en app. Mínimo común a exigir: *Apariencia* (`#btn-theme`, `#btn-movimiento`),
      *Datos* (exportar, importar, restablecer), *Sincronización* y la versión (`data-idr-version`). La ayuda de atajos está en un
      modal en SGC, en Ajustes en SGI y no existe en SGR.
- [ ] **Buscador**: el filtro de campos (`#searchFilterBtn`, `#search-filter-menu`) es opcional (SGI no lo tiene); `#search-clear`
      sí está en las tres. Anotarlo en la lista de ids de la sección 3 como «obligatorios» y «opcionales».
- [ ] **Manifiestos**: `theme_color` es `#1f2937` en todos menos SGP (`#ea580c`). Unificar al portar SGP.
- [ ] **Service Workers viejos por app**: `SGR/sw.js`, `SGI/sw.js`, `SGP/sw.js` y `SGL/sw.js` siguen en el repo (se
      desregistran solos; no están en el precache) aunque `CLAUDE.md` dice que no hay un `sw.js` por app. Decidir cuándo se
      borran (cuando ya no queden instalaciones viejas) o anotar en `CLAUDE.md` por qué siguen.

### 6.3 Repetido entre SGR y SGI (pasarlo a `shared/ui/` antes de que SGP y SGL hagan la tercera y cuarta copia)
- [ ] CSS propio con los mismos selectores en `sgr.css` (1.908 líneas) y `sgi.css` (1.680): `.empty-state`, `.card-header`,
      `.table-wrap`, `.dash-layout`, el FAB y `.btn-scroll-top`. Son parte de la base (estado vacío, encabezado de tarjeta,
      tabla, botón flotante): van a `shared/ui/componentes/`.
- [ ] Funciones con el mismo nombre en los dos `app.js` (comparar y unificar): `mostrarToast`/`toast`, `confirmar`, `esc`,
      `switchTab`/`_alMostrarPestana`, `_animarMutacion`, `limpiarBusqueda`/`_marcarBusqueda`/`onBusqGlobal`,
      `exportarDatos`/`importarDatos`/`restablecerDatos`, `generarFirma`/`verificarFirma`, `normalizarTexto`, `uid`.
- [ ] SGC tiene piezas genéricas que las otras no usan y que conviene evaluar como base: `selector.js` (select propio),
      `doble-toque.js`, `arrastre-tactil.js`, `animaciones.js` (mutaciones) y la confirmación en dos pasos de `datos-ui.js`.

### 6.4 Tests que faltan para que «la misma base» no dependa de la memoria
`tests/estilo.test.mjs` hoy exige las hojas, cuatro scripts (`ui.js`, `atras-modales.js`, `busqueda-movil.js`,
`swipe-pestanas.js`), tema, versión y ocho ids. No exige:
- [ ] `arranque.js`, `apariencia.js` y `mm.js` (hoy SGC no los carga: depende del punto «dos arranques»).
- [ ] `#btn-theme`, `#btn-movimiento`, `#toast` (con `role="status"`), `#btn-scroll-top`, `#search-clear`.
- [ ] El `<head>` de referencia (viewport, `color-scheme`, metas de PWA, CSP base).
- [ ] La marca de la barra superior con enlace al launcher (`.brand-launcher`).
- [ ] Manifiestos con los mismos `theme_color`, `background_color`, `display` y `orientation`.

---

## 7. Para retomar (estado al 2026-11-11)

**Hecho y commiteado:** fases 0, 1 y 2 (SGC sin cambios visibles; SGR y SGI con el diseño de SGC). Todo en verde:
`npm test`, `npm run test:sgc`, `node SGC/tests/e2e/humo.mjs` (desde `SGC/`) y `node tests/e2e/humo-apps.mjs`.

**Antes de seguir:** resolver las decisiones de la sección 6 (SGL, launcher, panel plegable, barra superior) y, de ser
posible, 6.2 y 6.3, para que SGP se porte sobre la base ya unificada y no haya que tocarla dos veces.

**Falta: fase 3, SGP (Patcheras).** Mismo procedimiento que SGR y SGI (sección 5 y la receta de la sección 3), más:
1. **Estructura nueva**: hoy es una sola lista de racks con `#btn-nuevo-rack`, `#btn-importar-planilla` y
   `#filtro-edificio-select`. Pestañas **Estado** (resumen por edificio) · **Racks** (la lista actual, con el filtro de
   edificio en el encabezado de la tarjeta) · **Ajustes**; la acción «Nuevo rack» e «Importar planilla» en Ajustes (y en un
   FAB, como SGR).
2. **Buscador nuevo** (`#global-search`): rack, patchera, puerto y etiqueta; no existe hoy.
3. **`MM`**: SGP tiene una versión reducida (`abrir`, `cerrar`, `alternar(origen, destino, optsOrCb)`, `cerrarTop`). Pasar a
   `../shared/ui/js/mm.js`, revisando las llamadas a `alternar` con tercer argumento (en el compartido el 3.º es el
   callback de cierre y el 4.º el de apertura).
4. **Tooltip de jack** (`#jack-tooltip`): hoy por *hover*; en móvil abrirlo con un toque.
5. **`RCK_data` directo** en `SGP/app.js` (~línea 1117): pasar a `IDRInfra.getRacks()`.
6. Variables propias que faltan en el legado: `--rack-bg`, `--rack-rail` (van en `SGP/css/sgp.css`).
7. Agregar `SGP` a `tests/_apps.mjs`, un escenario `sgp()` en `tests/e2e/humo-apps.mjs`, `SGP/CLAUDE.md`, y sacar
   `styles.css` y `flash.js` (también de `sw.js`).

**Herramientas usadas para verificar el aspecto** (no están en el repo): un servidor local y Firefox *headless*
(`firefox --headless --screenshot`) sobre una página auxiliar que carga datos de prueba en `localStorage` y abre la app en un
`iframe` del mismo origen. Para extraer el CSS propio de cada app se separó su `styles.css` en bloques de nivel superior y se
conservaron por línea de inicio (lo genérico —reset, cabecera, pestañas, botones, modales, toast, selector de módulos— lo
reemplaza la base).

**Pendientes generales (fuera de este porte):** pasar las plantillas `innerHTML` de SGR/SGI/SGP a `createElement`; partir los
`app.js` con las normas de SGC; Gist cifrado como el de SGC.
