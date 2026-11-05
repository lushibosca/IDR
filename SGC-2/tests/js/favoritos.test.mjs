// Pruebas de Favoritos (static/favoritos.js, bloque puro): identidad de cada equipo, lista guardada, agregar/quitar
// con tope, qué equipos se pueden marcar (solo los que el sistema monitorea) y el modelo de los tiles.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const comun = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado", "uiNumeroCanal"]);
const f = cargarBloque("favoritos.js", "FAVORITOS PURO", { String, Array, Set, RegExp, Math, JSON, ...comun }, [
  "MAX_FAVORITOS", "claveFavorito", "partesFavorito", "favoritosValidos", "alternarFavorito", "favoritoDeEquipo",
  "resolverFavorito", "modeloFavoritos", "firmaFavoritos", "etiquetaFavorito", "columnasFavoritos", "reordenarFavoritos", "favoritosDeStock", "sumarFavoritos", "textoSumaFavoritos",
  "dispositivoPorIp", "dispositivoDeCanal", "dispositivoTitulo",
]);

const DATOS = {
  nvrs: [{ ip: "10.0.0.1", nvr_name: "NVR Principal", modelo: "DS-7616NI", is_offline: false },
    { ip: "10.0.0.2", nvr_name: "N/A", modelo: "N/A", is_offline: true }],
  camaras: [
    { nvr_ip: "10.0.0.1", channel_id: 1, camera_name: "Cam 01", ip_address: "192.168.1.101", modelo: "DS-2CD2123G0-I", is_offline: false },
    { nvr_ip: "10.0.0.1", channel_id: "2", camera_name: "Cam 02", ip_address: "192.168.1.102", modelo: "-", is_offline: true },
    { nvr_ip: "10.0.0.1", channel_id: "3", camera_name: "Cam 03", ip_address: "", modelo: "-", is_offline: true, sin_senal: true }],
  equipos_red: [{ ip: "10.9.9.9", nombre: "Decoder", estado: "online", modelo: "DS-6900" },
    { ip: "10.9.9.8", nombre: "Analítica", estado: "desconocido" }],
};

test("claveFavorito: nvr, equipo y cámara; con canal 'CH 3'; nada de lo que no sea IP o canal", () => {
  assert.equal(f.claveFavorito("nvr", "10.0.0.1"), "nvr:10.0.0.1");
  assert.equal(f.claveFavorito("eq", " 10.9.9.9 "), "eq:10.9.9.9");
  assert.equal(f.claveFavorito("cam", "10.0.0.1", "CH 3"), "cam:10.0.0.1:3");
  assert.equal(f.claveFavorito("cam", "10.0.0.1", ""), null);
  assert.equal(f.claveFavorito("cam", "10.0.0.1", "3a"), null);
  assert.equal(f.claveFavorito("nvr", "nvr-central"), null, "un nombre de host no es una IP (anti-SSRF: nunca se resuelve)");
  assert.equal(f.claveFavorito("nvr", "N/A"), null);
  assert.equal(f.claveFavorito("otro", "10.0.0.1"), null);
});

test("favoritosValidos: descarta lo que no tiene la forma, los repetidos y lo que pasa del tope", () => {
  assert.deepEqual(plano(f.favoritosValidos(["nvr:10.0.0.1", "nvr:10.0.0.1", "x", 7, null, "cam:10.0.0.1:2", "cam:10.0.0.1:", "eq:<b>"])),
    ["nvr:10.0.0.1", "cam:10.0.0.1:2"]);
  for (const basura of [null, undefined, "nvr:10.0.0.1", {}, 3]) assert.deepEqual(plano(f.favoritosValidos(basura)), []);
  const muchas = Array.from({ length: f.MAX_FAVORITOS + 5 }, (_, i) => `cam:10.0.0.1:${i + 1}`);
  assert.equal(f.favoritosValidos(muchas).length, f.MAX_FAVORITOS);
});

test("alternarFavorito: agrega al final, quita, y con el tope lleno no agrega", () => {
  let r = f.alternarFavorito(["nvr:10.0.0.1"], "eq:10.9.9.9");
  assert.deepEqual(plano(r), { lista: ["nvr:10.0.0.1", "eq:10.9.9.9"], agregado: true, lleno: false });
  r = f.alternarFavorito(r.lista, "nvr:10.0.0.1");
  assert.deepEqual(plano(r), { lista: ["eq:10.9.9.9"], agregado: false, lleno: false });
  r = f.alternarFavorito(["a", "b"], "c", 2);
  assert.deepEqual(plano(r), { lista: ["a", "b"], agregado: false, lleno: true });
  assert.deepEqual(plano(f.alternarFavorito(["a", "b"], "a", 2)), { lista: ["b"], agregado: false, lleno: false }, "quitar con el tope lleno anda");
});

test("favoritoDeEquipo: solo lo que el sistema monitorea hoy", () => {
  const cam = { nvr_ip: "10.0.0.1", channel_id: 1, ip_address: "192.168.1.101" };
  assert.deepEqual(plano(f.favoritoDeEquipo(cam, false, DATOS)), { clave: "cam:10.0.0.1:1", tipo: "cam" });
  assert.deepEqual(plano(f.favoritoDeEquipo({ ...cam, channel_id: "CH 2" }, false, DATOS)), { clave: "cam:10.0.0.1:2", tipo: "cam" });
  assert.equal(f.favoritoDeEquipo({ ...cam, channel_id: 9 }, false, DATOS), null, "un canal que el sistema no tiene");
  assert.deepEqual(plano(f.favoritoDeEquipo({ nvr_ip: "10.0.0.1", ip_address: "10.0.0.1" }, true, DATOS)), { clave: "nvr:10.0.0.1", tipo: "nvr" });
  assert.deepEqual(plano(f.favoritoDeEquipo({ ip_address: "10.0.0.1" }, true, DATOS)), { clave: "nvr:10.0.0.1", tipo: "nvr" });
  assert.equal(f.favoritoDeEquipo({ ip_address: "10.7.7.7" }, true, DATOS), null);
  assert.deepEqual(plano(f.favoritoDeEquipo({ ip_address: "10.9.9.9" }, false, DATOS)), { clave: "eq:10.9.9.9", tipo: "eq" });
  assert.equal(f.favoritoDeEquipo({ ip_address: "10.5.5.5" }, false, DATOS), null, "un activo del stock que nadie monitorea");
  assert.equal(f.favoritoDeEquipo({ ip_address: "10.0.0.1" }, false, DATOS), null, "un grabador no entra como equipo de red");
  assert.equal(f.favoritoDeEquipo(null, false, DATOS), null);
  assert.equal(f.favoritoDeEquipo(cam, false, null), null, "sin datos cargados no se marca nada");
  assert.equal(f.favoritoDeEquipo(cam, false, {}), null);
});

test("resolverFavorito: estado, nombre y modelo de cada tipo", () => {
  const cam = f.resolverFavorito("cam:10.0.0.1:1", DATOS);
  assert.deepEqual(plano({ ...cam, cam: undefined }), { clave: "cam:10.0.0.1:1", tipo: "cam", nombre: "Cam 01",
    ip: "192.168.1.101", modelo: "DS-2CD2123G0-I", estado: "online" });
  assert.equal(f.resolverFavorito("cam:10.0.0.1:2", DATOS).estado, "offline");
  assert.equal(f.resolverFavorito("cam:10.0.0.1:3", DATOS).estado, "sin_senal", "sin señal no es caída");
  const nvr = f.resolverFavorito("nvr:10.0.0.2", DATOS);
  assert.equal(nvr.nombre, "10.0.0.2", "sin nombre informado, la IP");
  assert.equal(nvr.estado, "offline");
  assert.equal(nvr.modelo, "");
  assert.equal(nvr.cam.nvr_ip, "10.0.0.2");
  assert.equal(nvr.cam.channel_id, null);
  const eq = f.resolverFavorito("eq:10.9.9.9", DATOS);
  assert.equal(eq.nombre, "Decoder");
  assert.equal(eq.estado, "online");
  assert.equal(eq.cam.nvr_ip, "");
  assert.equal(f.resolverFavorito("eq:10.9.9.8", DATOS).estado, "desconocido");
  assert.equal(f.resolverFavorito("eq:10.1.1.1", DATOS), null, "ya no está en los datos");
  assert.equal(f.resolverFavorito("basura", DATOS), null);
  assert.equal(f.resolverFavorito("nvr:10.0.0.1", null), null);
});

test("modeloFavoritos: respeta el orden en que se agregaron y omite lo que ya no está; la firma cambia con el estado", () => {
  const guardados = ["eq:10.9.9.9", "cam:10.0.0.1:9", "nvr:10.0.0.1", "cam:10.0.0.1:2"];
  const items = f.modeloFavoritos(guardados, DATOS);
  assert.deepEqual(plano(items.map(i => i.clave)), ["eq:10.9.9.9", "nvr:10.0.0.1", "cam:10.0.0.1:2"]);
  const otra = f.modeloFavoritos(guardados, { ...DATOS, nvrs: [{ ...DATOS.nvrs[0], is_offline: true }, DATOS.nvrs[1]] });
  assert.notEqual(f.firmaFavoritos(items), f.firmaFavoritos(otra));
  assert.equal(f.firmaFavoritos(items), f.firmaFavoritos(f.modeloFavoritos(guardados, DATOS)));
});

test("columnasFavoritos: filas parejas en vez de una tarjeta suelta, y siempre al menos una columna", () => {
  assert.equal(f.columnasFavoritos(6, 900), 3, "caben 4: 3 + 3 y no 4 + 2");
  assert.equal(f.columnasFavoritos(5, 900), 3, "caben 4: 3 + 2");
  assert.equal(f.columnasFavoritos(4, 900), 4);
  assert.equal(f.columnasFavoritos(3, 900), 3, "menos tiles que columnas: no se estiran de más");
  assert.equal(f.columnasFavoritos(8, 900), 4);
  assert.equal(f.columnasFavoritos(9, 900), 3);
  assert.equal(f.columnasFavoritos(6, 100), 1, "ventana angosta");
  assert.equal(f.columnasFavoritos(0, 900), 1);
});

test("reordenarFavoritos: los que se ven ocupan sus mismos lugares y los que no se pintan no se mueven", () => {
  assert.deepEqual(plano(f.reordenarFavoritos(["a", "b", "c"], ["c", "a", "b"])), ["c", "a", "b"]);
  assert.deepEqual(plano(f.reordenarFavoritos(["a", "oculto", "b", "c"], ["c", "b", "a"])), ["c", "oculto", "b", "a"]);
  assert.deepEqual(plano(f.reordenarFavoritos([], [])), []);
});

const { indiceEnPunto } = cargarBloque("comun.js", "REORDEN GRILLA PURO", {}, ["indiceEnPunto"]);

test("indiceEnPunto: el tile bajo el puntero, o -1 en los huecos", () => {
  const rects = [{ left: 0, right: 100, top: 0, bottom: 50 }, { left: 112, right: 212, top: 0, bottom: 50 }];
  assert.equal(indiceEnPunto(rects, 10, 10), 0);
  assert.equal(indiceEnPunto(rects, 150, 40), 1);
  assert.equal(indiceEnPunto(rects, 105, 10), -1);
  assert.equal(indiceEnPunto([], 1, 1), -1);
});

test("favoritosDeStock: los marcados que el sistema monitorea (cámara, grabador, equipo de red); el resto se cuenta aparte", () => {
  const datos = {
    camaras: [{ nvr_ip: "10.0.0.1", channel_id: "CH 4", stock: { id: "s1" } }, { nvr_ip: "10.0.0.1", channel_id: 5 }],
    nvrs: [{ ip: "10.0.0.1", stock: { id: "s2" } }], equipos_red: [{ ip: "10.9.9.9", stock: { id: "s3" } }],
  };
  const r = f.favoritosDeStock(["s1", "s2", "s3", "s9"], datos);
  assert.deepEqual(plano(r), { claves: ["cam:10.0.0.1:4", "nvr:10.0.0.1", "eq:10.9.9.9"], noMonitoreados: 1 });
  assert.deepEqual(plano(f.favoritosDeStock(["s1"], null)), { claves: [], noMonitoreados: 1 });
});

test("sumarFavoritos: sin repetir y hasta el máximo; textoSumaFavoritos lo cuenta", () => {
  const r = f.sumarFavoritos(["a", "b"], ["b", "c", "d", "c"], 4);
  assert.deepEqual(plano(r), { lista: ["a", "b", "c", "d"], agregados: 2, yaEstaban: 1, sinLugar: 0 });
  const lleno = f.sumarFavoritos(["a", "b", "c"], ["d", "e", "a"], 4);
  assert.deepEqual(plano(lleno), { lista: ["a", "b", "c", "d"], agregados: 1, yaEstaban: 1, sinLugar: 1 });
  assert.equal(f.textoSumaFavoritos(lleno, 2, 4), "1 agregado a favoritos · 1 ya estaba · 2 no se monitorean · 1 quedó afuera (máximo 4)");
  assert.equal(f.textoSumaFavoritos({ agregados: 0, yaEstaban: 0, sinLugar: 0 }, 0, 4), "No se agregó ninguno a favoritos");
  assert.equal(f.MAX_FAVORITOS, 15);
});

test("«Solo íconos» cambia la firma (se repinta) y la etiqueta lleva nombre y estado", () => {
  const items = [{ clave: "nvr:10.0.0.1", nombre: "NVR 1", modelo: "X", estado: "online" }];
  assert.notEqual(f.firmaFavoritos(items, true), f.firmaFavoritos(items, false));
  assert.equal(f.etiquetaFavorito(items[0], { online: "Levantado" }), "NVR 1 · Levantado");
});

test("indiceEnPunto con margen: el hueco entre fichas chicas cuenta para la más cercana", () => {
  const rects = [{ left: 0, right: 20, top: 0, bottom: 20 }, { left: 30, right: 50, top: 0, bottom: 20 }];
  assert.equal(indiceEnPunto(rects, 25, 10), -1);
  assert.equal(indiceEnPunto(rects, 25, 10, 14), 0);
  assert.equal(indiceEnPunto(rects, 200, 10, 14), -1);
});

test("dispositivoPorIp: cámara, grabador y equipo de red en producción; una IP desconocida o vacía no referencia nada", () => {
  assert.equal(f.dispositivoPorIp("192.168.1.102", DATOS).clave, "cam:10.0.0.1:2");
  assert.equal(f.dispositivoPorIp(" 10.0.0.1 ", DATOS).clave, "nvr:10.0.0.1");
  assert.equal(f.dispositivoPorIp("10.9.9.9", DATOS).clave, "eq:10.9.9.9");
  assert.equal(f.dispositivoPorIp("8.8.8.8", DATOS), null);
  assert.equal(f.dispositivoPorIp("", DATOS), null);
  assert.equal(f.dispositivoPorIp("10.0.0.1", null), null);
});

test("dispositivoDeCanal: la cámara de ese canal de ese grabador, o null", () => {
  assert.equal(f.dispositivoDeCanal("10.0.0.1", "2", DATOS).cam.camera_name, "Cam 02");
  assert.equal(f.dispositivoDeCanal("10.0.0.1", "99", DATOS), null);
  assert.equal(f.dispositivoDeCanal("10.0.0.1", "D2", DATOS).cam.camera_name, "Cam 02", "localID del NVR");
  assert.equal(f.dispositivoDeCanal("10.0.0.1", "A2", DATOS), null, "analógico");
  assert.equal(f.dispositivoDeCanal("nvr-central", "1", DATOS), null);
});

test("dispositivoTitulo: dice qué es y cómo se llama", () => {
  assert.equal(f.dispositivoTitulo(f.dispositivoPorIp("192.168.1.101", DATOS)), "Cámara en producción: Cam 01");
  assert.equal(f.dispositivoTitulo(f.dispositivoPorIp("10.9.9.9", DATOS)), "Equipo de red en producción: Decoder");
});
