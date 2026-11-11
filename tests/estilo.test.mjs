// Base de estilo común de la suite (shared/ui/, diseño de SGC: docs/PORTE-ESTILO-SGC.md): las normas de SGC para sus JS
// compartidos, el CSS sin !important ni reglas muertas (contando lo que usan TODAS las apps que lo cargan) y que cada app
// portada cargue el esqueleto completo y en orden. Ejecutar desde la raíz: node --test tests/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPS_PORTADAS } from "./_apps.mjs";
import { reglas, clasesDe } from "../SGC/tests/js/_css.mjs";   // parser mínimo de CSS (rutas relativas a SGC/)

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\'"`])\/\/[^\n]*/g, "$1");

function archivos(dir, ext, excluir = ["tests", "vendor", "node_modules", "img", "icons", "docs"]) {
  const out = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(path.join(RAIZ, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { if (!excluir.includes(e.name)) recorrer(rel); }
      else if (e.name.endsWith(ext)) out.push(rel);
    }
  };
  recorrer(dir);
  return out.sort();
}

const JS_UI = archivos("shared/ui/js", ".js");
const CSS_UI = archivos("shared/ui", ".css");

// ─── JS compartido: mismas normas que SGC (SGC/tests/js/arquitectura.test.mjs)
const TOPES = { "shared/ui/js/ui.js": 761 };      // ya lo pasaba al moverlo de SGC: no puede crecer

test("shared/ui/js: tope de 500 líneas (o el congelado)", () => {
  const pasados = JS_UI.map((f) => [f, leer(f).split("\n").length - 1]).filter(([f, n]) => n > (TOPES[f] ?? 500));
  assert.deepEqual(pasados, []);
  for (const [f, tope] of Object.entries(TOPES)) {
    const n = leer(f).split("\n").length - 1;
    assert.ok(n > 500 && n >= tope, `${f} tiene ${n} líneas: bajar su tope (${tope}) o quitarlo`);
  }
});

test("shared/ui/js: sin innerHTML ni ejecución dinámica, y los bloques PURO sin DOM, storage ni red", () => {
  const sink = /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new Function\s*\(/;
  assert.deepEqual(JS_UI.filter((f) => sink.test(sinComentarios(leer(f)))), []);
  const prohibido = /\b(document|localStorage|sessionStorage|navigator|XMLHttpRequest)\b|\bfetch\s*\(/;
  const malos = [];
  for (const f of JS_UI) {
    const s = leer(f);
    for (const m of s.matchAll(/\/\/ ==== (.+?) BEGIN ====/g)) {
      if (!s.includes(`// ==== ${m[1]} END ====`)) malos.push(`${f}: ${m[1]} sin END`);
    }
    for (const m of s.matchAll(/\/\/ ==== ([^\n]*?PURO) BEGIN ====\n([\s\S]*?)\/\/ ==== \1 END ====/g)) {
      const hit = sinComentarios(m[2]).match(prohibido);
      if (hit) malos.push(`${f} · ${m[1]}: ${hit[0]}`);
    }
  }
  assert.deepEqual(malos, []);
});

// ─── CSS compartido
test("shared/ui: cero !important y todo dentro de una capa (@layer)", () => {
  const malos = [];
  for (const f of CSS_UI) {
    const s = leer(f).replace(/\/\*[\s\S]*?\*\//g, "");
    if (/!important/.test(s)) malos.push(`${f}: !important`);
    // fuera de @layer solo puede ir el orden de capas, el @import de los íconos (tokens.css) y «menos movimiento»
    // (utilidades.css: sin capa a propósito, para ganarle a todas sin !important)
    const suelto = s.replace(/@layer[^;{]*;/g, "").replace(/@import[^;]*;/g, "")
      .replace(/html\[data-movimiento="reducido"\][^{]*\{[^}]*\}/g, "").replace(/@layer[^{]*\{/g, "{");
    let prof = 0, fuera = "";
    for (const c of suelto) { if (c === "{") prof++; if (prof === 0 && c !== "}") fuera += c; if (c === "}") prof--; }
    if (fuera.trim()) malos.push(`${f}: reglas fuera de @layer («${fuera.trim().slice(0, 40)}»)`);
  }
  assert.deepEqual(malos, []);
});

// Clases que una app PUEDE usar (amplio a propósito: para decidir qué CSS está muerto, sobrar no importa): class="" del HTML,
// cada palabra de los literales de sus JS (y de los compartidos que carga) y los prefijos que se completan ('pre-' + x, `pre-${x}`).
function clasesDeApp(app) {
  const html = leer(`${app}/index.html`);
  const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map((m) => path.posix.normalize(`${app}/${m[1]}`))
    .filter((f) => fs.existsSync(path.join(RAIZ, f)));
  const js = scripts.map(leer).join("\n");
  const exactas = new Set();
  const patrones = [];
  for (const m of (html + js).matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach((c) => exactas.add(c));
  for (const m of js.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    for (const e of t.matchAll(/\$\{([^{}]*)\}/g)) for (const l of e[1].matchAll(/'([^']*)'|"([^"]*)"/g)) (l[1] ?? l[2]).split(/\s+/).forEach((c) => exactas.add(c));
    for (const tok of t.replace(/\$\{[^{}]*\}/g, "\u0000").split(/[\s.]+/)) {
      if (!tok.includes("\u0000")) { exactas.add(tok); continue; }
      const pre = tok.split("\u0000")[0];
      if (/^[a-z][\w-]*-$/.test(pre)) patrones.push(pre);
    }
  }
  for (const m of js.matchAll(/'([a-z][\w-]*-)'\s*\+/g)) patrones.push(m[1]);
  return (c) => exactas.has(c) || patrones.some((p) => c.startsWith(p));
}

test("shared/ui: sin CSS muerto (cada clase de un selector la usa al menos una app portada)", () => {
  const usadas = APPS_PORTADAS.map(clasesDeApp);
  const usada = (c) => usadas.some((u) => u(c));
  const muertos = CSS_UI.flatMap((f) => reglas(`../${f}`).filter((r) => !r.bloque)
    .flatMap((r) => r.selectores.filter((s) => clasesDe(s).some((c) => !usada(c))).map((s) => `${f}: ${s}`)));
  assert.deepEqual(muertos, []);
});

// ─── Cada app portada carga el esqueleto entero, en el orden de las capas
test("apps portadas: cargan la base (tokens primero, utilidades al final), el esqueleto, ui.js y la versión visible", () => {
  for (const app of APPS_PORTADAS) {
    const html = leer(`${app}/index.html`);
    const hojas = [...html.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map((m) => m[1]);
    const ui = hojas.filter((h) => h.startsWith("../shared/ui/"));
    assert.equal(ui[0], "../shared/ui/tokens.css", `${app}: tokens.css tiene que ser la primera hoja de la base`);
    assert.equal(ui.at(-1), "../shared/ui/utilidades.css", `${app}: utilidades.css va al final`);
    // (legado/: solo las apps con variables viejas de SGR/SGI/SGP; SGC no la carga)
    for (const f of CSS_UI.filter((c) => !c.includes("/js/") && !c.includes("/legado/"))) {
      assert.ok(hojas.includes(`../${f}`), `${app}: falta <link> a ../${f}`);
    }
    const propias = hojas.filter((h) => !h.startsWith("../shared/"));
    assert.ok(propias.every((h) => hojas.indexOf(h) > hojas.indexOf("../shared/ui/esqueleto.css")
      && hojas.indexOf(h) < hojas.indexOf("../shared/ui/utilidades.css")), `${app}: sus hojas van entre el esqueleto y utilidades`);
    for (const js of ["ui.js", "atras-modales.js", "busqueda-movil.js", "swipe-pestanas.js", "toast.js", "volver-arriba.js", "transicion-pestanas.js", "instalar.js", "ayuda.js", "ajustes-columnas.js", "gestos.js", "panel.js", "panel-mover.js", "panel-etiquetas.js", "apariencia.js"]) {
      assert.ok(html.includes(`src="../shared/ui/js/${js}`), `${app}: falta ../shared/ui/js/${js}`);
    }
    assert.ok(html.includes('src="../shared/idr-tema.js"') && html.includes('src="../shared/idr-version.js"'), `${app}: tema y versión de la suite`);
    assert.match(html, new RegExp(`data-idr-version="${app}"`), `${app}: versión visible en Ajustes`);
    assert.doesNotMatch(html, /<svg[^>]*class="svg-sprites"/, `${app}: sin sprite SVG propio (íconos de bootstrap-icons)`);
    assert.ok(html.includes('src="../shared/ui/js/arranque.js"'), `${app}: falta arranque.js en el <head>`);
    // (SGC tiene su propio motor de búsqueda por campos de equipos; las demás usan la sintaxis común)
    if (app !== "SGC") assert.ok(html.includes('src="../shared/ui/js/busqueda-tokens.js"'), `${app}: falta busqueda-tokens.js`);
    for (const id of ["btn-theme", "btn-movimiento", "btn-scroll-top", "search-clear", "btn-toggle-sidebar"]) {
      assert.ok(html.includes(`id="${id}"`), `${app}: falta #${id}`);
    }
    // barra superior única: la marca lleva al launcher y a la derecha van instalar, deshacer y rehacer (el menú ⚙ es solo de SGC)
    assert.match(html, /<a href="\.\.\/index\.html" class="brand-launcher"/, `${app}: marca con enlace al launcher`);
    for (const id of ["btn-install-app", "btn-undo", "btn-redo"]) {
      assert.match(html, new RegExp(`class="[^"]*navbar-acciones[^"]*"[\\s\\S]*?id="${id}"`), `${app}: #${id} dentro de .navbar-acciones`);
    }
    // modal de ayuda y atajos (mismo marcado de pestañas en las tres) y, en las que no tienen su propio motor, la navegación común
    for (const id of ["modal-atajos", "ayuda-tab-secciones", "ayuda-tab-busqueda", "ayuda-tab-atajos", "atajos-buscar", "atajos-lista"]) {
      assert.ok(html.includes(`id="${id}"`), `${app}: falta #${id} (modal de ayuda)`);
    }
    if (app !== "SGC") assert.ok(html.includes('src="../shared/ui/js/navegacion.js"') && html.includes('id="btn-rueda-pestanas"'), `${app}: navegacion.js y su interruptor en Ajustes`);
    assert.match(html, /id="toast"[^>]*role="status"|role="status"[^>]*id="toast"/, `${app}: #toast con role="status"`);
    for (const id of ["app-main-row", "sidebar-col", "main-content-col", "v-pills-tab", "v-pills-tabContent",
      "sidebar-search-container", "global-search", "btn-buscar-movil"]) {
      assert.ok(html.includes(`id="${id}"`), `${app}: falta #${id} (lo esperan el esqueleto y sus scripts)`);
    }
  }
});

// ─── <head> de referencia (docs/PORTE-ESTILO-SGC.md, sección 8, paso 1): las mismas metas en todas las apps portadas
test("apps portadas: <head> de referencia (viewport, color-scheme, metas de PWA y CSP base)", () => {
  const BASE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; "
    + "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const metas = [
    ["viewport", "width=device-width, initial-scale=1.0, viewport-fit=cover"],
    ["referrer", "no-referrer"],
    ["color-scheme", "dark light"],
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "default"],
  ];
  for (const app of APPS_PORTADAS) {
    const head = leer(`${app}/index.html`).split("</head>")[0];
    assert.match(head, /<meta charset="UTF-8">/, `${app}: charset`);
    for (const [nombre, valor] of metas) {
      assert.ok(head.includes(`<meta name="${nombre}" content="${valor}">`), `${app}: <meta name="${nombre}" content="${valor}">`);
    }
    assert.equal((head.match(/<title>/g) || []).length, 1, `${app}: un solo <title>`);
    assert.ok(head.includes(`<title>${app}</title>`), `${app}: <title>${app}</title>`);
    const csp = head.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
    assert.ok(csp, `${app}: falta la CSP`);
    // igual a la base salvo los orígenes extra de connect-src (cada app conserva los suyos)
    assert.equal(csp[1].replace(/connect-src 'self'[^;]*;/, "connect-src 'self';"), BASE_CSP, `${app}: CSP distinta de la base`);
  }
});

// ─── toast.js: cola, duplicados, duración y el 4.º argumento
test("toast.js: cola de avisos", async () => {
  const { cargarBloque } = await import("./_bloque.mjs");
  const { toastExtra, toastEncolar, toastDuracion } = cargarBloque("toast.js", "TOAST PURO", {}, ["toastExtra", "toastEncolar", "toastDuracion"]);
  const j = JSON.parse.bind(JSON);
  assert.deepEqual(j(JSON.stringify(toastExtra("Listo", null))), { texto: "Listo", accion: null });
  assert.deepEqual(j(JSON.stringify(toastExtra("Listo", "3 filas"))), { texto: "Listo, 3 filas", accion: null });
  const f = () => 1;
  assert.equal(toastExtra("Listo", f).accion, f);
  assert.equal(toastExtra("Listo", f).texto, "Listo");
  assert.equal(toastExtra("Listo", { detalle: "x", accion: f }).texto, "Listo, x");
  assert.deepEqual(j(JSON.stringify(toastExtra("Listo", { accion: "no es función" }))), { texto: "Listo", accion: null });
  const a = { texto: "a" }, b = { texto: "b" };
  assert.deepEqual(j(JSON.stringify(toastEncolar([], a, null))), [a]);
  assert.deepEqual(j(JSON.stringify(toastEncolar([a], { texto: "a" }, null))), [a]);   // igual al último en espera
  assert.deepEqual(j(JSON.stringify(toastEncolar([], a, "a"))), []);                    // igual al que se está mostrando
  assert.deepEqual(j(JSON.stringify(toastEncolar([a], b, null))), [a, b]);
  const seis = toastEncolar(["1", "2", "3", "4", "5"].map((texto) => ({ texto })), b, null);
  assert.equal(seis.length, 5);
  assert.equal(seis.at(-1), b);
  assert.equal(seis[0].texto, "2");                                  // se descarta el más viejo
  assert.equal(toastDuracion(0, 0), 3000);
  assert.equal(toastDuracion(4000, 1), 2000);
  assert.equal(toastDuracion(4000, 0), 4000);
});

// ─── Manifiestos: las apps portadas se instalan con la misma pinta (color de la barra, fondo, modo y orientación)
test("apps portadas: manifiestos con el mismo theme_color, background_color, display y orientation", () => {
  const m = APPS_PORTADAS.map((app) => [app, JSON.parse(leer(`${app}/manifest.json`))]);
  const [, base] = m[0];
  for (const [app, man] of m) {
    for (const k of ["theme_color", "background_color", "display", "orientation"]) {
      assert.equal(man[k], base[k], `${app}: ${k} distinto del de ${m[0][0]}`);
    }
  }
});

// ─── busqueda-tokens.js: la sintaxis del buscador global (palabras, "frases", exclusión con ! o -)
test("busqueda-tokens.js: tokens, frases, exclusiones y palabra completa", async () => {
  const { cargarBloque } = await import("./_bloque.mjs");
  const api = cargarBloque("busqueda-tokens.js", "BUSQUEDA TOKENS PURO", { String, Array },
    ["idrNormalizarBusqueda", "idrTokensBusqueda", "idrCumpleTokens", "idrTextoContiene"]);
  const t = (q) => JSON.parse(JSON.stringify(api.idrTokensBusqueda(q)));
  assert.equal(api.idrNormalizarBusqueda("  CÁMARA   Acceso "), "camara acceso");
  assert.deepEqual(t("domo pasillo"), [{ texto: "domo", esExacto: false, excluir: false }, { texto: "pasillo", esExacto: false, excluir: false }]);
  assert.deepEqual(t("domo !ptz"), t("domo ! ptz"));
  assert.deepEqual(t("domo -ptz"), t("domo - ptz"));
  assert.deepEqual(t("domo !ptz")[1], { texto: "ptz", esExacto: false, excluir: true });
  assert.deepEqual(t('"Acceso Norte"'), [{ texto: "acceso norte", esExacto: true, excluir: false }]);
  assert.deepEqual(t('camara -"piso 3"')[1], { texto: "piso 3", esExacto: true, excluir: true });
  assert.deepEqual(t("(anexo c)"), [{ texto: "anexo c", esExacto: true, excluir: false }]);
  assert.deepEqual(t("cat-6"), [{ texto: "cat-6", esExacto: false, excluir: false }]);   // el guion en medio no excluye
  assert.deepEqual(t("hikvision !ptz \"puerta 1\" -caido").map((x) => [x.texto, x.excluir]),
    [["hikvision", false], ["ptz", true], ["puerta 1", false], ["caido", true]]);
  assert.deepEqual(t(""), []);
  assert.deepEqual(t(null), []);
  assert.deepEqual(t("!"), [{ texto: "!", esExacto: false, excluir: false }]);
  const cumple = (texto, q) => api.idrCumpleTokens(api.idrTokensBusqueda(q), (tok) => api.idrTextoContiene(api.idrNormalizarBusqueda(texto), tok));
  assert.equal(cumple("Domo fijo pasillo", "domo pasillo"), true);
  assert.equal(cumple("Domo PTZ pasillo", "domo !ptz"), false);
  assert.equal(cumple("Domo fijo", "domo -ptz"), true);
  assert.equal(cumple("Domo fijo", "!ptz"), true, "solo exclusiones, nada excluido: cumple");
  assert.equal(cumple("Acceso norte", '"acceso norte"'), true);
  assert.equal(cumple("norte acceso", '"acceso norte"'), false, "la frase va contigua y en orden");
  assert.equal(cumple("piso 3 ala", 'camara -"piso 3"'), false);
  assert.equal(cumple("aptzx", '"ptz"'), false, "entre comillas pide palabra completa");
  assert.equal(cumple("aptzx", "ptz"), true);
  assert.equal(cumple("el ptz fijo", '"ptz"'), true);
});

// ─── arranque.js (antes de pintar): el tema de la suite manda; si nadie eligió, el de la app
test("arranque.js: tema inicial", async () => {
  const { cargarBloque } = await import("./_bloque.mjs");
  const { idrTemaInicial: f } = cargarBloque("arranque.js", "ARRANQUE PURO", {}, ["idrTemaInicial"]);
  assert.equal(f(true, "light"), "dark");
  assert.equal(f(false, "dark"), "light");
  assert.equal(f(null, "dark"), "dark");
  assert.equal(f(null, "light"), "light");
  assert.equal(f(null, null), "light");
  assert.equal(f(null, "cualquiera"), "light");
  assert.equal(f(null, "dark", "light"), "light");   // respaldo propio de la app (SGC: sgc2/theme)
  assert.equal(f(null, "light", "dark"), "dark");
  assert.equal(f(true, "light", "light"), "dark");   // el de la suite manda sobre el respaldo
  assert.equal(f(null, "dark", "basura"), "dark");
});
