// Modo selección de Producción (bloque PRODUCCION SELECCION PURO de static/produccion-seleccion.js): lo marcado, por dispositivo.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const p = cargarBloque("produccion-seleccion.js", "PRODUCCION SELECCION PURO", { Map, Set, Array }, ["produccionPartesSeleccion"]);

test("un dispositivo del stock es uno aunque esté en dos grabadores; los canales sin alta van como favoritos y se cuentan aparte", () => {
  const reps = new Map([
    ["s:A", { stockId: "A", nvrIp: "10.0.0.1", canal: "1" }],
    ["s:B", { stockId: "B", nvrIp: "10.0.0.2", canal: "4" }],
    ["c:10.0.0.1:7", { stockId: "", nvrIp: "10.0.0.1", canal: "7" }],
    ["c:10.0.0.3:2", { stockId: "", nvrIp: "10.0.0.3", canal: "CH 2".replace(/^CH\s*/i, "") }],
  ]);
  const r = p.produccionPartesSeleccion(reps, new Set(["s:A", "s:B", "c:10.0.0.1:7", "c:10.0.0.3:2", "s:inexistente"]));
  assert.deepEqual(plano(r), { stockIds: ["A", "B"], claves: ["cam:10.0.0.1:7", "cam:10.0.0.3:2"], sinStock: 2 });
  assert.deepEqual(plano(p.produccionPartesSeleccion(reps, new Set())), { stockIds: [], claves: [], sinStock: 0 });
  assert.deepEqual(plano(p.produccionPartesSeleccion(new Map([["s:A", { stockId: "A" }], ["s:A2", { stockId: "A" }]]), new Set(["s:A", "s:A2"]))).stockIds, ["A"],
    "el mismo dispositivo por dos claves entra una sola vez");
});
