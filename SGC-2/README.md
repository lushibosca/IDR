# SGC-2 — stock de CCTV, estático

Versión estática (GitHub Pages, sin servidor) del front de `cctv_monitor`: stock de dispositivos, producción y
catálogos, con los datos en el navegador. Reemplazará a `idr/SGC`. Análisis y entregas: `ANALISIS-IMPLEMENTACION.md`.

## Cómo funciona

- **Sin backend.** La API que respondía el servidor de cctv_monitor (`/api/stock*`, `/api/v2/datos`) la responde el
  navegador: `js/api-local.js`, con la misma forma y los mismos estados (422, 404, 409). `apiFetch` (`js/comun.js`) le
  pasa cada pedido. Así el front del stock (`stock*.js`, `produccion.js`, `resumen.js`) no cambió.
- **Las reglas** del stock (validación, unicidad de serie/MAC/patrimonio, catálogos, edificios y pisos, historial,
  «en producción solo operativo») están en `js/datos-puro.js`, funciones puras portadas de `cctv/stock.py`.
- **Los datos** son un JSON en `localStorage` (`sgc2/datos_v1`). Cada escritura trabaja sobre una copia y se guarda
  solo si salió bien. Lo que entra (localStorage, archivo importado y, más adelante, el Gist) se revisa entero
  (`sanearDatos`).
- **Prefijo `sgc2/`** en todas las claves de `localStorage`: en GitHub Pages las apps de la suite comparten el origen.
- **Ajustes > Datos**: exportar e importar el JSON, y borrar todo (con confirmación en dos pasos).

Se quitó todo lo que necesitaba un servidor o la red de cámaras: monitoreo, alertas, disponibilidad, escaneo,
capturas, video en vivo, Auditoría (queda solo **Historial**, los cambios del stock), login y roles.

## Estructura

```
index.html        CSP en <meta>: script/style 'self', connect-src solo GitHub (para el Gist)
js/               front (vanilla, sin módulos); capa local: datos-puro.js, api-local.js, sesion-local.js, datos-ui.js
css/              CSS propio (sin Bootstrap, sin !important)
img/devices/      fotos de los modelos
vendor/           bootstrap-icons y fuentes
tests/js/         node --test (lógica pura de cada js, entre marcadores // ==== X BEGIN/END ====)
tests/e2e/        prueba de humo en jsdom (la página real, sin servidor)
```

## Probar

```bash
node --test tests/js/*.test.mjs                       # (no pasar el directorio)
(cd tests/e2e && npm ci) && node tests/e2e/humo.mjs   # página completa en jsdom
python3 -m http.server -d ..                          # y abrir http://localhost:8000/SGC-2/
```
