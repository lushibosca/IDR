// Pruebas unitarias para atajos de teclado y selección de pestaña en Catálogos
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const plano = (x) => JSON.parse(JSON.stringify(x));      // los arreglos del bloque son de otro contexto
const minus = (v, term) => String(v).toLowerCase().includes(String(term).toLowerCase());
const api = cargarBloque("stock-catalogos.js", "STOCK CATALOGOS PURO",
  { RegExp, String, Number, Array, stockMatchTexto: minus, stockCompararTexto: (a, b) => a.localeCompare(b) }, [
  "stockEsTeclaBusquedaCatalogo",
  "stockIdInputBusquedaPestana",
  "stockModelosValidos",
  "stockClaveModelo",
  "stockModelosVisibles", "stockEtiquetaModelo"
]);

test("stockEsTeclaBusquedaCatalogo: letras a-z (ambas cajas) y números inician la búsqueda", () => {
  for (const t of ["a", "b", "m", "z", "A", "Z", "0", "5", "9"]) {
    assert.equal(api.stockEsTeclaBusquedaCatalogo(t, false), true, `tecla: ${t}`);
  }
});

test("stockEsTeclaBusquedaCatalogo: símbolos, espacios y teclas de navegación no inician búsqueda", () => {
  for (const t of [" ", ".", ",", "-", "_", "/", ":", ";", "Enter", "Tab", "Escape", "ArrowDown", "Backspace"]) {
    assert.equal(api.stockEsTeclaBusquedaCatalogo(t, false), false, `tecla: ${t}`);
  }
});

test("stockEsTeclaBusquedaCatalogo: modificadores (Ctrl, Meta, Alt) bloquean la búsqueda rápida", () => {
  assert.equal(api.stockEsTeclaBusquedaCatalogo("a", true), false);
  assert.equal(api.stockEsTeclaBusquedaCatalogo("Z", true), false);
  assert.equal(api.stockEsTeclaBusquedaCatalogo("1", true), false);
});

test("stockEsTeclaBusquedaCatalogo: valores no válidos o caracteres fuera de rango son rechazados", () => {
  for (const t of ["", "ab", null, undefined, 12, "ñ", "á"]) {
    assert.equal(api.stockEsTeclaBusquedaCatalogo(t, false), false, `invalido: ${t}`);
  }
});

test("stockIdInputBusquedaPestana: mapea cada pestaña a su campo de búsqueda correspondiente", () => {
  assert.equal(api.stockIdInputBusquedaPestana("edificio"), "stock-ubi-input-edificio");
  assert.equal(api.stockIdInputBusquedaPestana("piso"), "stock-ubi-input-piso");
  assert.equal(api.stockIdInputBusquedaPestana("dispositivos"), "stock-cat-grupo-nombre");
  assert.equal(api.stockIdInputBusquedaPestana("desconocido"), null);
  assert.equal(api.stockIdInputBusquedaPestana(null), null);
});

test("modelos: campo de búsqueda de su pestaña, validación de la respuesta y clave sin mayúsculas ni espacios de más", () => {
  assert.equal(api.stockIdInputBusquedaPestana("modelos"), "stock-mod-input");
  assert.equal(api.stockModelosValidos({ modelos: [{ marca: "A", modelo: "B", usos: 2, pagina: null }] }), true);
  for (const mal of [null, {}, { modelos: [{ marca: "A", modelo: "B", usos: "2", pagina: null }] },
    { modelos: [{ marca: "A", modelo: 5, usos: 1, pagina: null }] }, { modelos: [{ marca: "A", modelo: "B", usos: 1 }] }]) {
    assert.equal(api.stockModelosValidos(mal), false);
  }
  assert.equal(api.stockClaveModelo({ marca: " Hikvision ", modelo: "DS-2CD  2143" }),
    api.stockClaveModelo({ marca: "", modelo: "ds-2cd 2143" }));                // la marca no cuenta
  assert.notEqual(api.stockClaveModelo({ modelo: "DS-2CD2143" }), api.stockClaveModelo({ modelo: "DS-2CD2386" }));
});

test("modelos: los que no tienen página van primero; filtro «sin página» y búsqueda por marca o modelo", () => {
  const m = [{ marca: "Hikvision", modelo: "DS-2", usos: 3, pagina: "https://a.com" },
    { marca: "Axis", modelo: "P3245", usos: 1, pagina: null }, { marca: "Bosch", modelo: "X", usos: 1, pagina: null }];
  assert.deepEqual(plano(api.stockModelosVisibles(m).map(x => x.marca)), ["Axis", "Bosch", "Hikvision"]);
  assert.deepEqual(plano(api.stockModelosVisibles(m, { soloSinPagina: true }).map(x => x.marca)), ["Axis", "Bosch"]);
  assert.deepEqual(plano(api.stockModelosVisibles(m, { texto: "ds-2" }).map(x => x.marca)), ["Hikvision"]);
  assert.deepEqual(plano(api.stockModelosVisibles(m, { soloSinPagina: true, texto: "hik" })), []);
  assert.equal(m.length, 3);                       // no reordena la lista original
});

test("modelos: se muestran «modelo - marca» y en orden alfabético por modelo (sin página primero)", () => {
  const m = [{ marca: "Axis", modelo: "Z9", pagina: null }, { marca: "Bosch", modelo: "B1", pagina: "https://a.com" },
    { marca: "Hikvision", modelo: "A2", pagina: "https://b.com" }, { marca: "Dahua", modelo: "B1", pagina: "https://c.com" }];
  assert.deepEqual(plano(api.stockModelosVisibles(m).map(api.stockEtiquetaModelo)),
    ["Z9 - Axis", "A2 - Hikvision", "B1 - Bosch", "B1 - Dahua"]);
  assert.equal(api.stockEtiquetaModelo({ marca: "", modelo: "X" }), "X");
});
