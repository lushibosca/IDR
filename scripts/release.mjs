// `node scripts/release.mjs`: sube CACHE_NAME del sw.js de la suite (idr-suite-AAMMDD.HHMM) con la fecha/hora actual.
// El SW es cache-first con ignoreSearch: sin esto, la PWA instalada sigue mostrando la versión cacheada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), "../sw.js");
const p = (n) => String(n).padStart(2, "0");
const d = new Date();
const version = `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
const fuente = fs.readFileSync(SW, "utf8");
const nuevo = fuente.replace(/const CACHE_NAME = 'idr-suite-[^']*';/, `const CACHE_NAME = 'idr-suite-${version}';`);
if (nuevo === fuente) {
  console.error("No se encontró CACHE_NAME en sw.js (o ya tenía esta misma versión).");
  process.exit(1);
}
fs.writeFileSync(SW, nuevo);
console.log(`CACHE_NAME -> idr-suite-${version}`);
