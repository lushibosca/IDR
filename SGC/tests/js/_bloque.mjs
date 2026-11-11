// Carga un bloque de funciones PURAS de un JS del front (el código real entre marcadores, no una copia) en un
// contexto aislado de node:vm y devuelve las funciones pedidas. Lo usan los *.test.mjs (antes cada uno repetía
// la lectura, la regex de marcadores y el armado del contexto). No termina en .test.mjs: no es un test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
// "produccion.js" -> js/produccion.js; lo demás (index.html, css/...) desde la raíz de SGC-2
export const ruta = (archivo) => path.join(RAIZ, /^[^/]+\.js$/.test(archivo) ? `js/${archivo}` : archivo);

/**
 * @param {string} archivo   p. ej. "logs-servidores.js" (dentro de js/)
 * @param {string} marcador  texto entre "// ==== " y " BEGIN ====" (p. ej. "LOGS SERVIDORES PURO")
 * @param {object} globales  lo que el bloque puede usar del entorno (Date, Map, ...): nada más
 * @param {string[]} nombres funciones/constantes a exportar
 */
export function cargarBloque(archivo, marcador, globales, nombres) {
  const src = fs.readFileSync(ruta(archivo), "utf8");
  const ini = `// ==== ${marcador} BEGIN ====`, fin = `// ==== ${marcador} END ====`;
  const a = src.indexOf(ini), b = src.indexOf(fin);
  assert.ok(a >= 0 && b > a, `no se encontraron los marcadores "${marcador}" en ${archivo}`);
  const ctx = { ...globales };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a + ini.length, b) + `\nthis.__api = { ${nombres.join(", ")} };`, ctx);
  return ctx.__api;
}

/** Objetos creados dentro del contexto vm son de otro "realm": deepEqual necesita copiarlos. */
export const plano = (x) => JSON.parse(JSON.stringify(x));
