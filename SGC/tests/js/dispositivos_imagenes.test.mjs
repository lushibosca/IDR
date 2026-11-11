// Funciones puras de imágenes de dispositivos en static/produccion.js.
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("produccion.js", "IMAGENES DISPOSITIVOS PURO", { Array, String, encodeURIComponent },
  ["buscarImagenDispositivo", "IMAGENES_DISPOSITIVOS"]);

test("buscarImagenDispositivo: coincidencia exacta y normalizada", () => {
  assert.equal(api.buscarImagenDispositivo("DS-2CD2012-I"), "img/devices/DS-2CD2012-I.png");
  assert.equal(api.buscarImagenDispositivo("ds-2cd2012-i"), "img/devices/DS-2CD2012-I.png");
  assert.equal(api.buscarImagenDispositivo("  DS-2CD2112-I  "), "img/devices/DS-2CD2112-I.png");
  assert.equal(api.buscarImagenDispositivo("DH-IPC-HDPW1230R1P-0280B-S5"), "img/devices/DH-IPC-HDPW1230R1P-0280B-S5.png");
});

test("buscarImagenDispositivo: coincidencia por prefijo", () => {
  assert.equal(api.buscarImagenDispositivo("NBN-921"), "img/devices/NBN-921-14IP.png");
  assert.equal(api.buscarImagenDispositivo("DS-7616"), "img/devices/DS-7616NI-K2.png");
  assert.equal(api.buscarImagenDispositivo("DS-2CD2625FWD"), "img/devices/DS-2CD2625FWD-IZS.png");
});

test("buscarImagenDispositivo: valores inválidos o nulos retornan null", () => {
  assert.equal(api.buscarImagenDispositivo(""), null);
  assert.equal(api.buscarImagenDispositivo(null), null);
  assert.equal(api.buscarImagenDispositivo(undefined), null);
  assert.equal(api.buscarImagenDispositivo("-"), null);
  assert.equal(api.buscarImagenDispositivo("N/A"), null);
});

test("buscarImagenDispositivo: soporte para modelos con barra / y variantes de archivo", () => {
  // Con barra / en el modelo busca archivo con guión - o sin barra
  assert.equal(api.buscarImagenDispositivo("DS-IX2002-A3U/X"), "img/devices/DS-IX2002-A3U-X.png");
  assert.equal(api.buscarImagenDispositivo("ds-ix2002-a3u/x"), "img/devices/DS-IX2002-A3U-X.png");
  assert.equal(api.buscarImagenDispositivo("DS-IX2002-A3UX"), "img/devices/DS-IX2002-A3UX.png");
  assert.equal(api.buscarImagenDispositivo("DS-IX2002-A3U-X"), "img/devices/DS-IX2002-A3U-X.png");
  // Modelo no catalogado con barra: fallback sanea a guión en lugar de generar URL con %2F
  assert.equal(api.buscarImagenDispositivo("MODELO/NUEVO"), "img/devices/MODELO-NUEVO.png");
});
