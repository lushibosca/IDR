// Producción > canal libre: qué dispositivos se ofrecen y cómo se encuentra el grabador (bloque ASIGNAR CANAL PURO de
// js/produccion-asignar.js) y los selectores de grabador/canal del formulario (stock-puro.js).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const A = cargarBloque("produccion-asignar.js", "ASIGNAR CANAL PURO", { String, Array },
  ["asignarCandidatos", "asignarGrabadorDe"]);
const S = cargarBloque("stock-puro.js", "STOCK PURO", { String, Number, Array, Map, Set, Math, Object, JSON, RegExp,
  normalizarTextoBusqueda: (t) => String(t).toLowerCase(), tokenizarBusqueda: (t) => String(t).split(/\s+/),
  uiValorInformado: (v) => v, uiNumeroCanal: (v) => v },
  ["stockGrabadoresAsignables", "stockCanalesDe", "stockPrimerCanalLibre", "stockPayload", "stockValoresDeDispositivo"]);
const nombre = (d) => (d.instalacion && d.instalacion.descripcion) || [d.marca, d.modelo].filter(Boolean).join(" ") || d.id;

const g = { id: "g", tipo: "nvr", canales: 4, instalacion: { descripcion: "NVR 1", ip: "10.0.0.1" } };
const stock = [
  g, { id: "g2", tipo: "dvr", instalacion: null },
  { id: "a", tipo: "domo", condicion: "operativo", marca: "Hik", modelo: "X", serie: "S1", instalacion: null },
  { id: "b", tipo: "domo", condicion: "revisar", marca: "Hik", modelo: "Y", instalacion: null },
  { id: "c", tipo: "domo", condicion: "operativo", instalacion: { descripcion: "Pasillo", grabador: "g", canal: 2 } },
  { id: "d", tipo: "monitor", condicion: "operativo", instalacion: { descripcion: "Sala" } },
];

test("candidatos: sin grabadores, primero lo listo del depósito y lo que se movería al final; la búsqueda filtra", () => {
  const r = A.asignarCandidatos(stock, "", nombre);
  assert.deepEqual(plano(r.map((x) => x.id)), ["a", "b", "d", "c"]);
  assert.match(r[0].detalle, /en depósito$/);
  assert.match(r[1].detalle, /en depósito \(revisar\)/);
  assert.match(r[3].detalle, /CH 2 de otro grabador/);
  assert.deepEqual(plano(A.asignarCandidatos(stock, "hik s1", nombre).map((x) => x.id)), ["a"]);
  assert.deepEqual(plano(A.asignarCandidatos(stock, "pásillo", nombre).map((x) => x.id)), ["c"]);
  assert.deepEqual(plano(A.asignarCandidatos(null, "", nombre)), []);
});

test("grabador de un grupo de Producción: por IP y, sin IP, por nombre", () => {
  const nvrs = [{ ip: "10.0.0.1", nvr_name: "NVR 1", stock: { id: "g" } }, { ip: "", nvr_name: "Sin IP", stock: { id: "h" } }];
  const limpiar = (t) => String(t || "").trim();
  assert.equal(A.asignarGrabadorDe(nvrs, "10.0.0.1", "otro", limpiar), "g");
  assert.equal(A.asignarGrabadorDe(nvrs, "", "Sin IP", limpiar), "h");
  assert.equal(A.asignarGrabadorDe(nvrs, "9.9.9.9", "nada", limpiar), "");
});

test("selectores del formulario: grabadores instalados (no él mismo) y canales con su ocupante", () => {
  assert.deepEqual(plano(S.stockGrabadoresAsignables(stock, null, nombre)), [["g", "NVR 1 (10.0.0.1)"]]);
  assert.deepEqual(plano(S.stockGrabadoresAsignables(stock, "g", nombre)), []);
  const canales = S.stockCanalesDe(stock, "g", null, nombre);
  assert.deepEqual(plano(canales), [{ canal: 1, ocupante: "" }, { canal: 2, ocupante: "Pasillo" }, { canal: 3, ocupante: "" },
    { canal: 4, ocupante: "" }]);
  assert.equal(S.stockCanalesDe(stock, "g", "c", nombre)[1].ocupante, "");          // el propio no lo ocupa
  assert.equal(S.stockPrimerCanalLibre(canales), "1");
  assert.equal(S.stockCanalesDe([{ id: "z", tipo: "nvr", instalacion: {} }], "z", null, nombre).length, 64);
});

test("cuerpo del formulario: grabador y canal viajan en la instalación (canal como número)", () => {
  const v = { ...S.stockValoresDeDispositivo(stock[4]) };
  assert.equal(v.grabador, "g");
  assert.equal(v.canal, "2");
  const cuerpo = S.stockPayload(v);
  assert.deepEqual([cuerpo.instalacion.grabador, cuerpo.instalacion.canal], ["g", 2]);
  assert.deepEqual(plano(S.stockPayload({ ...v, grabador: "", canal: "" }).instalacion).grabador, null);
});
