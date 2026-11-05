// Reubicar con recorrido visible (uiAnimarReubicacion, bloque UI COMUN de static/comun.js): lo comparten las columnas
// del modal Listar y las secciones reubicables del panel de Estado. DOM mínimo falso.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const cuadros = [];
let reducido = false;
const { uiAnimarReubicacion } = cargarBloque("comun.js", "UI COMUN", {
  Map, Math, requestAnimationFrame: (f) => cuadros.push(f), prefiereMovimientoReducido: () => reducido,
}, ["uiAnimarReubicacion"]);

function armar() {
  const pos = new Map([["a", { left: 0, top: 0 }], ["b", { left: 0, top: 100 }], ["c", { left: 0, top: 200 }]]);
  const els = [...pos.keys()].map((id) => ({
    id, style: {}, offsetHeight: 1, oyentes: new Map(),
    getBoundingClientRect() { return pos.get(id); },
    addEventListener(t, f) { this.oyentes.set(t, f); }, removeEventListener(t) { this.oyentes.delete(t); },
  }));
  return { pos, els, por: (id) => els.find((e) => e.id === id) };
}

test("lo que cambia de lugar arranca donde estaba y se desliza al nuevo; lo demás no se toca", () => {
  cuadros.length = 0;
  const { pos, els, por } = armar();
  const animados = uiAnimarReubicacion(() => els, (e) => e.id, () => {      // a y b se intercambian
    pos.set("a", { left: 0, top: 100 });
    pos.set("b", { left: 0, top: 0 });
  }, { encima: por("a") });
  assert.deepEqual(Array.from(animados, (e) => e.id), ["a", "b"]);   // arrays del contexto vm
  assert.equal(por("a").style.transform, "translate(0px, -100px)");
  assert.equal(por("b").style.transform, "translate(0px, 100px)");
  assert.equal(por("a").style.zIndex, "3");                                   // la arrastrada, por encima
  assert.equal(por("b").style.zIndex, "2");
  assert.equal(por("c").style.transform, "");
  assert.equal(por("c").style.zIndex, undefined);
  cuadros.forEach((f) => f());                                                // PLAY
  assert.equal(por("a").style.transform, "");
  assert.match(por("a").style.transition, /^transform 0\.28s/);
  por("a").oyentes.get("transitionend")({ propertyName: "transform" });     // al terminar, sin estilos propios
  assert.equal(por("a").style.transition, "");
  assert.equal(por("a").style.zIndex, "");
});

test("con menos movimiento o sin elementos previos solo se aplica el cambio", () => {
  const { pos, els, por } = armar();
  let cambiado = 0;
  reducido = true;
  assert.equal(uiAnimarReubicacion(() => els, (e) => e.id, () => { cambiado++; pos.set("a", { left: 0, top: 300 }); }).length, 0);
  reducido = false;
  assert.equal(cambiado, 1);
  assert.equal(por("a").style.transform, undefined);
  assert.equal(uiAnimarReubicacion(() => [], (e) => e.id, () => { cambiado++; }).length, 0);
  assert.equal(cambiado, 2);
});
