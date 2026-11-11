// Recorte del valor «fantasma» que se anima al pasar de cantidad a porcentaje en los modales de detalle (bloque FANTASMA RECORTE
// PURO de static/resumen.js): no debe verse sobre el encabezado ni el pie del modal, ni bajo el encabezado o los totales de la tabla.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { fantasmaRecorte, fantasmaAreaVisible, fantasmaCaja, areaVisibleTabla, valorEntero } = cargarBloque("resumen.js",
  "FANTASMA RECORTE PURO", { Math }, ["fantasmaRecorte", "fantasmaAreaVisible", "fantasmaCaja", "areaVisibleTabla", "valorEntero"]);
const { alturaRellenoPie } = cargarBloque("resumen.js", "PIE TABLA PURO", { Math, Number }, ["alturaRellenoPie"]);
const caja = (top, bottom, left = 0, right = 100) => ({ top, bottom, left, right });

test("un valor dentro de lo visible no se recorta", () => {
  assert.equal(fantasmaRecorte(caja(50, 70, 10, 40), caja(0, 200)), null);
});

test("un valor que asoma por abajo (sobre el pie o los totales) se recorta lo que pasa del borde", () => {
  assert.equal(fantasmaRecorte(caja(190, 210, 10, 40), caja(0, 200)), "inset(0px 0px 10px 0px)");
});

test("un valor que asoma por arriba (bajo el encabezado) se recorta lo que sube del borde", () => {
  assert.equal(fantasmaRecorte(caja(-4, 16, 10, 40), caja(0, 200)), "inset(4px 0px 0px 0px)");
});

test("un valor entero fuera de lo visible no se ve (el recorte pasa su alto)", () => {
  const rect = caja(300, 320, 10, 40);
  const recorte = fantasmaRecorte(rect, caja(0, 200));
  assert.equal(recorte, "inset(0px 0px 120px 0px)");                  // 120 > su alto de 20: no queda nada
  assert.equal(fantasmaRecorte(caja(-50, -30, 10, 40), caja(0, 200)), "inset(50px 0px 0px 0px)");
});

test("de lado también, y sin datos no hay recorte", () => {
  assert.equal(fantasmaRecorte(caja(50, 70, -5, 20), caja(0, 200, 0, 100)), "inset(0px 0px 0px 5px)");
  assert.equal(fantasmaRecorte(caja(50, 70, 90, 120), caja(0, 200, 0, 100)), "inset(0px 20px 0px 0px)");
  assert.equal(fantasmaRecorte(null, caja(0, 200)), null);
  assert.equal(fantasmaRecorte(caja(0, 10), null), null);
});

test("lo visible es el cuerpo del modal sin lo que tapan el encabezado y la fila de totales pegajosos", () => {
  const cuerpo = caja(100, 400, 0, 300);
  assert.deepEqual({ ...fantasmaAreaVisible(cuerpo, caja(100, 140, 0, 300), caja(360, 400, 0, 300)) }, caja(140, 360, 0, 300));
  assert.deepEqual({ ...fantasmaAreaVisible(cuerpo, null, null) }, cuerpo);                     // sin tabla pegajosa
  assert.deepEqual({ ...fantasmaAreaVisible(cuerpo, null, caja(360, 400)) }, caja(100, 360, 0, 300));
  assert.deepEqual({ ...fantasmaAreaVisible(cuerpo, caja(100, 140), null) }, caja(140, 400, 0, 300));   // el valor de la fila de totales
  assert.equal(fantasmaAreaVisible(null, caja(0, 10), null), null);
  // un cabezal más abajo del borde del cuerpo no agranda el área; unos totales más arriba tampoco la agrandan
  assert.equal(fantasmaAreaVisible(cuerpo, caja(0, 50), null).top, 100);
  assert.equal(fantasmaAreaVisible(cuerpo, null, caja(450, 500)).bottom, 400);
});

test("la caja del fantasma: medidas del elemento relativas a su padre, sin contar el borde del padre", () => {
  const r = { top: 130, left: 80, width: 40, height: 18 };
  const pr = { top: 100, left: 50 };
  assert.deepEqual({ ...fantasmaCaja(r, pr, 1, 2) }, { position: "absolute", top: "29px", left: "28px", width: "40px", height: "18px", margin: "0" });
  assert.equal(fantasmaCaja(r, pr).top, "30px");                                  // sin borde
});

test("valor entero: solo se anima lo que se ve completo (no cortado, ni tapado a medias, ni a medio salir de la ventana)", () => {
  const cuerpo = { top: 100, bottom: 400, left: 0, right: 500 };
  const cabecera = { top: 100, bottom: 130, left: 0, right: 500 };
  const totales = { top: 370, bottom: 400, left: 0, right: 500 };
  const ventana = { top: 0, bottom: 600, left: 0, right: 800 };
  const area = areaVisibleTabla(cuerpo, cabecera, totales, ventana);
  assert.deepEqual(JSON.parse(JSON.stringify(area)), { top: 130, bottom: 370, left: 0, right: 500 });
  const valor = (top) => ({ top, bottom: top + 20, left: 200, right: 240 });
  assert.equal(valorEntero(valor(200), area), true);
  assert.equal(valorEntero(valor(130), area), true);        // justo debajo del encabezado
  assert.equal(valorEntero(valor(120), area), false);       // a medias bajo el encabezado
  assert.equal(valorEntero(valor(360), area), false);       // a medias bajo la fila de totales
  assert.equal(valorEntero(valor(500), area), false);       // fuera del cuerpo
  assert.equal(valorEntero(valor(200), null), false);
  // el cuerpo más alto que la ventana: lo que sale de la ventana tampoco se anima
  const chica = areaVisibleTabla({ top: 100, bottom: 700, left: 0, right: 500 }, null, null, { top: 0, bottom: 600, left: 0, right: 800 });
  assert.equal(valorEntero(valor(590), chica), false);
  assert.equal(valorEntero(valor(500), chica), true);
});

test("relleno del pie: lo que sobra del cuerpo; sin sobra (o medidas raras) no hay relleno", () => {
  assert.equal(alturaRellenoPie(500, 320), 180);
  assert.equal(alturaRellenoPie(500.9, 320.2), 180);
  assert.equal(alturaRellenoPie(300, 320), 0);
  assert.equal(alturaRellenoPie(300, 300), 0);
  assert.equal(alturaRellenoPie(NaN, 300), 0);
  assert.equal(alturaRellenoPie(undefined, 300), 0);
});
