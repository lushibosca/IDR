// Carrusel foto del modelo / captura del canal (uiCarruselImagen y uiRutaCaptura, bloque UI COMUN de static/comun.js):
// lo comparten el popup del dispositivo y el modal del activo. DOM mínimo falso: solo lo que el helper toca.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

class Clases {
  constructor(...c) { this.s = new Set(c); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  toggle(c, f) { const on = f === undefined ? !this.s.has(c) : f; if (on) this.s.add(c); else this.s.delete(c); return on; }
  contains(c) { return this.s.has(c); }
}
const nodo = (...c) => ({ classList: new Clases(...c), style: {}, title: "", src: "", onclick: null, offsetWidth: 0,
  querySelectorAll: () => [], addEventListener() {} });

const precargas = [];
class ImagenFalsa { constructor() { precargas.push(this); } }

const { uiNumeroCanal } = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiNumeroCanal"]);
const { uiCarruselImagen, uiRutaCaptura } = cargarBloque("comun.js", "UI COMUN",
  { String, Boolean, Object, encodeURIComponent, setTimeout, Image: ImagenFalsa, uiNumeroCanal }, ["uiCarruselImagen", "uiRutaCaptura"]);

function armar(opciones = {}) {
  precargas.length = 0;
  const el = { wrapper: nodo(), img: nodo("d-none"), prev: nodo("d-none"), next: nodo("d-none"),
    placeholder: opciones.sinPlaceholder ? null : nodo("d-none") };
  const visibles = [], ampliados = [];
  const carrusel = uiCarruselImagen({ ...el, rutaModelo: "img/devices/M.png", rutaSnapshot: "/api/camara/snapshot?x",
    alVisible: (v) => visibles.push(v), alAmpliar: (vista, hayCaptura) => ampliados.push([vista, hayCaptura]), ...opciones });
  return { ...el, carrusel, visibles, ampliados };
}
const visible = (n) => !n.classList.contains("d-none");

test("ruta de la captura: SGC-2 no tiene capturas, ningún canal tiene una (null)", () => {
  assert.equal(uiRutaCaptura("10.0.0.1", "CH 3"), null);
  assert.equal(uiRutaCaptura("", "3"), null);
});

test("arranca en la foto del modelo; con captura en disco aparece la flecha y pasa a la captura", () => {
  const c = armar();
  assert.equal(c.img.src, "img/devices/M.png");
  assert.ok(!visible(c.next) && !visible(c.prev));
  precargas[0].onload();                                         // hay captura
  assert.ok(visible(c.next) && !visible(c.prev));
  c.next.onclick({ stopPropagation() {} });
  assert.equal(c.img.src, "/api/camara/snapshot?x");
  assert.ok(visible(c.prev) && !visible(c.next) && c.img.classList.contains("popup-disp-img-clickable"));
  c.img.onclick({ stopPropagation() {} });                      // clic en la captura: ampliar
  assert.equal(c.ampliados.length, 1);
  c.prev.onclick({ stopPropagation() {} });
  assert.equal(c.img.src, "img/devices/M.png");
  c.img.onclick({ stopPropagation() {} });                      // la foto del modelo también se amplía
  assert.equal(c.ampliados.length, 2);
  assert.equal(JSON.stringify(c.ampliados), JSON.stringify([["captura", true], ["modelo", true]]));   // cada una con su vista
  c.carrusel.alternar();                                         // la rueda del popup
  assert.equal(c.img.src, "/api/camara/snapshot?x");
});

test("sin captura en disco no hay flechas ni rueda", () => {
  const c = armar();
  precargas[0].onerror();
  c.carrusel.alternar();
  assert.equal(c.img.src, "img/devices/M.png");
  assert.ok(!visible(c.next) && !visible(c.prev));
});

test("modal del activo (sin placeholder): sin foto del modelo muestra la captura; sin ninguna, se oculta", () => {
  const c = armar({ sinPlaceholder: true, rutaModelo: null });
  assert.equal(c.visibles.at(-1), false);
  precargas[0].onload();
  assert.equal(c.img.src, "/api/camara/snapshot?x");
  assert.equal(c.visibles.at(-1), true);
  const d = armar({ sinPlaceholder: true });
  d.img.onerror();                                               // la foto del modelo no está
  assert.equal(d.visibles.at(-1), false);
  precargas[0].onerror();
  assert.equal(d.visibles.at(-1), false);
});

test("popup (con placeholder): sin foto del modelo queda el placeholder y la flecha a la captura", () => {
  const c = armar({ rutaModelo: null });
  assert.ok(visible(c.placeholder) && !visible(c.img));
  precargas[0].onload();
  assert.ok(visible(c.placeholder) && visible(c.next));
});

test("una respuesta de otro equipo (ya no vigente) se ignora", () => {
  let vigente = true;
  const c = armar({ vigente: () => vigente });
  vigente = false;
  precargas[0].onload();
  assert.ok(!visible(c.next));
});
