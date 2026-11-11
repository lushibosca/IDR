// Doble toque (bloque DOBLE TOQUE PURO de js/doble-toque.js): cuándo dos toques son un doble clic.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { esToqueCorto: corto, esDobleToque: doble } = cargarBloque("doble-toque.js", "DOBLE TOQUE PURO", { Math },
  ["esToqueCorto", "esDobleToque"]);

test("un toque corto no se arrastra ni se mantiene", () => {
  assert.equal(corto(120, 3), true);
  assert.equal(corto(300, 10), true);          // justo los límites
  assert.equal(corto(301, 3), false);          // pulsación larga
  assert.equal(corto(100, 11), false);         // arrastre
  assert.equal(corto(-1, 0), false);
  assert.equal(corto(150, 4, 200, 6), true);   // límites propios
  assert.equal(corto(250, 4, 200, 6), false);
});

test("doble toque: dos toques cortos seguidos al mismo lugar", () => {
  const a = { t: 1000, x: 100, y: 200 };
  assert.equal(doble(a, { t: 1200, x: 105, y: 203 }), true);
  assert.equal(doble(a, { t: 1350, x: 100, y: 200 }), true);     // justo los 350 ms
  assert.equal(doble(a, { t: 1351, x: 100, y: 200 }), false);    // tarde
  assert.equal(doble(a, { t: 1200, x: 140, y: 200 }), false);    // otro lugar (40 px)
  assert.equal(doble(a, { t: 1200, x: 120, y: 220 }), true);     // 28,3 px: dentro de los 30
});

test("sin toque anterior o con datos inválidos no es doble toque", () => {
  assert.equal(doble(null, { t: 1, x: 0, y: 0 }), false);
  assert.equal(doble({ t: 1, x: 0, y: 0 }, null), false);
  assert.equal(doble({ t: 2000, x: 0, y: 0 }, { t: 1000, x: 0, y: 0 }), false);   // el segundo no puede ser anterior
  assert.equal(doble({ t: 1000, x: 0, y: 0 }, { t: 1100, x: 0, y: 0 }, 50), false);   // límite propio de 50 ms
});
