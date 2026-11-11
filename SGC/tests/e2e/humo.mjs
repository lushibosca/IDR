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
        const ruta = decodeURIComponent(u.pathname);
        // lo compartido de la suite (../shared/) vive fuera de SGC
        return fs.promises.readFile(ruta.startsWith('/shared/') ? path.join(RAIZ, '..', ruta) : path.join(RAIZ, ruta));
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
check('cabecera: el ícono de la marca lleva al launcher de la suite', $('menu-config') && d.querySelector('.navbar .brand-launcher')
    && d.querySelector('.navbar .brand-launcher').getAttribute('href') === '../index.html');
// --- tema compartido con la suite (IDR_dark): manda sobre el propio, se escribe al cambiarlo y se sigue en vivo
{
    const tema = () => d.documentElement.getAttribute('data-tema');
    w.localStorage.setItem('IDR_dark', '1'); w.initTheme();
    check('tema: IDR_dark=1 pone SGC en oscuro', tema() === 'dark');
    w.localStorage.setItem('IDR_dark', '0'); w.initTheme();
    check('tema: IDR_dark=0 pone SGC en claro', tema() === 'light');
    $('btn-theme').click();
    check('tema: cambiarlo en SGC lo escribe para toda la suite', tema() === 'dark' && w.localStorage.getItem('IDR_dark') === '1');
    $('btn-theme').click();
    check('tema: y al volver, también', tema() === 'light' && w.localStorage.getItem('IDR_dark') === '0');
    w.localStorage.setItem('IDR_dark', '1');
    w.dispatchEvent(new w.StorageEvent('storage', { key: 'IDR_dark', newValue: '1' }));
    check('tema: un cambio hecho en otra app se sigue en vivo', tema() === 'dark');
    w.localStorage.removeItem('IDR_dark'); w.initTheme();     // nadie eligió: vuelve a lo propio (sgc2/theme)
}
// --- panel lateral plegable y movible (shared/ui/js/panel.js) con las claves de siempre de SGC
{
    const col = $('sidebar-col'), btn = $('btn-toggle-sidebar');
    btn.click();
    check('panel: el botón lo pliega y guarda sgc2/cctv:sidebar_collapsed', col.classList.contains('sidebar-collapsed') && w.localStorage.getItem('sgc2/cctv:sidebar_collapsed') === '1');
    btn.click();
    check('panel: el botón lo vuelve a mostrar', !col.classList.contains('sidebar-collapsed') && w.localStorage.getItem('sgc2/cctv:sidebar_collapsed') === '0');
    const mm0 = w.matchMedia;     // (el humo trae un matchMedia que siempre dice «no»: acá la pantalla es de escritorio)
    w.matchMedia = (q) => ({ ...mm0(q), matches: /min-width:\s*768px/.test(q) });
    btn.focus();
    btn.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    check('panel: Alt+→ lo pasa a la derecha y guarda sgc2/cctv:sidebar_posicion', d.documentElement.getAttribute('data-panel-pos') === 'right' && w.localStorage.getItem('sgc2/cctv:sidebar_posicion') === 'right');
    btn.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 400));
    check('panel: Alt+← lo devuelve a la izquierda', !d.documentElement.hasAttribute('data-panel-pos'));
    w.matchMedia = mm0;
}
check('ajustes: muestra la versión de la suite (SGC-vAAMMDD)', /^SGC-v\d{6}$/.test(($('v-pills-ajustes').querySelector('.ajustes-version') || {}).textContent || ''),
    ($('v-pills-ajustes').querySelector('.ajustes-version') || {}).textContent);
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
    && $('stock-f-asig-grab-0').value === nvr.id && $('stock-f-asig-canal-0').value === '1' && $('stock-f-instalado').checked,
    `${$('stock-f-asig-grab-0') && $('stock-f-asig-grab-0').value} ${$('stock-f-asig-canal-0') && $('stock-f-asig-canal-0').value}`);
const ocupado = [...$('stock-f-asig-canal-0').options].find((o) => o.value === '3');
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

// --- una cámara en dos grabadores (redundancia): todas las asignaciones valen igual
{
    const nvr2 = await api('/api/stock/dispositivos', 'POST', { tipo: 'nvr', modelo: 'NVR-2', canales: 8, mac: 'aa:bb:cc:dd:ee:02',
        instalacion: { descripcion: 'NVR Respaldo', ip: '10.0.0.11' } });
    const redundante = await api('/api/stock/dispositivos', 'POST', { tipo: 'domo', serie: 'R-1',
        instalacion: { descripcion: 'Redundante', asignaciones: [{ grabador: nvr.id, canal: 9 }, { grabador: nvr2.id, canal: 2 }] } });
    check('una cámara en dos grabadores', redundante.instalacion.asignaciones.length === 2, JSON.stringify(redundante.instalacion.asignaciones));
    const v3 = await api('/api/v2/datos');
    check('Producción la muestra en los dos grabadores', v3.camaras.filter((c) => c.camera_name === 'Redundante').map((c) => c.nvr_name).sort().join() === 'NVR Anexo,NVR Respaldo');
    $('v-pills-produccion-tab').click();
    await hasta(() => $('produccion-accordion').textContent.includes('NVR Respaldo'));
    check('la pantalla de Producción la pinta en ambos', ($('produccion-accordion').textContent.match(/Redundante/g) || []).length >= 2);
    // el formulario muestra una fila por grabador y deja agregar otra
    $('v-pills-stock-tab').click();
    await hasta(() => $('stock-accordion').textContent.includes('Redundante'));
    w.eval('StockNucleo').abrirParaCanal(redundante, nvr2.id, 4);
    await hasta(() => $('stockModal').classList.contains('show') && $('stock-f-asig-grab-1'));
    check('el formulario trae sus dos asignaciones (la del canal pedido reemplaza la de ese grabador)',
        $('stock-f-asig-grab-0').value === nvr.id && $('stock-f-asig-grab-1').value === nvr2.id && $('stock-f-asig-canal-1').value === '4',
        `${$('stock-f-asig-grab-0').value} ${$('stock-f-asig-grab-1').value} ${$('stock-f-asig-canal-1').value}`);
    check('un grabador ya elegido no se repite en la otra fila', [...$('stock-f-asig-grab-1').options].find((o) => o.value === nvr.id).disabled);
    w.UI ? w.UI.modal.cerrar($('stockModal')) : null;
    await esperar(300);
    await api(`/api/stock/dispositivos/${redundante.id}?version=${redundante.version}`, 'DELETE');
    await api(`/api/stock/dispositivos/${nvr2.id}?version=${nvr2.version}`, 'DELETE');
}

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

// --- Ajustes > Datos > Borrar todo, por la pantalla (dos toques), con el Gist y la sincronización automática activos
{
    const ID = 'b1b2c3d4e5f60718293a4b5c6d7e8f90', FRASE = 'frase larga de prueba para borrar todo', TOKEN = 'ghp_borrar1234567890abcdefgh';
    let remoto = JSON.stringify(await w.eval('gistCifrar')(w.eval('ApiLocal').exportar(), FRASE));
    let llamadas = 0;
    w.fetch = async (url, op = {}) => {
        llamadas++;
        const ok = (json) => ({ ok: true, status: 200, json: async () => json });
        if (op.method === 'PATCH') { remoto = JSON.parse(op.body).files['sgc2.json'].content; return ok({ id: ID }); }
        return ok({ id: ID, files: { 'sgc2.json': { content: remoto } } });
    };
    w.localStorage.setItem('sgc2/gist_cfg', JSON.stringify({ gistId: ID, auto: true, recordarToken: true, recordarFrase: true }));
    w.localStorage.setItem('sgc2/gist_token', TOKEN);
    w.localStorage.setItem('sgc2/gist_frase', FRASE);
    const antes = (await api('/api/stock')).dispositivos.length;
    $('datos-borrar').click();
    $('datos-borrar').click();
    await esperar(400);
    check('Borrar todo por la pantalla vacía el stock', antes > 0 && (await api('/api/stock')).dispositivos.length === 0);
    await esperar(7000);          // más que la espera de la sincronización automática (5 s)
    const despues = (await api('/api/stock')).dispositivos.length;
    check('Borrar todo: nada lo repone desde el Gist', despues === 0, `${despues} dispositivos; ${llamadas} llamadas al Gist`);
    check('Borrar todo: no queda ID, token ni frase del Gist', !w.localStorage.getItem('sgc2/gist_cfg') && !w.localStorage.getItem('sgc2/gist_token')
        && !w.localStorage.getItem('sgc2/gist_frase') && $('gist-id').value === '' && $('gist-token').value === '' && $('gist-frase').value === '',
        `${w.localStorage.getItem('sgc2/gist_cfg')} / ${$('gist-id').value}`);
    check('Borrar todo: no tocó el Gist (otras PC conservan sus datos)', JSON.parse(await w.eval('gistDescifrar')(JSON.parse(remoto), FRASE)).dispositivos.length === 6);
    // se vuelve a cargar el estado para lo que sigue (exportar/importar/migración)
    w.eval('ApiLocal').importar(await w.eval('gistDescifrar')(JSON.parse(remoto), FRASE));
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

// --- importar un archivo con menos equipos (reemplaza): lo que sale deja lápida para que el Gist lo borre en las otras PC
{
    const completo = JSON.parse(w.eval('ApiLocal').exportar());
    const sale = completo.dispositivos[0].id;
    completo.dispositivos = completo.dispositivos.filter((x) => x.id !== sale && !(x.instalacion && (x.instalacion.asignaciones || []).some((a) => a.grabador === sale)));
    w.eval('ApiLocal').importar(JSON.stringify(completo));
    const guardado = JSON.parse(w.localStorage.getItem('sgc2/datos_v1'));
    check('importar (reemplaza): lo que sale deja lápida', !!guardado.eliminados.dispositivos[sale], Object.keys(guardado.eliminados.dispositivos).join());
}

// --- móvil: Ajustes > Historial abre la ventana con la tarjeta del historial (que vuelve a su lugar al cerrar)
{
    const fila = d.querySelector('[data-ui-target="#modal-historial"]');
    fila.click();
    await hasta(() => $('modal-historial').classList.contains('show'));
    check('historial: la tarjeta se muda a la ventana', !!$('bd-card').closest('#modal-historial'));
    await hasta(() => $('bd-tbody').children.length > 0);
    check('historial: al abrir la ventana lee los cambios del stock', $('bd-tbody').children.length > 0, String($('bd-tbody').children.length));
    $('modal-historial').querySelector('[data-ui-dismiss="modal"]').click();
    await hasta(() => !$('modal-historial').classList.contains('show') && !!$('bd-card').closest('#auditoria-bd'));
    check('historial: al cerrar la tarjeta vuelve a su pestaña', !!$('bd-card').closest('#auditoria-bd'));
}

// --- imagen ampliada: la ventana existe y abre con la foto del modelo (el JS la invocaba y faltaba su HTML)
{
    check('imagen ampliada: existe #snapshotModal', !!$('snapshotModal'));
    w.abrirModalSnapshot({ camera_name: 'Domo 1', channel_id: 3 }, '', 3, { rutaModelo: 'img/devices/DS-1200KL.png', vista: 'modelo' });
    await hasta(() => $('snapshotModal').classList.contains('show'));
    check('imagen ampliada: abre con la foto del modelo y el nombre', $('snapshotModal').classList.contains('show')
        && /DS-1200KL/.test($('snapshot-modal-img').getAttribute('src')) && $('snapshot-modal-nombre').textContent === 'Domo 1'
        && $('snapshot-modal-ch').textContent === 'CH 3', $('snapshot-modal-ch').textContent);
    $('snapshotModal').querySelector('[data-ui-dismiss="modal"]').click();
    await hasta(() => !$('snapshotModal').classList.contains('show'));
}

// --- móvil: el ícono de búsqueda abre y cierra el buscador
{
    const raiz = d.documentElement;
    $('btn-buscar-movil').click();
    check('búsqueda móvil: el ícono abre el buscador', raiz.classList.contains('busqueda-movil-abierta')
        && $('btn-buscar-movil').getAttribute('aria-expanded') === 'true');
    $('global-search').value = 'nvr';
    $('global-search').dispatchEvent(new w.Event('input'));
    $('btn-buscar-movil').click();
    check('búsqueda móvil: cerrada con texto, el ícono lo avisa', !raiz.classList.contains('busqueda-movil-abierta')
        && $('btn-buscar-movil').classList.contains('con-texto'));
    $('global-search').value = '';
    $('global-search').dispatchEvent(new w.Event('input'));
}

await esperar(300);
check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
w.close();
process.exit(fallos ? 1 : 0);
