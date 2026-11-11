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
    vc.on('jsdomError', (e) => errores.push(String(e.message).split('\n')[0] + (process.env.PILA ? ' ' + String(e.detail && e.detail.stack) : '')));
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
    const secciones = d.querySelectorAll('.ajustes-grilla .ajuste-seccion');
    check(app, 'Ajustes: los apartados se reparten en columnas independientes (como SGC)', d.querySelectorAll('.ajustes-grilla > .ajustes-columna').length >= 2
        && [...secciones].every((x) => x.parentElement.classList.contains('ajustes-columna')), `${d.querySelectorAll('.ajustes-columna').length} columnas`);
    const antes = d.documentElement.getAttribute('data-tema');
    clic($('btn-theme'));
    const despues = d.documentElement.getAttribute('data-tema');
    check(app, 'Ajustes: modo oscuro cambia el tema de la suite', antes !== despues && w.localStorage.getItem('IDR_dark') === (despues === 'dark' ? '1' : '0'));
    check(app, 'Ajustes: el interruptor refleja el tema', $('btn-theme').getAttribute('aria-checked') === String(despues === 'dark'));
    clic($('btn-theme'));
    clic($('btn-movimiento'));
    check(app, 'Ajustes: reducir animaciones', d.documentElement.getAttribute('data-movimiento') === 'reducido');
    clic($('btn-movimiento'));
    await panel(app, ctx);
    await ayuda(app, ctx);
    // aviso (toast): sale con su texto, en el elemento único #toast
    w.mostrarToast('Aviso de prueba', 'success', 1500);
    check(app, 'toast: muestra el aviso', await hasta(() => $('toast').classList.contains('show') && /Aviso de prueba/.test($('toast').textContent)));
}

// Ayuda y atajos (shared/ui/js/ayuda.js + navegacion.js): «?» abre el modal, las tres pestañas se arman con los datos de la app,
// el filtro de atajos funciona, y Ctrl + flechas recorre las pestañas del panel
async function ayuda(app, ctx) {
    const { w, d, $ } = ctx;
    const modal = $('modal-atajos');
    d.body.focus?.();
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    check(app, 'ayuda: «?» abre el modal', await hasta(() => abierto(w, modal)));
    check(app, 'ayuda: Secciones con contenido', $('ayuda-secciones').querySelectorAll('.ayuda-seccion-card').length >= 3);
    check(app, 'ayuda: Búsqueda y comodines con la tabla de operadores', $('ayuda-comodines').querySelectorAll('tr').length >= 7
        && /!ptz/.test($('ayuda-comodines').textContent) && $('ayuda-busqueda-consejos').children.length >= 2);
    check(app, 'ayuda: Atajos con teclas y gestos', $('atajos-lista').querySelectorAll('kbd').length > 5 && $('atajos-lista').querySelector('.atajo-gesto'));
    $('atajos-buscar').value = 'deshacer';
    $('atajos-buscar').dispatchEvent(new w.Event('input', { bubbles: true }));
    check(app, 'ayuda: el filtro deja solo los atajos que coinciden', await hasta(() => {
        const t = $('atajos-lista').textContent; return /Deshacer/.test(t) && !/Ocultar o mostrar el panel/.test(t);
    }));
    tecla(w, 'Escape');
    check(app, 'ayuda: Escape cierra el modal', await hasta(() => !abierto(w, modal)));
    // Ctrl + ↓ recorre las pestañas (panel a la izquierda: las pestañas son verticales)
    clic($('tab-' + [...d.querySelectorAll('#v-pills-tab button[data-tab]')][0].dataset.tab));
    await esperar(80);
    const antes = d.querySelector('#v-pills-tab button.active')?.id;
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, cancelable: true }));
    check(app, 'atajos: Ctrl + ↓ pasa a la pestaña siguiente', await hasta(() => d.querySelector('#v-pills-tab button.active')?.id !== antes));
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, bubbles: true, cancelable: true }));
    check(app, 'atajos: Ctrl + ← lleva al buscador', d.activeElement === $('global-search'));
    $('global-search').blur();
}

// Panel lateral plegable y movible (shared/ui/js/panel.js): el botón pliega, Alt+flecha lo muda de lado, y las dos cosas se
// guardan por dispositivo (con las claves de la app) y se restauran al recargar antes de pintar
async function panel(app, ctx) {
    const { w, d, $ } = ctx;
    const col = $('sidebar-col'), btn = $('btn-toggle-sidebar');
    check(app, 'panel: botón de ocultar presente', Boolean(btn));
    clic(btn);
    check(app, 'panel: el botón lo pliega', col.classList.contains('sidebar-collapsed'));
    const claveCol = Object.keys(w.localStorage).find((k) => /sidebar_collapsed|panel_colapsado/.test(k));
    check(app, 'panel: guarda el plegado', Boolean(claveCol) && w.localStorage.getItem(claveCol) === '1', claveCol);
    clic(btn);
    check(app, 'panel: el botón lo vuelve a mostrar', !col.classList.contains('sidebar-collapsed'));
    btn.focus();
    tecla(w, 'ArrowRight', { altKey: true });
    check(app, 'panel: Alt+→ lo pasa a la derecha', await hasta(() => d.documentElement.getAttribute('data-panel-pos') === 'right'));
    const clavePos = Object.keys(w.localStorage).find((k) => /sidebar_posicion|panel_posicion/.test(k));
    check(app, 'panel: guarda el lugar', Boolean(clavePos) && w.localStorage.getItem(clavePos) === 'right', clavePos);
    btn.focus();
    tecla(w, 'ArrowUp', { altKey: true });
    check(app, 'panel: Alt+↑ lo pasa arriba (dentro de la barra superior)', await hasta(() => d.documentElement.getAttribute('data-panel-pos') === 'top'
        && col.closest('.navbar') !== null));
    btn.focus();
    tecla(w, 'ArrowLeft', { altKey: true });
    check(app, 'panel: Alt+← lo devuelve a la izquierda', await hasta(() => !d.documentElement.hasAttribute('data-panel-pos')));
    // recarga: plegado y lugar se conservan desde el primer cuadro
    const guardado = { [claveCol]: '1', [clavePos]: 'bottom' };
    const otra = await cargar(app, { almacen: guardado });
    check(app, 'panel: recarga con el panel plegado y abajo', otra.d.documentElement.getAttribute('data-panel-pos') === 'bottom'
        && otra.$('sidebar-col').classList.contains('sidebar-collapsed') && otra.errores.length === 0, otra.errores.join(' | '));
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
    escribir($('global-search'), '48491 !48491');
    check(app, 'buscador: la exclusión con ! descarta lo que tiene esa palabra', await hasta(() => !/48491/.test($('tabla-inventario').textContent)));
    escribir($('global-search'), '48491 -zzz');
    check(app, 'buscador: excluir algo que no está deja el resultado', await hasta(() => /48491/.test($('tabla-inventario').textContent)));
    clic($('search-clear'));
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

// ─── SGI
async function sgi() {
    const app = 'SGI';
    const ctx = await cargar(app);
    const { w, $, errores } = ctx;
    await comunes(app, ctx, ['movimientos', 'dashboard']);

    // alta de un material desde Ajustes
    clic($('tab-ajustes'));
    clic($('ajustes-btn-material'));
    check(app, 'Nuevo material: abre el modal', await hasta(() => abierto(w, $('modal-material-nuevo'))));
    $('mat-nombre-nuevo').value = 'Patchcord cat6';
    clic($('mat-nuevo-guardar-btn'));
    check(app, 'Nuevo material: guarda y cierra', await hasta(() => !abierto(w, $('modal-material-nuevo'))));
    clic($('tab-dashboard'));
    check(app, 'Dashboard: el material aparece en la tabla', await hasta(() => /Patchcord cat6/.test($('tabla-materiales').textContent)));

    // búsqueda
    escribir($('global-search'), 'nada-que-coincida');
    check(app, 'buscador: marca la búsqueda activa', $('sidebar-search-container').classList.contains('search-active'));
    check(app, 'buscador: filtra', await hasta(() => !/Patchcord cat6/.test($('tabla-materiales').textContent)));
    clic($('search-clear'));
    check(app, 'buscador: limpiar vuelve a mostrar', await hasta(() => /Patchcord cat6/.test($('tabla-materiales').textContent)));
    escribir($('global-search'), 'patchcord !cat6');
    check(app, 'buscador: la exclusión con ! descarta lo que tiene esa palabra', await hasta(() => !/Patchcord cat6/.test($('tabla-materiales').textContent)));
    escribir($('global-search'), '"patchcord cat6" -zzz');
    check(app, 'buscador: frase exacta con exclusión que no está deja el resultado', await hasta(() => /Patchcord cat6/.test($('tabla-materiales').textContent)));
    clic($('search-clear'));

    // modales: editar (clic en la fila), entrada con su primera línea, y desde Ajustes
    await modalBasico(app, ctx, () => clic($('tabla-materiales').querySelector('[data-mat-id]')), 'modal-material-editar');
    clic($('tab-ajustes'));
    clic($('ajustes-btn-entrada'));
    check(app, 'entrada: abre con una línea de material', await hasta(() => abierto(w, $('modal-entrada'))
        && $('lineas-container-entrada').children.length > 0));
    tecla(w, 'Escape');
    await hasta(() => !abierto(w, $('modal-entrada')));
    await modalBasico(app, ctx, () => clic($('ajustes-btn-categorias')), 'modal-categorias');
    await modalBasico(app, ctx, () => clic($('ajustes-btn-herramientas')), 'modal-herramientas');
    await modalBasico(app, ctx, () => clic($('ajustes-btn-gist')), 'modal-gist');

    // confirmar sobre otro modal: Escape vuelve al de abajo
    clic($('tab-dashboard'));
    clic($('tabla-materiales').querySelector('[data-mat-id]'));
    await hasta(() => abierto(w, $('modal-material-editar')));
    clic($('mat-editar-lock-btn'));
    clic($('mat-editar-eliminar-btn'));
    check(app, 'eliminar: pide confirmación encima del modal', await hasta(() => abierto(w, $('modal-confirmar'))));
    tecla(w, 'Escape');
    check(app, 'confirmar: Escape vuelve al modal de edición', await hasta(() => !abierto(w, $('modal-confirmar')))
        && abierto(w, $('modal-material-editar')));
    tecla(w, 'Escape');
    await hasta(() => !abierto(w, $('modal-material-editar')));

    check(app, 'datos: se guardan en SGI_activos', /Patchcord cat6/.test(w.localStorage.getItem('SGI_activos') || ''));
    check(app, 'sin errores de JavaScript', errores.length === 0, errores.join(' | '));

    const movil = await cargar(app, { ancho: 390 });
    clic(movil.$('btn-buscar-movil'));
    check(app, 'móvil: el ícono abre el buscador', movil.d.documentElement.classList.contains('busqueda-movil-abierta'));
    check(app, 'móvil: sin errores de JavaScript', movil.errores.length === 0, movil.errores.join(' | '));
}

const ESCENARIOS = { SGR: sgr, SGI: sgi };
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ESCENARIOS);
for (const app of pedidas) {
    if (!ESCENARIOS[app]) { console.log(`FAIL  ${app}: sin escenario`); fallos++; continue; }
    try { await ESCENARIOS[app](); } catch (e) { console.log(`FAIL  ${app}: ${e.stack || e}`); fallos++; }
}
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
