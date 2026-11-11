// Prueba de humo de las apps portadas al diseño de SGC (docs/PORTE-ESTILO-SGC.md): carga la página REAL de cada una
// (index.html con sus js/css desde el disco, sin servidor) en jsdom y recorre lo básico del esqueleto común y de la app:
// pestañas, buscador, Ajustes, tema, modales y «atrás». Falla si la página tira algún error de JavaScript.
// Usa el jsdom de SGC/tests/e2e (hacer `npm ci` ahí). Uso desde la raíz: node tests/e2e/humo-apps.mjs [SGR|SGI|SGP]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(RAIZ, 'SGC/tests/e2e/package.json'));
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 4000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
        try { if (fn()) return true; } catch { /* reintentar */ }
        await esperar(30);
    }
    return false;
}

let fallos = 0;
function check(app, nombre, ok, extra = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${app}: ${nombre}${extra ? '  -> ' + extra : ''}`);
    if (!ok) fallos++;
}

const ORIGEN = 'http://suite.prueba/';
class Disco extends ResourceLoader {
    fetch(url) {
        const u = new URL(url);
        if (u.origin + '/' !== ORIGEN) return Promise.reject(new Error(`pedido fuera del sitio: ${url}`));
        return fs.promises.readFile(path.join(RAIZ, decodeURIComponent(u.pathname)));
    }
}

async function cargar(app, { ancho = 1280, almacen = {} } = {}) {
    const errores = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errores.push(String(e.message).split('\n')[0]));
    vc.on('error', (...a) => errores.push(`console.error: ${a.map(String).join(' ').split('\n')[0]}`));
    const html = fs.readFileSync(path.join(RAIZ, app, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
        url: `${ORIGEN}${app}/index.html`, runScripts: 'dangerously', resources: new Disco(), pretendToBeVisual: true,
        virtualConsole: vc,
        beforeParse(w) {
            for (const [k, v] of Object.entries(almacen)) w.localStorage.setItem(k, v);
            w.structuredClone = w.structuredClone || structuredClone;
            Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
            w.TextEncoder = w.TextEncoder || TextEncoder;
            w.TextDecoder = w.TextDecoder || TextDecoder;
            w.innerWidth = ancho;
            w.matchMedia = (q) => {
                const max = /max-width:\s*([\d.]+)px/.exec(q), min = /min-width:\s*([\d.]+)px/.exec(q);
                const matches = (max ? ancho <= Number(max[1]) : true) && (min ? ancho >= Number(min[1]) : true) && !/reduce|coarse/.test(q);
                return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
            };
            w.scrollTo = () => {};
            w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
            w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
            w.URL.createObjectURL = () => 'blob:prueba';
            w.URL.revokeObjectURL = () => {};
            w.fetch = () => Promise.reject(new Error('sin red en la prueba'));
            // (jsdom no trae navigator.serviceWorker: el aviso de actualización no registra nada)
        },
    });
    const w = dom.window;
    await new Promise((r) => w.addEventListener('load', r));
    await esperar(150);
    return { w, d: w.document, errores, $: (id) => w.document.getElementById(id) };
}

const clic = (el) => el && el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const visible = (pane) => pane && pane.classList.contains('active');
const abierto = (w, m) => Boolean(m) && w.UI.modal.abierto(m);
function escribir(el, texto) {
    el.value = texto;
    el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
}
function tecla(w, key, opts = {}) {
    w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
}

// ─── Lo común a toda app portada
async function comunes(app, ctx, pestanas) {
    const { w, d, $ } = ctx;
    check(app, 'esqueleto: panel, buscador y pestañas', Boolean($('sidebar-col') && $('global-search') && $('v-pills-tab')));
    check(app, 'versión de la suite visible en Ajustes', /^.+-v\d{6}$/.test(d.querySelector('[data-idr-version]')?.textContent || ''),
        d.querySelector('[data-idr-version]')?.textContent);
    for (const p of pestanas) {
        clic($(`tab-${p}`));
        check(app, `pestaña ${p}: se muestra`, await hasta(() => visible(d.querySelector($(`tab-${p}`).dataset.uiTarget))));
    }
    // tema: el interruptor cambia <html data-tema> y lo guarda para toda la suite
    clic($('tab-ajustes'));
    const antes = d.documentElement.getAttribute('data-tema');
    clic($('btn-theme'));
    const despues = d.documentElement.getAttribute('data-tema');
    check(app, 'Ajustes: modo oscuro cambia el tema de la suite', antes !== despues && w.localStorage.getItem('IDR_dark') === (despues === 'dark' ? '1' : '0'));
    check(app, 'Ajustes: el interruptor refleja el tema', $('btn-theme').getAttribute('aria-checked') === String(despues === 'dark'));
    clic($('btn-theme'));
    clic($('btn-movimiento'));
    check(app, 'Ajustes: reducir animaciones', d.documentElement.getAttribute('data-movimiento') === 'reducido');
    clic($('btn-movimiento'));
}

async function modalBasico(app, ctx, abrirFn, idModal) {
    const { w, $ } = ctx;
    abrirFn();
    const m = $(idModal);
    check(app, `${idModal}: abre`, await hasta(() => abierto(w, m)));
    check(app, `${idModal}: «atrás» guarda una entrada del historial`, w.history.length > 1);
    tecla(w, 'Escape');
    check(app, `${idModal}: Escape lo cierra`, await hasta(() => !abierto(w, m)));
}

// ─── SGR
async function sgr() {
    const app = 'SGR';
    const ctx = await cargar(app);
    const { w, d, $, errores } = ctx;
    await comunes(app, ctx, ['inventario', 'servicio', 'dashboard']);

    // alta de un rack desde Ajustes
    clic($('tab-ajustes'));
    clic($('ajustes-nuevo-rack-btn'));
    check(app, 'Ingreso de rack: abre el modal', await hasta(() => abierto(w, $('modal-rack-nuevo'))));
    $('rack-patrimonio-nuevo').value = '48491';
    $('rack-unidades-nuevo').value = '42';
    $('rack-marca-nuevo').value = 'Fayser';
    clic($('rack-nuevo-guardar-btn'));
    check(app, 'Ingreso de rack: guarda y cierra', await hasta(() => !abierto(w, $('modal-rack-nuevo'))));
    clic($('tab-inventario'));
    check(app, 'Inventario: el rack aparece en la tabla', await hasta(() => /48491/.test($('tabla-inventario').textContent)));

    // búsqueda (y campos del buscador)
    escribir($('global-search'), 'nada-que-coincida');
    check(app, 'buscador: marca la búsqueda activa', $('sidebar-search-container').classList.contains('search-active'));
    check(app, 'buscador: filtra', await hasta(() => !/48491/.test($('tabla-inventario').textContent)));
    clic($('search-clear'));
    check(app, 'buscador: limpiar vuelve a mostrar', await hasta(() => /48491/.test($('tabla-inventario').textContent)));
    clic($('searchFilterBtn'));
    clic(d.querySelector('.search-filter-item[data-field="marca"]'));
    check(app, 'buscador: apagar un campo marca el filtro', $('searchFilterBtn').classList.contains('active-filter'));
    clic(d.querySelector('.search-filter-item[data-field="marca"]'));

    // editar: clic en la fila abre el modal; Escape lo cierra
    await modalBasico(app, ctx, () => clic($('tabla-inventario').querySelector('[data-rack-id]')), 'modal-rack-editar');

    // poner en servicio: modal con el rack disponible
    await modalBasico(app, ctx, () => clic($('ajustes-servicio-btn')), 'modal-rack-servicio');
    // edificios, Gist y restaurar (modales desde Ajustes)
    clic($('tab-ajustes'));
    await modalBasico(app, ctx, () => clic($('ajustes-edificios-btn')), 'modal-edificios');
    await modalBasico(app, ctx, () => clic($('ajustes-gist-main-btn')), 'modal-gist');

    // confirmar sobre otro modal: Escape vuelve al de abajo (MM), no cierra los dos
    clic($('tab-inventario'));
    clic($('tabla-inventario').querySelector('[data-rack-id]'));
    await hasta(() => abierto(w, $('modal-rack-editar')));
    clic($('rack-editar-lock-btn'));
    clic($('rack-editar-eliminar-btn'));
    check(app, 'eliminar: pide confirmación encima del modal', await hasta(() => abierto(w, $('modal-confirmar'))));
    tecla(w, 'Escape');
    check(app, 'confirmar: Escape vuelve al modal de edición', await hasta(() => !abierto(w, $('modal-confirmar')))
        && abierto(w, $('modal-rack-editar')));
    tecla(w, 'Escape');
    await hasta(() => !abierto(w, $('modal-rack-editar')));

    // datos guardados con la clave de siempre
    check(app, 'datos: se guardan en RCK_data', /48491/.test(w.localStorage.getItem('RCK_data') || ''));
    check(app, 'sin errores de JavaScript', errores.length === 0, errores.join(' | '));

    // móvil: la barra de abajo y el buscador por ícono
    const movil = await cargar(app, { ancho: 390 });
    clic(movil.$('btn-buscar-movil'));
    check(app, 'móvil: el ícono abre el buscador', movil.d.documentElement.classList.contains('busqueda-movil-abierta'));
    check(app, 'móvil: sin errores de JavaScript', movil.errores.length === 0, movil.errores.join(' | '));
}

const ESCENARIOS = { SGR: sgr };
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ESCENARIOS);
for (const app of pedidas) {
    if (!ESCENARIOS[app]) { console.log(`FAIL  ${app}: sin escenario`); fallos++; continue; }
    try { await ESCENARIOS[app](); } catch (e) { console.log(`FAIL  ${app}: ${e.stack || e}`); fallos++; }
}
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
