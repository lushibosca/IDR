// Aviso del pie de Auditoría cuando el servidor devuelve el último resultado (una consulta por equipo y por minuto).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { uiAvisoUltimaConsulta } = cargarBloque("comun.js", "LIMITE CONSULTA PURO", { Date, Math, Number },
  ["uiAvisoUltimaConsulta"]);
const ahora = Date.parse("2026-10-13T12:00:40Z");

test("un resultado de recién no lleva aviso; uno anterior dice de cuándo es y por qué", () => {
  assert.equal(uiAvisoUltimaConsulta("2026-10-13T12:00:38Z", ahora), "");
  assert.equal(uiAvisoUltimaConsulta("2026-10-13T12:00:10Z", ahora),
    "resultado de hace 30 s: cada equipo se consulta como mucho una vez por minuto");
});

test("una hora que no es ISO UTC no inventa un aviso", () => {
  for (const malo of [null, undefined, "", "ayer", "2026-10-13 12:00:10", 5]) assert.equal(uiAvisoUltimaConsulta(malo, ahora), "");
});
