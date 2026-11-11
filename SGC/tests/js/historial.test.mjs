// Deshacer y rehacer (bloque HISTORIAL PURO de js/historial-puro.js): las pilas, las etiquetas y, sobre todo, que deshacer sea un
// cambio NUEVO para la sincronización con el Gist (lápidas y fechas), para que no se pierda ni vuelva a borrarse.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const G0 = { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date };
const D = cargarBloque("datos-puro.js", "DATOS PURO", G0,
  ["datosVacios", "crearDispositivo", "modificarDispositivo", "eliminarDispositivo", "sanearDatos"]);
const H = cargarBloque("historial-puro.js", "HISTORIAL PURO", { Array, Map, Set, Math, Object, JSON, String },
  ["HISTORIAL_TOPE", "pilasVacias", "pilasEmpujar", "pilasDeshacer", "pilasRehacer", "etiquetaDeRuta", "restaurarEstado"]);
const G = cargarBloque("gist.js", "GIST PURO", { ...G0, Uint8Array, TextEncoder, TextDecoder, btoa, atob, crypto: globalThis.crypto },
  ["gistFusionar"]);

let n = 0;
const ctx = (hhmmss) => ({ ahora: () => `2026-11-05T${hhmmss}Z`, nuevoId: () => `id${++n}`, usuario: null });
const entrada = (extra = {}) => ({ tipo: "domo", condicion: "operativo", marca: "Bosch", modelo: "M1", ...extra });
const copia = (d) => D.sanearDatos(structuredClone(plano(d)), "2026-11-05T09:00:00Z").datos;
const ids = (d) => plano(d.dispositivos).map((x) => x.id).sort();

test("pilas: empujar, deshacer, rehacer; un cambio nuevo vacía lo que se podía rehacer", () => {
  let p = H.pilasVacias();
  assert.equal(H.pilasDeshacer(p, "A"), null);
  assert.equal(H.pilasRehacer(p, "A"), null);
  p = H.pilasEmpujar(p, "A", "uno");           // A → B
  p = H.pilasEmpujar(p, "B", "dos");           // B → C
  const d = H.pilasDeshacer(p, "C");
  assert.equal(d.destino, "B");
  assert.equal(d.etiqueta, "dos");
  const r = H.pilasRehacer(d.pilas, "B");
  assert.equal(r.destino, "C");
  assert.equal(r.etiqueta, "dos");
  const nuevo = H.pilasEmpujar(d.pilas, "B", "tres");        // después de deshacer, un cambio nuevo
  assert.equal(nuevo.futuro.length, 0);
  assert.equal(H.pilasRehacer(nuevo, "X"), null);
});

test("pilas: tope de 30, se descartan los más viejos", () => {
  let p = H.pilasVacias();
  for (let i = 0; i < 40; i++) p = H.pilasEmpujar(p, i, `c${i}`);
  assert.equal(p.pasado.length, H.HISTORIAL_TOPE);
  assert.equal(p.pasado[0].estado, 10);
  assert.equal(p.pasado.at(-1).estado, 39);
});

test("etiquetaDeRuta: nombre legible por método y ruta", () => {
  const e = H.etiquetaDeRuta;
  assert.equal(e("POST", "/api/stock/dispositivos"), "Alta de dispositivo");
  assert.equal(e("PUT", "/api/stock/dispositivos/abc"), "Edición de dispositivo");
  assert.equal(e("DELETE", "/api/stock/dispositivos/abc"), "Baja de dispositivo");
  assert.equal(e("POST", "/api/stock/dispositivos/altas"), "Alta en lote");
  assert.equal(e("POST", "/api/stock/dispositivos/lote"), "Cambio en lote");
  assert.equal(e("POST", "/api/stock/grupos"), "Alta de grupo");
  assert.equal(e("DELETE", "/api/stock/tipos/x"), "Baja de tipo");
  assert.equal(e("PUT", "/api/stock/tipos/x"), "Cambio de tipo");
  assert.equal(e("POST", "/api/stock/edificios"), "Alta de edificio");
  assert.equal(e("POST", "/api/stock/ubicaciones"), "Cambio de edificios y pisos");
  assert.equal(e("PUT", "/api/stock/modelos"), "Página de un modelo");
  assert.equal(e("GET", "/otra/cosa"), "Cambio");
});

test("restaurarEstado: deshacer una baja devuelve el dispositivo, sin lápida y como cambio nuevo", () => {
  const antes = D.datosVacios();
  const a = D.crearDispositivo(antes, entrada({ serie: "S1" }), ctx("10:00:00"));
  const conA = copia(antes);                                    // estado con el dispositivo
  D.eliminarDispositivo(antes, a.id, a.version, ctx("10:05:00"));
  assert.ok(antes.eliminados.dispositivos[a.id]);               // hoy: borrado, con lápida
  const r = H.restaurarEstado(antes, conA, "2026-11-05T10:10:00Z");
  assert.deepEqual(ids(r), [a.id]);
  assert.equal(r.eliminados.dispositivos[a.id], undefined, "sin lápida");
  const d = r.dispositivos[0];
  assert.equal(d.actualizado, "2026-11-05T10:10:00Z");
  assert.equal(d.version, a.version + 1);
});

test("restaurarEstado: deshacer un alta lo saca y deja lápida de ahora; lo que no cambió queda idéntico", () => {
  const datos = D.datosVacios();
  const x = D.crearDispositivo(datos, entrada({ serie: "X" }), ctx("10:00:00"));
  const sinY = copia(datos);
  const y = D.crearDispositivo(datos, entrada({ serie: "Y" }), ctx("10:01:00"));
  const r = H.restaurarEstado(datos, sinY, "2026-11-05T10:02:00Z");
  assert.deepEqual(ids(r), [x.id]);
  assert.equal(r.eliminados.dispositivos[y.id], "2026-11-05T10:02:00Z");
  assert.deepEqual(plano(r.dispositivos[0]), plano(datos.dispositivos.find((d) => d.id === x.id)), "el que no cambió, igual");
});

test("restaurarEstado: el registro de cambios se conserva (deshacer no reescribe lo que pasó)", () => {
  const datos = D.datosVacios();
  D.crearDispositivo(datos, entrada({ serie: "H1" }), ctx("10:00:00"));
  const anterior = copia(D.datosVacios());
  const r = H.restaurarEstado(datos, anterior, "2026-11-05T10:05:00Z");
  assert.deepEqual(plano(r.historial), plano(datos.historial));
  assert.equal(r.historial_seq, datos.historial_seq);
});

test("restaurarEstado: la edición deshecha sube la versión por encima de la actual (un formulario viejo da conflicto)", () => {
  const datos = D.datosVacios();
  const a = D.crearDispositivo(datos, entrada({ serie: "E1" }), ctx("10:00:00"));
  const antes = copia(datos);
  D.modificarDispositivo(datos, a.id, { ...entrada({ serie: "E1" }), marca: "Axis" }, a.version, ctx("10:01:00"));
  const actual = datos.dispositivos[0];
  const r = H.restaurarEstado(datos, antes, "2026-11-05T10:02:00Z");
  assert.equal(r.dispositivos[0].marca, "Bosch");
  assert.equal(r.dispositivos[0].version, actual.version + 1);
});

// ---- con la sincronización del Gist: lo deshecho tiene que ganarle a lo que ya estaba subido
const AHORA = "2026-11-05T12:00:00Z";
const fusion = (l, r) => G.gistFusionar(copia(l), copia(r), D.sanearDatos, AHORA);

test("Gist: deshacer una baja y sincronizar NO vuelve a borrarlo (aunque el Gist tenga la lápida o el dispositivo viejo)", () => {
  const local = D.datosVacios();
  const a = D.crearDispositivo(local, entrada({ serie: "G1" }), ctx("10:00:00"));
  const conA = copia(local);
  const remoto = copia(local);                                   // el Gist tiene el dispositivo viejo
  D.eliminarDispositivo(local, a.id, a.version, ctx("10:05:00"));
  const remotoConLapida = copia(local);                          // y otro caso: el Gist ya recibió la baja
  const deshecho = H.restaurarEstado(local, conA, "2026-11-05T10:10:00Z");
  for (const r of [remoto, remotoConLapida]) {
    const f = fusion(deshecho, r);
    assert.deepEqual(ids(f.datos), [a.id], "el dispositivo sigue");
    assert.equal(f.datos.eliminados.dispositivos[a.id], undefined);
  }
  // y el Gist con la baja se corrige: lo local es más nuevo, hay que subirlo
  assert.equal(fusion(deshecho, remotoConLapida).cambiaRemoto, true);
});

test("Gist: deshacer un alta ya subida la borra también del Gist (lápida de ahora)", () => {
  const local = D.datosVacios();
  const sinNada = copia(local);
  const a = D.crearDispositivo(local, entrada({ serie: "G2" }), ctx("10:00:00"));
  const remoto = copia(local);                                   // ya se subió
  const deshecho = H.restaurarEstado(local, sinNada, "2026-11-05T10:10:00Z");
  const f = fusion(deshecho, remoto);
  assert.deepEqual(ids(f.datos), [], "no vuelve desde el Gist");
  assert.ok(f.datos.eliminados.dispositivos[a.id]);
  assert.equal(f.cambiaRemoto, true);
});

test("Gist: deshacer una edición ya subida gana contra la versión editada del Gist", () => {
  const local = D.datosVacios();
  const a = D.crearDispositivo(local, entrada({ serie: "G3" }), ctx("10:00:00"));
  const antes = copia(local);
  D.modificarDispositivo(local, a.id, { ...entrada({ serie: "G3" }), marca: "Axis" }, a.version, ctx("10:01:00"));
  const remoto = copia(local);                                   // el Gist tiene "Axis"
  const deshecho = H.restaurarEstado(local, antes, "2026-11-05T10:10:00Z");
  const f = fusion(deshecho, remoto);
  assert.equal(f.datos.dispositivos[0].marca, "Bosch");
});
