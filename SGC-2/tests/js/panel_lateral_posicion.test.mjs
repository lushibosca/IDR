// Ubicación del panel lateral (bloque PANEL LATERAL PURO de static/app.js): posición válida, borde de destino al soltar
// «Ocultar» y ícono del botón según dónde está el panel.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const p = cargarBloque("app.js", "PANEL LATERAL PURO", { Number, Math, Array }, [
  "POSICIONES_PANEL", "posicionPanelValida", "zonaPanelDestino", "iconoTogglePanel", "accionAtajoFlechaCtrl",
  "calcularPestanaRueda", "panelDesborda", "posicionEtiquetaPanel", "posicionFilaPanel",
]);

test("posicionPanelValida: las cuatro, y cualquier otra cosa vuelve a la izquierda", () => {
  for (const pos of ["left", "right", "top", "bottom"]) assert.equal(p.posicionPanelValida(pos), pos);
  for (const raro of [undefined, null, "", "centro", "TOP", 3, {}, "<img>"]) assert.equal(p.posicionPanelValida(raro), "left");
});

test("zonaPanelDestino: el borde más cercano, en proporción de cada lado", () => {
  assert.equal(p.zonaPanelDestino(10, 400, 1400, 900), "left");
  assert.equal(p.zonaPanelDestino(1390, 400, 1400, 900), "right");
  assert.equal(p.zonaPanelDestino(700, 5, 1400, 900), "top");
  assert.equal(p.zonaPanelDestino(700, 895, 1400, 900), "bottom");
  // en proporción de cada lado (no en píxeles)
  assert.equal(p.zonaPanelDestino(100, 100, 1400, 900), "left", "100/1400 = 7 % < 100/900 = 11 %");
  assert.equal(p.zonaPanelDestino(300, 100, 1400, 900), "top", "300/1400 = 21 % > 100/900 = 11 %");
  assert.equal(p.zonaPanelDestino(5, 5, 0, 0), "left", "sin tamaño de ventana: la de fábrica");
});

test("iconoTogglePanel: la flecha apunta hacia donde se esconde el panel y al revés al mostrarlo", () => {
  assert.equal(p.iconoTogglePanel("left", false), "bi-chevron-bar-left");
  assert.equal(p.iconoTogglePanel("left", true), "bi-chevron-bar-right");
  assert.equal(p.iconoTogglePanel("right", false), "bi-chevron-bar-right");
  assert.equal(p.iconoTogglePanel("right", true), "bi-chevron-bar-left");
  assert.equal(p.iconoTogglePanel("top", false), "bi-chevron-bar-up");
  assert.equal(p.iconoTogglePanel("top", true), "bi-chevron-bar-down");
  assert.equal(p.iconoTogglePanel("bottom", false), "bi-chevron-bar-down");
  assert.equal(p.iconoTogglePanel("bottom", true), "bi-chevron-bar-up");
  assert.equal(p.iconoTogglePanel("nada", false), "bi-chevron-bar-left");
});


test("accionAtajoFlechaCtrl: en laterales las pestañas son verticales y buscador/resultados horizontales", () => {
  for (const pos of ["left", "right"]) {
    assert.equal(p.accionAtajoFlechaCtrl("ArrowUp", pos), "pestana-anterior");
    assert.equal(p.accionAtajoFlechaCtrl("ArrowDown", pos), "pestana-siguiente");
    assert.equal(p.accionAtajoFlechaCtrl("ArrowLeft", pos), "buscador");
    assert.equal(p.accionAtajoFlechaCtrl("ArrowRight", pos), "resultados");
  }
});

test("accionAtajoFlechaCtrl: en top y bottom las pestañas son horizontales y buscador/resultados verticales", () => {
  // En top: pestañas izq/der, buscador arriba, resultados abajo
  assert.equal(p.accionAtajoFlechaCtrl("ArrowLeft", "top"), "pestana-anterior");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowRight", "top"), "pestana-siguiente");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowUp", "top"), "buscador");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowDown", "top"), "resultados");

  // En bottom: pestañas izq/der, buscador abajo, resultados arriba
  assert.equal(p.accionAtajoFlechaCtrl("ArrowLeft", "bottom"), "pestana-anterior");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowRight", "bottom"), "pestana-siguiente");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowDown", "bottom"), "buscador");
  assert.equal(p.accionAtajoFlechaCtrl("ArrowUp", "bottom"), "resultados");
});

test("calcularPestanaRueda: delta positivo avanza circularmente, delta negativo retrocede", () => {
  assert.equal(p.calcularPestanaRueda(0, 5, 100), 1);
  assert.equal(p.calcularPestanaRueda(1, 5, 50), 2);
  assert.equal(p.calcularPestanaRueda(4, 5, 100), 0);
  assert.equal(p.calcularPestanaRueda(0, 5, -100), 4);
  assert.equal(p.calcularPestanaRueda(3, 5, -50), 2);
  assert.equal(p.calcularPestanaRueda(-1, 5, 100), 0);
  assert.equal(p.calcularPestanaRueda(-1, 5, -100), 4);
  assert.equal(p.calcularPestanaRueda(0, 0, 100), -1);
  assert.equal(p.calcularPestanaRueda(0, 5, 0), -1);
});

test("panelDesborda: solo si el contenido supera el ancho más la tolerancia; medidas rotas no cuentan", () => {
  assert.equal(p.panelDesborda([{ ancho: 800, contenido: 800 }, { ancho: 500, contenido: 501 }]), false);
  assert.equal(p.panelDesborda([{ ancho: 800, contenido: 800 }, { ancho: 500, contenido: 503 }]), true);
  assert.equal(p.panelDesborda([{ ancho: 500, contenido: 503 }], 5), false);
  assert.equal(p.panelDesborda([null, { ancho: NaN, contenido: 900 }, { ancho: 10 }]), false);
  assert.equal(p.panelDesborda(undefined), false);
  assert.equal(p.panelDesborda([]), false);
});

test("posicionFilaPanel: pegada al botón (a la derecha con el panel a la izquierda, a la izquierda si está a la derecha)", () => {
  const boton = { left: 8, right: 56, top: 120, height: 44 };
  const tam = { width: 120, height: 44 };
  const ventana = { width: 1400, height: 900 };
  assert.deepEqual(plano(p.posicionFilaPanel(boton, tam, ventana, "left")), { left: 56, top: 120 });
  const botonDer = { left: 1344, right: 1392, top: 120, height: 44 };
  assert.deepEqual(plano(p.posicionFilaPanel(botonDer, tam, ventana, "right")), { left: 1224, top: 120 });
});

test("posicionFilaPanel: no se sale de la ventana, y arriba/abajo cae en el popup de siempre", () => {
  const tam = { width: 120, height: 44 };
  const ventana = { width: 1400, height: 900 };
  assert.deepEqual(plano(p.posicionFilaPanel({ left: 1300, right: 1380, top: 880, height: 44 }, tam, ventana, "left")),
    { left: 1276, top: 852 });
  assert.deepEqual(plano(p.posicionFilaPanel({ left: 0, right: 10, top: 0, height: 44 }, tam, ventana, "right")), { left: 4, top: 4 });
  const icono = { left: 600, right: 640, top: 4, bottom: 48, width: 40, height: 44 };
  assert.deepEqual(plano(p.posicionFilaPanel(icono, tam, ventana, "top")), plano(p.posicionEtiquetaPanel(icono, tam, ventana, "top")));
  assert.deepEqual(plano(p.posicionFilaPanel({ left: 8, right: 56, top: 120, height: 44 }, tam, ventana, "rara")),
    { left: 56, top: 120 });                                   // posición inválida = izquierda
});
