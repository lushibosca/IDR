// Funciones puras de static/produccion.js para capacidad de canales NVR y cálculo de disponibles (bloque entre marcadores).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const api = cargarBloque("produccion.js", "CAPACIDAD CANALES NVR PURO", { String, Number, Math, parseInt, Set, Array, Map }, ["obtenerCapacidadCanalesNvr", "calcularCanalesDisponibles", "completarCanalesDisponibles", "resumirCapacidad", "nivelCapacidad"]);

test("obtenerCapacidadCanalesNvr: detecta modelos Hikvision estándar y de alta capacidad", () => {
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-96128NI-I16"), 128);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-96256NI-I24"), 256);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-9664NI-I16"), 64);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-9632NI-I8"), 32);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7732NI-K4"), 32);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7616NI-K2"), 16);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7608NI-K2"), 8);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7608"), 8);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7604"), 4);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-7104NI-Q1/4P/M"), 4);
  assert.equal(api.obtenerCapacidadCanalesNvr("iDS-7616NXI-I2/X"), 16);
  assert.equal(api.obtenerCapacidadCanalesNvr("iDS-9664NXI-I8/X"), 64);
  assert.equal(api.obtenerCapacidadCanalesNvr("iDS-7208HQHI-M1/S"), 8);
  assert.equal(api.obtenerCapacidadCanalesNvr("iDS-7204HUHI-M1/S"), 4);
});

test("obtenerCapacidadCanalesNvr: detecta modelos Dahua, Uniview y TVT", () => {
  assert.equal(api.obtenerCapacidadCanalesNvr("DHI-NVR5216-16P-4KS2"), 16);
  assert.equal(api.obtenerCapacidadCanalesNvr("DHI-NVR616-128-4KS2"), 128);
  assert.equal(api.obtenerCapacidadCanalesNvr("DHI-NVR608-64-4KS2"), 64);
  assert.equal(api.obtenerCapacidadCanalesNvr("XVR5108H-4KL-I3"), 8);
  assert.equal(api.obtenerCapacidadCanalesNvr("NVR301-04L-P4"), 4);
  assert.equal(api.obtenerCapacidadCanalesNvr("NVR308-64R"), 64);
  assert.equal(api.obtenerCapacidadCanalesNvr("TD-3216NE"), 16);
});

test("obtenerCapacidadCanalesNvr: soporte para número directo u objeto NVR con override", () => {
  assert.equal(api.obtenerCapacidadCanalesNvr(64), 64);
  assert.equal(api.obtenerCapacidadCanalesNvr({ capacidad_canales: 32, modelo: "DS-7616" }), 32);
  assert.equal(api.obtenerCapacidadCanalesNvr({ max_canales: 128 }), 128);
  assert.equal(api.obtenerCapacidadCanalesNvr({ modelo: "DS-9664NI-I16" }), 64);
});

test("obtenerCapacidadCanalesNvr: valores inválidos, nulos o cámaras no NVR dan null", () => {
  assert.equal(api.obtenerCapacidadCanalesNvr(null), null);
  assert.equal(api.obtenerCapacidadCanalesNvr(undefined), null);
  assert.equal(api.obtenerCapacidadCanalesNvr(""), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("-"), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("N/A"), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("UNKNOWN"), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("CAM-101"), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-2CD2116G0-I"), null);
  assert.equal(api.obtenerCapacidadCanalesNvr("DS-2CD2043G0-I"), null);
});

test("calcularCanalesDisponibles: resta capacidad y canales en uso respetando límites", () => {
  assert.equal(api.calcularCanalesDisponibles(50, 64), 14);
  assert.equal(api.calcularCanalesDisponibles(95, 128), 33);
  assert.equal(api.calcularCanalesDisponibles(4, 4), 0);
  assert.equal(api.calcularCanalesDisponibles(0, 16), 16);
  assert.equal(api.calcularCanalesDisponibles("9", "16"), 7);
  // Sobreasignación nunca da negativo:
  assert.equal(api.calcularCanalesDisponibles(70, 64), 0);
  // Sin capacidad o datos inválidos da null:
  assert.equal(api.calcularCanalesDisponibles(5, null), null);
  assert.equal(api.calcularCanalesDisponibles("-", 64), null);
  assert.equal(api.calcularCanalesDisponibles(undefined, 32), null);
  assert.equal(api.calcularCanalesDisponibles(10, 0), null);
});

test("completarCanalesDisponibles: completa canales intermedios, iniciales y finales hasta capacidad", () => {
  const configuradas = [
    { channel_id: 2, camera_name: "Cam 2", is_offline: false },
    { channel_id: 3, camera_name: "Cam 3", is_offline: false },
    { channel_id: 8, camera_name: "Cam 8", is_offline: true },
  ];
  const res = api.completarCanalesDisponibles(configuradas, 8, "NVR-Test", "10.0.0.5");
  // Total de canales debe ser 8
  assert.equal(res.length, 8);
  const ids = res.map(c => c.channel_id).sort((a, b) => a - b);
  assert.deepEqual(plano(ids), [1, 2, 3, 4, 5, 6, 7, 8]);

  const ch1 = res.find(c => c.channel_id === 1);
  assert.equal(ch1.camera_name, "Libre");
  assert.equal(ch1.detalle, "disponible");
  assert.equal(ch1.nvr_name, "NVR-Test");
  assert.equal(ch1.nvr_ip, "10.0.0.5");
  assert.equal(ch1.is_offline, false);

  const ch8 = res.find(c => c.channel_id === 8);
  assert.equal(ch8.camera_name, "Cam 8");
  assert.equal(ch8.is_offline, true);
});

test("completarCanalesDisponibles: maneja canales más allá de la capacidad y valores inválidos", () => {
  const configuradas = [
    { channel_id: 6, camera_name: "Cam 6" },
    { channel_id: 10, camera_name: "Cam 10" },
  ];
  // Si la capacidad es 8 pero hay canal 10, completa hasta 10
  const res = api.completarCanalesDisponibles(configuradas, 8);
  assert.equal(res.length, 10);
  assert.ok(res.find(c => c.channel_id === 1 && c.camera_name === "Libre"));
  assert.ok(res.find(c => c.channel_id === 7 && c.camera_name === "Libre"));

  // Capacidad nula, 0 o negativa retorna copia de originales
  assert.deepEqual(plano(api.completarCanalesDisponibles(configuradas, null)), configuradas);
  assert.deepEqual(plano(api.completarCanalesDisponibles(configuradas, 0)), configuradas);
  assert.deepEqual(plano(api.completarCanalesDisponibles(null, 8)), []);
});



test("resumirCapacidad: el total en uso es la suma del detalle y los libres se suman por grabador", () => {
  const nvrs = [{ ip: "10.0.0.1", nvr_name: "Central" }, { ip: "10.0.0.2", nvr_name: "N/A" }, { ip: "10.0.0.3", nvr_name: "Sin cap" }];
  const cams = [
    ...Array.from({ length: 6 }, (_, i) => ({ nvr_ip: "10.0.0.1", channel_id: String(i + 1) })),   // 6 en uno de 4: lleno
    { nvr_ip: "10.0.0.2" }, { nvr_ip: "10.0.0.2" },                                                 // 2 de 8
    { nvr_ip: "10.0.0.9" },                                                                         // grabador desconocido
    null,
  ];
  const caps = new Map([["10.0.0.1", 4], ["10.0.0.2", 8]]);
  const r = api.resumirCapacidad(nvrs, cams, n => caps.get(n.ip) || null);
  assert.equal(r.total, 12);
  assert.equal(r.enUso, 8, "las cámaras de un grabador desconocido no suman en uso");
  assert.equal(r.libres, 6, "el grabador sobrecargado no descuenta lugar del otro (0 + 6)");
  assert.equal(r.pct, 67);
  assert.deepEqual(plano([...r.detalle.entries()]), [
    ["Central (10.0.0.1)", { cap: 4, enUso: 6, libres: 0, nombre: "Central", ip: "10.0.0.1" }],
    ["10.0.0.2", { cap: 8, enUso: 2, libres: 6, nombre: "10.0.0.2", ip: "10.0.0.2" }],
    ["Sin cap (10.0.0.3)", { cap: 0, enUso: 0, libres: 0, nombre: "Sin cap", ip: "10.0.0.3" }],
  ]);
  const vacio = api.resumirCapacidad(null, null, () => null);
  assert.deepEqual([vacio.total, vacio.enUso, vacio.libres, vacio.pct], [0, 0, 0, 0]);
  assert.equal(api.resumirCapacidad([{ ip: "1" }], [{ nvr_ip: "1" }, { nvr_ip: "1" }], () => 1).pct, 100, "el porcentaje no pasa de 100");
});

test("nivelCapacidad: verde hasta 69 %, naranja de 70 a 89 %, rojo desde 90 %; lo inválido es verde", () => {
  for (const [pct, nivel] of [[0, "ok"], [16, "ok"], [69, "ok"], [70, "aviso"], [89, "aviso"], [90, "critico"], [100, "critico"],
    [null, "ok"], [undefined, "ok"], ["x", "ok"], [NaN, "ok"]]) {
    assert.equal(api.nivelCapacidad(pct), nivel, String(pct));
  }
});

test("resumirCapacidad: un grabador sin capacidad conocida cuenta en uso pero no en los porcentajes (no pasan de 100 %)", () => {
  const nvrs = [{ ip: "1", nvr_name: "A" }, { ip: "2", nvr_name: "Caído" }];
  const cams = [...Array.from({ length: 16 }, () => ({ nvr_ip: "1" })), ...Array.from({ length: 50 }, () => ({ nvr_ip: "2" }))];
  const r = api.resumirCapacidad(nvrs, cams, n => (n.ip === "1" ? 64 : null));
  assert.equal(r.enUso, 66, "la cantidad en uso es la real");
  assert.equal(r.enUsoMedido, 16);
  assert.equal(r.sinCapacidad, 1);
  assert.equal(r.total, 64);
  assert.equal(r.libres, 48);
  assert.equal(r.pct, 25, "16 de 64, sin los 50 que no tienen capacidad");
  assert.equal(r.pct + Math.round(r.libres / r.total * 100), 100, "en uso % + disponibles % = 100 %");
});
