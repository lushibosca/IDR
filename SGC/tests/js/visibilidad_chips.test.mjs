// Qué chips se ven en Monitoreo y Activos (bloque VISIBILIDAD PURO de static/comun.js): siempre queda al menos uno a la vista.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const v = cargarBloque("comun.js", "VISIBILIDAD PURO", { Array, Set }, ["ocultosVigentes", "alternarOculto"]);
const TODOS = ["servidores", "camaras", "offline"];

test("ocultosVigentes: descarta lo que ya no existe y lo basura; si ocultara todo no oculta nada", () => {
  assert.deepEqual(plano(v.ocultosVigentes(["camaras", "grupo-borrado", "camaras"], TODOS)), ["camaras"]);
  for (const basura of [null, undefined, "camaras", 3, {}]) assert.deepEqual(plano(v.ocultosVigentes(basura, TODOS)), []);
  assert.deepEqual(plano(v.ocultosVigentes(TODOS, TODOS)), [], "todo oculto = nada oculto");
  assert.deepEqual(plano(v.ocultosVigentes(["a"], ["a"])), [], "con un solo chip no se oculta");
});

test("alternarOculto: oculta, vuelve a mostrar y nunca deja todo oculto", () => {
  let o = v.alternarOculto([], "camaras", TODOS);
  assert.deepEqual(plano(o), ["camaras"]);
  o = v.alternarOculto(o, "offline", TODOS);
  assert.deepEqual(plano(o), ["camaras", "offline"]);
  assert.deepEqual(plano(v.alternarOculto(o, "servidores", TODOS)), ["camaras", "offline"], "el último a la vista no se oculta");
  assert.deepEqual(plano(v.alternarOculto(o, "camaras", TODOS)), ["offline"], "mostrar uno oculto");
  assert.deepEqual(plano(v.alternarOculto([], "otro-que-no-existe", TODOS)), ["otro-que-no-existe"].filter(x => TODOS.includes(x)));
});
