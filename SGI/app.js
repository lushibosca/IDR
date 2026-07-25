// ═══════════════════════════════════════════════════════
//  HELPERS BÁSICOS
// ═══════════════════════════════════════════════════════
const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// Detectar si es un dispositivo móvil/táctil para evitar abrir el teclado solo
const isMobile = () => window.matchMedia("(pointer: coarse)").matches;
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function escReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function formatFecha(iso) {
    if (!iso) return '';
    // Validar formato YYYY-MM-DD estricto antes de descomponer
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return esc(iso);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
        .normalize("NFD") // Separa las letras de sus acentos
        .replace(/[\u0300-\u036f]/g, "") // Borra los acentos separados
        .toLowerCase() // Todo a minúsculas
        .trim() // Saca espacios de los bordes
        .replace(/\s+/g, ' '); // Convierte múltiples espacios internos en uno solo
}

function subirArriba() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getHoyLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}

// Helper anti Prototype Pollution
function parseSeguro(jsonString) {
    if (!jsonString) return null;
    return JSON.parse(jsonString, (key, value) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
            console.warn('Intento de prototype pollution bloqueado');
            return undefined;
        }
        return value;
    });
}

function analizarBuscadorInteligente(queryOriginal) {
    // Dividimos el texto en palabras separadas por espacios
    const tokens = queryOriginal.trim().split(/\s+/);
    const dateTokens = [];
    const textTokens = [];

    const currentYear = new Date().getFullYear();

    tokens.forEach(token => {
        let parsed = null;
        let m;

        // Formato 1: DD/MM/YYYY o DD-MM-YYYY (ej: 15/05/2024)
        if ((m = token.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) {
            let d = m[1].padStart(2, '0');
            let mo = m[2].padStart(2, '0');
            let y = m[3];
            parsed = { start: `${y}-${mo}-${d}`, end: `${y}-${mo}-${d}` };
        }
        // Formato 2: MM/YYYY o MM-YYYY (ej: 1/2024 o 03/2025)
        else if ((m = token.match(/^(\d{1,2})[\/-](\d{4})$/))) {
            let mo = m[1].padStart(2, '0');
            let y = m[2];
            let start = `${y}-${mo}-01`;
            // Truco de JS: el día "0" del mes siguiente nos da el último día del mes actual
            let lastDay = new Date(y, parseInt(mo), 0).getDate();
            let end = `${y}-${mo}-${String(lastDay).padStart(2, '0')}`;
            parsed = { start, end };
        }
        // Formato 3: DD/MM o DD-MM (ej: 15/05 asume el año actual)
        else if ((m = token.match(/^(\d{1,2})[\/-](\d{1,2})$/))) {
            let d = m[1].padStart(2, '0');
            let mo = m[2].padStart(2, '0');
            parsed = { start: `${currentYear}-${mo}-${d}`, end: `${currentYear}-${mo}-${d}` };
        }

        // Si encontramos una fecha la separamos, sino es texto normal
        if (parsed) {
            dateTokens.push(parsed);
        } else {
            textTokens.push(token);
        }
    });

    let filtroDesde = null;
    let filtroHasta = null;

    if (dateTokens.length === 1) {
        // Si hay 1 sola fecha, buscamos exactamente en ese día (o en todo ese mes)
        filtroDesde = dateTokens[0].start;
        filtroHasta = dateTokens[0].end;
    } else if (dateTokens.length >= 2) {
        // Si hay 2 fechas, armamos el rango (usamos inicio de la primera y fin de la segunda)
        let f1 = dateTokens[0].start;
        let f2 = dateTokens[1].end;

        // Si las tipearon al revés, las enderezamos
        if (f1 > f2) {
            filtroDesde = dateTokens[1].start;
            filtroHasta = dateTokens[0].end;
        } else {
            filtroDesde = f1;
            filtroHasta = f2;
        }
    }

    return {
        // Devolvemos el texto limpio sin las fechas y en minúsculas
        textoLimpio: textTokens.join(' ').toLowerCase(),
        desde: filtroDesde,
        hasta: filtroHasta
    };
}

// ═══════════════════════════════════════════════════════
//  FIRMA DIGITAL (SHA-256)
// ═══════════════════════════════════════════════════════
async function generarFirma(obj) {
    if (!obj) return '0';
    // Extraemos solo los valores críticos para garantizar un orden determinista
    const core = {
        m: (obj.materiales || []).map(x => [x.id, x.nombre, x.categoria, x.unidad, x.umbralBajo ?? null, x.umbralAlto ?? null]),
        v: (obj.movimientos || []).map(x => [x.id, x.tipo, x.fecha, x.ticket, (x.lineas || []).map(l => [l.materialId, l.cantidad]), x.comentarios ?? null]),
        c: obj.categorias || [],
        h: (obj.herramientas || []).map(x => [x.id, x.nombre, x.fecha, x.cantidad])
    };

    const str = JSON.stringify(core);

    // Usamos Web Crypto API para SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convertimos el ArrayBuffer a un string hexadecimal
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}

async function verificarFirma(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (!raw._firma) return false;

    const firmaCalculada = await generarFirma(raw);
    return raw._firma === firmaCalculada;
}

// ═══════════════════════════════════════════════════════
//  VALIDACIÓN Y SANITIZACIÓN DE ESQUEMA JSON
// ═══════════════════════════════════════════════════════
const UNIDADES_VALIDAS = new Set(['u', 'm', 'kg', 'l', 'caja', 'rollo', 'par']);
const TIPOS_VALIDOS = new Set(['entrada', 'salida']);
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ID = /^[a-z0-9]+$/i;
const MAX_STR = 200;   // largo máximo de cualquier string de datos
const MAX_IMPORT_MB = 5;     // MB máximo para archivos importados

function _strSeguro(v, maxLen = MAX_STR) {
    if (typeof v !== 'string') return null;
    const s = v.trim().slice(0, maxLen);
    return s.length ? s : null;
}

function _sanitizarUmbral(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0 && n <= 9999) ? Math.floor(n) : null;
}

function _sanitizarMaterial(m) {
    if (!m || typeof m !== 'object') return null;
    const id = _strSeguro(m.id, 32);
    const nombre = _strSeguro(m.nombre, 50);
    if (!id || !RE_ID.test(id) || !nombre) return null;
    return {
        id,
        nombre,
        categoria: _strSeguro(m.categoria, 50) ?? '',
        unidad: UNIDADES_VALIDAS.has(m.unidad) ? m.unidad : 'u',
        stock: 0, // stock siempre se recalcula, nunca se importa
        umbralBajo: _sanitizarUmbral(m.umbralBajo),
        umbralAlto: _sanitizarUmbral(m.umbralAlto),
    };
}

function _sanitizarLinea(l) {
    if (!l || typeof l !== 'object') return null;
    const materialId = _strSeguro(l.materialId, 32);
    if (!materialId || !RE_ID.test(materialId)) return null;
    const cantidad = Number(l.cantidad);
    if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > 99999) return null;
    return { materialId, cantidad: Math.floor(cantidad) };
}

function _sanitizarMovimiento(m) {
    if (!m || typeof m !== 'object') return null;
    const id = _strSeguro(m.id, 32);
    const fecha = _strSeguro(m.fecha, 10);
    const ticket = _strSeguro(m.ticket, 30);
    if (!id || !RE_ID.test(id)) return null;
    if (!fecha || !RE_FECHA.test(fecha)) return null;
    if (!ticket) return null;
    if (!TIPOS_VALIDOS.has(m.tipo)) return null;
    if (!Array.isArray(m.lineas) || !m.lineas.length) return null;
    const lineas = m.lineas.map(_sanitizarLinea).filter(Boolean);
    if (!lineas.length) return null;
    const comentarios = _strSeguro(m.comentarios, 300) ?? null;
    return { id, tipo: m.tipo, fecha, ticket, lineas, comentarios };
}

function _sanitizarCategoria(c) {
    if (typeof c !== 'string') return null;
    const s = c.trim().slice(0, 50);
    return s.length ? s : null;
}

function _sanitizarHerramienta(h) {
    if (!h || typeof h !== 'object') return null;
    const id = _strSeguro(h.id, 32);
    const nombre = _strSeguro(h.nombre, 200);
    const fecha = _strSeguro(h.fecha, 10);
    if (!id || !RE_ID.test(id) || !nombre || !fecha || !RE_FECHA.test(fecha)) return null;
    const cantidadRaw = Number(h.cantidad);
    const cantidad = (Number.isFinite(cantidadRaw) && cantidadRaw >= 1) ? Math.floor(cantidadRaw) : 1;
    return { id, nombre, fecha, cantidad };
}

// Valida y limpia un objeto de estado completo (import / Gist / localStorage)
function sanitizarEstado(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(raw.materiales)) return null;
    const materiales = raw.materiales.map(_sanitizarMaterial).filter(Boolean).map(m => {
        // Migración: umbralBajo===0 y umbralAlto===0 simultáneamente es siempre inválido
        // (el sistema requiere bajo < alto). Fue generado por un bug previo (undefined→0).
        if (m.umbralBajo === 0 && m.umbralAlto === 0) {
            m.umbralBajo = null;
            m.umbralAlto = null;
        }
        return m;
    });
    const movimientos = Array.isArray(raw.movimientos)
        ? raw.movimientos.map(_sanitizarMovimiento).filter(Boolean)
        : [];
    const categorias = Array.isArray(raw.categorias)
        ? [...new Set(raw.categorias.map(_sanitizarCategoria).filter(Boolean))]
        : [];
    const herramientas = Array.isArray(raw.herramientas)
        ? raw.herramientas.map(_sanitizarHerramienta).filter(Boolean)
        : [];
    return { materiales, movimientos, categorias, herramientas };
}
let state = {
    materiales: [],
    movimientos: [],
    categorias: [],   // string[]
    herramientas: [], // { id, nombre, fecha, cantidad }
};

let editandoMaterialId = null;

function guardar() {
    try { localStorage.setItem('SGI_activos', JSON.stringify(state)); } catch (_) { }
    GistSync.subirAuto();
    AnioCombo.poblar();
}
function cargar() {
    // ── Migración de claves mat_ → SGI_ (una sola vez) ──
    try {
        const migKeys = [
            ['mat_activos', 'SGI_activos'],
            ['mat_dark', 'SGI_dark'],
            ['mat_tab', 'SGI_tab'],
            ['mat_tab_time', 'SGI_tab_time'],
            ['mat_gist_cfg', 'SGI_gist_cfg'],
        ];
        migKeys.forEach(([oldKey, newKey]) => {
            const val = localStorage.getItem(oldKey);
            if (val !== null && localStorage.getItem(newKey) === null) {
                localStorage.setItem(newKey, val);
            }
            if (val !== null) localStorage.removeItem(oldKey);
        });
    } catch (_) { }

    try {
        const raw = parseSeguro(localStorage.getItem('SGI_activos') || 'null');
        if (raw) {
            const limpio = sanitizarEstado(raw);
            if (limpio) state = limpio;
        }
    } catch (_) { }

    // Migración: si había herramientas en la clave separada, las incorporamos al state y limpiamos
    try {
        const viejas = parseSeguro(localStorage.getItem('SGI_herramientas') || 'null');
        if (Array.isArray(viejas) && viejas.length) {
            const idsActuales = new Set(state.herramientas.map(h => h.id));
            const migradas = viejas.map(_sanitizarHerramienta).filter(h => h && !idsActuales.has(h.id));
            if (migradas.length) {
                state.herramientas = [...state.herramientas, ...migradas];
                guardar();
            }
            localStorage.removeItem('SGI_herramientas');
        }
    } catch (_) { }
}

// ═══════════════════════════════════════════════════════
//  HISTORIAL (UNDO / REDO)
// ═══════════════════════════════════════════════════════
const historial = (() => {
    const MAX = 30;
    let _pasado = [];   // estados anteriores  [ { state, label } ]
    let _futuro = [];  // estados siguientes  [ { state, label } ]

    function _clonar(s) { return parseSeguro(JSON.stringify(s)); }

    function _actualizarBotones() {
        const btnU = document.getElementById('btn-undo');
        const btnR = document.getElementById('btn-redo');
        if (btnU) btnU.disabled = _pasado.length === 0;
        if (btnR) btnR.disabled = _futuro.length === 0;
    }

    // Llama esto ANTES de mutar el state, pasando un label descriptivo
    function empujar(label) {
        _pasado.push({ state: _clonar(state), label });
        if (_pasado.length > MAX) _pasado.shift();
        _futuro = [];   // cualquier nueva acción borra el futuro
        _actualizarBotones();
    }

    function undo() {
        if (!_pasado.length) return;
        const entrada = _pasado.pop();
        _futuro.push({ state: _clonar(state), label: entrada.label });
        if (_futuro.length > MAX) _futuro.shift();
        state = entrada.state;
        guardar();
        _refrescarTodo();
        _actualizarBotones();
        toast(`Deshecho: ${entrada.label}`, 'info');
    }

    function redo() {
        if (!_futuro.length) return;
        const entrada = _futuro.pop();
        _pasado.push({ state: _clonar(state), label: entrada.label });
        if (_pasado.length > MAX) _pasado.shift();
        state = entrada.state;
        guardar();
        _refrescarTodo();
        _actualizarBotones();
        toast(`Rehecho: ${entrada.label}`, 'info');
    }

    function _refrescarTodo() {
        renderStats();
        renderMateriales();
        renderMovimientos();
        renderCategorias();
        poblarSelectCategorias();
        renderHerramientas();
    }

    return { empujar, undo, redo, refrescarTodo: _refrescarTodo };
})();


// ═══════════════════════════════════════════════════════
//  MODAL MANAGER 
// ═══════════════════════════════════════════════════════
const MM = (() => {
    let _mdDown = false;
    const _onCerrar = {};

    function _onMD(e) { _mdDown = e.target === e.currentTarget; }
    function _onClick(e) { if (!_mdDown) return; if (e.target === e.currentTarget) _cerrarConPadre(e.target.id); }
    function _cerrarConPadre(id) { const fn = _onCerrar[id]; if (fn) fn(); else cerrar(id); }

    function abrir(id, optsOrCb) {
        const m = document.getElementById(id); if (!m) return;
        let cb, onEscape;
        if (typeof optsOrCb === 'function') { cb = optsOrCb; }
        else if (optsOrCb && typeof optsOrCb === 'object') { cb = optsOrCb.cb; onEscape = optsOrCb.onEscape; }
        if (onEscape) { _onCerrar[id] = onEscape; } else { delete _onCerrar[id]; }
        m.classList.add('show');
        document.body.classList.add('modal-open');
        setTimeout(() => { m.addEventListener('mousedown', _onMD); m.addEventListener('click', _onClick); }, 100);
        cb?.();
    }

    function cerrar(id, cb) {
        const m = document.getElementById(id); if (!m) return;
        delete _onCerrar[id];
        m.classList.remove('show');
        // Cerrar portal de sugerencias si estaba abierto dentro de este modal
        cerrarPortalSugerencias();
        // solo quitar modal-open si no quedan otros abiertos
        if (!document.querySelector('.modal.show')) document.body.classList.remove('modal-open');
        m.removeEventListener('mousedown', _onMD);
        m.removeEventListener('click', _onClick);
        cb?.();
    }

    function cerrarTodos() {
        document.querySelectorAll('.modal.show').forEach(m => {
            delete _onCerrar[m.id];
            m.classList.remove('show');
            m.removeEventListener('mousedown', _onMD);
            m.removeEventListener('click', _onClick);
        });
        document.body.classList.remove('modal-open');
    }

    function cerrarTop() {
        const abiertos = [...document.querySelectorAll('.modal.show')];
        if (!abiertos.length) return;
        const conHandler = abiertos.filter(m => _onCerrar[m.id]);
        const target = conHandler.length ? conHandler[conHandler.length - 1] : abiertos[abiertos.length - 1];
        _cerrarConPadre(target.id);
    }

    return { abrir, cerrar, cerrarTodos, cerrarTop };
})();

// ═══════════════════════════════════════════════════════
//  MODAL LOCKER
// ═══════════════════════════════════════════════════════
const ModalLocker = (() => {
    const CONFIGS = {
        'modal-material-editar': {
            lockBtnId: 'mat-editar-lock-btn',
            exemptIds: new Set(['mat-editar-cancelar-btn', 'mat-editar-lock-btn']),
        },
        'modal-editar-mov': {
            lockBtnId: 'editar-mov-lock-btn',
            exemptIds: new Set(['editar-mov-cancelar-btn', 'editar-mov-lock-btn']),
        },
    };

    const _bloqueado = {};

    function _aplicar(modalId, bloqueado) {
        const cfg = CONFIGS[modalId];
        if (!cfg) return;
        _bloqueado[modalId] = bloqueado;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.toggle('modal--bloqueado', bloqueado);

        const lockBtn = document.getElementById(cfg.lockBtnId);
        if (lockBtn) {
            lockBtn.classList.toggle('btn-input-side--baja', bloqueado);
            lockBtn.title = bloqueado ? 'Desbloquear edición' : 'Bloquear edición';
            const useEl = lockBtn.querySelector('use');
            if (useEl) useEl.setAttribute('href', bloqueado ? '#icon-lock' : '#icon-unlock');
        }

        modal.querySelectorAll('input, select, textarea, button').forEach(el => {
            if (cfg.exemptIds.has(el.id)) return;
            el.disabled = bloqueado;
        });
    }

    function resetear(modalId) { _aplicar(modalId, true); }
    function toggle(modalId) { _aplicar(modalId, !_bloqueado[modalId]); }
    function esBloqueado(modalId) { return !!_bloqueado[modalId]; }

    return { resetear, toggle, esBloqueado };
})();

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
const _toastQ = [];
let _toastBusy = false;
let _currentToast = null; // <--- Nueva variable para recordar el toast activo

function toast(msg, tipo = 'success') {
    // 1. Verificamos si el mensaje es EXACTAMENTE el que se está mostrando ahora
    if (_currentToast && _currentToast.msg === msg && _currentToast.tipo === tipo) return;

    // 2. Verificamos si el mensaje ya está esperando en la cola
    if (_toastQ.some(t => t.msg === msg && t.tipo === tipo)) return;

    _toastQ.push({ msg, tipo });
    _flushToast();
}

function _flushToast() {
    if (_toastBusy || !_toastQ.length) return;

    _currentToast = _toastQ.shift(); // Guardamos el toast que va a salir a pantalla
    _toastBusy = true;

    const el = document.getElementById('toast');
    el.textContent = _currentToast.msg;
    el.className = `toast show ${_currentToast.tipo}`;

    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => {
            el.className = 'toast';
            _toastBusy = false;
            _currentToast = null; // Borramos el recuerdo cuando termina la animación
            _flushToast();
        }, 300);
    }, 2500);
}

// ═══════════════════════════════════════════════════════
//  CONFIRMAR (con retorno a modal padre)
// ═══════════════════════════════════════════════════════
let _confirmarCb = null;
let _confirmarPadreId = null;

function confirmar(titulo, texto, cb) {
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-texto').textContent = texto;
    _confirmarCb = cb;

    // guardar el modal padre que esté abierto en este momento (si hay)
    const abiertos = [...document.querySelectorAll('.modal.show')];
    _confirmarPadreId = abiertos.length ? abiertos[abiertos.length - 1].id : null;

    MM.abrir('modal-confirmar', {
        onEscape: () => _volverAlPadre()
    });
}

function _volverAlPadre() {
    MM.cerrar('modal-confirmar');
    _confirmarCb = null;
    if (_confirmarPadreId) {
        const id = _confirmarPadreId;
        _confirmarPadreId = null;
        setTimeout(() => MM.abrir(id), 50);
    }
}

// Handlers de confirmar registrados en el IIFE de init (ver abajo)

// ═══════════════════════════════════════════════════════
//  DARK MODE
// ═══════════════════════════════════════════════════════
function toggleDarkMode() {
    // Cambiar document.body por document.documentElement
    const dark = document.documentElement.classList.toggle('dark-mode');
    const btn = document.getElementById('btn-dark-mode');
    if (btn) {
        btn.title = dark ? 'Modo claro' : 'Modo oscuro';
        const iconUse = btn.querySelector('use');
        if (iconUse) {
            iconUse.setAttribute('href', dark ? '#icon-sun' : '#icon-moon');
        }
    }
    try { localStorage.setItem('SGI_dark', dark ? '1' : '0'); } catch (_) { }
}

// ═══════════════════════════════════════════════════════
//  CATEGORÍAS
// ═══════════════════════════════════════════════════════
function agregarCategoria() {
    const input = document.getElementById('cat-nueva-input');
    const nombre = input.value.trim();
    if (!nombre) { input.classList.add('error'); return; }
    if (!state.categorias) state.categorias = [];
    if (state.categorias.some(c => c.toLowerCase() === nombre.toLowerCase())) {
        toast('Esa categoría ya existe', 'error'); return;
    }
    historial.empujar(`Agregar categoría "${nombre}"`);
    state.categorias.push(nombre);
    input.value = '';
    guardar();
    renderCategorias();
    poblarSelectCategorias();
    toast(`Categoría "${nombre}" agregada`);
}

function eliminarCategoria(nombre) {
    historial.empujar(`Eliminar categoría "${nombre}"`);
    state.categorias = state.categorias.filter(c => c !== nombre);
    guardar();
    renderCategorias();
    poblarSelectCategorias();
}

function renderCategorias() {
    const lista = document.getElementById('lista-categorias');
    const empty = document.getElementById('categorias-empty');
    if (!lista) return;
    const cats = state.categorias || [];
    if (!cats.length) { lista.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    lista.innerHTML = cats.map(c => `
        <div class="cat-item">
            <span>${esc(c)}</span>
            <button class="icon-btn btn-cat-delete" data-cat="${esc(c)}" title="Eliminar">
                <svg class="svg-icon"><use href="#icon-x"/></svg>
            </button>
        </div>
    `).join('');
}

function poblarSelectCategorias(sufijo = null) {
    const cats = state.categorias || [];
    const opciones = '<option value="">Sin categoría</option>' +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    const sufijosList = sufijo ? [sufijo] : ['nuevo', 'editar'];
    sufijosList.forEach(s => {
        const sel = document.getElementById(`mat-categoria-${s}`);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = opciones;
        if (current && cats.includes(current)) sel.value = current;
    });
}

// ═══════════════════════════════════════════════════════
//  EXPORTAR / IMPORTAR
// ═══════════════════════════════════════════════════════
async function exportarDatos() {
    const firma = await generarFirma(state);
    const exportData = { ...state, _firma: firma };
    const json = JSON.stringify(exportData, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiales_${getHoyLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Datos exportados');
}

let _importarParsed = null;

// Helper DOM para el label del dropzone — evita concatenar HTML con datos externos
function _setImportLabel(label, { tipo, titulo, sub, warn }) {
    label.textContent = '';
    const strong = document.createElement('strong');
    strong.className = tipo === 'ok' ? 'import-ok' : tipo === 'warn' ? 'text-orange' : 'import-fail';
    strong.textContent = titulo;
    label.appendChild(strong);
    label.appendChild(document.createElement('br'));
    if (sub) {
        const span = document.createElement('span');
        span.className = 'import-sub';
        span.textContent = sub;
        label.appendChild(span);
    }
    if (warn) {
        label.appendChild(document.createElement('br'));
        const spanW = document.createElement('span');
        spanW.className = 'text-red-sm';
        spanW.textContent = warn;
        label.appendChild(spanW);
    }
}

function onImportarFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const label = document.getElementById('importar-dropzone-label');
    const zone = document.getElementById('importar-dropzone');
    const btn = document.getElementById('importar-confirmar-btn');
    const btnCombinar = document.getElementById('importar-combinar-btn');

    // Límite de tamaño: MAX_IMPORT_MB MB
    if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
        _importarParsed = null;
        _setImportLabel(label, { tipo: 'fail', titulo: '✗ Archivo demasiado grande', sub: `El máximo permitido es ${MAX_IMPORT_MB} MB.` });
        zone.style.borderColor = 'var(--c-red)';
        btn.disabled = true;
        btnCombinar.disabled = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const raw = parseSeguro(ev.target.result);
            const esValida = await verificarFirma(raw);
            const parsed = sanitizarEstado(raw);
            if (!parsed) throw new Error('Esquema inválido');

            // Conteo de ítems descartados por sanitización
            const descMat = (raw.materiales?.length ?? 0) - parsed.materiales.length;
            const descMov = (raw.movimientos?.length ?? 0) - parsed.movimientos.length;
            const descCat = (raw.categorias?.length ?? 0) - parsed.categorias.length;
            const descHerr = (raw.herramientas?.length ?? 0) - parsed.herramientas.length;
            const hayDescartados = descMat > 0 || descMov > 0 || descCat > 0 || descHerr > 0;
            const partesDesc = [];
            if (descMat > 0) partesDesc.push(`${descMat} mat`);
            if (descMov > 0) partesDesc.push(`${descMov} mov`);
            if (descCat > 0) partesDesc.push(`${descCat} cat`);
            if (descHerr > 0) partesDesc.push(`${descHerr} herr`);
            const warnDesc = hayDescartados ? `⚠ Descartados por formato inválido: ${partesDesc.join(' · ')}` : null;

            _importarParsed = { ...parsed, _firmaValida: esValida };

            const herrLabel = parsed.herramientas.length ? ` · ${parsed.herramientas.length} herramientas` : '';
            const subLabel = `${parsed.materiales.length} materiales · ${parsed.movimientos.length} movimientos${herrLabel}`;
            if (esValida) {
                _setImportLabel(label, { tipo: 'ok', titulo: `✓ ${file.name}`, sub: subLabel, warn: warnDesc });
                zone.style.borderColor = hayDescartados ? 'var(--c-orange)' : 'var(--c-green)';
            } else {
                _setImportLabel(label, { tipo: 'warn', titulo: '⚠️ Archivo modificado externamente', sub: subLabel, warn: warnDesc });
                zone.style.borderColor = 'var(--c-orange)';
            }

            btn.disabled = false;
            btnCombinar.disabled = false;
        } catch (_) {
            _importarParsed = null;
            _setImportLabel(label, { tipo: 'fail', titulo: '✗ Archivo inválido', sub: 'El archivo no tiene el formato correcto o está dañado.' });
            zone.style.borderColor = 'var(--c-red)';
            btn.disabled = true;
            btnCombinar.disabled = true;
        }
    };
    reader.readAsText(file);
}

function importarDatos(modo) {
    if (!_importarParsed) { toast('Seleccioná un archivo válido', 'error'); return; }
    const parsed = _importarParsed;

    const alerta = parsed._firmaValida ? '' : '⚠️ ATENCIÓN: El archivo ha sido alterado externamente o esta corrupto.\n\n';

    if (modo === 'reemplazar') {
        confirmar('¿Importar y reemplazar?', alerta + 'Todos los datos actuales serán reemplazados por los del archivo.', () => {
            historial.empujar('Importar y reemplazar datos');
            state.materiales = parsed.materiales || [];
            state.movimientos = parsed.movimientos || [];
            state.categorias = parsed.categorias || [];
            state.herramientas = parsed.herramientas || [];
            
            const resumen = _resumenCambios({ matsNuevos: state.materiales.length, movsNuevos: state.movimientos.length, cats: state.categorias.length, herr: state.herramientas.length });
            _finalizarImport(`Datos reemplazados (${resumen})`);
        });
    } else {
        confirmar('¿Combinar datos?', alerta + 'Se agregarán los registros nuevos y se actualizarán los modificados.', () => {
            const novedades = _contarNovedades(parsed, false);

            if (!novedades.matsNuevos && !novedades.matsEditados && !novedades.movsNuevos && !novedades.movsEditados && !novedades.cats && !novedades.herr) {
                MM.cerrar('modal-importar');
                _importarParsed = null;
                toast('Sin cambios', 'info');
                return;
            }

            historial.empujar('Combinar datos importados');
            const combinados = _combinarDatosRemotos(parsed, false);
            _finalizarImport(`Datos combinados (${_resumenCambios(combinados)})`);
        });
    }
}

// Cuenta ítems del remoto que serían novedad respecto al state actual
function _contarNovedades(remoto, sanitizar = true) {
    const matIds = new Set(state.materiales.map(m => m.id));
    const movIds = new Set(state.movimientos.map(m => m.id));
    const catSet = new Set(state.categorias.map(c => c.toLowerCase()));
    const herrIds = new Set(state.herramientas.map(h => h.id));
    let matsNuevos = 0, matsEditados = 0, movsNuevos = 0, movsEditados = 0, cats = 0, herr = 0;

    (remoto.materiales || []).forEach(m => {
        const item = sanitizar ? _sanitizarMaterial(m) : m;
        if (!item) return;
        if (!matIds.has(item.id)) { matsNuevos++; } 
        else {
            const ex = state.materiales.find(x => x.id === item.id);
            if (ex && (ex.nombre !== item.nombre || ex.categoria !== item.categoria || ex.unidad !== item.unidad || ex.umbralBajo !== item.umbralBajo || ex.umbralAlto !== item.umbralAlto)) { matsEditados++; }
        }
    });
    (remoto.movimientos || []).forEach(m => {
        const item = sanitizar ? _sanitizarMovimiento(m) : m;
        if (!item) return;
        if (!movIds.has(item.id)) { movsNuevos++; } 
        else {
            const ex = state.movimientos.find(x => x.id === item.id);
            if (ex) {
                // Convertimos las líneas a string para ver si cambió alguna cantidad o material internamente
                const lineasEx = JSON.stringify(ex.lineas);
                const lineasItem = JSON.stringify(item.lineas);
                if (ex.ticket !== item.ticket || ex.fecha !== item.fecha || ex.tipo !== item.tipo || lineasEx !== lineasItem || (ex.comentarios ?? null) !== (item.comentarios ?? null)) { movsEditados++; }
            }
        }
    });
    (remoto.categorias || []).forEach(c => {
        const item = sanitizar ? _sanitizarCategoria(c) : c;
        if (item && !catSet.has(item.toLowerCase())) cats++;
    });
    (remoto.herramientas || []).forEach(h => {
        const item = sanitizar ? _sanitizarHerramienta(h) : h;
        if (item && !herrIds.has(item.id)) herr++;
    });

    return { matsNuevos, matsEditados, movsNuevos, movsEditados, cats, herr };
}

// Combina e impacta los datos detectados
function _combinarDatosRemotos(remoto, sanitizar = true) {
    let matsNuevos = 0, matsEditados = 0, movsNuevos = 0, movsEditados = 0, cats = 0, herr = 0;
    const matIds = new Set(state.materiales.map(m => m.id));
    const movIds = new Set(state.movimientos.map(m => m.id));
    const catSet = new Set(state.categorias.map(c => c.toLowerCase()));
    const herrIds = new Set(state.herramientas.map(h => h.id));

    (remoto.materiales || []).forEach(m => {
        const limpio = sanitizar ? _sanitizarMaterial(m) : m;
        if (!limpio) return;
        if (!matIds.has(limpio.id)) {
            state.materiales.push(limpio);
            matIds.add(limpio.id);
            matsNuevos++;
        } else {
            const ex = state.materiales.find(x => x.id === limpio.id);
            if (ex) {
                let mod = false;
                if (ex.nombre !== limpio.nombre) { ex.nombre = limpio.nombre; mod = true; }
                if (ex.categoria !== limpio.categoria) { ex.categoria = limpio.categoria; mod = true; }
                if (ex.unidad !== limpio.unidad) { ex.unidad = limpio.unidad; mod = true; }
                if (ex.umbralBajo !== limpio.umbralBajo) { ex.umbralBajo = limpio.umbralBajo; mod = true; }
                if (ex.umbralAlto !== limpio.umbralAlto) { ex.umbralAlto = limpio.umbralAlto; mod = true; }
                if (mod) matsEditados++;
            }
        }
    });

    (remoto.movimientos || []).forEach(m => {
        const limpio = sanitizar ? _sanitizarMovimiento(m) : m;
        if (!limpio) return;
        if (!movIds.has(limpio.id)) { 
            state.movimientos.push(limpio); 
            movIds.add(limpio.id); 
            movsNuevos++; 
        } else {
            const ex = state.movimientos.find(x => x.id === limpio.id);
            if (ex) {
                let mod = false;
                if (ex.ticket !== limpio.ticket) { ex.ticket = limpio.ticket; mod = true; }
                if (ex.fecha !== limpio.fecha) { ex.fecha = limpio.fecha; mod = true; }
                if (ex.tipo !== limpio.tipo) { ex.tipo = limpio.tipo; mod = true; }
                const lineasEx = JSON.stringify(ex.lineas);
                const lineasLimpio = JSON.stringify(limpio.lineas);
                if (lineasEx !== lineasLimpio) {
                    ex.lineas = limpio.lineas;
                    mod = true;
                }
                if ((ex.comentarios ?? null) !== (limpio.comentarios ?? null)) { ex.comentarios = limpio.comentarios; mod = true; }
                if (mod) movsEditados++;
            }
        }
    });

    (remoto.categorias || []).forEach(c => {
        const limpio = sanitizar ? _sanitizarCategoria(c) : c;
        if (limpio && !catSet.has(limpio.toLowerCase())) { state.categorias.push(limpio); catSet.add(limpio.toLowerCase()); cats++; }
    });

    (remoto.herramientas || []).forEach(h => {
        const limpio = sanitizar ? _sanitizarHerramienta(h) : h;
        if (limpio && !herrIds.has(limpio.id)) { state.herramientas.push(limpio); herrIds.add(limpio.id); herr++; }
    });

    return { matsNuevos, matsEditados, movsNuevos, movsEditados, cats, herr };
}

// Arma un resumen legible de cambios usando el nuevo objeto estructurado
function _resumenCambios(novedades) {
    const partes = [];
    if (novedades.matsNuevos) partes.push(`+${novedades.matsNuevos} mat`);
    if (novedades.matsEditados) partes.push(`~${novedades.matsEditados} mat act`);
    if (novedades.movsNuevos) partes.push(`+${novedades.movsNuevos} mov`);
    if (novedades.movsEditados) partes.push(`~${novedades.movsEditados} mov act`);
    if (novedades.cats) partes.push(`+${novedades.cats} cat`);
    if (novedades.herr) partes.push(`+${novedades.herr} herr`);
    return partes.join(' · ');
}

function _finalizarImport(msg) {
    guardar();
    MM.cerrar('modal-importar');
    _importarParsed = null;
    historial.refrescarTodo();
    toast(msg);
}

function restablecerDatos() {
    confirmar(
        '¿Restablecer todos los datos?',
        'Se eliminarán todos los materiales, movimientos y categorías. Esta acción se puede deshacer antes de cerrar la página',
        () => {
            MM.cerrar('modal-ajustes');
            historial.empujar('Restablecer todos los datos');
            state.materiales = [];
            state.movimientos = [];
            state.categorias = [];
            state.herramientas = [];
            guardar();
            historial.refrescarTodo();
            toast('Datos restablecidos');
        }
    );
}

// ═══════════════════════════════════════════════════════
//  BÚSQUEDA GLOBAL (con Debounce)
// ═══════════════════════════════════════════════════════
let _busqTimer = null;

function onBusqGlobal() {
    const val = document.getElementById('busq-global').value;
    const btn = document.getElementById('busq-clear-btn');
    if (btn) btn.style.display = val ? 'flex' : 'none';

    // 1. Cancelamos la búsqueda anterior si el usuario sigue escribiendo
    if (_busqTimer) clearTimeout(_busqTimer);

    // 2. Programamos la nueva búsqueda para dentro de 300ms
    _busqTimer = setTimeout(() => {
        renderMateriales();
        renderMovimientos();
    }, 300);
}

function limpiarBusqueda() {
    // Cancelamos cualquier búsqueda pendiente por seguridad
    if (_busqTimer) clearTimeout(_busqTimer);

    const inp = document.getElementById('busq-global');
    const btn = document.getElementById('busq-clear-btn');
    inp.value = '';
    if (btn) btn.style.display = 'none';

    // Si hay filtro de año activo, también lo limpiamos (setAnioFiltro ya re-renderiza todo)
    if (_anioFiltro) {
        setAnioFiltro(null);
        return;
    }

    // Ejecutamos el renderizado de inmediato al limpiar
    renderMateriales();
    renderMovimientos();
}

function buscarMovimientosMaterialEditar() {
    // Tomamos el valor actual (si hay comas por accidente, tomamos la primera parte)
    const nombre = document.getElementById('mat-nombre-editar').value.split(',')[0].trim();
    if (!nombre) return;

    // 1. Cerramos el modal de edición
    MM.cerrar('modal-material-editar');

    // 2. El texto de búsqueda es solo el nombre del material.
    //    Si hay filtro de año activo (_anioFiltro), renderMovimientos ya lo aplica
    //    de forma independiente, sin necesidad de meterlo en el buscador.
    const textoBusqueda = nombre;

    // 3. Escribimos en el buscador global y mostramos el botón de limpiar (la "X")
    const busqEl = document.getElementById('busq-global');
    const btnClear = document.getElementById('busq-clear-btn');

    busqEl.value = textoBusqueda;
    if (btnClear) btnClear.style.display = 'flex';

    // 4. Cambiamos de pestaña. switchTab ya se encarga de renderizar la vista con el filtro activo.
    if (_tabActual !== 'movimientos') {
        switchTab('movimientos');
    } else {
        // Por si acaso el usuario ya estaba en la pestaña de movimientos, forzamos el render
        if (_busqTimer) clearTimeout(_busqTimer);
        renderMovimientos();
    }

    // Sincronizamos silenciosamente el inventario oculto
    renderMateriales();
}

// ═══════════════════════════════════════════════════════
//  HERRAMIENTAS
// ═══════════════════════════════════════════════════════
function renderHerramientas() {
    const lista = state.herramientas || [];
    const contenedor = document.getElementById('lista-herramientas');
    const empty = document.getElementById('herramientas-empty');
    if (!contenedor) return;

    if (!lista.length) {
        contenedor.innerHTML = '';
        if (empty) empty.classList.remove('empty-state-hidden');
        return;
    }
    if (empty) empty.classList.add('empty-state-hidden');

    // Más nuevos primero
    const ordenadas = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));

    contenedor.innerHTML = ordenadas.map(h => `
        <div class="herr-item" data-id="${esc(h.id)}">
            <div class="herr-item-info">
                <span class="herr-item-fecha">${formatFecha(h.fecha)}</span>
                <span class="herr-item-nombre">${esc(h.nombre)}</span>
            </div>
            <span class="herr-item-cantidad">${esc(String(h.cantidad))}</span>
            <button class="icon-btn btn-cat-delete btn-herr-delete" data-id="${esc(h.id)}" title="Eliminar">
                <svg class="svg-icon"><use href="#icon-x"/></svg>
            </button>
        </div>
    `).join('');
}

function agregarHerramienta() {
    const fechaEl = document.getElementById('herr-fecha-input');
    const fecha = fechaEl ? fechaEl.value.trim() : '';
    const lineas = _lineasState.herramienta.lineas;

    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        if (fechaEl) fechaEl.classList.add('error');
        toast('Fecha inválida', 'error'); return;
    } else if (fechaEl) {
        fechaEl.classList.remove('error');
    }

    if (!lineas.length) { toast('Agregá al menos una herramienta', 'error'); return; }

    let ok = true;
    for (const l of lineas) {
        const nombre = (l._nombre || '').trim();
        const cant = Math.floor(Number(l.cantidad));

        const inputNombre = document.getElementById(`linea-input-herramienta-${l.lid}`);
        const inputQty = document.getElementById(`linea-qty-herramienta-${l.lid}`);

        if (!nombre) { if (inputNombre) inputNombre.classList.add('error'); ok = false; }
        if (!cant || cant < 1 || cant > 999) { if (inputQty) inputQty.classList.add('error'); ok = false; }

        l._nombreClean = nombre;
        l._cantidadClean = cant;
    }

    if (!ok) { toast('Completá todos los campos', 'error'); return; }

    historial.empujar(`Agregar ${lineas.length} herramientas`);

    lineas.forEach(l => {
        state.herramientas.push({ id: uid(), fecha, nombre: l._nombreClean.slice(0, 200), cantidad: l._cantidadClean });
    });

    guardar();

    _lineasState.herramienta.lineas = [];
    _lineasState.herramienta.counter = 0;

    UI.cerrarNuevaHerramienta();
    toast('Herramientas registradas');
}

function eliminarHerramienta(id) {
    const h = state.herramientas.find(x => x.id === id);
    const label = h ? `Eliminar herramienta "${h.nombre}"` : 'Eliminar herramienta';
    historial.empujar(label);
    state.herramientas = state.herramientas.filter(x => x.id !== id);
    guardar();
    renderHerramientas();
    toast('Herramienta eliminada', 'info');
}

// ═══════════════════════════════════════════════════════
//  UI — NAVEGACIÓN DE MODALES CON PADRE (patrón CCTV)
// ═══════════════════════════════════════════════════════
const UI = {
    // Helper: cierra `desde`, espera 150ms, ejecuta `fn`
    _nav(desde, fn) {
        MM.cerrar(desde);
        setTimeout(fn, 150);
    },

    // Helper: cierra un modal hijo y vuelve a ajustes
    _cerrarAjustesHijo(id) {
        UI._nav(id, () => UI.abrirAjustes());
    },

    abrirAjustes() {
        MM.abrir('modal-ajustes');
    },

    abrirCategorias() {
        UI._nav('modal-ajustes', () => {
            renderCategorias();
            MM.abrir('modal-categorias', { onEscape: () => UI.cerrarCategorias() });
        });
    },

    cerrarCategorias() {
        UI._cerrarAjustesHijo('modal-categorias');
    },

    abrirImportar() {
        UI._nav('modal-ajustes', () => {
            // Reset del estado del modal
            document.getElementById('importar-file-input').value = '';
            document.getElementById('importar-dropzone-label').textContent = 'Seleccioná o arrastrá un archivo .json';
            document.getElementById('importar-dropzone').style.borderColor = '';
            document.getElementById('importar-confirmar-btn').disabled = true;
            document.getElementById('importar-combinar-btn').disabled = true;
            _importarParsed = null;

            // Abrimos el modal y pasamos un callback (cb)
            MM.abrir('modal-importar', {
                onEscape: () => UI.cerrarImportar(),
                cb: () => {
                    // Pequeño delay (400ms) para que la animación del modal 
                    // termine antes de que salte la ventana del sistema
                    setTimeout(() => {
                        document.getElementById('importar-file-input').click();
                    }, 400);
                }
            });
        });
    },

    cerrarImportar() {
        UI._cerrarAjustesHijo('modal-importar');
    },

    abrirGist() {
        UI._nav('modal-ajustes', () => {
            GistSync.poblarModal();
            MM.abrir('modal-gist', { onEscape: () => UI.cerrarGist() });
        });
    },

    cerrarGist() {
        UI._cerrarAjustesHijo('modal-gist');
    },

    abrirShortcuts() {
        UI._nav('modal-ajustes', () => MM.abrir('modal-shortcuts', { onEscape: () => UI.cerrarShortcuts() }));
    },

    cerrarShortcuts() {
        UI._cerrarAjustesHijo('modal-shortcuts');
    },

    abrirReporte() {
        generarReporte();
        if (!state.materiales.length) return; // generarReporte ya emitió el toast
        UI._nav('modal-ajustes', () => MM.abrir('modal-reporte', { onEscape: () => UI.cerrarReporte() }));
    },

    cerrarReporte() {
        UI._cerrarAjustesHijo('modal-reporte');
    },

    _herrPadreId: null, // <--- Nueva variable para recordar de dónde venimos

    abrirHerramientas(origen = null) {
        if (origen) this._herrPadreId = origen;

        if (this._herrPadreId === 'ajustes' && origen === 'ajustes') {
            // Flujo 1: Venimos desde Ajustes
            UI._nav('modal-ajustes', () => {
                renderHerramientas();
                MM.abrir('modal-herramientas', { onEscape: () => UI.cerrarHerramientas() });
            });
        } else {
            // Flujo 2: Venimos del FAB o estamos volviendo desde "Nueva Herramienta"
            renderHerramientas();
            MM.abrir('modal-herramientas', { onEscape: () => UI.cerrarHerramientas() });
        }
    },

    cerrarHerramientas() {
        // Al cerrar la lista, decidimos a dónde ir según el origen original
        if (this._herrPadreId === 'ajustes') {
            this._herrPadreId = null;
            UI._cerrarAjustesHijo('modal-herramientas');
        } else {
            this._herrPadreId = null;
            MM.cerrar('modal-herramientas'); // Cierra directo a la pantalla principal
        }
    },

    abrirNuevaHerramienta(origen = null) {
        if (origen) this._herrPadreId = origen;

        const accionAbrir = () => {
            const fechaEl = document.getElementById('herr-fecha-input');
            if (fechaEl) fechaEl.value = getHoyLocal();

            // Prepara las líneas si tenés la carga múltiple activa
            if (typeof _lineasState !== 'undefined' && _lineasState.herramienta) {
                _lineasState.herramienta.lineas = [];
                _lineasState.herramienta.counter = 0;
                agregarLinea('herramienta');
            }

            MM.abrir('modal-herramienta-nuevo', { onEscape: () => UI.cerrarNuevaHerramienta() });
        };

        // Si venimos del modal de la lista, lo cerramos con animación suave primero
        const modalLista = document.getElementById('modal-herramientas');
        if (modalLista && modalLista.classList.contains('show')) {
            UI._nav('modal-herramientas', accionAbrir);
        } else {
            accionAbrir(); // Si venimos del FAB, abrimos directo
        }
    },

    cerrarNuevaHerramienta() {
        UI._nav('modal-herramienta-nuevo', () => {
            // Regresa a la lista general, la cual sabe cómo cerrarse gracias a _herrPadreId
            UI.abrirHerramientas();
        });
    },

    // ──  Gestor de Long Press para los meses ──
    _mesPressTimer: null,
    _mesLongPressed: false,

    handleMesDown(e, el) {
        // Solo reaccionar al botón principal (0 = izquierdo/toque)
        if (e.button !== 0) return;

        UI._mesLongPressed = false;

        // Arrancamos el cronómetro (800 milisegundos)
        UI._mesPressTimer = setTimeout(() => {
            UI._mesLongPressed = true;

            // Si el celu soporta vibración, hace un "tact" sutil
            if (navigator.vibrate) navigator.vibrate(40);

            // Nos fijamos si el mes que apretaste estaba abierto o cerrado
            const isCurrentlyOpen = el.parentElement.classList.contains('open');

            // Buscamos el contenedor del año entero
            const yearGroup = el.closest('.year-group');
            if (!yearGroup) return;

            // Abrimos o cerramos TODOS los meses de ese año
            const monthGroups = yearGroup.querySelectorAll('.month-group');
            const anioTxt = yearGroup.querySelector('.year-summary-inner')?.textContent?.trim().replace(/\D/g, '');
            monthGroups.forEach(g => {
                if (isCurrentlyOpen) {
                    g.classList.remove('open');
                } else {
                    g.classList.add('open');
                }
                // Persistimos el nuevo estado de cada mes
                if (anioTxt) {
                    const span = g.querySelector('.mes-separador span')?.textContent?.trim() || '';
                    const partes = span.split(' ');
                    if (partes.length === 2) {
                        const mesIdx = NOMBRES_MESES.indexOf(partes[0]);
                        if (mesIdx >= 0) {
                            const mesKey = String(mesIdx + 1).padStart(2, '0');
                            _histSetColapso(`mes-${anioTxt}-${mesKey}`, !isCurrentlyOpen);
                        }
                    }
                }
            });

        }, 500);
    },

    handleMesUp(e, el) {
        // Si soltó el dedo antes del segundo, cancelamos el timer
        if (UI._mesPressTimer) clearTimeout(UI._mesPressTimer);

        // Solo reaccionar al botón principal (0 = izquierdo/toque)
        if (e.button !== 0) return;

        // Si NO fue un long press, lo tratamos como un click normal
        if (!UI._mesLongPressed) {
            const mg = el.parentElement;
            mg.classList.toggle('open');
            // Persistimos el estado: el texto del span es "Enero 2024" etc.
            const txt = el.querySelector('span')?.textContent?.trim() || '';
            const partes = txt.split(' ');
            if (partes.length === 2) {
                const mesIdx = NOMBRES_MESES.indexOf(partes[0]);
                const anioTxt = partes[1];
                if (mesIdx >= 0 && anioTxt) {
                    const mesKey = String(mesIdx + 1).padStart(2, '0');
                    _histSetColapso(`mes-${anioTxt}-${mesKey}`, mg.classList.contains('open'));
                }
            }
        }
    },

    handleMesCancel() {
        // Si el usuario movió el dedo para scrollear, cancelamos todo
        if (UI._mesPressTimer) clearTimeout(UI._mesPressTimer);
    }
};

// ═══════════════════════════════════════════════════════
//  TABS  (con animación fade-out → fade-in, igual que CCTV)
// ═══════════════════════════════════════════════════════
let _tabActual = 'dashboard';

function switchTab(tab) {
    // Si el usuario toca la pestaña en la que ya está parado...
    if (_tabActual === tab) {
        let limpioAlgo = false;

        // 1. Limpiamos la barra de búsqueda si tiene texto
        if (document.getElementById('busq-global').value) {
            limpiarBusqueda();
            limpioAlgo = true;
        }

        // 2. Limpiamos el filtro de año si hay alguno seleccionado
        if (_anioFiltro) {
            setAnioFiltro(null);
            limpioAlgo = true;
        }

        // Si no limpió nada, no hace nada extra
        return;
    }

    // Si hay filtro de año activo y el usuario cambia a movimientos sin búsqueda, lo quitamos
    if (tab === 'movimientos' && _anioFiltro && !document.getElementById('busq-global').value) {
        setAnioFiltro(null);
    }

    ['dashboard', 'movimientos'].forEach(t =>
        document.getElementById(`tab-${t}`).classList.toggle('activa', t === tab)
    );
    try {
        localStorage.setItem('SGI_tab', tab);
        localStorage.setItem('SGI_tab_time', Date.now().toString()); // <--- Guardamos la hora exacta
    } catch (_) { }

    const saliente = document.getElementById(`panel-${_tabActual}`);
    const entrante = document.getElementById(`panel-${tab}`);
    _tabActual = tab;

    const headerTabTitle = document.getElementById('header-tab-title');
    if (headerTabTitle) {
        const icono = tab === 'dashboard' ? '#icon-dashboard' : '#icon-movements';
        const texto = tab === 'dashboard' ? 'Dashboard' : 'Movimientos';
        headerTabTitle.innerHTML = `<svg class="svg-icon"><use href="${icono}"/></svg> ${texto}`;
    }

    // animación: saliente hace fade-out, entrante hace fade-in
    saliente.classList.remove('activa');
    saliente.classList.add('tab-saliendo');

    setTimeout(() => {
        saliente.classList.remove('tab-saliendo');
        entrante.classList.add('activa', 'tab-entrando');
        entrante.addEventListener('animationend', () => {
            entrante.classList.remove('tab-entrando');
        }, { once: true });
    }, 180);

    if (tab === 'dashboard') { renderStats(); renderMateriales(); }
    else { renderMovimientos(); }
}

// ═══════════════════════════════════════════════════════
//  MATERIALES
// ═══════════════════════════════════════════════════════
let _materialPadreId = null; // Guarda si venimos de 'ajustes'

function abrirModalMaterial(id = null, padreId = null) {
    _materialPadreId = padreId; // Registramos quién abrió el modal
    editandoMaterialId = id;
    const m = id ? state.materiales.find(x => x.id === id) : null;
    const sufijo = m ? 'editar' : 'nuevo';
    const modalId = `modal-material-${sufijo}`;

    MM.abrir(modalId, {
        onEscape: () => cerrarModalMaterial(sufijo),
        cb: () => {
            if (sufijo === 'editar') ModalLocker.resetear('modal-material-editar');
            poblarSelectCategorias(sufijo);
            document.getElementById(`mat-nombre-${sufijo}`).value = m ? m.nombre : '';
            document.getElementById(`mat-categoria-${sufijo}`).value = m ? (m.categoria || '') : '';
            document.getElementById(`mat-unidad-${sufijo}`).value = m ? (m.unidad || 'u') : 'u';
            document.getElementById(`mat-umbral-bajo-${sufijo}`).value = (m && m.umbralBajo != null) ? m.umbralBajo : '';
            document.getElementById(`mat-umbral-alto-${sufijo}`).value = (m && m.umbralAlto != null) ? m.umbralAlto : '';
            if (!isMobile()) {
                setTimeout(() => document.getElementById(`mat-nombre-${sufijo}`).focus(), 200);
            }
        }
    });
}

function cerrarModalMaterial(sufijo) {
    if (_materialPadreId === 'ajustes') {
        _materialPadreId = null; // Limpiamos el estado
        UI._nav(`modal-material-${sufijo}`, () => UI.abrirAjustes()); // Volvemos a ajustes
    } else {
        MM.cerrar(`modal-material-${sufijo}`);
    }
}

function guardarMaterial() {
    const sufijo = editandoMaterialId ? 'editar' : 'nuevo';
    const rawNombre = document.getElementById(`mat-nombre-${sufijo}`).value;
    const categoria = document.getElementById(`mat-categoria-${sufijo}`).value.trim();
    const unidad = document.getElementById(`mat-unidad-${sufijo}`).value;

    // Umbrales — vacío = null, número válido = entero
    const rawBajo = document.getElementById(`mat-umbral-bajo-${sufijo}`).value.trim();
    const rawAlto = document.getElementById(`mat-umbral-alto-${sufijo}`).value.trim();
    const umbralBajo = rawBajo !== '' ? parseInt(rawBajo, 10) : null;
    const umbralAlto = rawAlto !== '' ? parseInt(rawAlto, 10) : null;

    // Validar umbrales
    if (umbralBajo !== null && (!Number.isFinite(umbralBajo) || umbralBajo < 0)) {
        document.getElementById(`mat-umbral-bajo-${sufijo}`).classList.add('error');
        toast('El umbral bajo debe ser un número positivo', 'error'); return;
    }
    if (umbralAlto !== null && (!Number.isFinite(umbralAlto) || umbralAlto < 0)) {
        document.getElementById(`mat-umbral-alto-${sufijo}`).classList.add('error');
        toast('El umbral alto debe ser un número positivo', 'error'); return;
    }
    if (umbralBajo !== null && umbralAlto !== null && umbralBajo >= umbralAlto) {
        document.getElementById(`mat-umbral-alto-${sufijo}`).classList.add('error');
        toast('El umbral alto debe ser mayor que el umbral bajo', 'error'); return;
    }

    // Dividimos por comas, quitamos espacios en blanco de los bordes y colapsamos espacios múltiples internos
    const nombresArray = rawNombre.split(',').map(n => n.trim().replace(/\s+/g, ' ')).filter(Boolean);

    if (!nombresArray.length) {
        document.getElementById(`mat-nombre-${sufijo}`).classList.add('error');
        toast('Ingresá al menos un nombre para el material', 'error');
        return;
    }

    if (editandoMaterialId) {
        // ── MODO EDICIÓN ──
        if (nombresArray.length > 1) {
            toast('Al editar, solo podés usar un nombre (sin comas)', 'info');
            return;
        }

        const nombre = nombresArray[0];
        const normBuscado = normalizarTexto(nombre);

        // Comparamos los textos normalizados
        const esDuplicado = state.materiales.some(m =>
            normalizarTexto(m.nombre) === normBuscado && m.id !== editandoMaterialId
        );

        if (esDuplicado) {
            document.getElementById(`mat-nombre-editar`).classList.add('error');
            toast('Ya existe un material con ese nombre (o similar)', 'error');
            return;
        }

        const m = state.materiales.find(x => x.id === editandoMaterialId);
        if (m) {
            const catActual = m.categoria || '';
            const uniActual = m.unidad || 'u';
            const bajoActual = m.umbralBajo ?? null;
            const altoActual = m.umbralAlto ?? null;

            if (m.nombre === nombre && catActual === categoria && uniActual === unidad &&
                bajoActual === umbralBajo && altoActual === umbralAlto) {
                MM.cerrar('modal-material-editar');
                toast('Sin cambios', 'info');
                return;
            }

            historial.empujar(`Editar material "${m.nombre}"`);
            m.nombre = nombre;
            m.categoria = categoria;
            m.unidad = unidad;
            m.umbralBajo = umbralBajo;
            m.umbralAlto = umbralAlto;
        }
        toast('Material actualizado');

    } else {
        // ── MODO NUEVO (CARGA MASIVA) ──

        // 1. Validar si alguno de la lista ya existe ANTES de guardar nada
        for (const nombre of nombresArray) {
            const normBuscado = normalizarTexto(nombre);
            const esDuplicado = state.materiales.some(m => normalizarTexto(m.nombre) === normBuscado);

            if (esDuplicado) {
                document.getElementById(`mat-nombre-nuevo`).classList.add('error');
                toast(`Ya existe el material "${nombre}" (o similar)`, 'error');
                return; // Frenamos todo
            }
        }

        // 2. Si pasaron la prueba, los guardamos a todos
        const esMasivo = nombresArray.length > 1;
        historial.empujar(esMasivo ? `Agregar ${nombresArray.length} materiales` : 'Agregar material');

        for (const nombre of nombresArray) {
            state.materiales.push({
                id: uid(),
                nombre,
                categoria,
                unidad,
                stock: 0,
                umbralBajo: nombresArray.length === 1 ? umbralBajo : null,
                umbralAlto: nombresArray.length === 1 ? umbralAlto : null,
            });
        }

        toast(esMasivo ? `${nombresArray.length} materiales agregados` : 'Material agregado');
    }

    guardar();
    MM.cerrar(`modal-material-${sufijo}`);
    renderMateriales();
    renderStats();
}

function eliminarMaterialDesdeModal() {
    if (!editandoMaterialId) return;
    const m = state.materiales.find(x => x.id === editandoMaterialId);
    if (!m) return;

    confirmar(`¿Eliminar "${m.nombre}"?`, 'Esta acción se puede deshacer antes de cerrar la página', () => {
        historial.empujar(`Eliminar material "${m.nombre}"`);
        state.materiales = state.materiales.filter(x => x.id !== editandoMaterialId);
        editandoMaterialId = null;

        guardar();
        renderMateriales();
        renderStats();

        // Agregamos la orden para cerrar el modal
        MM.cerrar('modal-material-editar');

        toast('Material eliminado');
    });
}

// ═══════════════════════════════════════════════════════
//  STOCK CALCULADO
// ═══════════════════════════════════════════════════════
function calcStock(materialId) {
    return state.movimientos.reduce((total, mov) => {
        // Sumamos todas las líneas que coincidan con este material (por si hay duplicados históricos)
        const sumaLineas = mov.lineas
            .filter(l => l.materialId === materialId)
            .reduce((sum, l) => sum + l.cantidad, 0);

        if (sumaLineas === 0) return total;
        return mov.tipo === 'entrada' ? total + sumaLineas : total - sumaLineas;
    }, 0);
}

// ═══════════════════════════════════════════════════════
//  ORDENAMIENTO DE MATERIALES
// ═══════════════════════════════════════════════════════
let _sortMat = { col: 'nombre', dir: 'asc' }; // Estado global de ordenamiento

function ordenarMateriales(col) {
    // Si toco la misma columna, invierto la dirección. Si es nueva, la pongo ascendente.
    if (_sortMat.col === col) {
        _sortMat.dir = _sortMat.dir === 'asc' ? 'desc' : 'asc';
    } else {
        _sortMat.col = col;
        _sortMat.dir = 'asc';
    }
    renderMateriales();
}

// ═══════════════════════════════════════════════════════
//  FILTRO POR AÑO (inventario + stats)
// ═══════════════════════════════════════════════════════
let _anioFiltro = null;

const AnioCombo = (() => {
    function _anios() {
        return [...new Set(state.movimientos.map(m => m.fecha.substring(0, 4)))].sort((a, b) => b - a);
    }

    function poblar() {
        const inp = document.getElementById('input-anio-filtro');
        if (inp) {
            inp.value = _anioFiltro || '';
            inp.classList.toggle('activo', !!_anioFiltro);
            inp.placeholder = _anioFiltro ? '' : 'Filtrar';
        }
    }

    function abrir() {
        if (_anioFiltro) { seleccionar(''); return; }
        const sugg = document.getElementById('anio-sugg');
        const anios = _anios();
        const items = [
            `<div class="suggestion-item${!_anioFiltro ? ' highlighted' : ''}" data-anio="">Todos</div>`,
            ...anios.map(a => `<div class="suggestion-item${_anioFiltro === a ? ' highlighted' : ''}" data-anio="${esc(a)}">${esc(a)}</div>`)
        ];
        sugg.innerHTML = items.join('');
        sugg.classList.add('show');
    }

    function cerrar() {
        setTimeout(() => {
            const sugg = document.getElementById('anio-sugg');
            if (sugg) sugg.classList.remove('show');
        }, 150);
    }

    function seleccionar(anio) {
        setAnioFiltro(anio);
        const sugg = document.getElementById('anio-sugg');
        if (sugg) sugg.classList.remove('show');
        document.getElementById('input-anio-filtro')?.blur();
    }

    return { poblar, abrir, cerrar, seleccionar };
})();

function setAnioFiltro(anio) {
    _anioFiltro = anio || null;
    AnioCombo.poblar();
    renderMateriales();
    renderStats();
    renderMovimientos();
}

// ═══════════════════════════════════════════════════════
//  HELPER: MOVIMIENTOS FILTRADOS POR AÑO
// ═══════════════════════════════════════════════════════
function getMovsFiltrados() {
    return _anioFiltro
        ? state.movimientos.filter(m => m.fecha.startsWith(_anioFiltro))
        : state.movimientos;
}

// ═══════════════════════════════════════════════════════
//  RENDER MATERIALES
// ═══════════════════════════════════════════════════════
let _modoAnioAnterior = null;

function renderMateriales() {
    const busq = (document.getElementById('busq-global')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('tabla-materiales');
    const empty = document.getElementById('materiales-empty');
    const modoAnio = !!_anioFiltro;
    const modoChanged = _modoAnioAnterior !== null && _modoAnioAnterior !== modoAnio;
    _modoAnioAnterior = modoAnio;

    let lista = state.materiales;

    // Búsqueda tokenizada
    if (busq) {
        const tokens = busq.split(/\s+/);
        lista = lista.filter(m => {
            const textoMat = m.nombre.toLowerCase();
            return tokens.every(token => textoMat.includes(token));
        });
    }

    if (!lista.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';

    // Movimientos del año seleccionado (o todos si modo normal)
    const movsDelAnio = getMovsFiltrados();

    const hoyDate = new Date();
    hoyDate.setHours(0, 0, 0, 0);

    // PASO 1: Pre-calcular datos según modo
    let dataOrdenada = lista.map(m => {
        if (modoAnio) {
            // Modo año: calcular entradas y salidas del año
            let entradas = 0, salidas = 0;
            movsDelAnio.forEach(mov => {
                const linea = mov.lineas.find(l => l.materialId === m.id);
                if (!linea) return;
                if (mov.tipo === 'entrada') entradas += linea.cantidad;
                else salidas += linea.cantidad;
            });
            return { ...m, entradasC: entradas, salidasC: salidas, _sort2: salidas, _sort3: entradas };
        } else {
            // Modo normal: stock acumulado + relevamiento
            const stock = calcStock(m.id);
            const movsRel = state.movimientos.filter(mov =>
                mov.ticket.trim().toLowerCase() === 'relevamiento' &&
                mov.lineas.some(l => l.materialId === m.id)
            );
            let diffDias = Infinity;
            let fechaMasReciente = null;
            if (movsRel.length > 0) {
                const fechas = movsRel.map(mov => mov.fecha).sort((a, b) => b.localeCompare(a));
                fechaMasReciente = fechas[0];
                const [y, mes, d] = fechaMasReciente.split('-');
                const relDate = new Date(y, mes - 1, d);
                diffDias = Math.floor((hoyDate.getTime() - relDate.getTime()) / (1000 * 60 * 60 * 24));
            }
            return {
                ...m, stockC: stock, diffDiasC: diffDias, fechaRelC: fechaMasReciente, _sort2: stock, _sort3: diffDias,
                _sort0: (() => {
                    // Orden: rojo(negativo)=0, naranja(bajo)=1, neutro(medio)=2, gris(sin umbral/cero)=3, verde(alto)=4
                    if (stock < 0) return 0;
                    if (m.umbralBajo !== null && m.umbralAlto !== null) {
                        if (stock <= m.umbralBajo) return 1;
                        if (stock >= m.umbralAlto) return 4;
                        return 2;
                    }
                    return stock === 0 ? 3 : 2;
                })()
            };
        }
    });

    // PASO 2: Ordenar
    dataOrdenada.sort((a, b) => {
        let valA, valB;
        if (_sortMat.col === 'indicador') {
            valA = a._sort0 ?? 2;
            valB = b._sort0 ?? 2;
        } else if (_sortMat.col === 'nombre') {
            valA = a.nombre.toLowerCase();
            valB = b.nombre.toLowerCase();
        } else if (_sortMat.col === 'stock') {
            valA = a._sort2;
            valB = b._sort2;
        } else if (_sortMat.col === 'relevado') {
            valA = a._sort3;
            valB = b._sort3;
        }
        if (valA < valB) return _sortMat.dir === 'asc' ? -1 : 1;
        if (valA > valB) return _sortMat.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // PASO 3: Headers dinámicos
    const svgAsc = `<svg class="svg-icon sort-chevron"><use href="#icon-chevron-up"/></svg>`;
    const svgDesc = `<svg class="svg-icon sort-chevron"><use href="#icon-chevron-down"/></svg>`;
    const svgHidden = `<span class="sort-chevron-hidden"></span>`;

    const labels = modoAnio
        ? { nombre: 'Material', stock: `<span class="text-orange">Salidas</span>`, relevado: `<span class="text-orange">Entradas</span>` }
        : { nombre: 'Material', stock: 'Stock', relevado: 'Relevado' };

    // Header del indicador — solo en modo normal (en modo año la columna está vacía)
    const thInd = document.getElementById('th-indicador');
    if (thInd) {
        if (modoAnio) {
            thInd.classList.remove('th-sortable');
            thInd.onclick = null;
            const indIcon = svgHidden;
            thInd.innerHTML = `<svg viewBox="0 0 10 14" width="14" height="18" class="svg-th-umbral-hidden"><use href="#icon-umbral"/></svg>${indIcon}`;
        } else {
            thInd.classList.add('th-sortable');
            thInd.onclick = () => ordenarMateriales('indicador');
            const indIcon = _sortMat.col === 'indicador' ? (_sortMat.dir === 'asc' ? svgAsc : svgDesc) : svgHidden;
            thInd.innerHTML = `<svg viewBox="0 0 10 14" width="14" height="18" class="svg-th-umbral-dim"><use href="#icon-umbral"/></svg>${indIcon}`;
        }
    }

    ['nombre', 'stock', 'relevado'].forEach(col => {
        const el = document.getElementById(`th-${col}`);
        const icon = _sortMat.col === col ? (_sortMat.dir === 'asc' ? svgAsc : svgDesc) : svgHidden;
        if (el) {
            el.innerHTML = `${labels[col]} ${icon}`;
            if (modoChanged && col !== 'nombre') {
                el.classList.remove('th-animating');
                void el.offsetWidth; // forzar reflow para reiniciar la animación
                el.classList.add('th-animating');
            }
        }
    });

    // PASO 4: Filas
    tbody.innerHTML = dataOrdenada.map(m => {
        let col2Html, col3Html, dotHtml = '';

        if (modoAnio) {
            const cS = m.salidasC > 0 ? 'stock-positive' : 'stock-zero';
            const cE = m.entradasC > 0 ? 'stock-positive' : 'stock-zero';
            col2Html = `<span class="${cS}">${m.salidasC}</span>`;
            col3Html = `<span class="${cE}">${m.entradasC}</span>`;
            dotHtml = `<span class="stock-dot stock-dot-hidden"></span>`;
        } else {
            const stock = m.stockC;
            const bajo = m.umbralBajo ?? null;
            const alto = m.umbralAlto ?? null;

            // Color del círculo indicador
            let dotClass;
            if (stock < 0) {
                dotClass = 'dot-red';
            } else if (bajo !== null && alto !== null) {
                if (stock <= bajo) dotClass = 'dot-orange';
                else if (stock >= alto) dotClass = 'dot-green';
                else dotClass = 'dot-main';
            } else {
                dotClass = stock === 0 ? 'dot-disabled' : 'dot-main';
            }
            dotHtml = `<span class="stock-dot ${dotClass}"></span>`;

            // Stock: siempre texto plano
            const claseStock = stock < 0 ? 'stock-negative' : stock === 0 ? 'stock-zero' : 'stock-positive';
            col2Html = `<span class="${claseStock}">${stock}</span>`;
            if (m.fechaRelC) {
                let cls = '';
                if (m.diffDiasC < 60) cls = 'relevado-green';
                else if (m.diffDiasC < 120) cls = 'relevado-blue';
                else if (m.diffDiasC < 180) cls = 'relevado-orange';
                else cls = 'relevado-red';
                col3Html = `<span class="${cls}">${formatFecha(m.fechaRelC)}</span>`;
            } else {
                col3Html = `<span class="relevado-none">Sin relevar</span>`;
            }
        }

        const tdAnim = modoChanged ? ' class="td-animating"' : '';
        const tdIndAnim = modoChanged ? ' class="td-indicador td-animating"' : ' class="td-indicador"';
        return `<tr data-mat-id="${m.id}" class="tr-clickable">
            <td${tdIndAnim}>${dotHtml}</td>
            <td><strong>${esc(m.nombre)}</strong></td>
            <td${tdAnim}>${col2Html}</td>
            <td${tdAnim}>${col3Html}</td>
        </tr>`;
    }).join('');
}

// ═══════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════
let _intervaloTop5 = null; // Variable global para controlar la rotación
let _intervaloStockBajo = null; // Variable global para controlar la rotación de stock bajo

function renderStats() {
    const totalMats = state.materiales.length;
    const modoAnio = !!_anioFiltro;
    const labelFiltroClass = modoAnio ? 'stat-chip-label stat-chip-label-filtro' : 'stat-chip-label';

    // Movimientos filtrados por año si corresponde
    const movsFiltrados = getMovsFiltrados();

    const totalMovs = movsFiltrados.length;

    // Buscamos el movimiento más reciente (del filtro)
    const ultimo = movsFiltrados.length > 0
        ? movsFiltrados.reduce((max, m) => m.fecha > max.fecha ? m : max, movsFiltrados[0])
        : null;

    let ultimoHtml = `
                <span class="stat-chip-value">-</span>
                <span class="stat-chip-sub">Sin registros</span>
            `;

    if (ultimo) {
        const esEntrada = ultimo.tipo === 'entrada';
        const claseTipo = esEntrada ? 'mov-tipo-entrada' : 'mov-tipo-salida';
        const flecha = esEntrada ? '▲' : '▼';
        const labelTipo = esEntrada ? 'Entrada' : 'Salida';

        ultimoHtml = `
                    <span class="stat-chip-value ">${formatFecha(ultimo.fecha)}</span>
                    <span class="stat-chip-sub stat-chip-sub-flex">
                        <span class="${claseTipo}">${flecha} ${labelTipo}</span> 
                        <span>• ${esc(ultimo.ticket)}</span>
                    </span>
                `;
    }

    // Top 5 más consumidos (salidas del filtro activo)
    const usoPorMaterial = {};
    movsFiltrados.forEach(mov => {
        if (mov.tipo !== 'salida') return;
        mov.lineas.forEach(l => {
            if (!l.materialId) return;
            usoPorMaterial[l.materialId] = (usoPorMaterial[l.materialId] || 0) + l.cantidad;
        });
    });

    const top5 = Object.entries(usoPorMaterial)
        .map(([id, cant]) => {
            const m = state.materiales.find(x => x.id === id);
            return { nombre: m ? m.nombre : '(eliminado)', cantidad: cant };
        })
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);

    let top5Html = `
                <span class="${labelFiltroClass}">Más consumidos</span>
                <span class="stat-chip-value truncate">-</span>
                <span class="stat-chip-sub">Sin salidas</span>
            `;

    if (top5.length > 0) {
        top5Html = `
                    <span class="${labelFiltroClass} fade-transition" id="top5-label">Más consumidos #1</span>
                    <span class="stat-chip-value truncate fade-transition" id="top5-nombre" title="${esc(top5[0].nombre)}">${esc(top5[0].nombre)}</span>
                    <span class="stat-chip-sub fade-transition" id="top5-sub">${top5[0].cantidad} unidades</span>
                `;
    }

    // Stock bajo: materiales con umbralBajo configurado y stock actual <= umbralBajo
    const stockBajoList = state.materiales
        .filter(m => m.umbralBajo !== null && m.umbralBajo !== undefined)
        .map(m => ({ ...m, stockActual: calcStock(m.id) }))
        .filter(m => m.stockActual <= m.umbralBajo)
        .sort((a, b) => (a.stockActual - a.umbralBajo) - (b.stockActual - b.umbralBajo)); // más críticos primero

    let stockBajoHtml = `
                <span class="stat-chip-label stat-chip-label-stock-bajo"><svg class="svg-icon"><use href="#icon-umbral"/></svg> Stock bajo</span>
                <span class="stat-chip-value">0</span>
                <span class="stat-chip-sub">sin alertas</span>
            `;

    if (stockBajoList.length > 0) {
        const primero = stockBajoList[0];
        stockBajoHtml = `
                    <span class="stat-chip-label stat-chip-label-stock-bajo fade-transition" id="stock-bajo-label">Stock bajo #1 de ${stockBajoList.length}</span>
                    <span class="stat-chip-value truncate fade-transition" id="stock-bajo-nombre" title="${esc(primero.nombre)}">${esc(primero.nombre)}</span>
                    <span class="stat-chip-sub fade-transition" id="stock-bajo-sub">${primero.stockActual} / umbral ${primero.umbralBajo}</span>
                `;
    }

    const labelMovs = modoAnio ? `en ${_anioFiltro}` : 'en total';

    document.getElementById('stats-grid').innerHTML = `
                <div class="stat-chip">
                    <span class="stat-chip-label"><svg class="svg-icon"><use href="#icon-table"/></svg> Materiales</span>
                    <span class="stat-chip-value">${totalMats}</span>
                    <span class="stat-chip-sub">registrados</span>
                </div>
                <div class="stat-chip">
                    <span class="${labelFiltroClass}"><svg class="svg-icon"><use href="#icon-movements"/></svg> Movimientos</span>
                    <span class="stat-chip-value">${totalMovs}</span>
                    <span class="stat-chip-sub">${labelMovs}</span>
                </div>
                <div class="stat-chip${ultimo ? ' stat-chip-clickable' : ''}"${ultimo ? ` data-mov-id="${esc(ultimo.id)}"` : ''}>
                    <span class="${labelFiltroClass}"><svg class="svg-icon"><use href="#icon-back"/></svg> Último movimiento</span>
                    ${ultimoHtml}
                </div>
                <div class="stat-chip chip-top5" id="chip-top5">
                    ${top5Html}
                </div>
                <div class="stat-chip chip-stock-bajo${stockBajoList.length > 0 ? ' stat-chip-clickable' : ''}" id="chip-stock-bajo">
                    ${stockBajoHtml}
                </div>
            `;

    // ── INICIAR ROTACIÓN DEL TOP 5 ──
    if (_intervaloTop5) clearInterval(_intervaloTop5); // Limpiamos cualquier bucle anterior

    if (top5.length > 1) {
        let idx = 0;

        function _mostrarTop5(i) {
            const lbl = document.getElementById('top5-label');
            const nom = document.getElementById('top5-nombre');
            const sub = document.getElementById('top5-sub');
            if (!lbl || !nom || !sub) { clearInterval(_intervaloTop5); return; }
            lbl.style.opacity = 0; nom.style.opacity = 0; sub.style.opacity = 0;
            setTimeout(() => {
                lbl.textContent = `Más consumidos #${i + 1}`;
                nom.textContent = top5[i].nombre;
                nom.title = top5[i].nombre;
                sub.textContent = `${top5[i].cantidad} unidades`;
                lbl.style.opacity = 1; nom.style.opacity = 1; sub.style.opacity = 1;
            }, 250);
        }

        function _arrancarTimer() {
            if (_intervaloTop5) clearInterval(_intervaloTop5);
            _intervaloTop5 = setInterval(() => {
                idx = (idx + 1) % top5.length;
                _mostrarTop5(idx);
            }, 3000);
        }

        _arrancarTimer();

        // Click en el chip: avanza al siguiente y reinicia el contador
        const chipTop5 = document.getElementById('chip-top5');
        if (chipTop5) {
            chipTop5.style.cursor = 'pointer';
            chipTop5.onclick = () => {
                idx = (idx + 1) % top5.length;
                _mostrarTop5(idx);
                _arrancarTimer();
            };
        }

    }

    // ── ROTACIÓN DEL CHIP STOCK BAJO ──
    if (_intervaloStockBajo) clearInterval(_intervaloStockBajo);

    if (stockBajoList.length > 1) {
        let sbIdx = 0;

        function _mostrarStockBajo(i) {
            const lbl = document.getElementById('stock-bajo-label');
            const nom = document.getElementById('stock-bajo-nombre');
            const sub = document.getElementById('stock-bajo-sub');
            if (!lbl || !nom || !sub) { clearInterval(_intervaloStockBajo); return; }
            lbl.style.opacity = 0; nom.style.opacity = 0; sub.style.opacity = 0;
            setTimeout(() => {
                const item = stockBajoList[i];
                lbl.textContent = `Stock bajo #${i + 1} de ${stockBajoList.length}`;
                nom.textContent = item.nombre;
                nom.title = item.nombre;
                sub.textContent = `${item.stockActual} / umbral ${item.umbralBajo}`;
                lbl.style.opacity = 1; nom.style.opacity = 1; sub.style.opacity = 1;
            }, 250);
        }

        function _arrancarTimerSB() {
            if (_intervaloStockBajo) clearInterval(_intervaloStockBajo);
            _intervaloStockBajo = setInterval(() => {
                sbIdx = (sbIdx + 1) % stockBajoList.length;
                _mostrarStockBajo(sbIdx);
            }, 3000);
        }

        _arrancarTimerSB();

        const chipSB = document.getElementById('chip-stock-bajo');
        if (chipSB) {
            chipSB.onclick = () => {
                sbIdx = (sbIdx + 1) % stockBajoList.length;
                _mostrarStockBajo(sbIdx);
                _arrancarTimerSB();
            };
        }
    }
}

// ═══════════════════════════════════════════════════════
//  ABRIR MODALES DE MOVIMIENTO (Con validación)
// ═══════════════════════════════════════════════════════
function abrirModalMovimiento(tipo) {
    if (state.materiales.length === 0) {
        toast('No hay materiales registrados', 'error');
        return;
    }
    MM.abrir(`modal-${tipo}`);
}

// ═══════════════════════════════════════════════════════
//  LÍNEAS DE MOVIMIENTO  (separadas por tipo de modal)
// ═══════════════════════════════════════════════════════

const _lineasState = {
    entrada: { lineas: [], counter: 0 },
    salida: { lineas: [], counter: 0 },
    herramienta: { lineas: [], counter: 0 },
};

function agregarLinea(tipo) {
    const s = _lineasState[tipo];
    const lid = ++s.counter;
    s.lineas.push({ lid, materialId: null, _nombre: '', cantidad: 1 });
    renderLineas(tipo);
    if (!isMobile()) {
        setTimeout(() => {
            const el = document.getElementById(`linea-input-${tipo}-${lid}`);
            if (el) el.focus();
        }, 50);
    }
}

function eliminarLinea(tipo, lid) {
    const lineas = _lineasState[tipo].lineas;
    const idx = lineas.findIndex(l => l.lid === lid);

    // Buscamos el lid de la línea anterior (si existe) antes de eliminar
    const lidAnterior = idx > 0 ? lineas[idx - 1].lid : null;

    _lineasState[tipo].lineas = lineas.filter(l => l.lid !== lid);
    renderLineas(tipo);

    // Foco en el input de la línea anterior si existe y no es móvil
    if (!isMobile() && lidAnterior !== null) {
        setTimeout(() => {
            const prefijo = tipo === 'herramienta' ? 'linea-input-herramienta' : `linea-input-${tipo}`;
            const el = document.getElementById(`${prefijo}-${lidAnterior}`);
            if (el) el.focus();
        }, 50);
    }
}

function renderLineas(tipo) {
    const lineas = _lineasState[tipo].lineas;
    const container = document.getElementById(`lineas-container-${tipo}`);
    if (!container) return;
    if (!lineas.length) { container.innerHTML = ''; return; }

    if (tipo === 'herramienta') {
        container.innerHTML = lineas.map(l => `
            <div class="linea-herramienta" id="linea-row-herramienta-${l.lid}">
                <div class="combobox-wrap">
                    <input
                        type="text"
                        id="linea-input-herramienta-${l.lid}"
                        placeholder="Nombre de la herramienta…"
                        autocomplete="off"
                        value="${esc(l._nombre || '')}"
                        data-linea-tipo="herramienta" data-linea-lid="${l.lid}" class="linea-text-input"
                    >
                </div>
                <input
                    type="number"
                    id="linea-qty-herramienta-${l.lid}"
                    min="1"
                    max="999"
                    value="${l.cantidad}"
                    placeholder="Cant."
                    data-linea-tipo="herramienta" data-linea-lid="${l.lid}" class="linea-qty-input"
                >
                <button class="icon-btn btn-linea-delete" data-linea-tipo="herramienta" data-linea-lid="${l.lid}" title="Quitar">
                    <svg class="svg-icon"><use href="#icon-x"/></svg>
                </button>
            </div>
        `).join('');
    } else {
        container.innerHTML = lineas.map(l => `
            <div class="linea-material" id="linea-row-${tipo}-${l.lid}">
                <div class="combobox-wrap">
                    <input
                        type="text"
                        id="linea-input-${tipo}-${l.lid}"
                        placeholder="Nombre del material…"
                        autocomplete="off"
                        value="${esc(l._nombre || '')}"
                        data-linea-tipo="${tipo}" data-linea-lid="${l.lid}" class="linea-text-input"
                    >
                </div>
                <input
                    type="number"
                    id="linea-qty-${tipo}-${l.lid}"
                    min="0"
                    max="9999"
                    value="${l.cantidad}"
                    placeholder="Cant."
                    data-linea-tipo="${tipo}" data-linea-lid="${l.lid}" class="linea-qty-input"
                >
                <button class="icon-btn btn-linea-delete" data-linea-tipo="${tipo}" data-linea-lid="${l.lid}" title="Quitar">
                    <svg class="svg-icon"><use href="#icon-x"/></svg>
                </button>
            </div>
        `).join('');
    }
}

function _getLinea(tipo, lid) { return _lineasState[tipo]?.lineas.find(l => l.lid === lid); }

function onLineaInput(tipo, lid, val) {
    const linea = _getLinea(tipo, lid); if (!linea) return;
    linea._nombre = val;
    if (tipo !== 'herramienta') {
        linea.materialId = null;
        mostrarSugerencias(tipo, lid, val);
    }
}

function onLineaFocus(tipo, lid) {
    const linea = _getLinea(tipo, lid); if (!linea) return;
    if (tipo !== 'herramienta' && linea._nombre) mostrarSugerencias(tipo, lid, linea._nombre);
}

function cerrarPortalSugerencias() {
    const portal = document.getElementById('suggestions-portal');
    if (portal) { portal.classList.remove('show'); portal.innerHTML = ''; }
}

// ── Portal único de sugerencias (evita el bug de position:fixed dentro de transform) ──
function _getSuggPortal() {
    let el = document.getElementById('suggestions-portal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'suggestions-portal';
        el.className = 'suggestions-list';
        document.body.appendChild(el);
    }
    return el;
}

function mostrarSugerencias(tipo, lid, val) {
    const el = _getSuggPortal();
    el.dataset.tipo = tipo;
    el.dataset.lid = String(lid);
    const q = val.toLowerCase().trim();
    if (!q) { el.innerHTML = ''; el.classList.remove('show'); return; }

    // 1. Tokenizamos la búsqueda separando por espacios
    const tokens = q.split(/\s+/).filter(t => t);

    // 2. Filtramos exigiendo que TODOS los tokens estén presentes en el nombre del material
    const items = state.materiales.filter(m => {
        const nombreLower = m.nombre.toLowerCase();
        return tokens.every(token => nombreLower.includes(token));
    });

    if (!items.length) { el.innerHTML = ''; el.classList.remove('show'); return; }

    // Recopilamos los IDs de los materiales que ya están seleccionados en OTRAS líneas
    const seleccionados = _lineasState[tipo].lineas
        .filter(l => l.lid !== lid && l.materialId)
        .map(l => l.materialId);

    // 3. Preparamos el RegEx para buscar y resaltar CUALQUIERA de los tokens
    const reg = new RegExp(`(${tokens.map(escReg).join('|')})`, 'gi');

    el.innerHTML = items.map(m => {
        // Aplicamos el resaltado múltiple
        const nombre = esc(m.nombre).replace(reg, '<mark class="suggestion-mark">$1</mark>');

        // Si el material ya fue agregado en este movimiento, lo mostramos deshabilitado
        if (seleccionados.includes(m.id)) {
            return `<div class="suggestion-item disabled suggestion-item-disabled" title="Ya agregado en este movimiento">
                                <span>${nombre}</span> <span class="suggestion-added-label">(Agregado)</span>
                            </div>`;
        }

        return `<div class="suggestion-item" data-mat-select-tipo="${tipo}" data-mat-select-lid="${lid}" data-mat-select-id="${m.id}" data-id="${m.id}">
                            <span>${nombre}</span>
                        </div>`;
    }).join('');
    // Posicionamos fixed relativo al input para escapar del overflow del modal
    const inputEl = document.getElementById(`linea-input-${tipo}-${lid}`);
    if (inputEl) {
        const r = inputEl.getBoundingClientRect();
        el.style.position = 'fixed';
        el.style.top = (r.bottom + 4) + 'px';
        el.style.left = r.left + 'px';
        el.style.width = r.width + 'px';
        el.style.right = 'auto';
    }

    el.classList.add('show');
}

function onLineaKey(e, tipo, lid) {
    if (tipo === 'herramienta') return;
    const el = _getSuggPortal();
    if (!el.classList.contains('show') || el.dataset.tipo !== tipo || el.dataset.lid !== String(lid)) return;

    // Seleccionamos SOLO los items que no estén deshabilitados
    const items = el.querySelectorAll('.suggestion-item:not(.disabled)');

    // Si no hay items disponibles (ej: todos están deshabilitados), cancelamos la acción de Enter/Flechas
    if (!items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
        e.preventDefault(); e.stopPropagation(); return;
    }

    let hi = [...items].findIndex(i => i.classList.contains('highlighted'));

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (hi < items.length - 1) {
            if (hi >= 0) items[hi].classList.remove('highlighted');
            const next = items[hi + 1];
            next.classList.add('highlighted');
            next.scrollIntoView({ block: 'nearest' });
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (hi > 0) {
            items[hi].classList.remove('highlighted');
            const prev = items[hi - 1];
            prev.classList.add('highlighted');
            prev.scrollIntoView({ block: 'nearest' });
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const sel = el.querySelector('.highlighted') || items[0];
        // Solo permitimos seleccionar si realmente encontramos un elemento válido
        if (sel && !sel.classList.contains('disabled')) seleccionarMaterial(tipo, lid, sel.dataset.id);
    } else if (e.key === 'Escape') {
        e.stopPropagation();
        el.classList.remove('show');
    }
}

function seleccionarMaterial(tipo, lid, materialId) {
    const linea = _getLinea(tipo, lid);
    const mat = state.materiales.find(m => m.id === materialId);
    if (!linea || !mat) return;
    linea.materialId = materialId;
    linea._nombre = mat.nombre;
    const inputEl = document.getElementById(`linea-input-${tipo}-${lid}`);
    const suggEl = _getSuggPortal();
    if (inputEl) inputEl.value = mat.nombre;
    suggEl.classList.remove('show');
    suggEl.innerHTML = '';
    setTimeout(() => { const qty = document.getElementById(`linea-qty-${tipo}-${lid}`); if (qty) { qty.focus(); qty.select(); } }, 50);
}

function onLineaQty(tipo, lid, val) {
    const linea = _getLinea(tipo, lid);
    if (linea) {
        linea.cantidad = val === '' ? 0 : Number(val);
    }
}

// cerrar sugerencias al click fuera
document.addEventListener('mousedown', e => {
    const portal = _getSuggPortal();
    if (!portal.classList.contains('show')) return;
    const tipo = portal.dataset.tipo;
    const lid = portal.dataset.lid;
    const inputEl = document.getElementById(`linea-input-${tipo}-${lid}`);
    // Cerramos solo si el click fue completamente fuera del portal y del input
    // portal.contains cubre también clicks en la scrollbar del portal
    if (portal.contains(e.target) || e.target === inputEl) return;
    // Verificar si el click cayó sobre el área del portal (incluye scrollbar nativa)
    const r = portal.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    portal.classList.remove('show');
    portal.innerHTML = '';
});

// cerrar sugerencias al hacer scroll dentro del modal
// pero NO cerrar si el scroll ocurre dentro del propio portal de sugerencias
document.addEventListener('scroll', e => {
    const portal = document.getElementById('suggestions-portal');
    if (portal && portal.contains(e.target)) return; // scroll interno del portal, no cerrar
    cerrarPortalSugerencias();
}, true); // capture: true para capturar scroll en cualquier contenedor

// ── Delegadores para elementos generados dinámicamente ──

// Tabla materiales: click en fila
document.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-mat-id]');
    if (tr) { abrirModalMaterial(tr.dataset.matId); return; }

    // Historial: click en movimiento
    const movItem = e.target.closest('[data-mov-id]');
    if (movItem) { abrirModalEditarMov(movItem.dataset.movId); return; }

    // Year summary: toggle open
    const ys = e.target.closest('.year-summary');
    if (ys) {
        const yg = ys.parentElement;
        yg.classList.toggle('open');
        const anioOpen = yg.classList.contains('open');
        const anioTxt = yg.querySelector('.year-summary-inner')?.textContent?.trim().replace(/\D/g, '');
        if (anioTxt) {
            _histSetColapso(`anio-${anioTxt}`, anioOpen);
            // Al cerrar el año, cerramos también todos sus meses
            if (!anioOpen) {
                yg.querySelectorAll('.month-group').forEach(mg => {
                    mg.classList.remove('open');
                    const span = mg.querySelector('.mes-separador span')?.textContent?.trim() || '';
                    const partes = span.split(' ');
                    if (partes.length === 2) {
                        const mesIdx = NOMBRES_MESES.indexOf(partes[0]);
                        if (mesIdx >= 0) {
                            const mesKey = String(mesIdx + 1).padStart(2, '0');
                            _histSetColapso(`mes-${anioTxt}-${mesKey}`, false);
                        }
                    }
                });
            }
        }
        return;
    }

    // Categorías: eliminar
    const catDel = e.target.closest('.btn-cat-delete[data-cat]');
    if (catDel) { eliminarCategoria(catDel.dataset.cat); return; }

    // Líneas movimiento: eliminar línea
    const lineaDel = e.target.closest('.btn-linea-delete[data-linea-lid]');
    if (lineaDel) { eliminarLinea(lineaDel.dataset.lineaTipo, Number(lineaDel.dataset.lineaLid)); return; }
});

// Líneas movimiento: input texto (oninput, onfocus, onkeydown)
document.addEventListener('input', e => {
    const el = e.target;
    if (el.classList.contains('linea-text-input')) {
        onLineaInput(el.dataset.lineaTipo, Number(el.dataset.lineaLid), el.value);
    } else if (el.classList.contains('linea-qty-input')) {
        if (el.value.length > 4) el.value = el.value.slice(0, 4);
        onLineaQty(el.dataset.lineaTipo, Number(el.dataset.lineaLid), el.value);
    }
});

document.addEventListener('focusin', e => {
    const el = e.target;
    if (el.classList.contains('linea-text-input')) {
        onLineaFocus(el.dataset.lineaTipo, Number(el.dataset.lineaLid));
    }
});

document.addEventListener('keydown', e => {
    const el = e.target;
    if (el.classList.contains('linea-text-input')) {
        onLineaKey(e, el.dataset.lineaTipo, Number(el.dataset.lineaLid));
    }
}, true);

// AnioCombo: mousedown en suggestion items (data-anio)
document.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-anio]');
    if (item && item.closest('#anio-sugg')) {
        AnioCombo.seleccionar(item.dataset.anio);
    }
});

// Sugerencias de material en líneas: mousedown (data-mat-select-*)
document.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-mat-select-id]');
    if (item) {
        seleccionarMaterial(item.dataset.matSelectTipo, Number(item.dataset.matSelectLid), item.dataset.matSelectId);
    }
});

// ── Fin delegadores dinámicos ──

// ═══════════════════════════════════════════════════════
//  GUARDAR MOVIMIENTO  (entrada / salida)
// ═══════════════════════════════════════════════════════
function guardarMovimiento(tipo) {
    const fechaId = `${tipo}-fecha`;
    const ticketId = `${tipo}-ticket`;
    const fecha = document.getElementById(fechaId).value;
    const ticket = document.getElementById(ticketId).value.trim();
    const lineas = _lineasState[tipo].lineas;

    if (!fecha) { document.getElementById(fechaId).classList.add('error'); toast('Seleccioná una fecha', 'error'); return; }
    if (!RE_FECHA.test(fecha)) { document.getElementById(fechaId).classList.add('error'); toast('Fecha inválida', 'error'); return; }

    // ── Validar Máquina del Tiempo ──
    if (fecha > getHoyLocal()) {
        document.getElementById(fechaId).classList.add('error');
        toast('No podés registrar movimientos en el futuro', 'error');
        return;
    }

    if (!ticket) { const ticketEl = document.getElementById(ticketId); ticketEl.classList.add('error'); if (!isMobile()) ticketEl.focus(); toast('Ingresá un número de ticket', 'error'); return; }
    if (!lineas.length) { toast('Agregá al menos un material', 'error'); return; }

    const lineasValidas = lineas.filter(l => l.materialId);
    if (!lineasValidas.length) { toast('Seleccioná materiales de la lista', 'error'); return; }

    // ── Sin materiales duplicados en el mismo movimiento ──
    const idsVistos = new Set();
    for (const l of lineasValidas) {
        if (idsVistos.has(l.materialId)) {
            const mat = state.materiales.find(m => m.id === l.materialId);
            const nombreMat = mat ? mat.nombre : 'un material';
            toast(`Error: "${nombreMat}" está duplicado en la lista`, 'error');
            return; // Frena todo, no guarda el movimiento
        }
        idsVistos.add(l.materialId);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── NUEVO: Permitir cantidad 0 SOLO si es relevamiento ──
    const esRelevamiento = ticket.toLowerCase().includes('relevamiento');

    for (const l of lineasValidas) {
        const cant = Math.floor(Number(l.cantidad));

        if (!Number.isFinite(cant) || cant < 0 || cant > 99999) {
            toast('La cantidad debe ser un número positivo', 'error'); return;
        }
        if (cant === 0 && !esRelevamiento) {
            toast('La cantidad no puede ser 0 (salvo en tickets de "relevamiento")', 'error'); return;
        }

        l.cantidad = cant; // normalizar
    }
    // ────────────────────────────────────────────────────────

    // EVITAR STOCK NEGATIVO EN SALIDAS ──
    if (tipo === 'salida') {
        for (const l of lineasValidas) {
            const stockActual = calcStock(l.materialId);
            // Si lo que quiero sacar es mayor a lo que tengo, frena todo
            if (stockActual - l.cantidad < 0) {
                const mat = state.materiales.find(m => m.id === l.materialId);
                const nombreMat = mat ? mat.nombre : 'Material';
                // Mostramos el error especificando qué material falló y cuánto hay
                toast(`Stock insuficiente de "${nombreMat}". Disponible: ${stockActual}`, 'error');
                return; // Corta la función acá, no se guarda el movimiento
            }
        }
    }

    const mov = {
        id: uid(),
        tipo,
        fecha,
        ticket,
        lineas: lineasValidas.map(l => ({ materialId: l.materialId, cantidad: l.cantidad })),
        comentarios: (() => {
            const el = document.getElementById(`${tipo}-comentarios`);
            const v = el ? el.value.trim().slice(0, 300) : '';
            return v || null;
        })(),
    };

    historial.empujar(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} ${ticket}`);
    state.movimientos.unshift(mov);
    guardar();

    // limpiar el modal
    document.getElementById(fechaId).value = getHoyLocal();
    document.getElementById(ticketId).value = '';
    const comentariosEl = document.getElementById(`${tipo}-comentarios`);
    if (comentariosEl) comentariosEl.value = '';
    _lineasState[tipo].lineas = [];
    _lineasState[tipo].counter = 0;
    renderLineas(tipo);

    MM.cerrar(`modal-${tipo}`);

    // Re-renderizamos toda la UI afectada
    historial.refrescarTodo();

    const label = tipo === 'entrada' ? 'Entrada' : 'Salida';
    toast(`${label} ${ticket} registrada`, tipo === 'entrada' ? 'success' : 'info');
}

// ═══════════════════════════════════════════════════════
//  EDITAR MOVIMIENTO
// ═══════════════════════════════════════════════════════
function abrirModalEditarMov(id) {
    const mov = state.movimientos.find(m => m.id === id);
    if (!mov) return;

    // Rellenamos los campos (sin el tipo)
    document.getElementById('edit-mov-id').value = mov.id;
    document.getElementById('edit-mov-ticket').value = mov.ticket;
    document.getElementById('edit-mov-fecha').value = mov.fecha;
    const editComentariosEl = document.getElementById('edit-mov-comentarios');
    if (editComentariosEl) editComentariosEl.value = mov.comentarios || '';

    // Listamos los materiales como solo lectura
    const linesHTML = mov.lineas.map(l => {
        const mat = state.materiales.find(x => x.id === l.materialId);
        const nombre = mat ? mat.nombre : '(eliminado)';
        return `<div class="mov-line-row">
                    <span>${esc(nombre)}</span>
                    <span class="mov-line-qty">x${l.cantidad}</span>
                </div>`;
    }).join('');

    document.getElementById('edit-mov-lines').innerHTML = linesHTML || '<em>Sin materiales</em>';

    MM.abrir('modal-editar-mov');
    ModalLocker.resetear('modal-editar-mov');
}

function guardarEdicionMov() {
    const id = document.getElementById('edit-mov-id').value;
    const mov = state.movimientos.find(m => m.id === id);
    if (!mov) return;

    const nuevoTicket = document.getElementById('edit-mov-ticket').value.trim();
    const nuevaFecha = document.getElementById('edit-mov-fecha').value;
    const editComentariosEl = document.getElementById('edit-mov-comentarios');
    const nuevosComentarios = editComentariosEl ? (editComentariosEl.value.trim().slice(0, 300) || null) : (mov.comentarios ?? null);

    if (!nuevoTicket) { toast('El Nº de ticket es obligatorio', 'error'); return; }
    if (!nuevaFecha || !RE_FECHA.test(nuevaFecha)) {
        document.getElementById('edit-mov-fecha').classList.add('error');
        toast('La fecha no es válida', 'error'); return;
    }

    // ── Validar Máquina del Tiempo ──
    if (nuevaFecha > getHoyLocal()) {
        document.getElementById('edit-mov-fecha').classList.add('error');
        toast('No podés editar fechas hacia el futuro', 'error');
        return;
    }

    // ── VALIDACIÓN: DETECTAR SI HUBO CAMBIOS ──
    if (mov.ticket === nuevoTicket && mov.fecha === nuevaFecha && (mov.comentarios ?? null) === nuevosComentarios) {
        MM.cerrar('modal-editar-mov');
        toast('Sin cambios', 'info');
        return; // Cortamos acá, no guarda ni sube a Gist
    }

    // Aplicamos los cambios (fecha, ticket y comentarios)
    historial.empujar(`Editar movimiento "${mov.ticket}"`);
    mov.ticket = nuevoTicket;
    mov.fecha = nuevaFecha;
    mov.comentarios = nuevosComentarios;

    // Re-renderizamos toda la UI afectada
    historial.refrescarTodo();

    guardar(); // Guardamos en el local storage (y dispara Gist)

    MM.cerrar('modal-editar-mov');
    toast('Movimiento actualizado');
}

function eliminarDesdeEdicion() {
    const id = document.getElementById('edit-mov-id').value;
    eliminarMovimiento(id);
}

function eliminarMovimiento(id) {
    const m = state.movimientos.find(x => x.id === id);
    if (!m) return;
    confirmar(`¿Eliminar movimiento "${m.ticket}"?`, 'Esta acción se puede deshacer antes de cerrar la página', () => {
        historial.empujar(`Eliminar movimiento "${m.ticket}"`);
        state.movimientos = state.movimientos.filter(x => x.id !== id);
        guardar();
        renderMovimientos();
        renderStats();
        toast('Movimiento eliminado');

        // ── NUEVO: Si confirmó y se borró, cerramos el modal de edición (si estaba abierto) ──
        MM.cerrar('modal-editar-mov');
    });
}

// ═══════════════════════════════════════════════════════
//  RENDER MOVIMIENTOS
// ═══════════════════════════════════════════════════════
// ── SessionStorage: estado de colapsos del historial ──────────────────────────
const HIST_SS_KEY = 'SGI_hist_colapsos';

function _histGetColapsos() {
    try { return JSON.parse(sessionStorage.getItem(HIST_SS_KEY) || '{}'); } catch { return {}; }
}
function _histSetColapso(key, open) {
    const data = _histGetColapsos();
    data[key] = open;
    try { sessionStorage.setItem(HIST_SS_KEY, JSON.stringify(data)); } catch { }
}
function _histIsOpen(key, defaultOpen) {
    const data = _histGetColapsos();
    return key in data ? data[key] : defaultOpen;
}

function renderMovimientos() {
    const busqOriginal = document.getElementById('busq-global')?.value || '';
    const busqText = busqOriginal.toLowerCase().trim();
    const lista = document.getElementById('lista-movimientos');
    const empty = document.getElementById('movimientos-empty');
    const count = document.getElementById('mov-count');
    const dictMateriales = state.materiales.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

    // 1. Conteo de tickets numéricos
    const conteoTickets = {};
    state.movimientos.forEach(m => {
        const t = m.ticket.trim();
        if (/^\d+$/.test(t)) {
            conteoTickets[t] = (conteoTickets[t] || 0) + 1;
        }
    });

    // Aplicar filtro de año si está activo (igual que en renderMateriales y renderStats)
    let movs = _anioFiltro
        ? state.movimientos.filter(m => m.fecha.startsWith(_anioFiltro))
        : state.movimientos;

    // 2. Búsqueda y Filtrado Inteligente
    if (busqText) {
        if (busqText === 'duplicado' || busqText === 'duplicados') {
            // Filtrado especial para auditoría
            movs = movs.filter(m => {
                const t = m.ticket.trim();
                return /^\d+$/.test(t) && conteoTickets[t] > 1;
            });
        } else {
            // --- AQUÍ EMPIEZA LA BÚSQUEDA NINJA ---
            const filtros = analizarBuscadorInteligente(busqOriginal);
            const tokensTexto = filtros.textoLimpio ? filtros.textoLimpio.split(/\s+/) : [];

            movs = movs.filter(m => {
                // A) Filtro de Rango de Fechas
                if (filtros.desde && m.fecha < filtros.desde) return false;
                if (filtros.hasta && m.fecha > filtros.hasta) return false;

                // B) Filtro de Texto (si quedaron palabras después de extraer las fechas)
                if (tokensTexto.length > 0) {
                    const nombresMateriales = m.lineas.map(l => {
                        const mat = dictMateriales[l.materialId];
                        return mat ? mat.nombre : '';
                    }).join(' ');

                    // Armamos el string completo donde buscar
                    const textoMovimiento = `${m.tipo} ${m.ticket} ${nombresMateriales} ${m.comentarios || ''}`.toLowerCase();

                    // Verificamos que todas las palabras buscadas estén en este movimiento
                    return tokensTexto.every(token => textoMovimiento.includes(token));
                }

                return true; // Si solo filtró por fecha y pasó, lo mostramos
            });
        }
    }

    // Ordenamiento cronológico global
    movs.sort((a, b) => b.fecha.localeCompare(a.fecha));

    count.textContent = movs.length;

    if (!movs.length) { lista.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';

    // Agrupar por año y mes
    const anioActual = new Date().getFullYear().toString();
    const mesActualStr = String(new Date().getMonth() + 1).padStart(2, '0');
    const agrupadosPorAnio = {};

    movs.forEach(m => {
        const anio = m.fecha.substring(0, 4);
        if (!agrupadosPorAnio[anio]) agrupadosPorAnio[anio] = [];
        agrupadosPorAnio[anio].push(m);
    });

    const htmlFinal = Object.keys(agrupadosPorAnio).sort((a, b) => b - a).map(anio => {
        const movimientosDelAnio = agrupadosPorAnio[anio];

        const hayFiltroActivo = busqText !== '';
        const defaultOpenAnio = anio === anioActual || hayFiltroActivo;
        // Con búsqueda activa ignoramos sessionStorage y abrimos todo
        const isOpenAnio = (hayFiltroActivo ? defaultOpenAnio : _histIsOpen(`anio-${anio}`, defaultOpenAnio)) ? 'open' : '';

        // Agrupar por mes dentro del año actual del loop
        const agrupadosPorMes = {};
        movimientosDelAnio.forEach(m => {
            const mes = m.fecha.substring(5, 7);
            if (!agrupadosPorMes[mes]) agrupadosPorMes[mes] = [];
            agrupadosPorMes[mes].push(m);
        });

        const mesesOrdenados = Object.keys(agrupadosPorMes).sort((a, b) => b - a);

        const mesesHtml = mesesOrdenados.map(mes => {
            const movsMes = agrupadosPorMes[mes];
            const mesIdx = parseInt(mes, 10) - 1;

            const defaultOpenMes = (anio === anioActual && mes === mesActualStr) || hayFiltroActivo;
            // Con búsqueda activa ignoramos sessionStorage y abrimos todo
            const isOpenMes = (hayFiltroActivo ? defaultOpenMes : _histIsOpen(`mes-${anio}-${mes}`, defaultOpenMes)) ? 'open' : '';

            const itemsHtml = movsMes.map(m => {
                const esEntrada = m.tipo === 'entrada';
                const tipoBadge = esEntrada
                    ? `<span class="badge badge-green">▲ Entrada</span>`
                    : `<span class="badge badge-red">▼ Salida</span>`;

                const tags = m.lineas.map(l => {
                    const mat = dictMateriales[l.materialId];
                    const nombre = mat ? mat.nombre : '(eliminado)';
                    return `<span class="mov-mat-tag"><span class="mov-mat-qty">${l.cantidad}</span> <span>${esc(nombre)}</span></span>`;
                }).join('');

                const tLimpio = m.ticket.trim();
                const esDuplicado = /^\d+$/.test(tLimpio) && conteoTickets[tLimpio] > 1;
                const htmlAlerta = esDuplicado ? `<span class="ticket-warning" title="Este número de ticket aparece duplicado en el historial">!</span>` : '';
                const htmlComentarios = m.comentarios ? `<div class="mov-comentarios">${esc(m.comentarios)}</div>` : '';

                return `
            <div class="mov-item mov-item-grid" data-mov-id="${m.id}" title="Tocar para editar">
                <div class="mov-col-left">
                    <div class="mov-line-1">                                
                        <span class="mov-fecha">${formatFecha(m.fecha)}</span>
                        <span class="mov-sep">|</span>
                        ${tipoBadge}
                    </div>
                    <div class="mov-ticket">
                        ${esc(m.ticket)}${htmlAlerta}
                    </div>
                    ${htmlComentarios}
                </div>
                <div class="mov-col-right">
                    <div class="mov-materiales">${tags}</div>
                </div>
            </div>`;
            }).join('');

            // El texto del mes a la izquierda, y el chevron a la derecha
            return `
        <div class="month-group ${isOpenMes}">
            <div class="mes-separador">
                <span>${NOMBRES_MESES[mesIdx]} ${anio}</span>
                <svg class="svg-icon month-arrow"><use href="#icon-chevron-down"/></svg>
            </div>
            <div class="month-content-wrapper">
                <div class="month-content">
                    ${itemsHtml}
                </div>
            </div>
        </div>`;
        }).join('');

        return `
        <div class="year-group ${isOpenAnio}">
            <div class="year-summary">
                <div class="year-summary-inner">
                    <svg class="svg-icon year-arrow"><use href="#icon-chevron-right"/></svg>
                    ${anio}
                </div>
                <span class="year-count">${movimientosDelAnio.length}</span>
            </div>
            <div class="year-content-wrapper">
                <div class="year-content">
                    <div class="year-content-inner">
                        ${mesesHtml}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');

    lista.innerHTML = htmlFinal;
}

// ═══════════════════════════════════════════════════════
//  SHORTCUTS DE TECLADO
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
    const modalOpen = document.body.classList.contains('modal-open');
    const modal = document.querySelector('.modal.show');
    const modalId = modal?.id ?? '';
    const tag = document.activeElement?.tagName;
    const enInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const busqActivo = document.activeElement?.id === 'busq-global';

    // ── Ctrl+Z / Ctrl+Y ──────────────────────────────────
    if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); historial.undo(); return; }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); historial.redo(); return; }
    }

    // ── Escape ───────────────────────────────────────────
    if (e.key === 'Escape') {
        if (modalOpen) { MM.cerrarTop(); return; }

        const busqEl = document.getElementById('busq-global');

        // 1. Limpiar buscador y siempre quitar el foco del elemento
        if (busqActivo) {
            if (busqEl.value) limpiarBusqueda();
            busqEl.blur();
        } else if (busqEl?.value) {
            limpiarBusqueda();
        }

        // 2. Limpiar el filtro por año si está activo
        if (_anioFiltro) {
            setAnioFiltro(null); // Esto limpia el valor y re-renderiza la tabla y los stats
        }

        return;
    }

    // ── Alt + ← / → : cambiar pestaña ───────────────────
    if (!modalOpen && e.ctrlKey) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); switchTab('dashboard'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); switchTab('movimientos'); return; }
    }

    // ── Sin modal y sin foco en input ────────────────────
    if (!modalOpen && !enInput) {
        if (e.key === '+' || e.key === '=') { e.preventDefault(); abrirModalMovimiento('entrada'); return; }
        if (e.key === '-') { e.preventDefault(); abrirModalMovimiento('salida'); return; }

        // Enfocar búsqueda con cualquier tecla alfanumérica
        if (!e.ctrlKey && !e.altKey && !e.metaKey &&
            (e.key === 'Backspace' || (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)))) {
            const busqEl = document.getElementById('busq-global');
            if (busqEl) {
                busqEl.focus();
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    busqEl.value = busqEl.value.slice(0, -1);
                    onBusqGlobal();
                }
            }
        }
        return;
    }

    // MODALES ENTRADA / SALIDA / HERRAMIENTAS
    if (modalOpen && (modalId === 'modal-entrada' || modalId === 'modal-salida' || modalId === 'modal-herramienta-nuevo')) {
        if (tag === 'BUTTON') return;

        let tipo = '';
        if (modalId === 'modal-entrada') tipo = 'entrada';
        else if (modalId === 'modal-salida') tipo = 'salida';
        else if (modalId === 'modal-herramienta-nuevo') tipo = 'herramienta';

        // Atajo para agregar línea (+)
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            agregarLinea(tipo);
            return;
        }

        // Atajo para quitar línea (-)
        if (e.key === '-') {
            e.preventDefault();
            const lineas = _lineasState[tipo].lineas;
            if (lineas.length) eliminarLinea(tipo, lineas.at(-1).lid);
            return;
        }

        // Atajo para guardar (Enter)
        if (e.key === 'Enter' && tag !== 'TEXTAREA') {
            e.preventDefault();
            if (tipo === 'herramienta') agregarHerramienta();
            else guardarMovimiento(tipo);
            return;
        }
    }

    // ── Enter en modales de guardado ─────────────────────
    if (e.key === 'Enter' && modalOpen && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
        const accionPorModal = {
            'modal-material-nuevo': guardarMaterial,
            'modal-material-editar': guardarMaterial,
            'modal-editar-mov': guardarEdicionMov,
        };
        const accion = accionPorModal[modalId];
        if (accion) { e.preventDefault(); accion(); }
    }
});

// ═══════════════════════════════════════════════════════
//  SCROLL GLOBAL (Header Sticky & Botón Subir)
// ═══════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
    // 1. Lógica del Botón Subir
    const btn = document.getElementById('btn-scroll-top');
    if (btn) {
        if (window.scrollY > window.innerHeight) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }

    // 2. Lógica del Header Dinámico
    const header = document.getElementById('main-header');
    if (header) {
        // Si bajamos más de 50px (aprox. la altura de las tabs), activamos el cambio
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }
}, { passive: true });

// limpiar clase error al escribir
document.addEventListener('input', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') e.target.classList.remove('error');
});

// ═══════════════════════════════════════════════════════
//  GIST SYNC
// ═══════════════════════════════════════════════════════
const GistSync = (() => {
    const CFG_KEY = 'SGI_gist_cfg';
    const FILENAME = 'materiales_data.json';
    const DEBOUNCE_MS = 3000;
    const RE_GIST_ID = /^[a-f0-9]{20,40}$/i; // Gist IDs son hex de 20-40 chars

    let _cfg = { token: '', gistId: '', lastSync: null, auto: false };
    let _debounceTimer = null;
    let _subiendo = false;

    function _cargarCfg() {
        try { const c = parseSeguro(localStorage.getItem(CFG_KEY) || 'null'); if (c) _cfg = { ..._cfg, ...c }; } catch (_) { }
        _actualizarBotonesAjustes();
    }

    function _guardarCfg() {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(_cfg)); } catch (_) { }
    }

    // ── Spinner en el botón de ajustes ──────────────────
    function _spinStart() {
        document.getElementById('btn-ajustes')?.classList.add('icon-btn-spinning');
    }
    function _spinStop() {
        document.getElementById('btn-ajustes')?.classList.remove('icon-btn-spinning');
    }

    // ── UI helpers ──────────────────────────────────────
    function _setBusy(busy) {
        _subiendo = busy;
        ['btn-gist-subir', 'btn-gist-bajar'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = busy;
        });
        if (busy) _spinStart(); else _spinStop();
    }

    function _setStatus(msg) {
        const el = document.getElementById('gist-sync-status');
        if (el) el.textContent = msg;
    }

    function _setStatusSync() {
        const d = new Date(_cfg.lastSync);
        const ts = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        _setStatus(`Sincronizado: ${d.toLocaleDateString('es-AR')}, ${ts}`);
    }

    function _actualizarLinkBtn() {
        const id = document.getElementById('gist-id')?.value.trim();
        const btn = document.getElementById('gist-link-btn');
        if (!btn) return;
        if (id) {
            btn.href = `https://gist.github.com/${id}`;
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    }

    function _actualizarToggleUI() {
        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on', !!_cfg.auto);
    }

    // ── Mostrar/ocultar botones rápidos en modal Ajustes ─
    function _actualizarBotonesAjustes() {
        const tieneToken = !!((_cfg.token || '').trim());
        const tieneGistId = !!((_cfg.gistId || '').trim());

        const btnUp = document.getElementById('btn-ajustes-gist-subir');
        const btnDn = document.getElementById('btn-ajustes-gist-bajar');

        // Botón SUBIR: Necesita ambos (Token y Gist ID)
        if (btnUp) btnUp.style.display = (tieneToken && tieneGistId) ? 'flex' : 'none';

        // Botón BAJAR: Solo necesita el Gist ID
        if (btnDn) btnDn.style.display = tieneGistId ? 'flex' : 'none';
    }

    // ── Toggle visibilidad token ─────────────────────────
    function toggleToken() {
        const inp = document.getElementById('gist-token');
        const icon = document.getElementById('gist-eye-icon');
        if (!inp) return;
        const mostrar = inp.type === 'password';
        inp.type = mostrar ? 'text' : 'password';
        if (icon) icon.setAttribute('href', mostrar ? '#icon-eye-off' : '#icon-eye');
    }

    // ── Toggle auto-sync ─────────────────────────────────
    function toggleAuto() {
        // Solo cambiamos la clase CSS visualmente. El guardado real se hace en guardarConfig()
        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on');
    }

    // ── Guardar config ───────────────────────────────────
    function guardarConfig() {
        const tokenEl = document.getElementById('gist-token');
        const idEl = document.getElementById('gist-id');
        const toggleEl = document.getElementById('gist-autosync-toggle'); // Obtenemos el switch

        const nuevoToken = tokenEl?.value.trim() || '';
        const nuevoGistId = idEl?.value.trim() || '';
        const nuevoAuto = toggleEl ? toggleEl.classList.contains('on') : false; // Leemos su estado visual

        if (nuevoGistId && !RE_GIST_ID.test(nuevoGistId)) {
            toast('El Gist ID tiene un formato inválido', 'error');
            if (idEl) idEl.classList.add('error');
            return;
        }

        // ── VALIDACIÓN: DETECTAR SI HUBO CAMBIOS ──
        const tokenActual = _cfg.token || '';
        const idActual = _cfg.gistId || '';
        const autoActual = !!_cfg.auto;

        // Ahora comparamos también el estado del switch
        if (tokenActual === nuevoToken && idActual === nuevoGistId && autoActual === nuevoAuto) {
            UI.cerrarGist();
            toast('Sin cambios', 'info');
            return;
        }
        // ──────────────────────────────────────────

        _cfg.token = nuevoToken;
        _cfg.gistId = nuevoGistId;
        _cfg.auto = nuevoAuto; // Guardamos el estado del auto-sync

        _guardarCfg();
        _actualizarBotonesAjustes();

        // Mensaje dinámico si se activó/desactivó el auto-sync, o genérico si solo cambió token/id
        if (autoActual !== nuevoAuto) {
            toast(nuevoAuto ? 'Configuración guardada. Sincronización automática activada' : 'Configuración guardada. Sincronización automática desactivada');
        } else {
            toast('Configuración guardada');
        }

        UI.cerrarGist();
    }

    // ── Núcleo de subida (compartido por manual y auto) ──
    async function _ejecutarSubida(silencioso = false) {
        const token = _cfg.token;
        const gistId = _cfg.gistId;
        if (!token) { if (!silencioso) toast('Ingresá el token primero', 'error'); return; }
        // Validar formato de gistId antes de interpolarlo en la URL
        if (gistId && !RE_GIST_ID.test(gistId)) {
            if (!silencioso) toast('Gist ID inválido', 'error');
            return;
        }

        _setBusy(true);
        if (!silencioso) _setStatus('Subiendo…');

        const firma = await generarFirma(state);
        const exportData = { ...state, _firma: firma };
        const payload = JSON.stringify(exportData, null, 2)
        const body = { files: { [FILENAME]: { content: payload } } };

        try {
            let res, data;
            if (gistId) {
                res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                body.description = 'Materiales — Control de Activos';
                body.public = false;
                res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await res.json();

            if (!gistId && data.id) {
                _cfg.gistId = data.id;
                const el = document.getElementById('gist-id');
                if (el) el.value = data.id;
                _actualizarLinkBtn();
            }

            _cfg.lastSync = new Date().toISOString();
            _guardarCfg();
            _setStatusSync();
            if (!silencioso) toast('Datos subidos a Gist');

        } catch (err) {
            _setStatus(`Error: ${err.message}`);
            if (!silencioso) toast(`Error al subir: ${err.message}`, 'error');
        } finally {
            _setBusy(false);
        }
    }

    // ── Subida manual (desde botón) ──────────────────────
    function subir() { _ejecutarSubida(false); }

    // ── Subida automática con debounce ───────────────────
    function subirAuto() {
        if (!_cfg.auto || !_cfg.token) return;
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            if (!_subiendo) _ejecutarSubida(true);
        }, DEBOUNCE_MS);
    }

    async function bajar() {
        const token = document.getElementById('gist-token')?.value.trim() || _cfg.token;
        const gistId = document.getElementById('gist-id')?.value.trim() || _cfg.gistId;
        if (!gistId) { toast('Ingresá el Gist ID primero', 'error'); return; }
        if (!RE_GIST_ID.test(gistId)) { toast('Gist ID inválido', 'error'); return; }

        _setBusy(true);
        _setStatus('Bajando…');

        try {
            const headers = {};
            if (token) {
                headers['Authorization'] = `token ${token}`;
            }

            const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const file = data.files?.[FILENAME];
            if (!file) throw new Error(`No se encontró "${FILENAME}" en el Gist`);

            let contenido = file.content;
            if (file.truncated) {
                const rawOrigin = new URL(file.raw_url).hostname;
                if (!rawOrigin.endsWith('.githubusercontent.com')) throw new Error('raw_url inválida');
                const r2 = await fetch(file.raw_url);
                contenido = await r2.text();
            }

            const rawRemoto = parseSeguro(contenido);
            const esValida = await verificarFirma(rawRemoto);
            const remoto = sanitizarEstado(rawRemoto);
            if (!remoto) throw new Error('Formato inválido');

            const procesarBajada = () => {
                _setBusy(true);

                const novedades = _contarNovedades(remoto, false);

                if (!novedades.matsNuevos && !novedades.matsEditados && !novedades.movsNuevos && !novedades.movsEditados && !novedades.cats && !novedades.herr) {
                    _cfg.token = token;
                    _cfg.gistId = gistId;
                    _cfg.lastSync = new Date().toISOString();
                    _guardarCfg();
                    _setStatusSync();
                    toast('Sin cambios', 'info');
                    _setBusy(false);
                    return;
                }

                historial.empujar(esValida ? 'Bajar desde Gist' : 'Bajar desde Gist (Forzado)');

                const combinados = _combinarDatosRemotos(remoto, false);

                guardar();
                historial.refrescarTodo();
                _cfg.token = token;
                _cfg.gistId = gistId;
                _cfg.lastSync = new Date().toISOString();
                _guardarCfg();
                _setStatusSync();

                toast(esValida ? `Datos combinados (${_resumenCambios(combinados)})` : `Datos alterados combinados (${_resumenCambios(combinados)})`, esValida ? 'success' : 'info');
                _setBusy(false);
            };

            // Si no es válida, frenamos el spinner y le preguntamos al usuario
            if (!esValida) {
                _setBusy(false);
                confirmar('Datos de Gist alterados', 'Los datos en GitHub han sido modificados manualmente. ¿Querés combinarlos de todos modos?', () => {
                    procesarBajada();
                });
            } else {
                procesarBajada();
            }

        } catch (err) {
            _setStatus(`Error: ${err.message}`);
            toast(`Error al bajar: ${err.message}`, 'error');
            _setBusy(false);
        }
    }

    // ── Poblar modal con config actual ───────────────────
    function poblarModal() {
        _cargarCfg();
        const tokenEl = document.getElementById('gist-token');
        const idEl = document.getElementById('gist-id');
        const eyeIcon = document.getElementById('gist-eye-icon');
        if (tokenEl) { tokenEl.value = _cfg.token || ''; tokenEl.type = 'password'; }
        if (idEl) idEl.value = _cfg.gistId || '';
        if (eyeIcon) eyeIcon.setAttribute('href', '#icon-eye');
        _actualizarLinkBtn();
        _actualizarToggleUI();
        if (_cfg.lastSync) {
            _setStatusSync();
        } else {
            _setStatus('');
        }
    }

    function init() {
        _cargarCfg();
        const idEl = document.getElementById('gist-id');
        if (idEl) idEl.addEventListener('input', _actualizarLinkBtn);
        _actualizarBotonesAjustes();
    }

    // ── Verificar al abrir (auto-sync ON) ───────────────
    function verificarAlAbrir() {
        if (!_cfg.auto || !_cfg.gistId) return;

        // Debounce / Delay de 3 segundos al iniciar
        setTimeout(async () => {
            _spinStart();
            try {
                const headers = {};
                if (_cfg.token) {
                    headers['Authorization'] = `token ${_cfg.token}`;
                }

                const res = await fetch(`https://api.github.com/gists/${_cfg.gistId}`, { headers });
                if (!res.ok) return;

                const data = await res.json();
                const file = data.files?.[FILENAME];
                if (!file) return;

                let contenido = file.content;
                if (file.truncated) {
                    const rawOrigin = new URL(file.raw_url).hostname;
                    if (!rawOrigin.endsWith('.githubusercontent.com')) return;
                    const r2 = await fetch(file.raw_url);
                    contenido = await r2.text();
                }

                // ── VERIFICACIÓN DE FIRMA ──
                const rawRemoto = parseSeguro(contenido);
                const esValida = await verificarFirma(rawRemoto);
                const remoto = sanitizarEstado(rawRemoto);
                if (!remoto) return;

                // Calcular diferencias
                const novedades = _contarNovedades(remoto, false);

                if (!novedades.matsNuevos && !novedades.matsEditados && !novedades.movsNuevos && !novedades.movsEditados && !novedades.cats && !novedades.herr) return;

                // ── AVISO VISUAL SI FUE MODIFICADO MANUALMENTE ──
                const desc = document.querySelector('.gist-novedades-desc');
                if (desc) {
                    desc.innerHTML = esValida
                        ? 'Se encontraron registros en el Gist que no están en este dispositivo:'
                        : 'Se encontraron registros en el Gist.<br><strong class="text-orange-block">⚠️ Atención: Los datos fueron alterados manualmente en GitHub.</strong>';
                }

                // Construir detalle para el modal
                const detalle = document.getElementById('gist-novedades-detalle');
                if (detalle) {
                    const chips = [];
                    if (novedades.matsNuevos) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Mat. Nuevos</span><span class="gist-novedades-chip-count">+${novedades.matsNuevos}</span></div>`);
                    if (novedades.matsEditados) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Mat. Actualizados</span><span class="gist-novedades-chip-count">~${novedades.matsEditados}</span></div>`);
                    if (novedades.movsNuevos) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Mov. Nuevos</span><span class="gist-novedades-chip-count">+${novedades.movsNuevos}</span></div>`);
                    if (novedades.movsEditados) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Mov. Actualizados</span><span class="gist-novedades-chip-count">~${novedades.movsEditados}</span></div>`);
                    if (novedades.cats) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Categorías</span><span class="gist-novedades-chip-count">+${novedades.cats}</span></div>`);
                    if (novedades.herr) chips.push(`<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">Herramientas</span><span class="gist-novedades-chip-count">+${novedades.herr}</span></div>`);
                    detalle.innerHTML = chips.join('');
                }

                // Callback del botón Agregar
                const btnOk = document.getElementById('gist-novedades-ok');
                if (btnOk) {
                    btnOk.onclick = () => {
                        historial.empujar(esValida ? 'Bajar novedades desde Gist' : 'Bajar novedades desde Gist (Forzado)');

                        const combinados = _combinarDatosRemotos(remoto, false);

                        guardar();
                        historial.refrescarTodo();
                        MM.cerrar('modal-gist-novedades');
                        toast(esValida ? `Datos combinados (${_resumenCambios(combinados)})` : `Datos alterados combinados (${_resumenCambios(combinados)})`, esValida ? 'success' : 'info');
                    };
                }

                // Pequeño delay para que la UI termine de renderizar antes de abrir el modal
                setTimeout(() => MM.abrir('modal-gist-novedades'), 600);

            } catch (_) {
                // silencioso
            } finally {
                _spinStop();
            }
        }, 3000);
    }

    return { subir, bajar, subirAuto, verificarAlAbrir, toggleToken, toggleAuto, guardarConfig, poblarModal, init, actualizarBotonesAjustes: _actualizarBotonesAjustes };
})();

// ═══════════════════════════════════════════════════════
//  REPORTE DE INVENTARIO
// ═══════════════════════════════════════════════════════
let _reporteAnio = null; // null = todos los períodos

function generarReporte() {
    if (!state.materiales.length) { toast('No hay datos para reportar', 'error'); return; }

    const aniosDisponibles = [...new Set(state.movimientos.map(m => m.fecha.substring(0, 4)))].sort((a, b) => b - a);
    const sel = document.getElementById('rpt-anio-select');
    if (!sel) return;

    sel.innerHTML = `<option value="">Todos los períodos</option>` +
        aniosDisponibles.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = _reporteAnio || '';
}

function _ejecutarReporte() {
    const sel = document.getElementById('rpt-anio-select');
    _reporteAnio = sel ? (sel.value || null) : null;
    const anioSeleccionado = _reporteAnio;
    
    let labelPeriodo = 'Historial completo';
    if (anioSeleccionado) {
        labelPeriodo = `Año ${anioSeleccionado}`;
    } else if (state.movimientos && state.movimientos.length > 0) {
        // Buscamos la fecha más antigua y la más reciente
        const minFecha = state.movimientos.reduce((min, m) => m.fecha < min ? m.fecha : min, state.movimientos[0].fecha);
        const maxFecha = state.movimientos.reduce((max, m) => m.fecha > max ? m.fecha : max, state.movimientos[0].fecha);
        
        // Si todo pasó el mismo día mostramos solo una fecha, sino el rango
        if (minFecha === maxFecha) {
            labelPeriodo = `Historial completo (${formatFecha(minFecha)})`;
        } else {
            labelPeriodo = `Historial completo (${formatFecha(minFecha)} - ${formatFecha(maxFecha)})`;
        }
    }

    // Filtrar movimientos por período
    const movsFiltrados = anioSeleccionado
        ? state.movimientos.filter(m => m.fecha.startsWith(anioSeleccionado))
        : state.movimientos;

    const totalEntradas = movsFiltrados.filter(m => m.tipo === 'entrada').length;
    const totalSalidas = movsFiltrados.filter(m => m.tipo === 'salida').length;

    // Consumo/entrada por material en el período
    const consumoPorMat = {};
    const entradaPorMat = {};
    movsFiltrados.forEach(mov => {
        mov.lineas.forEach(l => {
            if (mov.tipo === 'salida') consumoPorMat[l.materialId] = (consumoPorMat[l.materialId] || 0) + l.cantidad;
            else entradaPorMat[l.materialId] = (entradaPorMat[l.materialId] || 0) + l.cantidad;
        });
    });

    // Top 10 más consumidos en el período
    const top10 = Object.entries(consumoPorMat)
        .map(([id, cant]) => {
            const m = state.materiales.find(x => x.id === id);
            return { nombre: m ? m.nombre : '(eliminado)', categoria: m ? (m.categoria || '—') : '—', cantidad: cant };
        })
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

    // Stock actual (siempre acumulado total)
    const stockData = state.materiales.map(m => ({
        nombre: m.nombre,
        categoria: m.categoria || '—',
        unidad: m.unidad || 'u',
        stock: calcStock(m.id),
        consumoPeriodo: consumoPorMat[m.id] || 0,
        entradaPeriodo: entradaPorMat[m.id] || 0,
    })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const sinStock = stockData.filter(m => m.stock === 0).length;
    const conStockNeg = stockData.filter(m => m.stock < 0).length;

    // Fecha del reporte
    const ahora = new Date();
    const fechaReporte = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`;

    // Helpers de filas
    const filaStock = (m) => {
        const cls = m.stock < 0 ? 'neg' : m.stock === 0 ? 'zero' : 'pos';
        const consumoCell = m.consumoPeriodo > 0 ? m.consumoPeriodo : '<span class="muted">—</span>';
        const entradaCell = m.entradaPeriodo > 0 ? m.entradaPeriodo : '<span class="muted">—</span>';
        return `<tr>
                    <td>${esc(m.nombre)}</td>
                    <td>${esc(m.categoria)}</td>
                    <td class="num"><span class="stock-${cls}">${m.stock}</span> <span class="unit">${esc(m.unidad)}</span></td>
                    <td class="num">${entradaCell}</td>
                    <td class="num">${consumoCell}</td>
                </tr>`;
    };

    const filaTop = (item, i) => `<tr>
                <td class="num rank">#${i + 1}</td>
                <td>${esc(item.nombre)}</td>
                <td>${esc(item.categoria)}</td>
                <td class="num"><strong>${item.cantidad}</strong></td>
            </tr>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte de Inventario — ${labelPeriodo}</title>
<style>
  :root {
    --accent: #3b64d2;
    --green: #3a8c6c;
    --red: #ac5a4c;
    --orange: #c27a30;
    --muted: #6b7280;
    --border: #e5e7eb;
    --bg: #f9fafb;
    --card: #ffffff;
    --text: #111827;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; background:var(--bg); color:var(--text); font-size:14px; }
  .page { max-width:960px; margin:0 auto; padding:2rem 1.5rem 4rem; }
  .rpt-header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--accent); padding-bottom:1rem; margin-bottom:2rem; }
  .rpt-title { font-size:1.6rem; font-weight:800; color:var(--text); }
  .rpt-meta { text-align:right; font-size:0.8rem; color:var(--muted); line-height:1.6; }
  .rpt-period { font-size:0.95rem; font-weight:700; color:var(--accent); }
  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:1rem; margin-bottom:2rem; }
  .kpi { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:1rem; }
  .kpi-val { font-size:2rem; font-weight:800; color:var(--text); line-height:1; margin-bottom:0.25rem; }
  .kpi-val.red { color:var(--red); }
  .kpi-val.orange { color:var(--orange); }
  .kpi-label { font-size:0.72rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .section { margin-bottom:2.5rem; }
  .section-title { font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:0.75rem; padding-bottom:0.4rem; border-bottom:1px solid var(--border); }
  table { width:100%; border-collapse:collapse; background:var(--card); border-radius:10px; overflow:hidden; border:1px solid var(--border); }
  th { background:#f3f4f6; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); padding:.55rem .75rem; text-align:left; }
  td { padding:.5rem .75rem; border-top:1px solid var(--border); font-size:0.88rem; vertical-align:middle; }
  tr:hover td { background:#f9fafb; }
  .num { text-align:right; }
  .rank { color:var(--muted); font-size:0.8rem; }
  .unit { font-size:0.75rem; color:var(--muted); }
  .muted { color:var(--muted); }
  .stock-pos { color:var(--text); font-weight:700; }
  .stock-zero { color:var(--muted); font-weight:700; }
  .stock-neg { color:var(--red); font-weight:700; }
  .rpt-footer { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--border); font-size:0.75rem; color:var(--muted); text-align:center; }
  @media print { body { background:#fff; } .page { padding:1rem; } tr:hover td { background:none; } }
  @media (max-width:600px) { .kpi-grid { grid-template-columns:1fr 1fr; } .rpt-header { flex-direction:column; align-items:flex-start; gap:.5rem; } .rpt-meta { text-align:left; } }
</style>
</head>
<body>
<div class="page">

  <div class="rpt-header">
    <div class="rpt-title">📦 Reporte de Inventario</div>
    <div class="rpt-meta">
      <div class="rpt-period">${esc(labelPeriodo)}</div>
      <div>Generado: ${fechaReporte}</div>
      <div>${esc(state.materiales.length)} materiales registrados</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Resumen del período</div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${state.materiales.length}</div><div class="kpi-label">Materiales</div></div>
      <div class="kpi"><div class="kpi-val">${movsFiltrados.length}</div><div class="kpi-label">Movimientos</div></div>
      <div class="kpi"><div class="kpi-val">${totalEntradas}</div><div class="kpi-label">Entradas</div></div>
      <div class="kpi"><div class="kpi-val">${totalSalidas}</div><div class="kpi-label">Salidas</div></div>
      <div class="kpi"><div class="kpi-val ${sinStock > 0 ? 'orange' : ''}">${sinStock}</div><div class="kpi-label">Sin stock</div></div>
      ${conStockNeg > 0 ? `<div class="kpi"><div class="kpi-val red">${conStockNeg}</div><div class="kpi-label">Stock negativo</div></div>` : ''}
    </div>
  </div>

  ${top10.length > 0 ? `
  <div class="section">
    <div class="section-title">Top materiales más consumidos — ${esc(labelPeriodo)}</div>
    <table>
      <thead><tr><th>#</th><th>Material</th><th>Categoría</th><th class="num">Cantidad salida</th></tr></thead>
      <tbody>${top10.map(filaTop).join('')}</tbody>
    </table>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Inventario completo (stock acumulado total)</div>
    <table>
      <thead><tr><th>Material</th><th>Categoría</th><th class="num">Stock actual</th><th class="num">Entradas ${anioSeleccionado || ''}</th><th class="num">Salidas ${anioSeleccionado || ''}</th></tr></thead>
      <tbody>${stockData.map(filaStock).join('')}</tbody>
    </table>
  </div>

  <div class="rpt-footer">Materiales · Reporte generado el ${fechaReporte} · ${esc(labelPeriodo)}</div>
</div>
</body>
</html>`;

    MM.cerrar('modal-reporte');

    // Descargamos el reporte como archivo HTML para evitar restricciones CSP
    // El usuario lo abre en el navegador y los estilos inline funcionan sin restricciones
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-inventario-${labelPeriodo.replace(/\s+/g, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Reporte descargado. Abrilo en el navegador para verlo.', 'success');
}

// ═══════════════════════════════════════════════════════
//  PWA: BOTÓN DE INSTALACIÓN
// ═══════════════════════════════════════════════════════
(function initPWA() {
    let deferredPrompt;
    const btnInstallApp = document.getElementById('btn-install-app');

    // Escuchamos si el navegador dice "Esta app se puede instalar"
    window.addEventListener('beforeinstallprompt', (e) => {
        // Evitamos que el navegador muestre su propio mini-cartel
        e.preventDefault();
        // Guardamos el evento para dispararlo cuando el usuario toque nuestro botón
        deferredPrompt = e;
        // Mostramos nuestro botón en el header (usamos flex para que respete el diseño)
        if (btnInstallApp) btnInstallApp.style.display = 'flex';
    });

    // Qué pasa cuando el usuario toca nuestro botón
    if (btnInstallApp) {
        btnInstallApp.addEventListener('click', async () => {
            if (!deferredPrompt) return;

            // Mostramos el prompt nativo de instalación de Android/Windows
            deferredPrompt.prompt();

            // Esperamos a ver qué elige el usuario (Instalar o Cancelar)
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Elección del usuario: ${outcome}`);

            // Limpiamos la variable porque el prompt solo se puede usar una vez
            deferredPrompt = null;

            // Ocultamos el botón
            btnInstallApp.style.display = 'none';
        });
    }

    // Si el usuario la instaló exitosamente (o ya la tenía instalada y la abrió)
    window.addEventListener('appinstalled', () => {
        if (btnInstallApp) btnInstallApp.style.display = 'none';
        deferredPrompt = null;
        toast('Aplicación instalada con éxito', 'success');
    });
}());

// ═══════════════════════════════════════════════════════
//  GESTOR DE SWIPE (Navegación Táctil Móvil)
// ═══════════════════════════════════════════════════════
(function initSwipe() {
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwipeValid = false;

    document.addEventListener('touchstart', e => {
        // Desactivamos el swipe solo si hay un modal abierto
        if (document.body.classList.contains('modal-open')) {
            isSwipeValid = false;
            return;
        }

        isSwipeValid = true;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!isSwipeValid) return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const distX = touchEndX - touchStartX;
        const distY = touchEndY - touchStartY;
        const absDistX = Math.abs(distX);
        const absDistY = Math.abs(distY);

        // Configuramos umbrales: Mínimo 60px de recorrido horizontal, y máximo 40px de desvío vertical
        if (absDistX > 60 && absDistY < 40) {
            if (distX < 0) {
                // Swipe a la izquierda (←)
                if (_tabActual === 'dashboard') switchTab('movimientos');
            } else {
                // Swipe a la derecha (→)
                if (_tabActual === 'movimientos') switchTab('dashboard');
            }
        }
    }, { passive: true });
}());

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
(function init() {
    // ── Listeners migrados desde atributos inline del HTML ──
    const _on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

    // Header
    _on('btn-inicio-logo', 'click', () => window.location.href = '../index.html');
    _on('btn-inicio-titulo', 'click', () => window.location.href = '../index.html');
    _on('btn-undo', 'click', () => historial.undo());
    _on('btn-redo', 'click', () => historial.redo());
    _on('btn-ajustes', 'click', () => MM.abrir('modal-ajustes'));

    // Modal confirmar
    _on('confirmar-ok', 'click', () => {
        const cb = _confirmarCb;
        _confirmarCb = null;
        _confirmarPadreId = null;
        MM.cerrar('modal-confirmar');
        if (cb) cb();
    });
    _on('confirmar-cancelar', 'click', () => _volverAlPadre());

    // Tabs
    _on('tab-dashboard', 'click', () => switchTab('dashboard'));
    _on('tab-movimientos', 'click', () => switchTab('movimientos'));

    // Barra búsqueda
    _on('busq-global', 'input', () => onBusqGlobal());
    _on('busq-clear-btn', 'click', () => limpiarBusqueda());

    // ── LÓGICA DEL MENÚ FLOTANTE (FAB) ──
    const fabContainer = document.getElementById('fab-container');
    const fabMainBtn = document.getElementById('btn-fab-main');
    const fabMenu = document.getElementById('fab-menu');
    const fabOverlay = document.getElementById('fab-overlay'); // Agregamos el overlay

    function toggleFabMenu() {
        if (fabMenu && fabMainBtn) {
            const isOpen = fabMenu.classList.toggle('show');
            fabMainBtn.classList.toggle('active');

            // Sincronizamos el overlay con el estado del menú
            if (fabOverlay) {
                if (isOpen) fabOverlay.classList.add('show');
                else fabOverlay.classList.remove('show');
            }
        }
    }

    function closeFabMenu() {
        if (fabMenu && fabMainBtn) {
            fabMenu.classList.remove('show');
            fabMainBtn.classList.remove('active');
            if (fabOverlay) fabOverlay.classList.remove('show'); // Cerramos el overlay
        }
    }

    // Abrir/Cerrar menú al tocar el botón principal (+)
    _on('btn-fab-main', 'click', (e) => {
        e.stopPropagation();
        toggleFabMenu();
    });

    // Cerrar el menú si el usuario toca cualquier otra parte de la pantalla
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#fab-container')) {
            closeFabMenu();
        }
    });

    window.addEventListener('scroll', () => {
        closeFabMenu();
    }, { passive: true });

    // ── EVENTOS DE LOS 4 BOTONES DEL MENÚ ──
    _on('fab-btn-entrada', 'click', () => {
        closeFabMenu();
        abrirModalMovimiento('entrada');
    });

    _on('fab-btn-salida', 'click', () => {
        closeFabMenu();
        abrirModalMovimiento('salida');
    });

    _on('fab-btn-herramienta', 'click', () => {
        closeFabMenu();
        UI.abrirNuevaHerramienta('fab');
    });

    _on('fab-btn-material', 'click', () => {
        closeFabMenu();
        abrirModalMaterial(); // Abre directo el modal de "Nuevo material"
    });

    // Filtro año
    _on('input-anio-filtro', 'click', () => AnioCombo.abrir());
    _on('input-anio-filtro', 'blur', () => AnioCombo.cerrar());

    // Cabeceras tabla ordenables
    _on('th-indicador', 'click', () => ordenarMateriales('indicador'));
    _on('th-nombre', 'click', () => ordenarMateriales('nombre'));
    _on('th-stock', 'click', () => ordenarMateriales('stock'));
    _on('th-relevado', 'click', () => ordenarMateriales('relevado'));

    // Inputs umbral (max 4 dígitos) — delegación por clase
    document.querySelectorAll('.input-umbral-max4').forEach(el =>
        el.addEventListener('input', function () { if (this.value.length > 4) this.value = this.value.slice(0, 4); })
    );

    // Modal nuevo material
    _on('mat-nuevo-guardar-btn', 'click', () => guardarMaterial());
    _on('mat-nuevo-cancelar-btn', 'click', () => cerrarModalMaterial('nuevo'));

    // Modal editar material
    _on('mat-editar-buscar-btn', 'click', () => buscarMovimientosMaterialEditar());
    _on('mat-editar-guardar-btn', 'click', () => guardarMaterial());
    _on('mat-editar-eliminar-btn', 'click', () => eliminarMaterialDesdeModal());
    _on('mat-editar-cancelar-btn', 'click', () => cerrarModalMaterial('editar'));
    _on('mat-editar-lock-btn', 'click', () => ModalLocker.toggle('modal-material-editar'));

    // Modal entrada
    _on('btn-add-linea-entrada', 'click', () => agregarLinea('entrada'));
    _on('entrada-guardar-btn', 'click', () => guardarMovimiento('entrada'));
    _on('entrada-cancelar-btn', 'click', () => MM.cerrar('modal-entrada'));

    // Modal editar movimiento
    _on('editar-mov-guardar-btn', 'click', () => guardarEdicionMov());
    _on('editar-mov-eliminar-btn', 'click', () => eliminarDesdeEdicion());
    _on('editar-mov-cancelar-btn', 'click', () => MM.cerrar('modal-editar-mov'));
    _on('editar-mov-lock-btn', 'click', () => ModalLocker.toggle('modal-editar-mov'));

    // Modal salida
    _on('btn-add-linea-salida', 'click', () => agregarLinea('salida'));
    _on('salida-guardar-btn', 'click', () => guardarMovimiento('salida'));
    _on('salida-cancelar-btn', 'click', () => MM.cerrar('modal-salida'));

    // Modal ajustes
    _on('ajustes-btn-reporte', 'click', () => UI.abrirReporte());
    _on('ajustes-btn-categorias', 'click', () => UI.abrirCategorias());
    _on('ajustes-btn-herramientas', 'click', () => UI.abrirHerramientas('ajustes'));
    _on('ajustes-btn-gist', 'click', () => UI.abrirGist());
    _on('btn-ajustes-gist-subir', 'click', () => GistSync.subir());
    _on('btn-ajustes-gist-bajar', 'click', () => GistSync.bajar());
    _on('ajustes-btn-shortcuts', 'click', () => UI.abrirShortcuts());
    _on('ajustes-btn-exportar', 'click', () => { MM.cerrar('modal-ajustes'); exportarDatos(); });
    _on('ajustes-btn-importar', 'click', () => UI.abrirImportar());
    _on('ajustes-btn-restablecer', 'click', () => restablecerDatos());
    _on('ajustes-btn-cerrar', 'click', () => MM.cerrar('modal-ajustes'));
    _on('btn-dark-mode', 'click', () => toggleDarkMode());

    // Modal categorías
    _on('cat-nueva-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarCategoria(); } });
    _on('cat-agregar-btn', 'click', () => agregarCategoria());
    _on('cat-cerrar-btn', 'click', () => UI.cerrarCategorias());

    // Modal herramientas
    _on('herr-abrir-nuevo-btn', 'click', () => UI.abrirNuevaHerramienta());
    _on('btn-add-linea-herramienta', 'click', () => agregarLinea('herramienta'));
    _on('herr-guardar-btn', 'click', () => agregarHerramienta());
    _on('herr-nuevo-cancelar-btn', 'click', () => UI.cerrarNuevaHerramienta());
    _on('herr-nombre-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarHerramienta(); } });
    _on('herr-cantidad-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarHerramienta(); } });
    _on('herr-cerrar-btn', 'click', () => UI.cerrarHerramientas());


    // Delegación: eliminar herramienta
    const listaHerr = document.getElementById('lista-herramientas');
    if (listaHerr) {
        listaHerr.addEventListener('click', e => {
            const btn = e.target.closest('.btn-herr-delete');
            if (btn) eliminarHerramienta(btn.dataset.id);
        });
    }

    // Modal importar
    _on('importar-dropzone', 'click', () => document.getElementById('importar-file-input').click());
    _on('importar-file-input', 'change', e => onImportarFileChange(e));
    _on('importar-confirmar-btn', 'click', () => importarDatos('reemplazar'));
    _on('importar-combinar-btn', 'click', () => importarDatos('combinar'));
    _on('importar-cerrar-btn', 'click', () => UI.cerrarImportar());

    // Modal gist
    _on('gist-token-eye', 'click', () => GistSync.toggleToken());
    _on('btn-gist-subir', 'click', () => GistSync.subir());
    _on('btn-gist-bajar', 'click', () => GistSync.bajar());
    _on('gist-autosync-toggle', 'click', () => GistSync.toggleAuto());
    _on('gist-guardar-btn', 'click', () => GistSync.guardarConfig());
    _on('gist-cerrar-btn', 'click', () => UI.cerrarGist());

    // Modal gist novedades
    _on('gist-novedades-ignorar-btn', 'click', () => MM.cerrar('modal-gist-novedades'));

    // Modal shortcuts
    _on('shortcuts-cerrar-btn', 'click', () => UI.cerrarShortcuts());

    // Modal reporte
    _on('rpt-btn-generar', 'click', () => _ejecutarReporte());
    _on('reporte-cerrar-btn', 'click', () => UI.cerrarReporte());

    // Scroll top
    _on('btn-scroll-top', 'click', () => subirArriba());

    // ── Delegación para mes-separador (reemplaza inline onpointer*) ──
    const listaMov = document.getElementById('lista-movimientos');
    if (listaMov) {
        listaMov.addEventListener('pointerdown', e => {
            const sep = e.target.closest('.mes-separador');
            if (sep) UI.handleMesDown(e, sep);
        });
        listaMov.addEventListener('pointerup', e => {
            const sep = e.target.closest('.mes-separador');
            if (sep) UI.handleMesUp(e, sep);
        });
        listaMov.addEventListener('pointerleave', e => {
            if (e.target.closest('.mes-separador')) UI.handleMesCancel();
        });
        listaMov.addEventListener('pointercancel', e => {
            if (e.target.closest('.mes-separador')) UI.handleMesCancel();
        });
    }

    // ── Fin listeners migrados ──

    cargar();

    // dark mode
    try {
        if (localStorage.getItem('SGI_dark') === '1') {
            // Cambiar document.body por document.documentElement
            document.documentElement.classList.add('dark-mode');
            const btnDark = document.getElementById('btn-dark-mode');
            if (btnDark) {
                btnDark.title = 'Modo claro';
                const iconUse = btnDark.querySelector('use');
                if (iconUse) iconUse.setAttribute('href', '#icon-sun');
            }
        }
    } catch (_) { }

    // panel inicial visible — validación de 1 hora (3600000 ms)
    try {
        const lastTime = parseInt(localStorage.getItem('SGI_tab_time') || '0');
        const now = Date.now();

        // Si pasaron menos de 1 hora (3.600.000 ms), respetamos la pestaña guardada
        if (now - lastTime <= 3600000) {
            const t = localStorage.getItem('SGI_tab');
            if (t === 'movimientos') {
                document.getElementById('panel-dashboard').classList.remove('activa');
                document.getElementById('panel-movimientos').classList.add('activa');
                document.getElementById('tab-dashboard').classList.remove('activa');
                document.getElementById('tab-movimientos').classList.add('activa');
                _tabActual = 'movimientos';
            }
        } else {
            // Si pasó más de 1 hora, limpiamos la memoria para que arranque en Dashboard
            localStorage.setItem('SGI_tab', 'dashboard');
        }

        // Renovamos el temporizador desde "ahora"
        localStorage.setItem('SGI_tab_time', now.toString());
    } catch (_) { }

    // fechas por defecto = hoy en los dos modales
    const hoy = getHoyLocal();
    ['entrada-fecha', 'salida-fecha'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = hoy;
    });

    // hook: pre-cargar línea al abrir modales de movimiento
    ['entrada', 'salida'].forEach(tipo => {
        const modalId = `modal-${tipo}`;
        // usar MutationObserver para detectar cuando se agrega clase 'show'
        const el = document.getElementById(modalId);
        if (!el) return;
        new MutationObserver(mutations => {
            mutations.forEach(mu => {
                if (mu.attributeName === 'class') {
                    if (el.classList.contains('show') && _lineasState[tipo].lineas.length === 0) {
                        agregarLinea(tipo);
                        // resetear fecha
                        const fechaEl = document.getElementById(`${tipo}-fecha`);
                        if (fechaEl && !fechaEl.value) fechaEl.value = getHoyLocal();
                    }
                    // focus en ticket al abrir
                    if (el.classList.contains('show')) {
                        if (!isMobile()) {
                            setTimeout(() => {
                                const ticketEl = document.getElementById(`${tipo}-ticket`);
                                if (ticketEl) ticketEl.focus();
                            }, 50);
                        }
                    }
                }
            });
        }).observe(el, { attributes: true });
    });

    renderStats();
    renderMateriales();
    renderMovimientos();
    renderCategorias();
    poblarSelectCategorias();
    AnioCombo.poblar();
    GistSync.init();
    GistSync.verificarAlAbrir();

    // drag-drop en la dropzone de importar
    const dz = document.getElementById('importar-dropzone');
    if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('importar-dropzone-drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('importar-dropzone-drag'));
        dz.addEventListener('drop', e => {
            e.preventDefault();
            dz.classList.remove('importar-dropzone-drag');
            const file = e.dataTransfer.files[0];
            if (file) {
                const dt = new DataTransfer(); dt.items.add(file);
                document.getElementById('importar-file-input').files = dt.files;
                onImportarFileChange({ target: { files: [file] } });
            }
        });
    }
    // ── REGISTRO DEL SERVICE WORKER (PWA) ──
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('PWA: Service Worker registrado con éxito.', reg.scope))
                .catch(err => console.error('PWA: Error al registrar Service Worker:', err));
        });
    }
})();