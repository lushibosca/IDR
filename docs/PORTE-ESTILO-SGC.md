# Porte del estilo de SGC al resto de la suite (SGR, SGI, SGP y launcher; SGL por ahora no entra)

**Inicio:** 2026-11-11 · **Estado:** fases 0, 1 (SGR) y 2 (SGI) hechas; **pausado antes de la fase 3 (SGP)**: ver
«Para retomar» al final. La revisión de cobertura del 2026-11-11 (sección 6) encontró partes de la base que este plan
no contemplaba; las decisiones 5 a 9 (sección 1) las resolvieron: SGL no entra por ahora, el launcher toma la base común y
el panel plegable y personalizable, las transiciones de pestaña y la barra superior pasan a ser base de todas las apps.
Eso es la **fase 2.5 (unificar la base)**, que va antes de portar SGP.

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

| 5 | ¿SGL entra al porte? | **Por ahora no.** Queda con su base vieja; no se le exige nada de `shared/ui/` (sigue cumpliendo las reglas de suite: Service Worker único, `IDR_dark`). Se replanifica más adelante. |
| 6 | ¿El launcher? | **Toma la base común**: tokens, fuente Inter, bootstrap-icons, `IDRTema` y versión de la suite. Sin esqueleto de pestañas (no las tiene). Fase 4. |
| 7 | ¿Panel plegable y su personalización (posición izquierda/derecha/arriba/abajo, arrastrándolo)? | **Base de todas las apps.** El botón `#btn-toggle-sidebar`, el CSS y el JS salen de SGC a `shared/ui/`; cada app guarda su estado con su prefijo. |
| 8 | ¿Transiciones de cambio de pestaña? | **Base de todas las apps**: la de SGC (`slide-pestana-saliente`, `SGC/js/animaciones.js` y `css/app/animaciones.css`) pasa a `shared/ui/`; respeta «reducir animaciones». |
| 9 | ¿Barra superior? | **La misma en todos los módulos**, con deshacer y rehacer (`#btn-undo`, `#btn-redo`) como parte de la barra común. Un solo marcado de referencia; lo vigila un test. |
| 10 | ¿Deshacer/rehacer en SGC, que no lo tenía? | **Se implementa de verdad en SGC** (función nueva: es la única excepción a «solo estilo»). Mismo comportamiento que en SGR y SGI: botones en la barra, `Ctrl+Z` / `Ctrl+Y`, aviso «Deshecho: …». |
| 11 | ¿Menú ⚙ de la barra? | **Queda como está en SGC** y es parte de la barra común: en escritorio, menú desplegable a la derecha; **en móvil no se muestra** (como en SGC, `solo-escritorio`) y sus opciones están en la pestaña Ajustes. |

Decisiones 5 a 11: 2026-11-11, después de la revisión de cobertura (sección 6).

Orden: **SGR → SGI → unificar la base (fase 2.5) → SGP → launcher** (SGL, sin fecha).

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

### Fase 2.5 — unificar la base (pendiente; va antes de SGP)
Lo que las decisiones 7, 8 y 9 y la sección 6 dejan como base, sacándolo de SGC (o de SGR/SGI) a `shared/ui/` y
aplicándolo en SGC, SGR y SGI. **La guía paso a paso, con archivos y líneas, es la sección 8.** Se marca acá lo hecho:
- [x] Paso 1 — `<head>` de referencia en SGC, SGR y SGI, con test (hecho, 2026-11-11).
- [x] Paso 2 — un solo arranque (SGC pasa a `arranque.js` + `apariencia.js`) (hecho, 2026-11-11).
- [x] Paso 3 — avisos (`toast.js`) y «volver arriba» comunes (hecho; SGR y SGI conservan en su CSS el `right` de `.btn-scroll-top` porque tienen FAB).
- [x] Paso 4 — transición de cambio de pestaña común (decisión 8) (hecho; `shared/ui/js/transicion-pestanas.js`, también aloja `DUR_ANIM_MS`, `fijarAlturaAnimable` y `animarAlturaAlContenido`).
- [x] Paso 5 — panel plegable y personalizable común (decisión 7) (hecho: `shared/ui/js/{gestos,panel,panel-mover,panel-etiquetas}.js` y `shared/ui/panel.css`; claves `<prefijo>panel_colapsado` / `panel_posicion`, SGC conserva las suyas por atributos).
- [x] Paso 6 — barra superior única (hecho sin menú ⚙ en SGR y SGI por pedido del usuario: SGC lo conserva; `instalar.js` compartido; en SGC `#btn-undo`/`#btn-redo` quedan `disabled` hasta el paso 6b).
- [x] Añadido a pedido (2026-11-11): sintaxis de búsqueda de SGC (frases y exclusión con `!`/`-`) en SGR y SGI (`shared/ui/js/busqueda-tokens.js`);
      modal de ayuda y atajos común (`ayuda.js` + `ayuda.css`; datos en `SGR/atajos.js`, `SGI/atajos.js`, `SGC/js/atajos.js`; «?» lo abre y está en
      Ajustes > Ayuda); Ctrl+flechas según el lugar del panel y rueda sobre el panel (`navegacion.js`, interruptor en Ajustes > Navegación).
      No se llevaron a SGR/SGI (no aplican): selección masiva, Listar, privacidad, reubicar secciones del Estado, acordeones, popup de equipo.
- [ ] Paso 6b — deshacer/rehacer en SGC (decisión 10; función nueva).
- [ ] Paso 7 — CSS repetido de SGR/SGI a `shared/ui/componentes/`.
- [ ] Paso 8 — tests de 6.4 y humo de las tres apps.

### Fase 4 — Launcher (decisión 6)
Sin esqueleto de pestañas. Carga `tokens.css`, `base.css`, la fuente Inter y bootstrap-icons (sale el sprite SVG);
`idr-tema.js` en lugar de leer `IDR_dark` a mano (sale `flash.js`; el tema sigue en vivo el cambio hecho en una app);
`idr-version.js` con `data-idr-version`; `styles.css` queda solo con lo propio (tarjetas, fondo) en `@layer app`, sin
`!important`. Ajustar `PRECACHE_URLS`. Se agrega a los tests de estilo como página con base pero sin esqueleto.

### SGL — fuera del porte por ahora (decisión 5)
No se toca. Cuando entre: definir pestañas y buscador y seguir la sección 5.

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
      mano, sin versión visible y sin pestañas ni buscador. Prefijo de claves: `sgl_`. → **Decisión 5: por ahora no entra.**
- [ ] **Launcher (raíz)**: `index.html`, `styles.css` (596 líneas), `flash.js` y `app.js` propios, sprite SVG, tema con
      `IDR_dark` a mano (no `IDRTema`, no sigue en vivo el cambio hecho en otra pestaña) y sin versión visible. No lleva el
      esqueleto (no tiene pestañas), pero para que la base sea la misma debería tomar de `shared/`: `tokens.css` (colores y
      tipografía), la fuente Inter, bootstrap-icons, `idr-tema.js` y `idr-version.js`. → **Decisión 6: toma la base (fase 4).**
- [ ] El launcher **no tiene tarjeta de SGL** (enlaza SGC, SGI, SGR, SGP y SGM deshabilitada): a SGL solo se llega por URL.
      Queda así mientras SGL esté fuera del porte.

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
      JS solo existen en SGC. En SGR y SGI el panel no se puede plegar ni mover. → **Decisión 7: es base de todas (fase 2.5).**
- [ ] **Transición de cambio de pestaña**: la de SGC está en su propio JS y CSS; SGR y SGI usan otra (`_animarMutacion`).
      → **Decisión 8: la de SGC es base de todas (fase 2.5).**
- [ ] **Avisos (toast)**: `toast.css` es común, pero `mostrarToast` está escrito tres veces (`SGC/js/comun.js`, `SGR/app.js`,
      `SGI/app.js`) y el `#toast` de SGC no lleva `role="status"` ni `aria-live`. → `shared/ui/js/toast.js`.
- [ ] **«Volver arriba»**: CSS común, JS repetido en las tres apps, y `sgr.css` y `sgi.css` vuelven a definir `.btn-scroll-top`.
- [ ] **Barra superior**: SGC tiene el menú ⚙ (`#menu-config`: listar, tema, ayuda y atajos) y `#last-update`; SGR y SGI tienen
      `.navbar-acciones` (deshacer, rehacer, instalar). → **Decisiones 9, 10 y 11: la misma barra en todos** — el menú ⚙
      como en SGC (solo escritorio; en móvil, sus opciones en Ajustes) más deshacer y rehacer, que SGC implementa de verdad
      (hoy no tiene `#btn-undo`/`#btn-redo` ni historial). Pasos 6 y 6b de la sección 8.
- [ ] **Ajustes**: las secciones cambian de app en app. Mínimo común a exigir: *Apariencia* (`#btn-theme`, `#btn-movimiento`),
      *Datos* (exportar, importar, restablecer), *Sincronización* y la versión (`data-idr-version`). La ayuda de atajos está en un
      modal en SGC, en Ajustes en SGI y no existe en SGR.
- [ ] **Buscador**: el filtro de campos (`#searchFilterBtn`, `#search-filter-menu`) es opcional (SGI no lo tiene); `#search-clear`
      sí está en las tres. Anotarlo en la lista de ids de la sección 3 como «obligatorios» y «opcionales».
- [ ] **Manifiestos**: `theme_color` es `#1f2937` en todos menos SGP (`#ea580c`). Unificar al portar SGP.
- [ ] **Service Workers viejos por app**: `SGR/sw.js`, `SGI/sw.js`, `SGP/sw.js` y `SGL/sw.js` siguen en el repo (se
      desregistran solos; no están en el precache) aunque `CLAUDE.md` dice que no hay un `sw.js` por app. Decidir cuándo se
      borran (cuando ya no queden instalaciones viejas) o anotar en `CLAUDE.md` por qué siguen.

### 6.3 Repetido entre SGR y SGI (pasarlo a `shared/ui/` antes de que SGP haga la tercera copia)
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

**Siguiente paso: fase 2.5 (unificar la base)**, con las decisiones 5 a 11 ya tomadas (queda un detalle menor por consultar: qué acciones propias lleva el menú ⚙ en SGR y SGI, paso 6). Después SGP, que se porta sobre la base ya unificada (con panel plegable, transición de pestañas y
barra superior con deshacer/rehacer desde el primer día), y por último el launcher (fase 4).

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

---

## 8. Guía de ejecución de la fase 2.5 (para quien la retome)

Escrita el 2026-11-11 después de leer el código; **los números de línea son de ese día** (commit `4c193aa`): buscar por
nombre de función si se corrieron. Leer antes `CLAUDE.md` (raíz), `SGC/CLAUDE.md`, `SGR/CLAUDE.md`, `SGI/CLAUDE.md` y la
sección 3 de este documento.

### 8.0 Reglas que valen para todos los pasos
- **Un paso = un commit**, en este orden (cada uno deja la suite en verde). Prefijo `Suite y SGC: ...` o
  `Suite, SGC, SGR y SGI: ...`; en español; **sin push**.
- Después de cada paso: archivo nuevo/borrado/renombrado → `PRECACHE_URLS` de `sw.js` (a mano); `npm run release`;
  `npm test`; `npm run test:sgc`; `node tests/e2e/humo-apps.mjs`; y desde `SGC/`: `node tests/e2e/humo.mjs`.
- **SGC no puede cambiar a la vista ni perder preferencias guardadas** (salvo la barra superior del paso 6). Sus claves
  de `localStorage` (`sgc2/...`) no se renombran.
- Normas de `shared/ui/js/` (las vigila `tests/estilo.test.mjs`): máximo 500 líneas por archivo; sin `innerHTML`,
  `outerHTML`, `insertAdjacentHTML`, `eval` ni `new Function`; la lógica que se pueda probar va en un bloque
  `// ==== NOMBRE PURO BEGIN ====` … `// ==== NOMBRE PURO END ====` sin `document`, `localStorage`, `navigator` ni
  `fetch`, y se prueba con `tests/_bloque.mjs` (`cargarBloque`). Ejemplo: `shared/ui/js/arranque.js` y su test en
  `tests/estilo.test.mjs`.
- Normas de `shared/ui/*.css`: dentro de `@layer`, sin `!important`, cada selector en un solo lugar, y toda clase tiene
  que usarla al menos una app portada (test de CSS muerto). Al mover una regla, **borrarla del origen** en el mismo commit.
- Al mover una función de SGC a `shared/`, SGC tiene tests propios que leen bloques por marcador y archivo
  (`SGC/tests/js/*.test.mjs`, p. ej. `preferencias.test.mjs`, `arquitectura.test.mjs`): actualizar la ruta del bloque en
  esos tests o mover el test a `tests/` de la raíz; no borrar cobertura.
- Los scripts son globales clásicos (sin módulos): lo compartido se carga con `<script>` **antes** de lo que lo usa y
  expone funciones globales o un objeto (`UI`, `MM`, `IDRTema`...). CSP `script-src 'self'`: nada inline.
- No tocar SGP ni SGL en esta fase. No convertir plantillas `innerHTML` de SGR/SGI (decisión 4).

### Paso 1 — `<head>` de referencia
Hoy cada app tiene el suyo (detalle en 6.2). Dejar en SGC, SGR y SGI, en este orden, exactamente:
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' …; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>SGx</title>
<link rel="icon" …> <link rel="manifest" href="manifest.json">
<script src="../shared/idr-tema.js"></script> <script src="../shared/idr-version.js"></script>
<script src="../shared/idr-atras.js"></script> <script src="../shared/ui/js/arranque.js" data-prefijo="…" data-tema="…"></script>
<!-- hojas, en el orden de la sección 3 -->
```
- `connect-src` es lo único de la CSP que cambia por app (cada una conserva sus orígenes actuales). Se quitan
  `font-src data:`, `frame-ancestors` y `upgrade-insecure-requests` (los dos últimos no tienen efecto en un `<meta>`).
  **Verificar antes** que ninguna app use fuentes `data:` (`grep -rn "url(data:font\|url(\"data:font" SGR SGI shared`).
- `viewport-fit=cover` en SGC cambia el alto de la barra móvil en teléfonos con muesca (pasa a respetar
  `env(safe-area-inset-bottom)`, como SGR y SGI): es el cambio buscado.
- Los `?v=` de SGC se pueden dejar (no molestan); no agregarlos en las otras.
- El script de arranque de SGC sigue siendo `js/preload.js` hasta el paso 2.
- **Test nuevo** en `tests/estilo.test.mjs`: para cada app de `APPS_PORTADAS`, las metas de arriba presentes y con ese
  contenido, y la CSP igual a la base salvo `connect-src`.

### Paso 2 — un solo arranque de tema y «reducir animaciones»
- Hoy: SGR/SGI usan `shared/ui/js/arranque.js` (en `<head>`) + `shared/ui/js/apariencia.js` (al final). SGC usa
  `SGC/js/preload.js` (tema, `data-cargando`, posición y plegado del panel, privacidad, pestaña recordada),
  `SGC/js/tema-suite.js` e `initTheme` (`SGC/js/app.js:17`), y guarda «reducir animaciones» con
  `CLAVE_MOVIMIENTO_REDUCIDO` (`SGC/js/app.js:~232`, `movimientoReducidoActivo` en `SGC/js/comun.js:38`).
- Hacer: que `arranque.js` acepte por atributos lo que SGC necesita distinto: `data-tema="dark"` (SGC es oscuro por
  defecto), la clave propia de tema de respaldo (`sgc2/theme`, la vigila `tests/tema.test.mjs`) y la clave/valores de
  movimiento de SGC (SGC guarda `sgc2/cctv:movimiento_reducido` = `'1'`/`'0'`, `SGC/js/comun.js:37`; `arranque.js` espera
  `<prefijo>movimiento` = `'reducido'`/`'normal'`). Opción recomendada: atributos `data-clave-movimiento` y
  `data-valor-reducido` con los valores por defecto actuales, así ninguna app migra datos.
- SGC carga `arranque.js` y después `preload.js`, que queda **solo** con lo propio (`data-cargando`, privacidad,
  `preload-tab`; el panel sale en el paso 5). `apariencia.js` reemplaza los manejadores de `#btn-theme` y
  `#btn-movimiento` de `app.js` y a `tema-suite.js` (borrarlo y sacarlo de `sw.js`). SGC tiene además `#btn-theme-menu`
  en el menú ⚙: que `apariencia.js` acepte más de un disparador de tema (p. ej. `[data-idr-tema-alternar]`) y emita
  `idr:tema`, y que SGC escuche ese evento para lo que hoy hace `initTheme` de más (ícono del menú, `theme-transition`).
- Aceptación: en SGC el tema y «reducir animaciones» se conservan al recargar sin parpadeo; cambiar el tema en SGR lo
  cambia en SGC abierta en otra pestaña; `tests/tema.test.mjs` en verde (actualizar su lista de archivos por app).

### Paso 3 — avisos y «volver arriba»
- **Toast**: tres copias — `SGC/js/comun.js:331` (`mostrarToast(mensaje, tipo, duracion, accion)`: 4.º argumento = botón de
  acción), `SGR/app.js:266` y `SGI/app.js:598` (`mostrarToast(mensaje, tipo, duracion, detalle)` + `toast(msg, tipo…)` +
  cola `_flushToast`, `_cerrarToastActual`, `_habilitarInteraccionToast`). **Comparar las tres antes de unificar**: las
  firmas difieren en el 4.º argumento. Crear `shared/ui/js/toast.js` con una sola `mostrarToast` que cubra las dos
  variantes (p. ej. 4.º argumento objeto `{ accion, detalle }`, aceptando también las formas viejas) y `toast` como alias;
  borrar las copias. Marcado único: `<div id="toast" class="toast" role="status" aria-live="polite"></div>` (a SGC le
  faltan `role` y `aria-live`). Solo `textContent`.
- **Volver arriba**: `SGC/js/produccion.js:~1649`, `SGR/app.js:~2603` y `2824`, `SGI/app.js:~3116` y `4020`. Crear
  `shared/ui/js/volver-arriba.js` (muestra `#btn-scroll-top` con `.show` al bajar, sube con scroll suave, respeta
  «reducir animaciones»); borrar las copias y las reglas `.btn-scroll-top` de `SGR/css/sgr.css:~1894` y
  `SGI/css/sgi.css:~1666` (si agregan algo real, pasarlo a `esqueleto.css`). Marcado único (el de SGR).
- Cargar los dos scripts en las tres apps después de `ui.js`; agregarlos a `sw.js`.

### Paso 4 — transición de cambio de pestaña (decisión 8)
- Origen: `SGC/js/animaciones.js` (809 líneas). El manejador de `ui:pestana-mostrar` está cerca de la línea 540–640; la
  rama «Pestañas principales: deslizamiento» (~582–607) clona el panel saliente (`clonarAcotado`, bloque
  `CLON ACOTADO PURO`, línea 455), le pone `.slide-pestana-saliente` y lo anima con Web Animations; el entrante se
  anima en `ui:pestana-mostrada` (~640 en adelante). Usa `prefiereMovimientoReducido` (18), `fijarAlturaAnimable` (74),
  `_liberarDeslizePrincipal` (505), el bloque `DESLIZE POSICION PURO` (431), `DUR_ANIM_MS`, `EASING_DESLIZE`,
  `MAX_NODOS_CLON_PESTANA`. CSS: `.slide-pestana-saliente` en `SGC/css/app/animaciones.css:131`.
- En el mismo manejador hay otras ramas que **son de SGC y se quedan**: subpestañas de Auditoría
  (`_slideSubtabsPendiente`, `.slide-subtabs-wrapper`) y el fantasma genérico con `CLASES_MUTACION`.
- Hacer: `shared/ui/js/transicion-pestanas.js` con solo el deslizamiento de las pestañas principales
  (`#v-pills-tab` → paneles de `#v-pills-tabContent`), escuchando los eventos de `UI.pestana` (`shared/ui/js/ui.js:218–250`:
  `ui:pestana-ocultar` → `ui:pestana-mostrar` → `ui:pestana-oculta` → `ui:pestana-mostrada`, con `detail.relacionado`).
  Lleva consigo los bloques puros que necesita (con sus tests). «Reducir animaciones» = `html[data-movimiento="reducido"]`
  o `prefers-reduced-motion` → sin animación. La regla `.slide-pestana-saliente` pasa a
  `shared/ui/componentes/transiciones.css`.
- SGC: `animaciones.js` deja de tratar las pestañas principales (conserva el resto) y carga el script común.
  El eje del deslizamiento lo decide `_ejeDeslizePestanas` (`animaciones.js:498`; `_keyframeDeslizar` en 502): leerla y
  llevarla tal cual, porque depende de dónde está el panel (paso 5) y del ancho de pantalla.
- SGR y SGI: cargar el script; revisar `switchTab` (`SGR/app.js:461`, `SGI/app.js:1426`) y `_alMostrarPestana`
  (`SGR/app.js:472`, `SGI/app.js:1438`) para que no animen por su cuenta el cambio de pestaña. `_animarMutacion`
  (`SGR/app.js:412`, `SGI/app.js:167`) **se queda**: SGI la usa para otras cosas (líneas ~2050 y 2093).
- Coordinar con `shared/ui/js/swipe-pestanas.js` (el swipe en móvil dispara el mismo cambio): probar que no se anime dos veces.
- Aceptación: en las tres apps el panel saliente desliza y el entrante entra desde el lado correcto según el orden de
  las pestañas; con «reducir animaciones» el cambio es instantáneo; el contenedor no salta de alto.

### Paso 5 — panel plegable y personalizable (decisión 7)
- Origen, todo en SGC:
  - Lógica pura: `SGC/js/app.js` bloque `PANEL LATERAL PURO` (997–1197: `panelLateralTransicion` 1000,
    `posicionPanelValida` 1120, `zonaPanelDestino` 1125, `iconoTogglePanel` 1132, `panelDesborda` 1179) y
    `ALTO PANEL LATERAL PURO` (1199–1207). Tienen tests en `SGC/tests/js/` (buscar por el nombre del marcador).
  - DOM: `ajustarAltoPanelLateral` (1211), `pintarPanelLateral` (1245), `posicionPanelActual`,
    `ubicarPanelEnEncabezado`, `ajustarEtiquetasPanel`, `fijarPosicionPanel`, `inicializarReubicarPanelLateral`,
    `panelLateral(evento)` (~1280–1405), e `inicializarPanelLateral` en `SGC/js/resumen.js:1147`.
  - Claves: `CLAVE_PANEL_LATERAL = 'cctv:sidebar_collapsed'` (`'1'/'0'`) y `CLAVE_POSICION_PANEL =
    'cctv:sidebar_posicion'` (`left|right|top|bottom`), siempre con el prefijo `sgc2/` (`storage` de `comun.js:10`).
  - Antes de pintar: `SGC/js/preload.js` (pone `data-panel-pos` y `data-panel-colapsado` en `<html>` y la clase
    `sidebar-collapsed` apenas existe `#sidebar-col`).
  - CSS: plegado en `shared/ui/esqueleto.css:94–193` (ya común); posición y arrastre en
    `SGC/css/app/estructura.css:95–365` (`html[data-panel-pos=…]`, `.sidebar-etiquetas-ocultas`, `.sidebar-tip*`,
    `.panel-destino`, `body.panel-reubicando`); además `shared/ui/componentes/botones.css:320` (`#btn-toggle-sidebar`).
  - Marcado: `SGC/index.html:232–240` (`.sidebar-bottom` con `#btn-toggle-sidebar`, texto «Ocultar / Mover», dentro de
    `.sidebar-sticky`, después de `.sidebar-top`).
  - Dependencias en `SGC/js/comun.js`: `uiArrastreLargo` (1598, pulsación larga + arrastre), `uiAnimarReubicacion`
    (1092), `uiNodo` (946), `storage`; y `actualizarAlturaNavbar` (`SGC/js/produccion.js:1617`).
- Hacer:
  1. `shared/ui/js/panel.js` (≤ 500 líneas; si no entra, partir en `panel.js` y `panel-mover.js`): los dos bloques
     puros + el DOM de arriba. Configuración por app sin tocar código: lee el prefijo de `<html data-idr-prefijo>` (lo
     deja `arranque.js`) y usa `<prefijo>panel_colapsado` y `<prefijo>panel_posicion`; SGC pasa sus claves actuales por
     atributos del `<script>` (`data-clave-colapsado="sgc2/cctv:sidebar_collapsed"`,
     `data-clave-posicion="sgc2/cctv:sidebar_posicion"`) para **no perder lo guardado**.
  2. Las dependencias genéricas (`uiArrastreLargo`, `uiAnimarReubicacion`, `uiNodo`) hoy solo existen en SGC: moverlas a
     `shared/ui/js/` (p. ej. `gestos.js`) y que SGC las tome de ahí, **o** dar a `panel.js` una versión mínima propia.
     Recomendado: moverlas (SGC las usa en más lugares; siguen siendo globales con el mismo nombre). Ojo con
     `SGC/js/arrastre-tactil.js` (cancela el scroll durante `html.arrastrando-largo`): va junto.
  3. Lo de `preload.js` del panel pasa a `arranque.js` (con las mismas claves configurables), así ninguna app parpadea.
  4. CSS de posición y arrastre: de `SGC/css/app/estructura.css` a `shared/ui/esqueleto.css` (o a un
     `shared/ui/panel.css` nuevo, cargado después de `esqueleto.css` en las tres apps y agregado a `sw.js` y al orden que
     exige `tests/estilo.test.mjs`). En SGC queda solo lo que nombra cosas de SGC (`#menu-config`, `#last-update`,
     `html.modo-kiosco`, `.stock-seleccion-banner` de `activos.css:164`).
  5. `ubicarPanelEnEncabezado` usa `#menu-config` para ubicar el botón cuando el panel va arriba: cambiarlo por
     `.navbar-acciones` (la barra única del paso 6) con respaldo si no existe.
  6. Agregar el bloque `.sidebar-bottom` + `#btn-toggle-sidebar` al panel de `SGR/index.html` y `SGI/index.html`
     (mismo marcado que SGC) y cargar `panel.js`.
  7. `panelLateral(evento)` recibe tres eventos: `'alternar'` (clic en el botón, `resumen.js:1157`), `'buscar'` (al
     enfocar o usar el buscador con el panel plegado se expande solo: `resumen.js:1163` y varias llamadas en
     `app.js:1845–2118`) y `'limpiar'` (`app.js:1518`: vuelve a plegarse si se había expandido solo). La regla está en
     `panelLateralTransicion`. En `panel.js` exponer esa función (p. ej. `IDRPanel.evento('buscar')`) y enganchar
     `'buscar'` al foco de `#global-search` y `'limpiar'` a `#search-clear` de forma genérica; las llamadas propias de la
     búsqueda de SGC siguen en SGC, llamando a la API común.
- Móvil (< 768 px): el panel es la barra de abajo; plegar y mover no aplican (ya lo resuelve el CSS y `escritorio()`).
- Aceptación (en SGC, SGR y SGI, escritorio): plegar/mostrar con el botón; mantener presionado y arrastrar muestra la
  franja de destino y muda el panel a izquierda/derecha/arriba/abajo; `Alt` + flechas hace lo mismo; `Escape` cancela;
  recargar conserva plegado y posición sin parpadeo; con el panel arriba o abajo las etiquetas se ocultan si no entran;
  «volver arriba» y lo flotante no quedan tapados. En SGC, un usuario con el panel ya plegado/movido lo encuentra igual.

### Paso 6 — barra superior única (decisiones 9 y 11)
- Hoy: SGC (`SGC/index.html:~59–105`): marca + `#last-update` + menú ⚙ `#menu-config` (Listar, `#btn-theme-menu`,
  `#btn-atajos`); los dos últimos llevan `solo-escritorio` (`shared/ui/utilidades.css:~689`): **en móvil no se ven** y lo
  que ofrecen está en la pestaña Ajustes (SGC tiene ahí una sección `solo-movil`, «Herramientas», `SGC/index.html:~712`).
  SGR (`SGR/index.html:~59–72`) y SGI: marca + `.navbar-acciones` con `#btn-undo`, `#btn-redo` (SGI suma
  `#btn-install-app`, oculto hasta `beforeinstallprompt`); no tienen menú ⚙.
- **Barra de referencia** (anotarla en la sección 3 al hacerla). De izquierda a derecha:
  ```html
  <nav class="navbar navbar-expand-lg shadow-sm"><div class="container-fluid">
    <span class="navbar-brand mb-0 h1"><a href="../index.html" class="brand-launcher" title="Ir a la página principal"
        aria-label="Ir a la página principal"><i class="bi bi-ICONO text-primary"></i></a>SGx</span>
    <div class="d-flex align-items-center gap-2 navbar-acciones">
      <!-- (opcional, propio de la app, solo-escritorio: p. ej. #last-update de SGC) -->
      <button … id="btn-install-app" hidden>…</button>
      <button … id="btn-undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled>…</button>
      <button … id="btn-redo" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled>…</button>
      <div class="dropdown solo-escritorio" id="menu-config"> … menú ⚙, marcado de SGC … </div>
    </div></div></nav>
  ```
  - El **menú ⚙** usa el marcado y el comportamiento de SGC (`data-ui-toggle="dropdown"`, `UI.desplegable`). Opciones
    comunes a todas las apps: **Modo oscuro** (`#btn-theme-menu`; lo maneja `apariencia.js`, paso 2) y **Ayuda y atajos**
    si la app tiene esa ayuda (SGC: modal `#modal-atajos`; SGI: hoy en Ajustes > Ayuda → abrirla desde el menú; SGR: no
    tiene, se omite). Cada app agrega arriba sus acciones propias (SGC: «Listar»; SGR y SGI: pocas, las de uso frecuente
    que hoy tienen en Ajustes, p. ej. exportar/importar). *(Qué acciones propias lleva el menú en SGR y SGI no lo definió
    el usuario: proponerle una lista corta antes de implementarlo.)*
  - **Móvil (< 768 px), como SGC**: el menú ⚙ y los extras `solo-escritorio` no se muestran; **toda opción del menú tiene
    que existir también en la pestaña Ajustes** (regla a anotar en la sección 3 y a vigilar con un test). Deshacer y
    rehacer **sí** se ven en móvil (como hoy en SGR/SGI; la marca va centrada: `shared/ui/esqueleto.css:~270–293` y
    `navegacion.css`).
  - `#btn-install-app`: su manejador hoy está solo en `SGI/app.js` (`beforeinstallprompt`): pasarlo a
    `shared/ui/js/instalar.js` y cargarlo en las tres.
- En SGC: envolver lo de la derecha en `.navbar-acciones`, agregar `#btn-undo` y `#btn-redo` (se conectan en el paso 6b;
  hasta entonces quedan `disabled`). Revisar `ubicarPanelEnEncabezado` (paso 5), `html.modo-kiosco #menu-config`
  (`SGC/css/app/estructura.css:~387`) y `actualizarAlturaNavbar`.
- En SGR y SGI: agregar `#menu-config` con el marcado de SGC.
- Test en `tests/estilo.test.mjs`: en cada app portada, `.brand-launcher`, `.navbar-acciones`, `#btn-undo`, `#btn-redo`,
  `#menu-config` con `solo-escritorio` y `#btn-theme-menu` dentro.
- Aceptación: la barra se ve igual en SGC, SGR y SGI en escritorio (misma altura, mismo orden, mismo menú) y en móvil
  (marca centrada, deshacer/rehacer, sin menú ⚙); el panel en posición «arriba» sigue entrando en la barra.

### Paso 6b — deshacer/rehacer en SGC (decisión 10; función nueva)
Es la única parte de esta fase que agrega comportamiento. Va en su propio commit (`SGC: deshacer y rehacer`), con tests.
- **Modelo a imitar**: `historial` de `SGR/app.js:152–184` (igual en `SGI/app.js:408`): dos pilas (`_pasado`, `_futuro`)
  de hasta 30 copias del estado con una etiqueta; `empujar(label)` antes de cada cambio, `undo()`, `redo()`; habilita o
  deshabilita los botones; avisa «Deshecho: …» / «Rehecho: …». Atajos `Ctrl+Z` / `Ctrl+Y` (`SGR/app.js:~2584`,
  `SGI/app.js:~2990`).
- **Dónde engancharlo en SGC**: todos los datos pasan por `SGC/js/api-local.js` (`ApiLocal`): una sola clave
  (`sgc2/datos_v1`), `escribir(fn)` (línea ~59) trabaja sobre una copia y `guardar(nuevos)` (~44) persiste y emite
  `sgc:datos-cambiados`, con el que las pestañas ya se redibujan. Ese es el punto natural: antes de guardar, apilar el
  estado anterior; deshacer = guardar el estado apilado por el mismo camino (así se redibuja todo solo).
  **Leer `api-local.js` y `datos-puro.js` enteros antes de diseñarlo**; lo que sigue es una propuesta, no código probado.
- **Diseño propuesto**: `SGC/js/historial.js` (cargado después de `api-local.js`) con un bloque
  `// ==== HISTORIAL PURO BEGIN/END ====` (las dos pilas como funciones puras: `empujar`, `deshacer`, `rehacer`, tope 30,
  un cambio nuevo vacía el futuro) y una capa fina que lo conecta a `ApiLocal`, a los botones y al teclado. Etiqueta de
  cada entrada: derivarla de la operación que llega a `ApiLocal.pedir` (p. ej. «Alta de dispositivo», «Edición»,
  «Baja»). El historial vive en memoria (se pierde al recargar, como en SGR y SGI).
- **Puntos delicados (resolver y dejar anotado en `SGC/CLAUDE.md`)**:
  - **Sincronización con Gist** (`SGC/js/gist.js`): según su cabecera, la fusión usa lápidas (borrados). Deshacer no
    puede restaurar una copia vieja «tal cual» si eso hace que la fusión la descarte o vuelva a borrar lo recuperado: lo
    deshecho tiene que quedar como un cambio **nuevo**. Leer cómo fusionan `gist.js` y `datos-puro.js` y cubrirlo con un test.
  - **Qué NO entra en el historial**: importar, restablecer, lo que llega de una sincronización o de otra pestaña
    (evento `storage`) y las preferencias del dispositivo (panel, tema, privacidad). Importar, restablecer y sincronizar
    **vacían** el historial.
  - **Otra pestaña abierta**: si los datos cambian por fuera, el historial de esta pestaña queda viejo → vaciarlo.
  - **Modo kiosco** (`SGC/js/sesion-local.js`): ver si restringe escrituras; si es así, botones deshabilitados.
  - Las confirmaciones en dos pasos que ya tiene SGC (`datos-ui.js`, Favoritos) se mantienen.
  - `Ctrl+Z` dentro de un `<input>`/`<textarea>` es el deshacer del navegador: no interceptarlo ahí. Anotar los atajos
    en `ATAJOS` de `SGC/js/atajos.js` (la lista del modal de ayuda es datos).
- **Normas de SGC** (`SGC/CLAUDE.md`, `SGC/tests/js/arquitectura.test.mjs`): tope de líneas por archivo, solo
  `textContent`, bloque puro con su test en `SGC/tests/js/`, archivo nuevo en `sw.js`.
- Aceptación: alta, edición y baja de un dispositivo se deshacen y rehacen con los botones y con el teclado; tablas y
  dashboard se actualizan solos; tras deshacer, un cambio nuevo deshabilita «rehacer»; importar o sincronizar deshabilita
  los dos; con Gist configurado, deshacer una baja y sincronizar no la vuelve a borrar.

### Paso 7 — CSS repetido de SGR y SGI
- Selectores definidos en las dos hojas (`SGR/css/sgr.css`, `SGI/css/sgi.css`): `.empty-state` (+ `.empty-icon`),
  `.card-header`, `.table-wrap`, `.dash-layout`, el botón flotante (FAB) y lo que aparezca al comparar. Procedimiento:
  listar los selectores comunes (el parser `SGC/tests/js/_css.mjs`, `reglas()`, sirve), comparar declaraciones y, si son
  iguales o casi, mover una sola versión a `shared/ui/componentes/` (archivo existente que corresponda — `tarjetas.css`,
  `tablas.css` — o uno nuevo, p. ej. `vacio.css`, `flotante.css`; un archivo nuevo va a `sw.js`, a los `<link>` de las
  **tres** apps y lo exige `tests/estilo.test.mjs`). Si SGC ya tiene un equivalente con otro nombre de clase, usar el de
  SGC y cambiar la clase en SGR/SGI (no crear un segundo componente para lo mismo).
- Las funciones JS repetidas de 6.3 (`confirmar`, `esc`, `normalizarTexto`, `uid`, exportar/importar, firma) **no** son
  de esta fase salvo el toast: quedan anotadas para cuando se partan los `app.js`.

### Paso 8 — tests y cierre
- `tests/estilo.test.mjs`, para cada app de `APPS_PORTADAS`: los scripts nuevos (`arranque.js`, `apariencia.js`,
  `toast.js`, `volver-arriba.js`, `transicion-pestanas.js`, `panel.js`, `instalar.js`); los ids `btn-theme`, `btn-movimiento`, `toast`
  (con `role="status"`), `btn-scroll-top`, `search-clear`, `btn-toggle-sidebar`, `btn-undo`, `btn-redo`, `menu-config`, `btn-theme-menu`; `.brand-launcher`
  con `href="../index.html"`; el `<head>` del paso 1. `mm.js` solo se exige a las apps que usan `MM` (SGR, SGI; SGC no).
- Manifiestos de las apps portadas con los mismos `theme_color`, `background_color`, `display` y `orientation`.
- `tests/e2e/humo-apps.mjs` (y `SGC/tests/e2e/humo.mjs`): plegar el panel, cambiar de posición, recargar y comprobar que
  se conserva; cambiar de pestaña; mostrar un toast.
- Verificación visual (no hay herramienta en el repo; ver «Herramientas» en la sección 7): escritorio claro y oscuro,
  móvil, panel en las cuatro posiciones, en las tres apps.
- Al terminar: marcar los pasos en la fase 2.5 (sección 4) y los puntos de 6.2/6.3/6.4; actualizar la sección 3 (árbol de
  `shared/ui/`, lista de ids, receta de una app portada, marcado de la barra y del `<head>`), `CLAUDE.md` de la raíz
  (regla nueva: panel, transición y barra son de la suite) y los `CLAUDE.md` de SGC, SGR y SGI; y `SGC/docs/ARQUITECTURA.md`
  si nombra los archivos movidos.

### 8.9 Después de la fase 2.5
SGP (sección 7, «Falta: fase 3») ya sobre la base unificada: su receta incluye `panel.js`, `transicion-pestanas.js`,
`toast.js`, `volver-arriba.js`, la barra única (menú ⚙ y deshacer/rehacer; SGP ya tiene deshacer en su `app.js`) y el `<head>` de referencia desde el primer día. Luego el launcher (fase 4).
