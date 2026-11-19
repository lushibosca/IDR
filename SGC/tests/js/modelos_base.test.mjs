// Páginas de modelos importadas de cctv_monitor (bloque MODELOS BASE PURO de js/modelos-base.js).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const M = cargarBloque("modelos-base.js", "MODELOS BASE PURO", { Array, Set, String },
  ["MODELOS_PAGINA_BASE", "sembrarModelosPagina"]);

test("MODELOS_PAGINA_BASE trae las 19 URLs válidas de cctv_monitor sin modelos repetidos", () => {
  const base = plano(M.MODELOS_PAGINA_BASE);
  assert.equal(base.length, 19);
  const claves = new Set();
  for (const [marca, modelo, pagina] of base) {
    assert.ok(marca && modelo);
    assert.match(pagina, /^https:\/\//);
    const k = modelo.trim().toLowerCase();
    assert.ok(!claves.has(k), `modelo repetido: ${modelo}`);
    claves.add(k);
  }
});

test("sembrarModelosPagina agrega los que faltan sin pisar enlaces existentes (insensible a mayúsculas)", () => {
  const propios = [{ marca: "Hikvision", modelo: "ds-2cd2123g0-i", pagina: "https://ejemplo.local/mio" }];
  const r = plano(M.sembrarModelosPagina(propios));
  assert.equal(r.agregados, 18);
  assert.equal(r.lista.length, 19);
  const existente = r.lista.find((p) => p.modelo.toLowerCase() === "ds-2cd2123g0-i");
  assert.equal(existente.pagina, "https://ejemplo.local/mio");
  // volver a sembrar no agrega nada
  const r2 = plano(M.sembrarModelosPagina(r.lista));
  assert.equal(r2.agregados, 0);
  assert.equal(r2.lista.length, 19);
});
