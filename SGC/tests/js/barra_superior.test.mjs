// Barra superior móvil (bloque BARRA SUPERIOR MOVIL PURO de js/barra-superior.js): cuándo se oculta al hacer scroll.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { barraSuperiorOculta: f } = cargarBloque("barra-superior.js", "BARRA SUPERIOR MOVIL PURO", { Math, Math },
  ["barraSuperiorOculta"]);
const base = { alto: 67, umbral: 8 };

test("arriba de todo (hasta lo que mide la barra) siempre se ve", () => {
  assert.equal(f({ ...base, y: 0, anterior: 0, oculta: true }), false);
  assert.equal(f({ ...base, y: 67, anterior: 40, oculta: true }), false);
  assert.equal(f({ ...base, y: -30, anterior: 0, oculta: true }), false);   // rebote de iOS
});

test("bajar la oculta y subir la muestra", () => {
  assert.equal(f({ ...base, y: 300, anterior: 200, oculta: false }), true);
  assert.equal(f({ ...base, y: 200, anterior: 300, oculta: true }), false);
});

test("un movimiento menor al umbral no cambia nada", () => {
  assert.equal(f({ ...base, y: 305, anterior: 300, oculta: false }), false);
  assert.equal(f({ ...base, y: 295, anterior: 300, oculta: true }), true);
  assert.equal(f({ ...base, y: 308, anterior: 300, oculta: false }), true);   // justo el umbral: ya cuenta
});

test("sin umbral indicado usa 8 px", () => {
  assert.equal(f({ y: 305, anterior: 300, oculta: false, alto: 67 }), false);
  assert.equal(f({ y: 320, anterior: 300, oculta: false, alto: 67 }), true);
});
