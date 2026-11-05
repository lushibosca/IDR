// Pruebas unitarias para la búsqueda tokenizada, semántica y multi-campo
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

// Lo que en la página resuelve app.js con la última respuesta de /api/stock (fuera del bloque puro)
const STOCK_FALSO = {
  stockTipoDeCamaraActual: (cam) => (cam && cam.stock && cam.stock.id === "s-domo" ? "Domo PTZ" : ""),
  stockEsCamaraActual: (tipo) => tipo === "camara" || tipo === "domo_ptz",
  stockTipoEtiquetaActual: (tipo) => (tipo === "domo_ptz" ? "Domo PTZ" : ""),
  stockGrupoDeActual: (tipo) => (["nvr", "dvr", "analitica", "decoder"].includes(tipo) ? "servidores" : "otros"),
};
const GLOBALES = { Date, Number, String, Array, Object, Math, Set, Map, RegExp, ...STOCK_FALSO };
const api = cargarBloque("busqueda.js", "BUSQUEDA TOKENIZADA PURO", GLOBALES, [
  "tokenizarBusqueda",
  "matchTexto",
  "matchMAC",
  "obtenerEstadoCamara",
  "obtenerEstadoNVR",
  "coincideTokenSemanticoTipo",
  "coincideTokenSemanticoEstado",
  "normalizarCamposActivos",
  "camaraCumpleToken",
  "camaraCumpleBusqueda",
  "nvrCumpleToken",
  "nvrCumpleBusqueda",
  "cumpleFiltroCamara",
  "cumpleFiltroNVR",
  "CAMPOS_BUSQUEDA",
  "PANELES_BUSQUEDA",
  "validarPanelesBusqueda",
  "RE_TOKEN_CAMARA",
  "RE_TOKEN_NVR",
  "tipoInsigniaTexto",
  "otroDispositivoCumpleToken",
  "otroDispositivoCumpleBusqueda",
  "obtenerOtrosDispositivosProduccion",
  "normalizarTextoBusqueda",
  "coincideTokenUbicacion",
  "esTokenExclusion",
  "limpiarTokenExclusion"
]);

const comun = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado", "uiNumeroCanal"]);
const apiStock = cargarBloque("stock-puro.js", "STOCK PURO", {
  ...GLOBALES,
  ...comun,
  tokenizarBusqueda: api.tokenizarBusqueda,
  coincideTokenSemanticoEstado: api.coincideTokenSemanticoEstado,
  coincideTokenUbicacion: api.coincideTokenUbicacion,
  RE_TOKEN_CAMARA: api.RE_TOKEN_CAMARA,
  RE_TOKEN_NVR: api.RE_TOKEN_NVR,
  normalizarTextoBusqueda: api.normalizarTextoBusqueda          // una sola definición: la de busqueda.js
}, ["stockFiltrar"]);

test("tokenizarBusqueda: separa palabras, respeta comillas y normaliza frases compuestas", () => {
  assert.deepEqual(plano(api.tokenizarBusqueda("camaras offline")), ["camaras", "offline"]);
  assert.deepEqual(plano(api.tokenizarBusqueda('servidores "piso 1"')), ["servidores", "piso 1"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("en línea domo ptz")), ["en linea", "domo ptz"]);   // = «Domo PTZ»
  assert.deepEqual(plano(api.tokenizarBusqueda("mini domo minibullet")), ["mini domo", "mini bullet"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("sin grabación a revisar")), ["sin grabacion", "a revisar"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("servidores fuera de servicio")), ["servidores", "fuera de servicio"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("   ")), []);
  assert.deepEqual(plano(api.tokenizarBusqueda("")), []);
  assert.deepEqual(plano(api.tokenizarBusqueda(null)), []);
});

test("matchMAC: búsqueda exacta y flexible sin delimitadores", () => {
  assert.equal(api.matchMAC("40:b0:34:11:22:33", "40:b0"), true);
  assert.equal(api.matchMAC("40:b0:34:11:22:33", "40b0"), true);
  assert.equal(api.matchMAC("40:B0:34:11:22:33", "22-33"), true);
  assert.equal(api.matchMAC("40:b0:34:11:22:33", "99:99"), false);
});

test("coincideTokenSemanticoTipo: detecta cámaras y servidores con singulares, plurales y tildes", () => {
  for (const t of ["camara", "camaras", "cámara", "cámaras"]) {
    assert.equal(api.coincideTokenSemanticoTipo("camara", t), true, `debe coincidir cámara para ${t}`);
    assert.equal(api.coincideTokenSemanticoTipo("nvr", t), false, `debe rechazar nvr para ${t}`);
  }

  for (const t of ["servidor", "servidores", "nvr", "nvrs", "grabador", "grabadores"]) {
    assert.equal(api.coincideTokenSemanticoTipo("nvr", t), true, `debe coincidir nvr para ${t}`);
    assert.equal(api.coincideTokenSemanticoTipo("camara", t), false, `debe rechazar cámara para ${t}`);
  }

  assert.equal(api.coincideTokenSemanticoTipo("camara", "offline"), null);
  assert.equal(api.coincideTokenSemanticoTipo("nvr", "192.168.1.1"), null);
});

test("coincideTokenSemanticoEstado: detecta estados de monitoreo y stock con sinónimos", () => {
  const camOffline = { is_offline: true, fallback_ping: false };
  const camOnline = { is_offline: false, fallback_ping: false };
  const camDegradada = { is_offline: false, fallback_ping: true };

  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "offline"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "caido"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "caidos"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "desconectada"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "online"), false);

  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "online"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "en linea"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "levantado"), true, "el estado se llama «Levantado»");
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "levantado"), false);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "operativo"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "produccion"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "caido"), false);

  assert.equal(api.coincideTokenSemanticoEstado(camDegradada, "sin grabacion"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camDegradada, "ping"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camDegradada, "degradado"), true);

  // Equipos con condición de stock
  const dispPerdido = { is_offline: true, stock: { condicion: "perdido" } };
  assert.equal(api.coincideTokenSemanticoEstado(dispPerdido, "perdido"), true);
  assert.equal(api.coincideTokenSemanticoEstado(dispPerdido, "perdidos"), true);

  const dispAveriado = { en_uso: false, disponible: false, condicion: "averiado" };
  assert.equal(api.coincideTokenSemanticoEstado(dispAveriado, "fuera de servicio"), true);
  assert.equal(api.coincideTokenSemanticoEstado(dispAveriado, "fuera"), true);
});

test("búsqueda compuesta 'camaras offline': sólo encuentra cámaras caídas", () => {
  const cam1 = { camera_name: "Domo Entrada", ip_address: "10.0.1.10", is_offline: true };
  const cam2 = { camera_name: "Bullet Patio", ip_address: "10.0.1.11", is_offline: false };
  const nvr1 = { nvr_name: "Servidor Principal", ip: "10.0.0.1", is_offline: true };
  const nvr2 = { nvr_name: "Servidor Secundario", ip: "10.0.0.2", is_offline: false };

  const todos = new Set(api.CAMPOS_BUSQUEDA);

  // Cámara offline cumple ambos tokens
  assert.equal(api.cumpleFiltroCamara(cam1, "camaras offline", todos), true);
  // Cámara online falla token 'offline'
  assert.equal(api.cumpleFiltroCamara(cam2, "camaras offline", todos), false);
  // Servidor offline falla token 'camaras'
  assert.equal(api.cumpleFiltroNVR(nvr1, "camaras offline", todos), false);
  // Servidor online falla ambos
  assert.equal(api.cumpleFiltroNVR(nvr2, "camaras offline", todos), false);
});

test("búsqueda compuesta 'servidores caidos' y 'servidores offline': sólo encuentra NVRs caídos", () => {
  const cam1 = { camera_name: "Domo Entrada", ip_address: "10.0.1.10", is_offline: true };
  const nvr1 = { nvr_name: "NVR Central", ip: "10.0.0.1", is_offline: true };
  const nvr2 = { nvr_name: "NVR Backup", ip: "10.0.0.2", is_offline: false };

  const todos = new Set(api.CAMPOS_BUSQUEDA);

  // NVR caído cumple
  assert.equal(api.cumpleFiltroNVR(nvr1, "servidores caidos", todos), true);
  assert.equal(api.cumpleFiltroNVR(nvr1, "servidores offline", todos), true);
  // NVR online falla
  assert.equal(api.cumpleFiltroNVR(nvr2, "servidores caidos", todos), false);
  // Cámara caída falla token 'servidores'
  assert.equal(api.cumpleFiltroCamara(cam1, "servidores caidos", todos), false);
});

test("filtrado multi-campo: respeta campos activos y exclusiones", () => {
  const cam = {
    camera_name: "Recepción",
    ip_address: "192.168.1.100",
    mac_address: "AA:BB:CC:DD:EE:FF",
    modelo: "DS-2CD2143G0-I",
    firmware: "V5.5.82",
    is_offline: false
  };

  // 1. Buscando IP con solo campo 'ip' activo: coincide
  assert.equal(api.cumpleFiltroCamara(cam, "192.168.1", new Set(["ip"])), true);
  // 2. Buscando IP con solo campo 'nombre' activo: no coincide
  assert.equal(api.cumpleFiltroCamara(cam, "192.168.1", new Set(["nombre"])), false);
  // 3. Buscando modelo con campos ['nombre', 'modelo']: coincide
  assert.equal(api.cumpleFiltroCamara(cam, "2143", new Set(["nombre", "modelo"])), true);
  // 4. Buscando modelo con campos ['nombre', 'ip']: no coincide
  assert.equal(api.cumpleFiltroCamara(cam, "2143", new Set(["nombre", "ip"])), false);
  // 5. Sin campos activos (todos deseleccionados): nada coincide
  assert.equal(api.cumpleFiltroCamara(cam, "Recepción", new Set([])), false);
});

test("compatibilidad hacia atrás: acepta string de campo único o 'todos'", () => {
  const cam = { camera_name: "Pasillo", ip_address: "10.0.0.5", is_offline: false };

  assert.equal(api.cumpleFiltroCamara(cam, "Pasillo", "todos"), true);
  assert.equal(api.cumpleFiltroCamara(cam, "Pasillo", "nombre"), true);
  assert.equal(api.cumpleFiltroCamara(cam, "Pasillo", "ip"), false);
  assert.equal(api.cumpleFiltroCamara(cam, "10.0.0.5", "ip"), true);
});

test("búsqueda tokenizada en stock: 'servidores perdidos' y 'servidores produccion'", () => {
  const dispositivos = [
    { id: "s1", tipo: "nvr", marca: "Hikvision", modelo: "DS-7616", condicion: "perdido", en_uso: false, disponible: false },
    { id: "s2", tipo: "nvr", marca: "Hikvision", modelo: "DS-7608", condicion: "operativo", en_uso: true, disponible: false },
    { id: "s3", tipo: "camara", marca: "Hikvision", modelo: "DS-2CD", condicion: "perdido", en_uso: false, disponible: false },
    { id: "s4", tipo: "camara", marca: "Hikvision", modelo: "DS-2CD", condicion: "operativo", en_uso: false, disponible: true }
  ];

  const etiquetasTipo = new Map([["camara", "Cámara"], ["nvr", "NVR"]]);

  // 'servidores perdidos': solo el NVR perdido
  const resPerdidos = apiStock.stockFiltrar(dispositivos, "servidores perdidos", etiquetasTipo);
  assert.equal(resPerdidos.length, 1);
  assert.equal(resPerdidos[0].id, "s1");

  // 'servidores produccion': solo el NVR en uso
  const resProd = apiStock.stockFiltrar(dispositivos, "servidores produccion", etiquetasTipo);
  assert.equal(resProd.length, 1);
  assert.equal(resProd[0].id, "s2");

  // 'camaras disponibles': solo la cámara disponible
  const resDisp = apiStock.stockFiltrar(dispositivos, "camaras disponibles", etiquetasTipo);
  assert.equal(resDisp.length, 1);
  assert.equal(resDisp[0].id, "s4");

  // 'servidores fuera de servicio': solo el NVR perdido (no en uso ni disponible)
  const resFuera = apiStock.stockFiltrar(dispositivos, "servidores fuera de servicio", etiquetasTipo);
  assert.equal(resFuera.length, 1);
  assert.equal(resFuera[0].id, "s1");
});

test("tipoInsigniaTexto: mapea tipos (y los del grupo Cámaras) a insignias compactas", () => {
  assert.equal(api.tipoInsigniaTexto("bullet", true), "BULLET");
  assert.equal(api.tipoInsigniaTexto("domo", true), "DOMO");
  assert.equal(api.tipoInsigniaTexto("domo_ptz", true), "PTZ");
  assert.equal(api.tipoInsigniaTexto("camara_termica", true), "CAMARA");      // uno creado por el usuario
  assert.equal(api.tipoInsigniaTexto("camara"), "CAM");
  assert.equal(api.tipoInsigniaTexto("domo_ptz"), "DOMO");                    // sin saber que es cámara
  assert.equal(api.tipoInsigniaTexto("switch"), "SW");
  assert.equal(api.tipoInsigniaTexto("ups"), "UPS");
  assert.equal(api.tipoInsigniaTexto("monitor"), "MON");
  assert.equal(api.tipoInsigniaTexto("pc"), "PC");
  assert.equal(api.tipoInsigniaTexto("teclado_red"), "TEC");
  assert.equal(api.tipoInsigniaTexto("nvr"), "NVR");
  assert.equal(api.tipoInsigniaTexto("dvr"), "DVR");
  assert.equal(api.tipoInsigniaTexto("otro_tipo"), "OTRO");
  assert.equal(api.tipoInsigniaTexto(null), "DEV");
});

test("obtenerOtrosDispositivosProduccion: filtra dispositivos en producción no monitoreados", () => {
  const stockDispositivos = [
    // 1. Cámara en producción pero YA presente en monitoreo (por MAC)
    { id: "d1", tipo: "camara", mac: "AA:BB:CC:DD:EE:01", en_uso: true, instalacion: { descripcion: "Palacio 1P", ip: "10.0.0.10" } },
    // 2. Switch en producción (NO presente en monitoreo)
    { id: "d2", tipo: "switch", modelo: "CBS250", en_uso: true, instalacion: { descripcion: "Rack Central", ip: "10.0.0.2" } },
    // 3. Dispositivo en stock DISPONIBLE (no instalado / no en producción)
    { id: "d3", tipo: "camara", modelo: "DS-2CD2020", en_uso: false, disponible: true, instalacion: null },
    // 4. Cámara manual en producción (sin NVR y no vista en monitoreo)
    { id: "d4", tipo: "camara", forma: "bullet", mac: "11:22:33:44:55:66", en_uso: true, instalacion: { descripcion: "Entrada Secundaria", ip: "10.0.0.99" } },
    // 5. NVR en producción pero YA presente en monitoreo (por IP)
    { id: "d5", tipo: "nvr", en_uso: true, instalacion: { descripcion: "Sala Servidores", ip: "10.0.0.1" } }
  ];

  const camaras = [
    { camera_name: "Palacio 1P", mac_address: "aa:bb:cc:dd:ee:01", ip_address: "10.0.0.10", nvr_name: "NVR-1", channel_id: "1" }
  ];

  const nvrs = [
    { nvr_name: "NVR-1", ip: "10.0.0.1" }
  ];

  const otros = api.obtenerOtrosDispositivosProduccion(stockDispositivos, camaras, nvrs);
  assert.equal(otros.length, 2);
  const ids = otros.map(d => d.id);
  assert.ok(ids.includes("d2"), "Debe incluir el switch en producción");
  assert.ok(ids.includes("d4"), "Debe incluir la cámara manual en producción");
  assert.ok(!ids.includes("d1"), "No debe incluir la cámara que ya está en monitoreo");
  assert.ok(!ids.includes("d3"), "No debe incluir el dispositivo que no está en producción");
  assert.ok(!ids.includes("d5"), "No debe incluir el NVR que ya está en monitoreo");
});

test("otroDispositivoCumpleBusqueda: búsqueda por nombre, tipo, IP y condición", () => {
  const switchDisp = {
    id: "d2",
    tipo: "switch",
    marca: "Cisco",
    modelo: "CBS250-24T",
    mac: "00:11:22:33:44:55",
    condicion: "operativo",
    en_uso: true,
    instalacion: { descripcion: "Rack Central Piso 1", ip: "10.0.0.2" }
  };

  const averiadoDisp = {
    id: "d4",
    tipo: "ups",
    marca: "APC",
    modelo: "Smart-UPS",
    condicion: "averiado",
    en_uso: true,
    instalacion: { descripcion: "Subsuelo Tablero", ip: "10.0.0.5" }
  };

  const tokensCisco = api.tokenizarBusqueda("cisco");
  assert.equal(api.otroDispositivoCumpleBusqueda(switchDisp, tokensCisco, "todos"), true);
  assert.equal(api.otroDispositivoCumpleBusqueda(averiadoDisp, tokensCisco, "todos"), false);

  const tokensSwitch = api.tokenizarBusqueda("switch");
  assert.equal(api.otroDispositivoCumpleBusqueda(switchDisp, tokensSwitch, "todos"), true);

  const tokensIp = api.tokenizarBusqueda("10.0.0.2");
  assert.equal(api.otroDispositivoCumpleBusqueda(switchDisp, tokensIp, "todos"), true);

  const tokensAveriado = api.tokenizarBusqueda("averiado");
  assert.equal(api.otroDispositivoCumpleBusqueda(averiadoDisp, tokensAveriado, "todos"), true);
  assert.equal(api.otroDispositivoCumpleBusqueda(switchDisp, tokensAveriado, "todos"), false);
});

test("búsqueda insensible a acentos: coincidencias bidireccionales con y sin tilde", () => {
  // matchTexto
  assert.equal(api.matchTexto("Cámara Entrada", "camara"), true);
  assert.equal(api.matchTexto("Camara Entrada", "cámara"), true);
  assert.equal(api.matchTexto("1SS Depósito", "deposito"), true);
  assert.equal(api.matchTexto("1SS Deposito", "depósito"), true);
  assert.equal(api.matchTexto("Recepción Central", "recepcion"), true);
  assert.equal(api.matchTexto("Recepcion Central", "recepción"), true);
  assert.equal(api.matchTexto("Edificio Administración", "administracion"), true);
  assert.equal(api.matchTexto("Edificio Administracion", "administración"), true);

  // cumpleFiltroCamara con nombre acentuado y búsqueda sin tildes
  const cam = { camera_name: "Recepción", ip_address: "10.0.1.10", modelo: "DS-2CD2143G0", is_offline: false };
  assert.equal(api.cumpleFiltroCamara(cam, "recepcion", "nombre"), true);
  assert.equal(api.cumpleFiltroCamara(cam, "recepción", "nombre"), true);
  assert.equal(api.cumpleFiltroCamara(cam, "cámara", "todos"), true);
  assert.equal(api.cumpleFiltroCamara(cam, "camara", "todos"), true);

  // Estados semánticos con tildes
  const camOffline = { is_offline: true, fallback_ping: false };
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "caído"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOffline, "caido"), true);

  const camOnline = { is_offline: false, fallback_ping: false };
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "en línea"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camOnline, "en linea"), true);

  const camDegradada = { is_offline: false, fallback_ping: true };
  assert.equal(api.coincideTokenSemanticoEstado(camDegradada, "sin grabación"), true);
  assert.equal(api.coincideTokenSemanticoEstado(camDegradada, "sin grabacion"), true);

  // Stock con acentos
  const dispStock = [
    { id: "s1", tipo: "camara", marca: "Hikvision", modelo: "DS-2CD", condicion: "operativo", en_uso: true, disponible: false, instalacion: { descripcion: "1SS Depósito", edificio: "Administración" } },
    { id: "s2", tipo: "camara", marca: "Hikvision", modelo: "DS-2CD", condicion: "operativo", en_uso: true, disponible: false, instalacion: { descripcion: "PB Recepcion", edificio: "Anexo Central" } }
  ];
  const tipos = new Map([["camara", "Cámara"]]);

  assert.equal(apiStock.stockFiltrar(dispStock, "deposito", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "deposito", tipos)[0].id, "s1");
  assert.equal(apiStock.stockFiltrar(dispStock, "depósito", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "depósito", tipos)[0].id, "s1");

  assert.equal(apiStock.stockFiltrar(dispStock, "administracion", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "administracion", tipos)[0].id, "s1");
  assert.equal(apiStock.stockFiltrar(dispStock, "administración", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "administración", tipos)[0].id, "s1");

  assert.equal(apiStock.stockFiltrar(dispStock, "recepcion", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "recepcion", tipos)[0].id, "s2");
  assert.equal(apiStock.stockFiltrar(dispStock, "recepción", tipos).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "recepción", tipos)[0].id, "s2");
});

test("campo tipo: incluido en CAMPOS_BUSQUEDA y condiciona filtros semánticos y de stock", () => {
  assert.ok(api.CAMPOS_BUSQUEDA.includes("tipo"), "CAMPOS_BUSQUEDA debe incluir 'tipo'");

  const cam = { camera_name: "Camara Entrada", ip_address: "10.0.1.10", stock: { id: "s-domo" } };
  const nvr = { nvr_name: "NVR Servidor", ip: "10.0.0.1" };
  const switchDisp = { id: "sw1", tipo: "switch", modelo: "TL-SG108", instalacion: { descripcion: "Switch Rack", ip: "10.0.2.1" } };

  // Cuando 'tipo' está activo, 'camara' coincide con la cámara y no con el NVR
  assert.equal(api.camaraCumpleToken(cam, "camara", ["tipo"]), true);
  assert.equal(api.nvrCumpleToken(nvr, "camara", ["tipo"]), false);
  assert.equal(api.camaraCumpleToken(cam, "domo", ["tipo"]), true);          // el tipo de su alta en el stock
  assert.equal(api.camaraCumpleToken(cam, "domo ptz", ["tipo"]), true);
  assert.equal(api.camaraCumpleToken({ ...cam, stock: null }, "domo", ["tipo"]), false);

  // Cuando 'tipo' NO está activo (solo 'ip'), 'camara' no debe coincidir semánticamente
  assert.equal(api.camaraCumpleToken(cam, "camara", ["ip"]), false);
  assert.equal(api.camaraCumpleToken(cam, "domo", ["ip"]), false);

  // 'otroDispositivoCumpleToken'
  assert.equal(api.otroDispositivoCumpleToken(switchDisp, "switch", ["tipo"]), true);
  assert.equal(api.otroDispositivoCumpleToken(switchDisp, "switch", ["ip"]), false);
  assert.equal(api.otroDispositivoCumpleToken(switchDisp, "10.0.2.1", ["ip"]), true);
  // un domo PTZ del stock (no visto por el escaneo) es una cámara y se busca por su etiqueta
  const ptz = { id: "p1", tipo: "domo_ptz", instalacion: { descripcion: "Acceso", ip: "10.0.3.1" } };
  assert.equal(api.otroDispositivoCumpleToken(ptz, "camaras", ["tipo"]), true);
  assert.equal(api.otroDispositivoCumpleToken(ptz, "nvr", ["tipo"]), false);
  assert.equal(api.otroDispositivoCumpleToken(ptz, "domo ptz", ["tipo"]), true);
  // «servidores» es el GRUPO (analítica y decoder también); «nvr» sigue siendo solo grabadores
  const analitica = { id: "an1", tipo: "analitica", instalacion: { ip: "10.0.4.1" } };
  assert.equal(api.otroDispositivoCumpleToken(analitica, "servidores", ["tipo"]), true);
  assert.equal(api.otroDispositivoCumpleToken(analitica, "Servidor", ["tipo"]), true);
  assert.equal(api.otroDispositivoCumpleToken(analitica, "nvr", ["tipo"]), false);
  assert.equal(api.otroDispositivoCumpleToken(switchDisp, "servidores", ["tipo"]), false);

  // stockFiltrar respetando camposActivos
  const dispStock = [
    { id: "d1", tipo: "bullet", modelo: "DS-2CD2012-I", instalacion: { ip: "192.168.1.50", descripcion: "Bullet Calle" } },
    { id: "d2", tipo: "switch", modelo: "CBS250", instalacion: { ip: "192.168.1.10", descripcion: "Switch Principal" } }
  ];
  const tipos = new Map([["bullet", "Bullet"], ["switch", "Switch"]]);

  // Búsqueda por tipo con campo 'tipo' activo
  assert.equal(apiStock.stockFiltrar(dispStock, "bullet", tipos, ["tipo"]).length, 1);
  assert.equal(apiStock.stockFiltrar(dispStock, "bullet", tipos, ["tipo"])[0].id, "d1");

  // Búsqueda por tipo con campo 'tipo' inactivo (solo 'ip')
  assert.equal(apiStock.stockFiltrar(dispStock, "bullet", tipos, ["ip"]).length, 0);

  // Búsqueda por IP con campo 'ip' activo
  assert.equal(apiStock.stockFiltrar(dispStock, "192.168.1.50", tipos, ["ip"]).length, 1);

  // Búsqueda por IP con campo 'ip' inactivo (solo 'nombre')
  assert.equal(apiStock.stockFiltrar(dispStock, "192.168.1.50", tipos, ["nombre"]).length, 0);
});


test("equipo de red (alerta con forma de grabador): se busca por su tipo real, no como NVR", () => {
  const decoder = { nvr_name: "Videowall sala", ip: "10.0.5.10", modelo: "DS-6904UDI", tipo: "decoder", is_offline: true };
  assert.equal(api.cumpleFiltroNVR(decoder, "decoder", "todos"), true);
  assert.equal(api.cumpleFiltroNVR(decoder, "decoder", "tipo"), true);
  assert.equal(api.cumpleFiltroNVR(decoder, "nvr", "tipo"), false);                 // no es un grabador
  assert.equal(api.cumpleFiltroNVR({ nvr_name: "Central", ip: "10.0.0.1" }, "nvr", "tipo"), true);   // un NVR, igual que antes
});

test("PANELES_BUSQUEDA y validarPanelesBusqueda: lista cerrada de 4 paneles con persistencia", () => {
  assert.deepEqual(plano(api.PANELES_BUSQUEDA), ["dashboard", "stock", "produccion", "auditoria"]);
  assert.deepEqual(plano(api.validarPanelesBusqueda(["stock", "produccion"])), ["stock", "produccion"]);
  assert.deepEqual(plano(api.validarPanelesBusqueda(["stock", "invalido", 123])), ["stock"]);
  assert.deepEqual(plano(api.validarPanelesBusqueda(null)), ["dashboard", "stock", "produccion", "auditoria"]);
  assert.deepEqual(plano(api.validarPanelesBusqueda("basura")), ["dashboard", "stock", "produccion", "auditoria"]);
  assert.deepEqual(plano(api.validarPanelesBusqueda([])), []);
});


test("tokenizarBusqueda: normaliza edificios y pisos compuestos", () => {
  assert.deepEqual(plano(api.tokenizarBusqueda("anexo a piso 3")), ["anexo a", "piso 3"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("anexo b piso 1")), ["anexo b", "piso 1"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("piso 3")), ["piso 3"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("anexo a p3")), ["anexo a", "piso 3"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("callao 58 piso pb")), ["callao 58", "piso pb"]);
});

test("búsqueda compuesta por edificio y piso: 'anexo a piso 3' solo devuelve la ubicación exacta", () => {
  const lista = [
    {
      id: "anx_a_p3_1",
      tipo: "domo",
      modelo: "DS-2CD2123G0-I",
      instalacion: { edificio: "Anexo A", piso: "3", descripcion: "P3 ACCESO GENERAL" }
    },
    {
      id: "anx_a_p3_2",
      tipo: "turret",
      modelo: "DS-2CD1323G0E-I",
      instalacion: { edificio: "Anexo A", piso: "3", descripcion: "ACCESO ESCALERA" }
    },
    {
      id: "anx_a_p1",
      tipo: "turret",
      modelo: "DS-2CD1323G0E-I",
      instalacion: { edificio: "Anexo A", piso: "1", descripcion: "HALL PISO 1" }
    },
    {
      id: "anx_a_3ss",
      tipo: "bullet",
      modelo: "DS-2CD2625FWD-IZS",
      instalacion: { edificio: "Anexo A", piso: "3SS", descripcion: "3SS PASILLO" }
    },
    {
      id: "anx_b_p1",
      tipo: "turret",
      modelo: "DS-2CD1323G0E-I",
      instalacion: { edificio: "Anexo B", piso: "1", descripcion: "ANX B PISO 5" }
    },
    {
      id: "anx_c_pb",
      tipo: "turret",
      modelo: "DS-2CD1323G0E-I",
      instalacion: { edificio: "Anexo C", piso: "PB", descripcion: "DTV PISO 1" }
    }
  ];

  const tipos = new Map([["domo", "Domo"], ["turret", "Turret"], ["bullet", "Bullet"]]);

  // "anexo a piso 3": solo los 2 de Anexo A Piso 3
  const res = apiStock.stockFiltrar(lista, "anexo a piso 3", tipos);
  assert.deepEqual(res.map(d => d.id), ["anx_a_p3_1", "anx_a_p3_2"]);

  // "piso 3": no debe incluir piso 3SS
  const resP3 = apiStock.stockFiltrar(lista, "piso 3", tipos);
  assert.deepEqual(resP3.map(d => d.id), ["anx_a_p3_1", "anx_a_p3_2"]);

  // "anexo b piso 1": solo el de Anexo B Piso 1
  const resB = apiStock.stockFiltrar(lista, "anexo b piso 1", tipos);
  assert.deepEqual(resB.map(d => d.id), ["anx_b_p1"]);
});

test("tokenizarBusqueda: soporte de comodín de exclusión ! y - (pegado, con espacio y frases)", () => {
  // Comodín ! pegado
  assert.deepEqual(plano(api.tokenizarBusqueda("domo !ptz")), ["domo", "!ptz"]);
  // Comodín ! con espacio ("descarte la siguiente palabra despues del comodin")
  assert.deepEqual(plano(api.tokenizarBusqueda("domo ! ptz")), ["domo", "!ptz"]);
  // Alias estándar - (pegado y con espacio)
  assert.deepEqual(plano(api.tokenizarBusqueda("domo -ptz")), ["domo", "!ptz"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("domo - ptz")), ["domo", "!ptz"]);
  // Solo exclusión
  assert.deepEqual(plano(api.tokenizarBusqueda("!ptz")), ["!ptz"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("! ptz")), ["!ptz"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("-ptz")), ["!ptz"]);
  // Frases compuestas entre comillas con ! o -
  assert.deepEqual(plano(api.tokenizarBusqueda('domo !"domo ptz"')), ["domo", "!domo ptz"]);
  assert.deepEqual(plano(api.tokenizarBusqueda('domo ! "domo ptz"')), ["domo", "!domo ptz"]);
  assert.deepEqual(plano(api.tokenizarBusqueda('domo -"mini domo"')), ["domo", "!mini domo"]);
  // Comodines sueltos sin palabra posterior se descartan
  assert.deepEqual(plano(api.tokenizarBusqueda("domo !")), ["domo"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("domo -")), ["domo"]);
  assert.deepEqual(plano(api.tokenizarBusqueda("!")), []);
  assert.deepEqual(plano(api.tokenizarBusqueda("-")), []);
});

test("cumpleFiltroCamara: 'domo !ptz' descarta 'domo ptz' y conserva sólo domos fijos", () => {
  const domoFijo = {
    camera_name: "Domo Entrada",
    modelo: "DS-2CD2143G0-I",
    ip_address: "10.0.1.20",
    is_offline: false,
    stock: { id: "s-domo-fijo" }
  };
  const domoPtz = {
    camera_name: "Domo PTZ Estacionamiento",
    modelo: "DS-2DE4225IW-DE",
    ip_address: "10.0.1.21",
    is_offline: false,
    stock: { id: "s-domo" } // STOCK_FALSO devuelve "Domo PTZ" para s-domo
  };
  const bullet = {
    camera_name: "Bullet Patio",
    modelo: "DS-2CD2043G0-I",
    ip_address: "10.0.1.22",
    is_offline: false,
    stock: null
  };

  const todos = new Set(api.CAMPOS_BUSQUEDA);

  // 'domo !ptz': domo fijo pasa; domo ptz es descartado; bullet es descartado
  assert.equal(api.cumpleFiltroCamara(domoFijo, "domo !ptz", todos), true);
  assert.equal(api.cumpleFiltroCamara(domoPtz, "domo !ptz", todos), false);
  assert.equal(api.cumpleFiltroCamara(bullet, "domo !ptz", todos), false);

  // También funciona con espacio: 'domo ! ptz'
  assert.equal(api.cumpleFiltroCamara(domoFijo, "domo ! ptz", todos), true);
  assert.equal(api.cumpleFiltroCamara(domoPtz, "domo ! ptz", todos), false);

  // También funciona con guion: 'domo -ptz'
  assert.equal(api.cumpleFiltroCamara(domoFijo, "domo -ptz", todos), true);
  assert.equal(api.cumpleFiltroCamara(domoPtz, "domo -ptz", todos), false);

  // Búsqueda solo con exclusión: '!ptz' incluye el domo fijo y el bullet, pero descarta el domo PTZ
  assert.equal(api.cumpleFiltroCamara(domoFijo, "!ptz", todos), true);
  assert.equal(api.cumpleFiltroCamara(bullet, "!ptz", todos), true);
  assert.equal(api.cumpleFiltroCamara(domoPtz, "!ptz", todos), false);
});

test("cumpleFiltroNVR y filtros semánticos con exclusión !", () => {
  const nvrOnline = { nvr_name: "NVR Central", ip: "10.0.0.1", is_offline: false };
  const nvrCaido = { nvr_name: "NVR Sucursal", ip: "10.0.0.2", is_offline: true };
  const cam = { camera_name: "Camara Pasillo", ip_address: "10.0.1.1", is_offline: false };
  const todos = new Set(api.CAMPOS_BUSQUEDA);

  // 'servidores !caidos': descarta el NVR caído
  assert.equal(api.cumpleFiltroNVR(nvrOnline, "servidores !caidos", todos), true);
  assert.equal(api.cumpleFiltroNVR(nvrCaido, "servidores !caidos", todos), false);

  // Exclusión por IP: 'servidores !10.0.0.2'
  assert.equal(api.cumpleFiltroNVR(nvrOnline, "servidores !10.0.0.2", todos), true);
  assert.equal(api.cumpleFiltroNVR(nvrCaido, "servidores !10.0.0.2", todos), false);

  // Exclusión de tipo semántico: '!camaras' incluye NVR y descarta cámara
  assert.equal(api.cumpleFiltroNVR(nvrOnline, "!camaras", todos), true);
  assert.equal(api.cumpleFiltroCamara(cam, "!camaras", todos), false);
});

test("stockFiltrar: comodín ! y - descartan tipos y modelos específicos en stock", () => {
  const dispositivos = [
    { id: "s1", tipo: "domo", marca: "Hikvision", modelo: "DS-2CD2123G0-I",
      condicion: "operativo", en_uso: true, disponible: false },
    { id: "s2", tipo: "domo_ptz", marca: "Hikvision", modelo: "DS-2DE4225IW-DE",
      condicion: "operativo", en_uso: true, disponible: false },
    { id: "s3", tipo: "bullet", marca: "Hikvision", modelo: "DS-2CD2023G0-I",
      condicion: "operativo", en_uso: true, disponible: false }
  ];

  const etiquetasTipo = new Map([
    ["domo", "Domo"],
    ["domo_ptz", "Domo PTZ"],
    ["bullet", "Bullet"]
  ]);

  // 'domo !ptz': solo debe quedar el domo fijo 's1'
  const resDomoSolo = apiStock.stockFiltrar(dispositivos, "domo !ptz", etiquetasTipo);
  assert.equal(resDomoSolo.length, 1);
  assert.equal(resDomoSolo[0].id, "s1");

  // 'domo ! ptz' con espacio: mismo resultado
  const resDomoEspacio = apiStock.stockFiltrar(dispositivos, "domo ! ptz", etiquetasTipo);
  assert.equal(resDomoEspacio.length, 1);
  assert.equal(resDomoEspacio[0].id, "s1");

  // 'domo -ptz' con guión: mismo resultado
  const resDomoGuion = apiStock.stockFiltrar(dispositivos, "domo -ptz", etiquetasTipo);
  assert.equal(resDomoGuion.length, 1);
  assert.equal(resDomoGuion[0].id, "s1");

  // '!ptz': debe devolver 's1' y 's3', descartando 's2'
  const resSinPtz = apiStock.stockFiltrar(dispositivos, "!ptz", etiquetasTipo);
  assert.equal(resSinPtz.length, 2);
  assert.deepEqual(resSinPtz.map(d => d.id).sort(), ["s1", "s3"]);
});


test("esTokenExclusion: ! y - marcan exclusión; solos o a mitad de palabra no", () => {
  assert.equal(api.esTokenExclusion("!bullet"), true);
  assert.equal(api.esTokenExclusion("-bullet"), true);
  assert.equal(api.esTokenExclusion("!"), false);
  assert.equal(api.esTokenExclusion("-"), false);
  assert.equal(api.esTokenExclusion("bu-llet"), false);
  assert.equal(api.limpiarTokenExclusion("-bullet"), "bullet");
  assert.equal(api.limpiarTokenExclusion("!bullet"), "bullet");
});
