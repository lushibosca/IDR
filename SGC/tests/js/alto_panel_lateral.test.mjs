// Alto del panel lateral anclado: con avisos arriba arranca más abajo y tiene que seguir entrando en la ventana
// (su botón «Ocultar» está al fondo).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { altoPanelLateral } = cargarBloque("app.js", "ALTO PANEL LATERAL PURO", { Number, Math }, ["altoPanelLateral"]);

test("anclado (sin avisos ni scroll): lo mismo que 100vh - navbar - 3rem", () => {
  // arriba = navbar (58) + 1.5rem (24) = 82; la ventana mide 900 y el margen de abajo es 24
  assert.equal(altoPanelLateral(82, 900, 24, 120), 900 - 58 - 48);
});

test("con un aviso arriba el panel arranca más abajo y se achica para que su fondo entre en la ventana", () => {
  const sinAviso = altoPanelLateral(82, 900, 24, 120);
  const conAviso = altoPanelLateral(82 + 70, 900, 24, 120);                     // un aviso de 70 px
  assert.equal(sinAviso - conAviso, 70);
  assert.ok(152 + conAviso + 24 <= 900);                                        // borde de abajo + margen dentro de la ventana
});

test("nunca más chico que el mínimo ni con datos inválidos", () => {
  assert.equal(altoPanelLateral(800, 900, 24, 120), 120);
  assert.equal(altoPanelLateral(NaN, 900, 24, 120), null);
  assert.equal(altoPanelLateral(82, undefined, 24, 120), null);
});
