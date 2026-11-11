// Inventario de clases CSS: toda clase que usan index.html y los JS del front tiene que estar definida en alguna hoja
// cargada (o ser un gancho sin estilo listado abajo). Es la red de seguridad para quitar Bootstrap
// (docs/diseno/CSS-Y-UI.md): si se borra una regla que el front usa, este test dice qué clase quedó huérfana.
// Límite: no ve clases armadas por concatenación ('bg-' + x) ni las partes dinámicas de una plantilla (`bg-${x}`).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (rel) => fs.readFileSync(path.join(STATIC, /^[^/]+\.js$/.test(rel) ? `js/${rel}` : rel), "utf8");

// Hojas que aportan clases (las que carga index.html), todas propias (docs/diseno/CSS-Y-UI.md).
const HOJAS = [
  ...[...leer("index.html").matchAll(/<link rel="stylesheet" href="((?:\.\.\/shared\/ui\/|\.\.\/shared\/idr-|css\/)[^"?]+)/g)].map((m) => m[1]),
  "../shared/vendor/bootstrap-icons/bootstrap-icons.min.css", // la importa tokens.css (capa iconos)
];
// Clases sin estilo propio a propósito: ganchos para JS/tests o marcadores de estado.
const GANCHOS = new Set([
  "asig-quitar", "custom-select-label", "gist-accion", "idr-aviso-texto", "popup-disp-body", "popup-disp-info", "sidebar-toggle-icon",
]);
// Usadas pero sin definición en ningún lado (no tienen efecto). Se informan; arreglarlas es aparte.
const SIN_EFECTO_CONOCIDAS = new Set([]);

function clasesDefinidas(css) {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return new Set([...sinComentarios.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

const TOKEN = /^-?[a-zA-Z_][\w-]*$/;

// Tokens de una lista de clases que puede traer `${...}`. Si la expresión va suelta, sus cadenas literales son clases
// (`${ok ? 'text-success' : 'text-danger'}`); pegada a un nombre es solo un pedazo (`bar-${x ? 'right' : 'left'}`) y,
// como toda parte dinámica, se descarta (`bg-${x}-subtle` no es un token).
function tokensDeLista(texto) {
  const out = [];
  const sinExpr = texto.replace(/\$\{([^{}]*)\}/g, (expr, interior, pos) => {
    const suelta = (pos === 0 || /\s/.test(texto[pos - 1])) && /^(\s|$)/.test(texto.slice(pos + expr.length));
    if (suelta) {
      for (const lit of interior.matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(...(lit[1] ?? lit[2]).split(/\s+/));
    }
    return "§";
  });
  out.push(...sinExpr.split(/\s+/));
  return out.filter((t) => TOKEN.test(t) && !t.endsWith("-"));
}

function clasesUsadas() {
  // (más los scripts de la suite que carga index.html: ../shared/ui/js/ui.js arma el fondo de los modales, etc.)
  const compartidos = [...leer("index.html").matchAll(/<script src="(\.\.\/shared\/[^"?]+)/g)].map((m) => m[1]);
  const archivos = ["index.html", ...fs.readdirSync(path.join(STATIC, "js")).filter((f) => f.endsWith(".js")), ...compartidos];
  const usos = new Map();
  const anotar = (t, archivo) => {
    if (!usos.has(t)) usos.set(t, new Set());
    usos.get(t).add(archivo);
  };
  for (const archivo of archivos) {
    const src = leer(archivo);
    const listas = [
      ...src.matchAll(/class="([^"]*)"/g),
      ...src.matchAll(/className\s*=\s*'([^']*)'/g),
      ...src.matchAll(/className\s*=\s*`([^`]*)`/g),
      // uiNodo(tag, clases, texto): el helper con el que se arma casi todo el front (antes no se miraba y una clase de
      // Bootstrap sin CSS, `visually-hidden`, dejaba a la vista un texto que debía ir oculto)
      ...src.matchAll(/uiNodo\(\s*'[\w-]+'\s*,\s*'([^']*)'/g),
      ...src.matchAll(/uiNodo\(\s*'[\w-]+'\s*,\s*`([^`]*)`/g),
    ].map((m) => m[1]);
    for (const lista of listas) tokensDeLista(lista).forEach((t) => anotar(t, archivo));
    // add/remove/replace: todos los argumentos son clases; toggle/contains: solo el primero (el segundo es la condición)
    for (const m of src.matchAll(/classList\.(add|remove|replace|toggle|contains)\(([^)]*)\)/g)) {
      const lits = [...m[2].matchAll(/^\s*'([\w-]+)'|,\s*'([\w-]+)'/g)].map((l) => l[1] ?? l[2]);
      (m[1] === "toggle" || m[1] === "contains" ? lits.slice(0, 1) : lits).forEach((c) => anotar(c, archivo));
    }
  }
  return usos;
}

// Hojas embebidas en el JS (p. ej. el HTML del reporte que exporta stock.js trae su propio <style>).
const EMBEBIDAS = "<style> de los JS";
const embebidas = fs.readdirSync(path.join(STATIC, "js")).filter((f) => f.endsWith(".js"))
  .flatMap((f) => [...leer(f).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1])).join("\n");
const definidasPor = new Map([...HOJAS.map((h) => [h, clasesDefinidas(leer(h))]), [EMBEBIDAS, clasesDefinidas(embebidas)]]);
const definidas = new Set([...definidasPor.values()].flatMap((s) => [...s]));
const usadas = clasesUsadas();

test("clases CSS: toda clase usada en el front está definida en alguna hoja o es un gancho conocido", () => {
  const huerfanas = [...usadas.keys()]
    .filter((c) => !definidas.has(c) && !GANCHOS.has(c) && !SIN_EFECTO_CONOCIDAS.has(c))
    .map((c) => `${c} (${[...usadas.get(c)].join(", ")})`);
  assert.deepEqual(huerfanas, [], "clases sin definir: agregarlas a una hoja o, si son ganchos, a GANCHOS");
});

test("clases CSS: las listas de excepciones no tienen entradas viejas", () => {
  for (const c of [...GANCHOS, ...SIN_EFECTO_CONOCIDAS]) {
    assert.ok(usadas.has(c), `"${c}" ya no se usa: quitarla de la lista`);
    assert.ok(!definidas.has(c), `"${c}" ya tiene estilo: quitarla de la lista`);
  }
});

test("clases CSS: ninguna hoja viene de Bootstrap (solo quedan sus íconos)", () => {
  assert.deepEqual(HOJAS.filter((h) => h.includes("vendor/") && !h.startsWith("../shared/vendor/bootstrap-icons/")), []);
  const html = leer("index.html");
  assert.ok(!/vendor\/bootstrap\//.test(html), "index.html todavía carga algo de static/vendor/bootstrap/");
});
