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
        Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });   // jsdom no trae WebCrypto (subtle)
        w.TextEncoder = w.TextEncoder || TextEncoder;
        w.TextDecoder = w.TextDecoder || TextDecoder;
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

// --- producción manual: grabador + canal (por la API y por la pantalla)
const cam1 = await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', modelo: 'DS-2CD2123G0-I', serie: 'C-1',
    instalacion: { descripcion: 'Pasillo', ip: '10.0.1.5', edificio: 'Anexo A', piso: 'PB', grabador: nvr.id, canal: 3 } });
check('alta directo en un canal', cam1.instalacion.grabador === nvr.id && cam1.instalacion.canal === 3);
rechazo = null;
try {
    await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', instalacion: { grabador: nvr.id, canal: 3 } });
} catch (e) { rechazo = e; }
check('canal ocupado: 409', rechazo && rechazo.status === 409 && /canal 3 de «NVR Anexo»: ya lo ocupa «Pasillo»/.test(rechazo.message),
    rechazo && rechazo.message);
rechazo = null;
try {
    await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', instalacion: { grabador: nvr.id, canal: 17 } });
} catch (e) { rechazo = e; }
check('canal fuera de la capacidad: 422', rechazo && rechazo.status === 422);
const nvrAhora = (await api('/api/stock')).dispositivos.find((x) => x.id === nvr.id);
rechazo = null;
try {
    await api(`/api/stock/dispositivos/${nvr.id}`, 'PUT', { ...nvrAhora, instalacion: null, version: nvrAhora.version });
} catch (e) { rechazo = e; }
check('grabador con cámaras no sale de producción: 409', rechazo && rechazo.status === 409);
rechazo = null;
try { await api(`/api/stock/dispositivos/${nvr.id}?version=${nvrAhora.version}`, 'DELETE'); } catch (e) { rechazo = e; }
check('grabador con cámaras no se borra: 409', rechazo && rechazo.status === 409);
const v2 = await api('/api/v2/datos');
check('/api/v2/datos trae la cámara en su canal', v2.camaras.length === 1 && v2.camaras[0].channel_id === 3
    && v2.camaras[0].nvr_name === 'NVR Anexo' && v2.camaras[0].stock.id === cam1.id);

$('v-pills-produccion-tab').click();
await hasta(() => $('produccion-accordion').textContent.includes('Pasillo'));
check('Producción muestra la cámara en el canal', $('produccion-accordion').textContent.includes('Pasillo'));
const libre = [...d.querySelectorAll('#produccion-accordion .canal-item-disponible')].find((el) => el.dataset.channelId === '1');
check('Producción muestra los canales libres', !!libre);
libre.click();
await hasta(() => $('asignarCanalModal').classList.contains('show'));
check('canal libre: se abre «Asignar al canal»', $('asignarCanalModal').classList.contains('show'),
    $('asignar-titulo-texto').textContent);
const opcion = [...d.querySelectorAll('#asignar-lista [data-asignar-id]')].find((b) => b.dataset.asignarId === cam.id);
check('la cámara del depósito está entre las opciones (y no el grabador)', !!opcion
    && !d.querySelector(`#asignar-lista [data-asignar-id="${nvr.id}"]`));
opcion.click();
await hasta(() => $('stockModal').classList.contains('show'));
check('elegirla abre su formulario con el grabador y el canal', $('stockModal').classList.contains('show')
    && $('stock-f-grabador').value === nvr.id && $('stock-f-canal').value === '1' && $('stock-f-instalado').checked,
    `${$('stock-f-grabador').value} ${$('stock-f-canal').value}`);
const ocupado = [...$('stock-f-canal').options].find((o) => o.value === '3');
check('el canal ocupado figura deshabilitado con su ocupante', ocupado && ocupado.disabled && /Pasillo/.test(ocupado.textContent));
$('stock-f-descripcion').value = 'Hall';
$('stock-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
await esperar(600);
if ($('stock-form-error') && !$('stock-form-error').classList.contains('d-none')) console.log('error del formulario:', $('stock-form-error').textContent);
const enCanal = (await api('/api/stock')).dispositivos.find((x) => x.id === cam.id);
check('guardar la deja en el CH 1', enCanal.instalacion && enCanal.instalacion.grabador === nvr.id
    && enCanal.instalacion.canal === 1, JSON.stringify(enCanal.instalacion));
await hasta(() => $('produccion-accordion').textContent.includes('Hall'));
check('Producción se actualiza sola', $('produccion-accordion').textContent.includes('Hall'));

// --- Gist cifrado: crear, bajar lo que sube otra PC y que lo subido no se lea sin la frase
{
    const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const TOKEN = 'ghp_prueba1234567890abcdefgh';
    const FRASE = 'frase larga de prueba para el humo';
    let archivo = null, llamadas = [];
    w.fetch = async (url, op = {}) => {
        const u = new URL(url);
        llamadas.push(`${op.method || 'GET'} ${u.pathname}`);
        const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
        if (u.origin !== 'https://api.github.com') return { ok: false, status: 404 };
        if (op.method === 'POST' && u.pathname === '/gists') {
            archivo = JSON.parse(op.body).files['sgc2.json'].content;
            return ok({ id: ID, files: { 'sgc2.json': { content: archivo } } });
        }
        if (u.pathname === `/gists/${ID}` && op.method === 'PATCH') {
            archivo = JSON.parse(op.body).files['sgc2.json'].content;
            return ok({ id: ID });
        }
        if (u.pathname === `/gists/${ID}`) return ok({ id: ID, files: archivo ? { 'sgc2.json': { content: archivo } } : {} });
        return { ok: false, status: 404 };
    };
    $('gist-token').value = TOKEN;
    $('gist-frase').value = FRASE;
    $('gist-crear').click();
    await hasta(() => archivo && /Gist secreto creado/.test($('gist-estado').textContent), 8000);
    check('Gist: se crea y se sube', !!archivo && /Gist secreto creado/.test($('gist-estado').textContent), $('gist-estado').textContent);
    check('Gist: lo subido está cifrado (no se lee el stock)', archivo && !/NVR Anexo|Hikvision|aa:bb/.test(archivo)
        && JSON.parse(archivo).formato === 'sgc2-cifrado');
    check('Gist: el ID queda en el campo', $('gist-id').value === ID);
    await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', modelo: 'LOCAL-EXTRA', serie: 'L-9' });   // cambio local sin subir
    // otra PC agrega un equipo y sube
    const plano = await w.eval('gistDescifrar')(JSON.parse(archivo), FRASE);
    const remoto = JSON.parse(plano);
    remoto.dispositivos.push({ id: 'otra-pc-1', tipo: 'switch', condicion: 'operativo', marca: 'Cisco', modelo: 'C9200', serie: 'SW-1',
        mac: null, patrimonio: null, firmware: null, canales: null, comentario: '', instalacion: null,
        creado: '2026-11-05T11:00:00Z', actualizado: '2026-11-05T11:00:00Z', version: 1 });
    archivo = JSON.stringify(await w.eval('gistCifrar')(JSON.stringify(remoto), FRASE, { sal: JSON.parse(archivo).sal }));
    llamadas = [];
    $('gist-sincronizar').click();
    await hasta(() => /Sincronizado/.test($('gist-estado').textContent), 8000);
    const lista = (await api('/api/stock')).dispositivos;
    check('Gist: baja el equipo de la otra PC y conserva los propios', lista.some((x) => x.serie === 'SW-1') && lista.length === 5,
        $('gist-estado').textContent);
    const remotoFinal = JSON.parse(await w.eval('gistDescifrar')(JSON.parse(archivo), FRASE));
    check('Gist: lo local se subió fusionado', remotoFinal.dispositivos.length === 5 && llamadas.includes(`PATCH /gists/${ID}`),
        llamadas.join(','));
    $('gist-frase').value = 'otra frase larga que no es la correcta';
    $('gist-sincronizar').click();
    await hasta(() => /incorrecta/.test($('gist-estado').textContent), 8000);
    check('Gist: frase equivocada, no toca nada', /incorrecta/.test($('gist-estado').textContent)
        && (await api('/api/stock')).dispositivos.length === 5, $('gist-estado').textContent);
    $('gist-olvidar').click();
    $('gist-id').value = '';
    w.localStorage.removeItem('sgc2/gist_cfg');
}

// --- Parseador de canales: archivo del escáner → vista previa → aplicar
{
    const sinAsignar = await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', modelo: 'PARS', serie: 'P-77', mac: 'aa:bb:cc:00:00:77' });
    const archivoEscaner = JSON.stringify({
        nvrs: [{ ip: '10.0.0.10', nvr_name: 'NVR-A', modelo: 'DS-7616NI-K2', nro_serie: 'X', mac_address: 'AA-BB-CC-DD-EE-01', firmware: 'V4' }],
        camaras: [{ ip_address: '10.0.7.7', camera_name: 'Parseada', mac_address: 'aa:bb:cc:00:00:77', modelo: 'PARS', nro_serie: 'P-77',
            firmware: 'V9', nvr_name: 'NVR-A', channel_id: 5 }] });
    $('pars-abrir-canales').click();
    await hasta(() => $('parseadorModal').classList.contains('show'));
    check('parseador: se abre la ventana', $('parseadorModal').classList.contains('show') && $('pars-aplicar').disabled);
    const entrada = $('pars-archivo');
    Object.defineProperty(entrada, 'files', { configurable: true,
        value: [{ name: 'cctv_online.json', size: archivoEscaner.length, text: async () => archivoEscaner }] });
    entrada.dispatchEvent(new w.Event('change'));
    await hasta(() => /Parseada|Pasillo|se asignar/i.test($('pars-contenido').textContent) && !$('pars-aplicar').disabled);
    check('parseador: la vista previa muestra la cámara en su canal', /CH 5/.test($('pars-contenido').textContent)
        && !$('pars-aplicar').disabled, $('pars-contenido').textContent.slice(0, 200));
    $('pars-aplicar').click();
    await esperar(300);
    const asignada = (await api('/api/stock')).dispositivos.find((x) => x.id === sinAsignar.id);
    check('parseador: aplicar la deja en el CH 5 con descripción e IP', asignada.instalacion && asignada.instalacion.grabador === nvr.id
        && asignada.instalacion.canal === 5 && asignada.instalacion.descripcion === 'Parseada' && asignada.instalacion.ip === '10.0.7.7',
        JSON.stringify(asignada.instalacion));
    const h = await api('/api/stock/historial');
    check('parseador: el historial lo marca como importación', h.cambios.some((c) => c.origen === 'importacion'));
}

// --- exportar, borrar e importar
const exportado = w.eval('ApiLocal').exportar();
w.eval('ApiLocal').borrarTodo();
check('borrar todo vacía el stock', (await api('/api/stock')).dispositivos.length === 0);
const r = w.eval('ApiLocal').importar(exportado);
check('importar lo exportado recupera todo', r.dispositivos === 6 && (await api('/api/stock')).dispositivos.length === 6,
    JSON.stringify(r));
let mal = null;
try { w.eval('ApiLocal').importar('{"formato":"otro"}'); } catch (e) { mal = e; }
check('importar otro formato: se rechaza sin tocar nada', mal && (await api('/api/stock')).dispositivos.length === 6);

// --- Migración desde SGC: ensayo (vista previa) y aplicar uniendo con lo que hay
{
    const sgc = JSON.stringify({
        dispositivos: [{ id: 'sgcn1', tipo: 'nvr', estado: '', mac: 'de:ad:be:ef:00:01', serial: 'SGC-N1', canales: 8, marca: 'Hikvision', modelo: 'DS-X' },
            { id: 'sgcc1', tipo: 'camara', forma: 'domo', estado: '', mac: 'de:ad:be:ef:00:02', serial: 'SGC-C1', modelo: 'CAM' }],
        grabadores: [{ id: 'sgcg1', dispositivoId: 'sgcn1', canales_n: 8, descripcion: 'NVR de SGC', tipo: 'nvr', ip: '10.7.7.1', edificio: 'Anexo A',
            canales_data: [{ canal: 2, dispositivoId: 'sgcc1', descripcion: 'Cámara SGC', ip: '10.7.7.2' },
                { canal: 3, dispositivoId: null, descripcion: 'libre con nombre' }] }],
        otros_prod: [], tiposCustom: {}, edificios: ['Anexo A'] });
    $('mig-abrir').click();
    await hasta(() => $('migrarModal').classList.contains('show'));
    check('migración: se abre la ventana', $('migrarModal').classList.contains('show') && $('mig-aplicar').disabled);
    Object.defineProperty($('mig-archivo'), 'files', { configurable: true,
        value: [{ name: 'sgc.json', size: sgc.length, text: async () => sgc }] });
    $('mig-archivo').dispatchEvent(new w.Event('change'));
    await hasta(() => /Qué entra/.test($('mig-contenido').textContent));
    check('migración: la vista previa cuenta lo que entra y lo que no encontró lugar', /2 dispositivo/.test($('mig-contenido').textContent)
        && /1 cámara\(s\) asignadas/.test($('mig-contenido').textContent) && /sin equipo \(1\)/.test($('mig-contenido').textContent)
        && !$('mig-aplicar').disabled, $('mig-contenido').textContent.slice(0, 300));
    check('migración: el ensayo no escribe', (await api('/api/stock')).dispositivos.length === 6);
    $('mig-aplicar').click();
    await esperar(300);
    const todos = (await api('/api/stock')).dispositivos;
    const camSgc = todos.find((x) => x.id === 'sgcc1');
    check('migración: se unió con lo existente (nada se perdió)', todos.length === 8 && todos.some((x) => x.id === nvr.id), String(todos.length));
    check('migración: la cámara de SGC quedó en su grabador y canal', camSgc && camSgc.tipo === 'domo' && camSgc.instalacion.grabador === 'sgcn1'
        && camSgc.instalacion.canal === 2 && camSgc.instalacion.descripcion === 'Cámara SGC', JSON.stringify(camSgc && camSgc.instalacion));
}

await esperar(300);
check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
w.close();
process.exit(fallos ? 1 : 0);
