// Pruebas del dashboard: resumen del stock y reubicación de secciones (bloques puros de resumen.js)
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const { uiValorInformado } = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado"]);
const GLOBALES = { String, Number, Array, Map, Set, Math, Object, ALERTAS_LIMITE_VISIBLES: 4, uiValorInformado };
const stock = cargarBloque("resumen.js", "RESUMEN STOCK PURO", GLOBALES, [
  "resumirStock", "busquedaDeModelo", "gruposPropiosCatalogo", "metricasDesgloseStock", "EJES_ACTIVOS", "formatoCapacidad",
  "modoCapacidadValido",
]);
const reorden = cargarBloque("resumen.js", "REORDEN SECCIONES PURO", GLOBALES, ["ordenarIdsSecciones", "evaluarIntercambioSecciones", "IDS_SECCIONES_REUBICABLES", "DISPOSICION_POR_DEFECTO", "distribuirSecciones", "zonaEnPunto", "indiceInsercion", "destinoTeclado"]);


test("stock: un chip por grupo (Servidores, Cámaras, Otros) como en Activos, con contadores en uso/disponible/otros", () => {
  const tipos = new Map([["camara", "Cámara (sin especificar)"], ["minidomo", "Mini domo"], ["nvr", "NVR"],
    ["dvr", "DVR"], ["switch", "Switch"], ["analitica", "Analítica"], ["lector", "Lector"]]);
  // el catálogo de /api/stock (stockGrupoDeActual): switch y analítica son Servidores; «lector», de un grupo nuevo
  const grupos = new Map([["nvr", "servidores"], ["dvr", "servidores"], ["switch", "servidores"],
    ["analitica", "servidores"], ["camara", "camaras"], ["minidomo", "camaras"], ["lector", "accesos"]]);
  const grupoDe = (t) => grupos.get(t) || "otros";
  const r = stock.resumirStock([
    { tipo: "nvr", modelo: "DS-1", en_uso: true, disponible: false },
    { tipo: "dvr", modelo: "DS-1", en_uso: false, disponible: true },
    { tipo: "minidomo", modelo: "C1", en_uso: true, disponible: false,
      instalacion: { edificio: "Anexo", piso: "2" } },
    { tipo: "camara", modelo: "C1", en_uso: false, disponible: false },
    { tipo: "switch", modelo: "SW", en_uso: false, disponible: true },
    { tipo: "analitica", modelo: "iDS", en_uso: true, disponible: false },
    { tipo: "lector", modelo: "L1", en_uso: true, disponible: false },
    { tipo: "grabadora_rara", en_uso: false, disponible: false },
  ], tipos, grupoDe);
  assert.deepEqual(plano(r.servidores.total), { t: 4, u: 2, d: 2, o: 0 });     // NVR + DVR + switch + analítica
  assert.deepEqual([...r.servidores.porTipo.keys()].sort(), ["Analítica", "DVR", "NVR", "Switch"]);
  assert.deepEqual([...r.servidores.porTipo.get("NVR").modelos.keys()], ["DS-1"]);    // tipo con sus modelos
  assert.deepEqual(plano(r.camaras.total), { t: 2, u: 1, d: 0, o: 1 });
  assert.deepEqual([...r.camaras.porTipo.keys()].sort(), ["Cámara (sin especificar)", "Mini domo"]);
  assert.deepEqual(plano(r.camaras.porTipo.get("Mini domo").c), { t: 1, u: 1, d: 0, o: 0 });
  assert.deepEqual(plano(r.camaras.porTipo.get("Mini domo").modelos.get("C1")), { t: 1, u: 1, d: 0, o: 0 });
  // sin la regla del grupo, solo `camara` es cámara: el minidomo iría a "otros"
  assert.deepEqual(plano(stock.resumirStock([{ tipo: "minidomo" }], tipos).otros.total), { t: 1, u: 0, d: 0, o: 1 });
  // sin catálogo, los grupos del sistema por defecto: NVR/DVR son Servidores
  assert.deepEqual(plano(stock.resumirStock([{ tipo: "nvr" }, { tipo: "dvr" }], tipos).servidores.total), { t: 2, u: 0, d: 0, o: 2 });
  assert.equal(r.camaras.porUbicacion, undefined);          // «Por ubicación» se quitó: eso se ve en Activos
  assert.deepEqual(plano(r.otros.total), { t: 1, u: 0, d: 0, o: 1 });          // solo lo desconocido: el grupo nuevo tiene su chip
  assert.deepEqual([...r.otros.porTipo.keys()], ["grabadora_rara"]);
  assert.deepEqual([...r.otros.porTipo.get("grabadora_rara").modelos.keys()], ["Sin modelo"]);
  // un grupo creado por el usuario («accesos») cuenta aparte, con los mismos datos y su detalle por tipo y modelo
  assert.deepEqual([...r.personalizados.keys()], ["accesos"]);
  assert.deepEqual(plano(r.personalizados.get("accesos").total), { t: 1, u: 1, d: 0, o: 0 });
  assert.deepEqual([...r.personalizados.get("accesos").porTipo.keys()], ["Lector"]);
  assert.deepEqual([...r.personalizados.get("accesos").porTipo.get("Lector").modelos.keys()], ["L1"]);
});

test("stock: claves de los datos como 'constructor' o '__proto__' se cuentan bien (Map, no {})", () => {
  const r = stock.resumirStock([
    { tipo: "camara", modelo: "constructor", en_uso: true, disponible: false },
    { tipo: "camara", modelo: "__proto__", en_uso: false, disponible: true },
  ], new Map());
  const modelos = r.camaras.porTipo.get("camara").modelos;
  assert.deepEqual(plano(modelos.get("constructor")), { t: 1, u: 1, d: 0, o: 0 });
  assert.deepEqual(plano(modelos.get("__proto__")), { t: 1, u: 0, d: 1, o: 0 });
  assert.deepEqual(plano(stock.resumirStock(null).servidores.total), { t: 0, u: 0, d: 0, o: 0 });
});

test("stock: unifica estados fuera de servicio (perdido, desafectado, averiado, revisar) en contador 'o'", () => {
  const dispositivos = [
    { tipo: "camara", modelo: "C1", en_uso: true, disponible: false },
    { tipo: "camara", modelo: "C2", en_uso: false, disponible: true },
    { tipo: "camara", modelo: "C3", en_uso: false, disponible: false, condicion: "averiado" },
    { tipo: "camara", modelo: "C4", en_uso: false, disponible: false, condicion: "revisar" },
    { tipo: "camara", modelo: "C5", en_uso: false, disponible: false, condicion: "perdido" },
    { tipo: "camara", modelo: "C6", en_uso: false, disponible: false, condicion: "desafectado" }
  ];
  const r = stock.resumirStock(dispositivos, new Map());
  // 6 total: 1 en uso, 1 disponible, 4 fuera de servicio (averiado, revisar, perdido, desafectado)
  assert.deepEqual(plano(r.camaras.total), { t: 6, u: 1, d: 1, o: 4 });
});

test("busquedaDeModelo: el modelo tal cual; con espacios, entre comillas; vacío o «Sin modelo», nada", () => {
  assert.equal(stock.busquedaDeModelo("DS-2CD2143G2-I"), "DS-2CD2143G2-I");
  assert.equal(stock.busquedaDeModelo("  Axis P3245 "), '"Axis P3245"');
  assert.equal(stock.busquedaDeModelo('mo"de lo'), '"mode lo"', "sin comillas internas que rompan el término");
  assert.equal(stock.busquedaDeModelo("Sin modelo"), "");
  assert.equal(stock.busquedaDeModelo(""), "");
  assert.equal(stock.busquedaDeModelo(null), "");
  assert.equal(stock.busquedaDeModelo('""'), "");
});



test("uiValorInformado: '-', '—', 'N/A' y vacío son sin dato; el resto se recorta", () => {
  for (const v of [null, undefined, "", "  ", "-", "—", "N/A", " N/A "]) assert.equal(uiValorInformado(v), "");
  assert.equal(uiValorInformado(" 10.0.0.1 "), "10.0.0.1");
  assert.equal(uiValorInformado(0), "0");
});

test("reorden: ordenarIdsSecciones mantiene orden por defecto si no hay guardado", () => {
  const ids = ["canales-section", "infra-chips", "disponibilidad-section"];
  assert.deepEqual(plano(reorden.ordenarIdsSecciones(ids, null)), ids);
  assert.deepEqual(plano(reorden.ordenarIdsSecciones(ids, undefined)), ids);
  assert.deepEqual(plano(reorden.ordenarIdsSecciones(ids, [])), ids);
});

test("reorden: ordenarIdsSecciones aplica orden guardado y agrega faltantes al final", () => {
  const ids = ["canales-section", "infra-chips", "disponibilidad-section"];
  assert.deepEqual(
    plano(reorden.ordenarIdsSecciones(ids, ["disponibilidad-section", "canales-section"])),
    ["disponibilidad-section", "canales-section", "infra-chips"]
  );
  assert.deepEqual(
    plano(reorden.ordenarIdsSecciones(ids, ["disponibilidad-section", "infra-chips", "canales-section"])),
    ["disponibilidad-section", "infra-chips", "canales-section"]
  );
});

test("reorden: ordenarIdsSecciones descarta ids inexistentes", () => {
  const ids = ["canales-section", "infra-chips", "disponibilidad-section"];
  assert.deepEqual(
    plano(reorden.ordenarIdsSecciones(ids, ["seccion-inexistente", "disponibilidad-section"])),
    ["disponibilidad-section", "canales-section", "infra-chips"]
  );
});

test("reorden: evaluarIntercambioSecciones detecta intercambio hacia abajo y arriba", () => {
  const rects = [
    { top: 100, height: 100 },
    { top: 210, height: 100 },
    { top: 320, height: 100 },
  ];

  // Arrastrando S0 (idx 0): punto medio S1 es 260
  assert.equal(reorden.evaluarIntercambioSecciones(0, rects, 200), null);
  assert.equal(reorden.evaluarIntercambioSecciones(0, rects, 270), "abajo");
  assert.equal(reorden.evaluarIntercambioSecciones(0, rects, 50), null);

  // Arrastrando S1 (idx 1): punto medio S0 es 150, S2 es 370
  assert.equal(reorden.evaluarIntercambioSecciones(1, rects, 220), null);
  assert.equal(reorden.evaluarIntercambioSecciones(1, rects, 140), "arriba");
  assert.equal(reorden.evaluarIntercambioSecciones(1, rects, 380), "abajo");

  // Arrastrando S2 (idx 2): punto medio S1 es 260
  assert.equal(reorden.evaluarIntercambioSecciones(2, rects, 250), "arriba");
  assert.equal(reorden.evaluarIntercambioSecciones(2, rects, 400), null);
});

const FABRICA = {
  arriba: ["monitoreo-section", "favoritos-section"],
  izq: ["canales-section", "infra-chips", "disponibilidad-section"],
  der: ["alertas-section"],
};

test("reorden: distribuirSecciones sin nada guardado (o basura) deja la disposición de fábrica", () => {
  for (const guardado of [null, undefined, 7, "x", {}, { izq: "no" }, { izq: [] }]) {
    assert.deepEqual(plano(reorden.distribuirSecciones(FABRICA, guardado)), FABRICA);
  }
});

test("reorden: distribuirSecciones mueve secciones entre zonas y completa las que faltan", () => {
  const r = reorden.distribuirSecciones(FABRICA, {
    arriba: [],
    izq: ["alertas-section", "canales-section"],
    der: ["monitoreo-section", "infra-chips"],
  });
  assert.deepEqual(plano(r), {
    arriba: ["favoritos-section"],
    izq: ["alertas-section", "canales-section", "disponibilidad-section"],
    der: ["monitoreo-section", "infra-chips"],
  });
});

test("reorden: distribuirSecciones pone cada sección en una sola zona y descarta ids ajenos", () => {
  const r = reorden.distribuirSecciones(FABRICA, {
    arriba: ["alertas-section", "<img>", "alertas-section"],
    izq: ["alertas-section", "canales-section"],
    der: [42, null, "monitoreo-section"],
    __proto__: { izq: ["infra-chips"] },
  });
  assert.deepEqual(plano(r), {
    arriba: ["alertas-section", "favoritos-section"],
    izq: ["canales-section", "infra-chips", "disponibilidad-section"],
    der: ["monitoreo-section"],
  });
});

test("reorden: distribuirSecciones acepta el formato anterior (solo el orden de la columna izquierda)", () => {
  const r = reorden.distribuirSecciones(FABRICA, ["disponibilidad-section", "canales-section"]);
  assert.deepEqual(plano(r), {
    arriba: ["monitoreo-section", "favoritos-section"],
    izq: ["disponibilidad-section", "canales-section", "infra-chips"],
    der: ["alertas-section"],
  });
});

test("reorden: zonaEnPunto devuelve la zona que contiene el puntero, o null entre zonas", () => {
  const zonas = [
    { zona: "arriba", left: 0, right: 100, top: 0, bottom: 50 },
    { zona: "izq", left: 0, right: 48, top: 60, bottom: 200 },
    { zona: "der", left: 52, right: 100, top: 60, bottom: 200 },
  ];
  assert.equal(reorden.zonaEnPunto(zonas, 10, 10), "arriba");
  assert.equal(reorden.zonaEnPunto(zonas, 10, 100), "izq");
  assert.equal(reorden.zonaEnPunto(zonas, 70, 100), "der");
  assert.equal(reorden.zonaEnPunto(zonas, 50, 100), null);
  assert.equal(reorden.zonaEnPunto(zonas, 10, 55), null);
});

test("reorden: indiceInsercion cuenta las secciones cuyo punto medio quedó arriba del puntero", () => {
  const rects = [{ top: 0, height: 100 }, { top: 110, height: 100 }];
  assert.equal(reorden.indiceInsercion(rects, 20), 0);
  assert.equal(reorden.indiceInsercion(rects, 60), 1);
  assert.equal(reorden.indiceInsercion(rects, 170), 2);
  assert.equal(reorden.indiceInsercion([], 500), 0);
});

test("reorden: destinoTeclado cambia de columna, sube a la zona de arriba y baja desde ella", () => {
  assert.deepEqual(plano(reorden.destinoTeclado("izq", "ArrowRight", 1, 3)), { zona: "der", indice: 1 });
  assert.deepEqual(plano(reorden.destinoTeclado("der", "ArrowLeft", 0, 1)), { zona: "izq", indice: 0 });
  assert.equal(reorden.destinoTeclado("izq", "ArrowLeft", 0, 3), null);
  assert.equal(reorden.destinoTeclado("der", "ArrowRight", 0, 1), null);
  assert.equal(reorden.destinoTeclado("izq", "ArrowUp", 1, 3), null);          // no es el primero: se reordena dentro
  assert.equal(reorden.destinoTeclado("arriba", "ArrowUp", 0, 1), null);
  const sube = reorden.destinoTeclado("der", "ArrowUp", 0, 2);
  assert.equal(sube.zona, "arriba");
  assert.equal(sube.indice, Infinity);                                          // al final de la zona de arriba
  assert.deepEqual(plano(reorden.destinoTeclado("arriba", "ArrowDown", 1, 2)), { zona: "izq", indice: 0 });
  assert.equal(reorden.destinoTeclado("arriba", "ArrowDown", 0, 2), null);
  assert.equal(reorden.destinoTeclado("izq", "ArrowDown", 2, 3), null);
});

test("stock: gruposPropiosCatalogo deja los grupos creados por el usuario, en orden, sin los del sistema ni repetidos", () => {
  const grupos = [
    { clave: "servidores", etiqueta: "Servidores", sistema: true },
    { clave: "pepe", etiqueta: "Pepe", sistema: false },
    { clave: "camaras", etiqueta: "Cámaras", sistema: true },
    { clave: "accesos", etiqueta: "", sistema: false },
    { clave: "pepe", etiqueta: "Otra vez" },
    { clave: "otros", etiqueta: "Otros", sistema: true },
    null, { etiqueta: "sin clave" }, { clave: 7 },
  ];
  assert.deepEqual(plano(stock.gruposPropiosCatalogo(grupos)), [
    { clave: "pepe", etiqueta: "Pepe" }, { clave: "accesos", etiqueta: "accesos" }]);
  assert.deepEqual(plano(stock.gruposPropiosCatalogo(null)), []);
});

test("stock: un grupo propio sin equipos no aparece en el resumen (su chip sale del catálogo, en cero)", () => {
  const r = stock.resumirStock([{ tipo: "nvr", en_uso: true }], new Map(), () => "servidores");
  assert.equal(r.personalizados.size, 0);
});

test("stock: metricasDesgloseStock devuelve las 3 métricas restantes según el eje central elegido", () => {
  assert.deepEqual(plano(stock.metricasDesgloseStock("total").map(m => m.id)), ["uso", "libres", "fuera"]);
  assert.deepEqual(plano(stock.metricasDesgloseStock("uso").map(m => m.id)), ["total", "libres", "fuera"]);
  assert.deepEqual(plano(stock.metricasDesgloseStock("libres").map(m => m.id)), ["total", "uso", "fuera"]);
  assert.deepEqual(plano(stock.metricasDesgloseStock("fuera").map(m => m.id)), ["total", "uso", "libres"]);
  assert.deepEqual(plano(stock.metricasDesgloseStock("desconocido").map(m => m.id)), ["uso", "libres", "fuera"]);
});

test("detalle de canales: en uso y disponibles en cantidad o en % de la capacidad (toggle)", () => {
  const { formatoCapacidad, modoCapacidadValido } = stock;
  assert.equal(formatoCapacidad(12, 32, "neto"), "12");
  assert.equal(formatoCapacidad(12, 32, "pct"), "38%");
  assert.equal(formatoCapacidad(0, 16, "pct"), "0%");
  assert.equal(formatoCapacidad(5, 0, "pct"), "5", "sin capacidad conocida no hay porcentaje");
  assert.equal(formatoCapacidad(undefined, 8, "neto"), "0");
  assert.equal(formatoCapacidad(4, 8, "otra cosa"), "4", "modo desconocido = cantidad");
  assert.equal(modoCapacidadValido("pct"), "pct");
  assert.equal(modoCapacidadValido(null), "neto");
  assert.equal(modoCapacidadValido("__proto__"), "neto");
});

