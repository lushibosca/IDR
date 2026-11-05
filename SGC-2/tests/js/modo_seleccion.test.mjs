// Modo selección de Activos y Producción: lo común (bloque MODO SELECCION PURO de static/comun.js). El controlador
// (`uiModoSeleccion`: barra, Escape, clic afuera) lo cubre el E2E.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("comun.js", "MODO SELECCION PURO", { String, Set, Boolean, Array, Math },
  ["uiSeleccionTexto", "uiVisiblesMarcados", "uiEsAtajoAltShift", "uiEnPantalla", "uiRangoClaves", "uiPuntosEnSegmento"]);

test("texto del contador de selección", () => {
  assert.equal(api.uiSeleccionTexto(0), "0 seleccionados");
  assert.equal(api.uiSeleccionTexto(1), "1 seleccionado");
  assert.equal(api.uiSeleccionTexto(12), "12 seleccionados");
});

test("«Visibles»: con todo lo que se ve ya marcado, la acción es la contraria", () => {
  const { uiVisiblesMarcados } = api;
  assert.equal(uiVisiblesMarcados(["a", "b"], new Set(["a", "b", "z"])), true, "lo marcado fuera de la vista no cuenta");
  assert.equal(uiVisiblesMarcados(["a", "b"], new Set(["a"])), false);
  assert.equal(uiVisiblesMarcados([], new Set(["a"])), false, "sin nada a la vista no hay qué alternar");
  assert.equal(uiVisiblesMarcados(["a"], new Set()), false);
});

test("atajos Alt+Shift+letra: cada uno con su letra, por la tecla o por la letra, y nada más", () => {
  const ev = (o = {}) => ({ key: "G", code: "KeyG", altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false, ...o });
  assert.equal(api.uiEsAtajoAltShift(ev(), "g"), true);
  assert.equal(api.uiEsAtajoAltShift(ev({ key: "V", code: "KeyV" }), "v"), true);
  assert.equal(api.uiEsAtajoAltShift(ev(), "v"), false, "cada atajo tiene su letra");
  assert.equal(api.uiEsAtajoAltShift(ev({ key: "g", code: "KeyP" }), "g"), true, "por la letra (otra distribución)");
  for (const o of [{ altKey: false }, { shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { repeat: true }]) {
    assert.equal(api.uiEsAtajoAltShift(ev(o), "g"), false, JSON.stringify(o));
  }
  assert.equal(api.uiEsAtajoAltShift(null, "g"), false);
});

test("«Visibles» solo cuenta lo que está dentro de la ventana", () => {
  const r = (top, bottom, width = 100) => ({ top, bottom, width, height: bottom - top });
  assert.equal(api.uiEnPantalla(r(10, 50), 800), true);
  assert.equal(api.uiEnPantalla(r(-30, 20), 800), true);          // asoma por arriba
  assert.equal(api.uiEnPantalla(r(780, 820), 800), true);         // asoma por abajo
  assert.equal(api.uiEnPantalla(r(-60, -1), 800), false);         // ya pasó
  assert.equal(api.uiEnPantalla(r(800, 840), 800), false);        // todavía no llegó
  assert.equal(api.uiEnPantalla(r(10, 50, 0), 800), false);       // sin ancho: oculto
  assert.equal(api.uiEnPantalla(null, 800), false);
});

test("rango de Shift + clic y del arrastre: entre dos posiciones, en cualquier orden", () => {
  const claves = ["a", "b", "c", "d", "e"];
  assert.equal(JSON.stringify(api.uiRangoClaves(claves, 1, 3)), JSON.stringify(["b", "c", "d"]));
  assert.equal(JSON.stringify(api.uiRangoClaves(claves, 3, 1)), JSON.stringify(["b", "c", "d"]));
  assert.equal(JSON.stringify(api.uiRangoClaves(claves, 2, 2)), JSON.stringify(["c"]));
  assert.equal(JSON.stringify(api.uiRangoClaves(claves, -1, 2)), JSON.stringify([]));
  assert.equal(JSON.stringify(api.uiRangoClaves(claves, 0, 9)), JSON.stringify([]));
  assert.equal(JSON.stringify(api.uiRangoClaves(null, 0, 1)), JSON.stringify([]));
});

test("uiPuntosEnSegmento: el trazo del cursor, con extremos y sin saltos mayores al paso", () => {
  const p = (...a) => JSON.parse(JSON.stringify(api.uiPuntosEnSegmento(...a)));
  assert.deepEqual(p(0, 0, 0, 0), [[0, 0], [0, 0]]);                         // sin moverse: los dos extremos
  assert.deepEqual(p(0, 0, 8, 0), [[0, 0], [8, 0]]);
  assert.deepEqual(p(0, 0, 20, 0, 10), [[0, 0], [10, 0], [20, 0]]);
  const largo = p(10, 10, 10, 210);                                          // 200 px en vertical con paso 8: 25 tramos
  assert.equal(largo.length, 26);
  assert.deepEqual([largo[0], largo[25]], [[10, 10], [10, 210]]);
  for (let i = 1; i < largo.length; i++) assert.ok(Math.hypot(largo[i][0] - largo[i - 1][0], largo[i][1] - largo[i - 1][1]) <= 8 + 1e-9);
  assert.deepEqual(p(0, 0, 5, 5, 0).length, Math.ceil(Math.hypot(5, 5)) + 1);   // un paso 0 no se cuelga: se toma como 1
});
