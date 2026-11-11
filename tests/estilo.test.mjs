// Base de estilo común de la suite (shared/ui/, diseño de SGC: docs/PORTE-ESTILO-SGC.md): las normas de SGC para sus JS
// compartidos, el CSS sin !important ni reglas muertas (contando lo que usan TODAS las apps que lo cargan) y que cada app
// portada cargue el esqueleto completo y en orden. Ejecutar desde la raíz: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPS_PORTADAS } from "./_apps.mjs";
import { reglas, clasesDe } from "../SGC/tests/js/_css.mjs";   // parser mínimo de CSS (rutas relativas a SGC/)

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"`])\/\/[^\n]*/g, "$1");

function archivos(dir, ext, excluir = ["tests", "vendor", "node_modules", "img", "icons", "docs"]) {
  const out = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { if (!excluir.includes(e.name)) recorrer(rel); }
      else if (e.name.endsWith(ext)) out.push(rel);
    }
  };
  recorrer(dir);
  return out.sort();
}

const JS_UI = archivos("shared/ui/js", ".js");
const CSS_UI = archivos("shared/ui", ".css");

// ─── JS compartido: mismas normas que SGC (SGC/tests/js/arquitectura.test.mjs)
const TOPES = { "shared/ui/js/ui.js": 761 };      // ya lo pasaba al moverlo de SGC: no puede crecer

test("shared/ui/js: tope de 500 líneas (o el congelado)", () => {
  const pasados = JS_UI.map((f) => [f, leer(f).split("\n").length - 1]).filter(([f, n]) => n > (TOPES[f] ?? 500));
  assert.deepEqual(pasados, []);
  for (const [f, tope] of Object.entries(TOPES)) {
    const n = leer(f).split("\n").length - 1;
    assert.ok(n > 500 && n >= tope, `${f} tiene ${n} líneas: bajar su tope (${tope}) o quitarlo`);
  }
});

test("shared/ui/js: sin innerHTML ni ejecución dinámica, y los bloques PURO sin DOM, storage ni red", () => {
  const sink = /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new Function\s*\(/;
  assert.deepEqual(JS_UI.filter((f) => sink.test(sinComentarios(leer(f)))), []);
  const prohibido = /\b(document|localStorage|sessionStorage|navigator|XMLHttpRequest)\b|\bfetch\s*\(/;
  const malos = [];
  for (const f of JS_UI) {
    const s = leer(f);
    for (const m of s.matchAll(/\/\/ ==== (.+?) BEGIN ====/g)) {
      if (!s.includes(`// ==== ${m[1]} END ====`)) malos.push(`${f}: ${m[1]} sin END`);
    }
    for (const m of s.matchAll(/\/\/ ==== ([^\n]*?PURO) BEGIN ====\n([\s\S]*?)\/\/ ==== \1 END ====/g)) {
      const hit = sinComentarios(m[2]).match(prohibido);
      if (hit) malos.push(`${f} · ${m[1]}: ${hit[0]}`);
    }
  }
  assert.deepEqual(malos, []);
});

// ─── CSS compartido
test("shared/ui: cero !important y todo dentro de una capa (@layer)", () => {
  const malos = [];
  for (const f of CSS_UI) {
    const s = leer(f).replace(/\/\*[\s\S]*?\*\//g, "");
    if (/!important/.test(s)) malos.push(`${f}: !important`);
    // fuera de @layer solo puede ir el orden de capas, el @import de los íconos (tokens.css) y «menos movimiento»
    // (utilidades.css: sin capa a propósito, para ganarle a todas sin !important)
    const suelto = s.replace(/@layer[^;{]*;/g, "").replace(/@import[^;]*;/g, "")
      .replace(/html\[data-movimiento="reducido"\][^{]*\{[^}]*\}/g, "").replace(/@layer[^{]*\{/g, "{");
    let prof = 0, fuera = "";
    for (const c of suelto) { if (c === "{") prof++; if (prof === 0 && c !== "}") fuera += c; if (c === "}") prof--; }
    if (fuera.trim()) malos.push(`${f}: reglas fuera de @layer («${fuera.trim().slice(0, 40)}»)`);
  }
  assert.deepEqual(malos, []);
});

// Clases que una app PUEDE usar (amplio a propósito: para decidir qué CSS está muerto, sobrar no importa): class="" del HTML,
// cada palabra de los literales de sus JS (y de los compartidos que carga) y los prefijos que se completan ('pre-' + x, `pre-${x}`).
function clasesDeApp(app) {
  const html = leer(`${app}/index.html`);
  const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map((m) => path.posix.normalize(`${app}/${m[1]}`))
    .filter((f) => fs.existsSync(path.join(RAIZ, f)));
  const js = scripts.map(leer).join("\n");
  const exactas = new Set();
  const patrones = [];
  for (const m of (html + js).matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach((c) => exactas.add(c));
  for (const m of js.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    for (const e of t.matchAll(/\$\{([^{}]*)\}/g)) for (const l of e[1].matchAll(/'([^']*)'|"([^"]*)"/g)) (l[1] ?? l[2]).split(/\s+/).forEach((c) => exactas.add(c));
    for (const tok of t.replace(/\$\{[^{}]*\}/g, "\u0000").split(/[\s.]+/)) {
      if (!tok.includes("\u0000")) { exactas.add(tok); continue; }
      const pre = tok.split("\u0000")[0];
      if (/^[a-z][\w-]*-$/.test(pre)) patrones.push(pre);
    }
  }
  for (const m of js.matchAll(/'([a-z][\w-]*-)'\s*\+/g)) patrones.push(m[1]);
  return (c) => exactas.has(c) || patrones.some((p) => c.startsWith(p));
}

test("shared/ui: sin CSS muerto (cada clase de un selector la usa al menos una app portada)", () => {
  const usadas = APPS_PORTADAS.map(clasesDeApp);
  const usada = (c) => usadas.some((u) => u(c));
  const muertos = CSS_UI.flatMap((f) => reglas(`../${f}`).filter((r) => !r.bloque)
    .flatMap((r) => r.selectores.filter((s) => clasesDe(s).some((c) => !usada(c))).map((s) => `${f}: ${s}`)));
  assert.deepEqual(muertos, []);
});

// ─── Cada app portada carga el esqueleto entero, en el orden de las capas
test("apps portadas: cargan la base (tokens primero, utilidades al final), el esqueleto, ui.js y la versión visible", () => {
  for (const app of APPS_PORTADAS) {
    const html = leer(`${app}/index.html`);
    const hojas = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map((m) => m[1]);
    const ui = hojas.filter((h) => h.startsWith("../shared/ui/"));
    assert.equal(ui[0], "../shared/ui/tokens.css", `${app}: tokens.css tiene que ser la primera hoja de la base`);
    assert.equal(ui.at(-1), "../shared/ui/utilidades.css", `${app}: utilidades.css va al final`);
    // (legado/: solo las apps con variables viejas de SGR/SGI/SGP; SGC no la carga)
    for (const f of CSS_UI.filter((c) => !c.includes("/js/") && !c.includes("/legado/"))) {
      assert.ok(hojas.includes(`../${f}`), `${app}: falta <link> a ../${f}`);
    }
    const propias = hojas.filter((h) => !h.startsWith("../shared/"));
    assert.ok(propias.every((h) => hojas.indexOf(h) > hojas.indexOf("../shared/ui/esqueleto.css")
      && hojas.indexOf(h) < hojas.indexOf("../shared/ui/utilidades.css")), `${app}: sus hojas van entre el esqueleto y utilidades`);
    for (const js of ["ui.js", "atras-modales.js", "busqueda-movil.js", "swipe-pestanas.js"]) {
      assert.ok(html.includes(`src="../shared/ui/js/${js}`), `${app}: falta ../shared/ui/js/${js}`);
    }
    assert.ok(html.includes('src="../shared/idr-tema.js"') && html.includes('src="../shared/idr-version.js"'), `${app}: tema y versión de la suite`);
    assert.match(html, new RegExp(`data-idr-version="${app}"`), `${app}: versión visible en Ajustes`);
    assert.doesNotMatch(html, /<svg[^>]*class="svg-sprites"/, `${app}: sin sprite SVG propio (íconos de bootstrap-icons)`);
    for (const id of ["app-main-row", "sidebar-col", "main-content-col", "v-pills-tab", "v-pills-tabContent",
      "sidebar-search-container", "global-search", "btn-buscar-movil"]) {
      assert.ok(html.includes(`id="${id}"`), `${app}: falta #${id} (lo esperan el esqueleto y sus scripts)`);
    }
  }
});

// ─── arranque.js (antes de pintar): el tema de la suite manda; si nadie eligió, el de la app
test("arranque.js: tema inicial", async () => {
  const { cargarBloque } = await import("./_bloque.mjs");
  const { idrTemaInicial: f } = cargarBloque("arranque.js", "ARRANQUE PURO", {}, ["idrTemaInicial"]);
  assert.equal(f(true, "light"), "dark");
  assert.equal(f(false, "dark"), "light");
  assert.equal(f(null, "dark"), "dark");
  assert.equal(f(null, "light"), "light");
  assert.equal(f(null, null), "light");
  assert.equal(f(null, "cualquiera"), "light");
});
