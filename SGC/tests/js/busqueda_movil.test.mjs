// Buscador móvil (bloque BUSQUEDA MOVIL PURO de js/busqueda-movil.js): cuándo se abre y cuándo se cierra solo.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const b = cargarBloque("busqueda-movil.js", "BUSQUEDA MOVIL PURO", { String },
  ["busquedaMovilSiguiente", "busquedaMovilCierraAlTocarFuera"]);

test("el ícono alterna; el foco en el campo abre; Escape o el ancho de escritorio cierran", () => {
  assert.equal(b.busquedaMovilSiguiente(false, "alternar"), true);
  assert.equal(b.busquedaMovilSiguiente(true, "alternar"), false);
  assert.equal(b.busquedaMovilSiguiente(false, "abrir"), true);
  assert.equal(b.busquedaMovilSiguiente(true, "abrir"), true);
  assert.equal(b.busquedaMovilSiguiente(true, "cerrar"), false);
  assert.equal(b.busquedaMovilSiguiente(false, "cerrar"), false);
});

test("un evento desconocido no cambia el estado", () => {
  assert.equal(b.busquedaMovilSiguiente(true, "otro"), true);
  assert.equal(b.busquedaMovilSiguiente(false, undefined), false);
});

test("tocar fuera cierra solo si está abierto y vacío", () => {
  const c = (o) => b.busquedaMovilCierraAlTocarFuera({ abierta: true, texto: "", tocoDentro: false, ...o });
  assert.equal(c({}), true);
  assert.equal(c({ texto: "   " }), true);
  assert.equal(c({ texto: "nvr" }), false);          // con texto se queda a la vista
  assert.equal(c({ tocoDentro: true }), false);
  assert.equal(c({ abierta: false }), false);
  assert.equal(c({ texto: null }), true);
});
