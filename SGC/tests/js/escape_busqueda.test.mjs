// Escape y la búsqueda: solo limpia si hay una búsqueda activa; un resultado enfocado sin búsqueda solo pierde el foco.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("app.js", "ESCAPE BUSQUEDA PURO", {}, ["accionEscapeBusqueda"]);
const a = (busquedaActiva, resultadoEnfocado, buscadorEnfocado) =>
  api.accionEscapeBusqueda({ busquedaActiva, resultadoEnfocado, buscadorEnfocado });

test("con un resultado enfocado: con búsqueda salta al buscador; sin búsqueda solo quita el foco", () => {
  assert.equal(a(true, true, false), "ir-al-buscador");
  assert.equal(a(false, true, false), "quitar-foco");        // el caso de la selección recién limpiada
});

test("con búsqueda activa Escape limpia; sin ella, solo si el cursor está en el buscador (lo suelta)", () => {
  assert.equal(a(true, false, false), "limpiar");
  assert.equal(a(true, false, true), "limpiar");
  assert.equal(a(false, false, true), "limpiar");
  assert.equal(a(false, false, false), "nada");              // no hay nada que limpiar ni foco que soltar
});
