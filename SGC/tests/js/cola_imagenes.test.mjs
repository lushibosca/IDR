// Cola de imágenes de la API (bloque COLA IMAGENES PURO de static/comun.js): cuándo se empieza a pedir otra captura. Las
// capturas de la vista snapshot de Producción no pueden pedirse todas a la vez (tope de pedidos por sesión).
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const api = cargarBloque("comun.js", "COLA IMAGENES PURO", { Math, Set, Map, WeakSet, WeakMap, Array, Date, setTimeout }, ["uiColaImagenesPaso", "uiRectMasCentrado", "uiColaImagenes"]);
const CFG = { enVuelo: 4, cadaMs: 250 };
const paso = (e) => plano(api.uiColaImagenesPaso({ pendientes: 5, activas: 0, ahora: 1000, ultimoInicio: 0, ...e }, CFG));

test("sin pendientes no hay nada que hacer ni que esperar", () => {
  assert.deepEqual(paso({ pendientes: 0 }), { iniciar: false, esperarMs: null });
  assert.deepEqual(paso({ pendientes: -1 }), { iniciar: false, esperarMs: null });
  assert.deepEqual(paso({ pendientes: undefined }), { iniciar: false, esperarMs: null });
});

test("con lugar y pasado el ritmo se empieza otra", () => {
  assert.deepEqual(paso({}), { iniciar: true, esperarMs: 250 });
  assert.deepEqual(paso({ activas: 3, ultimoInicio: 750 }), { iniciar: true, esperarMs: 250 });     // justo cumplido el intervalo
});

test("el máximo en vuelo manda: no empieza otra y vuelve a mirar al ritmo", () => {
  assert.deepEqual(paso({ activas: 4 }), { iniciar: false, esperarMs: 250 });
  assert.deepEqual(paso({ activas: 9 }), { iniciar: false, esperarMs: 250 });
});

test("antes del ritmo espera lo que falta, no más", () => {
  assert.deepEqual(paso({ ultimoInicio: 900 }), { iniciar: false, esperarMs: 150 });
  assert.deepEqual(paso({ ultimoInicio: 999 }), { iniciar: false, esperarMs: 249 });
  assert.deepEqual(paso({ ultimoInicio: -Infinity }), { iniciar: true, esperarMs: 250 });
});

test("el desplazamiento manda: no se empieza nada hasta que lo que se ve dejó de cambiar `quietoMs`", () => {
  const q = (e) => plano(api.uiColaImagenesPaso({ pendientes: 3, activas: 0, ahora: 1000, ultimoInicio: 0, ultimoCambio: 950, ...e }, { ...CFG, quietoMs: 150 }));
  assert.deepEqual(q({}), { iniciar: false, esperarMs: 100 });               // cambió hace 50 ms: faltan 100
  assert.deepEqual(q({ ultimoCambio: 850 }), { iniciar: true, esperarMs: 250 }); // pasaron justo 150: se puede
  assert.deepEqual(q({ ultimoCambio: 1000 }), { iniciar: false, esperarMs: 150 });
  assert.deepEqual(q({ pendientes: 0 }), { iniciar: false, esperarMs: null });
  assert.deepEqual(plano(api.uiColaImagenesPaso({ pendientes: 3, activas: 0, ahora: 1000, ultimoInicio: 0 }, { ...CFG, quietoMs: 150 })), { iniciar: true, esperarMs: 250 }); // sin cambios registrados
});

test("el rectángulo más cercano al centro de la ventana", () => {
  const r = (top) => ({ top, height: 100 });
  assert.equal(api.uiRectMasCentrado([r(-80), r(380), r(700)], 900), 1);       // el del medio (centro 430 ~ 450)
  assert.equal(api.uiRectMasCentrado([r(0), r(450)], 1000), 1);
  assert.equal(api.uiRectMasCentrado([], 800), -1);
});

// ---- la cola completa con un observador, un reloj y unas imágenes de mentira
function entorno() {
  const t = { ahora: 0, timers: [] };
  const observadores = [];
  class FakeObservador {
    constructor(cb) { this.cb = cb; this.observados = new Set(); observadores.push(this); }
    observe(el) { this.observados.add(el); }
    unobserve(el) { this.observados.delete(el); }
  }
  const programar = (fn, ms) => { const x = { fn, en: t.ahora + ms }; t.timers.push(x); return x; };
  const avanzar = (ms) => {
    const fin = t.ahora + ms;
    for (;;) {
      const sig = t.timers.filter(x => !x.hecho && x.en <= fin).sort((a, b) => a.en - b.en)[0];
      if (!sig) break;
      sig.hecho = true; t.ahora = Math.max(t.ahora, sig.en); sig.fn();
    }
    t.ahora = fin;
  };
  const img = (id, top = 100) => {
    const escuchas = { load: new Set(), error: new Set() };
    const el = { id, isConnected: true, dataset: { captura: `/api/camara/snapshot?c=${id}` }, src: null, quitoSrc: 0, top,
      getBoundingClientRect() { return { top: el.top, height: 100 }; },
      addEventListener(n, f) { escuchas[n].add(f); }, removeEventListener(n, f) { escuchas[n].delete(f); },
      removeAttribute(n) { if (n === 'src') { el.src = null; el.quitoSrc++; } },
      cargar() { [...escuchas.load].forEach(f => f()); }, fallar() { [...escuchas.error].forEach(f => f()); },
      escuchas: () => escuchas.load.size + escuchas.error.size };
    return el;
  };
  const ver = (obs, ...els) => obs.cb(els.map(e => ({ target: e, isIntersecting: true })));
  const ocultar = (obs, ...els) => obs.cb(els.map(e => ({ target: e, isIntersecting: false })));
  return { t, observadores, FakeObservador, programar, avanzar, img, ver, ocultar, ahora: () => t.ahora };
}
const cola = (e, opciones = {}) => api.uiColaImagenes({ enVuelo: 2, cadaMs: 100, quietoMs: 150, esperaMs: 1000, reintentos: 1, ...opciones },
  { Observador: e.FakeObservador, ahora: e.ahora, programar: e.programar, altoVentana: () => 1000 });

test("cola: espera a que el scroll se detenga, pide de a `enVuelo` y empieza por la imagen más cercana al centro", () => {
  const e = entorno(); const c = cola(e);
  const [a, b, d] = [e.img("a", 0), e.img("b", 450), e.img("d", 800)];
  [a, b, d].forEach(i => c.observar(i));
  e.ver(e.observadores[0], a, b, d);
  e.avanzar(100);
  assert.deepEqual([a.src, b.src, d.src], [null, null, null]);               // aún no pasó el tiempo sin cambios
  e.avanzar(100);
  assert.equal(b.src, b.dataset.captura);                                   // la del centro, primero
  assert.equal(a.src === null && d.src === null, true);                     // una por vez (cada 100 ms)
  e.avanzar(100);
  assert.equal(c.estado().enCurso, 2);
  e.avanzar(1000);
  assert.equal(c.estado().enCurso, 2);                                      // el tope: con 2 en vuelo no empieza la tercera
  b.cargar();
  e.avanzar(150);
  assert.equal(c.estado().enCurso, 2);                                      // al cargar una, entra la siguiente
});

test("cola: lo que sale de la vista antes de cargar no se pide, y lo que ya se pedía se cancela para dejarle el lugar a lo que se ve", () => {
  const e = entorno(); const c = cola(e, { enVuelo: 2 });
  const viejas = [e.img("v1", 100), e.img("v2", 200), e.img("v3", 300), e.img("v4", 400)];
  viejas.forEach(i => c.observar(i));
  e.ver(e.observadores[0], ...viejas);
  e.avanzar(400);                                                           // dos pidiéndose, dos esperando
  assert.equal(c.estado().enCurso, 2);
  const enCamino = viejas.filter(i => i.src);
  // scroll rápido: salen de la ventana todas y entran las nuevas
  e.ocultar(e.observadores[0], ...viejas);
  assert.equal(c.estado().enCurso, 0);
  assert.deepEqual(enCamino.map(i => i.quitoSrc), [1, 1]);                  // las que iban en camino se cancelaron
  assert.deepEqual(enCamino.map(i => i.escuchas()), [0, 0]);                // y ya no escuchan nada
  const nuevas = [e.img("n1", 450), e.img("n2", 500)];
  nuevas.forEach(i => c.observar(i));
  e.ver(e.observadores[0], ...nuevas);
  e.avanzar(1000);
  assert.deepEqual(nuevas.map(i => i.src), nuevas.map(i => i.dataset.captura));   // se piden las que se ven
  assert.equal(viejas.every(i => i.src === null), true);                          // las de antes no se vuelven a pedir
  // al volver a verlas, esperan su turno de nuevo
  nuevas.forEach(i => i.cargar());
  e.ver(e.observadores[0], viejas[0]);
  e.avanzar(500);
  assert.equal(viejas[0].src, viejas[0].dataset.captura);
});

test("cola: una cargada no vuelve a pedirse al reaparecer; un error se reintenta tras la espera y luego se da por perdida", () => {
  const e = entorno(); const caidas = []; const cargadas = [];
  const c = cola(e, { alCargar: i => cargadas.push(i.id), alFallar: i => caidas.push(i.id) });
  const ok = e.img("ok"), mala = e.img("mala");
  [ok, mala].forEach(i => c.observar(i));
  e.ver(e.observadores[0], ok, mala);
  e.avanzar(500);
  ok.cargar();
  e.ocultar(e.observadores[0], ok);
  e.ver(e.observadores[0], ok);
  e.avanzar(500);
  assert.deepEqual([cargadas, ok.quitoSrc], [["ok"], 0]);                    // cargada: no se toca
  mala.fallar();                                                            // 1.er error: reintento en esperaMs
  assert.equal(mala.src, null);
  e.avanzar(1500);
  assert.equal(mala.src, mala.dataset.captura);
  mala.fallar();                                                            // 2.º error: ya no hay más reintentos
  e.avanzar(3000);
  assert.deepEqual(caidas, ["mala"]);
  assert.deepEqual([c.estado().enCurso, c.estado().pendientes], [0, 0]);          // y no queda en la cola
});

test("cola: las imágenes que salieron del DOM se descartan; sin IntersectionObserver se piden todas", () => {
  const e = entorno(); const c = cola(e);
  const fuera = e.img("fuera");
  c.observar(fuera);
  e.ver(e.observadores[0], fuera);
  fuera.isConnected = false;
  e.avanzar(1000);
  assert.equal(fuera.src, null);
  assert.equal(c.estado().pendientes, 0);
  const sin = entorno();
  const c2 = api.uiColaImagenes({ enVuelo: 2, cadaMs: 100 }, { Observador: null, ahora: sin.ahora, programar: sin.programar, altoVentana: () => 1000 });
  const [x, y] = [sin.img("x"), sin.img("y")];
  c2.observar(x); c2.observar(y);
  sin.avanzar(300);
  assert.deepEqual([x.src, y.src], [x.dataset.captura, y.dataset.captura]);
});
