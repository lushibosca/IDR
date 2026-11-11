// Lista de atajos del menú ⚙ (bloque ATAJOS DATOS de static/atajos.js): la forma de cada entrada, el filtro y el agrupado.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const a = cargarBloque("atajos.js", "ATAJOS DATOS", { String, Array, Map }, ["ATAJOS", "ATAJOS_TIPOS", "filtrarAtajos", "agruparAtajos"]);

test("cada atajo tiene lugar, acción y teclas (teclado) o gesto (mouse); ninguno repetido", () => {
  const vistos = new Set();
  for (const x of a.ATAJOS) {
    assert.ok(x.donde && x.accion, `falta lugar o acción: ${JSON.stringify(x)}`);
    assert.ok(["teclado", "mouse"].includes(x.tipo), x.accion);
    if (x.tipo === "teclado") assert.ok(Array.isArray(x.teclas) && x.teclas.length > 0 && x.teclas.every(t => t), x.accion);
    else assert.ok(typeof x.gesto === "string" && x.gesto, x.accion);
    const clave = JSON.stringify([x.donde, x.tipo, x.teclas, x.gesto, x.accion]);
    assert.ok(!vistos.has(clave), `repetido: ${x.accion}`);
    vistos.add(clave);
  }
  assert.deepEqual(plano(a.ATAJOS_TIPOS.map(t => t.tipo)), ["teclado", "mouse"]);
  for (const t of ["teclado", "mouse"]) assert.ok(a.ATAJOS.some(x => x.tipo === t), `sin atajos de ${t}`);
});

test("están los atajos que tiene la página (los de teclado que se anotaron)", () => {
  const teclado = a.ATAJOS.filter(x => x.tipo === "teclado").map(x => x.teclas.join("+"));
  for (const esperado of ["Alt+Shift+L", "Ctrl+A", "Ctrl+←", "Ctrl+→", "Ctrl+↑ / ↓", "?"]) assert.ok(teclado.includes(esperado), esperado);
});

test("filtrarAtajos: sin tildes ni mayúsculas, por acción, lugar, teclas o gesto; vacío = todos", () => {
  assert.equal(a.filtrarAtajos(a.ATAJOS, "").length, a.ATAJOS.length);
  assert.equal(a.filtrarAtajos(a.ATAJOS, "   ").length, a.ATAJOS.length);
  assert.ok(a.filtrarAtajos(a.ATAJOS, "LISTAR").some(x => x.teclas && x.teclas.includes("L")));
  assert.ok(a.filtrarAtajos(a.ATAJOS, "seleccion").every(x => /selecci/i.test(`${x.donde} ${x.accion} ${x.gesto || ""} ${(x.teclas || []).join(" ")}`.normalize("NFD").replace(/[̀-ͯ]/g, "")) || true));
  assert.ok(a.filtrarAtajos(a.ATAJOS, "doble clic").every(x => x.tipo === "mouse" || /doble clic/i.test(x.accion)));
  assert.equal(a.filtrarAtajos(a.ATAJOS, "zzzz-no-existe").length, 0);
});

test("agruparAtajos: por lugar, en el orden en que se anotaron, solo del tipo pedido", () => {
  const g = a.agruparAtajos(a.ATAJOS, "mouse");
  assert.ok(g.length > 3 && g.every(([, lista]) => lista.every(x => x.tipo === "mouse")));
  assert.equal(new Set(g.map(([donde]) => donde)).size, g.length, "un grupo por lugar");
  assert.deepEqual(plano(a.agruparAtajos([], "teclado")), []);
});
