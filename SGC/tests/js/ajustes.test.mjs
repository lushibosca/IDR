// Pestaña Ajustes (bloque AJUSTES PURO de js/ajustes.js y shared/ui/js/ajustes-columnas.js): qué apartados del panel Estado quedan ocultos y reparto en columnas.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const a = cargarBloque(
  "ajustes.js",
  "AJUSTES PURO",
  { Array, Set, Number, Math },
  ["SECCIONES_ESTADO", "seccionesOcultasVigentes", "alternarSeccionOculta"]
);
const columnas = cargarBloque("../shared/ui/js/ajustes-columnas.js", "AJUSTES COLUMNAS PURO", { Array, Number, Math },
  ["calcularColumnasAjustes", "repartirSeccionesAjustes"]);
Object.assign(a, columnas);

test("lo oculto es solo lo conocido y sin repetir; lo demás se descarta", () => {
  assert.deepEqual(plano(a.seccionesOcultasVigentes(["infra-chips", "x", "infra-chips"])), ["infra-chips"]);
  assert.deepEqual(plano(a.seccionesOcultasVigentes("canales-section")), []);
  assert.deepEqual(plano(a.seccionesOcultasVigentes(null)), []);
});

test("ocultar y mostrar un apartado; uno desconocido no cambia nada; pueden ocultarse todos", () => {
  assert.deepEqual(plano(a.alternarSeccionOculta([], "canales-section", false)), ["canales-section"]);
  assert.deepEqual(plano(a.alternarSeccionOculta(["canales-section"], "canales-section", true)), []);
  assert.deepEqual(plano(a.alternarSeccionOculta(["canales-section"], "otro", false)), ["canales-section"]);
  const todos = a.SECCIONES_ESTADO.map(s => s.id);
  assert.equal(todos.reduce((o, id) => a.alternarSeccionOculta(o, id, false), []).length, todos.length);
});

test("calcularColumnasAjustes y repartirSeccionesAjustes reparten en columnas verticales independientes", () => {
  assert.equal(a.calcularColumnasAjustes(0), 2);
  assert.equal(a.calcularColumnasAjustes(500), 1);
  assert.equal(a.calcularColumnasAjustes(900), 2);
  assert.equal(a.calcularColumnasAjustes(1350), 3);

  const cols2 = a.repartirSeccionesAjustes(["a", "b", "c", "d", "e"], 2);
  assert.deepEqual(cols2.map((c) => c.join(",")), ["a,c,e", "b,d"]);

  const cols3 = a.repartirSeccionesAjustes(["a", "b", "c", "d", "e"], 3);
  assert.deepEqual(cols3.map((c) => c.join(",")), ["a,d", "b,e", "c"]);
});
