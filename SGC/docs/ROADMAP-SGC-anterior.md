# Roadmap SGC — seguridad, bugs y refactor

Surgido de la auditoría de `app.js` (oct-2026). Las referencias usan nombres de función porque los números de línea cambian; buscarlos con `grep -n`.

Leyenda: ✅ hecho · ⬜ pendiente · Severidad: 🔴 alta · 🟠 media · 🟢 baja

---

## ✅ Hecho

| Commit | Ítem | Resumen |
|---|---|---|
| v1 | B1 | La vista previa del merge (`_simularMerge`) ya no persiste tipos/edificios ni dispara el autosync. |
| v1 | B2 | `updatedAt` siempre en ISO UTC. `S.normalizarTs` migra el formato viejo `"YYYY-MM-DD HH:MM"` (en `Store.cargar` y `sanitizar*`). |
| v1 | B3 | Editar un activo con varias MACs ya no pierde las secundarias; `_macFiltrar` no reformatea listas con coma. |
| v1 | B4 | El Parseador de Datos no pisa datos con vacío y matchea MACs múltiples / con cualquier separador. |
| v1 | S1 | `S.sanitizarTipoCustom` para tipos de localStorage, Gist e import, y escape (`S.esc`) en el render. `guardarTipos` ahora persiste `updatedAt`. |
| v2 | B5 | `comentario` del dispositivo se sincroniza en el merge. |
| v2 | B8 | No se sube si no se pudo leer el Gist, y todo el proceso de subida va dentro del `try`. |
| v2 | B9 | CSP `connect-src` + `RAW_HOST`: se pueden bajar gists de más de 1 MB. |
| v2 | B10 | `eliminarEdificio` cuenta bien los usos (`canales_data`, `otros_prod`). |
| v3 | B6 | Helper `_mergeCampos` / `_modoMerge`: si el local es más nuevo no se toca nada; un remoto sin timestamp solo rellena vacíos. |
| v3 | B7 | Antes de subir se lee el Gist y, si cambió (`updated_at` ≠ `_cfg.remoteUpdatedAt`), se combina primero. Nunca dos subidas en paralelo. Helpers `_leerGist` y `_resumenMerge`. |

**Decisiones tomadas en B7 (revisar si molestan):**
- "Ignorar" en el modal de novedades no descarta nada: en la próxima subida esos cambios se combinan igual (con toast y Ctrl+Z).
- El timestamp es por entidad: si dos equipos editan canales distintos del mismo grabador a la vez, gana la edición más reciente del grabador entero. La solución completa es un `updatedAt` por canal (ver R7).

**Sin probar en el navegador:** el autosync con el Gist alterado (debería mostrar el error de estado y no subir) y el modal de confirmación de la subida manual.

---

## ⬜ Bugs de lógica pendientes

- ⬜ 🟠 **B11.** `_bindStaticEvents` registra **dos veces** los listeners de `btn-reporte-agrupamiento`, `btn-generar-reporte-agrupamiento` y el cancelar del reporte (bloque "Sumario por Agrupamiento Actual" duplicado). Deja una entrada de historial de más y un focus-trap duplicado. *Fix: borrar el bloque repetido.*
- ⬜ 🟠 **B12.** `_otroProdDispFiltrar` hace `Store.data.dispositivos.sort(...)` sobre el array del Store: reordena los datos y cambia el hash. *Fix: `[...Store.data.dispositivos].sort(...)`.*
- ⬜ 🟠 **B13.** `ParseadorCanales._construirMapeoPorDefecto`: el match por nombre `nn.includes(desc)` da true con una descripción vacía, y "NVR" coincide con todo. *Fix: ignorar descripciones vacías o cortas; preferir igualdad exacta.*
- ⬜ 🟠 **B14.** MACs duplicadas:
  - `Busqueda.calcDupMacs` marca "MAC duplicada" cuando el **mismo** dispositivo está en dos canales (eso ya lo cubre `calcDispMultiCanal`).
  - `FormHelpers.validarMacSerialUnico` compara una MAC contra el string completo `x.mac`, así que no detecta duplicados dentro de dispositivos con varias MACs ni con otro separador (`-` vs `:`).
  - *Fix: helper `S.normalizarMAC` / `S.splitMACs` (ver R1).*
- ⬜ 🟢 **B15.** `anim-delay-\${...}` con la barra escapada en `_renderResumenCamaras` (2 lugares): la clase sale literal. *Fix: sacar la `\`.*
- ⬜ 🟠 **B16.** El merge de grabadores no sincroniza `canales_n`: si otro equipo agrandó un grabador, los canales extra se ignoran.
- ⬜ 🟠 **B17.** Cambios en canales que no actualizan `updatedAt` del grabador, así que no le ganan al remoto:
  - `guardarEdicionDispositivo` al marcar un dispositivo inactivo (libera sus slots);
  - `Store.sincronizarGrabadores`.
- ⬜ 🟢 **B18.** Dashboard: el nivel 2 (edificios) agrupa distinguiendo mayúsculas y el nivel 3 filtra sin distinguirlas, así que los totales no cuadran. Ninguno cuenta las cámaras de `otros_prod`.
- ⬜ 🟢 **B19.** `S.guardarEdificios` hace `typeof GistSync` sobre un `const` en zona TDZ: da ReferenceError si se llama antes del init. Frágil, hoy no pasa.
- ⬜ 🟢 **B20.** Import en modo "reemplazar" no borra los tipos personalizados viejos; Gist en modo "reemplazar" sí.
- ⬜ 🟢 **B21.** Parseador de canales:
  - `aplicar` asigna un dispositivo por MAC sin verificar que no esté en otro canal u `otros_prod`.
  - El grabador creado con "Crear nuevo" fija `tipo: 'nvr'` e ignora la marca, el modelo y la MAC del dispositivo.
  - Los dispositivos creados desde "sin match" no se asignan al canal donde se encontraron.
- ⬜ 🟢 **B22.** Verificar que exista `UI.cerrarFiltrosBusqueda` (se usa en `_bindStaticEvents`); si no existe, el botón tira un TypeError.

---

## ⬜ Seguridad pendiente

- ⬜ 🔴 **S2.** El token de GitHub está en texto plano en localStorage. Mínimo: recomendar en la UI un token *fine-grained* con acceso solo a gists. Ideal: no persistirlo (pedirlo por sesión) o cifrarlo con una passphrase.
- ⬜ 🟠 **S3.** Un gist "secreto" no es privado: cualquiera con el ID lo lee, y `bajar()` funciona sin token. Expone IPs, MACs y ubicaciones. Opción: cifrar el contenido (AES-GCM con una passphrase, WebCrypto) o al menos avisarlo en el modal del Gist.
- ⬜ 🟠 **S4.** La "firma" es un SHA-256 que cualquiera con acceso de escritura al gist puede recalcular, así que no prueba autenticidad. Además no cubre `eliminados`: se pueden inyectar lápidas que borren entidades. Opciones: HMAC con una clave local, o cambiar los textos ("verificación de integridad", no "detectamos alteración") e incluir `eliminados` en `generarFirma`. **Ojo:** cambiar la firma invalida los gists existentes, así que hace falta un período de compatibilidad con `version`.
- ⬜ 🟠 **S5.** `Utilidades/cctv-scanner.py` usa `verify=False` y, si Digest falla, reintenta con Basic sobre HTTPS sin fijar la huella del certificado: un MITM recibe la contraseña de los NVR en claro. Llevar al scanner la política de `cctv-monitor.py` (huellas `tls_sha256`, modo estricto, `permitir_basic`).
- ⬜ 🟢 **S6.** `style="..."` inline en `renderRackDropdown` (el ícono del rack): lo bloquea la CSP. Pasarlo a una clase en `styles.css`. Además, `frame-ancestors` no funciona dentro de un `<meta>`: requiere un header HTTP.
- ⬜ 🟢 **S7.** `ParseadorDatos.aplicar` guarda `serial`, `firmware` y `modelo` sin `S.sanitize` ni límite de largo. Los dos parseadores usan `JSON.parse` sin límite de tamaño (usar `S.safeParse` + `S.MAX_JSON`).
- ⬜ 🟢 **S8.** `S.sanitize` funciona por lista negra y modifica los datos (borra comillas, `data:`, `on…=`; por ejemplo, "condition=OK" se guarda como "OK"). A largo plazo: guardar el texto crudo con límite de largo y escapar solo al mostrar (`S.esc`). Requiere revisar que **todo** el render escape antes.

---

## ⬜ Rendimiento

- ⬜ **P1.** Búsquedas O(n·m) en el render:
  - `renderProduccion` hace `Store.dispById` (un `.find` lineal) por cada canal y dentro del `sort`;
  - `getL2Html` / `getL3Html` hacen `grabs.flatMap(...).find(...)` por cada cámara;
  - `_renderResumenCamaras` hace `camarasDisps.find` por canal.
  - *Fix: un `Map` id→dispositivo cacheado en el Store (se invalida en `_invalidarCaches`) y reusar `_buildAsignaciones()`.*
- ⬜ **P2.** Cachear `_calcIdsEnProd()` junto a `cacheAsignaciones`.
- ⬜ **P3.** El historial guarda 30 `deepClone` completos del Store. Bajar a ~10 o guardar diferencias.
- ⬜ **P4.** `render()` dibuja las 3 pestañas en cada cambio: dibujar solo la activa y marcar las otras como "sucias".

---

## ⬜ Refactor / duplicados a pasar a helpers

- ⬜ **R1.** `S.normalizarMAC(mac)` + `S.splitMACs(str)`. Hoy hay variantes en `validarMacSerialUnico`, `claveDisp`, `calcDupMacs`, `ParseadorCanales._indexarDispPorMAC` y `ParseadorDatos._normMAC` (esta última ya es canónica, se puede mover a `S`). Resuelve B14.
- ⬜ **R2.** `estadoEfectivo(d, idsEnProd)`. La lógica `d.estado || (enProd ? 'produccion' : 'disponible')` está repetida en `getL2Html`, `getL3Html`, `_estadosDeDisps`, `_renderResumenCamaras` y `Busqueda.getEstadoEfectivo`.
- ⬜ **R3.** Un solo `Combobox({ input, items, onSelect })` para `_canalDispFiltrar` / `_otroProdDispFiltrar`, los tres `…Keydown` y `_posicionarDispPortal` / `posicionarRackPortal` (idénticos).
- ⬜ **R4.** `_filtrarDispositivos(query)`: la búsqueda + el filtro edificio/piso están duplicados en `renderActivos` y `abrirReporteAgrupamiento`.
- ⬜ **R5.** `_agruparPor(items, keyFn, sortFn)` para `_renderSubgruposPiso`, `_renderSubgruposFirmware` y los subgrupos de `descargarReporteAgrupamiento`.
- ⬜ **R6.** `_setColapsado(el, bool, tipo)`: el patrón `grid…collapsed + chevron…` se repite unas 15 veces en `toggleExpandirTodo` y en el long-press.
- ⬜ **R7.** (Opcional, relacionado con B7) `updatedAt` por canal, para que el merge de grabadores sea por canal y no por grabador entero.
- ⬜ **R8.** "Propagar ubicación a otras asignaciones": duplicado en `guardarAsignacionCanal` y `guardarOtroProd`.
- ⬜ **R9.** Toast "N agregados, M duplicados" (tipos y edificios, 3 veces). Los IDs ocupados de `abrirNuevoOtroProd` / `abrirEditarOtroProd` duplican `_calcIdsEnProd`.
- ⬜ **R10.** Chips del modal de novedades (`_mostrarNovedades`): armarlos desde una tabla, igual que `_resumenMerge`.
- ⬜ **R11.** Código muerto: `onSelectEstadoDisp`, `esc = S.escapeHtml ?? …` en ParseadorDatos, los chequeos `if (_guardarColapsados)` (siempre true), y `d.edificio` / `d.piso` en `scoreDispositivo` (los dispositivos no tienen esos campos).

---

## Orden sugerido para seguir

1. **Rápidos (1–2 líneas c/u):** B11, B12, B15, B22.
2. **R1 + B14** (normalización de MACs), y en el mismo paso B13.
3. **B16, B17**: completan la confiabilidad del merge.
4. **S2, S3, S5**: decisiones de seguridad (algunas cambian el uso: passphrase, cifrado).
5. **P1, P2**: rendimiento con muchos grabadores.
6. Resto del refactor (R2–R11) y la sanitización de largo plazo (S8).

---

## Cómo se probó

Los arreglos de merge y subida (B5–B7) se probaron cargando el `app.js` real en Node con un DOM falso (Proxy) y la API de GitHub simulada: 16 escenarios OK. El harness quedó en el scratchpad de la sesión, que es temporal. Si se quiere conservar, moverlo a `SGC/tests/` (no requiere dependencias: `node tests/test_b7.js`).

**Checklist manual en el navegador (pendiente):**
- [ ] Autosync activo, cambio en otro equipo, abrir la app → "Ignorar" → el gist **no** se sobrescribe enseguida.
- [ ] Activo con 2 MACs: editar el comentario y guardar → siguen las 2 MACs.
- [ ] Parseador de Datos con una cámara sin serial en el JSON → no borra el serial cargado.
- [ ] Dos navegadores con el mismo gist, agregar un dispositivo en cada uno → el gist termina con ambos.
- [ ] Gist de más de 1 MB → se baja sin error de CSP.
- [ ] Eliminar un edificio usado en canales → avisa la cantidad.
