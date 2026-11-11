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

test("CACHE_NAME tiene el formato idr-suite-vAAMMDD.HHMM", () => {
  assert.match(sw, /const CACHE_NAME = 'idr-suite-v\d{6}\.\d{4}';/);
});

test("todo lo listado en el precache existe (los directorios terminan en /)", () => {
  const faltan = PRECACHE.filter((u) => !u.endsWith("/") && !fs.existsSync(path.join(RAIZ, u)));
  assert.deepEqual(faltan, []);
});

test("sin entradas repetidas en el precache", () => {
  const repetidas = PRECACHE.filter((u, i) => PRECACHE.indexOf(u) !== i);
  assert.deepEqual(repetidas, []);
});

function sinPrecachear(dir) {
  const sin = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) {
        if (!["tests", "docs", "node_modules", "devices"].includes(e.name)) recorrer(rel);
      } else if (/\.(js|css|svg|html|json|woff2?)$/.test(e.name) && !PRECACHE.includes(`./${rel}`)) {
        sin.push(rel);
      }
    }
  };
  recorrer(dir);
  return sin;
}

test("SGC: todo js/css/svg/html/json de la app (menos fotos y tests) está en el precache", () => {
  assert.deepEqual(sinPrecachear("SGC"), [], "agregarlos a PRECACHE_URLS de sw.js");
});

test("shared/: todo lo compartido (scripts, base de estilo ui/, íconos y fuentes de vendor/) está en el precache", () => {
  assert.deepEqual(sinPrecachear("shared"), [], "agregarlos a PRECACHE_URLS de sw.js");
});

test("cada app tiene su fallback offline de navegación apuntando a su index.html precacheado", () => {
  for (const app of ["SGC", "SGI", "SGL", "SGP", "SGR"]) {
    assert.ok(sw.includes(`pathname.includes('/${app}')`), `${app}: falta en el fallback de navegación de sw.js`);
    assert.ok(sw.includes(`caches.match('./${app}/index.html')`), `${app}: el fallback no apunta a su index.html`);
    assert.ok(PRECACHE.includes(`./${app}/index.html`), `${app}: su index.html no está en el precache`);
  }
});

test("ya no queda nada de la carpeta SGC-2 (se renombró a SGC)", () => {
  assert.ok(!sw.includes("SGC-2"));
  assert.ok(!fs.existsSync(path.join(RAIZ, "SGC-2")));
});
