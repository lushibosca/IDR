// Pruebas del dashboard: resumen del stock y reubicación de secciones (bloques puros de resumen.js)
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const { uiValorInformado } = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado"]);
const GLOBALES = { String, Number, Array, Map, Set, Math, Object, ALERTAS_LIMITE_VISIBLES: 4, uiValorInformado };
const stock = cargarBloque("resumen.js", "RESUMEN STOCK PURO", GLOBALES, [
  "resumirStock", "busquedaDeModelo", "gruposPropiosCatalogo", "metricasDesgloseStock", "EJES_ACTIVOS", "formatoCapacidad",
  "modoCapacidadValido", "formatoParticipacion"
]);
const participacion = cargarBloque("resumen-participacion.js", "PARTICIPACION STOCK PURO", GLOBALES, [
  "modoParticipacionStockValido", "participacionStock", "etiquetaParticipacionStock",
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
  assert.equal(stock.busquedaDeModelo("DS-2CD2143G2-I", "en uso"), 'DS-2CD2143G2-I "en uso"');
  assert.equal(stock.busquedaDeModelo("DS-2CD2143G2-I", "disponible"), "DS-2CD2143G2-I disponible");
  assert.equal(stock.busquedaDeModelo("DS-2CD2143G2-I", "no disponible"), 'DS-2CD2143G2-I "no disponible"');
  assert.equal(stock.busquedaDeModelo("  Axis P3245 ", "no disponible"), '"Axis P3245" "no disponible"');
  assert.equal(stock.busquedaDeModelo("", "en uso"), "");
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

const distribucion = cargarBloque("resumen-distribucion.js", "DISTRIBUCION CANALES PURO", GLOBALES, [
  "MAX_GRABADORES_TORTA", "distribuirUsoGrabadores", "interpolarTextoNumerico",
]);

test("distribuirUsoGrabadores: ordena de mayor a menor uso, ignora sin uso y calcula % sobre el total", () => {
  const detalle = new Map([
    ["NVR B (10.0.0.2)", { nombre: "NVR B", ip: "10.0.0.2", enUso: 10, cap: 16 }],
    ["NVR A (10.0.0.1)", { nombre: "NVR A", ip: "10.0.0.1", enUso: 30, cap: 64 }],
    ["NVR C (10.0.0.3)", { nombre: "NVR C", ip: "10.0.0.3", enUso: 0, cap: 8 }],
  ]);
  const r = distribucion.distribuirUsoGrabadores(detalle);
  assert.equal(r.total, 40);
  assert.equal(r.ocultos, 0);
  assert.deepEqual(plano(r.items.map(i => [i.nombre, i.enUso, i.pct, i.esOtros, i.indice])), [
    ["NVR A", 30, 75, false, 0],
    ["NVR B", 10, 25, false, 1],
  ]);
  assert.equal(r.todos.length, 2);
  // para el chip: lo que cada grabador tiene instalado y libre (sin capacidad conocida, libres = 0 y se muestra «-»)
  assert.deepEqual(plano(r.items.map(i => [i.cap, i.libres])), [[64, 34], [16, 6]]);
});

test("distribuirUsoGrabadores: «Otros» suma la capacidad y los libres de lo que agrupa; sin capacidad no hay libres", () => {
  const detalle = new Map(Array.from({ length: 10 }, (_, i) => [
    `NVR ${i + 1}`, { nombre: `NVR ${i + 1}`, ip: `10.0.0.${i + 1}`, enUso: 20 - i, cap: 32, libres: 12 + i },
  ]));
  const otros = distribucion.distribuirUsoGrabadores(detalle).items[7];
  assert.equal(otros.cap, 32 * 3);
  assert.equal(otros.libres, 19 + 20 + 21);
  const sin = distribucion.distribuirUsoGrabadores(new Map([["A", { nombre: "A", enUso: 5 }]])).items[0];
  assert.deepEqual([sin.cap, sin.libres], [0, 0]);
});

test("distribuirUsoGrabadores: muestra hasta 8 máximo y si hay más agrupa el excedente en Otros", () => {
  const detalle8 = new Map(Array.from({ length: 8 }, (_, i) => [
    `NVR ${i + 1}`, { nombre: `NVR ${i + 1}`, ip: `10.0.0.${i + 1}`, enUso: 10 - i, cap: 16 },
  ]));
  const r8 = distribucion.distribuirUsoGrabadores(detalle8);
  assert.equal(r8.items.length, 8);
  assert.equal(r8.ocultos, 0);
  assert.ok(r8.items.every(i => !i.esOtros));

  const detalle10 = new Map(Array.from({ length: 10 }, (_, i) => [
    `NVR ${i + 1}`, { nombre: `NVR ${i + 1}`, ip: `10.0.0.${i + 1}`, enUso: 20 - i, cap: 32 },
  ]));
  const r10 = distribucion.distribuirUsoGrabadores(detalle10);
  assert.equal(r10.items.length, 8, "máximo 8 porciones (7 grabadores + Otros)");
  assert.equal(r10.ocultos, 3);
  assert.equal(r10.items[7].esOtros, true);
  assert.equal(r10.items[7].nombre, "Otros (3)");
  assert.equal(r10.items[7].enUso, 13 + 12 + 11);
  assert.equal(r10.todos.length, 10, "el detalle del modal conserva los 10 grabadores");
  assert.equal(r10.todos[6].indice, 6);
  assert.equal(r10.todos[7].indice, null);
});

test("distribuirUsoGrabadores: entradas vacías o nulas no rompen", () => {
  for (const x of [null, undefined, new Map(), new Map([["A", { nombre: "A", enUso: 0 }]])]) {
    const r = distribucion.distribuirUsoGrabadores(x);
    assert.deepEqual([r.total, r.items.length, r.todos.length, r.ocultos], [0, 0, 0, 0]);
  }
});

test("interpolarTextoNumerico: cuenta de un número al otro con los decimales del destino; lo que no es número no se cuenta", () => {
  const { interpolarTextoNumerico: i } = distribucion;
  assert.equal(i("78%", "16.7%", 1), "16.7%", "al final, el destino tal cual");
  assert.equal(i("78%", "16.7%", 0), "78.0%", "al principio, el origen con los decimales del destino");
  const medio = parseFloat(i("78%", "16.7%", 0.5));
  assert.ok(medio > 16.7 && medio < 78);
  assert.equal(i("300", "50", 0.5).includes("."), false, "destino entero: sin decimales");
  assert.equal(i("300", "50", 2), "50", "t fuera de rango se acota");
  assert.equal(i("300", "50", NaN), "50");
  for (const [d, h] of [["-", "50"], ["Usado", "Aporte a producción"], ["78%", "50"], ["", "14"], ["14", "-"]]) {
    assert.equal(i(d, h, 0.5), null, `${d} → ${h}`);
  }
});

test("detalle de stock: «% del total» con un decimal y sin base es «-»", () => {
  const { formatoParticipacion } = stock;
  assert.equal(formatoParticipacion(1, 3), "33.3%");
  assert.equal(formatoParticipacion(5, 5), "100%");
  assert.equal(formatoParticipacion(0, 7), "0%");
  assert.equal(formatoParticipacion(undefined, 7), "0%");
  assert.equal(formatoParticipacion(3, 0), "-", "sin base no hay porcentaje");
});

test("detalle de canales y de stock: columna «% del total» y chip de canales con la leyenda de participación", async () => {
  const fs = await import("node:fs");
  const { ruta } = await import("./_bloque.mjs");
  const html = fs.readFileSync(ruta("index.html"), "utf8");
  const resumen = fs.readFileSync(ruta("resumen.js"), "utf8");
  const distribucion = fs.readFileSync(ruta("resumen-distribucion.js"), "utf8");
  for (const tabla of ["tabla-detalle-capacidad", "tabla-detalle-stock", "tabla-detalle-stock-otros", "tabla-stock-grupo-tipo", "tabla-stock-cam-tipo"]) {
    const resto = html.slice(html.indexOf(`id="${tabla}"`));
    assert.ok(resto.slice(0, resto.indexOf("</thead>")).includes('<th class="text-center">% del total</th>'), tabla);
  }
  for (const id of ["card-kpi-capacidad", "kpi-cap-donut-grupo", "cap-distribucion-leyenda", "cap-detalle-part"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(!html.includes('id="modal-detalle-distribucion"'));
  assert.ok(resumen.includes("celdasContador(sub, m, clases.slice(1), modo, participacionStock(m, c.t, totalUso, modoPart),"), "un modelo pesa sobre su tipo");
  assert.ok(resumen.includes("celdasContador(tr, c, clases.slice(1), modo, participacionStock(c, totalGeneral, totalUso, modoPart))"), "un tipo pesa sobre el grupo");
  assert.ok(distribucion.includes("const MAX_GRABADORES_TORTA = 8;") && resumen.includes("pintarDistribucionGrabadores(cap);"));
  // con el cursor sobre un grabador: aporte a producción con su nombre de subtexto y sus propios valores (que cuentan, sin parpadeo)
  assert.ok(html.includes('id="kpi-cap-sub"') && distribucion.includes("'Aporte a producción'") && distribucion.includes("ponerSubtextoGrabador(it.nombre);"));
  assert.ok(distribucion.includes("ponerDerechaCapacidad(it.cap > 0 ? it.cap : '-', it.enUso, it.cap > 0 ? it.libres : '-');"));
  assert.ok(distribucion.includes("if (_capActual) ponerDerechaCapacidad(_capActual.total, _capActual.enUso, _capActual.libres);"));
  assert.ok(distribucion.includes("if (interpolarTextoNumerico(desde, destino, 0.5) === null) {"));
  assert.ok(distribucion.includes("const DONUT_GRABADOR = { cx: 42, cy: 42, r: 34, trazo: 8 };") && html.replace(/\s+/g, " ").includes('cx="42" cy="42" r="34" stroke-width="8"'), "la dona y el aro de uso miden lo mismo");
});

test("participacionStock: modo total usa c.t sobre su base; modo uso usa c.u sobre el total en producción del grupo", () => {
  const { participacionStock, modoParticipacionStockValido, etiquetaParticipacionStock } = participacion;
  const { formatoParticipacion } = stock;
  assert.equal(modoParticipacionStockValido("uso"), "uso");
  assert.equal(modoParticipacionStockValido("total"), "total");
  assert.equal(modoParticipacionStockValido("otro"), "total");
  assert.equal(modoParticipacionStockValido("__proto__"), "total");
  assert.equal(etiquetaParticipacionStock("total"), "% del total");
  assert.equal(etiquetaParticipacionStock("uso"), "% de producción");
  assert.equal(etiquetaParticipacionStock("x"), "% del total");

  const tipo = { t: 60, u: 50, d: 10, o: 0 };
  const modelo = { t: 40, u: 30, d: 10, o: 0 };
  // Modo total: tipo sobre total del grupo (100), modelo sobre total de su tipo (60)
  const ptTipo = participacionStock(tipo, 100, 80, "total");
  const ptModelo = participacionStock(modelo, tipo.t, 80, "total");
  assert.deepEqual(plano(ptTipo), { parte: 60, base: 100 });
  assert.deepEqual(plano(ptModelo), { parte: 40, base: 60 });
  assert.equal(formatoParticipacion(ptTipo.parte, ptTipo.base), "60%");
  assert.equal(formatoParticipacion(ptModelo.parte, ptModelo.base), "66.7%");

  // Modo producción (uso): tanto tipo como modelo sobre el total en uso del grupo (80)
  const puTipo = participacionStock(tipo, 100, 80, "uso");
  const puModelo = participacionStock(modelo, tipo.t, 80, "uso");
  assert.deepEqual(plano(puTipo), { parte: 50, base: 80 });
  assert.deepEqual(plano(puModelo), { parte: 30, base: 80 });
  assert.equal(formatoParticipacion(puTipo.parte, puTipo.base), "62.5%");
  assert.equal(formatoParticipacion(puModelo.parte, puModelo.base), "37.5%");
  assert.equal(formatoParticipacion(0, 0), "-");
});
