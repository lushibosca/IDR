// Alta por lote del stock (bloque STOCK ALTA LOTE PURO de static/stock-alta-lote.js): de las listas pegadas a una fila por
// dispositivo (la línea N de la MAC, de la serie y del patrimonio es el mismo dispositivo) y el cuerpo del pedido.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const api = cargarBloque("stock-alta-lote.js", "STOCK ALTA LOTE PURO", { String, Number, Math, Array, Object, Number },
  ["STOCK_ALTA_LOTE_MAX", "stockLineasLote", "stockFilasLote", "stockFilaLoteVacia", "stockResumenLote", "stockPedidoLote", "stockAltasLoteValida"]);

test("líneas: sin espacios, sin vacías al final y con las del medio (mantienen la correspondencia)", () => {
  assert.deepEqual(plano(api.stockLineasLote("  a \r\n b\n\nc\n\n\n")), ["a", "b", "", "c"]);
  assert.deepEqual(plano(api.stockLineasLote("")), []);
  assert.deepEqual(plano(api.stockLineasLote(null)), []);
  assert.deepEqual(plano(api.stockLineasLote(undefined)), []);
  assert.deepEqual(plano(api.stockLineasLote("   \n  ")), []);
});

test("filas: la línea N de cada lista es el mismo dispositivo; lo que falta es null", () => {
  const filas = plano(api.stockFilasLote({ mac: "m1\nm2\nm3", serie: "s1\ns2", patrimonio: "" }));
  assert.deepEqual(filas, [{ mac: "m1", serie: "s1", patrimonio: null }, { mac: "m2", serie: "s2", patrimonio: null },
    { mac: "m3", serie: null, patrimonio: null }]);
  // la cantidad la da la lista más larga, aunque sea la de patrimonio
  assert.equal(api.stockFilasLote({ mac: "m1", serie: "", patrimonio: "p1\np2\np3" }).length, 3);
  assert.deepEqual(plano(api.stockFilasLote({ mac: "m1\n\nm3", serie: "s1\ns2\ns3" })).map(f => f.mac), ["m1", null, "m3"]);   // un hueco en el medio
  assert.deepEqual(plano(api.stockFilasLote({})), []);
  assert.deepEqual(plano(api.stockFilasLote(null)), []);
});

test("fila vacía: la primera sin ningún dato (una línea en blanco de más), 1-based; 0 si no hay", () => {
  assert.equal(api.stockFilaLoteVacia(api.stockFilasLote({ mac: "m1\n\nm3", serie: "s1\n\ns3" })), 2);
  assert.equal(api.stockFilaLoteVacia(api.stockFilasLote({ mac: "m1\n\nm3", serie: "s1\ns2\ns3" })), 0);
  assert.equal(api.stockFilaLoteVacia([]), 0);
});

test("resumen: cuántos dispositivos, cuántas líneas por campo y cuáles quedan desparejos", () => {
  const r = plano(api.stockResumenLote({ mac: "a\nb\nc\nd", serie: "1\n2\n3\n4", patrimonio: "x\ny" }));
  assert.deepEqual([r.filas, r.cuentas, r.desparejos, r.excede], [4, { mac: 4, serie: 4, patrimonio: 2 }, [{ campo: "patrimonio", lineas: 2 }], false]);
  const parejo = plano(api.stockResumenLote({ mac: "a\nb", serie: "1\n2", patrimonio: "" }));
  assert.deepEqual([parejo.filas, parejo.desparejos], [2, []]);              // un campo sin pegar no es un «desparejo»
  assert.equal(api.stockResumenLote({}).filas, 0);
  const grande = api.stockResumenLote({ serie: Array.from({ length: api.STOCK_ALTA_LOTE_MAX + 1 }, (_, i) => `s${i}`).join("\n") });
  assert.equal(grande.excede, true);
  assert.equal(api.stockResumenLote({ serie: Array.from({ length: api.STOCK_ALTA_LOTE_MAX }, (_, i) => `s${i}`).join("\n") }).excede, false);
});

test("pedido: lo común recortado, canales numéricos o null, y las filas tal cual", () => {
  const filas = [{ mac: "m1", serie: null, patrimonio: null }];
  assert.deepEqual(plano(api.stockPedidoLote({ tipo: "domo", condicion: "operativo", marca: " Hik ", modelo: " DS ", canales: "16", comentario: " x " }, filas)),
    { tipo: "domo", condicion: "operativo", marca: "Hik", modelo: "DS", comentario: "x", canales: 16, filas });
  for (const malo of ["", "  ", "abc", "1e3", "-4", "12345", null, undefined]) {
    assert.equal(api.stockPedidoLote({ tipo: "t", condicion: "c", canales: malo }, filas).canales, null, String(malo));
  }
  assert.equal(api.stockPedidoLote({ tipo: "t", condicion: "c" }, filas).marca, "");
});

test("respuesta válida: creados entero y ids de texto", () => {
  assert.equal(api.stockAltasLoteValida({ creados: 2, ids: ["a", "b"] }), true);
  for (const malo of [null, {}, { creados: "2", ids: [] }, { creados: 2.5, ids: [] }, { creados: -1, ids: [] }, { creados: 1, ids: [1] }, { creados: 1 }]) {
    assert.equal(api.stockAltasLoteValida(malo), false, JSON.stringify(malo));
  }
});
