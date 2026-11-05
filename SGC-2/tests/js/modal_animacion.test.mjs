// Funciones puras de static/app.js para la animación de apertura estilo Apple en modales.
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("app.js", "MODAL ANIMACION ORIGEN PURO", { Math }, ["calcularOrigenModal", "calcularPosicionPopup"]);

test("calcularOrigenModal: con botón trigger visible calcula origen relativo al diálogo", () => {
  // Trigger en centro (150, 100)
  const triggerRect = { left: 100, top: 80, width: 100, height: 40 };
  // Diálogo centrado en (300, 200)
  const dialogRect = { left: 300, top: 200, width: 500, height: 400 };
  const viewport = { width: 1100, height: 800 };

  const origen = api.calcularOrigenModal(triggerRect, null, dialogRect, viewport);
  // Centro trigger: X = 100 + 50 = 150, Y = 80 + 20 = 100
  // Relativo al diálogo: relX = 150 - 300 = -150, relY = 100 - 200 = -100
  assert.equal(origen, "-150px -100px");
});

test("calcularOrigenModal: con coordenadas de cursor directas", () => {
  const clickCoords = { x: 450, y: 320 };
  const dialogRect = { left: 200, top: 150, width: 600, height: 400 };
  const viewport = { width: 1000, height: 700 };

  const origen = api.calcularOrigenModal(null, clickCoords, dialogRect, viewport);
  // Relativo: relX = 450 - 200 = 250, relY = 320 - 150 = 170
  assert.equal(origen, "250px 170px");
});

test("calcularOrigenModal: sin trigger ni coordenadas hace fallback al centro de la pantalla", () => {
  const dialogRect = { left: 250, top: 150, width: 500, height: 300 };
  const viewport = { width: 1000, height: 600 };

  const origen = api.calcularOrigenModal(null, null, dialogRect, viewport);
  // Centro de pantalla: X = 500, Y = 300
  // Relativo: relX = 500 - 250 = 250, relY = 300 - 150 = 150
  assert.equal(origen, "250px 150px");
});

test("calcularOrigenModal: trigger con tamaño 0 cae a coordenadas o fallback", () => {
  const triggerVacio = { left: 0, top: 0, width: 0, height: 0 };
  const clickCoords = { x: 300, y: 250 };
  const dialogRect = { left: 100, top: 100, width: 400, height: 300 };
  const viewport = { width: 800, height: 600 };

  const origen = api.calcularOrigenModal(triggerVacio, clickCoords, dialogRect, viewport);
  assert.equal(origen, "200px 150px");
});

test("calcularPosicionPopup: con espacio a la derecha y abajo se abre hacia la derecha y abajo", () => {
  const refPoint = { x: 200, y: 150 };
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 1200, height: 800 };

  const pos = api.calcularPosicionPopup(refPoint, popupDim, viewport);
  // offset por defecto 8
  assert.equal(pos.ladoH, "right");
  assert.equal(pos.ladoV, "bottom");
  assert.equal(pos.left, 208);
  assert.equal(pos.top, 158);
  // Origen de transformación relativo al popup: (200 - 208) clamped a 0, (150 - 158) clamped a 0
  assert.equal(pos.transformOrigin, "0px 0px");
});

test("calcularPosicionPopup: cerca del borde derecho se abre hacia la izquierda", () => {
  const refPoint = { x: 1100, y: 200 };
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 1200, height: 800 };

  const pos = api.calcularPosicionPopup(refPoint, popupDim, viewport);
  // No hay espacio a la derecha (1200 - 1108 - 12 = 80 < 270), se abre hacia la izquierda
  assert.equal(pos.ladoH, "left");
  assert.equal(pos.ladoV, "bottom");
  assert.equal(pos.left, 1100 - 8 - 270); // 822
  assert.equal(pos.top, 208);
  // Transform origin en X: 1100 - 822 = 278 -> clamped a popup width 270
  assert.equal(pos.transformOrigin, "270px 0px");
});

test("calcularPosicionPopup: cerca del borde inferior se abre hacia arriba", () => {
  const refPoint = { x: 300, y: 700 };
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 1200, height: 800 };

  const pos = api.calcularPosicionPopup(refPoint, popupDim, viewport);
  // No hay espacio abajo (800 - 708 - 12 = 80 < 300), se abre hacia arriba
  assert.equal(pos.ladoH, "right");
  assert.equal(pos.ladoV, "top");
  assert.equal(pos.left, 308);
  assert.equal(pos.top, 700 - 8 - 300); // 392
  // Transform origin en Y: 700 - 392 = 308 -> clamped a popup height 300
  assert.equal(pos.transformOrigin, "0px 300px");
});

test("calcularPosicionPopup: en esquina inferior derecha se abre hacia arriba y a la izquierda", () => {
  const refPoint = { x: 1150, y: 750 };
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 1200, height: 800 };

  const pos = api.calcularPosicionPopup(refPoint, popupDim, viewport);
  assert.equal(pos.ladoH, "left");
  assert.equal(pos.ladoV, "top");
  assert.equal(pos.left, 1150 - 8 - 270); // 872
  assert.equal(pos.top, 750 - 8 - 300); // 442
  assert.equal(pos.transformOrigin, "270px 300px");
});

test("calcularPosicionPopup: clampea dentro de los márgenes en pantallas ajustadas", () => {
  const refPoint = { x: 150, y: 100 };
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 320, height: 500 };

  const pos = api.calcularPosicionPopup(refPoint, popupDim, viewport, { margin: 10 });
  // En viewport 320 con margin 10, maxLeft = 320 - 270 - 10 = 40
  assert.ok(pos.left >= 10 && pos.left <= 40);
  assert.ok(pos.top >= 10);
  assert.match(pos.transformOrigin, /^\d+px \d+px$/);
});

test("calcularPosicionPopup: con refPoint nulo usa el centro del viewport como fallback", () => {
  const popupDim = { width: 270, height: 300 };
  const viewport = { width: 1000, height: 800 };

  const pos = api.calcularPosicionPopup(null, popupDim, viewport);
  // refX = 500, refY = 400
  assert.equal(pos.left, 508);
  assert.equal(pos.top, 408);
  assert.equal(pos.ladoH, "right");
  assert.equal(pos.ladoV, "bottom");
});

test("calcularPosicionPopup: con ladoV='bottom' preservado y altura aumentada cerca del borde inferior, clampea top hacia arriba manteniendo ladoV='bottom'", () => {
  const refPoint = { x: 300, y: 500 };
  const viewport = { width: 1200, height: 800 };
  // Inicialmente con height 250 cabe abajo (espacioAbajo = 800 - 508 - 12 = 280 >= 250)
  const posInicial = api.calcularPosicionPopup(refPoint, { width: 270, height: 250 }, viewport);
  assert.equal(posInicial.ladoV, "bottom");
  assert.equal(posInicial.top, 508);

  // Al agrandarse a height 350 con ladoV='bottom' preservado, no salta hacia arriba del trigger;
  // se clampea a maxTop (800 - 350 - 12 = 438), desplazándose hacia arriba dentro del espacio libre
  const posAgrandado = api.calcularPosicionPopup(refPoint, { width: 270, height: 350 }, viewport, { ladoV: "bottom" });
  assert.equal(posAgrandado.ladoV, "bottom");
  assert.equal(posAgrandado.top, 438);
  assert.equal(posAgrandado.top + 350, 800 - 12);
});

test("calcularPosicionPopup: con ladoV='top' preservado y altura aumentada cerca del borde superior, clampea top al margen superior manteniendo ladoV='top'", () => {
  const refPoint = { x: 300, y: 150 };
  const viewport = { width: 1200, height: 800 };
  const posAgrandado = api.calcularPosicionPopup(refPoint, { width: 270, height: 350 }, viewport, { ladoV: "top" });
  assert.equal(posAgrandado.ladoV, "top");
  assert.equal(posAgrandado.top, 12);
});

test("calcularPosicionPopup: con ladoH='right' preservado y ancho aumentado cerca del borde derecho, clampea left a la izquierda manteniendo ladoH='right'", () => {
  const refPoint = { x: 900, y: 200 };
  const viewport = { width: 1000, height: 800 };
  const posAgrandado = api.calcularPosicionPopup(refPoint, { width: 270, height: 200 }, viewport, { ladoH: "right" });
  assert.equal(posAgrandado.ladoH, "right");
  assert.equal(posAgrandado.left, 1000 - 270 - 12); // 718
});



