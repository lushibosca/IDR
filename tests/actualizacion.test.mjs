// Actualización de la suite: el módulo compartido (shared/idr-actualizacion.js), la instalación del sw.js que informa el avance y que
// toda página lo cargue. Ejecutar desde la raíz: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ---- bloque puro del módulo compartido
function bloque(archivo, marcador, nombres) {
  const src = leer(archivo);
  const ini = `// ==== ${marcador} BEGIN ====`, fin = `// ==== ${marcador} END ====`;
  const a = src.indexOf(ini), b = src.indexOf(fin);
  assert.ok(a >= 0 && b > a, `sin marcadores ${marcador}`);
  const ctx = { Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a + ini.length, b) + `\nthis.__api = { ${nombres.join(", ")} };`, ctx);
  return ctx.__api;
}
const { idrPorcentajeValido: pct, idrTextoDescarga: texto, idrDebeBuscar: debeBuscar } = bloque(
  "shared/idr-actualizacion.js", "ACTUALIZACION PURO", ["idrPorcentajeValido", "idrTextoDescarga", "idrDebeBuscar"]);

test("porcentaje: entero entre 0 y 100, o null si no es un número", () => {
  assert.equal(pct(0), 0);
  assert.equal(pct(42.6), 43);
  assert.equal(pct("57"), 57);
  assert.equal(pct(150), 100);
  assert.equal(pct(-5), 0);
  for (const malo of [null, undefined, "", "abc", NaN, Infinity]) assert.equal(pct(malo), null, String(malo));
});

test("texto de la descarga: con el porcentaje si se conoce", () => {
  assert.equal(texto(null), "Descargando actualización");
  assert.equal(texto(40), "Descargando actualización · 40%");
  assert.equal(texto("x"), "Descargando actualización");
});

test("buscar una versión nueva al volver: no más de una vez por minuto", () => {
  assert.equal(debeBuscar(100000, 0, 60000), true);
  assert.equal(debeBuscar(30000, 0, 60000), false);
  assert.equal(debeBuscar(60000, 0, 60000), true);
  assert.equal(debeBuscar(30000, 0, undefined), false);      // sin valor válido: 60 s
  assert.equal(debeBuscar(70000, 0, NaN), true);
});

// ---- instalación del sw.js con todo simulado: progreso, todo o nada
function instalar({ falla = null, urls = null } = {}) {
  const mensajes = [], escuchas = {}, guardado = [];
  let omitioEspera = false;
  const clientes = [{ postMessage: (m) => mensajes.push(m) }];
  const self = {
    addEventListener: (tipo, fn) => { escuchas[tipo] = fn; },
    clients: { matchAll: async () => clientes, claim: async () => {} },
    skipWaiting: async () => { omitioEspera = true; },
  };
  const ctx = {
    self, location: { origin: "http://x" }, console: { log() {}, warn() {}, error() {} },
    URL, Response, Request: class { constructor(url, o) { this.url = url; this.o = o; } },
    caches: { open: async () => ({ put: async (u) => { guardado.push(u); }, add: async () => {}, addAll: async () => {} }),
      keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async (req) => ({ ok: req.url !== falla, status: req.url === falla ? 404 : 200 }),
  };
  vm.createContext(ctx);
  vm.runInContext(leer("sw.js"), ctx);
  const total = vm.runInContext("PRECACHE_URLS.length", ctx);
  let promesa = null;
  escuchas.install({ waitUntil: (p) => { promesa = p; } });
  return { promesa, mensajes, guardado, total, omitio: () => omitioEspera };
}

test("instalar: baja todo, avisa el avance de 0 a 100 sin retroceder y recién ahí toma el control", async () => {
  const r = instalar();
  await r.promesa;
  const prog = r.mensajes.filter((m) => m.tipo === "sw-progreso").map((m) => m.progreso);
  assert.equal(prog[0], 0);
  assert.equal(prog.at(-1), 100);
  assert.deepEqual(prog, [...prog].sort((a, b) => a - b), "el avance no retrocede");
  assert.equal(new Set(prog).size, prog.length, "no repite el mismo porcentaje");
  assert.equal(r.guardado.length, r.total, "se guardó todo lo listado");
  assert.ok(r.omitio(), "toma el control al terminar");
  assert.ok(!r.mensajes.some((m) => m.tipo === "sw-error"));
});

test("instalar: si falla un archivo avisa el error, falla toda la instalación y NO toma el control (queda la versión anterior)", async () => {
  const r = instalar({ falla: "./SGC/index.html" });
  await assert.rejects(r.promesa, /HTTP 404/);
  assert.ok(r.mensajes.some((m) => m.tipo === "sw-error"));
  assert.ok(!r.omitio());
});

// ---- toda página de la suite carga el módulo y ninguna registra el worker por su cuenta
const PAGINAS = { "index.html": "./sw.js", "SGC/index.html": "../sw.js", "SGI/index.html": "../sw.js", "SGL/index.html": "../sw.js",
  "SGP/index.html": "../sw.js", "SGR/index.html": "../sw.js" };

test("cada página carga shared/idr-actualizacion.js (con la ruta de su worker) y su hoja", () => {
  for (const [pagina, sw] of Object.entries(PAGINAS)) {
    const html = leer(pagina);
    const prefijo = pagina === "index.html" ? "./shared" : "../shared";
    const script = html.match(new RegExp(`<script src="${prefijo.replace(".", "\\.")}/idr-actualizacion\\.js"([^>]*)>`));
    assert.ok(script, `${pagina}: falta el script`);
    assert.ok(script[1].includes(`data-sw="${sw}"`), `${pagina}: data-sw debe ser ${sw}`);
    assert.ok(html.includes(`href="${prefijo}/idr-actualizacion.css"`), `${pagina}: falta la hoja`);
  }
});

test("el registro del worker vive solo en shared/idr-actualizacion.js (ninguna app lo repite)", () => {
  const repetidos = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!["node_modules", ".git", "tests", "Utilidades", "vendor"].includes(e.name)) recorrer(rel); }
      else if (/\.js$/.test(e.name) && rel !== "sw.js" && !/(^|\/)sw\.js$/.test(rel) && rel !== "shared/idr-actualizacion.js"
        && /serviceWorker\s*\.\s*register\s*\(/.test(leer(rel))) repetidos.push(rel);
    }
  };
  recorrer("");
  assert.deepEqual(repetidos, []);
});

test("el precache incluye el módulo de actualización y su hoja", () => {
  const sw = leer("sw.js");
  assert.ok(sw.includes("'./shared/idr-actualizacion.js'") && sw.includes("'./shared/idr-actualizacion.css'"));
});
