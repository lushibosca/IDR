// Reglas de la suite (ver CLAUDE.md de la raíz): el sw.js único tiene que cubrir lo que las apps cargan.
// Ejecutar desde la raíz: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sw = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
const PRECACHE = [...sw.matchAll(/^\s*'(\.\/[^']*)',?\s*$/gm)].map((m) => m[1]);

test("CACHE_NAME tiene el formato idr-suite-AAMMDD.HHMM", () => {
  assert.match(sw, /const CACHE_NAME = 'idr-suite-\d{6}\.\d{4}';/);
});

test("todo lo listado en el precache existe (los directorios terminan en /)", () => {
  const faltan = PRECACHE.filter((u) => !u.endsWith("/") && !fs.existsSync(path.join(RAIZ, u)));
  assert.deepEqual(faltan, []);
});

test("sin entradas repetidas en el precache", () => {
  const repetidas = PRECACHE.filter((u, i) => PRECACHE.indexOf(u) !== i);
  assert.deepEqual(repetidas, []);
});

test("SGC: todo js/css/svg/html/json de la app (menos fotos y tests) está en el precache", () => {
  const sin = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (!["tests", "docs", "node_modules", "devices"].includes(e.name)) recorrer(rel);
      } else if (/\.(js|css|svg|html|json|woff2?)$/.test(e.name) && !PRECACHE.includes(`./${rel}`)) {
        sin.push(rel);
      }
    }
  };
  recorrer("SGC");
  assert.deepEqual(sin, [], "agregarlos a PRECACHE_URLS de sw.js");
});

test("el fallback offline de /SGC apunta a un archivo precacheado", () => {
  assert.ok(sw.includes("caches.match('./SGC/index.html')"));
  assert.ok(PRECACHE.includes("./SGC/index.html"));
});

test("ya no queda nada de la carpeta SGC-2 (se renombró a SGC)", () => {
  assert.ok(!sw.includes("SGC-2"));
  assert.ok(!fs.existsSync(path.join(RAIZ, "SGC-2")));
});
