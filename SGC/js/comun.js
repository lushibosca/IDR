// Lo común del front, cargado antes de app.js y de todas las pestañas: almacenamiento seguro (`storage`), el cliente
// de la API (`apiFetch`, `apiFetchValidado`, `ApiError`), los avisos (`mostrarToast`), copiar al portapapeles, el
// atajo de pulsación larga, la selección de texto y los bloques UI COMUN, FECHAS Y CSV, VALOR INFORMADO, USUARIOS y
// LIMITE CONSULTA. Sin estado del dashboard: eso es de app.js (`globalData` se lee al llamar, no al cargar).

// --- Acceso seguro a localStorage ---
// Único punto de acceso: si el almacenamiento está bloqueado o falla, nunca
// lanza; devuelve el valor por defecto y sigue. En GitHub Pages todas las apps de la suite idr comparten el origen (y el
// localStorage): cada clave lleva el prefijo `sgc2/` (preload.js lo repite) para no pisar las de otra app.
const PREFIJO_ALMACEN = 'sgc2/';
const storage = {
    get(clave, porDefecto = null) {
        try {
            const v = localStorage.getItem(PREFIJO_ALMACEN + clave);
            return v === null ? porDefecto : v;
        } catch (e) { return porDefecto; }
    },
    set(clave, valor) {
        try { localStorage.setItem(PREFIJO_ALMACEN + clave, valor); } catch (e) { }
    },
    remove(clave) {
        try { localStorage.removeItem(PREFIJO_ALMACEN + clave); } catch (e) { }
    },
    getJSON(clave, porDefecto = null) {
        try {
            const v = JSON.parse(localStorage.getItem(PREFIJO_ALMACEN + clave));
            return v === null || v === undefined ? porDefecto : v;
        } catch (e) { return porDefecto; }
    },
    setJSON(clave, valor) {
        try { localStorage.setItem(PREFIJO_ALMACEN + clave, JSON.stringify(valor)); } catch (e) { }
    }
};

// «Reducir animaciones» (`data-movimiento="reducido"` en <html>) lo aplican arranque.js y apariencia.js (shared/ui/js).

// ==== PREFERENCIAS PURO BEGIN ====
// Preferencias que siguen a la persona a otra PC (docs/diseno/PREFERENCIAS-POR-USUARIO.md): [clave del servidor
// (lista cerrada de cctv/preferencias.py), clave de localStorage, forma en localStorage]. Formas: 'si_no' ('1'/'0' ↔
// true/false), 'texto' (tal cual) y 'json'. Lo que no está acá (sonido, notificaciones, panel lateral, última pestaña)
// es del dispositivo y queda solo en el navegador.
const PREFERENCIAS_SINCRONIZADAS = [
    ['tema', 'theme', 'texto'],
    ['panel.colapso.monitoreo', 'cctv:colapso_monitoreo', 'si_no'],
    ['panel.colapso.canales', 'cctv:colapso_canales', 'si_no'],
    ['panel.colapso.activos', 'cctv:colapso_activos', 'si_no'],
    ['panel.colapso.disponibilidad', 'cctv:colapso_disponibilidad', 'si_no'],
    ['panel.colapso.alertas', 'cctv:colapso_alertas', 'si_no'],
    ['panel.colapso.favoritos', 'cctv:colapso_favoritos', 'si_no'],
    ['panel.favoritos', 'cctv:favoritos', 'json'],
    ['panel.favoritos_compacto', 'cctv:favoritos_compacto', 'si_no'],
    ['panel.favoritos_captura', 'cctv:favoritos_captura', 'si_no'],
    ['panel.activos_orden', 'cctv:activos_orden', 'json'],
    ['panel.monitoreo_ocultos', 'cctv:monitoreo_ocultos', 'json'],
    ['panel.secciones_ocultas', 'cctv:secciones_ocultas', 'json'],
    ['panel.activos_ocultos', 'cctv:activos_ocultos', 'json'],
    ['panel.disposicion', 'cctv:disposicion_resumen', 'json'],
    ['panel.activos_eje', 'cctv:activos_eje', 'texto'],
    ['panel.grafico_rango', 'cctv:grafico_rango', 'texto'],
    ['panel.capacidad_modo', 'cctv:capacidad_modo', 'texto'],
    ['panel.rueda_pestanas', 'cctv:rueda_pestanas', 'si_no'],
    ['busqueda.cambia_pestana', 'cctv:buscar_cambia_pestana', 'si_no'],
    ['auditoria_video.colapso.resumen', 'cctv:colapso_audvid_resumen', 'si_no'],
    ['auditoria_video.colapso.tabla', 'cctv:colapso_audvid_tabla', 'si_no'],
    ['auditoria_video.colapso.homogeneidad', 'cctv:colapso_audvid_homog', 'si_no'],
    ['auditoria_video.solo_discrepancias', 'cctv:audvid_homog_solo_discrepancias', 'si_no'],
    ['alertas.agrupar', 'cctv_alertas_agrupar', 'texto'],
    ['produccion.vista', 'cctv_produccion_vista', 'texto'],
    ['activos.agrupar', 'cctv_stock_agrupar', 'texto'],
    ['activos.vista', 'cctv_stock_vista_modo', 'texto'],
    ['activos.orden', 'cctv_stock_orden', 'texto'],
    ['activos.columnas', 'cctv_stock_columnas', 'json'],
    ['activos.subgrupos_colapsados', 'cctv_stock_subgrupos_colapsados', 'json'],
];
const PREFERENCIAS_DEMORA_MS = 2000;               // los cambios seguidos viajan juntos en un solo PUT
const CLAVE_PREFERENCIAS_USUARIO = 'cctv:preferencias_usuario';   // de quién son las preferencias de este navegador

/** Lo guardado en localStorage -> valor para el servidor; `undefined` si no hay nada o no tiene la forma (no se sube). */
function prefDeLocal(forma, crudo) {
    if (typeof crudo !== 'string') return undefined;
    if (forma === 'si_no') return crudo === '1' ? true : crudo === '0' ? false : undefined;
    if (forma === 'texto') return crudo;
    try {
        const v = JSON.parse(crudo);
        return v === null ? undefined : v;
    } catch (e) { return undefined; }
}

/** Valor del servidor -> texto para localStorage, o null si no tiene la forma (se descarta: vuelve al defecto). */
function prefALocal(forma, valor) {
    if (forma === 'si_no') return typeof valor === 'boolean' ? (valor ? '1' : '0') : null;
    if (forma === 'texto') return typeof valor === 'string' ? valor : null;
    return valor === null || valor === undefined ? null : JSON.stringify(valor);
}

/** ¿Esta sesión ({usuario, rol, cambiar_clave}) sincroniza? El kiosco no (es una cuenta compartida por varias
 *  pantallas) ni la sesión restringida de una clave temporal (solo sirve para cambiarla). */
function prefSincronizaSesion(yo) {
    return !!yo && typeof yo.usuario === 'string' && yo.usuario !== '' && yo.rol !== 'kiosco' && yo.cambiar_clave !== true;
}

/** Primera vez en el servidor: ¿se suben las de este navegador? Solo si el servidor no tiene ninguna y lo guardado acá
 *  es de esa persona o de antes de las preferencias por usuario (si es de OTRA persona, no se le pasa a esta). */
function prefDebeSembrar(valores, ultimoUsuario, usuario) {
    return Object.keys(valores).length === 0 && (!ultimoUsuario || ultimoUsuario === usuario);
}

/** Cambios para la siembra: lo que este navegador tiene guardado y tiene la forma ({clave del servidor: valor}). */
function prefSiembra(leerLocal) {
    const cambios = Object.create(null);
    for (const [servidor, local, forma] of PREFERENCIAS_SINCRONIZADAS) {
        const v = prefDeLocal(forma, leerLocal(local));
        if (v !== undefined) cambios[servidor] = v;
    }
    return cambios;
}

/** Qué escribir en localStorage con lo que dice el servidor: [[clave local, texto | null = borrar]]. Lo que el servidor
 *  no tiene se borra (vuelve al defecto: no queda lo de otra persona); lo que cambió acá y todavía no se mandó
 *  (`pendientes`: claves del servidor) no se toca. */
function prefPlan(valores, pendientes) {
    const plan = [];
    for (const [servidor, local, forma] of PREFERENCIAS_SINCRONIZADAS) {
        if (pendientes.has(servidor)) continue;
        const tiene = Object.prototype.hasOwnProperty.call(valores, servidor);
        plan.push([local, tiene ? prefALocal(forma, valores[servidor]) : null]);
    }
    return plan;
}

/** 422 de /api/preferencias: la clave de `cambios` que nombra el mensaje («... para la preferencia X.»), o null. */
function prefRechazada(detalle, cambios) {
    const texto = typeof detalle === 'string' ? detalle : '';
    return Object.keys(cambios).find(k => texto.endsWith(`preferencia ${k}.`)) ?? null;
}

/** ¿Es una respuesta de /api/preferencias? (`valores` objeto, no lista) */
function prefRespuestaValida(r) {
    return !!r && typeof r.valores === 'object' && r.valores !== null && !Array.isArray(r.valores);
}
// ==== PREFERENCIAS PURO END ====

// Preferencias por usuario en ejecución. Leer sigue siendo `storage.get` (síncrono y local: localStorage es la caché de
// lo que dice el servidor, así preload.js pone el tema antes de pintar). Escribir una sincronizada va por
// `preferencias.set/setJSON/remove`: queda en localStorage al instante y viaja al servidor agrupada. Al entrar
// (`sincronizar`, desde sesion.js) se aplica lo del servidor y cada módulo repinta lo suyo (`alAplicar`). Sin sesión,
// con kiosco o con la clave temporal pendiente, todo queda solo en el navegador, como antes. Un error al mandar nunca
// molesta (es comodidad, no datos): se reintenta con el próximo cambio; un 422 se descarta.
const preferencias = (() => {
    const porLocal = new Map(PREFERENCIAS_SINCRONIZADAS.map(([servidor, local, forma]) => [local, { servidor, forma }]));
    const pendientes = new Map();            // clave del servidor -> valor (null = volver al defecto)
    const confirmados = new Map();           // clave del servidor -> JSON de lo último que dijo el servidor
    const aplicadores = new Map();           // clave local -> [funciones]
    let activo = false;
    let timer = null;

    function encolar(local) {
        const d = porLocal.get(local);
        if (!d) return;
        const v = prefDeLocal(d.forma, storage.get(local));
        const valor = v === undefined ? null : v;
        // lo mismo que ya tiene el servidor (p. ej. un control que se repinta al aplicar) no viaja
        if (!pendientes.has(d.servidor) && (confirmados.get(d.servidor) ?? 'null') === JSON.stringify(valor)) return;
        pendientes.set(d.servidor, valor);
        if (activo) {
            clearTimeout(timer);
            timer = setTimeout(() => { enviar(); }, PREFERENCIAS_DEMORA_MS);
        }
    }

    function confirmar(valores) {
        confirmados.clear();
        for (const [servidor] of PREFERENCIAS_SINCRONIZADAS) {
            if (Object.prototype.hasOwnProperty.call(valores, servidor)) {
                confirmados.set(servidor, JSON.stringify(valores[servidor]));
            }
        }
    }

    async function enviar({ keepalive = false } = {}) {
        clearTimeout(timer);
        if (!activo || pendientes.size === 0) return;
        const cambios = Object.create(null);
        for (const [k, v] of pendientes) cambios[k] = v;
        pendientes.clear();
        try {
            const r = await apiFetch('/api/preferencias', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cambios }), keepalive
            });
            if (prefRespuestaValida(r)) confirmar(r.valores);
        } catch (e) {
            // 422: el servidor no acepta uno (todo o nada). Se descarta ESE (lo nombra el mensaje) y va el resto: un valor
            // viejo y raro de este navegador no hace perder la siembra entera. Sin nombre, se descarta todo.
            const rechazada = e instanceof ApiError && e.status === 422 ? prefRechazada(e.detalle, cambios) : undefined;
            if (rechazada === null) return;
            for (const k of Object.keys(cambios)) {
                if (k !== rechazada && !pendientes.has(k)) pendientes.set(k, cambios[k]);
            }
            if (rechazada !== undefined) await enviar({ keepalive });
        }
    }

    function aplicar(plan) {
        const cambiadas = [];
        for (const [local, texto] of plan) {
            if (storage.get(local) === texto) continue;
            if (texto === null) storage.remove(local);
            else storage.set(local, texto);
            cambiadas.push(local);
        }
        if (cambiadas.includes('cctv:disposicion_resumen')) storage.remove('cctv:orden_resumen');   // formato anterior
        // una vez cada una aunque dependa de varias claves (Activos relee las cuatro suyas de una vez)
        const fns = new Set(cambiadas.flatMap(local => aplicadores.get(local) || []));
        for (const fn of fns) {
            try { fn(); } catch (e) { console.error('No se pudo aplicar una preferencia', e); }
        }
    }

    return {
        set(local, valor) { storage.set(local, valor); encolar(local); },
        setJSON(local, valor) { storage.setJSON(local, valor); encolar(local); },
        remove(local) { storage.remove(local); encolar(local); },
        /** Una lista (forma 'json'): vacía vuelve al defecto (se borra) en vez de guardarse como `[]`. */
        setLista(local, lista) {
            if (lista.length) this.setJSON(local, lista); else this.remove(local);
        },
        /** `fn` repinta lo que depende de la clave local cuando llega otro valor del servidor. */
        alAplicar(local, fn) {
            if (!aplicadores.has(local)) aplicadores.set(local, []);
            aplicadores.get(local).push(fn);
        },
        /** Con la sesión de `yo` ({usuario, rol, cambiar_clave}) o null: trae, aplica (o siembra) y empieza a mandar. */
        async sincronizar(yo) {
            if (!prefSincronizaSesion(yo)) {
                activo = false;
                clearTimeout(timer);
                return;
            }
            let r;
            try {
                r = await apiFetchValidado('/api/preferencias', prefRespuestaValida);
            } catch (e) { return; }                                   // sin preferencias del servidor: siguen las locales
            const valores = Object.create(null);
            for (const [servidor] of PREFERENCIAS_SINCRONIZADAS) {
                if (Object.prototype.hasOwnProperty.call(r.valores, servidor)) valores[servidor] = r.valores[servidor];
            }
            confirmar(valores);
            if (prefDebeSembrar(valores, storage.get(CLAVE_PREFERENCIAS_USUARIO, ''), yo.usuario)) {
                const siembra = prefSiembra(local => storage.get(local));
                for (const k of Object.keys(siembra)) if (!pendientes.has(k)) pendientes.set(k, siembra[k]);
            } else {
                aplicar(prefPlan(valores, new Set(pendientes.keys())));
            }
            storage.set(CLAVE_PREFERENCIAS_USUARIO, yo.usuario);
            activo = true;
            await enviar();
        },
        /** Manda ya lo pendiente (al salir de la página o antes de cerrar la sesión). */
        enviarYa: () => enviar({ keepalive: true }),
    };
})();
window.addEventListener('pagehide', () => { preferencias.enviarYa(); });

// ==== API CLIENT BEGIN ====
// Único punto de acceso a la API. Antes cada fetch() hacía `await response.json()` sin mirar
// response.ok, así que un 401/403/500 se trataba como "datos" (dashboard en 0/0 sin avisar) o
// fallaba en silencio en la consola. Acá se centraliza:
//   * cabecera anti-CSRF (X-Requested-With) en TODAS las llamadas
//   * la sesión va en una cookie HttpOnly (el JS no la ve ni la guarda): se manda sola con `credentials: same-origin`
//   * `{ polling: true }`: pedido AUTOMÁTICO (refresco periódico), marcado con `X-CCTV-Polling: 1`: no renueva la
//     sesión de operador y admin (una pantalla olvidada no los mantiene logueados)
//   * error tipificado (ApiError.tipo): auth (401: sin sesión o vencida) | acceso | red | servidor | formato

class ApiError extends Error {
    constructor(mensaje, { status = 0, tipo = 'red', detalle = '', reintentar_s = 0 } = {}) {
        super(mensaje);
        this.detalle = detalle;     // mensaje que envió el servidor (cuerpo {"message": ...}), si lo hubo
        this.reintentar_s = reintentar_s;   // 429: segundos de Retry-After (0 = no informó)
        this.name = 'ApiError';
        this.status = status;
        this.tipo = tipo;
    }
}

async function apiFetch(url, { polling = false, ...opciones } = {}) {
    // SGC-2 no tiene servidor: la API la responde el navegador (js/api-local.js) con la misma forma y los mismos estados
    let resp;
    try {
        resp = await ApiLocal.pedir(url, opciones);
    } catch (e) {
        throw new ApiError('No se pudieron leer los datos de este navegador.', { tipo: 'interno' });
    }
    if (resp.status >= 400) {
        const detalle = resp.json && typeof resp.json.detail === 'string' ? resp.json.detail : '';
        throw new ApiError(detalle || `Error ${resp.status}.`, { status: resp.status, tipo: 'servidor', detalle });
    }
    return resp.json;
}

/** `apiFetch` + la forma esperada: lo que no pasa `valida(respuesta)` se rechaza ANTES de pintar nada, con ApiError
 *  de tipo 'formato' (`mensaje`, o «La respuesta de <ruta> no tiene el formato esperado.»). Antes cada pantalla
 *  repetía el pedido, la validación y el error. */
async function apiFetchValidado(url, valida, { mensaje = '', ...opciones } = {}) {
    const r = await apiFetch(url, opciones);
    if (!valida(r)) {
        throw new ApiError(mensaje || `La respuesta de ${String(url).split('?')[0]} no tiene el formato esperado.`,
            { tipo: 'formato' });
    }
    return r;
}
// ==== API CLIENT END ====

// Avisos (mostrarToast): ../shared/ui/js/toast.js

// --- Copiar al portapapeles ---
window.copiarAlPortapapeles = async function (texto, mensajeExito = '') {
    if (!uiValorInformado(texto)) return;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
        } else {
            const el = document.createElement('textarea');
            el.value = texto;
            el.style.position = 'fixed';
            el.style.top = '-9999px';
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        }

        const msg = mensajeExito || `${texto} copiado al portapapeles.`;
        mostrarToast(msg, 'success');
    } catch (err) {
        console.error('Error al copiar al portapapeles:', err);
    }
};

window.copiarIP = async function (ip) {
    if (!ip || ip === '-') return;
    return window.copiarAlPortapapeles(ip, `${ip} copiado al portapapeles.`);
};

// ==== ETIQUETA ICONO PURO BEGIN ====
// Dónde va la etiqueta de un botón de solo ícono: centrada ARRIBA del botón (si arriba no entra, abajo) y sin salirse de la
// ventana. `rect`: el botón; `tam`: la etiqueta; `ventana`: { width, height }.
function uiPosicionEtiquetaArriba(rect, tam, ventana, separacion = 6) {
    const centrado = rect.left + rect.width / 2 - tam.width / 2;
    const left = Math.max(4, Math.min(centrado, ventana.width - tam.width - 4));
    const arriba = rect.top - tam.height - separacion;
    return { left, top: arriba >= 4 ? arriba : rect.bottom + separacion };
}
// ==== ETIQUETA ICONO PURO END ====

/** Etiqueta flotante (la misma del panel lateral colapsado: `.sidebar-tip`) para los botones de solo ícono de `raiz` que
 *  cumplan `selector` y traigan su texto en `data-etiqueta` (solo textContent). `activa(el)` (opcional) apaga la etiqueta
 *  cuando el botón ya muestra su texto. Devuelve { ocultar } para cerrar la etiqueta desde afuera. */
function uiEtiquetasDeIconos(raiz, selector, activa = null) {
    const tip = uiNodo('div', 'sidebar-tip d-none');
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    const ocultar = () => tip.classList.add('d-none');
    const destino = (ev) => (ev.target instanceof Element ? ev.target.closest(selector) : null);
    const mostrar = (el) => {
        if (!el || !el.dataset.etiqueta || (activa && !activa(el))) return;
        tip.textContent = el.dataset.etiqueta;
        tip.classList.remove('d-none');
        const pos = uiPosicionEtiquetaArriba(el.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight },
            { width: window.innerWidth, height: window.innerHeight });
        tip.style.left = `${pos.left}px`;
        tip.style.top = `${pos.top}px`;
    };
    raiz.addEventListener('mouseover', (ev) => mostrar(destino(ev)));
    raiz.addEventListener('focusin', (ev) => {
        const el = destino(ev);
        if (el && uiFocoDeTeclado(el)) mostrar(el);
    });
    for (const tipo of ['mouseout', 'focusout', 'click']) raiz.addEventListener(tipo, ocultar);
    window.addEventListener('scroll', ocultar, true);
    // y se va al tocar otra cosa, al irse de la ventana o con Escape (antes, un `mouseout` perdido lo dejaba a la vista)
    document.addEventListener('pointerdown', ocultar, true);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ocultar(); });
    window.addEventListener('blur', ocultar);
    document.addEventListener('visibilitychange', ocultar);
    return { ocultar };
}

// ==== CONFIRMACION TEMPORIZADA PURO BEGIN ====
// Un borrado en dos pasos («Eliminar» → «Confirmar») no puede quedar armado para siempre: a los CONFIRMACION_MS vuelve solo
// al botón original. `armar()` (re)empieza la cuenta, `cancelar()` la corta (se confirmó, se eligió otra cosa, se cerró el
// modal). Los temporizadores se inyectan (`reloj`) para probarlo sin esperar.
const CONFIRMACION_MS = 3000;
function uiConfirmacionTemporizada(alVencer, ms = CONFIRMACION_MS, reloj = null) {
    const poner = reloj ? reloj.poner : setTimeout;
    const quitar = reloj ? reloj.quitar : clearTimeout;
    let t = null;
    const cancelar = () => {
        if (t !== null) quitar(t);
        t = null;
    };
    const armar = () => {
        cancelar();
        t = poner(() => { t = null; alVencer(); }, ms);
    };
    return { armar, cancelar };
}
// ==== CONFIRMACION TEMPORIZADA PURO END ====

// (PULSACION_LARGA_MS y esPulsacionLarga: ../shared/ui/js/gestos.js)

// Engancha el atajo a un encabezado: pulsación larga, Shift + clic o Shift + Enter llaman a `alLargo` (abrir/cerrar
// todos). Se registra ANTES del clic que abre/cierra uno solo: frena ese clic (stopImmediatePropagation) tras una
// pulsación larga o con Shift. Moverse más de UMBRAL_MOVIMIENTO_PULSACION_PX (scroll en una pantalla táctil, o el arrastre que
// marca varios en el modo selección: el mismo umbral, así uno u otro y nunca los dos) la cancela. Si tras una pulsación larga
// no llega ningún clic, la marca de «tragar el clic» vence sola (si no, se comía el siguiente clic, de cualquier equipo).
// Con `selector` el atajo es delegado: `el` es un contenedor y solo cuentan las pulsaciones largas sobre los elementos que
// coinciden (se llama a `alLargo(elemento)`; sin Shift, porque ahí el Shift + clic ya tiene otro uso).
const VIGENCIA_TRAGAR_CLIC_MS = 150;
function uiAtajoPulsacionLarga(el, alLargo, selector = null) {
    let inicio = null;
    let origen = null;
    let objetivo = el;
    let tragarClick = false;
    let vence = null;
    el.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        if (selector) {
            objetivo = ev.target instanceof Element ? ev.target.closest(selector) : null;
            if (!objetivo) return;
        }
        inicio = ev.timeStamp;
        origen = { x: ev.clientX, y: ev.clientY };
    });
    el.addEventListener('pointermove', (ev) => {
        if (inicio !== null && origen && Math.hypot(ev.clientX - origen.x, ev.clientY - origen.y) > UMBRAL_MOVIMIENTO_PULSACION_PX) inicio = null;
    });
    for (const tipo of ['pointerleave', 'pointercancel']) el.addEventListener(tipo, () => { inicio = null; });
    el.addEventListener('pointerup', (ev) => {
        if (inicio !== null && esPulsacionLarga(inicio, ev.timeStamp)) {
            tragarClick = true;
            clearTimeout(vence);
            vence = setTimeout(() => { tragarClick = false; }, VIGENCIA_TRAGAR_CLIC_MS);
            alLargo(objetivo);
        }
        inicio = null;
    });
    el.addEventListener('contextmenu', (ev) => { if (inicio !== null) ev.preventDefault(); });   // táctil
    el.addEventListener('click', (ev) => {
        if (tragarClick || (ev.shiftKey && !selector)) {
            ev.stopImmediatePropagation();
            if (!tragarClick) alLargo(el);
            tragarClick = false;
            clearTimeout(vence);
        }
    });
    el.addEventListener('keydown', (ev) => {
        if (!selector && ev.shiftKey && (ev.key === 'Enter' || ev.key === ' ')) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            alLargo(el);
        }
    });
}

// ==== SELECCION TEXTO PURO BEGIN ====
// ¿El clic que llega terminó una selección de texto dentro de `el` (arrastrar para copiar una IP, un nombre)? Ese clic
// no abre el popup del equipo. Solo cuenta una selección no vacía que toca `el`: una que quedó en otra parte de la
// página no frena el clic. `sel`: la Selection del documento (inyectada para probarla sin navegador).
function haySeleccionTextoEn(el, sel) {
    if (!el || !sel || sel.isCollapsed || !sel.rangeCount || !String(sel).trim()) return false;
    for (let i = 0; i < sel.rangeCount; i++) {
        const r = sel.getRangeAt(i);
        if (r && typeof r.intersectsNode === 'function' && r.intersectsNode(el)) return true;
    }
    return false;
}

// Con `user-select: none` en toda la página, un clic sobre algo que no se selecciona NO suelta la selección que ya había
// (solo la suelta un clic sobre algo seleccionable). `valores`: el `userSelect` calculado del elemento tocado y de sus
// ancestros, de adentro hacia afuera; el efectivo es el primero que no es `auto` (`auto` hereda del padre).
function userSelectEfectivo(valores) {
    for (const v of Array.isArray(valores) ? valores : []) {
        if (v && v !== 'auto') return v;
    }
    return 'auto';
}
// ¿Un clic principal sobre algo no seleccionable suelta la selección que haya?
function debeSoltarSeleccion(haySeleccion, boton, valores) {
    return Boolean(haySeleccion) && boton === 0 && userSelectEfectivo(valores) === 'none';
}
// ==== SELECCION TEXTO PURO END ====

// Clic principal sobre algo que no se selecciona: suelta la selección de texto que quedó (ver `debeSoltarSeleccion`).
document.addEventListener('pointerdown', (ev) => {
    const sel = typeof window.getSelection === 'function' ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !(ev.target instanceof Element)) return;
    const valores = [];
    for (let el = ev.target; el; el = el.parentElement) valores.push(getComputedStyle(el).userSelect);
    if (debeSoltarSeleccion(true, ev.button, valores)) sel.removeAllRanges();
});

/** Atajo de haySeleccionTextoEn con la selección del documento. */
function uiSeleccionTextoEn(el) {
    return haySeleccionTextoEn(el, typeof window.getSelection === 'function' ? window.getSelection() : null);
}

// ==== LIMITE CONSULTA PURO BEGIN ====
// El servidor consulta cada equipo como mucho una vez por minuto (Grabador, Auditoría de video y Cámara juntos): un
// «Consultar» antes de eso devuelve el último resultado, con su hora real (`consultado`, ISO UTC). Aviso para el pie,
// o '' si el resultado es de recién (menos de 5 s) o la hora no es válida.
function uiAvisoUltimaConsulta(consultado, ahoraMs) {
    if (typeof consultado !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(consultado)) return '';
    const edad = Math.floor((ahoraMs - Date.parse(consultado)) / 1000);
    if (!Number.isFinite(edad) || edad < 5) return '';
    return `resultado de hace ${edad} s: cada equipo se consulta como mucho una vez por minuto`;
}
// ==== LIMITE CONSULTA PURO END ====

// ==== USUARIOS PURO BEGIN ====
// Cuentas de un equipo (Auditoría > Grabador y > Cámara): primero por nivel (lista cerrada de cctv/usuarios.py; lo
// desconocido al final) y después por nombre. Devuelve una copia: no reordena la respuesta del servidor.
const UI_NIVELES_USUARIO = ['Administrador', 'Operador', 'Usuario', 'Otro'];

function uiOrdenarUsuarios(usuarios) {
    const rango = (n) => { const i = UI_NIVELES_USUARIO.indexOf(n); return i < 0 ? UI_NIVELES_USUARIO.length : i; };
    return [...(Array.isArray(usuarios) ? usuarios : [])]
        .sort((a, b) => rango(a.nivel) - rango(b.nivel) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}
// ==== USUARIOS PURO END ====

// ==== FECHAS Y CSV PURO BEGIN ====
// Rango de fechas de los formularios a demanda y celdas CSV de las exportaciones (logs de servidores, disponibilidad,
// video y stock). Antes vivían en logs-servidores.js con prefijo logsrv y los demás módulos dependían de él.

// Date -> "YYYY-MM-DDTHH:MM:SSZ" (el formato que exige la API)
function uiIsoZ(fecha) {
    return fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Date -> "YYYY-MM-DDTHH:MM:SSZ" tomando los componentes locales (para equipos como el NVR que registran
// y buscan en su hora local pero exigen formato ISO terminado en "Z")
function uiIsoLocalZ(fecha) {
    const p = (n) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T`
        + `${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}Z`;
}

// {desde, hasta} (ISO Z) o {error}. `custom` recibe los valores de <input type="datetime-local"> (hora local).
// `maxDias` y `presets` (clave -> ms) son de cada pantalla. `horaLocal`: true usa la hora local con formato "Z".
function uiRangoFechas(preset, ahora, desdeLocal, hastaLocal, { maxDias, presets, horaLocal = false } = {}) {
    const formatear = horaLocal ? uiIsoLocalZ : uiIsoZ;
    if (preset !== 'custom') {
        const ms = Object.hasOwn(presets, preset) ? presets[preset] : 0;
        if (!ms) return { error: 'Rango inválido.' };
        return { desde: formatear(new Date(ahora.getTime() - ms)), hasta: formatear(ahora) };
    }
    if (!desdeLocal || !hastaLocal) return { error: 'Indicá la fecha y hora de inicio y de fin.' };
    const d = new Date(desdeLocal), h = new Date(hastaLocal);
    if (isNaN(d) || isNaN(h)) return { error: 'Fecha u hora inválida.' };
    if (h <= d) return { error: 'El fin del rango debe ser posterior al inicio.' };
    if (h - d > maxDias * 86400e3) return { error: `El rango no puede superar ${maxDias} días.` };
    return { desde: formatear(d), hasta: formatear(h) };
}

// Date -> valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:MM", hora local)
function uiValorFechaLocal(fecha) {
    const p = (n) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

// Celda CSV segura: comillas escapadas y neutralización de "inyección de fórmulas" en Excel/Sheets
// (valores que empiezan con = + - @ o control se prefijan con una comilla simple).
function uiCsvCelda(valor) {
    let s = String(valor ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// ISO UTC "...Z" -> "DD/MM/AAAA HH:MM" en la hora de este navegador (tablas de Disponibilidad y Base de datos); lo que no
// es una fecha se muestra tal cual
function uiFechaHora(iso) {
    const d = new Date(iso);
    if (typeof iso !== 'string' || isNaN(d)) return String(iso ?? '');
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Nombre de un archivo exportado: "<prefijo>-AAAAMMDD-HHMM.<ext>" (hora local). El prefijo puede traer texto del equipo
// (nombre o IP del grabador): queda solo con letras, dígitos, punto y guion, sin "/" ni espacios. Antes cada pantalla
// tenía su copia (logs, disponibilidad, video y stock).
function uiNombreArchivo(prefijo, ahora, extension = 'csv') {
    const p = (n) => String(n).padStart(2, '0');
    const base = String(prefijo).replace(/[^A-Za-z0-9.-]/g, '_').slice(0, 80);
    return `${base}-${ahora.getFullYear()}${p(ahora.getMonth() + 1)}${p(ahora.getDate())}-${p(ahora.getHours())}`
        + `${p(ahora.getMinutes())}.${String(extension).replace(/[^a-z0-9]/g, '')}`;
}
// Acota un número a [min, max]; lo que no es número finito (NaN, Infinity de un ancho 0) queda en `min`.
function uiAcotar(valor, min, max) {
    const n = Number(valor);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}
// Posición relativa 0..1 de `pos` dentro de `total` (cursor sobre un gráfico); un total no positivo da 0.
function uiFraccion(pos, total) {
    return total > 0 ? uiAcotar(pos / total, 0, 1) : 0;
}
// ==== FECHAS Y CSV PURO END ====

// ==== VALOR INFORMADO PURO BEGIN ====
// Valor que informa un equipo o el stock, recortado; '' si no hay dato ('-', '—' y 'N/A' = sin dato).
function uiValorInformado(v) {
    const t = String(v ?? '').trim();
    return (t === '-' || t === '—' || t === 'N/A') ? '' : t;
}

// Número de canal sin el prefijo «CH» que traen algunos datos ('CH 3' -> '3'); '' sin canal (null/undefined).
function uiNumeroCanal(valor) {
    return String(valor ?? '').replace(/^CH\s*/i, '').trim();
}
// ==== VALOR INFORMADO PURO END ====

// Vista móvil (< 768 px, el mismo corte que el CSS de estructura.css): solo Estado, Activos y Producción, en tarjetas y sin
// Auditoría (docs/diseno/CSS-Y-UI.md). Una sola definición del corte para todo el front.
function uiEsMovil() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767.98px)').matches;
}
/** Avisa `callback` cuando la pantalla cruza el corte móvil/escritorio (girar el aparato, achicar la ventana). */
function uiAlCambiarMovil(callback) {
    if (typeof window.matchMedia !== 'function') return;
    window.matchMedia('(max-width: 767.98px)').addEventListener('change', callback);
}

// ==== UI COMUN BEGIN ====
// Andamiaje compartido por las pestañas a demanda (logs de servidores, auditoría de video y de cámara). Antes cada
// módulo tenía su copia de cada una. Solo DOM con textContent: lo que informa el servidor nunca se interpreta como HTML.

/** Banner de error de un formulario: muestra `texto` (o lo oculta si viene vacío), con la animación del panel. */
function uiMostrarBanner(el, texto) {
    if (!el) return;
    if (texto) el.textContent = texto;
    alternarBannerMutacion(el, !!texto);
}

/** Botón "Consultar" ocupado/libre (spinner mientras corre la consulta). */
/** Devuelve el foco a un elemento repintado (`el`, o nada) sin que la página se desplace: tras repintar una lista, el foco vuelve
 *  al equipo que lo tenía y la pantalla no tiene que saltar hasta él. */
function uiEnfocarSinScroll(el) {
    if (!el || typeof el.focus !== 'function') return;
    const x = window.scrollX;
    const y = window.scrollY;
    el.focus({ preventScroll: true });
    if (window.scrollY !== y || window.scrollX !== x) window.scrollTo({ top: y, left: x, behavior: 'instant' });
}

function uiBotonOcupado(boton, ocupado, { libre = 'Consultar', enCurso = 'Consultando...', icono = 'bi bi-search' } = {}) {
    if (!boton) return;
    const titulo = boton.querySelector('.ajuste-titulo');
    if (titulo) {                       // tarjeta de Ajustes: cambia el título y gira su ícono (el chevron no se toca)
        if (ocupado) {
            if (boton.dataset.tituloOriginal === undefined) boton.dataset.tituloOriginal = titulo.textContent;
            titulo.textContent = enCurso;
        } else if (boton.dataset.tituloOriginal !== undefined) {
            titulo.textContent = boton.dataset.tituloOriginal;
            delete boton.dataset.tituloOriginal;
        }
        boton.classList.toggle('ajuste-ocupada', Boolean(ocupado));
        boton.setAttribute('aria-busy', ocupado ? 'true' : 'false');
        return;
    }
    boton.replaceChildren();
    const texto = ocupado ? enCurso : libre;
    const i = document.createElement('i');
    i.className = (ocupado ? 'spinner-border spinner-border-sm' : icono) + (texto ? ' me-1' : '');
    if (texto) {
        boton.append(i, texto);
    } else {
        boton.append(i);
    }
}

/** Lista `clave` (`nvrs`, `camaras`, `equipos_red`) del último /api/v2/datos, o [] si todavía no llegó: las pestañas
 *  leen de acá (abrirlas no consulta la red). */
function uiDatosCargados(clave) {
    const d = typeof globalData !== 'undefined' ? globalData : null;
    return d && Array.isArray(d[clave]) ? d[clave] : [];
}
/** NVR del último /api/v2/datos (los selectores de las pestañas salen de acá). */
function uiNvrsCargados() { return uiDatosCargados('nvrs'); }
/** Cámaras del último /api/v2/datos. */
function uiCamarasCargadas() { return uiDatosCargados('camaras'); }

/** Llena un <select> de grabadores (los caídos, deshabilitados). `todos`: valor de una opción "Todos los grabadores"
 *  que se agrega si hay más de uno en línea. `vacio`: texto de la opción sin valor; `permitirCaidos`: los caídos se
 *  pueden elegir (Auditoría > Disponibilidad: son los que interesan). Conserva la elección previa si sigue siendo válida. */
function uiPoblarGrabadores(sel, { todos = null, vacio = 'Elegí un grabador...', permitirCaidos = false } = {}) {
    if (!sel) return;
    const previo = sel.value;
    const nvrs = uiNvrsCargados();
    sel.replaceChildren();
    if (nvrs.length === 0) {
        const cargando = typeof cargandoEnProgreso !== 'undefined' && cargandoEnProgreso;
        sel.add(new Option(cargando ? 'Cargando grabadores...' : 'No hay grabadores cargados', ''));
        return;
    }
    sel.add(new Option(vacio, ''));
    if (todos && nvrs.filter(n => !n.is_offline).length > 1) sel.add(new Option('Todos los grabadores', todos));
    for (const n of nvrs) {
        const nombre = n.nvr_name && n.nvr_name !== 'N/A' ? `${n.nvr_name} (${n.ip})` : n.ip;
        const o = new Option(n.is_offline ? `${nombre} - caído` : nombre, n.ip);
        o.disabled = !!n.is_offline && !permitirCaidos;
        sel.add(o);
    }
    if (previo && [...sel.options].some(o => o.value === previo && !o.disabled)) sel.value = previo;
}

/** Tarjeta de datos (título con ícono y filas etiqueta/valor) de las pestañas a demanda (Grabador, Cámara).
 *  Cada fila puede ser: [etiqueta, valor] | {seccion} (subtítulo) | un Node ya armado (barra, lista) |
 *  {etiqueta, valor, mono, alerta, aviso, tenue, titulo, icono, clase, detalle, enlace: {datos, titulo}}.
 *  `valor` es texto o un Node; `enlace.datos` va a data-* (lo atienden los listeners delegados de cada módulo).
 *  Sin filas: el texto `vacio`. Todo con textContent: lo que informa el equipo nunca se interpreta como HTML. */
function uiTarjeta(titulo, icono, filas, vacio, clasesCol = 'col-12 col-md-6 col-xl-4') {
    const [col, caja] = uiCajaTarjeta(titulo, icono, clasesCol);
    const lista = Array.isArray(filas) ? filas : [];
    if (lista.length === 0 && vacio) caja.appendChild(uiNodo('div', 'small text-secondary py-1', vacio));
    uiFilas(caja, lista);
    return col;
}

/** Columna + caja con el título de una tarjeta (la usan uiTarjeta y uiTarjetaDispositivo): [col, caja]. */
function uiCajaTarjeta(titulo, icono, clasesCol) {
    const col = uiNodo('div', clasesCol);
    const caja = uiNodo('div', 'd-flex flex-column bg-body-tertiary rounded h-100 p-3');
    const t = uiNodo('div', 'small text-secondary fw-bold mb-2 tracking-titulo');
    t.append(uiNodo('i', `bi ${icono} me-1`), titulo);
    caja.appendChild(t);
    col.appendChild(caja);
    return [col, caja];
}

/** Campos de texto de varias líneas que crecen con lo que se pega (hasta `maxPx`, después scrollean) y quedan todos a la misma
 *  altura: la de la más larga (una lista de MAC, otra de series...: el mismo alto en las tres deja ver cuál es más corta).
 *  `minFilas`: el alto mínimo. */
function uiAutoAltura(areas, { minFilas = 3, maxPx = 320 } = {}) {
    const lista = (Array.isArray(areas) ? areas : [areas]).filter(Boolean);
    for (const a of lista) a.style.height = 'auto';
    const alto = Math.min(maxPx, Math.max(0, ...lista.map(a => a.scrollHeight)));
    const base = lista.length ? parseFloat(getComputedStyle(lista[0]).lineHeight) || 20 : 20;
    const minimo = Math.round(base * minFilas + 14);
    for (const a of lista) {
        a.style.height = `${Math.max(alto, minimo)}px`;
        a.style.overflowY = a.scrollHeight > maxPx ? 'auto' : 'hidden';
    }
}

/** Vuelve clickeable el título de un dispositivo auditado SIN alta ni popup (el grabador sin alta): abre el alta precargada con
 *  lo que informó el escaneo (`alta` va a data-*; lo atiende el listener delegado de stock.js, `data-stock-alta`). */
function uiEnlazarActivoStock(el, alta) {
    for (const [clave, valor] of Object.entries(alta)) el.dataset[clave] = String(valor);
    el.title = 'Dar de alta este equipo en el stock con lo que informó el escaneo';
    el.classList.add('disp-etiqueta-abrible');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
}

/** Tarjeta con la imagen/foto del dispositivo auditado (NVR o cámara). */
function uiTarjetaDispositivo(modelo, tipo = 'grabador', clasesCol = 'col-12 col-md-6 col-xl-4') {
    const [col, caja] = uiCajaTarjeta('DISPOSITIVO', 'bi-image', clasesCol);

    const wrapper = uiNodo('div', 'auditoria-card-img-wrapper');
    const iconoFallback = tipo === 'camara' ? 'bi-camera-video' : 'bi-hdd-rack';

    const mostrarFallback = () => {
        wrapper.replaceChildren();
        const icon = uiNodo('i', `bi ${iconoFallback} auditoria-card-img-fallback`);
        const txt = uiNodo('span', 'small text-secondary mt-2', modelo ? 'Sin foto del modelo' : 'Sin modelo identificado');
        wrapper.append(icon, txt);
    };

    const modLimpio = uiValorInformado(modelo);
    const ruta = (typeof buscarImagenDispositivo === 'function' && modLimpio) ? buscarImagenDispositivo(modLimpio) : null;
    if (ruta) {
        const img = uiNodo('img', 'auditoria-card-img');
        img.alt = modLimpio || 'Dispositivo';
        img.loading = 'lazy';
        img.onerror = () => mostrarFallback();
        img.src = ruta;
        wrapper.appendChild(img);
    } else {
        mostrarFallback();
    }

    caja.appendChild(wrapper);

    const pie = uiNodo('div', 'text-center text-truncate small text-secondary mt-2 fw-medium', modLimpio || 'Modelo no especificado');
    if (modLimpio) pie.title = modLimpio;
    caja.appendChild(pie);
    return col;
}

/** Agrega a `caja` las filas etiqueta/valor con el formato de uiTarjeta (lo reutilizan los modales de detalle). */
function uiFilas(caja, filas) {
    for (const f of Array.isArray(filas) ? filas : []) {
        if (f instanceof Node) { caja.appendChild(f); continue; }
        const d = Array.isArray(f) ? { etiqueta: f[0], valor: f[1] } : (f || {});
        if (d.seccion) {
            caja.appendChild(uiNodo('div', 'small text-secondary fw-semibold mt-2 pt-1', d.seccion));
            continue;
        }
        const fila = uiNodo('div', `d-flex justify-content-between align-items-center gap-3 small py-1 border-bottom${d.clase ? ` ${d.clase}` : ''}`);
        if (d.titulo) fila.title = d.titulo;
        const k = uiNodo('span', 'text-secondary flex-shrink-0', d.etiqueta || '');
        if (d.icono) k.appendChild(uiNodo('i', `bi ${d.icono} ms-1`));
        const v = uiNodo('span', `seleccionable ${d.tenue ? 'text-secondary' : 'fw-semibold'} text-end text-break${d.mono ? ' font-monospace' : ''}${
            d.alerta ? ' text-danger fw-semibold' : d.aviso ? ' text-warning fw-semibold' : ''}`);
        if (d.valor instanceof Node) v.appendChild(d.valor); else v.textContent = d.valor === undefined || d.valor === null ? '' : String(d.valor);
        if (d.detalle) {
            const bloque = uiNodo('span', 'd-flex flex-column align-items-end text-end');
            bloque.append(v, uiNodo('span', 'text-secondary fw-normal', d.detalle));
            fila.append(k, bloque);
        } else {
            fila.append(k, v);
        }
        if (d.enlace) {
            fila.setAttribute('role', 'button');
            fila.tabIndex = 0;
            if (d.enlace.titulo) fila.title = d.enlace.titulo;
            for (const [clave, valor] of Object.entries(d.enlace.datos || {})) fila.dataset[clave] = String(valor);
        }
        caja.appendChild(fila);
    }
    return caja;
}

/** Elemento `tag` con clases y texto plano (textContent): lo que informa el equipo nunca se interpreta como HTML. */
// Interruptor deslizante de la pestaña Ajustes (`.interruptor`, role="switch"): lo prendido va en aria-checked (el CSS
// corre la perilla) y `deshabilitado` lo marca aria-disabled sin quitarlo del foco (el clic igual explica por qué).
function uiInterruptor(btn, activo, deshabilitado = false) {
    if (!btn) return;
    btn.setAttribute('aria-checked', activo ? 'true' : 'false');
    if (deshabilitado) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
}

function uiNodo(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
}

/** Texto copiable (IP, MAC...): `.copy-cell` + `data-copy`; lo copia el doble clic delegado de `initCopiarCeldas`. */
function uiCopiable(tag, clase, valor, texto = null) {
    const el = uiNodo(tag, `${clase} copy-cell`.trim(), texto ?? valor);
    const v = uiValorInformado(valor);
    if (v) {
        el.dataset.copy = v;
        el.title = 'Doble clic para copiar';
    }
    return el;
}

/** Lista `<ul>` de textos planos (notas, avisos); el bloque que la contiene (`bloque`, un selector) se oculta si no
 *  hay ninguno. */
function uiListaTextos(ul, items, bloque) {
    if (!ul) return;
    const lista = Array.isArray(items) ? items : [];
    ul.replaceChildren(...lista.map(t => uiNodo('li', '', t)));
    const caja = bloque ? ul.closest(bloque) : null;
    if (caja) caja.classList.toggle('d-none', lista.length === 0);
}

/** Texto plano en el elemento `id`, si existe. */
function uiPonerTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(valor ?? '');
}

/** Celda de tabla con texto plano. */
function uiCelda(tr, texto, clase) {
    const td = tr.insertCell();
    td.textContent = texto || '';
    if (clase) td.className = clase;
    return td;
}

/** Descarga `texto` como archivo (Blob + <a download>; la URL se libera al rato). */
function uiDescargarTexto(texto, nombreArchivo, tipo = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Error de una consulta: 401 abre el modal de inicio de sesión; el resto, el mensaje del servidor en el banner del formulario. */
function uiErrorConsulta(e, mostrar, porDefecto = 'No se pudo completar la consulta.') {
    if (e instanceof ApiError && e.tipo === 'auth' && typeof mostrarErrorApi === 'function') {
        mostrarErrorApi(e);
        return;
    }
    mostrar(e instanceof ApiError ? e.message : porDefecto);
}
// Término de la búsqueda global (la usan todas las pestañas) (en minúsculas; '' si no hay buscador).
function terminoBusquedaActual() {
    const input = document.getElementById('global-search');
    return input ? input.value.toLowerCase() : '';
}

/** Un grupo de acordeón (Producción y Activos comparten el marcado; la apertura, la animación y cuál queda abierto
 *  los maneja el listener delegado de app.js). `insignias`: [{texto, clase}] (clase de color: 'bg-secondary'...);
 *  `datos`: data-* del panel (data-nvr-name, ...). Todo con textContent. */
// `detalle`: texto corto a la derecha, pegado a la flecha de colapso (p. ej. la IP del grabador en Producción);
// `copiar`: lo que se copia con doble clic sobre ese texto (la IP); un clic sobre él no abre ni cierra el grupo
function uiItemAcordeon({ id, abierto, titulo, claseTitulo, icono = null, insignias = [], cuerpo, datos = null,
    detalle = '', copiar = '' }) {
    const item = uiNodo('div', 'accordion-item mb-2');
    const h2 = uiNodo('h2', 'accordion-header');
    const b = uiNodo('button', abierto ? 'accordion-button py-2' : 'accordion-button collapsed py-2');
    b.type = 'button';
    b.dataset.uiTarget = `#${id}`;
    if (icono) b.appendChild(uiNodo('i', `${icono} me-2`));
    b.appendChild(uiNodo('span', `fw-medium ${claseTitulo}`, titulo));
    for (const ins of insignias) b.appendChild(uiNodo('span', `badge ${ins.clase} ms-2`, ins.texto));
    if (detalle) {
        b.classList.add('accordion-con-detalle');
        const valor = uiValorInformado(copiar);
        b.appendChild(valor ? uiCopiable('span', 'accordion-detalle', valor, detalle) : uiNodo('span', 'accordion-detalle', detalle));
    }
    h2.appendChild(b);
    const col = uiNodo('div', abierto ? 'accordion-collapse collapse grid-collapse show' : 'accordion-collapse collapse grid-collapse');
    col.id = id;
    if (datos) for (const [k, v] of Object.entries(datos)) col.dataset[k] = String(v);
    const body = uiNodo('div', 'accordion-body p-0');
    body.appendChild(cuerpo);
    col.appendChild(body);
    item.append(h2, col);
    return item;
}

/** Fila de tabla plegable con animación de acordeón (un <tr> no anima su alto): el contenido de cada celda va dentro
 *  de un grid-collapse y, plegada, la celda pierde el relleno (CSS `tr.fila-plegable`). Las filas de abajo bajan y
 *  suben acompañando el alto, y el modal con ellas. `uiPlegarFila` la abre o la cierra. */
function uiFilaPlegable(tr, abierta) {
    tr.classList.add('fila-plegable');
    for (const td of tr.cells) {
        const interior = uiNodo('div');
        interior.append(...td.childNodes);
        const col = uiNodo('div', abierta ? 'grid-collapse show' : 'grid-collapse');
        col.appendChild(interior);
        td.replaceChildren(col);
    }
    tr.classList.toggle('plegada', !abierta);
    return tr;
}

function uiPlegarFila(tr, abrir) {
    tr.classList.toggle('plegada', !abrir);
    for (const col of tr.querySelectorAll(':scope > td > .grid-collapse')) col.classList.toggle('show', abrir);
}

/** Sección plegable con animación de acordeón (en lugar de <details>, que abre de golpe): `cabecera` (un <button>,
 *  con un chevron que gira por CSS según aria-expanded) abre o cierra `cuerpo`, envuelto en un grid-collapse. */
function uiSeccionPlegable(cabecera, cuerpo, abierta) {
    const seccion = uiNodo('div');
    cabecera.classList.add('seccion-plegable-cab');
    cabecera.setAttribute('aria-expanded', String(abierta));
    cabecera.prepend(uiNodo('i', 'bi bi-chevron-right seccion-plegable-chevron me-2'));
    const col = uiNodo('div', abierta ? 'grid-collapse show' : 'grid-collapse');
    const interior = uiNodo('div');
    interior.appendChild(cuerpo);
    col.appendChild(interior);
    cabecera.addEventListener('click', () => {
        const abrir = cabecera.getAttribute('aria-expanded') !== 'true';
        cabecera.setAttribute('aria-expanded', String(abrir));
        col.classList.toggle('show', abrir);
    });
    seccion.append(cabecera, col);
    return seccion;
}

/** Los elementos que se corren cuando `el` aparece, desaparece o cambia de alto: sus hermanos y los de cada ancestro hasta la
 *  pestaña (otros chips, las secciones de abajo). Solo los que hoy se ven. */
function uiVecinosQueSeMueven(el) {
    const vecinos = [];
    const tope = el.closest('.tab-pane') || document.body;
    for (let n = el; n && n !== tope && n.parentElement; n = n.parentElement) {
        for (const hermano of n.parentElement.children) {
            if (hermano !== n && hermano.getClientRects().length > 0) vecinos.push(hermano);
        }
    }
    return vecinos;
}

/** Aplica `cambiar()` (que muestra, quita o redimensiona `el`) y desliza suavemente a los vecinos a su lugar nuevo, en vez de
 *  que salten (mismo recorrido que las secciones reubicables, `uiAnimarReubicacion`). `extra()` (opcional): más elementos con
 *  clave propia (`clave`) que también se siguen, como las fichas de una grilla que se vuelve a armar. */
function uiReubicarVecinos(el, cambiar, { extra = null, clave = (x) => x } = {}) {
    return uiAnimarReubicacion(() => [...uiVecinosQueSeMueven(el), ...(extra ? extra() : [])], clave, cambiar);
}

// ==== VISIBILIDAD PURO BEGIN ====
/** Los ids ocultos que siguen existiendo (`todos`); si dejaran todo oculto no se oculta nada: siempre queda al menos uno a la vista. */
function ocultosVigentes(ocultos, todos) {
    const lista = (Array.isArray(ocultos) ? ocultos : []).filter(id => todos.includes(id));
    return todos.every(id => lista.includes(id)) ? [] : [...new Set(lista)];
}

/** Oculta o muestra `id`: la lista nueva, o la misma si ocultarlo dejaría todo oculto. */
function alternarOculto(ocultos, id, todos) {
    const actual = ocultosVigentes(ocultos, todos);
    if (!todos.includes(id)) return actual;
    if (actual.includes(id)) return actual.filter(x => x !== id);
    const nueva = [...actual, id];
    return todos.every(x => nueva.includes(x)) ? actual : nueva;
}
// ==== VISIBILIDAD PURO END ====

/** Muestra u oculta cada elemento de `cols` según `ocultos` (ids por `idDe(el)`), con la mutación de entrada y salida. */
function uiAplicarVisibilidad(cols, idDe, ocultos, { animar = true } = {}) {
    const sinAnimar = !animar || (typeof prefiereMovimientoReducido === 'function' && prefiereMovimientoReducido());
    for (const col of cols) {
        const visible = !ocultos.includes(idDe(col));
        const saliendo = col.dataset.visible === '0' && !col.classList.contains('d-none');   // su animación de salida sigue en curso
        col.dataset.visible = visible ? '1' : '0';
        // Al aparecer o irse el elemento, los demás se corren: deslizan a su lugar nuevo (uiReubicarVecinos) en vez de saltar
        const cambiar = (hacer) => (sinAnimar ? hacer() : uiReubicarVecinos(col, hacer));
        if (visible) {
            if (saliendo) cancelarMutacion(col);
            if (!saliendo && !col.classList.contains('d-none')) continue;
            cambiar(() => col.classList.remove('d-none'));
            if (!sinAnimar) animarMutacion(col, 'entrada');
        } else if (!col.classList.contains('d-none') && !saliendo) {
            if (sinAnimar) col.classList.add('d-none');
            else animarMutacion(col, 'salida', () => { if (col.dataset.visible === '0') cambiar(() => col.classList.add('d-none')); });
        }
    }
}

/** Las casillas «Mostrar» de un menú de opciones: un botón por elemento (`items`: [{id, etiqueta}]) con su tilde. Reemplaza lo anterior
 *  (`li[data-visibilidad]`). El único que queda a la vista no se puede ocultar. `alElegir(id)`. */
function uiMenuVisibilidad(menu, items, ocultos, alElegir) {
    if (!menu) return;
    const firma = JSON.stringify([items, ocultos]);
    if (menu.dataset.visibilidadFirma === firma) return;           // sin cambios: no se rearma el menú (puede estar abierto)
    menu.dataset.visibilidadFirma = firma;
    for (const li of menu.querySelectorAll('li[data-visibilidad]')) li.remove();
    const visibles = items.filter(i => !ocultos.includes(i.id));
    // una columna del menú: su encabezado y una casilla por elemento (con otra columna al lado, `.menu-columnas` las pone en fila)
    const columna = uiNodo('li', 'dropdown-columna');
    columna.dataset.visibilidad = '1';
    columna.append(uiNodo('h6', 'dropdown-header', 'Mostrar'));
    for (const item of items) {
        const visible = !ocultos.includes(item.id);
        const boton = uiNodo('button', `dropdown-item item-casilla${visible ? ' active' : ''}`);
        boton.type = 'button';
        boton.dataset.visibilidadId = item.id;
        const tilde = uiNodo('i', `bi bi-check2 me-2${visible ? '' : ' invisible'}`);
        boton.append(tilde, item.etiqueta);
        const ultimo = visible && visibles.length === 1;
        boton.disabled = ultimo;
        if (ultimo) boton.title = 'Tiene que quedar al menos uno a la vista';
        boton.addEventListener('click', () => alElegir(item.id));
        columna.append(boton);
    }
    menu.append(columna);
}

/** Qué elementos se ven, elegido en un menú de casillas (`uiMenuVisibilidad`) y guardado como preferencia (`clave`, la lista de
 *  ocultos). `elementos()`: los que se muestran u ocultan; `idDe(el)`: su id; `items()`: [{id, etiqueta}] del menú (pueden
 *  cambiar: los grupos del catálogo). Devuelve `pintar(animar)`; una preferencia que llega de otra PC repinta sola. */
function uiVisibilidadElementos({ menu, clave, elementos, idDe, items }) {
    function pintar(animar = false) {
        const lista = items();
        const ids = lista.map(i => i.id);
        const ocultos = ocultosVigentes(storage.getJSON(clave, []), ids);
        uiAplicarVisibilidad(elementos(), idDe, ocultos, { animar });
        uiMenuVisibilidad(menu, lista, ocultos, (id) => {
            preferencias.setLista(clave, alternarOculto(storage.getJSON(clave, []), id, ids));
            pintar(true);
        });
    }
    preferencias.alAplicar(clave, () => pintar(false));
    return pintar;
}

// ==== MODO SELECCION PURO BEGIN ====
// «1 seleccionado» / «N seleccionados»
function uiSeleccionTexto(cantidad) {
    return `${cantidad} ${cantidad === 1 ? 'seleccionado' : 'seleccionados'}`;
}

// ¿Ya está marcado todo lo que se ve? Entonces «Visibles» desmarca (la acción contraria); sin nada a la vista no hay qué alternar.
function uiVisiblesMarcados(idsALaVista, elegidos) {
    return idsALaVista.length > 0 && idsALaVista.every(id => elegidos.has(id));
}

// Las claves entre dos posiciones de la lista (incluidas, en cualquier orden): el rango de Shift + clic y del arrastre.
// Una posición fuera de la lista (-1) no da rango.
function uiRangoClaves(claves, desde, hasta) {
    if (!Array.isArray(claves) || desde < 0 || hasta < 0 || desde >= claves.length || hasta >= claves.length) return [];
    return claves.slice(Math.min(desde, hasta), Math.max(desde, hasta) + 1);
}

// Los puntos de un trazo del cursor de (x0, y0) a (x1, y1), cada `paso` píxeles y con los dos extremos: el arrastre mira qué hay
// bajo cada uno, así un movimiento rápido no se saltea lo que cruzó entre dos eventos.
function uiPuntosEnSegmento(x0, y0, x1, y1, paso = 8) {
    const largo = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(largo / Math.max(1, paso)));
    const puntos = [];
    for (let i = 0; i <= n; i++) puntos.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    return puntos;
}

// ¿Un rectángulo (getBoundingClientRect) está, al menos en parte, dentro de la ventana de `alto` píxeles? Sin tamaño = no se ve.
function uiEnPantalla(rect, alto) {
    return Boolean(rect) && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < alto;
}

// Atajo Alt+Shift+`letra` (por la tecla o por la letra: con Alt+Shift algunas distribuciones cambian el carácter), sin Ctrl ni
// Meta y sin la repetición de la tecla sostenida. Firefox, Chrome y Brave no usan Alt+Shift+letra (Ctrl+Shift+L es de los
// gestores de claves, Ctrl+Alt+L bloquea la sesión en Linux y Alt+letra abre los menús); la página no tiene `accesskey`,
// que en Firefox es Alt+Shift.
function uiEsAtajoAltShift(ev, letra) {
    if (!ev || !ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.repeat) return false;
    return ev.code === `Key${String(letra).toUpperCase()}` || String(ev.key || '').toLowerCase() === String(letra).toLowerCase();
}
// ==== MODO SELECCION PURO END ====

/** Lo que NO saca del modo selección al tocarlo, en cualquier lista: el buscador, el popup, el botón de ocultar el panel, los
 *  menús, los modales y las etiquetas de los íconos. */
const SIGUE_EN_EL_MODO_SELECCION = '#sidebar-search-container, #popup-dispositivo-produccion, #btn-toggle-sidebar, .dropdown-menu, '
    + '[data-ui-toggle="dropdown"], .modal, .modal-backdrop, .sidebar-tip';

/** Modo selección de una lista (Activos y Producción): se marcan elementos y una barra abajo (`banner`) dice cuántos y ofrece
 *  las acciones. Lo común está acá: la barra (entra y sale con la mutación estándar), el contador, «Visibles» (marca lo que se ve;
 *  con todo marcado, lo desmarca), Ctrl + A, Escape (limpia la búsqueda y, sin ella, sale) y el clic afuera (sale). Con otra
 *  pestaña el modo y lo marcado quedan guardados, pero su barra, sus clics y sus teclas no cuentan. Cómo se entra (pulsación
 *  larga, «Seleccionar», Espacio) y qué hace cada acción lo pone cada módulo.
 *  - `panel`: la pestaña de la lista; `contenedor`: donde están los elementos; `claseModo`: va en el contenedor con el modo.
 *  - `items()`: los elementos que se marcan; `claveDe(el)`: su identidad.
 *  - `vigentes()` (opcional): las claves que siguen existiendo (por defecto, las de `items()`); lo demás se desmarca.
 *  - `contador`, `botonVisibles`, `acciones` (se deshabilitan sin nada marcado).
 *  - `sigueEnElModo`: selector de lo propio que no saca del modo (además de `SIGUE_EN_EL_MODO_SELECCION` y la barra);
 *    `controlesDeLaLista`: lo que dentro del contenedor tampoco saca (los elementos, los encabezados de grupo).
 *  - `repintarAlCambiar`: la lista se rearma sin avisar (Producción): se vuelve a marcar sola.
 *  Devuelve { entrar(clave), salir, alternar(clave), pintar, activo(), elegidos (Set de claves), idsALaVista() }. */
function uiModoSeleccion({ panel, contenedor, banner, claseModo, items, claveDe, vigentes = null, contador, botonVisibles,
    acciones = [], sigueEnElModo = '', controlesDeLaLista = '', repintarAlCambiar = false }) {
    let activo = false;
    const elegidos = new Set();
    let bannerVisible = false;
    let ultimoContador = '';
    let ancla = null;                    // desde dónde se extiende el rango de Shift + clic / Shift + flecha
    const panelActivo = () => panel.classList.contains('active');
    const modalArriba = () => typeof UI !== 'undefined' && UI.modal.arriba();
    // Lo que se VE: no cuenta lo de un grupo cerrado ni lo que ocultó la búsqueda (aunque esté armado en la página)
    const idsAbiertos = () => items().filter(el => !el.closest('.collapse:not(.show), .grid-collapse:not(.show), .d-none'))
        .map(claveDe).filter(Boolean);
    // «Visibles» = lo que está en pantalla ahora (dentro de la ventana), no todo lo de los grupos abiertos
    const idsALaVista = () => items().filter(el => !el.closest('.collapse:not(.show), .grid-collapse:not(.show), .d-none')
        && uiEnPantalla(el.getBoundingClientRect(), window.innerHeight)).map(claveDe).filter(Boolean);

    // La barra entra y sale con la mutación estándar (con menos movimiento, directo)
    function mostrarBanner(ver) {
        if (ver === bannerVisible) return;
        bannerVisible = ver;
        const animar = !prefiereMovimientoReducido() && elementoVisible(contenedor);
        if (ver) {
            banner.classList.remove('d-none');
            if (animar) animarMutacion(banner, 'entrada');
        } else if (animar) {
            animarMutacion(banner, 'salida', () => { if (!bannerVisible) banner.classList.add('d-none'); });
        } else {
            banner.classList.add('d-none');
        }
    }

    // «Visibles» activo = todo lo que se ve está marcado: también se repinta al abrir o cerrar un grupo
    function pintarVisibles() {
        const todoMarcado = activo && uiVisiblesMarcados(idsALaVista(), elegidos);
        botonVisibles.classList.toggle('active', todoMarcado);
        botonVisibles.setAttribute('aria-pressed', String(todoMarcado));
        botonVisibles.title = todoMarcado ? 'Quita la marca de todo lo que se ve en pantalla'
            : 'Selecciona todo lo que se ve en pantalla (respeta la búsqueda)';
    }

    function pintar() {
        const existentes = vigentes ? vigentes() : new Set(items().map(claveDe));
        for (const clave of [...elegidos]) if (!existentes.has(clave)) elegidos.delete(clave);     // se borró o ya no está
        contenedor.classList.toggle(claseModo, activo);
        mostrarBanner(activo && panelActivo());
        for (const el of items()) el.classList.toggle('stock-seleccionada', activo && elegidos.has(claveDe(el)));
        const texto = uiSeleccionTexto(elegidos.size);
        if (texto !== ultimoContador) {
            contador.textContent = texto;
            if (ultimoContador && activo && !prefiereMovimientoReducido()) animarMutacion(contador, 'entrada');
            ultimoContador = texto;
        }
        pintarVisibles();
        for (const boton of acciones) boton.disabled = elegidos.size === 0;
    }

    // Tras REARMAR la lista (un cambio de estado, la búsqueda): lo marcado vuelve ya con su color, sin la transición del fondo.
    // Los nodos nuevos nacen sin marca; si el navegador resuelve su estilo antes de ponérsela, el color «viaja» de uno al otro y
    // se ve como un parpadeo en cada actualización. Con la transición apagada (clase que se quita al cuadro siguiente) y el estilo
    // resuelto antes, nace marcado.
    function pintarSinTransicion() {
        contenedor.classList.add('seleccion-sin-transicion');
        pintar();
        void contenedor.offsetHeight;
        requestAnimationFrame(() => contenedor.classList.remove('seleccion-sin-transicion'));
    }

    function entrar(clave) {
        if (typeof window.ocultarPopupProduccion === 'function') window.ocultarPopupProduccion();
        activo = true;
        elegidos.clear();
        ancla = clave || null;
        if (clave) elegidos.add(clave);
        pintar();
        // El foco vuelve al elemento (el popup lo tenía): con el teclado se sigue desde ahí (flechas, Espacio para marcar)
        const el = clave ? items().find(x => claveDe(x) === clave) : null;
        if (el) el.focus({ preventScroll: true });
    }

    function salir() {
        activo = false;
        elegidos.clear();
        ancla = null;
        pintar();
    }

    function alternar(clave) {
        if (!activo || !clave) return;
        ancla = clave;
        if (elegidos.has(clave)) elegidos.delete(clave); else elegidos.add(clave);
        pintar();
    }

    // Sin «Limpiar» ni «Salir»: se sale con Escape o un clic afuera, y al volver a entrar la selección empieza de cero
    uiEtiquetasDeIconos(banner, '[data-etiqueta]');
    botonVisibles.addEventListener('click', () => {
        const ids = idsALaVista();
        const desmarcar = uiVisiblesMarcados(ids, elegidos);
        for (const id of ids) {
            if (desmarcar) elegidos.delete(id); else elegidos.add(id);
        }
        pintar();
    });

    // Abrir o cerrar un grupo cambia lo que se ve (el indicador de «Visibles» lo sigue: solo mira los grupos, así no se llama a
    // sí mismo); una lista que se rearma sola se vuelve a marcar
    new MutationObserver((registros) => {
        if (activo && registros.some(r => r.type === 'attributes' && r.target instanceof Element
            && r.target.matches('.collapse, .grid-collapse'))) pintarVisibles();
    }).observe(contenedor, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (repintarAlCambiar) {
        // En el microtask que sigue al repintado (antes de que el navegador dibuje): con un cuadro de espera, lo marcado se veía
        // sin marca un instante y parpadeaba en cada actualización automática. `pintar` solo toca clases y la barra, no la lista.
        new MutationObserver(() => pintarSinTransicion()).observe(contenedor, { childList: true, subtree: true });
    }

    // Al desplazar la lista cambia lo que está en pantalla: el indicador de «Visibles» lo sigue
    let scrollPendiente = false;
    document.addEventListener('scroll', () => {
        if (!activo || scrollPendiente) return;
        scrollPendiente = true;
        requestAnimationFrame(() => { scrollPendiente = false; pintarVisibles(); });
    }, true);

    // Al cambiar de pestaña la barra se va (o vuelve) con ella; el modo y lo marcado quedan guardados
    document.addEventListener('ui:pestana-oculta', pintar);
    document.addEventListener('ui:pestana-mostrada', pintar);

    // ---- Rango y arrastre (como un explorador de archivos): Shift + clic y Shift + flecha marcan desde el ancla hasta el elegido
    // (Ctrl + Shift suma al resto); mantener el botón y desplazarse marca (o desmarca, según el primero) lo que se recorre.
    const puedeActuar = () => activo && panelActivo() && !modalArriba();
    const elementosAbiertos = () => items().filter(el => !el.closest('.collapse:not(.show), .grid-collapse:not(.show), .d-none'));
    function itemDeNodo(nodo) {
        if (!(nodo instanceof Element)) return null;
        const propios = new Set(items());
        for (let n = nodo; n && n !== contenedor; n = n.parentElement) if (propios.has(n)) return n;
        return null;
    }

    function marcarRango(el, sumar) {
        const elems = elementosAbiertos();
        const claves = elems.map(claveDe);
        const claveEl = claveDe(el);
        if (ancla === null || !claves.includes(ancla)) { ancla = claveEl; }
        const rango = uiRangoClaves(claves, claves.indexOf(ancla), elems.indexOf(el));
        if (!sumar) elegidos.clear();
        for (const clave of rango) elegidos.add(clave);
        pintar();
    }

    contenedor.addEventListener('click', (ev) => {
        if (!ev.shiftKey || !puedeActuar()) return;
        const el = itemDeNodo(ev.target);
        if (!el) return;
        ev.stopImmediatePropagation();
        ev.preventDefault();
        marcarRango(el, ev.ctrlKey || ev.metaKey);
    }, true);

    document.addEventListener('keydown', (ev) => {
        if (!ev.shiftKey || ev.altKey || !puedeActuar()) return;
        const paso = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
        if (!paso) return;
        const actual = itemDeNodo(ev.target);
        if (!actual) return;
        const elems = elementosAbiertos();
        const destino = elems[elems.indexOf(actual) + paso];
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (!destino) return;
        if (ancla === null) ancla = claveDe(actual);
        marcarRango(destino, ev.ctrlKey || ev.metaKey);
        destino.focus();
        if (typeof destino.scrollIntoView === 'function') destino.scrollIntoView({ block: 'nearest' });
    }, true);

    let arrastre = null;                 // { el, clave, base, marcar, x, y, enCurso, ultimo (última posición), pasados (claves) }
    let tragarClick = false;             // el clic que sigue a un arrastre no es un clic (ni «afuera»)
    contenedor.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 || ev.pointerType === 'touch' || ev.shiftKey || ev.ctrlKey || ev.metaKey || !puedeActuar()) return;
        const el = itemDeNodo(ev.target);
        if (!el) return;
        arrastre = { el, clave: claveDe(el), base: new Set(elegidos), marcar: !elegidos.has(claveDe(el)),
            x: ev.clientX, y: ev.clientY, enCurso: false, ultimo: null, pasados: new Set([claveDe(el)]) };
    });
    document.addEventListener('pointermove', (ev) => {
        if (!arrastre) return;
        if (!arrastre.enCurso) {
            if (Math.hypot(ev.clientX - arrastre.x, ev.clientY - arrastre.y) <= UMBRAL_MOVIMIENTO_PULSACION_PX) return;
            arrastre.enCurso = true;
        }
        // Solo lo que el cursor recorre (no «todo lo que hay entre medio» por orden de fila o de columna): en tarjetas de varias
        // columnas, arrastrar por una no marca lo de al lado. Se mira cada punto del trazo desde el último evento.
        const desde = arrastre.ultimo || { x: arrastre.x, y: arrastre.y };
        let cambio = false;
        for (const [px, py] of uiPuntosEnSegmento(desde.x, desde.y, ev.clientX, ev.clientY)) {
            const bajo = itemDeNodo(document.elementFromPoint(px, py));
            if (bajo && !arrastre.pasados.has(claveDe(bajo))) { arrastre.pasados.add(claveDe(bajo)); cambio = true; }
        }
        arrastre.ultimo = { x: ev.clientX, y: ev.clientY };
        if (!cambio) return;
        elegidos.clear();
        for (const clave of arrastre.base) elegidos.add(clave);
        for (const clave of arrastre.pasados) { if (arrastre.marcar) elegidos.add(clave); else elegidos.delete(clave); }
        ancla = arrastre.clave;
        pintar();
    });
    const terminarArrastre = (ev) => {
        if (!arrastre) return;
        if (arrastre.enCurso) {
            if (ev.type === 'pointercancel') {
                elegidos.clear();
                for (const clave of arrastre.base) elegidos.add(clave);
                pintar();
            } else {
                tragarClick = true;
                setTimeout(() => { tragarClick = false; }, 60);
            }
        }
        arrastre = null;
    };
    document.addEventListener('pointerup', terminarArrastre);
    document.addEventListener('pointercancel', terminarArrastre);
    document.addEventListener('click', (ev) => {
        if (!tragarClick) return;
        tragarClick = false;
        ev.stopImmediatePropagation();
        ev.preventDefault();
    }, true);
    contenedor.addEventListener('dragstart', (ev) => { if (activo) ev.preventDefault(); });

    // Ctrl + A marca todo lo de los grupos abiertos (respeta la búsqueda), salvo que se esté escribiendo en un campo
    document.addEventListener('keydown', (ev) => {
        if (!activo || !panelActivo() || !(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'a') return;
        if (/^(input|textarea|select)$/i.test(document.activeElement ? document.activeElement.tagName : '')) return;
        if (modalArriba()) return;
        for (const id of idsAbiertos()) elegidos.add(id);
        pintar();
        ev.preventDefault();
    });

    // Escape tiene prioridad sobre el resto de los Escape de la página (saltar al buscador, limpiarlo): con una búsqueda activa
    // la limpia (la selección sigue) y, sin ella, sale del modo. Antes se cierran el modal y el popup abiertos.
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape' || !activo || !panelActivo() || modalArriba()) return;
        const popup = document.getElementById('popup-dispositivo-produccion');
        if (popup && !popup.classList.contains('d-none')) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (typeof hayBusquedaActiva === 'function' && hayBusquedaActiva()) limpiarBusqueda();
        else salir();
    }, true);

    // Un clic fuera de lo que se está eligiendo (la barra superior, el panel lateral, un hueco de la lista) sale del modo. Las
    // pestañas: cambiar de pestaña NO sale (el modo queda guardado); tocar la propia ya activa, sí (como al limpiar la búsqueda).
    // Se mira la RUTA del evento, no el destino: tocar un ítem de un menú lo repinta y el destino ya no está en la página.
    let pestanaActivaAlTocar = false;
    document.addEventListener('pointerdown', (ev) => {
        const pestana = ev.target instanceof Element ? ev.target.closest('[data-ui-toggle="pill"], [data-ui-toggle="tab"]') : null;
        pestanaActivaAlTocar = Boolean(pestana && pestana.classList.contains('active'));
    }, true);
    const sigue = [SIGUE_EN_EL_MODO_SELECCION, sigueEnElModo].filter(Boolean).join(', ');
    document.addEventListener('click', (ev) => {
        if (!activo || !panelActivo() || modalArriba()) return;
        const ruta = ev.composedPath().filter(nodo => nodo instanceof Element);
        const esDe = (selector) => ruta.some(nodo => nodo.matches(selector));
        const pestana = ruta.find(nodo => nodo.matches('[data-ui-toggle="pill"], [data-ui-toggle="tab"]'));
        if (pestana) {
            if (pestanaActivaAlTocar && pestana.getAttribute('data-ui-target') === `#${panel.id}`) salir();
            return;
        }
        if (ruta.includes(banner) || esDe(sigue)) return;
        if (controlesDeLaLista && ruta.includes(contenedor) && esDe(controlesDeLaLista)) return;
        salir();
    });

    return { entrar, salir, alternar, pintar, pintarSinTransicion, activo: () => activo, elegidos, idsALaVista };
}

const REUBICACION_MS = 300;       // lo que se deslizan los elementos movidos: hasta que terminan no se evalúa otro cambio

// ==== REORDEN GRILLA PURO BEGIN ====
/** Índice del rectángulo que contiene el punto (x, y), o -1. Con `margen`, si el punto no cae en ninguno (cae en el hueco entre
 *  fichas chicas) vale el primero a ese margen de distancia. */
function indiceEnPunto(rects, x, y, margen = 0) {
    const en = (r, m) => x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;
    const exacto = rects.findIndex(r => en(r, 0));
    return exacto >= 0 || !margen ? exacto : rects.findIndex(r => en(r, margen));
}
// ==== REORDEN GRILLA PURO END ====

/** Elementos de un contenedor que se reubican: pulsación larga y arrastre (`uiArrastreLargo`), o Alt + flechas con el foco en
 *  uno. Los demás se deslizan a su lugar con `uiAnimarReubicacion` (el recorrido de las fichas de Listar). `selector`: qué
 *  elementos son; `clave(el)`: su identidad; `alGuardar(el)`: ya quedaron en su orden nuevo (lo guarda quien llama).
 *  `ambito(el)`: el elemento entre cuyos hijos se reubica `el` (por defecto el contenedor): con un solo contenedor para
 *  muchos grupos (los encabezados de varias tablas), cada elemento se mueve solo entre los de su grupo. Devuelve
 *  `{ activo }`: ¿hay uno en movimiento? (no repintar debajo). */
function uiReordenable(contenedor, { selector, clave, alGuardar, ambito = () => contenedor }) {
    let deslizandoHasta = 0;
    const elementos = (ref) => [...ambito(ref).querySelectorAll(selector)].filter(el => !el.classList.contains('d-none'));

    function mover(el, antesDe) {
        uiAnimarReubicacion(() => elementos(el), clave, () => {
            if (antesDe) antesDe.before(el); else el.parentElement.append(el);
        }, { encima: el });
    }

    const arrastre = uiArrastreLargo(contenedor, {
        elegir: (e) => (e.target instanceof Element && !e.target.closest('a, button, input, select, textarea')
            ? e.target.closest(selector) : null),
        alEmpezar: (el) => el.classList.add('reordenando'),
        alMover: (e, arrastrado) => {
            if (performance.now() < deslizandoHasta) return;
            const lista = elementos(arrastrado);
            const i = indiceEnPunto(lista.map(el => el.getBoundingClientRect()), e.clientX, e.clientY, 14);
            const destino = i >= 0 ? lista[i] : null;
            if (!destino || destino === arrastrado) return;
            // hacia atrás va antes del señalado; hacia adelante, después
            mover(arrastrado, lista.indexOf(arrastrado) < i ? destino.nextElementSibling : destino);
            deslizandoHasta = performance.now() + REUBICACION_MS;
        },
        alTerminar: (el) => {                    // lo movido ya quedó en su lugar (también si se canceló a mitad)
            el.classList.remove('reordenando');
            alGuardar(el);
        },
    });

    contenedor.addEventListener('keydown', (e) => {
        if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const el = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!el) return;
        const lista = elementos(el);
        const i = lista.indexOf(el);
        const atras = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
        if (atras ? i <= 0 : i >= lista.length - 1) return;
        e.preventDefault();
        mover(el, atras ? lista[i - 1] : lista[i + 1].nextElementSibling);
        alGuardar(el);
        el.focus();
    });
    return arrastre;
}

/** Por qué una cámara sigue «sin relevar» (título de su marca). Si el escaneo automático ya no la reintenta solo
 *  (`sin_relevar_motivo`: un 401 o intentos agotados) lo dice, con qué hacer: el 401 suele ser una cámara nueva sin el
 *  usuario del monitoreo. */
function uiTextoSinRelevar(motivo) {
    const m = String(motivo || '').trim();
    if (!m) return 'El último escaneo no tiene esta cámara: corré un escaneo para registrarla.';
    const que = /401/.test(m) ? 'cargá en la cámara el usuario del monitoreo (el de NVR_USER)'
        : 'revisá que la cámara responda';
    return `El escaneo automático no pudo relevarla (${m}) y no lo reintenta solo: ${que} y escaneá ese canal a mano.`;
}

/** Captura en disco de un canal (GET /api/camara/snapshot; sin tráfico a los equipos). null sin NVR o canal. Después de
 *  «Actualizar capturas» (`uiCapturasActualizadas`) la dirección lleva una marca (`v`) para no recibir la anterior de la caché
 *  del navegador (1 hora). */
let _versionCapturas = 0;
function uiCapturasActualizadas() {
    _versionCapturas = Date.now();
}
// SGC-2 no tiene capturas de las cámaras (no hay servidor que las baje): ningún canal tiene una. Los que la ofrecían
// (popup, ficha, favoritos) muestran solo la foto del modelo.
function uiRutaCaptura() {
    return null;
}

// ==== COLA IMAGENES PURO BEGIN ====
// Cola de imágenes que sirve la API (las capturas de la vista snapshot de Producción): el tope de pedidos por sesión no
// aguanta cientos de `<img>` a la vez, así que se piden de a pocas, con un ritmo y SOLO las que están a la vista: al desplazarse
// rápido por 100 canales no se acumulan 100 pedidos; lo que quedó fuera de la ventana se cancela y se carga lo que se ve.
// Esta es la decisión, sin reloj ni DOM: `pendientes` son los que están a la vista y esperan, `activas` los que se están
// pidiendo, `ultimoInicio` cuándo empezó el último, `ultimoCambio` cuándo cambió lo que se ve (el desplazamiento) y `quietoMs`
// cuánto tiene que pasar sin cambios para empezar (que el scroll se haya detenido). Devuelve si se empieza otra ahora y cuánto
// falta para volver a mirar (null: no hay nada que esperar).
function uiColaImagenesPaso({ pendientes, activas, ahora, ultimoInicio, ultimoCambio = -Infinity }, { enVuelo, cadaMs, quietoMs = 0 }) {
    if (!(pendientes > 0)) return { iniciar: false, esperarMs: null };
    const quieto = ultimoCambio + quietoMs - ahora;
    if (quieto > 0) return { iniciar: false, esperarMs: quieto };
    if (activas >= enVuelo) return { iniciar: false, esperarMs: cadaMs };
    const falta = Math.max(0, ultimoInicio + cadaMs - ahora);
    return falta > 0 ? { iniciar: false, esperarMs: falta } : { iniciar: true, esperarMs: cadaMs };
}

// De varios rectángulos (getBoundingClientRect), el índice del más cercano al centro de la ventana de `alto` px; -1 si no hay
function uiRectMasCentrado(rects, alto) {
    let mejor = -1, distancia = Infinity;
    rects.forEach((r, i) => {
        const d = Math.abs(r.top + r.height / 2 - alto / 2);
        if (d < distancia) { distancia = d; mejor = i; }
    });
    return mejor;
}

/** Cola de imágenes del servidor (`img.dataset.captura` es la URL). Solo se piden las que están a la vista (con un margen
 *  de 300 px; sin IntersectionObserver, todas), con a lo sumo `enVuelo` a la vez, una nueva cada `cadaMs` y recién cuando
 *  el desplazamiento se detuvo (`quietoMs`), empezando por la más cercana al centro de la ventana. Una imagen que sale de la
 *  vista antes de cargar se cancela (se le saca el `src`) y vuelve a la espera: no se acumulan pedidos de lo que ya se pasó.
 *  Un error —un 429 por el tope de pedidos, o una captura que todavía no existe— se reintenta `reintentos` veces tras
 *  `esperaMs`; después `alFallar(img)`. Las que salieron del DOM se descartan. `entorno` es para probarla sin navegador.
 *  Devuelve `{ observar, estado }`. */
function uiColaImagenes({ enVuelo = 4, cadaMs = 250, quietoMs = 150, reintentos = 2, esperaMs = 5000, alCargar = () => {},
    alFallar = () => {} } = {}, entorno = {}) {
    const ahora = entorno.ahora || (() => Date.now());
    const programarEn = entorno.programar || ((fn, ms) => setTimeout(fn, ms));
    const alto = entorno.altoVentana || (() => (typeof window !== 'undefined' ? window.innerHeight : 800));
    const Observador = 'Observador' in entorno ? entorno.Observador : (typeof IntersectionObserver === 'function' ? IntersectionObserver : null);
    const pendientes = new Set();          // las que esperan para pedirse (solo se piden las que además están a la vista)
    const visibles = new Set();
    const enCurso = new Map();             // img -> sus escuchas (para soltarlas al cancelar)
    const terminadas = new WeakSet();      // cargaron o se dieron por perdidas: no vuelven a la cola
    const intentos = new WeakMap();
    let ultimoInicio = -Infinity;
    let ultimoCambio = -Infinity;
    let timer = null;

    function programar(ms) {
        if (timer !== null) return;
        timer = programarEn(() => { timer = null; bombear(); }, ms);
    }
    const aVista = (img) => !alVista || visibles.has(img);
    function soltar(img) {
        const h = enCurso.get(img);
        if (!h) return;
        img.removeEventListener('load', h.alLoad);
        img.removeEventListener('error', h.alError);
        enCurso.delete(img);
    }
    function iniciar(img) {
        pendientes.delete(img);
        ultimoInicio = ahora();
        const h = {
            alLoad: () => { soltar(img); terminadas.add(img); alCargar(img); programar(0); },
            alError: () => { soltar(img); reintentar(img); programar(0); },
        };
        enCurso.set(img, h);
        img.addEventListener('load', h.alLoad);
        img.addEventListener('error', h.alError);
        img.src = img.dataset.captura;
    }
    function cancelar(img) {              // salió de la vista antes de cargar: se aborta y espera su turno de nuevo
        soltar(img);
        img.removeAttribute('src');
        pendientes.add(img);
    }
    function bombear() {
        for (const img of [...pendientes]) {
            if (img.isConnected) continue;
            pendientes.delete(img);
            visibles.delete(img);
            if (alVista) alVista.unobserve(img);
        }
        const candidatas = [...pendientes].filter(aVista);
        const paso = uiColaImagenesPaso({ pendientes: candidatas.length, activas: enCurso.size, ahora: ahora(), ultimoInicio, ultimoCambio },
            { enVuelo, cadaMs, quietoMs: alVista ? quietoMs : 0 });
        if (paso.iniciar) {
            const i = uiRectMasCentrado(candidatas.map(c => c.getBoundingClientRect()), alto());
            iniciar(candidatas[i < 0 ? 0 : i]);
        }
        if (candidatas.length) programar(paso.esperarMs === null ? cadaMs : paso.esperarMs);
    }
    function reintentar(img) {
        const n = (intentos.get(img) || 0) + 1;
        intentos.set(img, n);
        if (n > reintentos) { terminadas.add(img); alFallar(img); return; }
        img.removeAttribute('src');
        programarEn(() => { if (img.isConnected) { pendientes.add(img); programar(0); } }, esperaMs);
    }
    const alVista = Observador ? new Observador((entradas) => {
        for (const e of entradas) {
            const img = e.target;
            if (e.isIntersecting) {
                visibles.add(img);
                if (!enCurso.has(img) && !terminadas.has(img)) pendientes.add(img);
            } else {
                visibles.delete(img);
                if (enCurso.has(img)) cancelar(img);
            }
        }
        ultimoCambio = ahora();
        programar(0);
    }, { rootMargin: '300px' }) : null;
    return {
        observar(img) {
            if (alVista) alVista.observe(img);
            else { pendientes.add(img); programar(0); }
        },
        estado: () => ({ pendientes: pendientes.size, enCurso: enCurso.size, visibles: visibles.size }),
    };
}
// ==== COLA IMAGENES PURO END ====

/** Imagen de un equipo con dos vistas: la foto del modelo y, si hay, la captura del canal. Flechas para pasar de una a
 *  otra (con deslizamiento) y clic sobre la captura o sobre la foto del modelo = `alAmpliar(vista, hayCaptura)`. Lo comparten el popup del dispositivo y el modal
 *  del activo. `vigente()`: false si se abrió otro equipo mientras cargaba (las respuestas viejas se ignoran);
 *  `alVisible(hay)`: hay algo para mostrar (sin placeholder, el que llama oculta el contenedor). Devuelve
 *  `{ alternar }` (la rueda del mouse del popup). */
function uiCarruselImagen({ wrapper, img, placeholder = null, prev, next, rutaModelo, rutaSnapshot,
    vigente = () => true, alAmpliar = null, alVisible = null }) {
    const ENTRADAS = ['popup-disp-slide-in-right', 'popup-disp-slide-in-left'];
    let modo = 'modelo';
    let tieneSnapshot = false;
    let modeloOk = Boolean(rutaModelo);
    const limpiarFantasmas = () => {
        if (wrapper) wrapper.querySelectorAll('.popup-disp-img-ghost').forEach(el => el.remove());
    };
    const avisarVisible = () => { if (alVisible) alVisible(modeloOk || tieneSnapshot || Boolean(placeholder)); };
    limpiarFantasmas();
    for (const b of [prev, next]) {
        if (!b) continue;
        b.classList.add('d-none');
        b.onclick = null;
    }
    if (img) {
        img.classList.remove('popup-disp-img-clickable', ...ENTRADAS);
        img.title = '';
        img.onclick = null;
    }
    if (placeholder) placeholder.classList.remove(...ENTRADAS);

    // Desliza hacia afuera una copia de lo que se ve (la vista nueva entra desde el otro lado)
    const deslizarSaliente = (direccion) => {
        const actual = (img && !img.classList.contains('d-none')) ? img
            : (placeholder && !placeholder.classList.contains('d-none') ? placeholder : null);
        if (!wrapper || !actual || actual.offsetWidth <= 0) return;
        const clon = actual.cloneNode(true);
        clon.removeAttribute('id');
        clon.classList.remove('popup-disp-img-clickable', ...ENTRADAS);
        clon.classList.add('popup-disp-img-ghost', direccion === 'next' ? 'popup-disp-slide-out-left'
            : 'popup-disp-slide-out-right');
        Object.assign(clon.style, { position: 'absolute', left: `${actual.offsetLeft}px`, top: `${actual.offsetTop}px`,
            width: `${actual.offsetWidth}px`, height: `${actual.offsetHeight}px`, margin: '0', pointerEvents: 'none',
            zIndex: '1' });
        wrapper.appendChild(clon);
        clon.addEventListener('animationend', () => clon.remove(), { once: true });
        setTimeout(() => { if (clon.parentNode) clon.remove(); }, 350);
    };

    const mostrar = (nuevo, direccion = null) => {
        if (!vigente()) return;
        const anterior = modo;
        modo = nuevo === 'snapshot' && tieneSnapshot && rutaSnapshot ? 'snapshot' : 'modelo';
        limpiarFantasmas();
        const animar = Boolean(direccion && anterior !== modo
            && !(typeof prefiereMovimientoReducido === 'function' && prefiereMovimientoReducido()));
        if (animar) deslizarSaliente(direccion);
        const verImagen = (ruta) => {
            if (img) {
                img.src = ruta;
                img.classList.remove('d-none');
            }
            if (placeholder) placeholder.classList.add('d-none');
        };
        if (modo === 'snapshot') {
            verImagen(rutaSnapshot);
            if (img) {
                img.classList.add('popup-disp-img-clickable');
                img.title = 'Clic para ampliar captura';
            }
        } else {
            if (img) {
                const ampliable = Boolean(alAmpliar && uiAmpliarImagenPermitido() && rutaModelo && modeloOk);       // la foto del modelo también se amplía
                img.classList.toggle('popup-disp-img-clickable', ampliable);
                img.title = ampliable ? 'Clic para ampliar' : '';
            }
            if (rutaModelo && modeloOk) {
                verImagen(rutaModelo);
            } else {
                if (img) img.classList.add('d-none');
                if (placeholder) placeholder.classList.remove('d-none');
            }
        }
        if (prev) prev.classList.toggle('d-none', modo !== 'snapshot');
        if (next) next.classList.toggle('d-none', modo === 'snapshot' || !tieneSnapshot);
        avisarVisible();
        if (animar) {
            const entrante = (modo === 'snapshot' || (rutaModelo && modeloOk)) ? img : placeholder;
            if (entrante) {
                entrante.classList.remove(...ENTRADAS);
                void entrante.offsetWidth;                  // reflow: la animación vuelve a empezar
                entrante.classList.add(direccion === 'next' ? ENTRADAS[0] : ENTRADAS[1]);
                entrante.addEventListener('animationend', () => entrante.classList.remove(...ENTRADAS), { once: true });
            }
        }
    };

    if (img) {
        img.onload = () => {
            if (!vigente()) return;
            img.classList.remove('d-none');
            if (placeholder) placeholder.classList.add('d-none');
        };
        img.onerror = () => {
            if (!vigente()) return;
            if (modo === 'modelo') modeloOk = false;      // la foto del modelo no está: placeholder (o nada)
            img.classList.add('d-none');
            if (placeholder) placeholder.classList.remove('d-none');
            avisarVisible();
        };
        img.onclick = (e) => {
            if (e) e.stopPropagation();
            if (!alAmpliar || !uiAmpliarImagenPermitido()) return;       // en el móvil tocar la imagen no hace nada
            if (modo === 'snapshot' && tieneSnapshot && rutaSnapshot) alAmpliar('captura', true);
            else if (modo === 'modelo' && rutaModelo && modeloOk) alAmpliar('modelo', tieneSnapshot);
        };
    }
    if (prev) prev.onclick = (e) => { e.stopPropagation(); mostrar('modelo', 'prev'); };
    if (next) next.onclick = (e) => { e.stopPropagation(); mostrar('snapshot', 'next'); };

    mostrar('modelo');                                    // por defecto, la foto del modelo (sin animación)
    if (rutaSnapshot) {                                   // ¿hay captura en disco? (en segundo plano)
        const precarga = new Image();
        precarga.onload = () => {
            if (!vigente()) return;
            tieneSnapshot = true;
            if (modo === 'modelo' && !placeholder && !(rutaModelo && modeloOk)) mostrar('snapshot');   // sin foto ni
            // placeholder (modal del activo): directo la captura
            else if (next && modo === 'modelo') next.classList.remove('d-none');
            avisarVisible();
        };
        precarga.onerror = () => {
            if (!vigente()) return;
            tieneSnapshot = false;
            mostrar('modelo');
        };
        precarga.src = rutaSnapshot;
    }
    return {
        alternar() {
            if (!tieneSnapshot) return;
            if (modo === 'modelo') mostrar('snapshot', 'next');
            else mostrar('modelo', 'prev');
        },
    };
}

// ==== UI COMUN END ====
