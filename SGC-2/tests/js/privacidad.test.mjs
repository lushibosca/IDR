// Modo privacidad (bloque PRIVACIDAD PURO de static/privacidad.js): qué partes de un texto son IP o MAC.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const p = cargarBloque("privacidad.js", "PRIVACIDAD PURO", { RegExp, String }, ["partirDatosPrivados"]);
const privados = (t) => plano(p.partirDatosPrivados(t)).filter(x => x.privado).map(x => x.texto);

test("una IP o una MAC dentro de un texto se separa del resto", () => {
  assert.deepEqual(plano(p.partirDatosPrivados("Cam 10.32.30.3 caída")),
    [{ texto: "Cam ", privado: false }, { texto: "10.32.30.3", privado: true }, { texto: " caída", privado: false }]);
  assert.deepEqual(privados("MAC 00:04:63:37:AA:77 y 00-04-63-37-aa-78"), ["00:04:63:37:AA:77", "00-04-63-37-aa-78"]);
  assert.deepEqual(privados("NVR (10.0.0.1) · 192.168.1.250"), ["10.0.0.1", "192.168.1.250"]);
});

test("lo que parece dirección pero no lo es, no se toca", () => {
  assert.deepEqual(privados("Firmware V5.7.1.2 build 200319"), []);
  assert.deepEqual(privados("256.1.1.1 y 1.2.3 y 1.2.3.4.5"), []);
  assert.deepEqual(privados("hora 12:30:45 · 28/10/2026"), []);
  assert.deepEqual(plano(p.partirDatosPrivados("")), []);
  assert.deepEqual(plano(p.partirDatosPrivados(null)), []);
});
