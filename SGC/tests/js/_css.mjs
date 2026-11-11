// Lectura de las hojas de static/ para los tests de CSS (no termina en .test.mjs: no es un test).
// Parser mínimo: reglas con sus selectores y declaraciones, dentro de @media/@supports (anidados); @keyframes y
// @font-face se registran como bloques. Alcanza para CSS escrito a mano; no valida sintaxis.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STATIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const _ruta = (rel) => path.join(STATIC, /^[^/]+\.js$/.test(rel) ? `js/${rel}` : rel);

export const leer = (rel) => fs.readFileSync(_ruta(rel), "utf8");

/** Hojas de la base común de la suite (../shared/ui/) que carga index.html, relativas a SGC/. */
export function hojasCompartidas() {
  return [...leer("index.html").matchAll(/<link rel="stylesheet" href="(\.\.\/shared\/ui\/[^"?]+)/g)].map((m) => m[1]);
}

/** Scripts compartidos de la suite (../shared/...) que carga index.html, relativos a SGC/: también usan clases. */
export function scriptsCompartidos() {
  return [...leer("index.html").matchAll(/<script src="(\.\.\/shared\/[^"?]+)/g)].map((m) => m[1]);
}

/** Archivos .css de SGC (relativos), sin vendor/, más los de la base común que carga (../shared/ui/). */
export function hojasCss() {
  const out = hojasCompartidas();
  const recorrer = (rel) => {
    for (const e of fs.readdirSync(path.join(STATIC, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!["vendor", "img", "js", "tests", "node_modules", ".git"].includes(r)) recorrer(r); }
      else if (e.name.endsWith(".css")) out.push(r);
    }
  };
  recorrer("");
  return out.sort();
}

function dividir(texto, sep) {
  const partes = [];
  let prof = 0, cadena = null, actual = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (cadena) { actual += c; if (c === "\\") { actual += texto[++i] ?? ""; } else if (c === cadena) cadena = null; continue; }
    if (c === '"' || c === "'") cadena = c;
    else if (c === "(" || c === "[") prof++;
    else if (c === ")" || c === "]") prof--;
    if (c === sep && prof === 0) { partes.push(actual); actual = ""; } else actual += c;
  }
  partes.push(actual);
  return partes;
}

/**
 * @returns {{archivo:string, media:string, selectores:string[], decls:{prop:string, valor:string, importante:boolean}[]}[]}
 */
export function reglas(archivo) {
  const texto = leer(archivo).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const procesar = (t, media) => {
    let i = 0;
    while (i < t.length) {
      while (i < t.length && /\s/.test(t[i])) i++;
      if (i >= t.length) break;
      let j = i, cadena = null, prof = 0;
      for (; j < t.length; j++) {
        const c = t[j];
        if (cadena) { if (c === "\\") j++; else if (c === cadena) cadena = null; continue; }
        if (c === '"' || c === "'") cadena = c;
        else if (c === "(") prof++;
        else if (c === ")") prof--;
        else if (prof === 0 && (c === "{" || c === ";")) break;
      }
      const prelude = t.slice(i, j).trim();
      if (t[j] !== "{") { i = j + 1; continue; }                 // @charset, @import...
      let k = j + 1, nivel = 1;
      cadena = null;
      for (; k < t.length && nivel; k++) {
        const c = t[k];
        if (cadena) { if (c === "\\") k++; else if (c === cadena) cadena = null; continue; }
        if (c === '"' || c === "'") cadena = c;
        else if (c === "{") nivel++;
        else if (c === "}") nivel--;
      }
      const cuerpo = t.slice(j + 1, k - 1);
      if (/^@layer\b/.test(prelude)) procesar(cuerpo, media);          // la capa no cambia a qué elementos aplica
      else if (/^@(media|supports|container)\b/.test(prelude)) procesar(cuerpo, media ? `${media} and ${prelude}` : prelude);
      else if (prelude.startsWith("@")) out.push({ archivo, media, selectores: [prelude], decls: [], bloque: true });
      else {
        const decls = dividir(cuerpo, ";").map((d) => d.trim()).filter(Boolean).map((d) => {
          const p = d.indexOf(":");
          const valor = d.slice(p + 1).trim();
          return { prop: d.slice(0, p).trim(), valor: valor.replace(/\s*!important$/i, ""), importante: /!important$/i.test(valor) };
        });
        out.push({ archivo, media, selectores: dividir(prelude, ",").map((s) => s.trim().replace(/\s+/g, " ")), decls });
      }
      i = k;
    }
  };
  procesar(texto, "");
  return out;
}

/** Clases de un selector (sin contar lo de adentro de :not() ni los valores de atributos). */
export function clasesDe(selector) {
  const limpio = selector.replace(/\[[^\]]*\]/g, "").replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  return [...limpio.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/**
 * Clases que el front PUEDE usar, en forma amplia a propósito (para decidir qué CSS está muerto, sobrar no importa,
 * faltar sí): los class="" del HTML, todo literal de texto de los JS y las plantillas `pre-${x}-suf` como patrón.
 * @returns {(c: string) => boolean}
 */
export function clasesPosibles() {
  const html = leer("index.html");
  const js = [...fs.readdirSync(path.join(STATIC, "js")).filter((f) => f.endsWith(".js")).map((f) => leer(f)),
    ...scriptsCompartidos().map((f) => leer(f))].join("\n");
  const exactas = new Set();
  const patrones = [];
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach((c) => exactas.add(c));
  for (const m of js.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach((c) => exactas.add(c));
  for (const m of js.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) (m[1] ?? m[2]).split(/\s+/).forEach((c) => exactas.add(c));
  for (const m of js.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    const plantilla = m[1];
    for (const e of plantilla.matchAll(/\$\{([^{}]*)\}/g)) {
      for (const l of e[1].matchAll(/'([^']*)'|"([^"]*)"/g)) (l[1] ?? l[2]).split(/\s+/).forEach((c) => exactas.add(c));
    }
    for (const tok of plantilla.replace(/\$\{[^{}]*\}/g, "\u0000").split(/\s+/)) {
      if (!tok.includes("\u0000")) { exactas.add(tok); continue; }
      const partes = tok.split("\u0000");
      if (/^[a-z][\w-]*-$/.test(partes[0]) && partes.every((x) => /^[\w-]*$/.test(x))) {
        patrones.push(new RegExp("^" + partes.map((x) => x.replace(/[-]/g, "\\-")).join("[\\w-]+") + "$"));
      } else if (/^[a-z][\w-]*$/.test(partes[0])) exactas.add(partes[0]);
    }
  }
  for (const m of js.matchAll(/'([a-z][\w-]*-)'\s*\+/g)) patrones.push(new RegExp("^" + m[1].replace(/-/g, "\\-") + "[\\w-]+$"));
  return (c) => exactas.has(c) || patrones.some((p) => p.test(c));
}
