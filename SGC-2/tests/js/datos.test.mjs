// Reglas del stock en el navegador (bloque DATOS PURO de js/datos-puro.js): las de cctv_monitor (cctv/stock.py) sobre el
// JSON. Sin DOM ni almacenamiento: el instante y los ids se inyectan.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const D = cargarBloque("datos-puro.js", "DATOS PURO",
  { String, Number, Array, Map, Set, Math, Object, JSON, URL, RegExp, Error, Date },
  ["datosVacios", "listado", "crearDispositivo", "crearLote", "modificarDispositivo", "modificarLote", "eliminarDispositivo",
    "crearGrupo", "renombrarGrupo", "borrarGrupo", "crearTipo", "modificarTipo", "borrarTipo", "editarUbicacion",
    "agregarEdificio", "ubicaciones", "modelos", "fijarPaginaModelo", "historialDispositivo", "historialReciente",
    "sanearDatos", "exportarDatos", "datosProduccion", "normalizarPiso", "macNormalizada", "ipLiteralValida", "urlWeb",
    "textoAcotado", "enteroAcotado", "claveDesdeNombre", "ErrorDatos", "MAX_HISTORIAL"]);

function contexto() {
  let n = 0, t = 0;
  return {
    ahora: () => `2026-11-05T10:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t++ % 60).padStart(2, "0")}Z`,
    nuevoId: () => `id${++n}`, usuario: null,
  };
}
function base() {
  const datos = D.datosVacios();
  const ctx = contexto();
  D.editarUbicacion(datos, { objeto: "edificio", accion: "agregar", nombre: "Anexo A" }, ctx);
  D.editarUbicacion(datos, { objeto: "piso", accion: "agregar", nombre: "PB" }, ctx);
  return { datos, ctx };
}
function rechaza(fn, estado, texto) {
  try { fn(); } catch (e) {
    assert.equal(e.estado, estado, `estado ${e.estado}: ${e.message}`);
    if (texto) assert.match(e.detalle(), texto);
    return e;
  }
  assert.fail("no rechazó");
}

test("formatos: MAC canónica, IP literal (nunca un nombre), URL http(s) completa", () => {
  assert.equal(D.macNormalizada("AA-BB-CC-DD-EE-FF"), "aa:bb:cc:dd:ee:ff");
  assert.equal(D.macNormalizada("aabbccddeeff"), "aa:bb:cc:dd:ee:ff");
  for (const m of ["aa:bb-cc:dd:ee:ff", "aa:bb:cc:dd:ee", "zz:bb:cc:dd:ee:ff", null, 12]) assert.equal(D.macNormalizada(m), null);
  assert.equal(D.ipLiteralValida(" 10.0.0.1 "), "10.0.0.1");
  assert.equal(D.ipLiteralValida("FE80::1%eth0"), "fe80::1%eth0");
  for (const ip of ["10.0.0.256", "010.0.0.1", "camara.local", "1.2.3", "", "::1]", null]) assert.equal(D.ipLiteralValida(ip), null);
  assert.equal(D.urlWeb("https://www.hikvision.com/x"), "https://www.hikvision.com/x");
  for (const u of ["javascript:alert(1)", "ftp://x", "https://u:p@x", "https://a b", "http://", 5]) assert.equal(D.urlWeb(u), null);
});

test("texto: sin control ni bidi, recortado y acotado; enteros solo enteros ASCII", () => {
  assert.equal(D.textoAcotado(" a\u0007b‮c  ", 10), "abc");
  assert.equal(D.textoAcotado("abcdef", 3), "abc");
  assert.equal(D.textoAcotado({}, 5), "");
  assert.equal(D.textoAcotado(true, 5), "");
  assert.equal(D.enteroAcotado("16", 1, 4096), 16);
  for (const v of ["1e3", "٣", 2.5, true, "", "99999"]) assert.equal(D.enteroAcotado(v, 1, 4096), null);
});

test("pisos: una sola forma de escribir cada uno", () => {
  const casos = { "pb": "PB", "planta baja": "PB", "1er piso": "1", "piso 01": "1", "subsuelo 1": "1SS", "2do ss": "2SS",
    "entrepiso 2": "EP2", "azotea": "TERRAZA", "  sótano ": "1SS", "mezzanine": "MEZZANINE" };
  for (const [entrada, forma] of Object.entries(casos)) assert.equal(D.normalizarPiso(entrada), forma, entrada);
});

test("alta: normaliza, valida todo junto y exige serie/MAC/patrimonio únicos", () => {
  const { datos, ctx } = base();
  const d = D.crearDispositivo(datos, { tipo: "domo", marca: "bosh", serie: "s/n", patrimonio: "P-1", mac: "AA:BB:CC:00:00:01" }, ctx);
  assert.equal(d.marca, "Bosch");
  assert.equal(d.serie, null);                                       // «s/n» es «sin dato»
  assert.equal(d.disponible, true);
  const e = rechaza(() => D.crearDispositivo(datos, { tipo: "nada", mac: "x", canales: 0,
    instalacion: { ip: "host", edificio: "Otro", piso: "7", puerto: "??" } }, ctx), 422);
  for (const parte of ["tipo", "MAC", "canales", "IP", "edificio", "piso", "puerto"]) assert.match(e.message, new RegExp(parte));
  rechaza(() => D.crearDispositivo(datos, { tipo: "bullet", patrimonio: "p-1" }, ctx), 409, /Datos repetidos: patrimonio/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "bullet", mac: "aa-bb-cc-00-00-01" }, ctx), 409, /mac/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", condicion: "averiado", instalacion: {} }, ctx), 422, /operativo/);
  assert.equal(datos.dispositivos.length, 1);
});

test("alta en lote: todo o nada, sin repetidos dentro del lote", () => {
  const { datos, ctx } = base();
  const r = D.crearLote(datos, { tipo: "domo", marca: "Hik" }, [{ serie: "A1" }, { serie: "A2" }], ctx);
  assert.deepEqual(plano(r), { creados: 2, ids: ["id1", "id2"] });
  const e = rechaza(() => D.crearLote(datos, { tipo: "domo" }, [{ serie: "B1" }, { serie: "b1" }, { serie: "a1" }], ctx), 422);
  assert.match(e.message, /fila 2: serie b1: ya está en la fila 1/);
  assert.match(e.message, /fila 3: .*ya la tiene el dispositivo id1/);
  assert.match(e.message, /No se guardó ninguna/);
  assert.equal(datos.dispositivos.length, 2);
});

test("edición: versión leída (409 si cambió), sin cambios no escribe, cambiar la condición saca de producción", () => {
  const { datos, ctx } = base();
  const d = D.crearDispositivo(datos, { tipo: "domo", instalacion: { descripcion: "Pasillo", edificio: "Anexo A", piso: "pb" } }, ctx);
  assert.equal(d.instalacion.piso, "PB");
  const igual = D.modificarDispositivo(datos, d.id, { ...d }, 1, ctx);
  assert.equal(igual.version, 1);
  const r = D.modificarDispositivo(datos, d.id, { ...d, condicion: "averiado" }, 1, ctx);
  assert.equal(r.version, 2);
  assert.equal(r.instalacion, null);                                 // salió de producción
  rechaza(() => D.modificarDispositivo(datos, d.id, { ...d }, 1, ctx), 409, /cambió desde que lo abriste/);
  rechaza(() => D.modificarDispositivo(datos, "nada", { ...d }, 1, ctx), 404);
  const h = D.historialDispositivo(datos, d.id).entradas.map((x) => x.campo);
  assert.ok(h.includes("condicion") && h.includes("instalacion") && h.includes("alta"));
});

test("cambio en lote: simula, aplica lo válido y omite con motivo", () => {
  const { datos, ctx } = base();
  const a = D.crearDispositivo(datos, { tipo: "domo", instalacion: { edificio: "Anexo A" } }, ctx);
  const b = D.crearDispositivo(datos, { tipo: "domo" }, ctx);
  const pedidos = [{ id: a.id, version: 1 }, { id: b.id, version: 1 }, { id: "x", version: 1 }];
  const sim = D.modificarLote(datos, pedidos, { piso: "pb" }, false, ctx);
  assert.equal(sim.aplicado, false);
  assert.deepEqual(plano(sim.actualizados.map((x) => x.dispositivo_id)), [a.id]);
  assert.deepEqual(plano(sim.omitidos.map((x) => x.motivo)), ["no está instalado (depósito): sin edificio, piso ni rack", "no existe"]);
  assert.equal(datos.dispositivos.find((d) => d.id === a.id).instalacion.piso, "");          // simular no escribe
  D.modificarLote(datos, pedidos, { piso: "pb" }, true, ctx);
  assert.equal(datos.dispositivos.find((d) => d.id === a.id).instalacion.piso, "PB");
  rechaza(() => D.modificarLote(datos, pedidos, { marca: "x" }, false, ctx), 422, /elegí qué cambiar/);
});

test("borrado: con la versión, deja historial y lápida para la sincronización", () => {
  const { datos, ctx } = base();
  const d = D.crearDispositivo(datos, { tipo: "pc", marca: "Dell", serie: "Z9" }, ctx);
  rechaza(() => D.eliminarDispositivo(datos, d.id, 9, ctx), 409);
  D.eliminarDispositivo(datos, d.id, 1, ctx);
  assert.equal(datos.dispositivos.length, 0);
  assert.ok(datos.eliminados.dispositivos[d.id]);
  const h = D.historialReciente(datos, { accion: "borrar" });
  assert.equal(h.cambios.length, 1);
  assert.equal(h.cambios[0].dispositivo_borrado, true);
  assert.match(h.cambios[0].equipo, /pc Dell · serie Z9/);
});

test("catálogo: claves desde el nombre, de sistema no se borran, con equipos no se mueven", () => {
  const { datos, ctx } = base();
  assert.equal(D.claveDesdeNombre("Cámara térmica", []), "camara_termica");
  assert.equal(D.claveDesdeNombre("Domo", ["domo"]), "domo_2");
  const cat = D.crearGrupo(datos, "Accesos", ctx);
  assert.deepEqual(plano(cat.grupos.map((g) => g.clave)), ["servidores", "camaras", "otros", "accesos"]);
  rechaza(() => D.crearGrupo(datos, "accesos ", ctx), 409, /Ya existe un grupo/);
  D.crearTipo(datos, "Lector", "accesos", ctx);
  D.crearDispositivo(datos, { tipo: "lector" }, ctx);
  rechaza(() => D.modificarTipo(datos, "lector", "Lector", "otros", ctx), 409, /para moverlo de grupo/);
  rechaza(() => D.borrarGrupo(datos, "accesos", ctx), 409, /tiene dispositivos/);
  rechaza(() => D.borrarTipo(datos, "nvr", ctx), 409, /del sistema/);
  rechaza(() => D.borrarGrupo(datos, "camaras", ctx), 409, /del sistema/);
  rechaza(() => D.crearTipo(datos, "X", "nada", ctx), 422);
  D.renombrarGrupo(datos, "camaras", "Cámaras IP", ctx);
  assert.equal(D.listado(datos).grupos[1].etiqueta, "Cámaras IP");
});

test("ubicaciones: agregar sin duplicar, renombrar mueve todo y unifica, borrar solo si nadie la usa", () => {
  const { datos, ctx } = base();
  D.agregarEdificio(datos, "anexo a", ctx);
  assert.deepEqual(plano(datos.edificios), ["Anexo A"]);
  const d = D.crearDispositivo(datos, { tipo: "domo", instalacion: { edificio: "Anexo A", piso: "PB" } }, ctx);
  D.editarUbicacion(datos, { objeto: "edificio", accion: "agregar", nombre: "Central" }, ctx);
  rechaza(() => D.editarUbicacion(datos, { objeto: "edificio", accion: "borrar", nombre: "Anexo A" }, ctx), 409, /lo usan 1/);
  const r = D.editarUbicacion(datos, { objeto: "edificio", accion: "renombrar", nombre: "Anexo A", nuevo: "central" }, ctx);
  assert.equal(r.guardado, "Central");                              // ya existía: se unifican
  assert.deepEqual(plano(r.edificios), [{ nombre: "Central", usos: 1 }]);
  const movido = datos.dispositivos.find((x) => x.id === d.id);
  assert.equal(movido.instalacion.edificio, "Central");
  assert.equal(movido.version, 2);                                   // una edición abierta no lo pisa
  rechaza(() => D.editarUbicacion(datos, { objeto: "piso", accion: "borrar", nombre: "9" }, ctx), 404);
  rechaza(() => D.editarUbicacion(datos, { objeto: "edificio", accion: "renombrar", nombre: "Central" }, ctx), 422);
});

test("modelos: únicos sin distinguir mayúsculas, página solo http(s) y de un modelo que existe", () => {
  const { datos, ctx } = base();
  D.crearDispositivo(datos, { tipo: "domo", marca: "Hik", modelo: "DS-1" }, ctx);
  D.crearDispositivo(datos, { tipo: "domo", modelo: "ds-1" }, ctx);
  assert.deepEqual(plano(D.modelos(datos).modelos), [{ marca: "Hik", modelo: "ds-1", usos: 2, pagina: null }]);
  D.fijarPaginaModelo(datos, "DS-1", "https://x.com/ds1", ctx);
  assert.equal(D.listado(datos).dispositivos[0].pagina_modelo, "https://x.com/ds1");
  rechaza(() => D.fijarPaginaModelo(datos, "DS-1", "javascript:alert(1)", ctx), 422);
  rechaza(() => D.fijarPaginaModelo(datos, "Otro", "https://x.com", ctx), 404);
});

test("historial: filtro por acción y texto literal, paginado, con tope", () => {
  const { datos, ctx } = base();
  for (let i = 0; i < 40; i++) D.crearDispositivo(datos, { tipo: "domo", serie: `S${i}` }, ctx);
  const p1 = D.historialReciente(datos, { accion: "agregar" });
  assert.equal(p1.cambios.length, 30);
  assert.equal(p1.siguiente_offset, 30);
  assert.ok(p1.cambios[0].cuando >= p1.cambios[1].cuando);           // del más nuevo al más viejo
  assert.equal(D.historialReciente(datos, { texto: "s39" }).cambios.length, 1);
  assert.equal(D.historialReciente(datos, { texto: "%" }).cambios.length, 0);      // literal, sin comodines
  for (let i = 0; i < D.MAX_HISTORIAL; i++) D.renombrarGrupo(datos, "otros", `Otros ${i}`, ctx);
  assert.equal(datos.historial.length, D.MAX_HISTORIAL);
});

test("vista de producción: solo los grabadores instalados, sin nada caído", () => {
  const { datos, ctx } = base();
  D.crearDispositivo(datos, { tipo: "nvr", canales: 32, instalacion: { descripcion: "NVR 1", ip: "10.0.0.1" } }, ctx);
  D.crearDispositivo(datos, { tipo: "nvr" }, ctx);
  D.crearDispositivo(datos, { tipo: "domo", instalacion: {} }, ctx);
  const v = D.datosProduccion(datos);
  assert.deepEqual(plano(v.nvrs.map((n) => [n.nvr_name, n.ip, n.total_camaras, n.is_offline])), [["NVR 1", "10.0.0.1", 32, false]]);
  assert.deepEqual(plano(v.camaras), []);
});

test("saneo de lo que entra: formato ajeno vacío, ids y únicos repetidos fuera, catálogo de sistema siempre", () => {
  assert.equal(D.sanearDatos({ formato: "otro", dispositivos: [{ id: "a", tipo: "domo" }] }, "2026-01-01T00:00:00Z").datos.dispositivos.length, 0);
  const r = D.sanearDatos({
    formato: "sgc2",
    catalogo: { grupos: [{ clave: "camaras", etiqueta: "Mías", sistema: false }, { clave: "<x>", etiqueta: "x" }],
      tipos: [{ clave: "nvr", etiqueta: "N", grupo: "otros", sistema: false }, { clave: "nuevo", etiqueta: "Nuevo", grupo: "nada" }] },
    dispositivos: [
      { id: "a", tipo: "domo", mac: "AA:BB:CC:DD:EE:FF", condicion: "rara", version: "x",
        instalacion: { ip: "nombre.local", edificio: " Nuevo  Edificio ", piso: "planta baja", puerto: "<script>" } },
      { id: "a", tipo: "domo" }, { id: "../x", tipo: "domo" }, { id: "b", tipo: "inventado", mac: "aabbccddeeff" },
      "basura", null,
    ],
    historial: [{ objeto: "dispositivo", campo: "alta", cuando: "ayer" }, { objeto: "tipo", campo: "alta", cuando: "2026-01-01T00:00:00Z", n: 5 }],
    eliminados: { dispositivos: { a: "2026-01-01T00:00:00Z", zz: "2026-01-01T00:00:00Z", "<x>": "2026-01-01T00:00:00Z" } },
  }, "2026-02-02T00:00:00Z");
  const d = r.datos;
  assert.deepEqual(plano(d.dispositivos.map((x) => [x.id, x.tipo, x.condicion, x.mac])),
    [["a", "domo", "revisar", "aa:bb:cc:dd:ee:ff"], ["b", "otro", "revisar", null]]);
  assert.deepEqual(plano(d.dispositivos[0].instalacion), { descripcion: "", ip: null, edificio: "Nuevo Edificio", piso: "PB",
    rack: "", puerto: "", comentario: "", actualizado: "2026-02-02T00:00:00Z", asignaciones: [] });
  assert.ok(d.edificios.includes("Nuevo Edificio") && d.pisos.includes("PB"));
  const nvr = d.catalogo.tipos.find((t) => t.clave === "nvr");
  assert.equal(nvr.sistema, true);
  assert.equal(nvr.grupo, "servidores");                               // uno de sistema no se mueve
  assert.equal(d.catalogo.tipos.find((t) => t.clave === "nuevo").grupo, "otros");
  assert.equal(d.catalogo.grupos.find((g) => g.clave === "camaras").sistema, true);
  assert.equal(d.historial.length, 1);
  assert.deepEqual(plano(Object.keys(d.eliminados.dispositivos)), ["zz"]);    // la lápida de uno que está, no
  assert.ok(r.avisos.some((a) => /no se cargaron/.test(a)) && r.avisos.some((a) => /repetidos/.test(a)));
});

test("exportar e importar: ida y vuelta sin pérdida", () => {
  const { datos, ctx } = base();
  D.crearDispositivo(datos, { tipo: "nvr", marca: "Hik", canales: 16, instalacion: { ip: "10.0.0.1", edificio: "Anexo A" } }, ctx);
  const vuelta = D.sanearDatos(JSON.parse(JSON.stringify(D.exportarDatos(datos, "2026-11-05T00:00:00Z"))), "2030-01-01T00:00:00Z");
  assert.deepEqual(plano(D.listado(vuelta.datos)), plano(D.listado(datos)));
  assert.deepEqual(plano(vuelta.avisos), []);
});

// ---------------------------------------------------------------- producción manual: grabador + canal
function conGrabador() {
  const { datos, ctx } = base();
  const g = D.crearDispositivo(datos, { tipo: "nvr", canales: 8, instalacion: { descripcion: "NVR 1", ip: "10.0.0.1" } }, ctx);
  return { datos, ctx, g };
}

test("canal: grabador y canal juntos, el grabador es un NVR/DVR instalado y el canal entra en su capacidad", () => {
  const { datos, ctx, g } = conGrabador();
  const c = D.crearDispositivo(datos, { tipo: "domo", instalacion: { descripcion: "Hall", grabador: g.id, canal: "2" } }, ctx);
  assert.deepEqual([c.instalacion.grabador, c.instalacion.canal], [g.id, 2]);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: g.id } }, ctx), 422, /van los dos juntos/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: g.id, canal: 9 } }, ctx), 422, /tiene 8 canales/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: c.id, canal: 1 } }, ctx), 422, /NVR\/DVR instalado/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "dvr", instalacion: { grabador: g.id, canal: 1 } }, ctx), 422, /un grabador no va/);
  const enDeposito = D.crearDispositivo(datos, { tipo: "nvr" }, ctx);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: enDeposito.id, canal: 1 } }, ctx), 422);
  rechaza(() => D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: g.id, canal: 2 } }, ctx), 409,
    /canal 2 de «NVR 1»: ya lo ocupa «Hall»/);
});

test("canal: mover de canal y sacar de producción lo liberan; el historial lo registra", () => {
  const { datos, ctx, g } = conGrabador();
  const c = D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: g.id, canal: 1 } }, ctx);
  const movida = D.modificarDispositivo(datos, c.id, { ...c, instalacion: { ...c.instalacion, asignaciones: [{ grabador: g.id, canal: 5 }] } }, 1, ctx);
  assert.equal(movida.instalacion.canal, 5);
  D.crearDispositivo(datos, { tipo: "bullet", instalacion: { grabador: g.id, canal: 1 } }, ctx);    // el 1 quedó libre
  const fuera = D.modificarDispositivo(datos, c.id, { ...movida, instalacion: null }, 2, ctx);
  assert.equal(fuera.instalacion, null);
  const campos = D.historialDispositivo(datos, c.id).entradas.map((e) => [e.campo, e.antes, e.despues]);
  assert.ok(campos.some(([c0, a, b]) => c0 === "instalacion.asignaciones" && a === `${g.id}#1` && b === `${g.id}#5`));
});

test("grabador con asignados: no sale de producción, no cambia de tipo, no se achica ni se borra", () => {
  const { datos, ctx, g } = conGrabador();
  D.crearDispositivo(datos, { tipo: "domo", instalacion: { grabador: g.id, canal: 6 } }, ctx);
  const actual = D.listado(datos).dispositivos.find((x) => x.id === g.id);
  rechaza(() => D.modificarDispositivo(datos, g.id, { ...actual, instalacion: null }, 1, ctx), 409, /1 dispositivo asignado/);
  rechaza(() => D.modificarDispositivo(datos, g.id, { ...actual, condicion: "averiado" }, 1, ctx), 409);
  rechaza(() => D.modificarDispositivo(datos, g.id, { ...actual, tipo: "pc" }, 1, ctx), 409);
  rechaza(() => D.modificarDispositivo(datos, g.id, { ...actual, canales: 4 }, 1, ctx), 409, /canal 6 está ocupado/);
  assert.equal(D.modificarDispositivo(datos, g.id, { ...actual, canales: 6 }, 1, ctx).canales, 6);
  rechaza(() => D.eliminarDispositivo(datos, g.id, 2, ctx), 409);
  const lote = D.modificarLote(datos, [{ id: g.id, version: 2 }], { condicion: "revisar" }, true, ctx);
  assert.match(lote.omitidos[0].motivo, /asignado/);
});

test("vista de producción: lo asignado sale como cámara de su grabador, ordenado por canal", () => {
  const { datos, ctx, g } = conGrabador();
  D.crearDispositivo(datos, { tipo: "domo", mac: "aa:bb:cc:dd:ee:02", instalacion: { descripcion: "B", grabador: g.id, canal: 4 } }, ctx);
  D.crearDispositivo(datos, { tipo: "domo", instalacion: { descripcion: "A", ip: "10.0.1.1", grabador: g.id, canal: 2 } }, ctx);
  D.crearDispositivo(datos, { tipo: "monitor", instalacion: { descripcion: "Sin canal" } }, ctx);
  const v = D.datosProduccion(datos);
  assert.deepEqual(plano(v.camaras.map((c) => [c.camera_name, c.channel_id, c.nvr_name, c.nvr_ip, c.ip_address, c.mac_address])),
    [["A", 2, "NVR 1", "10.0.0.1", "10.0.1.1", "-"], ["B", 4, "NVR 1", "10.0.0.1", "N/A", "aa:bb:cc:dd:ee:02"]]);
  assert.ok(v.camaras.every((c) => c.is_offline === false && c.stock && c.stock.id));
});

test("saneo: asignaciones rotas (grabador inexistente, fuera de rango, repetidas, a sí mismo) quedan sin canal (los datos viejos con grabador+canal sueltos se leen igual)", () => {
  const disp = (id, tipo, inst, extra = {}) => ({ id, tipo, instalacion: inst, ...extra });
  const r = D.sanearDatos({ formato: "sgc2", dispositivos: [
    disp("g", "nvr", {}, { canales: 4 }),
    disp("a", "domo", { grabador: "g", canal: 1 }),
    disp("b", "domo", { grabador: "g", canal: 1 }),
    disp("c", "domo", { grabador: "g", canal: 9 }),
    disp("d", "domo", { grabador: "nada", canal: 2 }),
    disp("e", "nvr", { grabador: "g", canal: 3 }),
    disp("f", "domo", { grabador: "g", canal: null }),
  ] }, "2026-01-01T00:00:00Z");
  const canal = (id) => r.datos.dispositivos.find((y) => y.id === id).instalacion.asignaciones;
  assert.deepEqual(plano(canal("a")), [{ grabador: "g", canal: 1 }]);
  for (const id of ["b", "c", "d", "e", "f"]) assert.deepEqual(plano(canal(id)), [], id);
  assert.ok(r.avisos.some((a) => /4 asignación/.test(a)));
});

test("una cámara en varios grabadores: todas las asignaciones valen igual", () => {
  const { datos, ctx, g } = conGrabador();
  const g2 = D.crearDispositivo(datos, { tipo: "nvr", canales: 8, instalacion: { descripcion: "NVR 2", ip: "10.0.0.2" } }, ctx);
  const c = D.crearDispositivo(datos, { tipo: "domo", instalacion: { descripcion: "Redundante",
    asignaciones: [{ grabador: g.id, canal: 7 }, { grabador: g2.id, canal: 3 }] } }, ctx);
  assert.deepEqual(plano(c.instalacion.asignaciones), [{ grabador: g.id, canal: 7 }, { grabador: g2.id, canal: 3 }]);
  const v = D.datosProduccion(datos);
  assert.deepEqual(plano(v.camaras.filter((x) => x.camera_name === "Redundante").map((x) => [x.nvr_name, x.channel_id])),
    [["NVR 1", 7], ["NVR 2", 3]]);
  // cada canal sigue siendo de un solo equipo, y un mismo grabador no puede estar dos veces
  rechaza(() => D.crearDispositivo(datos, { tipo: "bullet", instalacion: { asignaciones: [{ grabador: g2.id, canal: 3 }] } }, ctx), 409, /canal 3 de «NVR 2»/);
  rechaza(() => D.crearDispositivo(datos, { tipo: "bullet", instalacion: { asignaciones: [{ grabador: g.id, canal: 8 }, { grabador: g.id, canal: 9 }] } }, ctx), 422, /dos veces/);
  // los dos grabadores quedan protegidos mientras tengan la cámara
  rechaza(() => D.eliminarDispositivo(datos, g2.id, 1, ctx), 409);
  // quitar una asignación libera solo ese canal
  const una = D.modificarDispositivo(datos, c.id, { ...c, instalacion: { ...c.instalacion, asignaciones: [{ grabador: g2.id, canal: 3 }] } }, 1, ctx);
  assert.deepEqual(plano(una.instalacion.asignaciones), [{ grabador: g2.id, canal: 3 }]);
  D.crearDispositivo(datos, { tipo: "bullet", instalacion: { asignaciones: [{ grabador: g.id, canal: 7 }] } }, ctx);
});

test("datos guardados con el par grabador+canal suelto se leen como una asignación", () => {
  const r = D.sanearDatos({ formato: "sgc2", dispositivos: [{ id: "g", tipo: "nvr", condicion: "operativo", canales: 4, instalacion: {} },
    { id: "a", tipo: "domo", condicion: "operativo", instalacion: { grabador: "g", canal: 2 } }] }, "2026-01-01T00:00:00Z");
  assert.deepEqual(plano(r.datos.dispositivos[1].instalacion.asignaciones), [{ grabador: "g", canal: 2 }]);
  assert.equal(r.avisos.length, 0);
});
