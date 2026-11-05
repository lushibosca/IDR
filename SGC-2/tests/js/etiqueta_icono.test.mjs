// Dónde va la etiqueta de un botón de solo ícono (bloque ETIQUETA ICONO PURO de static/comun.js).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const { uiPosicionEtiquetaArriba } = cargarBloque("comun.js", "ETIQUETA ICONO PURO", { Math }, ["uiPosicionEtiquetaArriba"]);
const VENTANA = { width: 1000, height: 800 };
const TIP = { width: 100, height: 28 };

test("la etiqueta va centrada arriba del botón", () => {
  const r = { left: 400, top: 300, width: 40, height: 30, bottom: 330 };
  assert.deepEqual(plano(uiPosicionEtiquetaArriba(r, TIP, VENTANA)), { left: 370, top: 266 });
});

test("si arriba no entra, va abajo; nunca se sale de la ventana en horizontal", () => {
  assert.deepEqual(plano(uiPosicionEtiquetaArriba({ left: 400, top: 10, width: 40, height: 30, bottom: 40 }, TIP, VENTANA)),
    { left: 370, top: 46 });
  assert.equal(uiPosicionEtiquetaArriba({ left: 0, top: 300, width: 20, height: 20, bottom: 320 }, TIP, VENTANA).left, 4);
  assert.equal(uiPosicionEtiquetaArriba({ left: 990, top: 300, width: 20, height: 20, bottom: 320 }, TIP, VENTANA).left, 896);
});
