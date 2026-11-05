// Gist cifrado (bloque GIST PURO de js/gist.js): cifrado AES-GCM, frase, fusión por dispositivo y lápidas.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const D = cargarBloque("datos-puro.js", "DATOS PURO",
  { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date },
  ["datosVacios", "crearDispositivo", "modificarDispositivo", "eliminarDispositivo", "sanearDatos", "exportarDatos",
    "editarUbicacion"]);
const G = cargarBloque("gist.js", "GIST PURO",
  { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date, Uint8Array, TextEncoder, TextDecoder,
    btoa, atob, crypto: globalThis.crypto },
  ["gistCifrar", "gistDescifrar", "gistSobreValido", "gistEvaluarFrase", "gistGenerarFrase", "gistFusionar",
    "gistResumenTexto", "gistRawValida", "gistErrorHttp", "gistABase64", "gistDesdeBase64", "ErrorGist"]);

const FRASE = "frase de prueba bien larga 123";
let n = 0;
function ctx(minuto) {
  let t = 0;
  return { ahora: () => `2026-11-05T10:${String(minuto).padStart(2, "0")}:${String(t++).padStart(2, "0")}Z`,
    nuevoId: () => `id${++n}`, usuario: null };
}
const entrada = (extra = {}) => ({ tipo: "domo", condicion: "operativo", marca: "Bosch", modelo: "M1", ...extra });
const copia = (d) => D.sanearDatos(structuredClone(plano(d)), "2026-11-05T09:00:00Z").datos;
const AHORA = "2026-11-05T12:00:00Z";
const fusion = (l, r) => G.gistFusionar(copia(l), copia(r), D.sanearDatos, AHORA);

test("frase: mínimo 20 caracteres, NFC, aviso si es débil", () => {
  assert.equal(G.gistEvaluarFrase("corta").ok, false);
  assert.equal(G.gistEvaluarFrase(FRASE).ok, true);
  assert.equal(G.gistEvaluarFrase(FRASE).debil, false);
  assert.equal(G.gistEvaluarFrase("a".repeat(25)).debil, true);
  assert.equal(G.gistEvaluarFrase("1234567890 1234567890").debil, true);
  assert.equal(G.gistEvaluarFrase("  " + FRASE + "  ").frase, FRASE);
  assert.equal(G.gistEvaluarFrase("café con leche de la tarde").frase.includes("́"), false);
});

test("generar frase: 5 palabras de 3 sílabas, sin sesgo y siempre válida", () => {
  const f = G.gistGenerarFrase((k) => [...crypto.getRandomValues(new Uint8Array(k))]);
  assert.match(f, /^([bcdfgjklmnprstvz][aeiou]){3}(-([bcdfgjklmnprstvz][aeiou]){3}){4}$/);
  assert.equal(G.gistEvaluarFrase(f).ok, true);
  assert.notEqual(f, G.gistGenerarFrase((k) => [...crypto.getRandomValues(new Uint8Array(k))]));
  // los bytes ≥ 240 se descartan: con solo ellos y luego un 0 sale «ba» repetido
  const seq = [0, ...Array(30).fill(250)];
  const g = G.gistGenerarFrase(() => [...seq]);
  assert.match(g, /^ba/);
});

test("cifrar y descifrar: ida y vuelta, sal reutilizable, IV nuevo cada vez", async () => {
  const s1 = await G.gistCifrar('{"a":1,"ñ":"é"}', FRASE);
  assert.equal(s1.formato, "sgc2-cifrado");
  assert.ok(s1.iter >= 600000);
  assert.equal(await G.gistDescifrar(s1, FRASE), '{"a":1,"ñ":"é"}');
  const s2 = await G.gistCifrar('{"a":1,"ñ":"é"}', FRASE, { sal: s1.sal });
  assert.equal(s2.sal, s1.sal);
  assert.notEqual(s2.iv, s1.iv);
  assert.notEqual(s2.datos, s1.datos);
  assert.equal(await G.gistDescifrar(s2, FRASE), '{"a":1,"ñ":"é"}');
});

test("descifrar: frase equivocada o contenido alterado falla con un mensaje claro", async () => {
  const s = await G.gistCifrar("secreto", FRASE);
  await assert.rejects(() => G.gistDescifrar(s, "otra frase distinta bien larga"), /frase es incorrecta o el Gist fue alterado/);
  const bytes = G.gistDesdeBase64(s.datos);
  bytes[0] ^= 1;
  await assert.rejects(() => G.gistDescifrar({ ...s, datos: G.gistABase64(bytes) }, FRASE), /alterado/);
  await assert.rejects(() => G.gistDescifrar(s, "corta"), /al menos 20/);
});

test("sobre ajeno: se rechazan formato, versión, iteraciones fuera de rango y base64 raro", () => {
  const ok = { formato: "sgc2-cifrado", version: 1, kdf: "PBKDF2-SHA-256", iter: 600000,
    sal: G.gistABase64(new Uint8Array(16)), iv: G.gistABase64(new Uint8Array(12)), datos: "A".repeat(40) };
  assert.doesNotThrow(() => G.gistSobreValido(ok));
  for (const mal of [null, [], {}, { ...ok, formato: "otro" }, { ...ok, version: 2 }, { ...ok, kdf: "scrypt" },
    { ...ok, iter: 1000 }, { ...ok, iter: 1e9 }, { ...ok, sal: "AAAA" }, { ...ok, iv: "!!" }, { ...ok, datos: "x" }]) {
    assert.throws(() => G.gistSobreValido(mal), (e) => e.codigo === "formato");
  }
});

test("fusión: dispositivos de cada lado se juntan; en conflicto gana el más reciente", () => {
  const a = D.datosVacios(), b = D.datosVacios();
  const c1 = ctx(1);
  const comun = D.crearDispositivo(a, entrada({ serie: "S-COMUN" }), c1);
  b.dispositivos.push(structuredClone(a.dispositivos[0]));
  b.historial = structuredClone(a.historial);
  D.crearDispositivo(a, entrada({ serie: "S-LOCAL" }), ctx(2));
  D.crearDispositivo(b, entrada({ serie: "S-REMOTO" }), ctx(3));
  D.modificarDispositivo(b, comun.id, entrada({ serie: "S-COMUN", modelo: "Nuevo" }), 1, ctx(4));
  const r = fusion(a, b);
  assert.deepEqual(plano(r.datos.dispositivos.map(d => d.serie).sort()), ["S-COMUN", "S-LOCAL", "S-REMOTO"]);
  assert.equal(r.datos.dispositivos.find(d => d.serie === "S-COMUN").modelo, "Nuevo");
  assert.deepEqual(plano(r.resumen), { agregados: 1, actualizados: 1, eliminados: 0, revividos: 0 });
  assert.equal(r.cambiaLocal, true);
  assert.equal(r.cambiaRemoto, true);
  assert.match(G.gistResumenTexto(r), /1 dispositivo\(s\) nuevo\(s\), 1 actualizado/);
});

test("fusión: dos personas editando equipos distintos no se pisan (merge por dispositivo)", () => {
  const base = D.datosVacios();
  const x = D.crearDispositivo(base, entrada({ serie: "X" }), ctx(1));
  const y = D.crearDispositivo(base, entrada({ serie: "Y" }), ctx(1));
  const a = structuredClone(base), b = structuredClone(base);
  D.modificarDispositivo(a, x.id, entrada({ serie: "X", modelo: "A-edit" }), 1, ctx(5));
  D.modificarDispositivo(b, y.id, entrada({ serie: "Y", modelo: "B-edit" }), 1, ctx(6));
  const r = fusion(a, b);
  const por = Object.fromEntries(r.datos.dispositivos.map(d => [d.serie, d.modelo]));
  assert.deepEqual(plano(por), { X: "A-edit", Y: "B-edit" });
});

test("fusión: igual a igual no cambia nada ni sube nada", () => {
  const a = D.datosVacios();
  D.crearDispositivo(a, entrada({ serie: "S1" }), ctx(1));
  const r = fusion(a, a);
  assert.equal(r.cambiaLocal, false);
  assert.equal(r.cambiaRemoto, false);
  assert.deepEqual(plano(r.resumen), { agregados: 0, actualizados: 0, eliminados: 0, revividos: 0 });
});

test("lápidas: lo borrado en un lado se borra en el otro; una edición posterior lo revive", () => {
  const base = D.datosVacios();
  const x = D.crearDispositivo(base, entrada({ serie: "X" }), ctx(1));
  const y = D.crearDispositivo(base, entrada({ serie: "Y" }), ctx(1));
  // remoto borra X → local (que lo tiene igual) lo pierde
  const remoto = structuredClone(base);
  D.eliminarDispositivo(remoto, x.id, 1, ctx(10));
  let r = fusion(base, remoto);
  assert.deepEqual(plano(r.datos.dispositivos.map(d => d.serie)), ["Y"]);
  assert.equal(r.resumen.eliminados, 1);
  assert.ok(r.datos.eliminados.dispositivos[x.id]);
  assert.equal(r.cambiaLocal, true);
  assert.equal(r.cambiaRemoto, false);
  // local borra Y → el remoto (que lo tiene) deja de tenerlo: hay que subir
  const local = structuredClone(base);
  D.eliminarDispositivo(local, y.id, 1, ctx(10));
  r = fusion(local, base);
  assert.deepEqual(plano(r.datos.dispositivos.map(d => d.serie)), ["X"]);
  assert.equal(r.cambiaRemoto, true);
  // el remoto borró X a las 10:10 pero local lo editó a las 10:20 → vive
  const editado = structuredClone(base);
  D.modificarDispositivo(editado, x.id, entrada({ serie: "X", modelo: "Despues" }), 1, ctx(20));
  r = fusion(editado, remoto);
  assert.deepEqual(plano(r.datos.dispositivos.map(d => d.serie).sort()), ["X", "Y"]);
  assert.equal(r.resumen.revividos, 1);
  assert.equal(r.datos.eliminados.dispositivos[x.id], undefined);
});

test("fusión: serie repetida entre dos equipos nuevos queda avisada, no se pierde ningún equipo", () => {
  const a = D.datosVacios(), b = D.datosVacios();
  D.crearDispositivo(a, entrada({ serie: "IGUAL" }), ctx(1));
  D.crearDispositivo(b, entrada({ serie: "IGUAL" }), ctx(2));
  const r = fusion(a, b);
  assert.equal(r.datos.dispositivos.length, 2);
  assert.equal(r.datos.dispositivos.filter(d => d.serie === "IGUAL").length, 1);
  assert.ok(r.avisos.some(m => /repetidos/.test(m)));
});

test("fusión: catálogo, edificios, pisos e historial se unen sin repetir", () => {
  const a = D.datosVacios(), b = D.datosVacios();
  D.editarUbicacion(a, { objeto: "edificio", accion: "agregar", nombre: "Anexo A" }, ctx(1));
  D.editarUbicacion(b, { objeto: "edificio", accion: "agregar", nombre: "Anexo B" }, ctx(2));
  D.editarUbicacion(b, { objeto: "piso", accion: "agregar", nombre: "PB" }, ctx(2));
  b.catalogo.tipos.push({ clave: "switch_x", etiqueta: "Switch X", grupo: "otros", sistema: false });
  const r = fusion(a, b);
  assert.deepEqual(plano([...r.datos.edificios].sort()), ["Anexo A", "Anexo B"]);
  assert.deepEqual(plano(r.datos.pisos), ["PB"]);
  assert.ok(r.datos.catalogo.tipos.some(t => t.clave === "switch_x"));
  const r2 = fusion(r.datos, r.datos);
  assert.equal(r2.datos.historial.length, r.datos.historial.length);
});

test("utilidades: raw_url solo de gist.githubusercontent.com, errores HTTP con texto", () => {
  assert.equal(G.gistRawValida("https://gist.githubusercontent.com/u/id/raw/sgc2.json"), true);
  assert.equal(G.gistRawValida("https://evil.example/raw"), false);
  assert.equal(G.gistRawValida("http://gist.githubusercontent.com/x"), false);
  assert.equal(G.gistRawValida("javascript:alert(1)"), false);
  assert.match(G.gistErrorHttp(401, "leer"), /token/);
  assert.match(G.gistErrorHttp(404, "leer"), /No existe/);
  assert.match(G.gistErrorHttp(500, "leer"), /500/);
});
