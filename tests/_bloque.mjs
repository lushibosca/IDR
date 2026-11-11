// Carga un bloque de funciones PURAS de un JS compartido de la suite (shared/ui/js/), el código real entre marcadores
// `// ==== X BEGIN/END ====`, en un contexto aislado de node:vm. Es el mismo mecanismo que SGC/tests/js/_bloque.mjs,
// con las rutas desde la raíz. No termina en .test.mjs: no es un test.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// "ui.js" -> shared/ui/js/ui.js; una ruta con "/" se toma desde la raíz de la suite
export const ruta = (archivo) => path.join(RAIZ, archivo.includes("/") ? archivo : `shared/ui/js/${archivo}`);

/**
 * @param {string} archivo   p. ej. "ui.js" (dentro de shared/ui/js/)
 * @param {string} marcador  texto entre "// ==== " y " BEGIN ====" (p. ej. "UI PURO")
 * @param {object} globales  lo que el bloque puede usar del entorno (Math, String, ...): nada más
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
