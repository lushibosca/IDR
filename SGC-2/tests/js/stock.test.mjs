// Funciones puras de static/stock-puro.js (se extrae el bloque entre marcadores, no es una copia).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

// normalizarTextoBusqueda vive en busqueda.js (una sola definición; en la página se carga antes que stock.js)
const { normalizarTextoBusqueda, tokenizarBusqueda } = cargarBloque("busqueda.js", "BUSQUEDA TOKENIZADA PURO", { String, Map, Set, Array, RegExp },
  ["normalizarTextoBusqueda", "tokenizarBusqueda"]);
const comun = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado", "uiNumeroCanal"]);
const { uiEsAtajoAltShift } = cargarBloque("comun.js", "MODO SELECCION PURO", { String }, ["uiEsAtajoAltShift"]);
const api = cargarBloque("stock-puro.js", "STOCK PURO", { String, Number, URL, Array, Object, Map, Set, Boolean, URLSearchParams, normalizarTextoBusqueda, tokenizarBusqueda,
  ...comun, uiEsAtajoAltShift },
  ["stockRespuestaValida", "stockDispositivoValido", "stockValoresDeDispositivo", "stockPayload", "stockUrlPagina", "stockModelosSugeridos", "stockModeloParecido", "stockDistanciaTexto", "stockValoresUnicos",
    "stockEdificioDelCatalogo", "stockValoresDesdeEscaneo", "stockConciliacionValida", "stockConciliacionResumen",
    "stockConciliacionAplicables", "stockProduccionTexto", "stockOpcionesPiso", "stockUbicacionesValidas",
    "stockHistorialTexto", "stockHistorialLinea", "stockHistorialValido", "stockEquipoMonitoreado", "stockMuestraGraficoDisponibilidad", "STOCK_EDIFICIO_NUEVO", "stockEtiquetas", "stockCondicionTexto",
    "stockMacTexto", "stockUbicacionTexto", "stockMarcaModelo", "stockFiltrar",
    "STOCK_AGRUPAMIENTOS", "stockTipoTexto", "stockEstadoEfectivo", "stockPisoPeso",
    "stockGrupoDe", "stockAgruparBloques", "stockComparadorColumna", "STOCK_COLUMNAS_ORDEN", "stockOrdenColumnas", "stockIdGrupo", "stockSubsecciones", "stockEscHtml",
    "stockReporteHtml", "stockTarjetaDatos", "stockInsigniaLista",
    "stockCamaraRepresentante", "stockCatalogo", "stockEsCamara", "stockGrupoTexto", "stockCatalogoValido", "stockMotivoNoBorrarGrupo",
    "stockMotivoNoBorrarTipo", "stockMotivoNoMoverTipo", "stockVistoEn", "stockDatosEscaneo", "stockCampoBloqueadoPorEscaneo", "stockAvisoProduccion", "stockMensajeGuardado",
    "stockGrupoDeTipo", "stockIconoTipo", "stockNombreVisible",
    "stockNormalizarDispositivo", "stockFormatearRegistro", "CAMPOS_LISTAR", "stockEsAtajoListar",
    "stockHistorialCambio", "stockHistorialUrl", "stockHistorialRecienteValido", "stockHistorialElemento",
    "STOCK_ACCIONES", "STOCK_ORIGENES", "stockSubgrupoAMover", "TIPO_ARRASTRE_SUBGRUPO"]);

const inst = (o = {}) => ({ descripcion: "ANX C 8vo PASILLO", ip: "10.32.30.3", edificio: "Anexo C", piso: "8",
  rack: "0380", puerto: "3/0/21", comentario: "", ...o });
const d = (o = {}) => ({ id: "a", tipo: "camara", condicion: "operativo", marca: "Hikvision",
  modelo: "DS-2CD", serie: null, mac: null, patrimonio: null, firmware: null, canales: null, comentario: "",
  instalacion: null, version: 1, en_uso: false, disponible: true, ...o });
const enUso = (o = {}) => d({ instalacion: inst(), en_uso: true, disponible: false, ...o });
const fuera = (o = {}) => d({ condicion: "averiado", disponible: false, ...o });
const tipos = new Map([["camara", "Cámara (sin especificar)"], ["domo", "Domo"], ["bullet", "Bullet"], ["nvr", "NVR"]]);
// StockV1.grupos (ya ordenado por el servidor)
const GRUPOS = [
  { clave: "servidores", etiqueta: "Servidores", sistema: true, tipos: [{ clave: "nvr", etiqueta: "NVR" }] },
  { clave: "camaras", etiqueta: "Cámaras", sistema: true, tipos: [{ clave: "bullet", etiqueta: "Bullet" },
    { clave: "camara", etiqueta: "Cámara (sin especificar)" }, { clave: "domo", etiqueta: "Domo" }] },
  { clave: "otros", etiqueta: "Otros", sistema: true, tipos: [{ clave: "monitor", etiqueta: "Monitor" }] }];

test("valida la forma de StockV1 antes de pintar", () => {
  const ok = { inicializado: true, editable: false, dispositivos: [d()], grupos: [], tipos: [], condiciones: [],
    edificios: [], pisos: [] };
  assert.equal(api.stockRespuestaValida(ok), true);
  assert.equal(api.stockRespuestaValida({ ...ok, editable: "sí" }), false);
  assert.equal(api.stockRespuestaValida({ ...ok, dispositivos: [{ ...d(), version: "1" }] }), false);
  assert.equal(api.stockRespuestaValida({ ...ok, grupos: undefined }), false);
  // la respuesta de antes (formas aparte, sin grupos) ya no se acepta
  assert.equal(api.stockRespuestaValida({ ...ok, grupos: undefined, formas: [], tipos_con_forma: ["camara"] }), false);
  assert.equal(api.stockRespuestaValida({ ...ok, dispositivos: [{ ...d(), en_uso: "sí" }] }), false);
  assert.equal(api.stockRespuestaValida({ ...ok, edificios: null }), false);
  assert.equal(api.stockRespuestaValida({ ...ok, pisos: undefined }), false);
  assert.equal(api.stockRespuestaValida(null), false);
});

test("estado efectivo: en producción si está instalado (aunque esté a revisar), si no disponible o su condición", () => {
  assert.equal(api.stockEstadoEfectivo(enUso()), "produccion");
  assert.equal(api.stockEstadoEfectivo(enUso({ condicion: "revisar" })), "produccion");
  assert.equal(api.stockEstadoEfectivo(d()), "disponible");
  assert.equal(api.stockEstadoEfectivo(fuera()), "averiado");
});

test("textos de MAC, ubicación, condición y marca/modelo", () => {
  assert.equal(api.stockMacTexto("00:04:63:37:aa:77"), "00:04:63:37:AA:77");
  assert.equal(api.stockMacTexto(null), "");
  assert.equal(api.stockUbicacionTexto(inst()), "Anexo C · piso 8 · rack 0380 · puerto 3/0/21");
  assert.equal(api.stockUbicacionTexto(inst({ piso: "", rack: "" })), "Anexo C · puerto 3/0/21");
  assert.equal(api.stockUbicacionTexto(null), "");
  assert.equal(api.stockCondicionTexto("revisar"), "A revisar");
  assert.equal(api.stockCondicionTexto("desconocida"), "desconocida");
  assert.equal(api.stockMarcaModelo(d({ marca: "" })), "DS-2CD");
});

test("la búsqueda filtra por texto (incluida la ubicación, la MAC en mayúsculas y las etiquetas)", () => {
  const lista = [enUso({ id: "1", mac: "00:04:63:37:aa:77" }), d({ id: "2", tipo: "bullet" }),
    fuera({ id: "3", tipo: "nvr" }), d({ id: "4", condicion: "revisar", disponible: false })];
  const ids = (t) => api.stockFiltrar(lista, t, tipos).map(x => x.id);
  assert.deepEqual(ids(""), ["1", "2", "3", "4"]);
  assert.deepEqual(ids("   "), ["1", "2", "3", "4"]);
  assert.deepEqual(ids("  rack-no-existe"), []);
  assert.deepEqual(ids("anexo c"), ["1"]);
  assert.deepEqual(ids("37:AA"), ["1"]);
  assert.deepEqual(ids("nvr"), ["3"]);            // por la etiqueta del tipo
  assert.deepEqual(ids("bullet"), ["2"]);         // la forma ahora es el tipo
  assert.deepEqual(ids("a revisar"), ["4"]);      // por la etiqueta de la condición
});

test("hay 7 criterios de agrupamiento (los del SGC) más «Sin agrupar», y el de defecto es Grupo / Tipo", () => {
  assert.equal(api.STOCK_AGRUPAMIENTOS.get("tipo"), "Grupo / Tipo");
  assert.deepEqual([...api.STOCK_AGRUPAMIENTOS.keys()], ["tipo", "edificio", "estado", "marca", "modelo", "modelo-firmware", "patrimonio", "ninguno"]);
});

test("catálogo: grupo de cada tipo, cámaras por grupo y __proto__ como clave inofensiva", () => {
  const cat = api.stockCatalogo(GRUPOS);
  assert.equal(cat.grupoDe.get("domo"), "camaras");
  assert.equal(cat.etiquetaGrupo.get("servidores"), "Servidores");
  assert.deepEqual([cat.ordenGrupo.get("servidores"), cat.ordenGrupo.get("otros"), cat.ordenTipo.get("domo")], [0, 2, 2]);
  assert.equal(api.stockEsCamara("domo", cat), true);
  assert.equal(api.stockEsCamara("camara", cat), true);
  assert.equal(api.stockEsCamara("nvr", cat), false);
  assert.equal(api.stockEsCamara("monitor", cat), false);
  assert.equal(api.stockEsCamara("domo", null), false);         // sin catálogo, solo `camara`
  assert.equal(api.stockEsCamara("camara", null), true);
  assert.equal(api.stockGrupoTexto({ tipo: "bullet" }, cat), "Cámaras");
  const raro = api.stockCatalogo([{ clave: "__proto__", etiqueta: "Raro", tipos: [{ clave: "constructor", etiqueta: "C" }] },
    null, { etiqueta: "sin clave" }]);
  assert.equal(raro.grupoDe.get("constructor"), "__proto__");
  assert.equal(api.stockCatalogo(undefined).grupoDe.size, 0);
  assert.equal(({}).polluted, undefined);
});

test("agrupa por grupo en el orden del catálogo y subsecciones por tipo", () => {
  const cat = api.stockCatalogo(GRUPOS);
  const lista = [enUso({ id: "1", tipo: "domo" }), d({ id: "2", tipo: "bullet" }), fuera({ id: "3", tipo: "nvr" }),
    d({ id: "4" }), d({ id: "5", tipo: "monitor" }), d({ id: "6", tipo: "lector" })];   // "lector": fuera del catálogo
  const bloques = plano(api.stockAgruparBloques(lista, "tipo", tipos, cat));
  assert.deepEqual(bloques.map(g => [g.etiqueta, g.items.map(x => x.id).sort()]),
    [["Servidores", ["3"]], ["Cámaras", ["1", "2", "4"]], ["Otros", ["5"]], ["lector", ["6"]]]);
  const subs = plano(api.stockSubsecciones(bloques[1].items, "tipo", tipos, cat));
  assert.deepEqual(subs.map(s => [s.titulo, s.clave, s.items.map(x => x.id)]),
    [["Bullet", "bullet", ["2"]], ["Cámara (sin especificar)", "camara", ["4"]], ["Domo", "domo", ["1"]]]);
  assert.deepEqual(plano(api.stockSubsecciones(bloques[1].items, "tipo")).map(s => s.titulo), [""]);   // sin catálogo
});

test("atajos de los chips del dashboard: «camara produccion» y «servidores produccion» = lo instalado del grupo", () => {
  const cat = api.stockCatalogo(GRUPOS);
  const lista = [enUso({ id: "1", tipo: "domo" }), d({ id: "2", tipo: "bullet" }), enUso({ id: "3", tipo: "nvr" }),
    d({ id: "4", tipo: "nvr" }), enUso({ id: "5", tipo: "monitor" }), enUso({ id: "6" })];
  const ids = (t) => api.stockFiltrar(lista, t, tipos, null, cat).map(x => x.id).sort();
  assert.deepEqual(ids("camara produccion"), ["1", "6"]);
  assert.deepEqual(ids("servidores produccion"), ["3"]);
});

test("búsqueda por grupo: «cámaras» encuentra un domo y «servidores» todo el grupo (no solo NVR/DVR)", () => {
  const cat = api.stockCatalogo([{ ...GRUPOS[0], tipos: [...GRUPOS[0].tipos, { clave: "analitica", etiqueta: "Analítica" }] },
    ...GRUPOS.slice(1)]);
  const lista = [d({ id: "1", tipo: "domo" }), d({ id: "2", tipo: "nvr" }), d({ id: "3", tipo: "monitor" }),
    d({ id: "4", tipo: "analitica" })];
  const ids = (t) => api.stockFiltrar(lista, t, tipos, null, cat).map(x => x.id);
  assert.deepEqual(ids("cámaras"), ["1"]);
  assert.deepEqual(ids("servidores"), ["2", "4"]);              // el grupo, como el chip del dashboard y Activos
  assert.deepEqual(ids("Servidor"), ["2", "4"]);
  assert.deepEqual(ids("nvr"), ["2"]);                          // «nvr»/«grabador»: solo los grabadores
  assert.deepEqual(ids("grabadores"), ["2"]);
  assert.deepEqual(api.stockFiltrar(lista, "servidores", tipos, null, null).map(x => x.id), ["2"]);   // sin catálogo
  assert.deepEqual([api.stockGrupoDeTipo("dvr", null), api.stockGrupoDeTipo("camara", null), api.stockGrupoDeTipo("pc", null)],
    ["servidores", "camaras", "otros"]);
  assert.deepEqual(ids("otros"), ["3"]);                          // por la etiqueta del grupo
});

test("agrupa en bloques por tipo (sin catálogo), con los grupos 'Sin ...' al final", () => {
  const lista = [enUso({ id: "1", tipo: "domo" }), d({ id: "2", tipo: "bullet" }), fuera({ id: "3", tipo: "nvr" })];
  assert.deepEqual(plano(api.stockAgruparBloques(lista, "tipo", tipos)).map(g => [g.etiqueta, g.items.map(x => x.id)]),
    [["Bullet", ["2"]], ["Domo", ["1"]], ["NVR", ["3"]]]);
  const porMarca = plano(api.stockAgruparBloques([d({ id: "1", marca: "" }), d({ id: "2", marca: "Bosch" }), d({ id: "3" })], "marca"));
  assert.deepEqual(porMarca.map(g => g.etiqueta), ["Bosch", "Hikvision", "Sin marca"]);
  const porPat = plano(api.stockAgruparBloques([d({ id: "1" }), d({ id: "2", patrimonio: "PAT1" })], "patrimonio"));
  assert.deepEqual(porPat.map(g => g.etiqueta), ["Con patrimonio", "Sin patrimonio"]);
});

test("un tipo llamado __proto__ no rompe ni contamina las etiquetas (Map, no {})", () => {
  const et = api.stockEtiquetas([{ clave: "__proto__", etiqueta: "Raro" }]);
  assert.equal(et.get("__proto__"), "Raro");
  assert.deepEqual(plano(api.stockAgruparBloques([d({ tipo: "__proto__" })], "tipo", et)).map(g => g.etiqueta), ["Raro"]);
  assert.deepEqual(plano(api.stockAgruparBloques([d({ marca: "__proto__" }), d({ marca: "constructor" })], "marca")).map(g => g.etiqueta),
    ["__proto__", "constructor"].sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })));
  assert.equal(({}).polluted, undefined);
});

test("por estado: en el orden del SGC (producción, disponibles, revisar, averiados...)", () => {
  const lista = [fuera({ id: "1" }), d({ id: "2" }), enUso({ id: "3" }), d({ id: "4", condicion: "baja", disponible: false }),
    d({ id: "5", condicion: "revisar", disponible: false })];
  assert.deepEqual(plano(api.stockAgruparBloques(lista, "estado")).map(g => g.etiqueta),
    ["En producción", "Disponibles", "A revisar", "Averiados", "Dados de baja"]);
});

test("por edificio: ordena los equipos por piso (subsuelos, PB, pisos) y deja 'Sin instalar' al final", () => {
  const p = (id, piso) => enUso({ id, instalacion: inst({ piso }) });
  const lista = [p("a", "8"), p("b", "PB"), p("c", "2SS"), p("d", "1SS"), p("e", "10"), d({ id: "f" }),
    enUso({ id: "g", instalacion: inst({ edificio: "" }) })];
  const bloques = plano(api.stockAgruparBloques(lista, "edificio"));
  assert.deepEqual(bloques.map(g => g.etiqueta), ["Anexo C", "Instalado, sin edificio", "Sin instalar"]);
  assert.deepEqual(bloques[0].items.map(x => x.id), ["c", "d", "b", "a", "e"]);
  assert.ok(api.stockPisoPeso("EP") > 0 && api.stockPisoPeso("EP") < 1 && api.stockPisoPeso("") === 9999);
});

test("por edificio: subsecciones por piso ordenadas jerárquicamente igual que en el catálogo", () => {
  const p = (id, piso) => enUso({ id, instalacion: inst({ piso }) });
  const lista = [p("1", "4"), p("2", "13"), p("3", "1SS CCO"), p("4", "PB"), p("5", "6SS"), p("6", ""), p("7", "6")];
  const subs = plano(api.stockSubsecciones(lista, "edificio"));
  assert.deepEqual(subs.map(s => s.titulo), [
    "Piso: 6SS", "Piso: 1SS CCO", "Piso: PB", "Piso: 4", "Piso: 6", "Piso: 13", "Piso: Sin piso"
  ]);
});

test("por modelo / firmware: ordena por firmware y el no relevado al final", () => {
  const lista = [d({ id: "a", firmware: "V5.7" }), d({ id: "b" }), d({ id: "c", firmware: "V5.5" })];
  assert.deepEqual(plano(api.stockAgruparBloques(lista, "modelo-firmware"))[0].items.map(x => x.id), ["c", "a", "b"]);
  assert.deepEqual(plano(api.stockSubsecciones(lista, "modelo-firmware")).map(s => s.titulo),
    ["Firmware: V5.7", "Firmware: Firmware no relevado", "Firmware: V5.5"]);
  assert.deepEqual(plano(api.stockSubsecciones(lista, "marca")).map(s => s.titulo), [""]);
});

test("ids de acordeón: estables, solo caracteres seguros y sin choques", () => {
  const usados = new Set();
  assert.equal(api.stockIdGrupo("edificio", "Anexo A", usados), "stock-g-edificio-Anexo_A");
  assert.equal(api.stockIdGrupo("edificio", "Anexo-A", usados), "stock-g-edificio-Anexo_A-2");
  assert.match(api.stockIdGrupo("tipo", '"><img src=x>', usados), /^stock-g-tipo-[A-Za-z0-9_]+$/);
});

test("reporte HTML: escapa todo dato, trae resumen, total y subsecciones por piso, y no lleva scripts", () => {
  const xss = '<img src=x onerror=alert(1)>';
  const bloques = [{ etiqueta: `Anexo ${xss}`, items: [enUso({ id: "1", serie: xss, instalacion: inst({ piso: "PB", descripcion: xss }) }),
    enUso({ id: "2", instalacion: inst({ piso: "8" }) })] }];
  const html = api.stockReporteHtml(bloques, { criterio: "edificio", criterioTexto: "Edificio / Piso", fecha: "8 de octubre",
    busqueda: xss, etiquetasTipo: tipos, catalogo: api.stockCatalogo(GRUPOS) });
  assert.ok(!html.includes("<img") && !/<script/i.test(html));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("TOTAL DE DISPOSITIVOS</strong></td><td><strong>2"));
  assert.ok(html.includes("— Piso: PB (1)") && html.includes("— Piso: 8 (1)"));
  assert.ok(html.includes("<th>Grupo</th><th>Tipo</th>") && html.includes("<td>Cámaras</td><td>Cámara (sin especificar)</td>"));
  assert.equal(api.stockEscHtml(`"'&`), "&quot;&#39;&amp;");
});

test("nombres de archivo de las exportaciones", () => {
});

test("atajo de Listar: Alt+Shift+L y nada más (ni con Ctrl/Meta, ni sin Shift, ni la tecla sostenida)", () => {
  const ev = (o = {}) => ({ key: "L", code: "KeyL", altKey: true, shiftKey: true, ctrlKey: false, metaKey: false,
    repeat: false, ...o });
  assert.equal(api.stockEsAtajoListar(ev()), true);
  assert.equal(api.stockEsAtajoListar(ev({ key: "Ł" })), true);               // otra distribución: vale la tecla
  assert.equal(api.stockEsAtajoListar(ev({ code: "KeyP", key: "l" })), true); // y la letra (Dvorak)
  for (const o of [{ altKey: false }, { shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { repeat: true },
    { code: "KeyK", key: "K" }]) {
    assert.equal(api.stockEsAtajoListar(ev(o)), false, JSON.stringify(o));
  }
  assert.equal(api.stockEsAtajoListar(null), false);
});

// ------------------------------------------------------------------------------------------ edición
test("formulario: valores de un dispositivo (MAC en mayúsculas, nulos como vacío) y de un alta", () => {
  const v = plano(api.stockValoresDeDispositivo(enUso({ mac: "00:04:63:37:aa:77", canales: 64, serie: null })));
  assert.equal(v.mac, "00:04:63:37:AA:77");
  assert.equal(v.canales, "64");
  assert.equal(v.serie, "");
  assert.equal(v.instalado, true);
  assert.equal(v.rack, "0380");
  const alta = plano(api.stockValoresDeDispositivo(null));
  assert.deepEqual([alta.tipo, alta.condicion, alta.instalado, alta.marca], ["camara", "operativo", false, ""]);
});

test("payload: recorta, vacíos opcionales a null, sin forma (ya es el tipo), instalación o null", () => {
  const v = { ...plano(api.stockValoresDeDispositivo(enUso())), marca: "  Hikvision ", serie: "  ", canales: "64",
    forma: "domo" };                                // un valor de más no se manda (la API respondería 422)
  const p = plano(api.stockPayload(v));
  assert.equal(p.tipo, "camara");
  assert.equal(p.marca, "Hikvision");
  assert.equal(p.serie, null);
  assert.equal(p.canales, 64);
  assert.equal(p.instalacion.puerto, "3/0/21");
  assert.equal(plano(api.stockPayload({ ...v, instalado: false })).instalacion, null);
  assert.equal(plano(api.stockPayload({ ...v, canales: "" })).canales, null);
  assert.equal(plano(api.stockPayload({ ...v, canales: "12a" })).canales, "12a");   // el servidor responde 422
  assert.equal(plano(api.stockPayload({ ...v, ip: "" })).instalacion.ip, null);
  assert.deepEqual(Object.keys(p).sort(), ["canales", "comentario", "condicion", "firmware", "instalacion",
    "mac", "marca", "modelo", "patrimonio", "serie", "tipo"]);
});

test("sugerencias únicas y edificio tal como quedó en el catálogo", () => {
  assert.deepEqual(plano(api.stockValoresUnicos([d(), d({ marca: "Bosch" }), d({ marca: "" })], "marca")), ["Bosch", "Hikvision"]);
  assert.equal(api.stockEdificioDelCatalogo(["Anexo A", "Palacio"], "  anexo   a "), "Anexo A");
  assert.equal(api.stockEdificioDelCatalogo(["Anexo A"], "Otro"), null);
  assert.ok(!["Anexo A"].includes(api.STOCK_EDIFICIO_NUEVO));
});

test("historial: textos por campo, alta, vacíos y origen no manual", () => {
  assert.equal(api.stockHistorialTexto({ cuando: "2026-10-08T05:00:12Z", origen: "manual", campo: "firmware", antes: "V1", despues: "V2" }),
    "2026-10-08 05:00 · Firmware: V1 → V2");
  assert.equal(api.stockHistorialTexto({ cuando: "2026-10-08T05:00:12Z", origen: "importacion", campo: "instalacion.rack", antes: null, despues: "R1" }),
    "2026-10-08 05:00 · Rack: (vacío) → R1 [importacion]");
  assert.equal(api.stockHistorialTexto({ cuando: "2026-10-08T05:00:12Z", origen: "manual", campo: "alta", antes: null, despues: "camara Hik" }),
    "2026-10-08 05:00 · Alta (camara Hik)");
  assert.equal(api.stockHistorialTexto({ cuando: "x", origen: "manual", campo: "raro", antes: "a", despues: "b" }), "x · raro: a → b");
  assert.equal(api.stockHistorialValido({ dispositivo_id: "a", entradas: [{ cuando: "t", campo: "c" }] }), true);
  assert.equal(api.stockHistorialValido({ dispositivo_id: "a", entradas: [{ cuando: 1, campo: "c" }] }), false);
});

test("alta desde una fila de Cámaras: precarga lo del scanner e ignora los '-' y 'N/A'", () => {
  const v = plano(api.stockValoresDesdeEscaneo({ ip: "10.32.30.3", mac: "00:04:63:37:aa:77", modelo: "DS-2CD1323G0E-I",
    firmware: "V5.7.3", nombre: "ANX C 8vo PASILLO" }));
  assert.deepEqual([v.tipo, v.instalado, v.ip, v.mac, v.modelo, v.firmware, v.descripcion, v.condicion],
    ["camara", true, "10.32.30.3", "00:04:63:37:AA:77", "DS-2CD1323G0E-I", "V5.7.3", "ANX C 8vo PASILLO", "operativo"]);
  const vacio = plano(api.stockValoresDesdeEscaneo({ ip: "10.0.0.1", mac: "-", modelo: "N/A", firmware: undefined, nombre: "Desconocida" }));
  assert.deepEqual([vacio.mac, vacio.modelo, vacio.firmware, vacio.descripcion], ["", "", "", ""]);
});

test("historial: el borrado muestra qué era", () => {
  assert.equal(api.stockHistorialTexto({ cuando: "2026-10-08T05:00:12Z", origen: "manual", campo: "eliminado",
    antes: "camara Hikvision DS-2CD · serie X", despues: null }), "2026-10-08 05:00 · Eliminado (camara Hikvision DS-2CD · serie X)");
});

test("alta desde un NVR (Servidores o conciliación): tipo nvr y serie", () => {
  const v = plano(api.stockValoresDesdeEscaneo({ tipo: "nvr", ip: "10.105.0.195", mac: "c0:6d:ed:1e:f0:27",
    modelo: "DS-96128NI-I16", serie: "SN1", firmware: "V4.61.000", nombre: "NVR-6" }));
  assert.deepEqual([v.tipo, v.serie, v.mac, v.descripcion, v.instalado], ["nvr", "SN1", "C0:6D:ED:1E:F0:27", "NVR-6", true]);
  assert.equal(plano(api.stockValoresDesdeEscaneo({ tipo: "otro", ip: "x" })).tipo, "camara");
});

test("conciliación: validación de la respuesta y resumen", () => {
  const ok = { escaneado: "2026-10-08T05:00:12Z", editable: true, propuestas: [{ dispositivo_id: "a" }],
    conflictos: [], sin_alta: [{ tipo: "nvr" }, { tipo: "camara" }], no_vistos: [{ dispositivo_id: "b" }],
    a_produccion: [{ dispositivo_id: "c" }, { dispositivo_id: "d" }], reemplazos: [{ nuevo_id: "n", anterior_id: "v" }] };
  assert.equal(api.stockConciliacionValida(ok), true);
  assert.equal(api.stockConciliacionValida({ ...ok, reemplazos: [{ nuevo_id: "n" }] }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, reemplazos: undefined }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, sin_alta: [{ tipo: "tostadora" }] }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, propuestas: [{}] }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, escaneado: 5 }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, a_produccion: undefined }), false);
  assert.equal(api.stockConciliacionValida({ ...ok, a_produccion: [{}] }), false);
  assert.equal(api.stockConciliacionResumen(ok),
    "1 dato a completar o actualizar · 2 a poner en producción · 1 reemplazo · 0 diferencias · 2 sin alta · 1 instalado no visto"
    + " (escaneo del 2026-10-08 05:00 UTC)");
  assert.equal(api.stockConciliacionAplicables(ok), 3);       // «Aplicar» también pone en producción
  assert.match(api.stockConciliacionResumen({ ...ok, escaneado: null }), /Todavía no hay un escaneo/);
});

test("stockTarjetaDatos: cámara en producción con NVR, canal, ubicación e IP", () => {
  const disp = d({
    tipo: "bullet", mac: "64:db:8b:49:9c:8c", modelo: "DS-2CD2625FHWD-IZS",
    serie: "20180108AAWR166497508", patrimonio: "PAT102607", condicion: "operativo",
    instalacion: { descripcion: "PAL 1P ALA ENTRE RIOS", ip: "10.3.30.2", edificio: "Palacio", piso: "1" }
  });
  const cam = { nvr_name: "NVR-5", channel_id: "42", ip_address: "10.3.30.2" };

  const tarjeta = api.stockTarjetaDatos(disp, cam, tipos);
  assert.equal(tarjeta.titulo, "BULLET - 64:DB:8B:49:9C:8C");
  assert.equal(tarjeta.badgeTexto, "PAL 1P ALA ENTRE RIOS");
  assert.equal(tarjeta.badgeClase, "primary");
  assert.equal(tarjeta.modelo, "DS-2CD2625FHWD-IZS");
  assert.equal(tarjeta.nvrCanal, "NVR-5 · CANAL 42");
  assert.equal(tarjeta.seriePat, "S/N: 20180108AAWR166497508 · PAT: PAT102607");
  assert.equal(tarjeta.ip, "10.3.30.2");
});

test("stockTarjetaDatos: dispositivo averiado sin instalación muestra badge de condición", () => {
  const disp = d({
    tipo: "bullet", mac: "64:db:8b:49:9c:a8", modelo: "DS-2CD2625FHWD-IZS",
    patrimonio: "PAT102607", condicion: "averiado", instalacion: null, disponible: false
  });

  const tarjeta = api.stockTarjetaDatos(disp, null, tipos);
  assert.equal(tarjeta.titulo, "BULLET - 64:DB:8B:49:9C:A8");
  assert.equal(tarjeta.badgeTexto, "Averiado");
  assert.equal(tarjeta.badgeClase, "danger");
  assert.equal(tarjeta.modelo, "DS-2CD2625FHWD-IZS");
  assert.equal(tarjeta.nvrCanal, "");
  assert.equal(tarjeta.seriePat, "S/N: Sin relevar · PAT: PAT102607");
  assert.equal(tarjeta.ip, "");
});

test("piso: opciones de abajo hacia arriba y el piso que ya tiene aunque no esté en la lista", () => {
  assert.deepEqual(plano(api.stockOpcionesPiso(["3", "PB", "1SS", "EP1", "2SS", "1"], "")).map(([v]) => v),
    ["2SS", "1SS", "PB", "EP1", "1", "3"]);
  assert.deepEqual(plano(api.stockOpcionesPiso(["PB"], "RARO")).map(([v]) => v), ["PB", "RARO"]);
  assert.deepEqual(plano(api.stockOpcionesPiso(null, "")), []);
});

test("edificios y pisos: valida la forma de UbicacionesStock", () => {
  const ok = { edificios: [{ nombre: "Anexo A", usos: 3 }], pisos: [{ nombre: "PB", usos: 0 }], guardado: null };
  assert.equal(api.stockUbicacionesValidas(ok), true);
  assert.equal(api.stockUbicacionesValidas({ ...ok, guardado: "PB" }), true);
  assert.equal(api.stockUbicacionesValidas({ ...ok, pisos: [{ nombre: "PB", usos: "0" }] }), false);
  assert.equal(api.stockUbicacionesValidas({ ...ok, edificios: undefined }), false);
  assert.equal(api.stockUbicacionesValidas(null), false);
});

test("conciliación: cómo figura en el stock lo que el escaneo ve en producción", () => {
  assert.equal(api.stockProduccionTexto({ condicion: "averiado", instalado: false }), "Averiado · sin instalar");
  assert.equal(api.stockProduccionTexto({ condicion: "revisar", instalado: true }), "A revisar");
  assert.equal(api.stockProduccionTexto({ condicion: "operativo", instalado: false }), "Sin instalar");
});

test("stockTarjetaDatos: instalado sin descripción ni edificio dice INSTALADO (nunca «Sin instalar»)", () => {
  const disp = d({ tipo: "bullet", mac: "64:db:8b:49:9c:a8", condicion: "operativo",
    instalacion: inst({ descripcion: "", edificio: "" }), disponible: false });
  const tarjeta = api.stockTarjetaDatos(disp, null, tipos);
  assert.equal(tarjeta.badgeTexto, "INSTALADO");
  assert.equal(tarjeta.badgeClase, "primary");
});

test("stockTarjetaDatos: sin MAC el título dice «MAC sin relevar» (nunca el id interno)", () => {
  const disp = d({
    id: "disp123", tipo: "nvr", mac: null, serie: "SN999", modelo: "DS-9664NI-I8",
    condicion: "operativo", instalacion: null, disponible: true
  });

  const tarjeta = api.stockTarjetaDatos(disp, null, tipos);
  assert.equal(tarjeta.titulo, "NVR - MAC sin relevar");
  assert.equal(tarjeta.seriePat, "S/N: SN999");
  assert.equal(tarjeta.badgeTexto, "Disponible");
  assert.equal(tarjeta.badgeClase, "success");
  assert.equal(tarjeta.modelo, "DS-9664NI-I8");
});

test("stockInsigniaLista: dispositivo en producción operativo no muestra insignia", () => {
  assert.equal(api.stockInsigniaLista(enUso()), null);
});

test("stockInsigniaLista: dispositivo en producción a revisar muestra insignia warning", () => {
  assert.deepEqual(plano(api.stockInsigniaLista(enUso({ condicion: "revisar" }))), { texto: "A revisar", clase: "warning" });
});

test("stockInsigniaLista: dispositivo en producción averiado muestra insignia danger", () => {
  assert.deepEqual(plano(api.stockInsigniaLista(enUso({ condicion: "averiado" }))), { texto: "Averiado", clase: "danger" });
});

test("stockInsigniaLista: dispositivo disponible sin instalación muestra insignia Disponible", () => {
  assert.deepEqual(plano(api.stockInsigniaLista(d())), { texto: "Disponible", clase: "success" });
});

test("stockInsigniaLista: dispositivo sin instalación a revisar muestra insignia A revisar", () => {
  assert.deepEqual(plano(api.stockInsigniaLista(d({ condicion: "revisar", disponible: false }))), { texto: "A revisar", clase: "warning" });
});

test("stockInsigniaLista: dispositivo sin instalación averiado muestra insignia Averiado", () => {
  assert.deepEqual(plano(api.stockInsigniaLista(fuera())), { texto: "Averiado", clase: "danger" });
});

test("stockInsigniaLista: dispositivo nulo o indefinido retorna null", () => {
  assert.equal(api.stockInsigniaLista(null), null);
  assert.equal(api.stockInsigniaLista(undefined), null);
});


// ------------------------------------------------------------------------------- catálogo «Dispositivos»
test("catálogo: valida la respuesta de una edición (CatalogoStock) antes de pintar", () => {
  const ok = { grupos: [{ clave: "otros", etiqueta: "Otros", sistema: true, tipos: [{ clave: "pc", etiqueta: "PC", sistema: false, cantidad: 4 }] }],
    tipos: [{ clave: "pc", etiqueta: "PC", grupo: "otros" }] };
  assert.equal(api.stockCatalogoValido(ok), true);
  assert.equal(api.stockCatalogoValido({ ...ok, tipos: null }), false);
  const conTipo = (t) => ({ ...ok, grupos: [{ ...ok.grupos[0], tipos: [{ ...ok.grupos[0].tipos[0], ...t }] }] });
  assert.equal(api.stockCatalogoValido(conTipo({ cantidad: "4" })), false);
  assert.equal(api.stockCatalogoValido(conTipo({ cantidad: -1 })), false);
  assert.equal(api.stockCatalogoValido(conTipo({ sistema: 1 })), false);
  assert.equal(api.stockCatalogoValido({ ...ok, grupos: [{ ...ok.grupos[0], etiqueta: null }] }), false);
  assert.equal(api.stockCatalogoValido(null), false);
});

test("catálogo: por qué no se puede borrar o mover (vacío = se puede)", () => {
  const tipo = (o) => ({ clave: "x", etiqueta: "X", sistema: false, cantidad: 0, ...o });
  assert.equal(api.stockMotivoNoBorrarTipo(tipo()), "");
  assert.match(api.stockMotivoNoBorrarTipo(tipo({ cantidad: 72 })), /72 dispositivo/);
  assert.match(api.stockMotivoNoBorrarTipo(tipo({ sistema: true })), /del sistema/);
  assert.equal(api.stockMotivoNoMoverTipo(tipo()), "");
  assert.match(api.stockMotivoNoMoverTipo(tipo({ cantidad: 1 })), /no tiene que tener equipos/);
  assert.match(api.stockMotivoNoMoverTipo(tipo({ sistema: true })), /del sistema/);
  assert.equal(api.stockMotivoNoBorrarGrupo({ sistema: false, tipos: [] }), "");
  assert.equal(api.stockMotivoNoBorrarGrupo({ sistema: false, tipos: [tipo(), tipo()] }), "", "subgrupos vacíos: se borra con ellos");
  assert.match(api.stockMotivoNoBorrarGrupo({ sistema: false, tipos: [tipo(), tipo({ cantidad: 3 })] }), /dispositivos en 1 subgrupo/);
  assert.match(api.stockMotivoNoBorrarGrupo({ sistema: true, tipos: [] }), /del sistema/);
});

// --------------------------------------------------------------------- producción: un equipo, un estado
test("producción: dónde lo ve el monitoreo (cámara con canal y NVR, o el NVR)", () => {
  const camaras = [{ stock: { id: "c1" }, camera_name: "Pasillo", channel_id: "CH12", nvr_name: "NVR-6" }, { stock: null }];
  const nvrs = [{ stock: { id: "n1" }, nvr_name: "NVR-6", ip: "10.0.0.1" }];
  assert.equal(api.stockVistoEn("c1", camaras, nvrs), "cámara «Pasillo» canal 12 del NVR «NVR-6»");
  assert.equal(api.stockVistoEn("n1", camaras, nvrs), "NVR «NVR-6»");
  assert.equal(api.stockVistoEn("otro", camaras, nvrs), "");
  assert.equal(api.stockVistoEn("c1", null, undefined), "");
});

test("producción: aviso del formulario según condición, «Instalado» y el escaneo", () => {
  const instalado = { instalacion: inst() };
  assert.equal(api.stockAvisoProduccion({ instalado: true, condicion: "operativo" }, instalado), null);
  assert.equal(api.stockAvisoProduccion({ instalado: false, condicion: "baja" }, instalado), null);
  const sale = plano(api.stockAvisoProduccion({ instalado: true, condicion: "averiado" }, instalado));
  assert.equal(sale.nivel, "warning");
  assert.match(sale.texto, /sale de producción: un equipo «Averiado»/);
  assert.equal(api.stockAvisoProduccion({ instalado: true, condicion: "revisar" }, null).nivel, "danger");      // alta
  assert.equal(api.stockAvisoProduccion({ instalado: true, condicion: "revisar" }, { instalacion: null }).nivel, "danger");
  const visto = plano(api.stockAvisoProduccion({ instalado: true, condicion: "operativo" }, instalado, "NVR «X»"));
  assert.equal(visto.nivel, "info");
  assert.match(visto.texto, /último escaneo \(NVR «X»\): no se puede borrar/);
  assert.equal(api.stockAvisoProduccion({ instalado: true, condicion: "operativo" }, null, "NVR «X»"), null);  // alta
});

test("producción: después de guardar avisa si salió de producción", () => {
  const antes = { instalacion: inst() };
  assert.deepEqual(plano(api.stockMensajeGuardado(null, {}, {})), { texto: "Dispositivo agregado.", nivel: "success" });
  assert.equal(api.stockMensajeGuardado(antes, { instalacion: inst() }, { instalacion: inst(), condicion: "operativo" }).nivel, "success");
  const salio = plano(api.stockMensajeGuardado(antes, { instalacion: inst() }, { instalacion: null, condicion: "averiado" }));
  assert.equal(salio.nivel, "warning");
  assert.match(salio.texto, /Salió de producción: un equipo «Averiado»/);
  // la retiró el usuario (mandó sin instalación): no hay nada que avisar
  assert.equal(api.stockMensajeGuardado(antes, { instalacion: null }, { instalacion: null, condicion: "operativo" }).nivel, "success");
});

test("stockIconoTipo: por tipo conocido; si no, por el grupo del catálogo (un subgrupo nuevo de Cámaras es cámara)", () => {
  const cat = api.stockCatalogo([
    { clave: "servidores", etiqueta: "Servidores", tipos: [{ clave: "nvr" }, { clave: "grabador_x" }] },
    { clave: "camaras", etiqueta: "Cámaras", tipos: [{ clave: "domo" }, { clave: "fisheye" }] },
    { clave: "otros", etiqueta: "Otros", tipos: [{ clave: "ups" }, { clave: "lector" }] }]);
  assert.equal(api.stockIconoTipo("ups", cat), "bi bi-battery-charging");
  assert.equal(api.stockIconoTipo("nvr", null), "bi bi-hdd-network");
  assert.equal(api.stockIconoTipo("fisheye", cat), "bi bi-camera-video");
  assert.equal(api.stockIconoTipo("grabador_x", cat), "bi bi-hdd-network");
  assert.equal(api.stockIconoTipo("lector", cat), "bi bi-box");             // antes salía una cámara
  assert.equal(api.stockIconoTipo("camara", null), "bi bi-camera-video");   // sin catálogo: grupos del sistema
});

test("stockNombreVisible: descripción de la instalación; si no, marca y modelo; si no, el valor por defecto", () => {
  assert.equal(api.stockNombreVisible(d({ instalacion: inst() })), "ANX C 8vo PASILLO");
  assert.equal(api.stockNombreVisible(d()), "Hikvision DS-2CD");
  assert.equal(api.stockNombreVisible(d({ marca: null, modelo: null })), "Dispositivo");
  assert.equal(api.stockNombreVisible(d({ marca: null, modelo: null }), "x1"), "x1");
});

test("equipo monitoreado de un dispositivo del stock: por el vínculo del servidor (stock.id)", () => {
  const panel = {
    camaras: [{ nvr_ip: "10.0.0.1", channel_id: 3, camera_name: "Entrada", stock: { id: "c1" } }, { nvr_ip: "10.0.0.1", channel_id: 4 }],
    nvrs: [{ ip: "10.0.0.1", nvr_name: "Central", stock: { id: "n1" } }]
  };
  assert.deepEqual(plano(api.stockEquipoMonitoreado({ id: "c1" }, null, panel)), { nvr: "10.0.0.1", canal: "3", nombre: "Entrada" });
  assert.deepEqual(plano(api.stockEquipoMonitoreado({ id: "n1" }, null, panel)), { nvr: "10.0.0.1", canal: "", nombre: "Central" });
  assert.equal(api.stockEquipoMonitoreado({ id: "otro" }, null, panel), null);                 // no lo observa el monitor
  assert.deepEqual(plano(api.stockEquipoMonitoreado(null, panel.camaras[1], panel)), { nvr: "10.0.0.1", canal: "4", nombre: "" });
  assert.equal(api.stockEquipoMonitoreado({ id: "c1" }, null, null), null);
  // equipo de red (decoder, analítica): por su IP, marcado como `equipo`
  const conEquipos = { ...panel, equipos_red: [{ ip: "10.0.9.5", nombre: "Decoder sala", stock: { id: "d1" } }] };
  assert.deepEqual(plano(api.stockEquipoMonitoreado({ id: "d1" }, null, conEquipos)),
    { nvr: "10.0.9.5", canal: "", nombre: "Decoder sala", equipo: true });
  assert.equal(api.stockEquipoMonitoreado({ id: "d2" }, null, conEquipos), null);
});

test("historial: cada línea dice quién hizo el cambio (si lo trae)", () => {
  const e = { cuando: "2026-10-08T05:00:12Z", origen: "manual", campo: "firmware", antes: "V1", despues: "V2" };
  assert.equal(api.stockHistorialLinea({ ...e, usuario: "ana" }), api.stockHistorialTexto(e) + " · por ana");
  for (const usuario of [null, undefined, "", 5]) assert.equal(api.stockHistorialLinea({ ...e, usuario }), api.stockHistorialTexto(e));
});

test("normalización y formateo de dispositivo para Listar (columnas ordenadas)", () => {
  const dev = {
    tipo: "domo",
    marca: "Hikvision",
    modelo: "DS-2CD2143",
    serie: "SN12345",
    mac: "AA:BB:CC:DD:EE:FF",
    patrimonio: "PAT-01",
    firmware: "V5.5.82",
    instalacion: {
      ip: "10.0.0.9",
      descripcion: "Entrada Principal",
      edificio: "Anexo A",
      piso: "2",
      rack: "10",
      puerto: "3"
    }
  };
  const cam = {
    channel_id: "CH 4",
    nvr_name: "NVR-01",
    nvr_ip: "10.0.0.1"
  };
  const norm = api.stockNormalizarDispositivo(dev, cam, tipos);
  assert.equal(norm.ip, "10.0.0.9");
  assert.equal(norm.mac, "AA:BB:CC:DD:EE:FF");
  assert.equal(norm.modelo, "DS-2CD2143");
  assert.equal(norm.patrimonio, "PAT-01");
  assert.equal(norm.tipo, "Domo");
  assert.equal(norm.descripcion, "Entrada Principal");
  assert.equal(norm.serial, "SN12345");
  assert.equal(norm.firmware, "V5.5.82");
  assert.equal(norm.canal, "4");
  assert.equal(norm.grabador, "NVR-01");
  assert.equal(norm.rack, "0010");
  assert.equal(norm.puerto, "3");
  assert.equal(norm.edificio, "Anexo A");
  assert.equal(norm.piso, "2");

  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "firmware"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "canal"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "grabador"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "rack"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "puerto"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "edificio"));
  assert.ok(api.CAMPOS_LISTAR.some((c) => c.id === "piso"));

  // Una sola columna
  assert.equal(api.stockFormatearRegistro(norm, ["ip"]), "10.0.0.9");

  // Tres columnas combinadas con ' - ' incluyendo firmware
  assert.equal(api.stockFormatearRegistro(norm, ["ip", "modelo", "firmware"]),
    "10.0.0.9 - DS-2CD2143 - V5.5.82");

  // Nuevas columnas combinadas
  assert.equal(api.stockFormatearRegistro(norm, ["canal", "grabador", "rack", "puerto"]),
    "4 - NVR-01 - 0010 - 3");

  // Cambio de orden de columnas
  assert.equal(api.stockFormatearRegistro(norm, ["descripcion", "ip", "mac"]),
    "Entrada Principal - 10.0.0.9 - AA:BB:CC:DD:EE:FF");

  // Campo faltante se rellena con '-'
  const sinPat = { ...norm, patrimonio: "" };
  assert.equal(api.stockFormatearRegistro(sinPat, ["ip", "patrimonio", "modelo"]),
    "10.0.0.9 - - - DS-2CD2143");

  // Objeto vacío
  assert.equal(api.stockFormatearRegistro({}, ["ip", "mac"]), "");
});

test("Base de datos: qué cambió, de qué elemento y la URL de cada página", () => {
  const disp = { objeto: "dispositivo", campo: "condicion", antes: "operativo", despues: "revisar", equipo: "domo Hikvision" };
  assert.equal(api.stockHistorialCambio(disp), "Condición: operativo → revisar");
  assert.equal(api.stockHistorialElemento(disp), "domo Hikvision");
  assert.equal(api.stockHistorialElemento({ objeto: "dispositivo", equipo: null }), "Dispositivo (sin datos)");
  assert.equal(api.stockHistorialCambio({ objeto: "catalogo", campo: "edificio.renombrar", antes: "Anexo A", despues: "Anexo B" }),
    "Renombrado: Anexo A → Anexo B");
  assert.equal(api.stockHistorialCambio({ objeto: "catalogo", campo: "piso.alta", despues: "PB" }), "Alta (PB)");
  assert.equal(api.stockHistorialCambio({ objeto: "tipo", campo: "baja", antes: "Lector" }), "Baja (Lector)");
  assert.equal(api.stockHistorialCambio({ objeto: "tipo", campo: "grupo", antes: "otros", despues: "servidores" }),
    "Grupo: otros → servidores");
  assert.equal(api.stockHistorialElemento({ objeto: "catalogo", campo: "piso.alta", clave: "PB" }), "Piso PB");
  assert.equal(api.stockHistorialElemento({ objeto: "tipo", campo: "alta", clave: "lector" }), "Tipo lector");
  assert.equal(api.stockHistorialElemento({ objeto: "catalogo", campo: "migracion_2", clave: "" }), "Base de datos");
  // el texto del modal de un dispositivo no cambió
  assert.equal(api.stockHistorialTexto({ cuando: "2026-10-01T10:00:00Z", campo: "condicion", antes: "operativo",
    despues: "revisar", origen: "scanner" }), "2026-10-01 10:00 · Condición: operativo → revisar [scanner]");
  assert.equal(api.stockHistorialUrl(), "/api/stock/historial");
  assert.equal(api.stockHistorialUrl({ accion: "borrar", q: "  juan  ", offset: 30 }),
    "/api/stock/historial?accion=borrar&q=juan&offset=30");
  assert.equal(api.stockHistorialUrl({ accion: "todo", q: "x".repeat(80), offset: -1 }),
    `/api/stock/historial?q=${"x".repeat(60)}`);                     // lista cerrada, tope y offset válido
  const ok = { cambios: [{ cuando: "t", campo: "alta", accion: "agregar", objeto: "dispositivo" }], siguiente_offset: 30 };
  assert.ok(api.stockHistorialRecienteValido(ok));
  assert.ok(!api.stockHistorialRecienteValido({ ...ok, siguiente_offset: "30" }));
  assert.ok(!api.stockHistorialRecienteValido({ cambios: [{ ...ok.cambios[0], accion: "otra" }], siguiente_offset: null }));
  assert.ok(!api.stockHistorialRecienteValido(null));
});


test("Catálogos: soltar un subgrupo solo mueve uno del catálogo, vacío y a OTRO grupo (nada de lo que traiga el arrastre)", () => {
  const grupos = [
    { clave: "servidores", tipos: [{ clave: "switch", etiqueta: "Switch", cantidad: 0, sistema: false },
      { clave: "nvr", etiqueta: "NVR", cantidad: 2, sistema: true }] },
    { clave: "otros", tipos: [] }];
  assert.deepEqual(plano(api.stockSubgrupoAMover(grupos, "switch", "otros")), { clave: "switch", etiqueta: "Switch" });
  assert.equal(api.stockSubgrupoAMover(grupos, "switch", "servidores"), null);       // ya está en ese grupo
  assert.equal(api.stockSubgrupoAMover(grupos, "nvr", "otros"), null);               // con equipos / de sistema
  for (const ajeno of ["no-existe", "", '{"tipo":"switch","etiqueta":"<img>"}', null, undefined, 5]) {
    assert.equal(api.stockSubgrupoAMover(grupos, ajeno, "otros"), null, String(ajeno));
  }
  assert.equal(api.stockSubgrupoAMover(null, "switch", "otros"), null);
  assert.equal(api.TIPO_ARRASTRE_SUBGRUPO, "application/x-cctv-subgrupo");            // nunca text/plain
});

test("«Sin agrupar»: un solo bloque con todo, en el orden interno de siempre", () => {
  const a = d({ id: "a", tipo: "domo", modelo: "B", instalacion: { descripcion: "Z" } });
  const b = d({ id: "b", tipo: "domo", modelo: "A", instalacion: { descripcion: "Y" } });
  const c = d({ id: "c", tipo: "nvr", modelo: "C" });
  assert.equal(api.STOCK_AGRUPAMIENTOS.get("ninguno"), "Sin agrupar");
  const bloques = api.stockAgruparBloques([a, c, b], "ninguno", new Map());
  assert.equal(bloques.length, 1);
  assert.equal(bloques[0].etiqueta, "Todos");
  assert.deepEqual(plano(bloques[0].items.map(x => x.id)), ["b", "a", "c"]);
  assert.deepEqual(plano(api.stockAgruparBloques([], "ninguno", new Map())), []);
});

test("ordenar la lista por columna: asc y desc, lo vacío siempre al final, y dentro de cada grupo", () => {
  const x = (id, extra) => d({ id, tipo: "domo", ...extra });
  const a = x("a", { modelo: "DS-2", mac: "aa:aa:aa:aa:aa:03", patrimonio: "P10" });
  const b = x("b", { modelo: "DS-10", mac: "aa:aa:aa:aa:aa:01" });                 // sin patrimonio
  const c = x("c", { modelo: "", mac: "aa:aa:aa:aa:aa:02", patrimonio: "P2" });    // sin modelo
  const ids = (col, dir) => plano(api.stockAgruparBloques([a, b, c], "ninguno", new Map(), null,
    api.stockComparadorColumna(col, dir, new Map()))[0].items.map(i => i.id));
  assert.deepEqual([...api.STOCK_COLUMNAS_ORDEN.keys()], ["tipo", "mac", "modelo", "patrimonio", "ubicacion", "comentario"]);
  assert.deepEqual(ids("modelo", "asc"), ["a", "b", "c"], "natural (DS-2 antes que DS-10), el vacío al final");
  assert.deepEqual(ids("modelo", "desc"), ["b", "a", "c"], "invertido, y el vacío sigue al final");
  assert.deepEqual(ids("mac", "asc"), ["b", "c", "a"]);
  assert.deepEqual(ids("patrimonio", "asc"), ["c", "a", "b"]);                       // P2 < P10; sin patrimonio, al final
  assert.equal(api.stockComparadorColumna("inexistente", "asc"), null);
  assert.deepEqual(ids("mac", undefined), ids("mac", "asc"), "sin sentido = ascendente");
});

test("una cámara en varios grabadores se muestra con el grabador más capaz (más canales); empatados, el primero", () => {
  const capacidad = { a: 16, b: 64, c: 64 };
  const de = (c) => capacidad[c.nvr_ip];
  const a = { nvr_ip: "a" }, b = { nvr_ip: "b" }, c = { nvr_ip: "c" };
  assert.equal(api.stockCamaraRepresentante(undefined, a, de), a);
  assert.equal(api.stockCamaraRepresentante(a, b, de), b);          // el de 64 le gana al de 16
  assert.equal(api.stockCamaraRepresentante(b, a, de), b);          // en cualquier orden
  assert.equal(api.stockCamaraRepresentante(b, c, de), b);          // misma capacidad: queda el primero
  assert.equal(api.stockCamaraRepresentante(a, undefined, de), a);
});

test("lo que informó el escaneo (IP y firmware) de un dispositivo visto; «N/A» y similares son sin dato", () => {
  const camaras = [{ stock: { id: "c1" }, ip_address: "10.0.0.5", firmware: "V5.7.1" }, { stock: { id: "c2" }, ip_address: "10.0.0.6", firmware: "N/A" }];
  const nvrs = [{ stock: { id: "n1" }, ip: "10.0.0.1", firmware: "V4.0" }];
  assert.equal(JSON.stringify(api.stockDatosEscaneo("c1", camaras, nvrs)), JSON.stringify({ ip: "10.0.0.5", firmware: "V5.7.1" }));
  assert.equal(JSON.stringify(api.stockDatosEscaneo("c2", camaras, nvrs)), JSON.stringify({ ip: "10.0.0.6", firmware: "" }));
  assert.equal(JSON.stringify(api.stockDatosEscaneo("n1", camaras, nvrs)), JSON.stringify({ ip: "10.0.0.1", firmware: "V4.0" }));
  const nvrSinFirmware = [{ stock: { id: "n2" }, ip: "10.0.0.2", firmware: "N/A" }];
  assert.equal(JSON.stringify(api.stockDatosEscaneo("n2", [], nvrSinFirmware)), JSON.stringify({ ip: "10.0.0.2", firmware: "" }));
  assert.equal(api.stockDatosEscaneo("otro", camaras, nvrs), null);
  assert.equal(api.stockDatosEscaneo("c1", null, undefined), null);
});

test("IP y firmware se bloquean solo si el monitoreo ve el dispositivo y el escaneo informó el dato", () => {
  const esc = { ip: "10.0.0.5", firmware: "V1" };
  assert.equal(api.stockCampoBloqueadoPorEscaneo(true, esc, "10.0.0.5"), true);
  assert.equal(api.stockCampoBloqueadoPorEscaneo(false, esc, "10.0.0.5"), false);     // no lo ve: editable
  assert.equal(api.stockCampoBloqueadoPorEscaneo(true, null, "10.0.0.5"), false);
  assert.equal(api.stockCampoBloqueadoPorEscaneo(true, esc, ""), false);               // el escaneo no informó el dato
});

test("gráfico de disponibilidad de la ficha: solo si se sondea y está en producción", () => {
  const mon = { nvr: "10.0.0.1", canal: "3", nombre: "Entrada" };
  assert.equal(api.stockMuestraGraficoDisponibilidad({ id: "c1", en_uso: true }, mon), true);
  assert.equal(api.stockMuestraGraficoDisponibilidad({ id: "c1", en_uso: false }, mon), false);   // en depósito
  assert.equal(api.stockMuestraGraficoDisponibilidad({ id: "c1", en_uso: true }, null), false);     // no se sondea
  assert.equal(api.stockMuestraGraficoDisponibilidad(null, mon), true);                            // cámara del escaneo, sin ficha
  assert.equal(api.stockMuestraGraficoDisponibilidad(null, null), false);
  assert.equal(api.stockMuestraGraficoDisponibilidad({ id: "c1" }, mon), false);                    // sin dato de uso: no
});

test("stockOrdenColumnas: el orden elegido, sin repetidos ni desconocidas, y lo que falta al final en el de fábrica", () => {
  const fabrica = ["tipo", "mac", "modelo", "patrimonio", "ubicacion", "comentario"];
  const o = (x) => plano(api.stockOrdenColumnas(x));
  assert.deepEqual(o(undefined), fabrica);
  assert.deepEqual(o(""), fabrica);
  assert.deepEqual(o("{no es json"), fabrica);
  assert.deepEqual(o(["comentario", "mac"]), ["comentario", "mac", "tipo", "modelo", "patrimonio", "ubicacion"]);
  assert.deepEqual(o('["modelo","tipo"]'), ["modelo", "tipo", "mac", "patrimonio", "ubicacion", "comentario"]);   // el JSON guardado
  assert.deepEqual(o(["mac", "mac", "precio", "tipo", 3, null]), ["mac", "tipo", "modelo", "patrimonio", "ubicacion", "comentario"]);
  assert.deepEqual(o({ tipo: 1 }), fabrica);
  assert.deepEqual(o([...fabrica].reverse()), [...fabrica].reverse());
});

test("página del modelo: solo http(s) sin credenciales se vuelve enlace", () => {
  assert.equal(api.stockUrlPagina(" https://www.hikvision.com/es/products/x "), "https://www.hikvision.com/es/products/x");
  for (const malo of ["javascript:alert(1)", "data:text/html,x", "ftp://a.com", "https://u:p@a.com", "https://a b.com", "", null, "a.com"]) {
    assert.equal(api.stockUrlPagina(malo), null, String(malo));
  }
});

test("modelo: sugerencias únicas por modelo (forma más usada), de la marca escrita si ya tiene equipos", () => {
  const ds = [d({ marca: "Hikvision", modelo: "DS-2CD2143" }), d({ marca: "Hikvision", modelo: "DS-2CD2143" }),
    d({ marca: "hikvision", modelo: "ds-2cd2143" }), d({ marca: "Hikvision", modelo: " DS-2CD2386 " }),
    d({ marca: "Axis", modelo: "P3245" }), d({ marca: "Axis", modelo: "" })];
  assert.deepEqual(plano(api.stockModelosSugeridos(ds, "HIKVISION")), ["DS-2CD2143", "DS-2CD2386"]);
  assert.deepEqual(plano(api.stockModelosSugeridos(ds, "Axis")), ["P3245"]);
  assert.deepEqual(plano(api.stockModelosSugeridos(ds, "Marca nueva")), ["DS-2CD2143", "DS-2CD2386", "P3245"]);
  assert.deepEqual(plano(api.stockModelosSugeridos(ds)), ["DS-2CD2143", "DS-2CD2386", "P3245"]);
});

test("modelo: avisa de un parecido (mayúsculas, una letra) y no molesta si es igual, corto o distinto", () => {
  const s = ["DS-2CD2143", "P3245", "DS-2CD2386G2-IU"];
  assert.equal(api.stockModeloParecido("DS-2CD2143", s), null);                    // igual: bien
  assert.equal(api.stockModeloParecido("ds-2cd2143", s), "DS-2CD2143");            // solo mayúsculas
  assert.equal(api.stockModeloParecido("  DS-2CD2143 ", s), null);                 // espacios de más: es el mismo
  assert.equal(api.stockModeloParecido("DS-2CD2134", s), "DS-2CD2143");            // dos letras cambiadas (modelo largo)
  assert.equal(api.stockModeloParecido("P3254", s), null);                         // dos letras en un modelo corto: otro
  assert.equal(api.stockModeloParecido("DS-2CD214", s), "DS-2CD2143");             // una letra de menos
  assert.equal(api.stockModeloParecido("DS-2CD2144", s), "DS-2CD2143");            // una letra distinta
  assert.equal(api.stockModeloParecido("DS-2CD2386G2-IV", s), "DS-2CD2386G2-IU");
  assert.equal(api.stockModeloParecido("DS-2CD2386G2-XX", s), "DS-2CD2386G2-IU");  // largo: se toleran dos
  assert.equal(api.stockModeloParecido("P32", s), null);                           // muy corto para comparar
  assert.equal(api.stockModeloParecido("Totalmente otro", s), null);
  assert.equal(api.stockModeloParecido("", s), null);
});
