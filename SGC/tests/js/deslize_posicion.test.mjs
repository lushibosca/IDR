// Posición del contenedor de las pestañas mientras se deslizan (bloque DESLIZE POSICION PURO de static/animaciones.js).
// Un cambio de pestaña rápido arranca el segundo deslizamiento antes de que termine el primero: la posición original solo se
// restaura al terminar el ÚLTIMO (antes se restauraba a mitad del segundo y quedaba `relative` para siempre).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { crearPosicionCompartida } = cargarBloque("animaciones.js", "DESLIZE POSICION PURO", { Math },
  ["crearPosicionCompartida"]);

test("un solo deslizamiento: al terminar vuelve a la posición que tenía", () => {
  const p = crearPosicionCompartida();
  p.tomar("");
  assert.equal(p.soltar(), "");
  const q = crearPosicionCompartida();
  q.tomar("static");
  assert.equal(q.soltar(), "static");
});

test("dos cambios seguidos: el primero que termina no suelta la posición, el último sí y con la ORIGINAL", () => {
  const p = crearPosicionCompartida();
  p.tomar("");              // primer cambio: el contenedor pasa a relative
  p.tomar("relative");     // segundo cambio, antes de que termine el primero: ve «relative», no la original
  assert.equal(p.enCurso(), 2);
  assert.equal(p.soltar(), null);          // termina el primero: todavía hay otro en curso
  assert.equal(p.soltar(), "");            // termina el segundo: vuelve a la original, no a «relative»
  assert.equal(p.enCurso(), 0);
});

test("tres cambios encadenados y luego uno solo: cada ronda empieza de nuevo", () => {
  const p = crearPosicionCompartida();
  p.tomar("");
  p.tomar("relative");
  p.tomar("relative");
  assert.deepEqual([p.soltar(), p.soltar(), p.soltar()], [null, null, ""]);
  p.tomar("sticky");
  assert.equal(p.soltar(), "sticky");
});

test("soltar de más no deja la cuenta en negativo", () => {
  const p = crearPosicionCompartida();
  assert.equal(p.soltar(), "");
  assert.equal(p.enCurso(), 0);
  p.tomar("x");
  assert.equal(p.soltar(), "x");
});
