// Qué teclas empiezan la búsqueda cuando el foco no está en un campo: solo a-z y 0-9.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { esTeclaDeBusqueda } = cargarBloque("app.js", "TECLA BUSQUEDA PURO", { RegExp }, ["esTeclaDeBusqueda"]);

test("letras de la a a la z (mayúsculas y minúsculas) y números empiezan la búsqueda", () => {
  for (const t of ["a", "m", "z", "A", "Z", "0", "5", "9"]) assert.equal(esTeclaDeBusqueda(t, false), true, t);
});

test("el espacio, el punto y los demás símbolos no la empiezan", () => {
  for (const t of [" ", ".", ",", "-", "_", "/", "+", "*", "@", "#", "(", "?", "'", "\\"]) {
    assert.equal(esTeclaDeBusqueda(t, false), false, JSON.stringify(t));
  }
});

test("las teclas de edición y de navegación no la empiezan", () => {
  for (const t of ["Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "Shift", "Control", "F5", "Dead", "Unidentified"]) {
    assert.equal(esTeclaDeBusqueda(t, false), false, t);
  }
});

test("con Ctrl, Meta o Alt no es una búsqueda (son atajos)", () => {
  assert.equal(esTeclaDeBusqueda("a", true), false);
  assert.equal(esTeclaDeBusqueda("5", true), false);
});

test("entradas raras no rompen: letras con acento o fuera de la a-z no cuentan, tampoco lo que no es texto", () => {
  for (const t of ["ñ", "á", "é", "ü", "٣", "", "ab", null, undefined, 5]) assert.equal(esTeclaDeBusqueda(t, false), false, String(t));
});
