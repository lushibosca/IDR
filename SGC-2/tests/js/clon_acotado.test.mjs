// Fantasma de la pestaña que sale (bloque CLON ACOTADO PURO de static/animaciones.js): copia con tope de nodos.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { clonarAcotado } = cargarBloque("animaciones.js", "CLON ACOTADO PURO", { Array }, ["clonarAcotado"]);

// Nodo mínimo: lo que usa clonarAcotado (cloneNode(false), childNodes, appendChild)
const nodo = (nombre, hijos = []) => ({
  nombre, childNodes: hijos, copias: [],
  cloneNode() { return nodo(this.nombre); },
  appendChild(h) { this.copias.push(h); return h; },
});
const arbol = (n) => nodo("raiz", Array.from({ length: n }, (_, i) => nodo(`h${i}`)));
const contar = (c) => 1 + c.copias.reduce((a, h) => a + contar(h), 0);

test("un panel chico se copia entero", () => {
  assert.equal(contar(clonarAcotado(arbol(5), 1500)), 6);
});

test("un panel con más nodos que el tope se copia hasta el tope, de arriba hacia abajo (nunca se omite)", () => {
  const c = clonarAcotado(arbol(5000), 1500);
  assert.equal(contar(c), 1500);
  assert.deepEqual(c.copias.slice(0, 2).map(h => h.nombre), ["h0", "h1"]);
});
