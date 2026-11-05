// Migración desde idr/SGC (bloque MIGRAR SGC PURO de js/migrar-sgc.js): forma → tipo, grabadores y canales → instalación
// con grabador+canal, MAC múltiples, repetidos y la firma de integridad de SGC.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const G = { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date, Uint8Array, TextEncoder, crypto: globalThis.crypto };
const D = cargarBloque("datos-puro.js", "DATOS PURO", G,
  ["datosVacios", "sanearDatos", "textoAcotado", "enteroAcotado", "ipLiteralValida", "macNormalizada", "_opcional", "NULOS_SERIE",
    "NULOS_PATRIMONIO", "TIPOS_GRABADOR", "CONDICION_PRODUCCION", "CONDICIONES_STOCK", "CANALES_MAX", "GRUPO_POR_DEFECTO", "FORMATO_DATOS",
    "LARGOS_STOCK", "RE_PUERTO", "espacios", "claveValida", "idValido", "normalizarMarca", "normalizarPiso"]);
const M = cargarBloque("migrar-sgc.js", "MIGRAR SGC PURO", { ...G, ...D },
  ["migrarDesdeSgc", "migLeer", "migFirmaSgc", "migEstadoFirma", "ErrorMigracion"]);

const AHORA = "2026-11-05T12:00:00Z";
let n = 0;
const migrar = (b) => M.migrarDesdeSgc(b, { ahora: AHORA, nuevoId: () => `nuevo${++n}` });
const por = (r, id) => r.datos.dispositivos.find(d => d.id === id);

function sgc() {
  return {
    dispositivos: [
      { id: "nvr1", tipo: "nvr", estado: "", mac: "aa:bb:cc:dd:ee:01", serial: "N1", canales: 16, marca: "Hik", modelo: "DS-9", patrimonio: "", firmware: "V4", comentario: "" },
      { id: "cam1", tipo: "camara", forma: "domo", estado: "", mac: "aa:bb:cc:dd:ee:02", serial: "C1", marca: "bosh", modelo: "M1", updatedAt: "2026-10-01T10:00:00.123Z" },
      { id: "cam2", tipo: "camara", forma: "Domo PTZ".toLowerCase(), estado: "averiado", mac: "aa:bb:cc:dd:ee:03,aa:bb:cc:dd:ee:04", serial: "N/A" },
      { id: "cam3", tipo: "camara", mac: "aa:bb:cc:dd:ee:02", serial: "c1", patrimonio: "no" },    // MAC y serie repetidas
      { id: "dep1", tipo: "decoder", estado: "revisar" },
      { id: "sw1", tipo: "software", estado: "raro" },
      { id: "x1", tipo: "monitor_pro", estado: "" },
      { id: "cam1", tipo: "camara" },                                                              // id repetido
      { id: "mal id", tipo: "camara" },
    ],
    grabadores: [
      { id: "g1", dispositivoId: "nvr1", canales_n: 8, descripcion: "NVR Anexo", tipo: "nvr", ip: "10.0.0.1", edificio: "Anexo A", piso: "1er", rack: "R1",
        canales_data: [
          { canal: 1, dispositivoId: "cam1", descripcion: "Hall", ip: "10.0.1.1", puerto: "3/0/21", edificio: "Anexo A", piso: "1er" },
          { canal: 2, dispositivoId: "cam2", descripcion: "Pasillo", ip: "no-ip", puerto: "puerto raro" },
          { canal: 3, dispositivoId: null, descripcion: "Libre con nombre", ip: "10.0.1.3" },
          { canal: 4, dispositivoId: null, descripcion: "", ip: "" },
          { canal: 5, dispositivoId: "cam1", descripcion: "Hall otra vez" },
          { canal: 6, dispositivoId: "nvr1", descripcion: "el propio" },
        ] },
      { id: "g2", dispositivoId: null, canales_n: 4, descripcion: "DVR viejo", tipo: "dvr", marca: "Dahua", modelo: "XVR", mac: "aa:bb:cc:dd:ee:77", ip: "10.0.0.9",
        canales_data: [{ canal: 1, dispositivoId: "dep1", descripcion: "Entrada" }] },
    ],
    otros_prod: [{ id: "o1", dispositivoId: "x1", descripcion: "Monitor guardia", edificio: "Anexo B", piso: "PB" }, { id: "o2", dispositivoId: null, descripcion: "huérfano" }],
    tiposCustom: { monitor_pro: { label: "Monitor Pro", emoji: "🖥️" }, "MAL TIPO": { label: "x" } },
    edificios: ["Anexo A", "  Anexo   C "],
    eliminados: { dispositivos: { borrado1: "2026-09-01T00:00:00.000Z" } },
  };
}

test("formato: se rechaza lo que no es una exportación de SGC", () => {
  for (const mal of ["", "x", "[]", "{}", '{"dispositivos":3}']) assert.throws(() => M.migLeer(mal), (e) => e.constructor.name === "ErrorMigracion");
  assert.throws(() => M.migLeer(JSON.stringify({ formato: "sgc2", dispositivos: [] })), /ya es de SGC-2/);
  assert.throws(() => M.migLeer("x".repeat(9 * 1024 * 1024)), /demasiado grande/);
  // las claves que contaminan prototipos se descartan al leer
  const b = M.migLeer('{"dispositivos":[],"__proto__":{"x":1},"constructor":{"y":1}}');
  assert.equal(plano(b).x, undefined);
});

test("dispositivos: forma → tipo, estado vacío → operativo, marca normalizada, tipos retirados y personalizados", () => {
  const r = migrar(sgc());
  assert.equal(por(r, "cam1").tipo, "domo");
  assert.equal(por(r, "cam1").condicion, "operativo");
  assert.equal(por(r, "cam1").marca, "Bosch");
  assert.equal(por(r, "cam1").actualizado, "2026-10-01T10:00:00Z");
  assert.equal(por(r, "cam2").tipo, "domo_ptz");
  assert.equal(por(r, "cam2").condicion, "averiado");
  assert.equal(por(r, "dep1").condicion, "revisar");
  assert.equal(por(r, "sw1").tipo, "otro");
  assert.equal(por(r, "sw1").condicion, "revisar");
  assert.equal(por(r, "x1").tipo, "monitor_pro");
  assert.ok(r.datos.catalogo.tipos.some(t => t.clave === "monitor_pro" && t.etiqueta === "Monitor Pro"));
  assert.ok(!r.datos.catalogo.tipos.some(t => /mal/i.test(t.clave)));
  assert.ok(r.avisos.some(a => /id inválido o repetido/.test(a)));
  assert.ok(r.avisos.some(a => /estado desconocido «raro»/.test(a)));
});

test("MAC, serie y patrimonio: la primera MAC queda, el resto y los repetidos pasan al comentario", () => {
  const r = migrar(sgc());
  const c2 = por(r, "cam2"), c3 = por(r, "cam3");
  assert.equal(c2.mac, "aa:bb:cc:dd:ee:03");
  assert.match(c2.comentario, /MAC: aa:bb:cc:dd:ee:04/);
  assert.equal(c2.serie, null, "«N/A» es desconocida");
  assert.equal(c3.mac, null);
  assert.equal(c3.serie, null);
  assert.match(c3.comentario, /mac: aa:bb:cc:dd:ee:02/);
  assert.match(c3.comentario, /serie: c1/);
  assert.equal(c3.patrimonio, null, "«no» es sin patrimonio");
  assert.equal(por(r, "cam1").mac, "aa:bb:cc:dd:ee:02");
});

test("grabadores y canales: el equipo queda instalado en su grabador+canal con lo que decía el canal", () => {
  const r = migrar(sgc());
  const nvr = por(r, "nvr1");
  assert.equal(nvr.canales, 16, "la capacidad es la mayor entre el dispositivo y el grabador");
  assert.deepEqual(plano([nvr.instalacion.descripcion, nvr.instalacion.ip, nvr.instalacion.edificio, nvr.instalacion.piso, nvr.instalacion.rack,
    nvr.instalacion.grabador, nvr.instalacion.canal]), ["NVR Anexo", "10.0.0.1", "Anexo A", "1", "R1", null, null]);
  const c1 = por(r, "cam1").instalacion;
  assert.deepEqual(plano([c1.grabador, c1.canal, c1.descripcion, c1.ip, c1.puerto, c1.edificio]), ["nvr1", 1, "Hall", "10.0.1.1", "3/0/21", "Anexo A"]);
  const c2 = por(r, "cam2").instalacion;
  assert.deepEqual(plano([c2.grabador, c2.canal, c2.descripcion, c2.ip, c2.puerto]), ["nvr1", 2, "Pasillo", null, ""]);
  assert.match(por(r, "cam2").instalacion.comentario, /puerto: puerto raro/);
  assert.ok(r.avisos.some(a => /IP no válida \(no-ip\)/.test(a)));
  assert.ok(r.avisos.some(a => /está en dos canales/.test(a)));
  assert.ok(r.avisos.some(a => /un grabador no va en el canal de otro/.test(a)));
  assert.equal(por(r, "cam1").instalacion.canal, 1, "el segundo canal no lo mueve");
});

test("grabador sin dispositivo: se crea uno (tipo, marca, MAC) y sus canales quedan asignados a él", () => {
  const r = migrar(sgc());
  const dvr = r.datos.dispositivos.find(d => d.tipo === "dvr");
  assert.ok(dvr);
  assert.deepEqual(plano([dvr.marca, dvr.modelo, dvr.mac, dvr.canales, dvr.instalacion.ip, dvr.instalacion.descripcion]), ["Dahua", "XVR", "aa:bb:cc:dd:ee:77", 4, "10.0.0.9", "DVR viejo"]);
  const dep = por(r, "dep1").instalacion;
  assert.deepEqual(plano([dep.grabador, dep.canal, dep.descripcion]), [dvr.id, 1, "Entrada"]);
  assert.equal(r.informe.grabadoresCreados, 1);
  assert.equal(r.informe.grabadoresVinculados, 1);
});

test("grabador sin dispositivo pero con la MAC de un NVR del stock: se vincula a ese", () => {
  const b = sgc();
  b.grabadores[1].mac = "AA-BB-CC-DD-EE-01";
  b.grabadores[1].canales_data[0].canal = 7;
  const r = migrar(b);
  assert.equal(r.informe.grabadoresCreados, 0);
  assert.deepEqual(plano([por(r, "dep1").instalacion.grabador, por(r, "dep1").instalacion.canal]), ["nvr1", 7]);
  assert.ok(r.avisos.some(a => /se vinculó al que tiene su MAC/.test(a)));
});

test("otros en producción, depósito, canales sin equipo y lápidas", () => {
  const r = migrar(sgc());
  const x1 = por(r, "x1").instalacion;
  assert.deepEqual(plano([x1.descripcion, x1.edificio, x1.piso, x1.grabador, x1.canal]), ["Monitor guardia", "Anexo B", "PB", null, null]);
  assert.ok(r.datos.edificios.includes("Anexo B"));
  assert.ok(r.datos.edificios.includes("Anexo C"), "los espacios sobrantes se limpian");
  assert.equal(por(r, "sw1").instalacion, null);
  assert.equal(r.informe.otrosEnProduccion, 1);
  assert.equal(r.informe.canalesSinEquipoTotal, 1);
  assert.deepEqual(plano(r.informe.canalesSinEquipo), [{ grabador: "NVR Anexo", canal: 3, descripcion: "Libre con nombre", ip: "10.0.1.3" }]);
  assert.ok(r.avisos.some(a => /huérfano|sin equipo asignado/.test(a)));
  assert.equal(r.datos.eliminados.dispositivos.borrado1, "2026-09-01T00:00:00Z");
  assert.equal(r.datos.historial.length, 1);
  assert.equal(r.datos.historial[0].origen, "migracion");
});

test("lo migrado es un SGC-2 consistente: pasa por sanearDatos sin nuevos avisos de canales", () => {
  const r = migrar(sgc());
  const otra = D.sanearDatos(JSON.parse(JSON.stringify(r.datos)), AHORA);
  assert.equal(otra.avisos.filter(a => /asignación|canales no válidas/.test(a)).length, 0);
  assert.equal(otra.datos.dispositivos.length, r.datos.dispositivos.length);
  const enCanal = r.datos.dispositivos.filter(d => d.instalacion && d.instalacion.canal);
  assert.equal(new Set(enCanal.map(d => `${d.instalacion.grabador}#${d.instalacion.canal}`)).size, enCanal.length);
});

test("firma: coincide con la de SGC (hash calculado con cctv/stock_sgc.py), detecta alteraciones y archivos sin firma", async () => {
  const obj = {
    dispositivos: [{ id: "d1", tipo: "nvr", estado: "", mac: "aa:bb:cc:dd:ee:01", serial: "S1", canales: 16, marca: "Hik", modelo: "M", patrimonio: "", firmware: "", comentario: "ñ" },
      { id: "d2", tipo: "camara", forma: "domo", mac: "aa:bb:cc:dd:ee:02" }],
    grabadores: [{ id: "g1", dispositivoId: "d1", canales_n: 16, descripcion: "NVR 1", tipo: "nvr", ip: "10.0.0.1", edificio: "A", piso: "1",
      canales_data: [{ canal: 1, dispositivoId: "d2", descripcion: "Hall", ip: "10.0.0.2" }] }],
    otros_prod: [], tiposCustom: {}, edificios: ["A"] };
  const esperado = "24f8eb706f26badb9aec4e0cc62f242ec3e91d9541dc908822b0debbb7bf9547";
  assert.equal(await M.migFirmaSgc(obj), esperado);
  assert.equal(await M.migEstadoFirma({ ...obj, hash: esperado }), "ok");
  assert.equal(await M.migEstadoFirma({ ...obj, hash: esperado, edificios: ["B"] }), "alterada");
  assert.equal(await M.migEstadoFirma(obj), "sin_firma");
});

test("dos equipos en el mismo canal: el segundo queda sin canal y se avisa (no se pisa)", () => {
  const b = sgc();
  b.grabadores[0].canales_data = [{ canal: 1, dispositivoId: "cam1", descripcion: "A" }, { canal: 1, dispositivoId: "cam2", descripcion: "B" }];
  const r = migrar(b);
  assert.equal(por(r, "cam1").instalacion.canal, 1);
  assert.equal(por(r, "cam2").instalacion.canal, null);
  assert.equal(por(r, "cam2").instalacion.descripcion, "B", "conserva su descripción como instalado sin canal");
  assert.ok(r.avisos.some(a => /el canal ya lo ocupa/.test(a)));
});
