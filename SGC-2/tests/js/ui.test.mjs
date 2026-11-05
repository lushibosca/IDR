// Funciones puras de static/ui.js (pestañas, modales y desplegables propios; reemplazan al JS de Bootstrap).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const ui = cargarBloque("ui.js", "UI PURO", { Number, Math, String }, [
  "uiDuracionTransicion", "uiIndiceVecino", "uiPosicionDesplegable", "uiDebeCerrarDesplegable", "uiLeerOffset",
  "uiPosicionFlotante", "uiTransformacionRecorrido", "uiReduceMovimiento",
]);

test("uiDuracionTransicion: segundos y milisegundos, primer valor de la lista, inválidos = 0", () => {
  assert.equal(ui.uiDuracionTransicion("0.3s", "0s"), 300);
  assert.equal(ui.uiDuracionTransicion("150ms, 1s", "50ms"), 200);
  assert.equal(ui.uiDuracionTransicion("", ""), 0);
  assert.equal(ui.uiDuracionTransicion("abc", "-1s"), 0);
  assert.equal(ui.uiDuracionTransicion(undefined, null), 0);
});

test("uiIndiceVecino: avanza/retrocede, da la vuelta si es cíclico y si no se queda en el borde", () => {
  assert.equal(ui.uiIndiceVecino(4, 1, true, true), 2);
  assert.equal(ui.uiIndiceVecino(4, 3, true, true), 0);
  assert.equal(ui.uiIndiceVecino(4, 0, false, true), 3);
  assert.equal(ui.uiIndiceVecino(4, 3, true, false), 3);
  assert.equal(ui.uiIndiceVecino(4, 0, false, false), 0);
  assert.equal(ui.uiIndiceVecino(4, -1, true, false), 0);     // ninguno elegido: flecha abajo = el primero
  assert.equal(ui.uiIndiceVecino(4, -1, false, false), 3);
  assert.equal(ui.uiIndiceVecino(0, 0, true, true), -1);
});

const VENTANA = { width: 1000, height: 800 };
const BOTON = { left: 100, top: 100, right: 200, bottom: 130 };

test("uiPosicionDesplegable: abre abajo alineado al inicio, con la distancia pedida", () => {
  const r = ui.uiPosicionDesplegable(BOTON, { width: 180, height: 200 }, VENTANA, { distancia: 8 });
  assert.deepEqual(plano(r), { x: 100, y: 138, lado: "bottom", posicion: "bottom-start" });
});

test("uiPosicionDesplegable: dropdown-menu-end alinea el borde derecho del menú con el del botón", () => {
  const r = ui.uiPosicionDesplegable(BOTON, { width: 80, height: 50 }, VENTANA, { alinear: "end" });
  assert.equal(r.x, 120);
  assert.equal(r.posicion, "bottom-end");
});

test("uiPosicionDesplegable: si abajo no entra y arriba sí, abre arriba", () => {
  const abajo = { left: 100, top: 700, right: 200, bottom: 730 };
  const r = ui.uiPosicionDesplegable(abajo, { width: 180, height: 200 }, VENTANA, { distancia: 8 });
  assert.equal(r.lado, "top");
  assert.equal(r.y, 700 - 8 - 200);
});

test("uiPosicionDesplegable: si no entra en ningún lado, se queda abajo (como antes)", () => {
  const r = ui.uiPosicionDesplegable({ left: 0, top: 300, right: 50, bottom: 330 }, { width: 100, height: 600 }, VENTANA);
  assert.equal(r.lado, "bottom");
});

test("uiPosicionDesplegable: nunca se sale de la ventana en horizontal", () => {
  const derecha = { left: 950, top: 100, right: 990, bottom: 130 };
  assert.equal(ui.uiPosicionDesplegable(derecha, { width: 200, height: 50 }, VENTANA).x, 800);
  const izquierda = { left: 5, top: 100, right: 40, bottom: 130 };
  assert.equal(ui.uiPosicionDesplegable(izquierda, { width: 200, height: 50 }, VENTANA, { alinear: "end" }).x, 0);
});

test("uiDebeCerrarDesplegable: reglas de data-ui-auto-close", () => {
  const c = (autoCierre, enMenu, extra = {}) =>
    ui.uiDebeCerrarDesplegable({ autoCierre, enBoton: false, enMenu, etiqueta: "BUTTON", ...extra });
  assert.equal(c("true", false), true);
  assert.equal(c("true", true), true);
  assert.equal(c("outside", false), true);
  assert.equal(c("outside", true), false);      // el filtro de búsqueda: tildar casillas no lo cierra
  assert.equal(c("inside", false), false);
  assert.equal(c("inside", true), true);
  assert.equal(c("false", false), false);
  assert.equal(c(undefined, false), true);      // ausente o inválido = 'true'
  assert.equal(c("true", false, { enBoton: true }), false);           // su propio botón lo maneja el botón
  assert.equal(c("true", true, { etiqueta: "INPUT" }), false);        // escribir en un campo del menú no lo cierra
  assert.equal(c("true", false, { etiqueta: "INPUT" }), true);        // un campo de afuera sí
  assert.equal(c("true", true, { etiqueta: "UL", enItem: false }), false);   // encabezado, separador o margen del menú: no
  assert.equal(c("true", true, { etiqueta: "I", enItem: true }), true);      // el ícono de un botón sí
  assert.equal(c("true", false, { enItem: false }), true);                  // afuera cierra igual
});

test("uiLeerOffset: 'desplazamiento,distancia'; inválido = [0, 2]", () => {
  assert.deepEqual(plano(ui.uiLeerOffset("0,8")), [0, 8]);
  assert.deepEqual(plano(ui.uiLeerOffset(" 4 , -2 ")), [4, -2]);
  assert.deepEqual(plano(ui.uiLeerOffset("")), [0, 2]);
  assert.deepEqual(plano(ui.uiLeerOffset(null)), [0, 2]);
  assert.deepEqual(plano(ui.uiLeerOffset("8")), [0, 2]);
  assert.deepEqual(plano(ui.uiLeerOffset("a,b")), [0, 2]);
});

test("uiPosicionFlotante: sin posición va abajo a la derecha; la pedida no se sale de la ventana", () => {
  const v = { width: 1000, height: 800 };
  const t = { width: 400, height: 300 };
  assert.deepEqual(plano(ui.uiPosicionFlotante(null, t, v)), { x: 584, y: 484 });
  assert.deepEqual(plano(ui.uiPosicionFlotante({ x: 100, y: 50 }, t, v)), { x: 100, y: 50 });
  assert.deepEqual(plano(ui.uiPosicionFlotante({ x: -50, y: 9999 }, t, v)), { x: 16, y: 484 });
  assert.deepEqual(plano(ui.uiPosicionFlotante({ x: 9999, y: -1 }, t, v)), { x: 584, y: 16 });
  assert.deepEqual(plano(ui.uiPosicionFlotante({ x: NaN, y: 20 }, t, v)), { x: 584, y: 20 });
  assert.deepEqual(plano(ui.uiPosicionFlotante({ x: 0, y: 0 }, { width: 2000, height: 2000 }, v)), { x: 16, y: 16 }, "más grande que la ventana: pegado al borde");
});

test("uiTransformacionRecorrido: traslación y una sola escala (la del ancho) de la caja nueva a la vieja", () => {
  const vieja = { left: 100, top: 50, width: 600, height: 400 };
  const nueva = { left: 500, top: 300, width: 300, height: 220 };
  assert.equal(ui.uiTransformacionRecorrido(vieja, nueva), "translate(-400px, -250px) scale(2)");
  assert.equal(ui.uiTransformacionRecorrido(vieja, { left: 0, top: 0, width: 0, height: 10 }), null);
  assert.equal(ui.uiTransformacionRecorrido(null, nueva), null);
});

test("uiReduceMovimiento: el ajuste de la persona o el del sistema", () => {
  assert.equal(ui.uiReduceMovimiento("reducido", false), true);
  assert.equal(ui.uiReduceMovimiento(null, true), true);
  assert.equal(ui.uiReduceMovimiento(null, false), false);
  assert.equal(ui.uiReduceMovimiento("otro", false), false);      // solo el valor exacto cuenta
});
