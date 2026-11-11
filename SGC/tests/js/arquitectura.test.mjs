// Normas de arquitectura de SGC (docs/ARQUITECTURA.md y CLAUDE.md). Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const archivos = fs.readdirSync(path.join(APP, "js")).filter((f) => f.endsWith(".js")).sort();
const fuente = (f) => fs.readFileSync(path.join(APP, "js", f), "utf8");
const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"`])\/\/[^\n]*/g, "$1");

// Tope de líneas: 500. Estos archivos ya lo pasaban al fijar la norma: no pueden crecer (al partirlos, bajar el número
// o borrar la entrada cuando queden por debajo de 500).
const MAX_LINEAS = 500;
const TOPES = {
  "animaciones.js": 809,
  "app.js": 2135,
  "busqueda.js": 523,
  "comun.js": 2018,
  "datos-puro.js": 1242,
  "favoritos.js": 501,
  "gist.js": 561,
  "produccion.js": 1662,
  "resumen.js": 1605,
  "stock-catalogos.js": 804,
  "stock-listar.js": 514,
  "stock-puro.js": 1134,
  "stock.js": 1898,
  "ui.js": 761,
};

test("cada js/ respeta su tope de líneas (500, o el congelado si ya lo pasaba)", () => {
  const pasados = [];
  for (const f of archivos) {
    const n = fuente(f).split("\n").length - 1;
    const tope = TOPES[f] ?? MAX_LINEAS;
    if (n > tope) pasados.push(`${f}: ${n} > ${tope}`);
  }
  assert.deepEqual(pasados, []);
});

test("los topes congelados no sobran: archivo que bajó de 500 sale de la lista, y el tope no queda holgado", () => {
  const sobran = [];
  for (const [f, tope] of Object.entries(TOPES)) {
    const n = fuente(f).split("\n").length - 1;
    if (n <= MAX_LINEAS) sobran.push(`${f} ya tiene ${n} líneas: quitarlo de TOPES`);
    else if (n < tope) sobran.push(`${f} tiene ${n} líneas: bajar su tope de ${tope} a ${n}`);
  }
  assert.deepEqual(sobran, []);
});

test("index.html carga cada js/ una vez y no queda ninguno huérfano", () => {
  const cargados = [...html.matchAll(/<script src="js\/([^"?]+)/g)].map((m) => m[1]);
  assert.deepEqual(cargados.filter((f, i) => cargados.indexOf(f) !== i), [], "repetidos");
  assert.deepEqual(archivos.filter((f) => !cargados.includes(f)), [], "sin <script>");
  assert.deepEqual(cargados.filter((f) => !archivos.includes(f)), [], "<script> sin archivo");
});

test("los bloques PURO no tocan DOM, storage ni red (el reloj y los efectos se inyectan)", () => {
  const prohibido = /\b(document|localStorage|sessionStorage|navigator|XMLHttpRequest)\b|\bfetch\s*\(/;
  const malos = [];
  let bloques = 0;
  for (const f of archivos) {
    const re = /\/\/ ==== ([^\n]*?PURO) BEGIN ====\n([\s\S]*?)\/\/ ==== \1 END ====/g;
    let m;
    while ((m = re.exec(fuente(f)))) {
      bloques++;
      const hit = sinComentarios(m[2]).match(prohibido);
      if (hit) malos.push(`${f} · ${m[1]}: ${hit[0]}`);
    }
  }
  assert.ok(bloques > 20, "no se encontraron los bloques PURO");
  assert.deepEqual(malos, []);
});

test("cada marcador BEGIN tiene su END", () => {
  const malos = [];
  for (const f of archivos) {
    const s = fuente(f);
    for (const m of s.matchAll(/\/\/ ==== (.+?) BEGIN ====/g)) {
      if (!s.includes(`// ==== ${m[1]} END ====`)) malos.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(malos, []);
});

test("sin sinks de HTML ni ejecución dinámica: innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function", () => {
  const sink = /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new Function\s*\(/;
  const malos = archivos.filter((f) => sink.test(sinComentarios(fuente(f))));
  assert.deepEqual(malos, []);
});

test("index.html sin handlers inline ni scripts inline (CSP script-src 'self')", () => {
  assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>\s*\S/);
});

test("las claves de localStorage llevan el prefijo sgc2/ (la suite comparte el origen)", () => {
  // Todo acceso pasa por PREFIJO_ALMACEN (comun.js), por CLAVE (api-local.js) o por 'sgc2/' + ... (preload.js).
  assert.match(fuente("comun.js"), /const PREFIJO_ALMACEN = 'sgc2\/';/);
  assert.match(fuente("api-local.js"), /const CLAVE = 'sgc2\//);
  const malos = [];
  for (const f of archivos) {
    const s = sinComentarios(fuente(f));
    for (const m of s.matchAll(/localStorage\.(?:setItem|getItem|removeItem)\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      const ok = /^(PREFIJO_ALMACEN\b|CLAVE$|'sgc2\/')/.test(arg);
      if (!ok) malos.push(`${f}: ${arg}`);
    }
  }
  assert.deepEqual(malos, []);
});
