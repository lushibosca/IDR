// Preferencias por usuario del front (bloque PREFERENCIAS PURO de static/comun.js): formas en localStorage, siembra la
// primera vez, plan al aplicar lo del servidor y la clave rechazada de un 422. Diseño:
// docs/diseno/PREFERENCIAS-POR-USUARIO.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const P = cargarBloque("comun.js", "PREFERENCIAS PURO", { JSON, Object, Array },
  ["PREFERENCIAS_SINCRONIZADAS", "prefDeLocal", "prefALocal", "prefDebeSembrar", "prefSiembra", "prefPlan",
   "prefRechazada", "prefRespuestaValida", "prefSincronizaSesion", "CLAVE_PREFERENCIAS_USUARIO"]);

test("sincronizan las personas; el kiosco y la sesión de una clave temporal no", () => {
  for (const rol of ["visor", "operador", "admin"]) assert.equal(P.prefSincronizaSesion({ usuario: "ana", rol }), true);
  assert.equal(P.prefSincronizaSesion({ usuario: "sala", rol: "kiosco" }), false);
  assert.equal(P.prefSincronizaSesion({ usuario: "ana", rol: "admin", cambiar_clave: true }), false);
  for (const yo of [null, undefined, {}, { usuario: "", rol: "admin" }, { usuario: 3, rol: "admin" }]) {
    assert.equal(P.prefSincronizaSesion(yo), false);
  }
});

test("si_no: '1'/'0' <-> true/false; lo demás no se sube", () => {
  assert.equal(P.prefDeLocal("si_no", "1"), true);
  assert.equal(P.prefDeLocal("si_no", "0"), false);
  for (const crudo of ["true", "", "2", null, undefined]) assert.equal(P.prefDeLocal("si_no", crudo), undefined);
  assert.equal(P.prefALocal("si_no", true), "1");
  assert.equal(P.prefALocal("si_no", false), "0");
  assert.equal(P.prefALocal("si_no", "1"), null);
});

test("texto tal cual; json parseado (basura o null = no se sube)", () => {
  assert.equal(P.prefDeLocal("texto", "light"), "light");
  assert.equal(P.prefALocal("texto", 3), null);
  assert.deepEqual(plano(P.prefDeLocal("json", '{"izq":["alertas-section"]}')), { izq: ["alertas-section"] });
  assert.equal(P.prefDeLocal("json", "{no es json"), undefined);
  assert.equal(P.prefDeLocal("json", "null"), undefined);
  assert.equal(P.prefALocal("json", ["a-b"]), '["a-b"]');
  assert.equal(P.prefALocal("json", null), null);
});

test("siembra: solo si el servidor no tiene nada y lo de este navegador no es de otra persona", () => {
  assert.equal(P.prefDebeSembrar({}, "", "ana"), true);        // de antes de las preferencias por usuario
  assert.equal(P.prefDebeSembrar({}, "ana", "ana"), true);
  assert.equal(P.prefDebeSembrar({}, "beto", "ana"), false);   // lo de beto no pasa a ana
  assert.equal(P.prefDebeSembrar({ tema: "light" }, "", "ana"), false);
});

test("la siembra sube lo guardado que tiene la forma, con las claves del servidor", () => {
  const local = { theme: "light", "cctv:colapso_alertas": "1", "cctv:colapso_canales": "x",
                  cctv_stock_subgrupos_colapsados: '["a-b"]', cctv_alertas_silenciadas: "1" };
  const cambios = plano(P.prefSiembra(k => (k in local ? local[k] : null)));
  assert.deepEqual(cambios, { tema: "light", "panel.colapso.alertas": true, "activos.subgrupos_colapsados": ["a-b"] });
});

test("plan: pone lo del servidor, borra lo que no tiene y no toca lo pendiente", () => {
  const plan = new Map(P.prefPlan({ tema: "light", "panel.colapso.alertas": false, "activos.vista": 3 },
                                  new Set(["activos.orden"])));
  assert.equal(plan.get("theme"), "light");
  assert.equal(plan.get("cctv:colapso_alertas"), "0");
  assert.equal(plan.get("cctv_stock_vista_modo"), null);        // forma equivocada = defecto
  assert.equal(plan.get("cctv:colapso_monitoreo"), null);       // el servidor no la tiene: se borra
  assert.equal(plan.has("cctv_stock_orden"), false);            // cambió acá y no se mandó todavía
});

test("un 422 nombra la clave rechazada; sin nombre, null", () => {
  const cambios = { tema: "x", "panel.colapso.alertas": true };
  assert.equal(P.prefRechazada("Preferencias no guardadas: valor inválido para la preferencia tema.", cambios), "tema");
  assert.equal(P.prefRechazada("Preferencias no guardadas: preferencia desconocida.", cambios), null);
  assert.equal(P.prefRechazada(undefined, cambios), null);
});

test("forma de la respuesta", () => {
  assert.equal(P.prefRespuestaValida({ valores: {} }), true);
  for (const r of [null, {}, { valores: null }, { valores: [] }, { valores: "x" }]) {
    assert.equal(P.prefRespuestaValida(r), false);
  }
});

test("lo del dispositivo no se sincroniza", () => {
  const locales = new Set(P.PREFERENCIAS_SINCRONIZADAS.map(([, local]) => local));
  for (const k of ["cctv_alertas_silenciadas", "cctv_notificaciones_escritorio", "cctv:sidebar_collapsed", "cctv_tab",
                   "cctv_auditoria_subtab", "cctv_open_accordions", "cctv_open_stock", P.CLAVE_PREFERENCIAS_USUARIO]) {
    assert.equal(locales.has(k), false, k);
  }
});
