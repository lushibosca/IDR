// Prueba de humo: carga la página REAL (index.html y sus js/css desde el disco, sin servidor) en jsdom y recorre el stock
// de punta a punta por la API local (la misma que usa el front): alta, edición, producción, historial, exportar/importar.
// Falla si la página tira algún error de JavaScript. Uso: node tests/e2e/humo.mjs (con `npm ci` hecho en tests/e2e).
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 6000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
        try { if (fn()) return true; } catch { /* reintentar */ }
        await esperar(50);
    }
    return false;
}

const errores = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { errores.push(String(e.message).split('\n')[0]); if (process.env.HUMO_DETALLE) console.log(e.detail && e.detail.stack || e.stack); });
vc.on('error', (...a) => errores.push(`console.error: ${a.map(String).join(' ').split('\n')[0]}`));

// Los archivos se sirven desde el disco bajo un origen http (con file:// jsdom no da localStorage)
const ORIGEN = 'http://sgc2.prueba/';
class Disco extends ResourceLoader {
    fetch(url) {
        const u = new URL(url);
        if (u.origin + '/' !== ORIGEN) return Promise.reject(new Error(`pedido fuera del sitio: ${url}`));
        return fs.promises.readFile(path.join(RAIZ, decodeURIComponent(u.pathname)));
    }
}
const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), {
    url: ORIGEN + 'index.html', runScripts: 'dangerously', resources: new Disco(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
        w.structuredClone = w.structuredClone || structuredClone;
        if (!w.crypto || !w.crypto.getRandomValues) w.crypto = globalThis.crypto;
        w.CSS = w.CSS || { escape: (t) => String(t).replace(/["\\]/g, '\\$&') };
        w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {},
            addListener() {}, removeListener() {} }));
        w.scrollTo = () => {};
        w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
        w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
        w.URL.createObjectURL = () => 'blob:prueba';
        w.URL.revokeObjectURL = () => {};
    },
});
const w = dom.window;
const d = w.document;
const $ = (id) => d.getElementById(id);

let fallos = 0;
function check(nombre, ok, extra = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${nombre}${extra ? '  -> ' + extra : ''}`);
    if (!ok) fallos++;
}
const api = (url, metodo = 'GET', cuerpo) => w.apiFetch(url, metodo === 'GET' ? {} : {
    method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });

await hasta(() => /Última act/.test($('last-update').textContent));
if (errores.length) console.log('ERRORES:', errores);
check('carga: los datos se leyeron (sin servidor)', /Última act/.test($('last-update').textContent), $('last-update').textContent);
check('carga: sin banner de error', $('api-error-alert').classList.contains('d-none'));
check('sin Auditoría ni monitoreo en la página', !$('monitoreo-section') && !$('alertas-section') && !$('logs-sistema'));

// --- alta, edición y producción por la API local (la que usa stock.js)
await api('/api/stock/ubicaciones', 'POST', { objeto: 'edificio', accion: 'agregar', nombre: 'Anexo A' });
await api('/api/stock/ubicaciones', 'POST', { objeto: 'piso', accion: 'agregar', nombre: 'planta baja' });
const nvr = await api('/api/stock/dispositivos', 'POST', { tipo: 'nvr', marca: 'Hikvision', modelo: 'DS-7616NI-K2',
    mac: 'AA-BB-CC-DD-EE-01', canales: 16,
    instalacion: { descripcion: 'NVR Anexo', ip: '10.0.0.10', edificio: 'Anexo A', piso: 'PB' } });
check('alta de un NVR instalado', nvr && nvr.mac === 'aa:bb:cc:dd:ee:01' && nvr.en_uso === true, JSON.stringify(nvr));
let rechazo = null;
try {
    await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', mac: 'aa:bb:cc:dd:ee:01' });
} catch (e) { rechazo = e; }
check('MAC repetida: 409 con el mensaje de la API', rechazo && rechazo.status === 409 && /Datos repetidos/.test(rechazo.message),
    rechazo && rechazo.message);
const cam = await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', marca: 'bosh', modelo: 'X1', serie: 'S-1' });
check('alta en depósito (marca normalizada)', cam.marca === 'Bosch' && cam.disponible === true);
const editada = await api(`/api/stock/dispositivos/${cam.id}`, 'PUT', { ...cam, comentario: 'revisada', version: cam.version });
check('edición con la versión leída', editada.version === 2 && editada.comentario === 'revisada');
rechazo = null;
try {
    await api(`/api/stock/dispositivos/${cam.id}`, 'PUT', { ...cam, comentario: 'otra', version: cam.version });
} catch (e) { rechazo = e; }
check('edición con versión vieja: 409', rechazo && rechazo.status === 409);

const datos = await api('/api/v2/datos');
check('/api/v2/datos arma los grabadores instalados', datos.nvrs.length === 1 && datos.nvrs[0].nvr_name === 'NVR Anexo');

// --- la pestaña Activos y Producción pintan lo cargado
await hasta(() => !/Actualizando/.test($('last-update').textContent));
$('v-pills-stock-tab').click();
await hasta(() => $('stock-accordion') && $('stock-accordion').textContent.includes('NVR Anexo'));
check('Activos muestra el NVR', $('stock-accordion') && $('stock-accordion').textContent.includes('NVR Anexo'));
$('v-pills-produccion-tab').click();
await hasta(() => $('produccion-accordion').textContent.includes('NVR Anexo'));
check('Producción muestra el grabador', $('produccion-accordion').textContent.includes('NVR Anexo'));
$('v-pills-auditoria-tab').click();
await hasta(() => $('bd-resultado') && $('bd-resultado').textContent.includes('alta'), 2000);
const hist = await api('/api/stock/historial');
check('historial con las altas y la edición', hist.cambios.length >= 4, String(hist.cambios.length));

// --- exportar, borrar e importar
const exportado = w.eval('ApiLocal').exportar();
w.eval('ApiLocal').borrarTodo();
check('borrar todo vacía el stock', (await api('/api/stock')).dispositivos.length === 0);
const r = w.eval('ApiLocal').importar(exportado);
check('importar lo exportado recupera todo', r.dispositivos === 2 && (await api('/api/stock')).dispositivos.length === 2,
    JSON.stringify(r));
let mal = null;
try { w.eval('ApiLocal').importar('{"formato":"otro"}'); } catch (e) { mal = e; }
check('importar otro formato: se rechaza sin tocar nada', mal && (await api('/api/stock')).dispositivos.length === 2);

await esperar(300);
check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
w.close();
process.exit(fallos ? 1 : 0);
