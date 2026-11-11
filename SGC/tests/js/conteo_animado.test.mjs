// Conteo animado de los números principales de los chips (static/animaciones.js): el bloque puro y el que escribe
// el DOM (con requestAnimationFrame y la preferencia de movimiento inyectados).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const { partesConteo, avanceConteo, textoConteoEn, DUR_CONTEO_MS } = cargarBloque(
  "animaciones.js", "CONTEO ANIMADO PURO", {},
  ["partesConteo", "avanceConteo", "textoConteoEn", "DUR_CONTEO_MS"]);

function cargarConteo({ reducido = false } = {}) {
  const frames = new Map();
  let sig = 1;
  const globales = {
    WeakSet, WeakMap, Number, String, Math,
    prefiereMovimientoReducido: () => reducido,
    requestAnimationFrame: (fn) => { const id = sig++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  // el bloque del DOM usa las funciones del bloque puro
  const puras = cargarBloque("animaciones.js", "CONTEO ANIMADO PURO", {},
    ["partesConteo", "textoConteoEn", "tieneNumerosConteo", "avanceConteo", "DUR_CONTEO_MS"]);
  const api = cargarBloque("animaciones.js", "CONTEO ANIMADO", { ...globales, ...puras }, ["ponerTextoConteo"]);
  // corre los frames pendientes en el instante `ms`
  api.frame = (ms) => { const pend = [...frames.entries()]; frames.clear(); for (const [, fn] of pend) fn(ms); };
  api.pendientes = () => frames.size;
  return api;
}

test("partes: enteros y separadores tal cual", () => {
  assert.deepEqual(plano(partesConteo("12/15")), [12, "/", 15]);
  assert.deepEqual(plano(partesConteo("80%")), [80, "%"]);
  assert.deepEqual(plano(partesConteo("-/-")), ["-/-"]);
  assert.deepEqual(plano(partesConteo(7)), [7]);
});

test("avance: acotado, empieza en 0 y termina en 1, desacelera", () => {
  assert.equal(avanceConteo(-1), 0);
  assert.equal(avanceConteo(0), 0);
  assert.equal(avanceConteo(1), 1);
  assert.equal(avanceConteo(5), 1);
  assert.ok(avanceConteo(0.5) > 0.5);
});

test("texto intermedio: cada número sube desde 0; al final, el valor exacto", () => {
  const p = partesConteo("12/15");
  assert.equal(textoConteoEn(p, 0), "0/0");
  assert.equal(textoConteoEn(p, 1), "12/15");
  const medio = textoConteoEn(p, 0.5).split("/").map(Number);
  assert.ok(medio[0] > 0 && medio[0] < 12 && medio[1] > 0 && medio[1] < 15);
});

test("primer valor con números: cuenta desde 0 y termina en el valor", () => {
  const c = cargarConteo();
  const el = { textContent: "-/-" };
  c.ponerTextoConteo(el, "30/40");
  assert.equal(el.textContent, "0/0");
  c.frame(0);
  c.frame(DUR_CONTEO_MS / 2);
  assert.notEqual(el.textContent, "30/40");
  c.frame(DUR_CONTEO_MS);
  assert.equal(el.textContent, "30/40");
  assert.equal(c.pendientes(), 0);
});

test("después del primero, directo (el polling no reanima)", () => {
  const c = cargarConteo();
  const el = { textContent: "" };
  c.ponerTextoConteo(el, "3/4");
  c.frame(0); c.frame(DUR_CONTEO_MS);
  c.ponerTextoConteo(el, "4/4");
  assert.equal(el.textContent, "4/4");
  assert.equal(c.pendientes(), 0);
});

test("el marcador sin números no consume la animación", () => {
  const c = cargarConteo();
  const el = { textContent: "" };
  c.ponerTextoConteo(el, "-/-");
  assert.equal(el.textContent, "-/-");
  c.ponerTextoConteo(el, "50%");
  assert.equal(el.textContent, "0%");
});

test("el mismo valor durante la cuenta la deja seguir; otro valor la corta y queda el nuevo", () => {
  const c = cargarConteo();
  const el = { textContent: "" };
  c.ponerTextoConteo(el, "10");
  c.frame(0);
  c.ponerTextoConteo(el, "10");
  assert.equal(c.pendientes(), 1);
  c.ponerTextoConteo(el, "11");
  assert.equal(el.textContent, "11");
  assert.equal(c.pendientes(), 0);
});

test("alAvanzar acompaña la cuenta de 0 a 1 y termina en 1", () => {
  const c = cargarConteo();
  const el = { textContent: "" };
  const avances = [];
  c.ponerTextoConteo(el, "80%", (a) => avances.push(a));
  c.frame(0); c.frame(DUR_CONTEO_MS / 2); c.frame(DUR_CONTEO_MS);
  assert.equal(avances[0], 0);
  assert.ok(avances.some((a) => a > 0 && a < 1));
  assert.equal(avances.at(-1), 1);
  assert.ok(avances.every((a, i) => i === 0 || a >= avances[i - 1]));
});

test("alAvanzar con el valor puesto directo (repintado o cuenta cortada): un solo 1", () => {
  const c = cargarConteo();
  const el = { textContent: "" };
  c.ponerTextoConteo(el, "80%");
  c.frame(0);
  const avances = [];
  c.ponerTextoConteo(el, "81%", (a) => avances.push(a));
  assert.deepEqual(avances, [1]);
  assert.equal(el.textContent, "81%");
});

test("menos movimiento: directo, sin frames", () => {
  const c = cargarConteo({ reducido: true });
  const el = { textContent: "" };
  c.ponerTextoConteo(el, "3/4");
  assert.equal(el.textContent, "3/4");
  assert.equal(c.pendientes(), 0);
});
