// Versión de la suite: IDR_VERSION (shared/idr-version.js, la que se muestra en los Ajustes) y CACHE_NAME (sw.js) van juntas;
// `npm run release` sube las dos. Ejecutar desde la raíz: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

test("IDR_VERSION coincide con el prefijo de CACHE_NAME en sw.js (npm run release sube las dos)", () => {
  const version = leer("shared/idr-version.js").match(/IDR_VERSION\s*=\s*'([^']+)'/)?.[1];
  const cache = leer("sw.js").match(/CACHE_NAME\s*=\s*'idr-suite-([^']+)'/)?.[1];
  assert.match(version, /^v\d{6}$/, "IDR_VERSION debe ser vAAMMDD");
  assert.ok(cache, "no se encontró CACHE_NAME");
  assert.ok(cache.startsWith(`${version}.`), `CACHE_NAME "${cache}" debe empezar con "${version}."`);
});

test("la etiqueta de la versión: «NOMBRE-vAAMMDD», o solo la versión sin nombre", () => {
  const ctx = {};
  vm.createContext(ctx);
  const src = leer("shared/idr-version.js");
  const ini = "// ==== VERSION PURO BEGIN ====", fin = "// ==== VERSION PURO END ====";
  vm.runInContext(src.slice(src.indexOf(ini) + ini.length, src.indexOf(fin)) + "\nthis.f = idrEtiquetaVersion;", ctx);
  assert.equal(ctx.f("SGC", "v261111"), "SGC-v261111");
  assert.equal(ctx.f("  SGR ", "v261111"), "SGR-v261111");
  assert.equal(ctx.f("", "v261111"), "v261111");
  assert.equal(ctx.f(null, "v261111"), "v261111");
  assert.equal(ctx.f(undefined, "v261111"), "v261111");
});

test("el módulo de la versión está en el precache y SGC lo muestra en Ajustes", () => {
  assert.ok(leer("sw.js").includes("'./shared/idr-version.js'"));
  assert.ok(leer("SGC/index.html").includes('src="../shared/idr-version.js"'));
  assert.match(leer("SGC/index.html"), /data-idr-version="SGC"/);
});

test("npm run release deja las dos versiones iguales y con el formato (se prueba sobre una copia, sin tocar el repo)", () => {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "idr-release-"));
  try {
    fs.mkdirSync(path.join(tmp, "scripts")); fs.mkdirSync(path.join(tmp, "shared"));
    fs.copyFileSync(path.join(RAIZ, "scripts/release.mjs"), path.join(tmp, "scripts/release.mjs"));
    fs.writeFileSync(path.join(tmp, "shared/idr-version.js"), "const IDR_VERSION = 'v000101';\n");
    fs.writeFileSync(path.join(tmp, "sw.js"), "const CACHE_NAME = 'idr-suite-v000101.0000';\n");
    execFileSync(process.execPath, ["scripts/release.mjs"], { cwd: tmp, stdio: "pipe" });
    const v = fs.readFileSync(path.join(tmp, "shared/idr-version.js"), "utf8").match(/IDR_VERSION = '(v\d{6})'/)[1];
    const c = fs.readFileSync(path.join(tmp, "sw.js"), "utf8").match(/CACHE_NAME = 'idr-suite-(v\d{6}\.\d{4})'/)[1];
    assert.ok(c.startsWith(`${v}.`));
    assert.notEqual(v, "v000101");
    // repetido en el mismo minuto: no falla y deja lo mismo
    execFileSync(process.execPath, ["scripts/release.mjs"], { cwd: tmp, stdio: "pipe" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
