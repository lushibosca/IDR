// Modelo de la vista de Producción (bloque PRODUCCION MODELO PURO de static/produccion.js): qué grupos, insignias e ítems
// se muestran, sin DOM. El DOM lo arma construirProduccion() con textContent (lo cubre el E2E).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const comun = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado", "uiNumeroCanal"]);
const vistas = cargarBloque("produccion.js", "PRODUCCION VISTAS PURO", { Array },
  ["PRODUCCION_VISTAS", "produccionVistaValida", "produccionVistaSiguiente"]);
const api = cargarBloque("produccion.js", "PRODUCCION MODELO PURO", { Map, Set, String, Boolean, JSON, ...comun, ...vistas }, [
  "modeloProduccion", "compararCanales", "PRODUCCION_ID_OTROS", "produccionLugar", "produccionRackPuerto"
]);

const limpiarNombre = (n) => (n || "").replace(/\s*\(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\)\s*$/, "").trim();
const completar = (lista, cap, nombre, ip) => {
  const usados = new Set(lista.map((c) => Number(c.channel_id)));
  const libres = [];
  for (let ch = 1; ch <= cap; ch++) if (!usados.has(ch)) libres.push({ channel_id: ch, detalle: "disponible", nvr_name: nombre, nvr_ip: ip });
  return [...lista, ...libres];
};
const entorno = (extra = {}) => ({
  nvrs: [], buscando: false, abiertos: new Set(), vista: "tarjetas", otros: [], limpiarNombre,
  capacidad: () => null, completar, ubicacion: () => "", ubicacionInstalacion: () => "", imagen: () => null,
  nombre: (d, defecto) => (d.instalacion && d.instalacion.descripcion) || [d.marca, d.modelo].filter(Boolean).join(" ") || defecto,
  icono: (tipo) => `icono-${tipo}`, ...extra
});
const cam = (ch, extra = {}) => ({
  nvr_name: "NVR A", nvr_ip: "10.0.0.1", channel_id: ch, camera_name: `Cam ${ch}`, ip_address: `10.0.1.${ch}`,
  mac_address: "AA", modelo: "DS-2CD", firmware: "V5", is_offline: false, fallback_ping: false, detalle: "", stock: null, ...extra
});

test("agrupa por NVR (nombre sin la IP pegada), ordena grupos y canales, y cuenta caídas", () => {
  const m = plano(api.modeloProduccion([
    cam(10), cam(2, { is_offline: true }), cam(1, { nvr_name: "NVR B (10.0.0.2)", nvr_ip: "10.0.0.2" })
  ], entorno()));
  assert.deepEqual(m.grupos.map((g) => g.titulo), ["NVR A", "NVR B"]);
  const a = m.grupos[0];
  assert.equal(a.id, "collapse-nvr-NVR_A");
  assert.deepEqual(a.items.map((i) => i.canal), ["CH 2", "CH 10"]);       // numérico, no alfabético
  assert.deepEqual(a.insignias, [{ texto: "2 Cámaras", clase: "bg-secondary" }, { texto: "1 Caídas", clase: "bg-danger" }]);
  assert.deepEqual(a.datos, { nvrName: "NVR A", nvrIp: "10.0.0.1" });
  assert.equal(a.items[0].offline, true);
});

test("un nombre de NVR '__proto__' no rompe el agrupado (Map, no {})", () => {
  const m = api.modeloProduccion([cam(1, { nvr_name: "__proto__" })], entorno());
  assert.equal(m.grupos.length, 1);
  assert.equal(m.grupos[0].titulo, "__proto__");
});

test("con capacidad conocida y sin búsqueda agrega los canales libres; buscando, no", () => {
  const e = entorno({ nvrs: [{ nvr_name: "NVR A", ip: "10.0.0.1", modelo: "X", is_offline: false }], capacidad: () => 4 });
  const sin = plano(api.modeloProduccion([cam(2)], e)).grupos[0].items;
  assert.deepEqual(sin.map((i) => [i.canal, i.tipo]), [["CH 1", "libre"], ["CH 2", "camara"], ["CH 3", "libre"], ["CH 4", "libre"]]);
  const buscando = plano(api.modeloProduccion([cam(2)], { ...e, buscando: true })).grupos[0];
  assert.equal(buscando.items.length, 1);
  assert.equal(buscando.abierto, true);                                   // buscando: todos los grupos abiertos
});

test("grabador caído: insignia propia (por nombre o por IP)", () => {
  const e = entorno({ nvrs: [{ nvr_name: "Otro nombre", ip: "10.0.0.1", is_offline: true }] });
  const g = plano(api.modeloProduccion([cam(1)], e)).grupos[0];
  assert.ok(g.insignias.some((i) => i.texto === "Grabador offline"));
});

test("abierto: solo el grupo guardado; estado de cada cámara (offline gana a sin grabación)", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { fallback_ping: true }), cam(2, { is_offline: true, fallback_ping: true }), cam(3, { nvr_name: "NVR Z" })
  ], entorno({ abiertos: new Set(["collapse-nvr-NVR_Z"]) })));
  assert.deepEqual(m.grupos.map((g) => g.abierto), [false, true]);
  const [c1, c2] = m.grupos[0].items;
  assert.equal(c1.sinGrabacion, true);
  assert.equal(c2.sinGrabacion, false);
  assert.equal(c2.offline, true);
});

test("cámara sin nombre ni IP: nombre vacío (el DOM muestra '-') e IP '-'; vínculo con el stock", () => {
  const it = plano(api.modeloProduccion([cam(1, { camera_name: "", ip_address: "", stock: { id: "s1" } })],
    entorno({ ubicacion: () => "Anexo A" }))).grupos[0].items[0];
  assert.equal(it.nombre, "");
  assert.equal(it.ip, "-");
  assert.equal(it.stockId, "s1");
  assert.equal(it.ubicacion, "Anexo A");
});

test("otros dispositivos: grupo al final, orden por nombre visible, ícono del entorno y averiados", () => {
  const otros = [
    { id: "b", tipo: "switch", modelo: "SW", condicion: "averiado", instalacion: { descripcion: "Zeta", ip: "10.9.0.1" } },
    { id: "a", tipo: "ups", marca: "APC", modelo: "1500", condicion: "revisar" }
  ];
  const m = plano(api.modeloProduccion([cam(1)], entorno({ otros, imagen: (mod) => (mod === "SW" ? "/img/sw.png" : null) })));
  const g = m.grupos.at(-1);
  assert.equal(g.id, api.PRODUCCION_ID_OTROS);
  assert.deepEqual(g.items.map((i) => i.nombre), ["APC 1500", "Zeta"]);
  assert.deepEqual(g.items.map((i) => i.icono), ["icono-ups", "icono-switch"]);
  assert.deepEqual(g.insignias, [{ texto: "2 Dispositivos", clase: "bg-secondary" }, { texto: "1 Averiados", clase: "bg-danger" }]);
  assert.equal(g.items[1].imagen, "/img/sw.png");
  assert.equal(g.items[0].revisar, true);
  assert.deepEqual(g.datos, { nvrName: "Otros dispositivos" });           // sin data-nvr-ip
});

test("sin cámaras ni otros: sin grupos (el DOM muestra 'No se encontraron cámaras'); la vista se normaliza", () => {
  assert.deepEqual(plano(api.modeloProduccion([], entorno({ vista: "otra" }))), { vista: "tarjetas", grupos: [] });
  for (const vista of ["lista", "tarjetas"]) assert.equal(api.modeloProduccion([], entorno({ vista })).vista, vista);
  assert.equal(api.modeloProduccion([], entorno({ vista: "snapshot" })).vista, "tarjetas");      // sin capturas en SGC-2
});

test("un grabador instalado sin cámaras tiene su grupo con los canales libres; buscando, no aparece", () => {
  const e = entorno({ nvrs: [{ nvr_name: "NVR Vacío", ip: "10.0.0.9", modelo: "X", is_offline: false }], capacidad: () => 3 });
  const m = plano(api.modeloProduccion([], e));
  assert.deepEqual(m.grupos.map((g) => g.titulo), ["NVR Vacío"]);
  assert.deepEqual(m.grupos[0].items.map((i) => [i.canal, i.tipo]), [["CH 1", "libre"], ["CH 2", "libre"], ["CH 3", "libre"]]);
  assert.equal(plano(api.modeloProduccion([], { ...e, buscando: true })).grupos.length, 0);
});

test("la firma (JSON del modelo) no cambia si los datos no cambian, y cambia con la vista", () => {
  const datos = [cam(1), cam(2)];
  const f = (e) => JSON.stringify(api.modeloProduccion(datos, entorno(e)));
  assert.equal(f({}), f({}));
  assert.notEqual(f({}), f({ vista: "lista" }));
});

test("compararCanales: numérico, y lo que no es número al final", () => {
  const orden = [{ channel_id: "10" }, { channel_id: "x" }, { channel_id: 2 }].sort(api.compararCanales).map((c) => String(c.channel_id));
  assert.deepEqual(orden, ["2", "10", "x"]);
});

test("lugar (vista de lista): solo edificio y piso de la instalación", () => {
  assert.equal(api.produccionLugar({ edificio: "Anexo A", piso: "PB", rack: "R1", puerto: "3" }), "Anexo A · piso PB");
  assert.equal(api.produccionLugar({ edificio: "Anexo A" }), "Anexo A");
  assert.equal(api.produccionLugar({ piso: "2" }), "piso 2");
  assert.equal(api.produccionLugar(null), "");
  const cam = {
    nvr_name: "N1", nvr_ip: "10.0.0.1", channel_id: 1, camera_name: "C",
    stock: { id: "s1", edificio: "Anexo A", piso: "PB" }
  };
  const it = plano(api.modeloProduccion([cam], entorno())).grupos[0].items[0];
  assert.equal(it.lugar, "Anexo A · piso PB");
});

test("rack / puerto (vista de lista): rack y puerto de la instalación", () => {
  assert.equal(api.produccionRackPuerto({ rack: "R1", puerto: "3" }), "R1 - 3");
  assert.equal(api.produccionRackPuerto({ rack: "10", puerto: "3" }), "0010 - 3");
  assert.equal(api.produccionRackPuerto({ rack: 10, puerto: "3" }), "0010 - 3");
  assert.equal(api.produccionRackPuerto({ rack: "10" }), "0010");
  assert.equal(api.produccionRackPuerto({ rack: "R1" }), "R1");
  assert.equal(api.produccionRackPuerto({ puerto: "3" }), "Pto. 3");
  assert.equal(api.produccionRackPuerto(null), "");
  assert.equal(api.produccionRackPuerto({}), "");
  const cam = {
    nvr_name: "N1", nvr_ip: "10.0.0.1", channel_id: 1, camera_name: "C",
    stock: { id: "s1", edificio: "Anexo A", piso: "PB", rack: "10", puerto: "14" }
  };
  const it = plano(api.modeloProduccion([cam], entorno())).grupos[0].items[0];
  assert.equal(it.rackPuerto, "0010 - 14");
});

test("otros dispositivos: los equipos de red muestran su estado en vivo (unidos por el id del activo)", () => {
  const otros = [
    { id: "d1", tipo: "decoder", modelo: "DS-6910", condicion: "operativo", instalacion: { descripcion: "Videowall", ip: "10.0.5.10" } },
    { id: "f1", tipo: "analitica", modelo: "Fusion", condicion: "operativo", instalacion: { descripcion: "Fusion", ip: "10.0.5.20" } },
    { id: "u1", tipo: "ups", modelo: "1500", condicion: "operativo" }
  ];
  const equiposRed = [
    { ip: "10.0.5.10", estado: "offline", motivo: "sin respuesta a ping", stock: { id: "d1" } },
    { ip: "10.0.5.20", estado: "desconocido", motivo: "sonda no disponible", stock: { id: "f1" } },
    { ip: "10.0.5.30", estado: "online", stock: null }
  ];
  const g = plano(api.modeloProduccion([cam(1)], entorno({ otros, equiposRed }))).grupos.at(-1);
  assert.deepEqual(g.items.map((i) => [i.nombre, i.red, i.redMotivo]), [               // ordenados por nombre
    ["1500", null, ""], ["Fusion", "desconocido", "sonda no disponible"], ["Videowall", "offline", "sin respuesta a ping"]]);
  assert.deepEqual(g.insignias, [{ texto: "3 Dispositivos", clase: "bg-secondary" }, { texto: "1 Offline", clase: "bg-danger" }]);
});

test("canales sin relevar: el caído cuenta en «Caídas» y los dos llevan «Sin relevar»", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { is_offline: false, sin_relevar: false }),
    cam(86, { is_offline: true, sin_relevar: true, camera_name: "Canal 86" }),
    cam(96, { is_offline: false, sin_relevar: true, camera_name: "Canal 96" })
  ], entorno()));
  const g = m.grupos[0];
  assert.deepEqual(g.insignias, [
    { texto: "3 Cámaras", clase: "bg-secondary" },
    { texto: "1 Caídas", clase: "bg-danger" },
    { texto: "2 Sin relevar", clase: "bg-info-subtle text-info border border-info-subtle" }
  ]);
  const [c1, c86, c96] = g.items;
  assert.equal(c86.offline, true);
  assert.equal(c86.sinRelevar, true);
  assert.equal(c96.offline, false);
  assert.equal(c96.sinRelevar, true);
});
test("cámara en varios grabadores: multiGrabador true si la misma IP aparece en más de un NVR", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { ip_address: "10.3.30.0", nvr_name: "NVR A", nvr_ip: "10.0.0.1" }),
    cam(1, { ip_address: "10.3.30.0", nvr_name: "NVR B", nvr_ip: "10.0.0.2" }),
    cam(2, { ip_address: "10.3.30.5", nvr_name: "NVR A", nvr_ip: "10.0.0.1" })
  ], entorno()));
  const nvrA = m.grupos.find((g) => g.titulo === "NVR A");
  const nvrB = m.grupos.find((g) => g.titulo === "NVR B");
  assert.equal(nvrA.items[0].multiGrabador, true);
  assert.equal(nvrB.items[0].multiGrabador, true);
  assert.equal(nvrA.items[1].multiGrabador, false);
});

test("cámara en varios grabadores: detecta duplicación por MAC si no tiene IP", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { ip_address: "", mac_address: "AA:BB:CC:11:22:33", nvr_name: "NVR A", nvr_ip: "10.0.0.1" }),
    cam(2, { ip_address: "", mac_address: "AA:BB:CC:11:22:33", nvr_name: "NVR B", nvr_ip: "10.0.0.2" })
  ], entorno()));
  assert.equal(m.grupos[0].items[0].multiGrabador, true);
  assert.equal(m.grupos[1].items[0].multiGrabador, true);
});

test("cámara en el mismo grabador no cuenta como multiGrabador", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { ip_address: "10.3.30.0", nvr_name: "NVR A", nvr_ip: "10.0.0.1" }),
    cam(2, { ip_address: "10.3.30.0", nvr_name: "NVR A", nvr_ip: "10.0.0.1" })
  ], entorno()));
  assert.equal(m.grupos[0].items[0].multiGrabador, false);
  assert.equal(m.grupos[0].items[1].multiGrabador, false);
});

test("canal sin señal: gris, no cuenta en «Caídas» y lleva su propia insignia", () => {
  const m = plano(api.modeloProduccion([
    cam(1, { is_offline: true }),
    cam(2, { is_offline: true, sin_senal: true, camera_name: "Retirada" }),
    cam(3, { is_offline: false, sin_senal: false })
  ], entorno()));
  const g = m.grupos[0];
  assert.deepEqual(g.insignias, [
    { texto: "3 Cámaras", clase: "bg-secondary" },
    { texto: "1 Caídas", clase: "bg-danger" },
    { texto: "1 Sin señal", clase: "bg-secondary-subtle text-secondary border border-secondary-subtle" }
  ]);
  const [c1, c2, c3] = g.items;
  assert.deepEqual([c1.offline, c1.sinSenal], [true, false]);
  assert.deepEqual([c2.offline, c2.sinSenal], [false, true]);
  assert.deepEqual([c3.offline, c3.sinSenal], [false, false]);
});

test("cada grabador lleva su IP como detalle del encabezado (junto a la flecha), sin repetirla si ya es el título", () => {
  const m = plano(api.modeloProduccion([
    cam(1), cam(1, { nvr_name: "10.0.0.3", nvr_ip: "10.0.0.3" }), cam(1, { nvr_name: "", nvr_ip: "10.0.0.4" })
  ], entorno({ otros: [{ id: "x", tipo: "decoder", instalacion: { ip: "10.9.9.9" } }] })));
  const porTitulo = new Map(m.grupos.map((g) => [g.titulo, g]));
  assert.equal(porTitulo.get("NVR A").detalle, "10.0.0.1");
  assert.equal(porTitulo.get("10.0.0.3").detalle, "");                 // el grabador informa su IP como nombre
  assert.equal(porTitulo.get("Desconocido").detalle, "10.0.0.4");      // sin nombre: la IP es lo que lo identifica
  assert.ok(m.grupos.filter((g) => g.id === api.PRODUCCION_ID_OTROS).every((g) => !g.detalle));   // «Otros»: sin IP
});

test("vistas de Producción: lista y tarjetas (sin «snapshot»: no hay capturas); la siguiente da la vuelta", () => {
  assert.deepEqual(plano(vistas.PRODUCCION_VISTAS), ["lista", "tarjetas"]);
  for (const v of ["lista", "tarjetas"]) assert.equal(vistas.produccionVistaValida(v), true);
  for (const v of ["", "Lista", "mosaico", "snapshot", null, undefined, 3, ["lista"]]) assert.equal(vistas.produccionVistaValida(v), false);
  assert.equal(vistas.produccionVistaSiguiente("lista"), "tarjetas");
  assert.equal(vistas.produccionVistaSiguiente("tarjetas"), "lista");
  assert.equal(vistas.produccionVistaSiguiente("rara"), "lista");              // una vista que no existe arranca por la primera
});
