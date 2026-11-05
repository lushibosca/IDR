// Funciones puras de static/produccion.js para no cortar la animación de los acordeones (bloque entre marcadores).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque("produccion.js", "ACORDEON ANIMACION PURO", { String, Number, Math, parseFloat }, ["duracionCssMs", "acordeonRestanteMs", "alturaAnimableAlCerrar", "alturaAnimableAlAbrir"]);

test("duración CSS en s o ms; lo que no se entiende usa el valor por defecto", () => {
  assert.equal(api.duracionCssMs("0.22s"), 220);
  assert.equal(api.duracionCssMs(" 220ms "), 220);
  assert.equal(api.duracionCssMs("1s"), 1000);
  for (const malo of ["", null, undefined, "rapido", "-1s", "0.22"]) assert.equal(api.duracionCssMs(malo), 250, String(malo));
  assert.equal(api.duracionCssMs("x", 100), 100);
});

test("tiempo restante de la animación: nunca negativo; sin marca = 0", () => {
  assert.equal(api.acordeonRestanteMs(1280, 1000), 280);
  assert.equal(api.acordeonRestanteMs(1000, 1500), 0);
  assert.equal(api.acordeonRestanteMs(undefined, 1000), 0);
  assert.equal(api.acordeonRestanteMs(NaN, 1000), 0);
});

test("al cerrar se anima solo lo visible: lo de debajo de la pantalla no, lo de arriba sí (si no, se movería la vista)", () => {
  assert.equal(api.alturaAnimableAlCerrar(3500, 200, 800), 600);      // grupo enorme que empieza a 200 px: solo 600 visibles
  assert.equal(api.alturaAnimableAlCerrar(300, 200, 800), 300);       // grupo chico: entero (como antes)
  assert.equal(api.alturaAnimableAlCerrar(3500, -1000, 800), 1800);   // empieza arriba de la pantalla: se conserva esa parte
  assert.equal(api.alturaAnimableAlCerrar(3500, 900, 800), 0);        // todo por debajo de la pantalla: nada que animar
  assert.equal(api.alturaAnimableAlCerrar(500, NaN, 800), 500);       // sin medida: no se recorta
});

test("al abrir se anima como mucho una ventana de alto", () => {
  assert.equal(api.alturaAnimableAlAbrir(3500, 800), 800);
  assert.equal(api.alturaAnimableAlAbrir(300, 800), 300);
  assert.equal(api.alturaAnimableAlAbrir(-5, 800), 0);
});
