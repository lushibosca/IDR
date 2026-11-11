// Borrado en dos pasos con vencimiento (bloque CONFIRMACION TEMPORIZADA PURO de static/comun.js).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { uiConfirmacionTemporizada, CONFIRMACION_MS } = cargarBloque("comun.js", "CONFIRMACION TEMPORIZADA PURO",
  { setTimeout, clearTimeout }, ["uiConfirmacionTemporizada", "CONFIRMACION_MS"]);

function relojFalso() {
  const pendientes = new Map();
  let n = 0;
  return {
    poner: (fn, ms) => { pendientes.set(++n, { fn, ms }); return n; },
    quitar: (id) => { pendientes.delete(id); },
    pendientes,
    disparar: () => { for (const [id, { fn }] of [...pendientes]) { pendientes.delete(id); fn(); } },
  };
}

test("la confirmación vence a los 3 s y vuelve sola", () => {
  const reloj = relojFalso();
  let vencio = 0;
  const c = uiConfirmacionTemporizada(() => { vencio++; }, CONFIRMACION_MS, reloj);
  assert.equal(CONFIRMACION_MS, 3000);
  c.armar();
  assert.equal([...reloj.pendientes.values()][0].ms, 3000);
  reloj.disparar();
  assert.equal(vencio, 1);
});

test("cancelar corta la cuenta; armar de nuevo reinicia (una sola cuenta a la vez)", () => {
  const reloj = relojFalso();
  let vencio = 0;
  const c = uiConfirmacionTemporizada(() => { vencio++; }, 3000, reloj);
  c.armar();
  c.cancelar();
  assert.equal(reloj.pendientes.size, 0);
  reloj.disparar();
  assert.equal(vencio, 0);
  c.armar();
  c.armar();
  assert.equal(reloj.pendientes.size, 1, "reiniciar no deja dos cuentas");
  reloj.disparar();
  assert.equal(vencio, 1);
  c.cancelar();                                   // ya vencida: cancelar no rompe
});
