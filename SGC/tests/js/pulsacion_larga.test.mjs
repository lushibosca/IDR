// Pulsación larga de los encabezados plegables (subgrupos de Activos, tipos de los modales de detalle de stock).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("../shared/ui/js/gestos.js", "PULSACION LARGA PURO", { Number }, ["esPulsacionLarga", "PULSACION_LARGA_MS"]);

test("desde 300 ms es una pulsación larga; un clic normal no", () => {
  assert.equal(api.PULSACION_LARGA_MS, 300);
  assert.equal(api.esPulsacionLarga(1000, 1120), false);        // clic normal
  assert.equal(api.esPulsacionLarga(1000, 1299), false);
  assert.equal(api.esPulsacionLarga(1000, 1300), true);
  assert.equal(api.esPulsacionLarga(null, 5000), false);
});
