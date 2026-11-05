// Clic que termina una selección de texto en Producción y Activos (lista): no abre el popup del equipo.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { haySeleccionTextoEn, userSelectEfectivo, debeSoltarSeleccion } = cargarBloque(
  "comun.js", "SELECCION TEXTO PURO", { String, Array, Boolean }, ["haySeleccionTextoEn", "userSelectEfectivo", "debeSoltarSeleccion"]);

function seleccion(texto, tocados) {
  const rango = { intersectsNode: (n) => tocados.includes(n) };
  return { isCollapsed: !texto, rangeCount: texto ? 1 : 0, toString: () => texto, getRangeAt: () => rango };
}

test("una selección no vacía que toca el equipo frena el popup", () => {
  const item = {};
  assert.equal(haySeleccionTextoEn(item, seleccion("10.0.0.5", [item])), true);
});

test("clic normal, selección vacía o en otra parte de la página: el popup abre", () => {
  const item = {}, otro = {};
  assert.equal(haySeleccionTextoEn(item, seleccion("", [item])), false);
  assert.equal(haySeleccionTextoEn(item, seleccion("   ", [item])), false);
  assert.equal(haySeleccionTextoEn(item, seleccion("Entrada", [otro])), false);
  assert.equal(haySeleccionTextoEn(item, null), false);
  assert.equal(haySeleccionTextoEn(null, seleccion("x", [item])), false);
});

test("userSelect efectivo: el primero que no es auto, de adentro hacia afuera", () => {
  assert.equal(userSelectEfectivo(["auto", "auto", "none"]), "none");        // hereda de body
  assert.equal(userSelectEfectivo(["auto", "text", "none"]), "text");        // un valor seleccionable adentro
  assert.equal(userSelectEfectivo(["none", "text"]), "none");
  assert.equal(userSelectEfectivo([]), "auto");
  assert.equal(userSelectEfectivo(null), "auto");
});

test("un clic principal sobre algo no seleccionable suelta la selección; sobre algo seleccionable o con otro botón, no", () => {
  assert.equal(debeSoltarSeleccion(true, 0, ["auto", "none"]), true);
  assert.equal(debeSoltarSeleccion(true, 0, ["text", "none"]), false);       // clic en otro valor seleccionable
  assert.equal(debeSoltarSeleccion(true, 2, ["auto", "none"]), false);       // botón derecho (menú para copiar)
  assert.equal(debeSoltarSeleccion(false, 0, ["auto", "none"]), false);      // nada que soltar
});
