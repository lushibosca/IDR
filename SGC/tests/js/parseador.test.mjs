// Parseadores del cctv_online.json (bloque PARSEADOR PURO de js/parseador.js): datos (MAC → serie/firmware/modelo) y canales.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const D = cargarBloque("datos-puro.js", "DATOS PURO",
  { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date },
  ["datosVacios", "crearDispositivo", "modificarDispositivo", "editarUbicacion", "textoAcotado", "enteroAcotado",
    "ipLiteralValida", "macNormalizada", "_opcional", "NULOS_SERIE", "TIPOS_GRABADOR", "CONDICION_PRODUCCION", "CANALES_MAX",
    "GRUPO_CAMARAS", "ErrorDatos", "_formulario", "asignacionesDe"]);
const P = cargarBloque("parseador.js", "PARSEADOR PURO", { String, Number, Array, Map, Set, Math, Object, JSON, RegExp, Error, ...D },
  ["parsearArchivoEscaner", "parsPlanDatos", "parsPlanCanales", "parsAplicarDatos", "parsAplicarCanales", "ErrorParseo"]);

let n = 0;
const ctx = () => { let t = 0; return { ahora: () => `2026-11-05T10:00:${String(t++ % 60).padStart(2, "0")}Z`, nuevoId: () => `id${++n}`, usuario: null, origen: "importacion" }; };
function stock() {
  const d = D.datosVacios();
  const c = ctx();
  D.editarUbicacion(d, { objeto: "edificio", accion: "agregar", nombre: "Anexo" }, c);
  D.editarUbicacion(d, { objeto: "piso", accion: "agregar", nombre: "PB" }, c);
  const nvr = D.crearDispositivo(d, { tipo: "nvr", marca: "Hikvision", modelo: "DS-9664", mac: "4c:bd:8f:9a:25:fc", canales: 16,
    instalacion: { descripcion: "NVR 5", ip: "10.105.0.196", edificio: "Anexo", piso: "PB" } }, c);
  return { d, c, nvr };
}
const camara = (o) => ({ ip_address: "10.0.0.5", camera_name: "Pasillo", mac_address: "aa:bb:cc:00:00:01", modelo: "DS-2CD1", nro_serie: "S1",
  firmware: "V5", nvr_name: "NVR-5", nvr_ip: "10.105.0.196", channel_id: 1, ...o });
const nvrArch = (o) => ({ ip: "10.105.0.196", nvr_name: "NVR-5", modelo: "DS-9664", nro_serie: "N5", mac_address: "4C-BD-8F-9A-25-FC", firmware: "V4", total_camaras: 3, ...o });
const archivo = (nvrs, camaras) => P.parsearArchivoEscaner(JSON.stringify({ nvrs, camaras }));

test("archivo: se revisa, se normaliza y se rechaza lo que no tiene la forma", () => {
  const a = archivo([nvrArch()], [camara({ ip_address: "no-es-ip", mac_address: "AABBCCDDEEFF", nro_serie: "N/A", channel_id: 0 })]);
  assert.equal(a.nvrs[0].mac, "4c:bd:8f:9a:25:fc");
  assert.equal(a.camaras[0].ip, null);
  assert.equal(a.camaras[0].mac, "aa:bb:cc:dd:ee:ff");
  assert.equal(a.camaras[0].serie, null);
  assert.equal(a.camaras[0].canal, null);
  for (const mal of ["", "no json", "[]", "{}", '{"nvrs":[],"camaras":[]}', "x".repeat(9 * 1024 * 1024)]) {
    assert.throws(() => P.parsearArchivoEscaner(mal), (e) => e instanceof P.ErrorParseo || e.constructor.name === "ErrorParseo");
  }
  assert.equal(archivo([nvrArch(), nvrArch()], []).nvrs.length, 1);
});

test("datos: serie, firmware y modelo por MAC; nunca se pisa con vacío; serie ajena se omite", () => {
  const { d, c } = stock();
  const cam = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01", modelo: "viejo", firmware: "V1", serie: "ORIG" }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:02", serie: "OCUPADA" }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:03", serie: "S3", modelo: "M3", firmware: "F3" }, c);
  const a = archivo([nvrArch({ nro_serie: "N5" })], [
    camara({ mac_address: "aa:bb:cc:00:00:01", modelo: "DS-2CD1", nro_serie: "NUEVA", firmware: "" }),
    camara({ mac_address: "aa:bb:cc:00:00:02", nro_serie: "s3", channel_id: 2 }),
    camara({ mac_address: "aa:bb:cc:00:00:03", modelo: "M3", nro_serie: "S3", firmware: "F3", channel_id: 3 }),
    camara({ mac_address: "aa:bb:cc:00:00:99", channel_id: 4 })]);
  const plan = P.parsPlanDatos(d, a);
  const act = plan.actualizaciones.find(x => x.id === cam.id);
  assert.deepEqual(plano(act.campos.map(x => [x.campo, x.antes, x.despues])), [["serie", "ORIG", "NUEVA"], ["modelo", "viejo", "DS-2CD1"]]);
  assert.ok(plan.actualizaciones.some(x => x.nombre === "NVR 5"), "el NVR también (serie N5)");
  assert.equal(plan.omitidas.length, 1);
  assert.match(plan.omitidas[0].motivo, /ya la tiene/);
  assert.equal(plan.nuevos, 1);
  assert.equal(plan.sinCambios, 1);
  const r = P.parsAplicarDatos(d, plan, ctx());
  assert.equal(r.fallos.length, 0);
  const despues = d.dispositivos.find(x => x.id === cam.id);
  assert.equal(despues.serie, "NUEVA");
  assert.equal(despues.firmware, "V1", "el vacío del archivo no borra");
  assert.ok(d.historial.some(h => h.origen === "importacion" && h.campo === "serie"));
});

test("datos: una MAC con valores distintos en el archivo no se aplica", () => {
  const { d, c } = stock();
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01" }, c);
  const a = archivo([], [camara({ nro_serie: "A" }), camara({ nro_serie: "B", channel_id: 2 })]);
  const plan = P.parsPlanDatos(d, a);
  assert.equal(plan.actualizaciones.length, 1);
  assert.ok(!plan.actualizaciones[0].campos.some(x => x.campo === "serie"));
  assert.match(plan.omitidas[0].motivo, /2 valores distintos/);
});

test("canales: vincula el NVR por MAC y asigna la cámara a su canal con descripción e IP", () => {
  const { d, c, nvr } = stock();
  const cam = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01" }, c);
  const plan = P.parsPlanCanales(d, archivo([nvrArch()], [camara({ channel_id: 7 })]));
  assert.equal(plan.grabadores[0].estado, "vinculado");
  assert.equal(plan.grabadores[0].grabadorId, nvr.id);
  assert.equal(plan.acciones.length, 1);
  assert.equal(plan.acciones[0].tipo, "asignar");
  const r = P.parsAplicarCanales(d, plan, ctx());
  assert.deepEqual(plano(r), { asignados: 1, altas: 0, liberados: 0, grabadoresCreados: 0, fallos: [] });
  const i = d.dispositivos.find(x => x.id === cam.id).instalacion;
  assert.deepEqual(plano([i.asignaciones, i.descripcion, i.ip, i.edificio, i.piso]), [[{ grabador: nvr.id, canal: 7 }], "Pasillo", "10.0.0.5", "Anexo", "PB"]);
  // aplicar de nuevo no cambia nada
  const otra = P.parsPlanCanales(d, archivo([nvrArch()], [camara({ channel_id: 7 })]));
  assert.equal(otra.acciones.length, 0);
  assert.equal(otra.sinCambios, 1);
});

test("canales: el NVR nunca se vincula por nombre parecido; sin vínculo se ignora o se da de alta", () => {
  const { d } = stock();
  const a = archivo([nvrArch({ nvr_name: "NVR 5", mac_address: "00:00:00:00:00:99", nro_serie: "OTRA", ip: "10.9.9.9" })], [camara({ nvr_name: "NVR 5" })]);
  assert.equal(P.parsPlanCanales(d, a).grabadores[0].estado, "ignorado");
  const crear = P.parsPlanCanales(d, a, { mapeo: { "NVR 5": "crear" }, altas: true });
  assert.equal(crear.grabadores[0].estado, "crear");
  assert.equal(crear.grabadores[0].canalesN, 4);
  const r = P.parsAplicarCanales(d, crear, ctx());
  assert.equal(r.grabadoresCreados, 1);
  assert.equal(r.altas, 1);
  assert.deepEqual(plano(r.fallos), []);
  const nuevo = d.dispositivos.find(x => x.mac === "00:00:00:00:00:99");
  assert.equal(nuevo.tipo, "nvr");
  assert.equal(nuevo.marca, "Hikvision");
  const camAlta = d.dispositivos.find(x => x.mac === "aa:bb:cc:00:00:01");
  assert.deepEqual(plano(camAlta.instalacion.asignaciones), [{ grabador: nuevo.id, canal: 1 }], "la cámara nueva queda asignada al canal (no suelta)");
});

test("canales: conflictos visibles, nada se mueve solo", () => {
  const { d, c, nvr } = stock();
  const enOtro = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01", instalacion: { descripcion: "X", asignaciones: [{ grabador: nvr.id, canal: 9 }] } }, c);
  const ocupante = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:02", instalacion: { descripcion: "Ocupa", asignaciones: [{ grabador: nvr.id, canal: 2 }] } }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:03", condicion: "averiado" }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:04" }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:05" }, c);
  const a = archivo([nvrArch()], [
    camara({ mac_address: "aa:bb:cc:00:00:01", channel_id: 1 }),           // ya está en el CH 9
    camara({ mac_address: "aa:bb:cc:00:00:04", channel_id: 2 }),           // canal ocupado por otro
    camara({ mac_address: "aa:bb:cc:00:00:03", channel_id: 3 }),           // no operativo
    camara({ mac_address: "aa:bb:cc:00:00:05", channel_id: 20 }),          // fuera de la capacidad (16)
    camara({ mac_address: "aa:bb:cc:00:00:06", channel_id: 5 }),           // repetida: 2 canales
    camara({ mac_address: "aa:bb:cc:00:00:06", channel_id: 6 }),
    camara({ mac_address: "aa:bb:cc:00:00:07", channel_id: 8 }),           // canal repetido
    camara({ mac_address: "aa:bb:cc:00:00:08", channel_id: 8 }),
    camara({ mac_address: "aa:bb:cc:00:00:09", channel_id: 10 })]);        // sin match
  const plan = P.parsPlanCanales(d, a);
  const motivos = plan.conflictos.map(x => x.motivo).join(" | ");
  assert.match(motivos, /ya está en el CH 9 de este grabador/);
  assert.match(motivos, /el canal lo ocupa «Ocupa»/);
  assert.match(motivos, /no está operativo/);
  assert.match(motivos, /tiene 16 canales/);
  assert.match(motivos, /MAC aparece en más de un canal de este grabador/);
  assert.match(motivos, /canal aparece más de una vez/);
  assert.equal(plan.acciones.length, 0);
  assert.equal(plan.sinMatch.length, 1);
  assert.equal(d.dispositivos.find(x => x.id === enOtro.id).instalacion.asignaciones[0].canal, 9);
  assert.equal(d.dispositivos.find(x => x.id === ocupante.id).instalacion.asignaciones[0].canal, 2);
});

test("canales: «reemplazar» libera los canales que el archivo no trae; «conservar» no toca nada", () => {
  const { d, c, nvr } = stock();
  const a1 = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01", instalacion: { descripcion: "Uno", asignaciones: [{ grabador: nvr.id, canal: 1 }] } }, c);
  const a2 = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:02", instalacion: { descripcion: "Dos", asignaciones: [{ grabador: nvr.id, canal: 2 }] } }, c);
  const a = archivo([nvrArch()], [camara({ mac_address: "aa:bb:cc:00:00:01", camera_name: "Uno", ip_address: null, channel_id: 1 })]);
  assert.equal(P.parsPlanCanales(d, a, { modo: "conservar" }).acciones.filter(x => x.tipo === "liberar").length, 0);
  const plan = P.parsPlanCanales(d, a, { modo: "reemplazar" });
  assert.deepEqual(plano(plan.acciones.map(x => [x.tipo, x.canal])), [["liberar", 2]]);
  const r = P.parsAplicarCanales(d, plan, ctx());
  assert.equal(r.liberados, 1);
  const i2 = d.dispositivos.find(x => x.id === a2.id).instalacion;
  assert.deepEqual(plano([i2.asignaciones, i2.descripcion]), [[], "Dos"]);
  assert.equal(d.dispositivos.find(x => x.id === a1.id).instalacion.asignaciones[0].canal, 1);
  // un archivo sin cámaras de ese NVR no vacía nada
  const vacio = P.parsPlanCanales(d, archivo([nvrArch()], []), { modo: "reemplazar" });
  assert.equal(vacio.acciones.length, 0);
});

test("canales: un fallo de una cámara no tira el resto (queda en el informe)", () => {
  const { d, c } = stock();
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01" }, c);
  D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:02" }, c);
  const plan = P.parsPlanCanales(d, archivo([nvrArch()], [camara({ mac_address: "aa:bb:cc:00:00:01", channel_id: 1 }),
    camara({ mac_address: "aa:bb:cc:00:00:02", channel_id: 2 })]));
  d.dispositivos.find(x => x.mac === "aa:bb:cc:00:00:01").version += 5;          // otra edición mientras tanto no afecta: se lee la vigente
  d.dispositivos.find(x => x.mac === "aa:bb:cc:00:00:02").condicion = "averiado";   // pero esta ya no puede ir a producción
  const r = P.parsAplicarCanales(d, plan, ctx());
  assert.equal(r.asignados, 1);
  assert.equal(r.fallos.length, 1);
});

test("canales: la misma cámara en dos grabadores es redundancia, no conflicto (alta y asignación)", () => {
  const { d, c, nvr } = stock();
  const nvr2 = D.crearDispositivo(d, { tipo: "nvr", mac: "4c:bd:8f:00:00:02", canales: 8, instalacion: { descripcion: "NVR 2", ip: "10.105.0.197" } }, c);
  const existente = D.crearDispositivo(d, { tipo: "domo", mac: "aa:bb:cc:00:00:01" }, c);
  const a = archivo([nvrArch(), nvrArch({ nvr_name: "NVR-2", ip: "10.105.0.197", mac_address: "4c:bd:8f:00:00:02", nro_serie: "N2" })],
    [camara({ channel_id: 3 }), camara({ nvr_name: "NVR-2", channel_id: 5 }),
      camara({ mac_address: "aa:bb:cc:00:00:55", camera_name: "Nueva", channel_id: 4 }),
      camara({ mac_address: "aa:bb:cc:00:00:55", camera_name: "Nueva (2)", nvr_name: "NVR-2", channel_id: 6 })]);
  const plan = P.parsPlanCanales(d, a, { altas: true });
  assert.equal(plan.conflictos.length, 0, plan.conflictos.map(x => x.motivo).join("|"));
  const r = P.parsAplicarCanales(d, plan, ctx());
  assert.deepEqual(plano(r.fallos), []);
  const e = d.dispositivos.find(x => x.id === existente.id).instalacion;
  assert.deepEqual(plano(e.asignaciones.map(x => [x.grabador, x.canal]).sort()), [[nvr.id, 3], [nvr2.id, 5]].sort());
  const nueva = d.dispositivos.filter(x => x.mac === "aa:bb:cc:00:00:55");
  assert.equal(nueva.length, 1, "una sola cámara, no dos");
  assert.deepEqual(plano(nueva[0].instalacion.asignaciones.map(x => x.canal).sort()), [4, 6]);
  assert.equal(nueva[0].instalacion.descripcion, "Nueva", "descripción e IP: la primera fila");
  // dos canales del MISMO grabador para la misma MAC sí es un conflicto
  const mal = P.parsPlanCanales(d, archivo([nvrArch()], [camara({ channel_id: 8 }), camara({ channel_id: 9 })]));
  assert.ok(mal.conflictos.some(x => /más de un canal de este grabador/.test(x.motivo)));
});
