// Cambio en lote del modo selección de Activos (bloque STOCK SELECCION PURO de static/stock-seleccion.js; lo común del modo:
// modo_seleccion.test.mjs).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const api = cargarBloque("stock-seleccion.js", "STOCK SELECCION PURO", { Object, String, Boolean, Number, Array },
  ["stockLoteCambios", "stockLotePedido", "stockLoteValido", "stockLoteResumen", "STOCK_LOTE_CAMPOS"]);

test("stockLoteCambios: solo lo elegido, recortado y de la lista cerrada", () => {
  assert.deepEqual(plano(api.stockLoteCambios({ tipo: "domo", condicion: "", edificio: " Anexo A ", piso: "", rack: "0380",
    puerto: "3/0/1", otra: "x" })), { tipo: "domo", edificio: "Anexo A", rack: "0380" });
  assert.deepEqual(plano(api.stockLoteCambios({})), {});
  assert.deepEqual(plano(api.stockLoteCambios(null)), {});
  assert.deepEqual(plano(api.stockLoteCambios({ rack: 5 })), {}, "un valor que no es texto no cuenta");
  assert.deepEqual([...api.STOCK_LOTE_CAMPOS], ["tipo", "condicion", "edificio", "piso", "rack"]);
});

test("stockLotePedido: cada seleccionado con su versión; lo que ya no está en el stock no se manda", () => {
  const porId = new Map([["a", { id: "a", version: 3 }], ["b", { id: "b", version: 1 }]]);
  assert.deepEqual(plano(api.stockLotePedido(new Set(["a", "b", "fantasma"]), porId, { rack: "1" }, true)),
    { dispositivos: [{ id: "a", version: 3 }, { id: "b", version: 1 }], cambios: { rack: "1" }, aplicar: true });
  assert.equal(api.stockLotePedido(["a"], porId, {}, undefined).aplicar, false);
});

test("stockLoteValido: forma de LoteResultado", () => {
  const ok = { aplicado: false, actualizados: [{ dispositivo_id: "a", descripcion: "A", cambios: 2, sale_de_produccion: false }],
    omitidos: [{ dispositivo_id: "c", descripcion: "C", motivo: "no está instalado" }] };
  assert.equal(api.stockLoteValido(ok), true);
  assert.equal(api.stockLoteValido({ ...ok, aplicado: "no" }), false);
  assert.equal(api.stockLoteValido({ ...ok, omitidos: [{ dispositivo_id: "c", descripcion: "C" }] }), false);
  assert.equal(api.stockLoteValido({ ...ok, actualizados: [{ dispositivo_id: "a", descripcion: "A", cambios: "2" }] }), false);
  assert.equal(api.stockLoteValido(null), false);
});

test("stockLoteResumen", () => {
  const act = (extra = {}) => ({ dispositivo_id: "a", descripcion: "A", cambios: 1, sale_de_produccion: false, ...extra });
  assert.equal(api.stockLoteResumen({ actualizados: [act()], omitidos: [] }), "1 se actualiza");
  assert.equal(api.stockLoteResumen({ actualizados: [act(), act({ sale_de_produccion: true })], omitidos: [{}, {}] }),
    "2 se actualizan (1 sale de producción) · 2 se omiten");
  assert.equal(api.stockLoteResumen({ actualizados: [], omitidos: [{}] }), "0 se actualizan · 1 se omite");
});
