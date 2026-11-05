# SGC-2 — análisis de implementación

Objetivo: una versión **estática** (GitHub Pages, sin backend) del front de `cctv_monitor`, con los datos en un JSON
(localStorage) sincronizable con un **GitHub Gist**, igual que `idr/SGC`. Cuando esté completa reemplaza a `idr/SGC`.

Fecha: 2026-11-05. Estado: **entregas 1 a 5 hechas** (ver §9 y §12–§16); falta la 6 (convivencia y reemplazo).

---

## 1. Qué se toma de cada proyecto

| De `cctv_monitor` (front) | De `idr/SGC` |
|---|---|
| `ui.js` (pestañas/modales/desplegables propios), CSS propio `static/css/` (sin Bootstrap) | `GistSync`: token, Gist ID, autosync, `_leerGist` (con `RAW_HOST` para > 1 MB), leer antes de subir (B7) |
| `comun.js` (bloques `UI COMUN`, `FECHAS Y CSV PURO`, `preferencias`, toast) | Lápidas `eliminados` + `updatedAt` por entidad + `_mergeCampos`/`_modoMerge` |
| Stock: `stock.js`, `stock-puro.js`, `stock-listar.js`, `stock-catalogos.js`, `stock-seleccion.js`, `stock-alta-lote.js` | Firma del contenido (verificación de integridad) |
| Producción: `produccion.js` (`modeloProduccion` → `construirProduccion`), `produccion-seleccion.js` | **Parseador de canales** (`cctv_online.json` → grabadores/canales, 3 pasos) |
| `resumen.js` (panel Estado, sin Monitoreo/Alertas/Disponibilidad), `favoritos.js`, `busqueda.js` | **Parseador de datos** (MAC → serie/firmware/modelo, y «nuevos») |
| `atajos.js`, `privacidad.js`, `ajustes.js`, `selector.js`, `animaciones.js`, `preload.js` | Historial deshacer/rehacer (Ctrl+Z), export/import JSON, manifest/PWA de la suite |
| Imágenes `static/img/devices/`, `vendor/bootstrap-icons` + fuentes | `shared/idr-infra.js` (edificios compartidos de la suite) |
| Reglas del stock (`cctv/stock.py`) **portadas a JS puro** | CSP en `<meta>` con `connect-src` a `api.github.com` y `gist.githubusercontent.com` |

La base es el front de cctv_monitor (más nuevo, probado, sin `innerHTML`, CSP estricta). De SGC se trae solo la
sincronización y los parseadores, **reescritos** sobre las funciones puras del stock (no copiados con sus bugs:
B13, B14, B21, S7 del `ROADMAP.md` de SGC).

## 2. Qué se quita

**Todo el backend**: `cctv/` (Python), `web/` (FastAPI), simulador, CLI, `iniciar.py`, tests de Python y mutación.

**Del front:**
- Login, sesiones, roles, kiosco, clave temporal (`sesion.js`, `data-rol-minimo`). Sin servidor no hay a quién
  autenticar: quien tiene el token del Gist escribe; sin token, solo baja (lectura).
- Panel Estado: **Monitoreo** (KPI + gráficos), **Alertas**, **Disponibilidad**, banner de red del host (`red-host.js`).
  Quedan: Favoritos, Canales (capacidad usada/total por grabador, ahora con los datos manuales) y Activos.
- Pestaña **Auditoría** completa (logs del sistema, logs de NVR, dispositivos/grabador/cámara, video, disponibilidad).
  Ver pregunta P3 por «Base de datos» (historial del stock).
- Escaneo, escaneo dirigido, capturas (snapshots), video en vivo, notificaciones de escritorio, sonido de alertas,
  reiniciar monitor, conciliación contra `/api/...` (reemplazada por los parseadores sobre un archivo local).
- Ajustes: secciones **Monitoreo** y **Alertas**. Quedan Apariencia, Comportamiento, Stock, Privacidad, Apartados.
  Se agrega **Sincronización** (Gist), **Parseadores** y **Datos** (exportar/importar JSON, migrar desde SGC).
- En Producción y en las fichas: estado online/offline, «sin relevar», «sin señal», captura, «Ir al grabador»,
  gráfico de disponibilidad. Lo que se ve es la **condición** del stock (operativo, revisar, averiado...).
- Preferencias por usuario en el servidor → solo localStorage (la API `preferencias.set/get` se conserva, sin `PUT`).
- Respaldo automático → exportar JSON + el historial de revisiones del propio Gist.

## 3. El cambio de fondo: producción manual

Hoy Producción **sale del escaneo** (`/api/v2/datos`: NVR de `config.toml` + `cctv_online.json`) y la `instalacion`
del stock no sabe en qué grabador ni en qué canal está un equipo. En SGC-2 no hay escaneo: la producción es un dato.

### Modelo propuesto (recomendado)

La instalación es **del dispositivo** y opcionalmente apunta a un canal:

```jsonc
// dispositivo (como el stock de cctv_monitor)
{ "id": "...", "tipo": "domo", "condicion": "operativo", "marca": "", "modelo": "", "serie": null, "mac": null,
  "patrimonio": null, "firmware": null, "canales": null, "comentario": "", "creado": "…Z", "actualizado": "…Z",
  "instalacion": {                      // null = en depósito
    "descripcion": "", "ip": null, "edificio": null, "piso": "", "rack": "", "puerto": "", "comentario": "",
    "grabador": "id-del-NVR" | null,    // null = «Otros dispositivos» (decoder, switch, el propio NVR...)
    "canal": 7 | null,
    "actualizado": "…Z" } }
```

- Un grabador es un dispositivo con `canales` (NVR/DVR). Sus canales 1..N **se derivan**: ocupado = hay una
  instalación con ese `grabador` y `canal`; libre = no. No hay `canales_data` duplicando la descripción/IP.
- Invariantes (en una función pura `validarInstalacion`, como `stock.aplicar_reglas_produccion`):
  `(grabador, canal)` único; `canal` en 1..`canales` del grabador; el grabador existe, está instalado y no se
  apunta a sí mismo; en producción solo `operativo`; IP literal válida; un equipo, un lugar.
- Achicar `canales` de un grabador con canales ocupados por encima → 409 local (se avisa, no se pierde nada).
- Borrar un grabador con cámaras asignadas → se pide confirmar; las cámaras pasan a «Otros» o a depósito.

Ventajas frente al modelo de SGC (`grabadores[].canales_data[]` + `otros_prod[]`): un equipo no puede quedar en dos
canales (B14, B21 de SGC), no hay que «propagar ubicación» (R8), y el merge del Gist es **por dispositivo**, que es lo
que el ROADMAP de SGC dejó pendiente como R7 (dos personas editando canales distintos del mismo grabador ya no se pisan).

### Las dos entradas a producción

1. **Desde el canal** (Producción): cada grabador muestra sus N canales; un canal libre tiene «Asignar» → buscador
   de dispositivos en depósito (combobox único, el R3 de SGC) → formulario de instalación con grabador/canal fijos.
   Un canal ocupado: «Editar instalación», «Mover a otro canal», «Quitar de producción» (vuelve a depósito).
2. **Desde el modal del dispositivo** (Stock): «Poner en producción» / sección Instalación con selector de grabador
   (solo los instalados) y de canal (solo los libres, más el propio) o «Sin grabador». El modal ya tiene los campos
   de instalación: se agregan los dos selectores.

Ambas entradas usan la misma función pura (`ponerEnProduccion(datos, idDispositivo, instalacion)`), que es la que
aplica las invariantes y escribe el historial.

## 4. Capa de datos (reemplaza el servidor)

Hecho en la entrega 1, con un cambio respecto del plan: en vez de un `datos.js` con métodos propios, el navegador
**responde las mismas rutas** que el servidor (`/api/stock*`, `/api/v2/datos`), así `stock.js` y compañía no cambian:

- `js/api-local.js`: enrutador de las rutas de stock (GET/POST/PUT/DELETE, mismos cuerpos y respuestas, mismos
  estados 422/404/409 y los textos de `servicios/stock.py`). `apiFetch` (comun.js) le pasa cada pedido.
- `js/datos-puro.js`: las reglas de `cctv/stock.py` como funciones puras sobre el JSON (validación con todos los
  errores juntos, marca/piso/MAC/IP normalizados, unicidad de serie/MAC/patrimonio, alta en lote todo o nada, cambio
  en lote con simulación, catálogo de grupos y tipos con los de sistema protegidos, edificios y pisos con
  renombrar/unificar, páginas de modelos, historial filtrable, «en producción solo operativo»).
- Cada escritura trabaja sobre una **copia** y solo se guarda si no lanzó (como una transacción). Después avisa con
  `sgc:datos-cambiados` (y en otras pestañas por el evento `storage`, que fuerza a releer).
- Persistencia: `localStorage` `sgc2/datos_v1`; todas las claves llevan el prefijo `sgc2/` (en GitHub Pages la suite
  comparte origen). `version` por dispositivo (bloqueo optimista, 409) + `creado`/`actualizado`.
- Historial dentro del JSON con tope de 2000 cambios; borrar deja la entrada «eliminado» y una lápida en
  `eliminados.dispositivos` (para el merge del Gist, entrega 3).
- `sanearDatos`: todo lo que entra (localStorage, archivo, Gist) se revisa entero; lo que no pasa se descarta o se
  corrige y se informa en `avisos`.
- `/api/v2/datos` se arma desde el stock: los grabadores instalados (`canales` = capacidad). Las cámaras por canal
  llegan con la entrega 2.

## 5. Sincronización con Gist

Se porta `GistSync` de SGC con sus arreglos v1–v3 (B1–B10) y se corrige lo pendiente:

- Merge por dispositivo, catálogo por clave, lápidas en `eliminados` incluidas en la firma (S4 de SGC).
- Token: se recomienda *fine-grained* solo `gist`; opción de **no persistirlo** (solo sesión). Ver P4.
- **Gist secreto ≠ privado** (S3): IPs, MACs y ubicaciones legibles para quien tenga el ID. Ver P4 (cifrado).
- Un solo archivo en el Gist: `sgc2.json` (`formato: "sgc2"`, `version: 1`), distinto del de SGC, para que las dos
  apps puedan convivir durante la transición sin pisarse.

## 6. Parseadores (de SGC, reescritos)

Entrada: el `cctv_online.json` que genera el escáner (Python, fuera de esta app; sigue corriendo donde haya red).

- **Parseador de canales**: paso 1 archivo → paso 2 mapeo NVR del archivo ↔ grabador del stock (por MAC > serie > IP,
  igual que `stock.vincular`; nunca por nombre parcial: B13) con «Crear grabador» (con marca/modelo/MAC del archivo:
  B21) → paso 3 vista previa. Aplica **instalaciones** (grabador+canal, descripción, IP) a los dispositivos que
  matchean por MAC/serie; «sin match» se pueden dar de alta **y quedan asignados al canal** (B21). Modos
  conservar/reemplazar los canales que el archivo no trae. Un equipo que ya está en otro lugar → conflicto visible,
  no se mueve solo.
- **Parseador de datos**: MAC (cualquier separador, varias) → serie/firmware/modelo; nunca pisa con vacío (B4);
  saneado y con largo máximo (S7); `JSON.parse` acotado (`MAX_JSON`).
- Los dos usan la lógica pura de conciliación (`a_produccion`, `diferencias`) portada de `cctv/stock.py`; la
  conciliación actual de la pestaña Stock se reemplaza por ellos.
- Todo cambio de un parseador entra al historial y al deshacer (Ctrl+Z).

## 7. Migración desde SGC (para reemplazarlo)

Port a JS de `cctv/stock_sgc.py` (ya resuelve forma → tipo, estados → condiciones, tipos retirados, nulos):

- `dispositivos[]` → dispositivos; `estado: ''` + en producción → `operativo`.
- `grabadores[].canales_data[]` con `dispositivoId` → `instalacion { grabador, canal, descripcion, ip, edificio, piso,
  rack, puerto, comentario }`; el grabador mismo → su instalación sin grabador.
- `otros_prod[]` → instalación sin grabador.
- Canales con descripción/IP pero **sin dispositivo** → no hay dónde ponerlos en el modelo nuevo: se listan en el
  reporte de migración (o ver P5).
- Varias MACs en un dispositivo (SGC lo permite, el stock no) → la primera queda, las demás al comentario + reporte.
- Duplicados de serie/MAC/patrimonio → reporte, sin perder datos (como hace `stock_sgc`).
- Ensayo primero (vista previa con el reporte), aplicar después.

## 8. Estructura de `SGC-2/`

```
SGC-2/
  index.html            CSP en <meta> (script/style 'self', connect-src GitHub), sin style inline
  manifest.json  icon.svg  icons/
  css/                  copiado de cctv_monitor/static/css/ (+ estilos de los parseadores)
  js/  ui.js comun.js api-local.js datos-puro.js datos-ui.js sesion-local.js (+ gist.js parseador-*.js migrar-sgc.js)
       stock*.js produccion*.js resumen.js favoritos.js busqueda.js atajos.js ajustes.js privacidad.js ...
  img/devices/  vendor/bootstrap-icons/  vendor/fonts/
  tests/                node --test (lógica pura: datos, merge, parseadores, migración) + e2e en jsdom
  README.md  ANALISIS-IMPLEMENTACION.md
```

Al reemplazar a SGC: agregar `SGC-2/` al `sw.js` raíz de la suite, y más tarde renombrar a `SGC/`.

## 9. Entregas

1. ✅ **Esqueleto**: copiar el front, quitar lo de §2, stock en localStorage (alta/edición/borrado, lote,
   catálogos, ubicaciones, modelos, historial, exportar/importar/borrar). Tests node de la lógica pura y prueba de humo.
2. ✅ **Producción manual**: modelo §3, vista por grabador con canales libres, las dos entradas, panel Estado (Canales,
   Activos, Favoritos).
3. ✅ **Gist**: sync + merge + lápidas, cifrado AES-GCM con frase (P4).
4. ✅ **Parseadores** de canales y de datos.
5. ✅ **Migración desde SGC** y `sw.js` de la suite (falta probarla con el JSON real de SGC: no está en este equipo).
6. Reemplazo: período de convivencia, luego `SGC-2` → `SGC`.

## 10. Riesgos

- El stock de cctv_monitor tiene reglas en el servidor que hoy el front da por hechas: hay que portarlas TODAS a JS
  o el JSON puede quedar inconsistente (sobre todo tras un merge del Gist: se revalidan las invariantes después de
  combinar y los conflictos se informan, no se descartan).
- localStorage ~5 MB: con el historial acotado alcanza de sobra para el parque actual.
- Sin servidor, cualquiera con el token escribe todo: no hay roles. Si hacen falta permisos, no es un sitio estático.
- Dos personas editando el mismo dispositivo a la vez: gana la edición más reciente (como en SGC), con aviso.

## 11. Preguntas abiertas

- **P1. Datos iniciales** → migrar desde el **Gist actual de SGC** (§7).
- **P2. Modelo de producción** → **instalación del dispositivo** con grabador+canal (§3).
- **P3. Historial del stock** → **se conserva, acotado** (~2000 cambios en el JSON, lista con filtro y búsqueda).
- **P4. Protección del Gist** → **cifrado AES-GCM con frase** (WebCrypto, clave derivada con PBKDF2 y sal propia del
  Gist). Al estar cifrado, la firma pasa a ser la del propio cifrado: AES-GCM detecta cualquier alteración y cubre
  `eliminados` (resuelve S3 y S4 de SGC).
  - **Frase**: cualquier texto (normalizado a NFC), mínimo 20 caracteres, aviso si parece débil. Botón «Generar
    frase»: 6 palabras al azar (`crypto.getRandomValues`) de una lista en español incluida en la app (~77 bits).
    PBKDF2-SHA-256 con 600 000 iteraciones. No reutilizar contraseñas de otros sistemas (se avisa en el modal).
  - **Guardado**: la frase **se puede guardar en el navegador** (casilla «Recordar en este navegador»; sin marcar,
    vale solo para la sesión). Se avisa que quien use esa PC puede leer los datos. El token sigue el mismo criterio (S2).
  - Frase perdida: el Gist no se puede descifrar; se vuelve a subir desde los datos locales con una frase nueva.

## 12. Entrega 1: lo hecho y lo que quedó para después

- Copiado el front de cctv_monitor a `SGC-2/` con rutas relativas (`js/`, `css/`, `img/`, `vendor/`).
- Quitado: Monitoreo, Alertas y Disponibilidad del panel Estado; la pestaña Auditoría (queda **Historial**, los
  cambios del stock); escaneo, conciliación, capturas (vista «snapshot», «Usar captura» de Favoritos), video en vivo,
  notificaciones, sonido, red del host, login/roles/kiosco (`sesion-local.js`: sin login, rol operador para lo que se
  muestra) y las secciones Monitoreo y Alertas de Ajustes. CSS muerto y variables sin uso, fuera.
- Ajustes > **Datos**: exportar, importar (reemplaza; confirmación en dos pasos) y borrar todo.
- La capacidad de canales de un grabador sale del stock (`canales`), ya no de Auditoría > Grabador.
- Producción muestra cada grabador instalado aunque no tenga cámaras (con sus canales libres): base de la entrega 2.
- Tests: 362 de node (los del front de cctv_monitor que aplican, adaptados, y `datos.test.mjs` nuevo) y
  `tests/e2e/humo.mjs` (la página real en jsdom: alta, edición, 409, producción, historial, exportar/importar).
  Verificado también en Firefox (headless) con datos sembrados.
- Pendiente (entregas siguientes): ~~instalación con grabador+canal y las dos entradas a producción (2)~~ (hecho, §13); Gist cifrado
  (3); parseadores (4); migración desde SGC y `sw.js` de la suite (5). El popup de un equipo todavía calcula las
  acciones de Auditoría/disponibilidad (sin botones): se rehace con «Asignar a canal» en la entrega 2.

## 13. Entrega 2: producción manual

- La instalación de un dispositivo tiene `grabador` (id del NVR/DVR) y `canal`: los dos o ninguno (sin grabador =
  «Otros dispositivos»). Reglas en `datos-puro.js`: el grabador es un NVR/DVR **instalado** y no él mismo; un grabador
  no va en el canal de otro; el canal entra en la capacidad (`canales`; sin cargar, hasta 4096); un canal, un
  dispositivo (409 «canal 3 de «NVR»: ya lo ocupa «Pasillo»»).
- Un grabador con dispositivos en sus canales no sale de producción, no cambia a otro tipo, no baja de `canales` por
  debajo del canal más alto ocupado y no se borra (409, también en el cambio en lote). Mover o liberar los canales
  primero. Sacar una cámara de producción (o cambiarle la condición) libera su canal.
- `/api/v2/datos` arma las cámaras desde las instalaciones con canal (nombre, IP, MAC, modelo, `stock` del
  dispositivo): Producción, Favoritos, la búsqueda y el resumen de Canales las leen sin cambios. Estado = «Operativo»
  (no hay monitoreo: se quitó «Levantado» y el «Estado de conexión» de la ficha).
- **Entrada 1, desde el canal:** en Producción cada grabador muestra sus canales; un clic en uno libre abre «Asignar
  al canal» (`js/produccion-asignar.js`): el stock sin grabadores, primero lo del depósito listo para usar, con
  búsqueda; o «Nuevo dispositivo en este canal». Al elegir se abre la ficha del dispositivo con Instalado, grabador,
  canal y (si no tenía) la ubicación del grabador ya puestos; se guarda con «Guardar».
- **Entrada 2, desde el modal del dispositivo:** en Detalles de instalación, selectores «Grabador (NVR)» (los
  instalados, o «Sin grabador») y «Canal» (cada uno con su ocupante; los ocupados, deshabilitados). Elegir el grabador
  propone el primer canal libre y su edificio/piso si el dispositivo no tenía. Para un grabador no se muestran.
- Lo que entra (archivo, localStorage) se sanea: una asignación rota (grabador inexistente, fuera de rango, repetida)
  queda sin canal y se avisa.
- `stock.js` relee el stock con `sgc:datos-cambiados` (antes solo al abrir la pestaña).
- Tests: 371 de node (reglas de canal, consistencia del grabador, vista, saneo, selector y formulario) y la prueba de
  humo recorre la pantalla: canal libre → elegir → ficha con grabador/canal → guardar → Producción actualizada.
  Visto en Firefox (headless) con un grabador de 8 canales y 3 ocupados.
- Queda para después: el popup de un equipo no tiene todavía «Quitar del canal» / «Mover» directos (se hace desde la
  ficha); dos grabadores con la misma descripción se verían en un mismo grupo de Producción (agrupa por nombre).


## 14. Entrega 3: Gist cifrado

- `js/gist.js`: lógica pura en el bloque `GIST PURO` (cifrado, frase, fusión, validación del sobre) y, debajo, el
  transporte (`fetch` a `api.github.com`) y la pantalla de **Ajustes > Sincronización**.
- **Cifrado**: sobre `{formato:'sgc2-cifrado', version:1, kdf:'PBKDF2-SHA-256', iter:600000, sal, iv, datos}` en
  `sgc2.json`. AES-GCM-256 con la sal del Gist (se reutiliza al subir; el IV es nuevo cada vez) y un AAD fijo. Al
  descifrar se exige `iter` entre 600 000 y 2 000 000 (un Gist ajeno no baja el costo ni lo dispara), sal de 16 bytes e
  IV de 12. Frase equivocada o Gist alterado → un solo mensaje («frase incorrecta o Gist alterado»). Sin firma aparte:
  el GCM cubre todo, lápidas incluidas.
- **Frase**: NFC, mínimo 20 caracteres, aviso si es débil. «Generar frase» hace 5 palabras pronunciables de 3 sílabas
  consonante+vocal (80 sílabas → ≈95 bits, con rechazo de bytes para no sesgar), en vez de una lista de 6 palabras: no
  hace falta incluir un diccionario. Token y frase solo se guardan con «Recordar»; si no, quedan en `sessionStorage`.
- **Fusión** (`gistFusionar`, después de `sanearDatos` a cada lado y otra vez sobre el resultado): por dispositivo gana
  el `actualizado` más reciente (a igual fecha, la `version` mayor; a igual todo, lo local). Lápida ≥ última edición →
  se borra; edición posterior a la lápida → el dispositivo revive. Catálogo, edificios, pisos y páginas de modelo se
  unen (lo local manda; un tipo o edificio borrado en una PC vuelve si la otra lo tiene); el historial se une sin
  repetir. Las invariantes (serie/MAC únicas, canal ocupado) se revalidan: lo que choque se corrige y queda en `avisos`.
- **Flujo** (`sincronizar`): leer el Gist → descifrar → fusionar → guardar local si cambió (`ApiLocal.reemplazar`) →
  subir solo si el resultado difiere de lo bajado (PATCH). Sin token solo baja y avisa que quedan cambios sin subir.
  «Crear Gist nuevo y subir» crea uno **secreto** (con token) y guarda su ID. Archivos grandes: `raw_url` solo si es
  `https://gist.githubusercontent.com`.
- **Automática**: al abrir baja y cada `sgc:datos-cambiados` sube a los 5 s (con token, frase y ID guardados). El
  guardado que hace la propia sincronización no la dispara de nuevo.
- Tests: `tests/js/gist.test.mjs` (12) y la prueba de humo recorre crear → otra PC sube → sincronizar → frase mala,
  con un `fetch` falso de la API de Gists.

## 15. Entrega 4: parseadores

- `js/parseador.js`: bloque `PARSEADOR PURO` + la ventana (Ajustes > Parseadores). Un solo archivo (`cctv_online.json`),
  dos usos; los dos muestran una **vista previa** y recién «Aplicar» escribe (una transacción de `ApiLocal.importacion`,
  historial con origen `importacion` y entra al Ctrl+Z del historial del stock como cualquier cambio).
- Se reusan `crearDispositivo`/`modificarDispositivo`: el archivo no tiene atajos, cada fila pasa por las reglas del
  stock; la que no puede (condición, serie repetida...) queda en el informe y las demás se aplican.
- **Datos**: por MAC → serie, firmware y modelo; nunca pisa con vacío (B4); una serie que ya tiene otro equipo se omite
  y se informa; una MAC con valores distintos en el archivo no se aplica.
- **Canales** (3 pasos en una sola pantalla): el NVR del archivo se vincula al del stock por **MAC > serie > IP** de la
  instalación (nunca por nombre: B13) y se puede cambiar con el selector, ignorar o «dar de alta». Cada cámara se busca
  por MAC > serie y se pone en su canal con descripción e IP del archivo (edificio/piso del grabador si no tenía).
- **Conflictos** (se listan, no se aplican): equipo ya en otro canal, canal ocupado por otro, equipo no operativo, fuera de
  la capacidad, MAC en más de un canal del archivo, canal repetido, equipo que es un grabador, sin MAC ni serie.
- **Altas** (casilla, con tipo a elegir): las cámaras que no están en el stock se crean **ya asignadas al canal** (B21);
  el grabador creado lleva marca/modelo/MAC/serie/firmware del archivo y su capacidad en el escalón siguiente al canal
  máximo. **Conservar/liberar**: «liberar» deja sin canal (conserva el resto de la instalación) a los equipos de los
  canales que el archivo no trae, solo en grabadores que sí trae cámaras.
- Con el `cctv_online.json` real (329 filas, 8 NVR) y un stock vacío: 8 grabadores, 289 altas y 40 filas en conflicto
  (las 22 MAC repetidas y sus canales); sin fallos.
- Tests: `tests/js/parseador.test.mjs` (8) y la prueba de humo (ventana → archivo → vista previa → aplicar).

## 16. Entrega 5: migración desde SGC y `sw.js`

- `js/migrar-sgc.js`: bloque `MIGRAR SGC PURO` (conversión, firma) + ventana en Ajustes > Datos > **Migrar desde SGC**. Acepta
  la exportación de SGC o el archivo de su Gist (misma forma). **Ensayo primero**: la vista previa cuenta lo que entra,
  lista los avisos y los canales sin equipo, y recién «Aplicar» escribe. Modo **Unir** (por equipo gana la edición más
  reciente, con `gistFusionar`; sirve para repetir la migración durante la convivencia) o **Reemplazar**.
- Conversión (port de `cctv/stock_sgc.py` al modelo nuevo): `estado ''` → operativo; `forma` de la cámara → su tipo;
  `software` → otro; `tiposCustom` → catálogo; cada **grabador** queda instalado con su ubicación y sus `canales_data`
  con equipo pasan a `instalacion {grabador, canal, descripcion, ip, puerto, edificio, piso, rack}`; `otros_prod` →
  instalación sin grabador. Un grabador sin dispositivo se vincula al NVR/DVR del stock que tiene su MAC o, si no hay,
  se crea uno con su marca/modelo/MAC. Capacidad = la mayor entre el dispositivo y `canales_n`.
- Nada se pierde sin avisar: MAC adicionales, MAC/serie/patrimonio repetidos y puertos con formato no válido pasan al
  comentario; un equipo en dos canales conserva el primero; dos equipos en el mismo canal, el primero. Los canales con
  descripción/IP pero sin equipo no tienen dónde ir (P5): se listan en el informe. Las lápidas de dispositivos de SGC se
  conservan; las de grabadores y «otros» no (ya no son entidades).
- **Firma**: `migFirmaSgc` reproduce `generarFirma` de SGC (verificada contra `firma_sgc` de `cctv/stock_sgc.py` con un
  hash fijo en el test). Si no coincide, hay que tildar «Aplicar igual».
- **`sw.js` de la suite**: precache de SGC-2 (html, js, css, vendor; las fotos de modelos se guardan al verlas), caché
  `261105.0300` y el `/SGC-2/` ahora va antes que `/SGC` en el fallback de navegación (`includes('/SGC')` lo habría
  mandado al otro). Tarjeta «CCTV 2» en el launcher. **Ojo**: el SW es cache-first con `ignoreSearch`: cada cambio en
  SGC-2 pide subir la versión de `CACHE_NAME`.
- Tests: `tests/js/migrar_sgc.test.mjs` (10) y la prueba de humo (ventana → ensayo sin escribir → aplicar uniendo).
- **Falta (entrega 6)**: probar con el export real de SGC, período de convivencia y renombrar `SGC-2` → `SGC` (con su `sw.js`,
  manifest e iconos de PWA, que SGC-2 todavía no tiene propios).

## 17. Cambio de modelo: una cámara en varios grabadores

Se había prohibido «un equipo, un canal» para evitar los duplicados por error de SGC (B14, B21), pero la grabación redundante
(la misma cámara en dos NVR) es un caso real. Ahora la instalación guarda una **lista** de asignaciones, todas por igual (no hay
principal ni respaldo):

```jsonc
"instalacion": { "descripcion": "…", "ip": "…", …, "asignaciones": [ { "grabador": "id-NVR-1", "canal": 7 }, { "grabador": "id-NVR-2", "canal": 3 } ] }
```

- **Reglas** (`datos-puro.js`, `_validarAsignaciones`): cada una con grabador y canal; el grabador es un NVR/DVR instalado y el
  canal entra en su capacidad; un canal sigue siendo de UN solo equipo (409 «canal 3 de «NVR 2»: ya lo ocupa…»); el mismo
  grabador no puede aparecer dos veces en un equipo (un equipo ocupa un solo canal de cada grabador); máximo 16. Un grabador con
  asignaciones no sale de producción, no cambia de tipo, no baja de su canal más alto ocupado ni se borra, como antes.
- **Compatibilidad**: lo guardado con el par `grabador`+`canal` (localStorage, exportaciones, el Gist) se lee como una
  asignación. La API sigue dando `grabador` y `canal` (la primera) solo para lo que ya los leía; lo que se escribe es `asignaciones`
  (el par suelto también se acepta). El historial registra `instalacion.asignaciones` como «id#canal, id#canal».
- **Producción** (`/api/v2/datos`): una fila de cámara por asignación, así aparece en cada grabador.
- **Ficha del dispositivo**: una fila por asignación (grabador + canal, con el ocupante de cada canal), «Agregar a un grabador» y
  una ✕ para quitarla; un grabador ya elegido se deshabilita en las otras filas. «Asignar al canal» desde Producción suma la
  asignación y conserva las que ya tenía en otros grabadores (reemplaza solo la de ese mismo grabador).
- **Parseador de canales**: la misma MAC en canales de grabadores distintos ya no es conflicto (redundancia); sí lo es dos veces
  en el mismo grabador o un equipo ya en otro canal del mismo grabador. Descripción e IP vienen de la primera fila de cada equipo.
  Las altas de una cámara que aparece en dos grabadores crean UNA cámara con las dos asignaciones.
- **Migración desde SGC**: una cámara en canales de dos grabadores conserva las dos; dos canales del mismo grabador, el primero
  (con aviso).

## 18. Borrar todo y reemplazos con el Gist activo

- **Borrar todo** vaciaba el navegador pero, con la sincronización automática, a los 5 s volvía a bajar todo del Gist (el borrado local
  no deja lápidas). Ahora olvida el ID, el token y la frase, apaga la automática y descarta una sincronización en curso
  (`GistSync.olvidar`); el Gist no se toca.
- **Importar** y **Migrar > Reemplazar todo** reemplazan lo de este navegador: lo que estaba y ya no está deja **lápida**
  (`reemplazarConLapidas`), así la siguiente sincronización lo borra en el Gist y en las otras PC en vez de traerlo de vuelta. Un equipo
  editado en otra PC después del reemplazo sigue vivo (regla de las lápidas). Lo que solo está en el Gist y nunca estuvo acá no se puede
  marcar: vuelve, como en cualquier fusión.
