'use strict';
// API local de SGC-2: responde en el navegador las rutas que antes respondía el servidor de cctv_monitor (/api/stock*,
// /api/v2/datos), con la MISMA forma, sobre el JSON guardado en localStorage. Así el front (stock.js, produccion.js,
// resumen.js...) no cambia: `apiFetch` (comun.js) le pasa cada pedido a `ApiLocal.pedir`.
// Las reglas son las de js/datos-puro.js. Cada escritura trabaja sobre una COPIA y solo se guarda si todo salió bien
// (como una transacción); después se avisa con el evento `sgc:datos-cambiados` (y en las otras pestañas, por `storage`).

const ApiLocal = (() => {
    const CLAVE = 'sgc2/datos_v1';             // el mismo prefijo que `storage` (comun.js)
    const MAX_CUERPO = 64 * 1024;                 // como web/security.py: 413 si se pasa
    const MAX_ARCHIVO = 8 * 1024 * 1024;          // importar
    const RE_ID = /^[A-Za-z0-9_-]{1,40}$/;
    const RE_CLAVE = /^[a-z0-9_]{1,30}$/;

    let datos = null;
    let avisosCarga = [];

    const ahora = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    function nuevoId() {
        const b = new Uint8Array(10);
        crypto.getRandomValues(b);
        return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    const ctx = () => ({ ahora, nuevoId, usuario: null });

    function leerGuardado() {
        let texto = null;
        try { texto = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento: se trabaja en memoria */ }
        if (!texto) return datosVacios();
        try {
            const r = sanearDatos(JSON.parse(texto), ahora());
            avisosCarga = r.avisos;
            return r.datos;
        } catch (e) {
            avisosCarga = ['los datos guardados no se pudieron leer'];
            return datosVacios();
        }
    }
    function cargados() {
        if (!datos) datos = leerGuardado();
        return datos;
    }

    function guardar(nuevos) {
        try {
            localStorage.setItem(CLAVE, JSON.stringify(exportarDatos(nuevos, ahora())));
        } catch (e) {
            throw new ErrorDatos('regla', 'No se pudo guardar en este navegador (¿sin lugar o en modo privado?): '
                + 'exportá los datos para no perderlos.', 507);
        }
        datos = nuevos;
        avisar();
    }
    function avisar() {
        if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('sgc:datos-cambiados'));
    }

    /** Corre `fn` sobre una copia de los datos; si no lanza, la copia pasa a ser la guardada. */
    function escribir(fn) {
        const copia = structuredClone(cargados());
        const r = fn(copia, ctx());
        guardar(copia);
        return r;
    }

    const cuerpo = (opciones) => {
        const b = opciones && opciones.body;
        if (b === undefined || b === null || b === '') return {};
        if (typeof b !== 'string') throw new ErrorDatos('validacion', 'cuerpo no válido');
        if (b.length > MAX_CUERPO) throw new ErrorDatos('regla', 'El pedido es demasiado grande.', 413);
        try {
            const r = JSON.parse(b);
            if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('no es un objeto');
            return r;
        } catch (e) {
            throw new ErrorDatos('validacion', 'el cuerpo no es un JSON válido');
        }
    };
    const exigir = (re, valor, que) => {
        if (!re.test(valor)) throw new ErrorDatos('validacion', `${que}: no válido`);
        return valor;
    };
    const versionDe = (v) => {
        const n = enteroAcotado(v, 1, 1e12);
        if (n === null) throw new ErrorDatos('validacion', 'version: falta o no es válida');
        return n;
    };
    const sin = (obj, ...claves) => {
        const r = { ...obj };
        for (const c of claves) delete r[c];
        return r;
    };

    // [método, patrón de la ruta, (partes, consulta, cuerpo) => respuesta]
    const RUTAS = [
        ['GET', /^\/api\/v2\/datos$/, () => datosProduccion(cargados())],
        ['GET', /^\/api\/stock$/, () => listado(cargados())],
        ['POST', /^\/api\/stock\/dispositivos$/, (p, q, b) => escribir((d, c) => crearDispositivo(d, b, c))],
        ['POST', /^\/api\/stock\/dispositivos\/altas$/,
            (p, q, b) => escribir((d, c) => crearLote(d, sin(b, 'filas'), b.filas, c))],
        ['POST', /^\/api\/stock\/dispositivos\/lote$/, (p, q, b) => {
            const fn = (d, c) => modificarLote(d, b.dispositivos, b.cambios, b.aplicar === true, c);
            return b.aplicar === true ? escribir(fn) : fn(structuredClone(cargados()), ctx());
        }],
        ['PUT', /^\/api\/stock\/dispositivos\/([^/]+)$/, (p, q, b) => {
            const id = exigir(RE_ID, p[1], 'id');
            return escribir((d, c) => modificarDispositivo(d, id, sin(b, 'version'), versionDe(b.version), c));
        }],
        ['DELETE', /^\/api\/stock\/dispositivos\/([^/]+)$/, (p, q) => {
            const id = exigir(RE_ID, p[1], 'id');
            return escribir((d, c) => eliminarDispositivo(d, id, versionDe(q.get('version')), c));
        }],
        ['GET', /^\/api\/stock\/dispositivos\/([^/]+)\/historial$/,
            (p) => historialDispositivo(cargados(), exigir(RE_ID, p[1], 'id'))],
        ['GET', /^\/api\/stock\/historial$/, (p, q) => {
            const accion = q.get('accion') || null;
            if (accion && !/^(agregar|modificar|borrar)$/.test(accion)) throw new ErrorDatos('validacion', 'acción no válida');
            return historialReciente(cargados(), { accion, texto: q.get('q'), offset: q.get('offset') || 0 });
        }],
        ['POST', /^\/api\/stock\/grupos$/, (p, q, b) => escribir((d, c) => crearGrupo(d, b.etiqueta, c))],
        ['PUT', /^\/api\/stock\/grupos\/([^/]+)$/,
            (p, q, b) => escribir((d, c) => renombrarGrupo(d, exigir(RE_CLAVE, p[1], 'clave'), b.etiqueta, c))],
        ['DELETE', /^\/api\/stock\/grupos\/([^/]+)$/,
            (p) => escribir((d, c) => borrarGrupo(d, exigir(RE_CLAVE, p[1], 'clave'), c))],
        ['POST', /^\/api\/stock\/tipos$/, (p, q, b) => escribir((d, c) => crearTipo(d, b.etiqueta, b.grupo, c))],
        ['PUT', /^\/api\/stock\/tipos\/([^/]+)$/,
            (p, q, b) => escribir((d, c) => modificarTipo(d, exigir(RE_CLAVE, p[1], 'clave'), b.etiqueta, b.grupo, c))],
        ['DELETE', /^\/api\/stock\/tipos\/([^/]+)$/,
            (p) => escribir((d, c) => borrarTipo(d, exigir(RE_CLAVE, p[1], 'clave'), c))],
        ['POST', /^\/api\/stock\/edificios$/, (p, q, b) => escribir((d, c) => agregarEdificio(d, b.nombre, c))],
        ['GET', /^\/api\/stock\/ubicaciones$/, () => ubicaciones(cargados())],
        ['POST', /^\/api\/stock\/ubicaciones$/, (p, q, b) => escribir((d, c) => editarUbicacion(d, b, c))],
        ['GET', /^\/api\/stock\/modelos$/, () => modelos(cargados())],
        ['PUT', /^\/api\/stock\/modelos$/, (p, q, b) => escribir((d, c) => fijarPaginaModelo(d, b.modelo, b.pagina, c))]
    ];

    /** Un pedido como los de fetch: {status, json}. Nunca lanza (los errores son respuestas con su estado). */
    function atender(url, opciones = {}) {
        const u = new URL(String(url), 'http://local/');
        const metodo = String(opciones.method || 'GET').toUpperCase();
        let rutaVista = false;
        for (const [m, patron, fn] of RUTAS) {
            const partes = u.pathname.match(patron);
            if (!partes) continue;
            rutaVista = true;
            if (m !== metodo) continue;
            try {
                const b = metodo === 'GET' || metodo === 'DELETE' ? {} : cuerpo(opciones);
                return { status: 200, json: structuredClone(fn(partes, u.searchParams, b)) };
            } catch (e) {
                if (e instanceof ErrorDatos) return { status: e.estado, json: { detail: e.detalle() } };
                console.error('API local:', e);
                return { status: 500, json: { detail: 'Error interno al procesar los datos.' } };
            }
        }
        return rutaVista ? { status: 405, json: { detail: 'Método no permitido.' } }
            : { status: 404, json: { detail: 'No existe en esta versión (sin servidor).' } };
    }

    async function pedir(url, opciones = {}) {
        return atender(url, opciones);
    }

    // ---- exportar / importar / borrar (Ajustes > Datos)
    function exportar() {
        return JSON.stringify(exportarDatos(cargados(), ahora()), null, 2);
    }
    /** Reemplaza los datos por los de un archivo exportado: {dispositivos, avisos}. Lanza ErrorDatos si no sirve. */
    function importar(texto) {
        if (typeof texto !== 'string' || texto.length > MAX_ARCHIVO) {
            throw new ErrorDatos('validacion', 'el archivo es demasiado grande (máximo 8 MB)');
        }
        let bruto;
        try { bruto = JSON.parse(texto); } catch (e) { throw new ErrorDatos('validacion', 'el archivo no es un JSON válido'); }
        if (!bruto || bruto.formato !== FORMATO_DATOS) {
            throw new ErrorDatos('validacion', 'no es un archivo exportado de SGC-2 (para el de SGC usá «Migrar desde SGC»)');
        }
        const r = sanearDatos(bruto, ahora());
        guardar(r.datos);
        return { dispositivos: r.datos.dispositivos.length, avisos: r.avisos };
    }
    /** Una copia de los datos guardados (para fusionar con el Gist). */
    function datosActuales() {
        return structuredClone(cargados());
    }
    /** Reemplaza los datos por unos YA saneados (el resultado de fusionar con el Gist). */
    function reemplazar(nuevos) {
        guardar(structuredClone(nuevos));
    }
    /** Una importación (parseadores): `fn(copia, ctx)` con el origen «importacion» en el historial; se guarda si no lanza. */
    function importacion(fn) {
        return escribir((d, c) => fn(d, { ...c, origen: 'importacion' }));
    }
    function borrarTodo() {
        guardar(datosVacios());
    }

    if (typeof window !== 'undefined') {
        // Otra pestaña guardó: se relee y se repinta (sin esto, una edición acá pisaría la de la otra)
        window.addEventListener('storage', (ev) => {
            if (ev.key !== CLAVE) return;
            datos = null;
            avisar();
        });
    }

    return { pedir, atender, exportar, importar, borrarTodo, datos: datosActuales, reemplazar, importacion, avisosCarga: () => { cargados(); return [...avisosCarga]; } };
})();
