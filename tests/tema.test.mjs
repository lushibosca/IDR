// Tema compartido de la suite (shared/idr-tema.js): una sola clave, IDR_dark, para el launcher y todas las apps.
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
  const src = leer("shared/idr-tema.js");
  const ini = "// ==== TEMA SUITE PURO BEGIN ====", fin = "// ==== TEMA SUITE PURO END ====";
  const a = src.indexOf(ini), b = src.indexOf(fin);
  assert.ok(a >= 0 && b > a);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a + ini.length, b) + "\nthis.__f = idrTemaDesdeValor;", ctx);
  return ctx.__f;
}

test("IDR_dark: '1' es oscuro, '0' claro y cualquier otra cosa, sin elegir", () => {
  const f = bloque();
  assert.equal(f("1"), true);
  assert.equal(f("0"), false);
  for (const otro of [null, undefined, "", "true", "dark", "2", 1, 0]) assert.equal(f(otro), null, String(otro));
});

test("IDRTema lee, guarda y avisa los cambios de otra pestaña (con el almacenamiento simulado)", () => {
  const datos = new Map(), escuchas = [];
  const ctx = {
    localStorage: { getItem: (k) => (datos.has(k) ? datos.get(k) : null), setItem: (k, v) => datos.set(k, String(v)) },
    window: { addEventListener: (t, fn) => escuchas.push([t, fn]) },
  };
  vm.createContext(ctx);
  vm.runInContext(leer("shared/idr-tema.js") + "\nthis.T = IDRTema;", ctx);
  const T = ctx.T;
  assert.equal(T.CLAVE, "IDR_dark");
  assert.equal(T.oscuro(), null);                           // nadie eligió
  T.guardar(true);  assert.equal(datos.get("IDR_dark"), "1"); assert.equal(T.oscuro(), true);
  T.guardar(false); assert.equal(datos.get("IDR_dark"), "0"); assert.equal(T.oscuro(), false);
  const vistos = [];
  T.alCambiar((v) => vistos.push(v));
  const [tipo, fn] = escuchas[0];
  assert.equal(tipo, "storage");
  fn({ key: "IDR_dark", newValue: "1" });
  fn({ key: "otra", newValue: "0" });                       // otra clave: se ignora
  fn({ key: "IDR_dark", newValue: null });                  // borrada: no es un tema
  assert.deepEqual(vistos, [true]);
});

test("sin almacenamiento (modo privado, bloqueado) no rompe: devuelve null y guardar no lanza", () => {
  const ctx = { localStorage: { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } },
    window: { addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(leer("shared/idr-tema.js") + "\nthis.T = IDRTema;", ctx);
  assert.equal(ctx.T.oscuro(), null);
  assert.doesNotThrow(() => ctx.T.guardar(true));
});

test("el launcher y todas las apps leen la misma clave IDR_dark (o usan IDRTema)", () => {
  // Las portadas al diseño de SGC (tests/_apps.mjs) lo hacen con ../shared/ui/js/arranque.js (antes de pintar) y apariencia.js
  const fuentes = { launcher: ["flash.js", "app.js"], SGI: ["SGI/flash.js", "SGI/app.js"], SGR: ["SGR/flash.js", "SGR/app.js"],
    SGL: ["SGL/flash.js", "SGL/app.js"], SGP: ["SGP/flash.js", "SGP/app.js"] };
  for (const [app, archivos] of Object.entries(fuentes)) {
    if (APPS_PORTADAS.includes(app)) continue;
    const texto = archivos.map((f) => leer(f)).join("\n");
    assert.ok(/IDR_dark/.test(texto), `${app} no usa IDR_dark`);
  }
  const sgc = leer("SGC/js/app.js") + leer("shared/ui/js/apariencia.js");
  assert.ok(/IDRTema/.test(sgc), "SGC debe usar IDRTema");
  assert.ok(leer("SGC/index.html").includes('src="../shared/idr-tema.js"'), "SGC carga el módulo en el <head>");
  assert.ok(leer("SGC/index.html").indexOf("idr-tema.js") < leer("SGC/index.html").indexOf("ui/js/arranque.js"), "antes de arranque.js");
  assert.ok(leer("SGC/index.html").includes('data-clave-tema="sgc2/theme"'), "SGC conserva sgc2/theme como respaldo del tema");
  for (const app of APPS_PORTADAS.filter((a) => a !== "SGC")) {
    const html = leer(`${app}/index.html`);
    const cabeza = html.slice(0, html.indexOf("</head>"));
    assert.ok(cabeza.includes('src="../shared/idr-tema.js"'), `${app}: idr-tema.js en el <head>`);
    assert.ok(cabeza.indexOf("idr-tema.js") < cabeza.indexOf("ui/js/arranque.js"), `${app}: arranque.js después de idr-tema.js`);
    assert.ok(cabeza.indexOf("ui/js/arranque.js") < cabeza.indexOf('rel="stylesheet"'), `${app}: el tema se pone antes de las hojas`);
    assert.ok(html.includes('src="../shared/ui/js/apariencia.js"'), `${app}: el interruptor del tema (apariencia.js)`);
    assert.ok(!fs.existsSync(path.join(RAIZ, app, "flash.js")), `${app}: flash.js ya no hace falta (lo reemplaza arranque.js)`);
  }
  assert.match(leer("shared/ui/js/apariencia.js"), /IDRTema\.guardar/);
  assert.match(leer("shared/ui/js/arranque.js"), /IDRTema\.oscuro/);
});

test("el precache incluye el módulo del tema", () => {
  assert.ok(leer("sw.js").includes("'./shared/idr-tema.js'"));
});
