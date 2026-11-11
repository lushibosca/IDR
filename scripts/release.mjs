// `npm run release`: sube la versión de la suite. IDR_VERSION (shared/idr-version.js, formato vAAMMDD, la que se muestra en los
// Ajustes de cada app) y CACHE_NAME (sw.js, formato idr-suite-vAAMMDD.HHMM). El SW es cache-first con ignoreSearch: sin subir
// CACHE_NAME la PWA instalada sigue mostrando la versión cacheada. Después: `npm test` valida que las dos coincidan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (n) => String(n).padStart(2, "0");
const d = new Date();
const version = `v${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
const cache = `${version}.${p(d.getHours())}${p(d.getMinutes())}`;

function reemplazar(archivo, regex, nuevo) {
  const ruta = path.join(RAIZ, archivo);
  const original = fs.readFileSync(ruta, "utf8");
  if (!regex.test(original)) throw new Error(`${archivo}: no se encontró el patrón ${regex}`);
  fs.writeFileSync(ruta, original.replace(regex, nuevo));
}

reemplazar("shared/idr-version.js", /(IDR_VERSION\s*=\s*')[^']+(')/, `$1${version}$2`);
reemplazar("sw.js", /(CACHE_NAME\s*=\s*'idr-suite-)[^']+(')/, `$1${cache}$2`);

console.log(`IDR_VERSION = ${version}\nCACHE_NAME  = idr-suite-${cache}`);
