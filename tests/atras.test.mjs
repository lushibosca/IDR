// «Atrás» cierra la capa de arriba (shared/idr-atras.js): la pila pura con una historia simulada, y el módulo con un navegador falso.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { APPS_PORTADAS } from "./_apps.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function bloque() {
  const src = leer("shared/idr-atras.js");
  const ini = "// ==== ATRAS PURO BEGIN ====", fin = "// ==== ATRAS PURO END ====";
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf(ini) + ini.length, src.indexOf(fin)) + "\nthis.f = idrCrearPilaAtras;", ctx);
  return ctx.f;
}

// historia simulada: entradas como un navegador (la actual y las de atrás), con el popstate que provoca cada go
function historiaFalsa() {
  const h = { entradas: ["pagina"], pos: 0, empujadas: [], goes: [], pendientes: 0 };
  h.empujar = (id) => { h.entradas.splice(h.pos + 1); h.entradas.push(id); h.pos++; h.empujadas.push(id); };
  h.volver = (n) => { h.goes.push(n); h.pos -= n; h.pendientes++; };
  return h;
}

test("abrir una capa guarda una entrada del historial; abrir la misma otra vez no repite", () => {
  const h = historiaFalsa(), p = bloque()(h);
  p.abrir("a", () => true); p.abrir("a", () => true);
  assert.deepEqual(h.empujadas, ["a"]);
  assert.deepEqual([...p.abiertas], ["a"]);
});

test("cerrar la capa por su cuenta (X, fondo, Escape) saca su entrada con un go(-1) y ese popstate se ignora", () => {
  const h = historiaFalsa(), p = bloque()(h);
  let cerrada = 0;
  p.abrir("a", () => { cerrada++; return true; });
  assert.equal(p.cerrada("a"), true);
  assert.equal(p.vaciar(), 1);
  assert.deepEqual(h.goes, [1]);
  assert.equal(p.alVolverAtras(), false, "el popstate del go es nuestro: no cierra nada");
  assert.equal(cerrada, 0);
  assert.deepEqual([...p.abiertas], []);
});

test("el «atrás» del sistema cierra la capa de arriba y no toca el historial", () => {
  const h = historiaFalsa(), p = bloque()(h);
  const cierres = [];
  p.abrir("a", () => { cierres.push("a"); return true; });
  p.abrir("b", () => { cierres.push("b"); return true; });
  assert.equal(p.alVolverAtras(), true);
  assert.deepEqual(cierres, ["b"]);
  assert.deepEqual([...p.abiertas], ["a"]);
  assert.equal(p.cerrada("b"), false, "su cierre avisa después: ya estaba fuera, no vuelve a sacar una entrada");
  assert.equal(p.vaciar(), 0);
  assert.deepEqual(h.goes, []);
  assert.equal(p.alVolverAtras(), true);
  assert.deepEqual(cierres, ["b", "a"]);
});

test("sin capas abiertas el «atrás» no hace nada (sale de la página como siempre)", () => {
  const p = bloque()(historiaFalsa());
  assert.equal(p.alVolverAtras(), false);
});

test("cerrar varias capas de una vez saca todas sus entradas con un solo go(-n) y un solo popstate ignorado", () => {
  const h = historiaFalsa(), p = bloque()(h);
  for (const id of ["a", "b", "c"]) p.abrir(id, () => true);
  p.cerrada("c"); p.cerrada("b"); p.cerrada("a");
  assert.equal(p.vaciar(), 3);
  assert.deepEqual(h.goes, [3]);
  assert.equal(p.alVolverAtras(), false);
  assert.equal(p.alVolverAtras(), false, "y no queda nada que cerrar");
});

test("si la capa no se deja cerrar, sigue abierta y recupera su entrada (otro «atrás» vuelve a intentarlo)", () => {
  const h = historiaFalsa(), p = bloque()(h);
  let dejar = false;
  p.abrir("a", () => dejar);
  assert.equal(p.alVolverAtras(), false);
  assert.deepEqual([...p.abiertas], ["a"]);
  assert.deepEqual(h.empujadas, ["a", "a"], "se volvió a empujar su entrada");
  dejar = true;
  assert.equal(p.alVolverAtras(), true);
  assert.deepEqual([...p.abiertas], []);
});

test("un go de nuestro código y un «atrás» real seguidos no se confunden", () => {
  const h = historiaFalsa(), p = bloque()(h);
  p.abrir("a", () => true); p.abrir("b", () => true);
  p.cerrada("b"); p.vaciar();                       // se cerró b por su X: go(-1) pendiente
  assert.equal(p.alVolverAtras(), false);           // su popstate
  assert.equal(p.alVolverAtras(), true);            // ahora sí el usuario vuelve atrás: cierra a
  assert.deepEqual([...p.abiertas], []);
});

test("el módulo: abrir empuja una entrada, el popstate cierra y una recarga con una entrada de capa la deja normal", () => {
  const llamadas = [], escuchas = {};
  const ctx = {
    history: { state: { idrCapa: "viejo" }, pushState: (s) => llamadas.push(["push", s.idrCapa]), go: (n) => llamadas.push(["go", n]),
      replaceState: (s) => { llamadas.push(["replace", s]); } },
    window: { addEventListener: (t, f) => { escuchas[t] = f; } },
    setTimeout: (f) => f(),
  };
  vm.createContext(ctx);
  vm.runInContext(leer("shared/idr-atras.js") + "\nthis.A = IDRAtras;", ctx);
  assert.deepEqual(llamadas[0], ["replace", null], "la entrada de capa que sobrevivió a una recarga se normaliza");
  let cierres = 0;
  ctx.A.abrir("modal:x", () => { cierres++; return true; });
  assert.deepEqual(llamadas.at(-1), ["push", "modal:x"]);
  escuchas.popstate();
  assert.equal(cierres, 1);
  ctx.A.abrir("modal:y", () => true);
  ctx.A.cerrada("modal:y");
  assert.deepEqual(llamadas.at(-1), ["go", -1]);
});

test("las apps portadas conectan los modales y el buscador (shared/ui/js/atras-modales.js), y el precache incluye los módulos", () => {
  const sw = leer("sw.js");
  assert.ok(sw.includes("'./shared/idr-atras.js'") && sw.includes("'./shared/ui/js/atras-modales.js'"));
  assert.ok(/IDRAtras\.abrir\('busqueda-movil'/.test(leer("shared/ui/js/busqueda-movil.js")));
  for (const app of APPS_PORTADAS) {
    const html = leer(`${app}/index.html`);
    assert.ok(html.includes('src="../shared/idr-atras.js"'), `${app}: falta ../shared/idr-atras.js`);
    assert.ok(html.includes('src="../shared/ui/js/atras-modales.js'), `${app}: falta ../shared/ui/js/atras-modales.js`);
    assert.ok(html.indexOf("idr-atras.js") < html.indexOf("atras-modales.js"), `${app}: idr-atras.js va antes`);
    assert.ok(html.indexOf("ui/js/ui.js") < html.indexOf("atras-modales.js"), `${app}: ui.js va antes de atras-modales.js`);
  }
});
