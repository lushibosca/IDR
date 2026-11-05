// Pruebas unitarias para alternarBannerMutacion y animarMutacion
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(aqui, "../../js/animaciones.js"), "utf8");

// Extraer el bloque de animación de mutación
const match = appSrc.match(/const DUR_ANIM_MS[\s\S]*?window\.alternarBannerMutacion = alternarBannerMutacion;/);
assert.ok(match, "no se encontró el bloque de animarMutacion / alternarBannerMutacion");

function crearElementoFalso(clasesIniciales = []) {
  const lista = new Set(clasesIniciales);
  const listeners = {};
  const el = {
    offsetWidth: 100,
    offsetParent: {},
    firstElementChild: {},
    style: {},
    parentNode: null,
    getBoundingClientRect() { return { top: 10, left: 10, width: 200, height: 100 }; },
    cloneNode() {
      const c = crearElementoFalso([...lista]);
      c.style = {};
      return c;
    },
    removeAttribute() {},
    querySelectorAll() { return []; },
    setAttribute() {},
    remove() {
      if (this.parentNode && this.parentNode.children) {
        this.parentNode.children = this.parentNode.children.filter(x => x !== this);
      }
    },
    classList: {
      add(...c) { c.forEach(x => lista.add(x)); },
      remove(...c) { c.forEach(x => lista.delete(x)); },
      contains(c) { return lista.has(c); },
      toggle(c, force) {
        if (force === undefined) force = !lista.has(c);
        if (force) lista.add(c); else lista.delete(c);
        return force;
      }
    },
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispararAnimationEnd(animName = "mutacionEntrada") {
      const fns = (listeners["animationend"] || []).slice();
      fns.forEach(fn => fn({ target: this, animationName: animName }));
    }
  };
  const parent = {
    children: [el],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    removeChild(child) {
      child.parentNode = null;
      this.children = this.children.filter(x => x !== child);
    }
  };
  el.parentNode = parent;
  return el;
}

function inicializarEntorno() {
  const windowObj = {};
  const ctx = {
    window: windowObj,
    document: { documentElement: {} },
    setTimeout,
    clearTimeout,
    WeakMap,
    uiMovimientoReducido: () => false,                   // de ui.js: sin preferencia de menos movimiento
    getComputedStyle: () => ({ getPropertyValue: () => "150ms" })
  };
  vm.createContext(ctx);
  vm.runInContext(match[0], ctx);
  return {
    animarMutacion: ctx.window.animarMutacion,
    alternarBannerMutacion: ctx.window.alternarBannerMutacion,
    mutarContenido: ctx.window.mutarContenido,
    ocultarContenido: ctx.window.ocultarContenido,
    animarAlturaDe: ctx.window.animarAlturaDe,
    esperarPanelVisible: ctx.window.esperarPanelVisible,
    mostrarResultadoConsulta: ctx.window.mostrarResultadoConsulta,
    origenMutacionY: ctx.origenMutacionY,
    cancelarMutacion: ctx.cancelarMutacion
  };
}

test("alternarBannerMutacion: muestra un elemento oculto con d-none", () => {
  const { alternarBannerMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["alert", "d-none"]);

  alternarBannerMutacion(el, true);
  assert.equal(el.classList.contains("d-none"), false);
  assert.equal(el.classList.contains("mutacion-entrante"), true);

  el.dispararAnimationEnd("mutacionEntrada");
  assert.equal(el.classList.contains("mutacion-entrante"), false);
  assert.equal(el.classList.contains("d-none"), false);
});

test("alternarBannerMutacion: si ya está visible, no re-anima (idempotente)", () => {
  const { alternarBannerMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["alert"]); // ya visible (sin d-none)

  alternarBannerMutacion(el, true);
  // No debe agregar mutacion-entrante porque ya estaba visible
  assert.equal(el.classList.contains("mutacion-entrante"), false);
  assert.equal(el.classList.contains("d-none"), false);
});

test("alternarBannerMutacion: oculta un elemento visible con animación de salida", () => {
  const { alternarBannerMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["alert"]);

  let callbackLlamado = false;
  alternarBannerMutacion(el, false, () => { callbackLlamado = true; });
  assert.equal(el.classList.contains("mutacion-saliente"), true);
  assert.equal(el.classList.contains("d-none"), false);

  el.dispararAnimationEnd("mutacionSalida");
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("d-none"), true);
  assert.equal(callbackLlamado, true);
});

test("alternarBannerMutacion: si ya está oculto, no re-anima", () => {
  const { alternarBannerMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["alert", "d-none"]);

  alternarBannerMutacion(el, false);
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("d-none"), true);
});

test("alternarBannerMutacion: transición inversa cancela salida y anima entrada", () => {
  const { alternarBannerMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["alert"]);

  // Comienza a salir
  alternarBannerMutacion(el, false);
  assert.equal(el.classList.contains("mutacion-saliente"), true);

  // Vuelve a entrar antes de finalizar la salida
  alternarBannerMutacion(el, true);
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("mutacion-entrante"), true);
  assert.equal(el.classList.contains("d-none"), false);
});

test("mutarContenido: secuencial como el resto (sale, recién entonces cambia el DOM, y entra); sin clones", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["accordion"]);

  let domActualizado = false;
  let finLlamado = false;
  mutarContenido(el, () => { domActualizado = true; }, () => { finLlamado = true; });

  // 1. Sale el contenido actual; el DOM nuevo todavía no se aplicó
  assert.equal(el.classList.contains("mutacion-saliente"), true);
  assert.equal(domActualizado, false);
  assert.equal(el.parentNode.children.length, 1, "no debe clonar el contenedor");

  // 2. Terminada la salida: se aplica el DOM y entra
  el.dispararAnimationEnd("mutacionSalida");
  assert.equal(domActualizado, true);
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("mutacion-entrante"), true);
  assert.equal(finLlamado, false);

  // 3. Terminada la entrada: se limpia y se avisa
  el.dispararAnimationEnd("mutacionEntrada");
  assert.equal(el.classList.contains("mutacion-entrante"), false);
  assert.equal(el.style.transformOrigin, "");
  assert.equal(finLlamado, true);
});

test("mutarContenido: si el elemento no está visible, actualiza el DOM inmediatamente sin animación", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["accordion", "d-none"]);

  let domActualizado = false;
  mutarContenido(el, () => { domActualizado = true; });

  assert.equal(domActualizado, true);
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("mutacion-entrante"), false);
  assert.equal(el.parentNode.children.length, 1);
});

test("mutarContenido: oculto que el DOM nuevo muestra entra con la animación estándar", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["panel", "d-none"]);
  mutarContenido(el, () => { el.classList.remove("d-none"); });
  assert.equal(el.classList.contains("mutacion-saliente"), false);
  assert.equal(el.classList.contains("mutacion-entrante"), true);
});

test("mutarContenido: con animar=false aplica al instante", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["accordion"]);
  let dom = 0;
  mutarContenido(el, () => { dom++; }, null, null, false);
  assert.equal(dom, 1);
  assert.equal(el.classList.contains("mutacion-saliente"), false);
});

test("mutarContenido: con getElEntrada sale elSalida y entra elEntrada", () => {
  const { mutarContenido } = inicializarEntorno();
  const elSalida = crearElementoFalso(["acordeon"]);
  const elEntrada = crearElementoFalso(["vacio"]);

  let domActualizado = false;
  let finLlamado = false;
  mutarContenido(elSalida, () => { domActualizado = true; }, () => { finLlamado = true; }, () => elEntrada);

  assert.equal(elSalida.classList.contains("mutacion-saliente"), true);
  assert.equal(domActualizado, false);
  elSalida.dispararAnimationEnd("mutacionSalida");
  assert.equal(domActualizado, true);
  assert.equal(elEntrada.classList.contains("mutacion-entrante"), true);
  elEntrada.dispararAnimationEnd("mutacionEntrada");
  assert.equal(finLlamado, true);
});

test("mutarContenido: un repintado durante la salida no pisa el DOM: reemplaza al pendiente (vale el último)", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["accordion"]);
  const aplicados = [];
  mutarContenido(el, () => aplicados.push("vista"));
  mutarContenido(el, () => aplicados.push("refresco"), null, null, false);   // llega /api/v2/datos
  mutarContenido(el, () => aplicados.push("vista2"));                        // otro clic
  assert.deepEqual(aplicados, []);
  el.dispararAnimationEnd("mutacionSalida");
  assert.deepEqual(aplicados, ["vista2"]);
});

test("mutarContenido: una salida cancelada no traba los repintados siguientes", () => {
  const { mutarContenido, cancelarMutacion } = inicializarEntorno();
  const el = crearElementoFalso(["accordion"]);
  const aplicados = [];
  mutarContenido(el, () => aplicados.push("viejo"));
  cancelarMutacion(el);
  mutarContenido(el, () => aplicados.push("nuevo"), null, null, false);
  assert.deepEqual(aplicados, ["nuevo"]);
});

test("mutarContenido: congela la altura del contenedor durante la salida y la recorta con clip", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["accordion"]);
  const contenedor = crearElementoFalso(["pane"]);
  contenedor.getBoundingClientRect = () => ({ top: 0, bottom: 300, height: 300 });
  el.parentElement = contenedor;
  mutarContenido(el, () => {});
  assert.equal(contenedor.style.height, "300px");
  assert.equal(contenedor.style.overflow, "clip");
  el.dispararAnimationEnd("mutacionSalida");
  assert.match(contenedor.style.transition, /height/);
});

test("mutarContenido: al mostrar un panel oculto anima la expansión de su tarjeta padre", () => {
  const { mutarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["panel", "d-none"]);
  const card = crearElementoFalso(["card"]);
  card.getBoundingClientRect = () => ({ top: 0, bottom: el.classList.contains("d-none") ? 120 : 540,
    height: el.classList.contains("d-none") ? 120 : 540 });
  el.parentElement = card;
  mutarContenido(el, () => { el.classList.remove("d-none"); });
  assert.equal(el.classList.contains("mutacion-entrante"), true);
  assert.match(card.style.transition, /height/);
  assert.equal(card.style.height, "540px");
  assert.equal(card.style.overflow, "clip");
});

test("ocultarContenido: contrae la altura de la tarjeta padre y anima la salida en simultáneo", () => {
  const { ocultarContenido } = inicializarEntorno();
  const el = crearElementoFalso(["panel"]);
  const card = crearElementoFalso(["card"]);
  card.getBoundingClientRect = () => ({ top: 0, bottom: el.classList.contains("d-none") ? 120 : 540,
    height: el.classList.contains("d-none") ? 120 : 540 });
  el.parentElement = card;
  ocultarContenido(el, () => { el.classList.add("d-none"); });
  assert.equal(el.classList.contains("mutacion-saliente"), true);
  assert.equal(el.classList.contains("d-none"), false, "sigue visible mientras anima la salida");
  assert.match(card.style.transition, /height/);
  assert.equal(card.style.height, "120px");
  el.dispararAnimationEnd("mutacionSalida");
  assert.equal(el.classList.contains("d-none"), true);
});

test("origenMutacionY: escala desde el centro de la parte visible, no desde el borde superior", () => {
  const { origenMutacionY } = inicializarEntorno();
  assert.equal(origenMutacionY(100, 500, 800), 200);      // entero a la vista: su centro
  assert.equal(origenMutacionY(-2000, 3000, 800), 2400);  // scrolleado: centro de la ventana (y=400) visto desde el borde
  assert.equal(origenMutacionY(-50, 300, 800), 200);      // cortado arriba: centro de 0..300 visto desde -50
  assert.equal(origenMutacionY(900, 1500, 800), 0);       // fuera de la vista
});

test("animarAlturaDe: repinta y la tarjeta va de su alto actual al del contenido nuevo", () => {
  const { animarAlturaDe } = inicializarEntorno();
  const card = crearElementoFalso(["card"]);
  let filas = 3;
  card.getBoundingClientRect = () => ({ top: 0, bottom: filas * 40, height: filas * 40 });
  animarAlturaDe(card, () => { filas = 10; });
  assert.equal(filas, 10);
  assert.match(card.style.transition, /height/);
  assert.equal(card.style.height, "400px");
  assert.equal(card.style.overflow, "clip");
});

test("animarAlturaDe: tarjeta oculta o sin tarjeta = repintado directo, sin tocar alturas", () => {
  const { animarAlturaDe } = inicializarEntorno();
  const card = crearElementoFalso(["card", "d-none"]);
  let llamado = 0;
  animarAlturaDe(card, () => { llamado++; });
  animarAlturaDe(null, () => { llamado++; });
  assert.equal(llamado, 2);
  assert.equal(card.style.height, undefined);
});

test("mostrarResultadoConsulta: espera a que la subpestaña termine de entrar antes de pintar", async () => {
  const { mostrarResultadoConsulta } = inicializarEntorno();
  const el = crearElementoFalso(["panel", "d-none"]);
  const card = crearElementoFalso(["card"]);
  el.parentElement = card;
  const pane = crearElementoFalso(["tab-pane", "active"]);
  pane.style.display = "none";                      // deslizamiento de subpestañas en curso
  const oyentes = new Map();
  pane.addEventListener = (tipo, fn) => oyentes.set(tipo, fn);
  el.closest = (sel) => (sel === ".tab-pane" ? pane : null);
  let pintado = false;
  const promesa = mostrarResultadoConsulta(el, () => { pintado = true; el.classList.remove("d-none"); });
  await Promise.resolve();
  assert.equal(pintado, false, "no pinta mientras la subpestaña está oculta");
  pane.style.display = "";
  oyentes.get("ui:slide-subtab-fin")();             // el deslizamiento avisa que terminó
  await promesa;
  assert.equal(pintado, true);
});
