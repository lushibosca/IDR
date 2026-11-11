// Swipe entre pestañas en móvil (bloque SWIPE PESTANAS PURO de js/swipe-pestanas.js): cuándo un deslizamiento cambia de pestaña.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { swipePestanaDestino: f } = cargarBloque("swipe-pestanas.js", "SWIPE PESTANAS PURO", { Math },
  ["swipePestanaDestino"]);
const base = { dy: 4, ms: 200, indice: 1, total: 4 };

test("a la izquierda va a la siguiente y a la derecha a la anterior", () => {
  assert.equal(f({ ...base, dx: -120 }), 2);
  assert.equal(f({ ...base, dx: 120 }), 0);
});

test("en los extremos no da la vuelta", () => {
  assert.equal(f({ ...base, indice: 0, dx: 120 }), -1);
  assert.equal(f({ ...base, indice: 3, dx: -120 }), -1);
  assert.equal(f({ ...base, indice: 0, dx: -120 }), 1);
  assert.equal(f({ ...base, indice: 3, dx: 120 }), 2);
});

test("un movimiento corto, lento o inclinado no cambia de pestaña", () => {
  assert.equal(f({ ...base, dx: -40 }), -1);                       // corto
  assert.equal(f({ ...base, dx: -120, ms: 900 }), -1);             // lento (arrastre, no swipe)
  assert.equal(f({ ...base, dx: -100, dy: 80 }), -1);              // más vertical que horizontal: es un scroll
  assert.equal(f({ ...base, dx: -100, dy: 60 }), -1);              // 100 < 60 * 1.8
  assert.equal(f({ ...base, dx: -100, dy: 50 }), 2);               // 100 >= 50 * 1.8
});

test("el umbral es de 60 px y 700 ms por defecto, y se puede cambiar", () => {
  assert.equal(f({ ...base, dx: -60 }), 2);
  assert.equal(f({ ...base, dx: -120, ms: 700 }), 2);
  assert.equal(f({ ...base, dx: -120, ms: 701 }), -1);
  assert.equal(f({ ...base, dx: -30, minimo: 20 }), 2);
  assert.equal(f({ ...base, dx: -120, ms: 1000, maxMs: 1500 }), 2);
});

test("datos inválidos no cambian de pestaña", () => {
  assert.equal(f({ ...base, dx: -120, ms: NaN }), -1);
  assert.equal(f({ ...base, dx: -120, ms: -5 }), -1);
});
