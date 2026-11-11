// Criterios de "CSS limpio" (docs/diseno/CSS-Y-UI.md) que se pueden comprobar sin navegador: todo en
// static/css/, cero !important, cada selector definido en un solo lugar, sin CSS muerto y sin variables sueltas. El criterio 4 (ningún archivo
// pisa a otro) se mide en el navegador: `python tests/herramientas/capturas_ui.py pisadas DIR`.
// Mientras dura la limpieza, ESTRICTO = false: los tests informan (t.diagnostic) en vez de fallar.
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hojasCss, reglas, clasesDe, clasesPosibles, leer, STATIC } from "./_css.mjs";

const ESTRICTO = true;

const hojas = hojasCss();
const todas = hojas.flatMap((h) => reglas(h));

function exigir(t, nombre, lista) {
  t.diagnostic(`${nombre}: ${lista.length}`);
  if (ESTRICTO) assert.deepEqual(lista, [], nombre);
}

test("css limpio 1: todo el CSS vive en static/css/ y index.html solo carga de ahí (más íconos y fuentes)", (t) => {
  // css/ (lo propio de SGC) o ../shared/ui/ (la base común de la suite)
  const fuera = hojas.filter((h) => !h.startsWith("css/") && !h.startsWith("../shared/ui/"));
  const enlaces = [...leer("index.html").matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map((m) => m[1]);
  // (la hoja del aviso de actualización y los íconos y fuentes también son de la suite: ../shared/)
  const ajenos = enlaces.filter((e) => !e.startsWith("css/") && !e.startsWith("../shared/ui/")
    && !/^\.\.\/shared\/vendor\/(bootstrap-icons|fonts)\//.test(e) && e !== "../shared/idr-actualizacion.css");
  exigir(t, "hojas fuera de static/css/", fuera);
  exigir(t, "hojas cargadas desde fuera de static/css/", ajenos);
});

test("css limpio 2: cero !important", (t) => {
  const importantes = todas.flatMap((r) => r.decls.filter((d) => d.importante)
    .map((d) => `${r.archivo}: ${r.selectores.join(", ")} { ${d.prop} }`));
  exigir(t, "declaraciones con !important", importantes);
});

test("css limpio 3: cada selector se define en un solo lugar (por condición de @media)", (t) => {
  const donde = new Map();
  for (let rIdx = 0; rIdx < todas.length; rIdx++) {
    const r = todas[rIdx];
    if (r.bloque) continue;
    for (const s of r.selectores) {
      const propsEnRegla = new Set(r.decls.map((d) => d.prop));
      for (const p of propsEnRegla) {
        const k = `${r.media} ⟶ ${s} { ${p} }`;
        if (!donde.has(k)) donde.set(k, []);
        donde.get(k).push(r.archivo);
      }
    }
  }
  const repetidos = [...donde].filter(([, a]) => a.length > 1).map(([k, a]) => `${k} (${a.join(", ")})`);
  exigir(t, "selectores con propiedades definidas más de una vez", repetidos);
});

test("css limpio 5: sin CSS muerto (selectores con clases que el front no usa)", (t) => {
  // Las hojas de ../shared/ui/ se revisan contra TODAS las apps que las cargan (../tests/estilo.test.mjs): una clase de la base
  // que solo usa otra app no está muerta.
  const usada = clasesPosibles();
  const muertos = todas.filter((r) => !r.bloque && !r.archivo.startsWith("../shared/"))
    .flatMap((r) => r.selectores.filter((s) => clasesDe(s).some((c) => !usada(c))).map((s) => `${r.archivo}: ${s}`));
  exigir(t, "selectores muertos", muertos);
});

test("css limpio 6: variables CSS sin uso o usadas sin definir", (t) => {
  // Las que el JS lee o escribe (style.setProperty, getPropertyValue) cuentan como usadas y como definidas.
  const front = leer("index.html") + "\n" + fs.readdirSync(path.join(STATIC, "js")).filter((f) => f.endsWith(".js")).map((f) => leer(f)).join("\n");
  const desdeFront = new Set(front.match(/--[\w-]+/g) || []);
  const definidas = new Map();
  const leidas = new Set();
  const sinRespaldo = [];
  for (const r of todas) {
    for (const d of r.decls) if (d.prop.startsWith("--") && !definidas.has(d.prop)) definidas.set(d.prop, r.archivo);
  }
  for (const h of hojas) {                       // del texto: también lee lo de adentro de @keyframes
    const texto = leer(h).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of texto.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      leidas.add(m[1]);
      if (!m[2]) sinRespaldo.push([m[1], h]);
    }
  }
  const sinUso = [...definidas].filter(([v]) => !leidas.has(v) && !desdeFront.has(v)).map(([v, a]) => `${a}: ${v}`);
  const sinDefinir = sinRespaldo.filter(([v]) => !definidas.has(v) && !desdeFront.has(v)).map(([v, a]) => `${a}: ${v}`);
  exigir(t, "variables definidas que nadie lee", sinUso);
  exigir(t, "variables leídas sin definir (sin valor de respaldo)", [...new Set(sinDefinir)]);
});
