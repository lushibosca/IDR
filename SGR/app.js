// ═══════════════════════════════════════════════════════
//  CONFIGURACIÓN DE CLAVE DE APLICACIÓN (NAMESPACE)
// ═══════════════════════════════════════════════════════
const APP_KEY = 'RCK_';

(function () {
    try { if (localStorage.getItem(APP_KEY + 'dark') === '1') document.documentElement.classList.add('dark-mode'); } catch (e) { }
}());

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function normalizarTexto(t) { if (!t) return ''; return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '); }
function getHoyLocal() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const isMobile = () => window.matchMedia('(pointer: coarse)').matches;
function parseSeguro(s) {
    if (!s) return null;
    return JSON.parse(s, (key, val) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) { console.warn('Prototype pollution bloqueado'); return undefined; }
        return val;
    });
}

// ═══════════════════════════════════════════════════════
//  FIRMA SHA-256
// ═══════════════════════════════════════════════════════
async function generarFirma(obj) {
    if (!obj) return '0';
    const core = { r: (obj.racks || []).map(x => [x.id, x.numero, x.marca, x.modelo, x.estado]) };
    const str = JSON.stringify(core);
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verificarFirma(raw) {
    if (!raw || typeof raw !== 'object' || !raw._firma) return false;
    const calc = await generarFirma(raw);
    return raw._firma === calc;
}

// ═══════════════════════════════════════════════════════
//  SANITIZACIÓN
// ═══════════════════════════════════════════════════════
// Estados válidos: inventario (disponible), servicio, baja
const ESTADOS_VALIDOS = new Set(['inventario', 'servicio', 'baja']);
const RE_ID = /^[a-z0-9]+$/i;

function _s(v, max = 200) { if (typeof v !== 'string') return ''; return v.trim().slice(0, max); }

function _sanitizarRack(r) {
    if (!r || typeof r !== 'object') return null;
    const id = _s(r.id, 32);
    const patrimonio = _s(r.patrimonio, 30);
    if (!id || !RE_ID.test(id)) return null;
    const estado = ESTADOS_VALIDOS.has(r.estado) ? r.estado : 'inventario';

    // ── REGLA DE NEGOCIO: Ubicación y número solo existen si está en servicio
    const enServicio = estado === 'servicio';

    return {
        id, estado,
        numero: enServicio ? _s(r.numero, 20) : '',
        patrimonio,
        marca: _s(r.marca, 50),
        modelo: _s(r.modelo, 50),
        identificador: _s(r.identificador || r.serial || id.toUpperCase(), 80),
        unidades: Number.isInteger(r.unidades) && r.unidades > 0 ? r.unidades : null,
        notas: _s(r.notas, 200),
        edificio: enServicio ? _s(r.edificio, 80) : '',
        piso: enServicio ? _s(r.piso, 30) : '',
        dependencia: enServicio ? _s(r.dependencia, 100) : '',
        _updatedAt: typeof r._updatedAt === 'string' ? r._updatedAt : new Date().toISOString(),
    };
}

function sanitizarEstado(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(raw.racks)) return null;
    const edificios = Array.isArray(raw.edificios)
        ? raw.edificios.map(e => _s(e, 80)).filter(Boolean)
        : [];
    return { racks: raw.racks.map(_sanitizarRack).filter(Boolean), edificios };
}

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let state = { racks: [], edificios: [] };
const CFG_DATA = APP_KEY + 'data';

function guardar() {
    try { localStorage.setItem(CFG_DATA, JSON.stringify(state)); } catch (_) { }
    GistSync.subirAuto();
}

function cargar() {
    try {
        const raw = parseSeguro(localStorage.getItem(CFG_DATA) || 'null');
        if (raw) { const limpio = sanitizarEstado(raw); if (limpio) state = limpio; }
    } catch (_) { }
}

// Actualiza campos de un rack por id y persiste.
// Garantiza que ninguna mutación quede sin guardar.
function actualizarRack(id, cambios) {
    const idx = state.racks.findIndex(r => r.id === id);
    if (idx === -1) return false;
    state.racks[idx] = { ...state.racks[idx], ...cambios, _updatedAt: new Date().toISOString() };
    guardar();
    return true;
}

// ═══════════════════════════════════════════════════════
//  CACHÉ DE REFERENCIAS DOM
// ═══════════════════════════════════════════════════════
// Se popula en _initDOMRefs() una vez que el DOM está listo.
const DOM = {};
function _initDOMRefs() {
    DOM.busqGlobal = document.getElementById('busq-global');
    DOM.tablaServicio = document.getElementById('tabla-servicio');
    DOM.tablaInventario = document.getElementById('tabla-inventario');
    DOM.servicioEmpty = document.getElementById('servicio-empty');
    DOM.inventarioEmpty = document.getElementById('inventario-empty');
    DOM.servicioCount = document.getElementById('servicio-count');
    DOM.inventarioCount = document.getElementById('inventario-count');
    DOM.statsGrid = document.getElementById('stats-grid');
    DOM.toast = document.getElementById('toast');
    DOM.btnUndo = document.getElementById('btn-undo');
    DOM.btnRedo = document.getElementById('btn-redo');
    DOM.fabRackServicio = document.getElementById('fab-rack-servicio');
    DOM.busqClearBtn = document.getElementById('busq-clear-btn');
    DOM.filtroMenu = document.getElementById('busq-filtro-menu');
    DOM.filtroBtn = document.getElementById('busq-filtro-btn');
}

// ═══════════════════════════════════════════════════════
//  HISTORIAL UNDO/REDO
// ═══════════════════════════════════════════════════════
const historial = (() => {
    const MAX = 30;
    let _pasado = [], _futuro = [];
    function _clonar(s) { return structuredClone(s); }
    function _actualizarBotones() {
        if (DOM.btnUndo) DOM.btnUndo.disabled = !_pasado.length;
        if (DOM.btnRedo) DOM.btnRedo.disabled = !_futuro.length;
    }
    function empujar(label) {
        _pasado.push({ state: _clonar(state), label });
        if (_pasado.length > MAX) _pasado.shift();
        _futuro = [];
        _actualizarBotones();
    }
    function undo() {
        if (!_pasado.length) return;
        const e = _pasado.pop();
        _futuro.push({ state: _clonar(state), label: e.label });
        if (_futuro.length > MAX) _futuro.shift();
        state = e.state; guardar(); renderTodo(); _actualizarBotones();
        toast('Deshecho: ' + e.label, 'info');
    }
    function redo() {
        if (!_futuro.length) return;
        const e = _futuro.pop();
        _pasado.push({ state: _clonar(state), label: e.label });
        if (_pasado.length > MAX) _pasado.shift();
        state = e.state; guardar(); renderTodo(); _actualizarBotones();
        toast('Rehecho: ' + e.label, 'info');
    }
    return { empujar, undo, redo };
})();

// ═══════════════════════════════════════════════════════
//  MODAL MANAGER
// ═══════════════════════════════════════════════════════
const MM = (() => {
    let _mdDown = false;
    let _nav = false, _back = false, _ignorar = false;
    const HIST_KEY = '_' + APP_KEY + 'histBase';
    if (!sessionStorage.getItem(HIST_KEY)) sessionStorage.setItem(HIST_KEY, String(window.history.length));
    window.addEventListener('popstate', () => {
        if (_ignorar) { _ignorar = false; return; }
        const abiertos = [...document.querySelectorAll('.modal.show')];
        if (!abiertos.length) return;
        _back = true; cerrarTop(); setTimeout(() => { _back = false; }, 50);
    });

    // ── Focus trap ──────────────────────────────────────────
    // Selectores de elementos que pueden recibir foco
    const FOCUSABLE = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled])',
        'select:not([disabled])', 'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    // Mapa de modal-id → handler de Tab activo, para poder removerlo al cerrar
    const _trapHandlers = new Map();
    // Elemento que tenía el foco antes de abrir el modal, para restaurarlo al cerrar
    const _prevFocus = new Map();

    function _instalarTrap(m) {
        _prevFocus.set(m.id, document.activeElement);

        // Mover el foco al primer elemento interactivo del modal
        const focusables = () => Array.from(m.querySelectorAll(FOCUSABLE)).filter(el => !el.closest('[hidden]'));
        setTimeout(() => { focusables()[0]?.focus(); }, 50);

        function _onTab(e) {
            if (e.key !== 'Tab') return;
            const elems = focusables();
            if (!elems.length) { e.preventDefault(); return; }
            const first = elems[0], last = elems[elems.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }
        m.addEventListener('keydown', _onTab);
        _trapHandlers.set(m.id, _onTab);
    }

    function _removerTrap(m) {
        const handler = _trapHandlers.get(m.id);
        if (handler) { m.removeEventListener('keydown', handler); _trapHandlers.delete(m.id); }
        // Restaurar foco al elemento que lo tenía antes de abrir
        const prev = _prevFocus.get(m.id);
        if (prev && typeof prev.focus === 'function') { try { prev.focus(); } catch (_) { } }
        _prevFocus.delete(m.id);
    }
    // ────────────────────────────────────────────────────────

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
        m.classList.add('show'); document.body.classList.add('modal-open');
        if (!_back && !_nav) history.pushState({ rckModal: id }, '');
        setTimeout(() => { m.addEventListener('mousedown', _onMD); m.addEventListener('click', _onClick); }, 100);
        _instalarTrap(m);
        cb?.();
    }
    function cerrar(id, cb) {
        const m = document.getElementById(id); if (!m) return;
        delete _onCerrar[id];
        m.classList.remove('show');
        if (!document.querySelector('.modal.show')) document.body.classList.remove('modal-open');
        m.removeEventListener('mousedown', _onMD); m.removeEventListener('click', _onClick);
        _removerTrap(m);
        if (!_back && !_nav) { _ignorar = true; history.back(); }
        cb?.();
    }
    function cerrarTodos() {
        document.querySelectorAll('.modal.show').forEach(m => {
            delete _onCerrar[m.id];
            m.classList.remove('show');
            m.removeEventListener('mousedown', _onMD); m.removeEventListener('click', _onClick);
            _removerTrap(m);
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
    function nav(desde, fn) {
        _nav = true; cerrar(desde);
        setTimeout(() => { fn(); _nav = false; }, 150);
    }
    return { abrir, cerrar, cerrarTodos, cerrarTop, nav };
})();

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
const _toastQ = []; let _toastBusy = false, _currentToast = null;
function toast(msg, tipo = 'success') {
    if (_currentToast && _currentToast.msg === msg && _currentToast.tipo === tipo) return;
    if (_toastQ.some(t => t.msg === msg && t.tipo === tipo)) return;
    _toastQ.push({ msg, tipo }); _flushToast();
}
function _flushToast() {
    if (_toastBusy || !_toastQ.length) return;
    _currentToast = _toastQ.shift(); _toastBusy = true;
    const el = DOM.toast;
    el.textContent = _currentToast.msg;
    el.className = `toast show ${_currentToast.tipo}`;
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { el.className = 'toast'; _toastBusy = false; _currentToast = null; _flushToast(); }, 300);
    }, 2500);
}

// ═══════════════════════════════════════════════════════
//  CONFIRMAR
// ═══════════════════════════════════════════════════════
let _confirmarCb = null, _confirmarPadreId = null;

function _volverAlPadreConfirmar() {
    _confirmarCb = null;
    MM.cerrar('modal-confirmar');
}

function confirmar(titulo, texto, cb) {
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-texto').textContent = texto;
    _confirmarCb = cb;
    const abiertos = [...document.querySelectorAll('.modal.show')];
    _confirmarPadreId = abiertos.length ? abiertos[abiertos.length - 1].id : null;
    MM.abrir('modal-confirmar', { onEscape: () => _volverAlPadreConfirmar() });
}

// ═══════════════════════════════════════════════════════
//  DARK MODE
// ═══════════════════════════════════════════════════════
function toggleDarkMode() {
    const dark = document.documentElement.classList.toggle('dark-mode');
    const iconUse = document.getElementById('dark-icon-use');
    if (iconUse) iconUse.setAttribute('href', dark ? '#icon-sun' : '#icon-moon');
    try { localStorage.setItem(APP_KEY + 'dark', dark ? '1' : '0'); } catch (_) { } // Actualizado
}

// ═══════════════════════════════════════════════════════
//  FAB DROPDOWN
// ═══════════════════════════════════════════════════════
let _fabOpen = false;

function _getFabOverlay() {
    let el = document.getElementById('fab-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fab-overlay';
        el.className = 'modal fab-overlay';
        el.addEventListener('click', cerrarFab);
        document.body.appendChild(el);
    }
    return el;
}

function cerrarFab() {
    _fabOpen = false;
    document.getElementById('fab-menu')?.classList.remove('show');
    document.getElementById('btn-fab-main')?.classList.remove('active');
    document.getElementById('fab-overlay')?.classList.remove('show');
}
function _cerrarFiltro() {
    const m = document.getElementById('busq-filtro-menu');
    const b = document.getElementById('busq-filtro-btn');
    if (m) m.classList.remove('open');
    if (b) b.classList.remove('activo');
}
function _cerrarVistaSafe() {
    const menuInv = document.getElementById('inv-vista-menu');
    if (menuInv && menuInv.classList.contains('open')) {
        menuInv.classList.remove('open');
        document.getElementById('btn-vista-inv')?.classList.remove('activo');
    }
    const menuServ = document.getElementById('serv-vista-menu');
    if (menuServ && menuServ.classList.contains('open')) {
        menuServ.classList.remove('open');
        document.getElementById('btn-vista-serv')?.classList.remove('activo');
    }
}
function _cerrarTodosDropdowns() {
    cerrarFab();
    _cerrarFiltro();
    _cerrarVistaSafe();
}
function toggleFab() {
    const abierto = _fabOpen;
    _cerrarTodosDropdowns();
    if (!abierto) {
        _fabOpen = true;
        document.getElementById('fab-menu')?.classList.add('show');
        document.getElementById('btn-fab-main')?.classList.add('active');
        _getFabOverlay().classList.add('show');
    }
}

// ═══════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════
let _tabActual = 'dashboard';
const TAB_ICONS = { dashboard: '#icon-dashboard', servicio: '#icon-rack', inventario: '#icon-inventory' };
const TAB_LABELS = { dashboard: 'Dashboard', servicio: 'Servicio', inventario: 'Inventario' };

function switchTab(tab) {
    cerrarFab();
    if (_tabActual === tab) {
        if (document.getElementById('busq-global').value) { limpiarBusqueda(); return; }
        if (tab === 'dashboard' && _resumenEdificioActual) { _resumenEdificioActual = null; renderResumenEdificios(); return; }
        return;
    }
    if (_tabActual === 'dashboard') _resumenEdificioActual = null;
    ['dashboard', 'servicio', 'inventario'].forEach(t =>
        document.getElementById(`tab-${t}`).classList.toggle('activa', t === tab)
    );
    try { localStorage.setItem(APP_KEY + 'tab', tab); } catch (_) { }
    const headerTabTitle = document.getElementById('header-tab-title');
    if (headerTabTitle) headerTabTitle.innerHTML = `<svg class="svg-icon"><use href="${TAB_ICONS[tab]}"/></svg> ${TAB_LABELS[tab]}`;

    // Limpiar cualquier animación pendiente en todos los paneles antes de cambiar
    ['dashboard', 'servicio', 'inventario'].forEach(t => {
        const p = document.getElementById(`panel-${t}`);
        if (p) p.classList.remove('activa', 'tab-saliendo', 'tab-entrando');
    });

    const entrante = document.getElementById(`panel-${tab}`);
    _tabActual = tab;
    entrante.classList.add('activa', 'tab-entrando');
    entrante.addEventListener('animationend', () => entrante.classList.remove('tab-entrando'), { once: true });
    renderTodo();
}

// ═══════════════════════════════════════════════════════
//  BÚSQUEDA
// ═══════════════════════════════════════════════════════
let _busqTimer = null;
function onBusqGlobal() {
    const val = DOM.busqGlobal.value;
    if (DOM.busqClearBtn) DOM.busqClearBtn.classList.toggle('visible', !!val);
    // Si hay búsqueda activa y estamos en dashboard, ir a inventario
    if (val && _tabActual === 'dashboard') switchTab('inventario');
    if (_busqTimer) clearTimeout(_busqTimer);
    _busqTimer = setTimeout(renderTodo, 300);
}
function limpiarBusqueda() {
    if (_busqTimer) clearTimeout(_busqTimer);
    DOM.busqGlobal.value = '';
    if (DOM.busqClearBtn) DOM.busqClearBtn.classList.remove('visible');
    renderTodo();
}

// ═══════════════════════════════════════════════════════
//  UI (modales y navegación)
// ═══════════════════════════════════════════════════════
const UI = {
    abrirServicio() {
        cerrarFab();
        const disponibles = state.racks.filter(r => r.estado === 'inventario');
        if (!disponibles.length) { toast('No hay racks disponibles para poner en servicio', 'error'); return; }
        const sel = document.getElementById('servicio-rack-select');
        sel.innerHTML = '<option value="">— Seleccioná un rack disponible —</option>' +
            [...disponibles].sort((a, b) => (b.unidades || 0) - (a.unidades || 0)).map(r => {
                const partes = [r.unidades ? r.unidades + 'U' : null, r.marca, r.patrimonio].filter(Boolean);
                return `<option value="${esc(r.id)}">${esc(partes.join(' · '))}</option>`;
            }).join('');
        sel.value = '';
        sel.classList.remove('error');
        ['servicio-piso', 'servicio-dependencia', 'servicio-numero'].forEach(id => {
            const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('error'); }
        });
        GestorEdificios.poblarSelect('servicio-edificio', '');
        MM.abrir('modal-rack-servicio');
    },
    abrirNuevoRack() {
        cerrarFab();
        ['numero', 'patrimonio', 'marca', 'modelo', 'notas'].forEach(f => {
            const el = document.getElementById(`rack-${f}-nuevo`);
            if (el) { el.value = ''; el.classList.remove('error'); }
        });
        MM.abrir('modal-rack-nuevo');
    },
    cerrarNuevoRack() { MM.cerrar('modal-rack-nuevo'); },
    abrirGist() { MM.nav('modal-ajustes', () => { GistSync.poblarModal(); MM.abrir('modal-gist', { onEscape: () => UI.cerrarGist() }); }); },
    cerrarGist() { MM.nav('modal-gist', () => MM.abrir('modal-ajustes')); },
    abrirAjustes() { MM.abrir('modal-ajustes'); },
    cerrarAjustes() { MM.cerrar('modal-ajustes'); },
    abrirImportar() {
        MM.nav('modal-ajustes', () => {
            document.getElementById('importar-file-input').value = '';
            document.getElementById('importar-dropzone-label').textContent = 'Seleccioná o arrastrá un archivo .json';
            const dz = document.getElementById('importar-dropzone');
            dz.classList.remove('dropzone-ok', 'dropzone-warn', 'dropzone-error');
            document.getElementById('importar-confirmar-btn').disabled = true;
            document.getElementById('importar-combinar-btn').disabled = true;
            _importarParsed = null;
            MM.abrir('modal-importar', {
                onEscape: () => UI.cerrarImportar()
            });

            // Se ejecuta inmediatamente después de pedir abrir el modal
            setTimeout(() => {
                document.getElementById('importar-file-input')?.click();
            }, 400);
        });
    },
    cerrarImportar() { MM.nav('modal-importar', () => MM.abrir('modal-ajustes')); },
};

// ═══════════════════════════════════════════════════════
//  GESTOR EDIFICIOS
// ═══════════════════════════════════════════════════════
const GestorEdificios = (() => {
    function _renderLista() {
        const lista = document.getElementById('edificios-lista');
        const empty = document.getElementById('edificios-empty');
        if (!lista) return;
        lista.innerHTML = '';
        const eds = state.edificios;
        if (!eds.length) {
            if (empty) empty.removeAttribute('hidden');
            return;
        }
        if (empty) empty.setAttribute('hidden', '');
        eds.forEach((ed, i) => {
            const li = document.createElement('li');
            li.className = 'edificios-item';
            const span = document.createElement('span');
            span.className = 'edificios-item-nombre';
            span.textContent = ed;
            const btn = document.createElement('button');
            btn.className = 'edificios-item-eliminar icon-btn';
            btn.title = 'Eliminar';
            btn.innerHTML = '<svg class="svg-icon"><use href="#icon-trash"/></svg>';
            btn.addEventListener('click', () => eliminar(i));
            li.appendChild(span);
            li.appendChild(btn);
            lista.appendChild(li);
        });
    }

    function poblarSelect(selectId, valorActual) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">— Sin edificio —</option>';
        state.edificios.forEach(ed => {
            const opt = document.createElement('option');
            opt.value = ed;
            opt.textContent = ed;
            sel.appendChild(opt);
        });
        sel.value = (valorActual && state.edificios.includes(valorActual)) ? valorActual : '';
    }

    function abrir() {
        _renderLista();
        ModalLocker.resetear('modal-edificios');
        MM.nav('modal-ajustes', () => MM.abrir('modal-edificios', { onEscape: () => cerrar() }));
    }

    function cerrar() {
        MM.nav('modal-edificios', () => MM.abrir('modal-ajustes'));
    }

    function agregar() {
        const input = document.getElementById('edificios-nuevo-input');
        if (!input) return;
        const nombre = input.value.trim();
        if (!nombre) { input.classList.add('error'); setTimeout(() => input.classList.remove('error'), 1200); return; }
        if (state.edificios.some(e => e.toLowerCase() === nombre.toLowerCase())) {
            toast('Ese edificio ya existe', 'error'); return;
        }
        historial.empujar('Agregar edificio');
        state.edificios.push(nombre);
        state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
        guardar();
        input.value = '';
        _renderLista();
        toast(`Edificio "${nombre}" agregado`, 'success');
    }

    function eliminar(idx) {
        const ed = state.edificios[idx];
        const enUso = state.racks.some(r => r.edificio === ed);
        const msg = enUso
            ? `"${ed}" está asignado a ${state.racks.filter(r => r.edificio === ed).length} rack(s). ¿Eliminar de todas formas?`
            : `¿Eliminar el edificio "${ed}"?`;
        confirmar('Eliminar edificio', msg, () => {
            historial.empujar('Eliminar edificio');
            state.edificios.splice(idx, 1);
            guardar();
            _renderLista();
            toast(`Edificio "${ed}" eliminado`);
        });
    }

    return { abrir, cerrar, agregar, poblarSelect };
})();

// ═══════════════════════════════════════════════════════
//  MODAL LOCKER
// ═══════════════════════════════════════════════════════
const ModalLocker = (() => {
    const CONFIGS = {
        'modal-rack-editar': {
            lockBtnId: 'rack-editar-lock-btn',
            exemptIds: new Set(['rack-editar-cancelar-btn', 'rack-editar-ir-servicio-btn', 'rack-editar-lock-btn']),
        },
        'modal-rack-editar-servicio': {
            lockBtnId: 'editar-servicio-lock-btn',
            exemptIds: new Set(['editar-servicio-cancelar-btn', 'editar-servicio-ir-rack-btn', 'editar-servicio-lock-btn']),
        },
        'modal-edificios': {
            lockBtnId: 'edificios-lock-btn',
            exemptIds: new Set(['edificios-cerrar-btn', 'edificios-lock-btn']),
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

        // Actualizar apariencia del botón de bloqueo
        const lockBtn = document.getElementById(cfg.lockBtnId);
        if (lockBtn) {
            lockBtn.classList.toggle('btn-input-side--baja', bloqueado);
            lockBtn.title = bloqueado ? 'Desbloquear edición' : 'Bloquear edición';
            const useEl = lockBtn.querySelector('use');
            if (useEl) useEl.setAttribute('href', bloqueado ? '#icon-lock' : '#icon-unlock');
        }

        // Deshabilitar/habilitar todos los interactivos excepto los exentos
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
//  RACK CRUD
// ═══════════════════════════════════════════════════════
// Devuelve el objeto de campos a aplicar cuando un rack sale del servicio.
// estado: 'inventario' (quitar de servicio) | 'baja' (dar de baja)
function _camposServicioVacio(estado = 'inventario') {
    return { estado, numero: '', edificio: '', piso: '', dependencia: '' };
}

// Valida que el patrimonio no colisione con otro rack existente.
// sufijo: 'nuevo' | 'editar' (para marcar el campo en error)
// excluirId: id del rack actual en edición (null al crear)
// Devuelve true si es válido, false si hay error (ya muestra toast).
function _validarPatrimonio(pat, sufijo, excluirId = null) {
    const patNorm = pat.toLowerCase();
    const esDuplicable = patNorm === 'no' || patNorm === 'relevar';
    if (!esDuplicable && state.racks.some(r => r.id !== excluirId && r.patrimonio.toLowerCase() === patNorm)) {
        document.getElementById(`rack-patrimonio-${sufijo}`)?.classList.add('error');
        toast(`Ya existe un rack con patrimonio "${pat}"`, 'error');
        return false;
    }
    return true;
}

function _leerFormRack(sufijo) {
    const g = (id) => document.getElementById(`rack-${id}-${sufijo}`)?.value.trim() || '';
    return {
        patrimonio: g('patrimonio'),
        marca: g('marca'),
        modelo: g('modelo'),
        unidades: parseInt(document.getElementById(`rack-unidades-${sufijo}`)?.value) || null,
        notas: g('notas'),
    };
}

function guardarNuevoRack() {
    const datos = _leerFormRack('nuevo');
    const uEl = document.getElementById('rack-unidades-nuevo');
    if (!datos.unidades) { uEl.classList.add('error'); toast('Las Unidades son obligatorias', 'error'); return; }
    if (!datos.patrimonio) datos.patrimonio = 'relevar';
    if (!_validarPatrimonio(datos.patrimonio, 'nuevo')) return;
    historial.empujar(`Agregar rack (patrimonio ${datos.patrimonio})`);

    // CREACIÓN DEL IDENTIFICADOR BASADO EN EL ID
    const nuevoId = uid();
    const identificadorAutogenerado = nuevoId.toUpperCase();

    state.racks.push({ id: nuevoId, identificador: identificadorAutogenerado, estado: 'inventario', numero: '', _updatedAt: new Date().toISOString(), ...datos });
    guardar(); renderTodo(); MM.cerrar('modal-rack-nuevo');
    toast(`Rack agregado al inventario`);
}

let _editandoRackId = null;
function abrirModalEditarRack(id) {
    const rack = state.racks.find(r => r.id === id); if (!rack) return;
    _editandoRackId = id;
    const set = (f, v) => {
        const el = document.getElementById(`rack-${f}-editar`);
        if (el) { el.value = v ?? ''; el.classList.remove('error'); }
    };
    set('patrimonio', rack.patrimonio);
    set('marca', rack.marca);
    set('modelo', rack.modelo);
    set('identificador', rack.identificador);
    set('notas', rack.notas);
    const uEl = document.getElementById('rack-unidades-editar');
    if (uEl) { uEl.value = rack.unidades ?? ''; uEl.classList.remove('error'); }

    // Botón baja
    const bajaBtn = document.getElementById('rack-editar-baja-btn');
    if (bajaBtn) {
        const esBaja = rack.estado === 'baja';
        bajaBtn.title = esBaja ? 'Reactivar al inventario' : 'Dar de baja';
        bajaBtn.classList.toggle('btn-baja--reactivar', esBaja);
    }

    MM.abrir('modal-rack-editar');

    // Mostrar botón "ir a servicio" solo si el rack está en servicio
    const irServicioBtn = document.getElementById('rack-editar-ir-servicio-btn');
    if (irServicioBtn) irServicioBtn.hidden = rack.estado !== 'servicio';
    ModalLocker.resetear('modal-rack-editar');
}

let _editandoServicioId = null;

function abrirModalEditarServicio(id) {
    const rack = state.racks.find(r => r.id === id); if (!rack) return;
    _editandoServicioId = id;
    const set = (fid, v) => {
        const el = document.getElementById(fid);
        if (el) { el.value = v ?? ''; el.classList.remove('error'); }
    };
    set('editar-servicio-numero', rack.numero);
    set('editar-servicio-identificador', rack.identificador);
    GestorEdificios.poblarSelect('editar-servicio-edificio', rack.edificio);
    set('editar-servicio-piso', rack.piso);
    set('editar-servicio-dependencia', rack.dependencia);
    const info = document.getElementById('editar-servicio-info');
    if (info) {
        const partes = [rack.patrimonio, rack.unidades ? rack.unidades + 'U' : null, rack.marca, rack.modelo].filter(Boolean);
        info.textContent = partes.join(' · ');
    }
    MM.abrir('modal-rack-editar-servicio');
    ModalLocker.resetear('modal-rack-editar-servicio');
}

// Compara un objeto de campos nuevos contra las propiedades actuales de un rack.
// Devuelve true si al menos un campo difiere (comparación de strings normalizados).
function _hayCambios(rack, nuevos) {
    return Object.keys(nuevos).some(k => {
        const actual = rack[k] ?? '';
        const nuevo = nuevos[k] ?? '';
        // Comparar como string para cubrir números (unidades) y strings vacíos
        return String(actual).trim() !== String(nuevo).trim();
    });
}

function guardarEditarServicio() {
    if (!_editandoServicioId) return;
    const numEl = document.getElementById('editar-servicio-numero');
    const numero = numEl?.value.trim() || '';
    if (!numero) { numEl?.classList.add('error'); toast('El número de rack es obligatorio', 'error'); return; }
    if (state.racks.some(r => r.id !== _editandoServicioId && r.numero && r.numero.toLowerCase() === numero.toLowerCase())) {
        numEl?.classList.add('error');
        toast(`El número "${numero}" ya está asignado a otro rack`, 'error');
        return;
    }
    const rack = state.racks.find(r => r.id === _editandoServicioId); if (!rack) return;
    const cambios = {
        numero,
        edificio: document.getElementById('editar-servicio-edificio')?.value.trim() || '',
        piso: document.getElementById('editar-servicio-piso')?.value.trim() || '',
        dependencia: document.getElementById('editar-servicio-dependencia')?.value.trim() || '',
    };
    if (!_hayCambios(rack, cambios)) { MM.cerrar('modal-rack-editar-servicio'); toast('Sin cambios', 'info'); return; }
    historial.empujar(`Editar rack en servicio (${rack.numero})`);
    actualizarRack(_editandoServicioId, cambios);
    renderTodo(); MM.cerrar('modal-rack-editar-servicio');
    toast('Rack actualizado');
}

function quitarDeServicio() {
    if (!_editandoServicioId) return;
    const rack = state.racks.find(r => r.id === _editandoServicioId); if (!rack) return;
    confirmar(
        `¿Quitar el rack "${rack.numero}" del servicio?`,
        'Volverá al inventario como disponible.',
        () => {
            historial.empujar(`Quitar de servicio rack (${rack.numero})`);
            // Se limpian los campos de servicio al volver al inventario
            actualizarRack(_editandoServicioId, _camposServicioVacio());
            renderTodo(); MM.cerrar('modal-rack-editar-servicio');
            toast('Rack devuelto al inventario', 'info');
        }
    );
}


function guardarEditarRack() {
    if (!_editandoRackId) return;
    const datos = _leerFormRack('editar');
    const uEl = document.getElementById('rack-unidades-editar');
    if (!datos.unidades) { uEl.classList.add('error'); toast('Las Unidades son obligatorias', 'error'); return; }
    if (!datos.patrimonio) datos.patrimonio = 'relevar';
    if (!_validarPatrimonio(datos.patrimonio, 'editar', _editandoRackId)) return;
    const rack = state.racks.find(r => r.id === _editandoRackId);
    if (!_hayCambios(rack, datos)) { MM.cerrar('modal-rack-editar'); toast('Sin cambios', 'info'); return; }
    historial.empujar(`Editar rack (patrimonio ${datos.patrimonio})`);
    actualizarRack(_editandoRackId, datos);
    renderTodo(); MM.cerrar('modal-rack-editar');
    toast(`Rack actualizado`);
}

function toggleBajaRack() {
    if (!_editandoRackId) return;
    const rack = state.racks.find(r => r.id === _editandoRackId); if (!rack) return;
    const esBaja = rack.estado === 'baja';
    if (esBaja) {
        // Reactivar
        historial.empujar(`Reactivar rack (patrimonio ${rack.patrimonio})`);
        actualizarRack(_editandoRackId, { estado: 'inventario' });
        renderTodo(); MM.cerrar('modal-rack-editar');
        toast(`Rack reactivado`);
    } else {
        // Dar de baja
        const enServicio = rack.estado === 'servicio';
        const textoBaja = enServicio
            ? 'Este rack está actualmente en servicio. Al darlo de baja se quitará del servicio y perderá su ubicación asignada.'
            : 'El rack quedará marcado como baja. Podés reactivarlo después.';
        confirmar(
            `¿Dar de baja el rack "${rack.numero}"?`,
            textoBaja,
            () => {
                historial.empujar(`Dar de baja rack (patrimonio ${rack.patrimonio})`);
                // Limpieza absoluta de parámetros de servicio al irse de baja
                actualizarRack(_editandoRackId, _camposServicioVacio('baja'));
                renderTodo(); MM.cerrar('modal-rack-editar');
                toast(`Rack dado de baja`, 'info');
            }
        );
    }
}

function eliminarRackActual() {
    if (!_editandoRackId) return;
    const rack = state.racks.find(r => r.id === _editandoRackId); if (!rack) return;
    confirmar(
        `¿Eliminar rack "${rack.numero}"?`,
        'Esta acción se puede deshacer antes de cerrar la página.',
        () => {
            historial.empujar(`Eliminar rack (patrimonio ${rack.patrimonio})`);
            state.racks = state.racks.filter(r => r.id !== _editandoRackId);
            guardar(); renderTodo(); MM.cerrar('modal-rack-editar');
            toast('Rack eliminado', 'info');
        }
    );
}

function confirmarPonerEnServicio() {
    const sel = document.getElementById('servicio-rack-select');
    const id = sel?.value;
    if (!id) { sel?.classList.add('error'); toast('Seleccioná un rack', 'error'); return; }
    const rack = state.racks.find(r => r.id === id); if (!rack) return;
    const numEl = document.getElementById('servicio-numero');
    const numero = numEl?.value.trim() || '';
    if (!numero) { numEl?.classList.add('error'); toast('El número de rack es obligatorio', 'error'); return; }
    if (state.racks.some(r => r.numero && r.numero.toLowerCase() === numero.toLowerCase())) {
        numEl?.classList.add('error');
        toast(`El número "${numero}" ya está asignado a otro rack`, 'error');
        return;
    }
    const edificio = document.getElementById('servicio-edificio')?.value.trim() || '';
    const piso = document.getElementById('servicio-piso')?.value.trim() || '';
    const dependencia = document.getElementById('servicio-dependencia')?.value.trim() || '';
    historial.empujar(`Poner en servicio rack (patrimonio ${rack.patrimonio})`);
    actualizarRack(id, { estado: 'servicio', numero, edificio, piso, dependencia });
    renderTodo(); MM.cerrar('modal-rack-servicio');
    toast(`Rack ${numero} puesto en servicio`);
    actualizarFabServicio();
}

function actualizarFabServicio() {
    const btn = DOM.fabRackServicio;
    if (!btn) return;
    const hayDisponibles = state.racks.some(r => r.estado === 'inventario');
    btn.disabled = !hayDisponibles;
    btn.title = hayDisponibles ? '' : 'No hay racks disponibles';
    btn.classList.toggle('fab-menu-item--disabled', !hayDisponibles);
}

// ═══════════════════════════════════════════════════════
const ESTADO_BADGE = {
    inventario: '<span class="rack-badge rack-badge-inventario">Disponible</span>',
    baja: '<span class="rack-badge rack-badge-baja">Baja</span>',
};
function _badgeEstado(r) {
    if (r.estado === 'servicio') {
        const num = r.numero ? esc(r.numero) : 'En servicio';
        const dep = r.dependencia ? ` — ${esc(r.dependencia)}` : '';
        const textoCompleto = num + dep;
        return `<span class="rack-badge rack-badge-servicio rack-badge-servicio--con-dep td-tooltip" data-tooltip="${esc(textoCompleto)}"><span class="rack-badge-num">${num}</span>${r.dependencia ? `<span class="rack-badge-dep"> — ${esc(r.dependencia)}</span>` : ''}</span>`;
    }
    return ESTADO_BADGE[r.estado] || '';
}

function _getCamposBusq() {
    const checks = document.querySelectorAll('#busq-filtro-menu input[type="checkbox"]:checked');
    return Array.from(checks).map(c => c.value); // [] si no hay ninguno
}
function _guardarCamposBusq() {
    try {
        const vals = _getCamposBusq();
        localStorage.setItem(APP_KEY + 'busq_campos', JSON.stringify(vals));
    } catch (_) { }
}
function _restaurarCamposBusq() {
    try {
        const saved = JSON.parse(localStorage.getItem(APP_KEY + 'busq_campos'));
        if (!Array.isArray(saved)) return;
        const allChecks = document.querySelectorAll('#busq-filtro-menu input[type="checkbox"]');
        allChecks.forEach(cb => { cb.checked = saved.includes(cb.value); });
        const total = allChecks.length;
        const checked = saved.length;
        const filtroToggleAll = document.getElementById('busq-filtro-toggle-all');
        if (filtroToggleAll) filtroToggleAll.textContent = checked === total ? 'Desactivar todo' : 'Activar todo';
        const filtroBtn = document.getElementById('busq-filtro-btn');
        if (filtroBtn) filtroBtn.classList.toggle('con-filtro', checked < total);
    } catch (_) { }
}
function _coincideBusqueda(r, busqRaw, campos) {
    const estadoVis = r.estado === 'inventario' ? 'disponible' : r.estado;
    const uniVis = r.unidades ? r.unidades + 'u' : '';

    const todosLosCampos = ['patrimonio', 'numero', 'marca', 'identificador', 'unidades', 'edificio', 'dependencia', 'estado', 'notas'];
    const camposArr = Array.isArray(campos) ? campos : [campos];
    if (!camposArr.length) return false;
    const esTodo = camposArr.includes('todo') || todosLosCampos.every(c => camposArr.includes(c));

    const _textoParaCampo = (c) => {
        if (c === 'numero') return r.numero || '';
        if (c === 'patrimonio') return r.patrimonio || '';
        if (c === 'marca') return [r.marca, r.modelo].join(' ');
        if (c === 'identificador') return r.identificador || '';
        if (c === 'unidades') return uniVis;
        if (c === 'estado') return estadoVis;
        if (c === 'edificio') return [r.edificio, r.piso].join(' ');
        if (c === 'dependencia') return r.dependencia || '';
        if (c === 'notas') return r.notas || '';
        return '';
    };

    // 1. Extraemos los "tokens" respetando frases entre comillas ("anexo c" -> no se separa)
    const tokensRaw = busqRaw.match(/"[^"]+"|\S+/g) || [];

    // 2. Limpiamos las comillas y normalizamos cada bloque de búsqueda
    const tokens = tokensRaw.map(t => normalizarTexto(t.replace(/"/g, '')));

    if (esTodo) {
        const hayfields = [
            normalizarTexto([r.numero].join(' ')),
            normalizarTexto([r.patrimonio].join(' ')),
            normalizarTexto([r.marca, r.modelo].join(' ')),
            normalizarTexto([r.identificador].join(' ')),
            normalizarTexto([r.notas].join(' ')),
            normalizarTexto([r.edificio, r.piso].join(' ')),
            normalizarTexto([r.dependencia].join(' ')),
            normalizarTexto([uniVis].join(' ')),
            normalizarTexto([estadoVis].join(' ')),
        ];
        // Primero intentar que todos los tokens estén en UN MISMO campo
        const matchSameField = hayfields.some(h => tokens.every(t => h.includes(t)));
        if (matchSameField) return true;
        // Fallback: todos los tokens en algún campo (cross-field), solo para tokens únicos
        if (tokens.length === 1) return hayfields.some(h => h.includes(tokens[0]));
        return false;
    }

    // Multi-campo: basta con que TODAS las palabras (o frases) coincidan en al menos UN campo en común
    return camposArr.some(c => {
        const h = normalizarTexto(_textoParaCampo(c));
        return tokens.every(t => h.includes(t));
    });
}

function _getRacksFiltrados() {
    // Tomamos el valor crudo sin normalizar acá, para no destruir las comillas
    const busqRaw = document.getElementById('busq-global')?.value || '';
    let racks = [...state.racks];

    if (busqRaw.trim()) {
        const campos = _getCamposBusq();
        racks = racks.filter(r => _coincideBusqueda(r, busqRaw, campos));
    }

    return _ordenarArray(racks, _sortInv.col, _sortInv.dir);
}


function _filaRackInv(r) {
    return `<tr class="tr-clickable rack-estado-${r.estado}" data-rack-id="${esc(r.id)}">
        <td>${_badgeEstado(r)}</td>
        <td class="td-muted">${esc(r.patrimonio || '—')}</td>
        <td class="td-muted td-center">${r.unidades != null ? esc(String(r.unidades)) + 'U' : '—'}</td>
        <td>${esc(r.marca || '—')}</td>
        <td class="td-muted">${esc(r.identificador || '—')}</td>
    </tr>`;
}

function _filaRackServicio(r) {
    return `<tr class="tr-clickable rack-estado-${r.estado}" data-rack-id="${esc(r.id)}">
        <td class="td-rack-num">${esc(r.numero)}</td>
        <td>${esc(r.edificio || '—')}</td>
        <td class="td-muted">${esc(r.piso || '—')}</td>
        <td class="td-muted">${esc(r.dependencia || '—')}</td>
        <td class="td-muted">—</td>
    </tr>`;
}

// ═══════════════════════════════════════════════════════
//  ORDENAMIENTO (SORTING)
// ═══════════════════════════════════════════════════════
let _sortInv = (() => { try { const s = JSON.parse(localStorage.getItem(APP_KEY + 'sort_inv')); if (s?.col) return s; } catch (_) { } return { col: 'patrimonio', dir: 1 }; })();
let _sortServ = (() => { try { const s = JSON.parse(localStorage.getItem(APP_KEY + 'sort_serv')); if (s?.col) return s; } catch (_) { } return { col: 'numero', dir: 1 }; })();

function _ordenarArray(arr, col, dir) {
    return arr.sort((a, b) => {
        let valA = a[col] ?? '';
        let valB = b[col] ?? '';
        // Manejo numérico puro (ej: unidades)
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * dir;
        }
        // Manejo alfanumérico inteligente ("10" va después de "2")
        return String(valA).localeCompare(String(valB), 'es', { numeric: true }) * dir;
    });
}

function _actualizarIndicadoresSort(panelId, sortObj) {
    document.querySelectorAll(`#${panelId} th[data-sort]`).forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortObj.col) {
            th.classList.add(sortObj.dir === 1 ? 'sort-asc' : 'sort-desc');
        }
    });
}

// ═══════════════════════════════════════════════════════
//  RENDER DASHBOARD
// ═══════════════════════════════════════════════════════
function renderDashboard() {
    // Stats sidebar
    const all = state.racks;
    const total = all.length;
    const enServ = all.filter(r => r.estado === 'servicio').length;
    const enInv = all.filter(r => r.estado === 'inventario').length;
    const enBaja = all.filter(r => r.estado === 'baja').length;

    const pct = n => total > 0 ? `<span class="stat-chip-pct">${Math.round((n / total) * 100)}%</span>` : '';

    DOM.statsGrid.innerHTML = `
        <div class="stat-chip">
            <span class="stat-chip-label">Racks</span>
            <span class="stat-chip-value">${total}</span>
            <span class="stat-chip-sub">registrados</span>
        </div>
        <div class="stat-chip stat-chip-clickable" data-busq="disponible">
            <span class="stat-chip-label">Disponibles</span>
            <div class="stat-chip-value-row">
                <span class="stat-chip-value dist-inventario">${enInv}</span>${pct(enInv)}
            </div>
            <span class="stat-chip-sub">en inventario</span>
        </div>
        <div class="stat-chip stat-chip-clickable" data-busq="servicio">
            <span class="stat-chip-label">En Servicio</span>
            <div class="stat-chip-value-row">
                <span class="stat-chip-value dist-servicio">${enServ}</span>${pct(enServ)}
            </div>
            <span class="stat-chip-sub">activos</span>
        </div>
        <div class="stat-chip stat-chip-clickable" data-busq="baja">
            <span class="stat-chip-label">Baja</span>
            <div class="stat-chip-value-row">
                <span class="stat-chip-value dist-baja">${enBaja}</span>${pct(enBaja)}
            </div>
            <span class="stat-chip-sub">dados de baja</span>
        </div>
        `;

    renderResumenEdificios();

}

// ═══════════════════════════════════════════════════════
//  RESUMEN DE RACKS (card dashboard) — toggle column
// ═══════════════════════════════════════════════════════

// Columnas que rotan en la 3ra columna. Agregar más aquí en el futuro.
const RESUMEN_TOGGLE_COLS = [
    { key: 'conP',  label: 'CON PAT.',  cls: 'resumen-td-con' },
    { key: 'sinP',  label: 'SIN PAT.',  cls: 'resumen-td-sin' },
    { key: 'sinR',  label: 'SIN REL.',  cls: 'resumen-td-rel' },
];

let _resumenToggleIdx = 0;
let _resumenToggleTimer = null;

function _iniciarToggleResumen() {
    if (_resumenToggleTimer) clearInterval(_resumenToggleTimer);
    _resumenToggleTimer = setInterval(() => {
        _resumenToggleIdx = (_resumenToggleIdx + 1) % RESUMEN_TOGGLE_COLS.length;
        _actualizarColumnaToggle();
    }, 3000);
}

function _actualizarColumnaToggle() {
    const col = RESUMEN_TOGGLE_COLS[_resumenToggleIdx];
    const thToggle = document.getElementById('resumen-th-toggle');
    if (thToggle) {
        thToggle.textContent = col.label;
        thToggle.classList.add('resumen-th-toggle-animating');
        setTimeout(() => thToggle.classList.remove('resumen-th-toggle-animating'), 350);
    }
    document.querySelectorAll('.resumen-td-toggle').forEach(td => {
        const val = parseInt(td.dataset[col.key] || '0', 10);
        const tot = parseInt(td.dataset.total || '0', 10);
        const pct = tot > 0 ? ` <span class="resumen-pct">(${Math.round((val / tot) * 100)}%)</span>` : '';
        td.innerHTML = val + pct;
        td.className = 'resumen-td-num resumen-td-toggle ' + col.cls;
        td.classList.add('resumen-td-toggle-animating');
        setTimeout(() => td.classList.remove('resumen-td-toggle-animating'), 350);
    });
}

function renderResumenRacks() {
    const contenedor = document.getElementById('resumen-racks-tabla');
    if (!contenedor) return;

    const _patNorm = r => (r.patrimonio || '').trim().toLowerCase();
    const conPat  = r => { const p = _patNorm(r); return p && p !== 'relevar' && p !== 'no'; };
    const sinPat  = r => _patNorm(r) === 'no';
    const sinRel  = r => { const p = _patNorm(r); return !p || p === 'relevar'; };

    const allRacks     = state.racks;
    const enServicio   = allRacks.filter(r => r.estado === 'servicio');
    const enInventario = allRacks.filter(r => r.estado === 'inventario');
    const enBaja       = allRacks.filter(r => r.estado === 'baja');
    const totalGeneral = allRacks.length;

    const _fila = (label, grupo, cls) => ({
        label,
        total: grupo.length,
        conP:  grupo.filter(conPat).length,
        sinP:  grupo.filter(sinPat).length,
        sinR:  grupo.filter(sinRel).length,
        cls,
    });

    const filas = [
        _fila('Racks',      allRacks,     ''),
        _fila('En servicio',enServicio,   'resumen-fila-sub'),
        _fila('Disponible', enInventario, 'resumen-fila-sub resumen-fila-inv'),
        _fila('Baja',       enBaja,       'resumen-fila-sub resumen-fila-baja'),
    ];

    const col = RESUMEN_TOGGLE_COLS[_resumenToggleIdx];

    const filaHTML = f => {
        const pctTotal = totalGeneral > 0
            ? ` <span class="resumen-pct">(${Math.round((f.total / totalGeneral) * 100)}%)</span>`
            : '';
        const toggleVal = f[col.key];
        const pct = f.total > 0
            ? ` <span class="resumen-pct">(${Math.round((toggleVal / f.total) * 100)}%)</span>`
            : '';
        return `
        <tr class="resumen-fila ${f.cls}">
            <td class="resumen-td-label">${esc(f.label)}</td>
            <td class="resumen-td-num resumen-td-total">${f.total}${pctTotal}</td>
            <td class="resumen-td-num resumen-td-toggle ${col.cls}"
                data-total="${f.total}"
                data-conP="${f.conP}"
                data-sinP="${f.sinP}"
                data-sinR="${f.sinR}">${toggleVal}${pct}</td>
        </tr>`;
    };

    contenedor.innerHTML = `
        <div class="table-wrap">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th class="resumen-th-activo">ÍTEM</th>
                        <th class="resumen-th-num resumen-th-total">TOTAL</th>
                        <th class="resumen-th-num resumen-th-toggle" id="resumen-th-toggle">${col.label}</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas.map(filaHTML).join('')}
                </tbody>
            </table>
        </div>`;

    _iniciarToggleResumen();
}

// ═══════════════════════════════════════════════════════
//  RESUMEN POR EDIFICIO (segunda card dashboard)
// ═══════════════════════════════════════════════════════

let _resumenEdificioActual = null;

function renderResumenEdificios() {
    const contenedor = document.getElementById('resumen-edificios-tabla');
    if (!contenedor) return;

    const enServicio = state.racks.filter(r => r.estado === 'servicio');

    const mapa = {};
    enServicio.forEach(r => {
        const ed = r.edificio || '(Sin edificio)';
        mapa[ed] = (mapa[ed] || 0) + 1;
    });

    const edificios = Object.entries(mapa).sort((a, b) => b[1] - a[1]);

    if (!edificios.length) {
        _resumenEdificioActual = null;
        contenedor.innerHTML = '<p class="td-muted td-sm" style="padding:1rem 0.85rem">Sin racks en servicio</p>';
        return;
    }

    if (_resumenEdificioActual && !mapa[_resumenEdificioActual]) {
        _resumenEdificioActual = null;
    }

    if (_resumenEdificioActual) {
        _renderResumenPisos(contenedor, enServicio, _resumenEdificioActual);
    } else {
        _renderResumenListaEdificios(contenedor, edificios, enServicio.length);
    }
}

let _sortEdificios = (() => { try { const s = JSON.parse(localStorage.getItem(APP_KEY + 'sort_edificios')); if (s?.col) return s; } catch (_) { } return { col: 'total', dir: -1 }; })();

function _renderResumenListaEdificios(contenedor, edificios, totalServicio) {
    const sub = document.getElementById('resumen-edificios-subtitulo');
    if (sub) { sub.textContent = ''; sub.hidden = true; }

    const sorted = [...edificios].sort((a, b) => {
        if (_sortEdificios.col === 'nombre') {
            return a[0].localeCompare(b[0], 'es') * _sortEdificios.dir;
        }
        return (a[1] - b[1]) * _sortEdificios.dir;
    });

    const filas = sorted.map(([ed, total]) => {
        const pct = totalServicio > 0 ? ` <span class="resumen-pct">(${Math.round((total / totalServicio) * 100)}%)</span>` : '';
        return `
        <tr class="resumen-fila resumen-fila-clickable" data-edificio="${esc(ed)}">
            <td class="resumen-td-label">${esc(ed)}</td>
            <td class="resumen-td-num resumen-td-total">${total}${pct}</td>
            <td class="resumen-td-num resumen-td-chevron">
                <svg class="svg-icon resumen-chevron-icon"><use href="#icon-chevron-right"/></svg>
            </td>
        </tr>`;
    }).join('');

    const clsNombre = 'th-sortable' + (_sortEdificios.col === 'nombre' ? (_sortEdificios.dir === 1 ? ' sort-asc' : ' sort-desc') : '');
    const clsTotal  = 'th-sortable' + (_sortEdificios.col === 'total'  ? (_sortEdificios.dir === 1 ? ' sort-asc' : ' sort-desc') : '');

    contenedor.innerHTML = `
        <div class="table-wrap">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th class="resumen-th-activo ${clsNombre}" data-sort-ed="nombre">EDIFICIO</th>
                        <th class="resumen-th-num resumen-th-total ${clsTotal}" data-sort-ed="total">TOTAL</th>
                        <th class="resumen-th-num resumen-th-chevron-col"></th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;

    contenedor.querySelectorAll('th[data-sort-ed]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sortEd;
            if (_sortEdificios.col === col) {
                _sortEdificios.dir *= -1;
            } else {
                _sortEdificios.col = col;
                _sortEdificios.dir = col === 'nombre' ? 1 : -1;
            }
            try { localStorage.setItem(APP_KEY + 'sort_edificios', JSON.stringify(_sortEdificios)); } catch (_) { }
            const c = document.getElementById('resumen-edificios-tabla');
            const enServicio = state.racks.filter(r => r.estado === 'servicio');
            const mapa = {};
            enServicio.forEach(r => { const ed = r.edificio || '(Sin edificio)'; mapa[ed] = (mapa[ed] || 0) + 1; });
            const eds = Object.entries(mapa);
            if (c) _renderResumenListaEdificios(c, eds, enServicio.length);
        });
    });

    contenedor.querySelectorAll('.resumen-fila-clickable').forEach(tr => {
        tr.addEventListener('click', e => {
            e.stopPropagation();
            _resumenEdificioActual = tr.dataset.edificio;
            const c = document.getElementById('resumen-edificios-tabla');
            if (c) _renderResumenPisos(c, state.racks.filter(r => r.estado === 'servicio'), _resumenEdificioActual);
        });
    });
}

function _renderResumenPisos(contenedor, enServicio, edificio) {
    const sub = document.getElementById('resumen-edificios-subtitulo');
    if (sub) {
        sub.textContent = '';
        const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ico.classList.add('svg-icon', 'resumen-back-icon');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#icon-back');
        ico.appendChild(use);
        sub.appendChild(ico);
        sub.appendChild(document.createTextNode(' ' + edificio));
        sub.hidden = false;
    }

    const racksEdificio = enServicio.filter(r => (r.edificio || '(Sin edificio)') === edificio);
    const totalEdificio = racksEdificio.length;

    const mapaPisos = {};
    racksEdificio.forEach(r => {
        const piso = r.piso?.trim() || '(Sin piso)';
        mapaPisos[piso] = (mapaPisos[piso] || 0) + 1;
    });

    const pisos = Object.keys(mapaPisos).sort(_ordenarPisos);

    const filas = pisos.map(piso => {
        const total = mapaPisos[piso];
        const pct = totalEdificio > 0 ? Math.round((total / totalEdificio) * 100) : 0;
        return `
        <tr class="resumen-fila">
            <td class="resumen-td-label">${esc(piso)}</td>
            <td class="resumen-td-num resumen-td-total">${total} <span class="resumen-pct">(${pct}%)</span></td>
        </tr>`;
    }).join('');

    contenedor.innerHTML = `
        <div class="table-wrap">
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th class="resumen-th-activo">PISO</th>
                        <th class="resumen-th-num resumen-th-total">RACKS</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;

    // volver al tocar el subtítulo del header
    sub?.addEventListener('click', () => {
        _resumenEdificioActual = null;
        renderResumenEdificios();
    }, { once: true });
}

// ═══════════════════════════════════════════════════════
//  RENDER SERVICIO
// ═══════════════════════════════════════════════════════
function renderServicio() {
    const busq = normalizarTexto(DOM.busqGlobal?.value || '');
    let racks = state.racks.filter(r => r.estado === 'servicio');
    if (busq) {
        const campos = _getCamposBusq();
        racks = racks.filter(r => _coincideBusqueda(r, busq, campos));
    }
    racks = _ordenarArray(racks, _sortServ.col, _sortServ.dir);

    const empty = DOM.servicioEmpty;
    const count = DOM.servicioCount;
    const tablaWrap = document.getElementById('serv-tabla-wrap');
    const gruposWrap = document.getElementById('serv-grupos-wrap');
    const tbody = DOM.tablaServicio;

    if (count) count.textContent = racks.length;

    if (!racks.length) {
        tablaWrap?.removeAttribute('hidden');
        gruposWrap?.setAttribute('hidden', '');
        if (tbody) tbody.innerHTML = '';
        empty?.classList.remove('empty-state-hidden');
        _actualizarIndicadoresSort('panel-servicio', _sortServ);
        return;
    }
    empty?.classList.add('empty-state-hidden');

    const grupos = _getGrupos(racks, _agrupServ);

    if (!grupos) {
        gruposWrap?.setAttribute('hidden', '');
        tablaWrap?.removeAttribute('hidden');
        if (tbody) tbody.innerHTML = racks.map(_filaRackServicio).join('');
    } else {
        tablaWrap?.setAttribute('hidden', '');
        gruposWrap?.removeAttribute('hidden');

        let abiertos = null;
        if (!busq) {
            try {
                const saved = localStorage.getItem(APP_KEY + 'grupos_serv_abiertos');
                if (saved !== null) abiertos = new Set(JSON.parse(saved));
            } catch (_) { }
        }

        if (gruposWrap) {
            const thead = `<thead class="inv-thead-sticky">
                <tr>
                    <th data-sort="numero" class="th-sortable">Rack</th>
                    <th data-sort="edificio" class="th-sortable">Edificio</th>
                    <th data-sort="piso" class="th-sortable">Piso</th>
                    <th data-sort="dependencia" class="th-sortable">Dependencia</th>
                    <th>Patcheras</th>
                </tr>
            </thead>`;

            // Construir fila pero con posibilidad de 'hidden'
            const _buildFilaServicio = (r, visible) =>
                `<tr class="tr-clickable rack-estado-${r.estado}" data-rack-id="${esc(r.id)}"${visible ? '' : ' hidden'}>
                    <td class="td-rack-num">${esc(r.numero)}</td>
                    <td>${esc(r.edificio || '—')}</td>
                    <td class="td-muted">${esc(r.piso || '—')}</td>
                    <td class="td-muted">${esc(r.dependencia || '—')}</td>
                    <td class="td-muted">—</td>
                </tr>`;

            const tbodyRows = grupos.map((g, i) => {
                const key = g.titulo;
                const isOpen = busq ? true : (abiertos !== null ? abiertos.has(key) : i === 0);

                if (g.subgrupos) {
                    const subRows = g.subgrupos.map(sg => {
                        const subKey = `${key}__${sg.titulo}`;
                        const subOpen = busq ? true : (abiertos !== null ? abiertos.has(subKey) : isOpen);
                        const filasSub = sg.racks.map(r => _buildFilaServicio(r, isOpen && subOpen)).join('');
                        return `<tr class="inv-grupo-tr-header inv-grupo-tr-sub${subOpen ? ' open' : ''}" data-grupo-key="${esc(subKey)}"${isOpen ? '' : ' hidden'}>
                            <td colspan="5">
                                <div class="inv-grupo-header inv-grupo-header-sub">
                                    <span class="inv-grupo-titulo">PISO: ${esc(sg.titulo)}</span>
                                    <span class="inv-grupo-badge">${sg.racks.length}</span>
                                    <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                                </div>
                            </td>
                        </tr>${filasSub}`;
                    }).join('');
                    return `<tr class="inv-grupo-tr-header${isOpen ? ' open' : ''}" data-grupo-key="${esc(key)}">
                        <td colspan="5">
                            <div class="inv-grupo-header">
                                <span class="inv-grupo-titulo">${esc(g.titulo)}</span>
                                <span class="inv-grupo-badge">${g.totalCount}</span>
                                <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                            </div>
                        </td>
                    </tr>${subRows}`;
                } else {
                    const filas = g.racks.map(r => _buildFilaServicio(r, isOpen)).join('');
                    return `<tr class="inv-grupo-tr-header${isOpen ? ' open' : ''}" data-grupo-key="${esc(key)}">
                        <td colspan="5">
                            <div class="inv-grupo-header">
                                <span class="inv-grupo-titulo">${esc(g.titulo)}</span>
                                <span class="inv-grupo-badge">${g.racks.length}</span>
                                <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                            </div>
                        </td>
                    </tr>${filas}`;
                }
            }).join('');

            gruposWrap.innerHTML = `<div class="table-wrap inv-tabla-agrupada">
                <table class="table-equal-cols table-eq-4">
                    ${thead}
                    <tbody id="tabla-servicio-grupos">${tbodyRows}</tbody>
                </table>
            </div>`;
        }
    }
    _actualizarIndicadoresSort('panel-servicio', _sortServ);
}

// ═══════════════════════════════════════════════════════
//  AGRUPAMIENTO INVENTARIO
// ═══════════════════════════════════════════════════════
let _agrupInv = (() => { try { return localStorage.getItem(APP_KEY + 'agrup_inv') || 'ninguno'; } catch (_) { return 'ninguno'; } })();
let _agrupServ = (() => { try { return localStorage.getItem(APP_KEY + 'agrup_serv') || 'ninguno'; } catch (_) { return 'ninguno'; } })();

function _setAgrupInv(val) {
    _agrupInv = val;
    try { localStorage.setItem(APP_KEY + 'agrup_inv', val); } catch (_) { }
}

function _setAgrupServ(val) {
    _agrupServ = val;
    try { localStorage.setItem(APP_KEY + 'agrup_serv', val); } catch (_) { }
}

// Convierte un string de piso a un número de orden para ordenamiento jerárquico:
// Subsuelos → Planta Baja → Entre pisos → Pisos → Terraza/Azotea → Desconocido
function _rankPiso(piso) {
    const s = piso.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar tildes

    // Sin piso / vacío → al final
    if (!s || s === '(sin piso)') return [9000, 0];

    // Terraza / azotea / techo
    if (/^(terraza|azotea|techo|roof)/.test(s)) return [8000, 0];

    // Subsuelo: ss, sub, s/s, subsuelo — puede tener número: ss1, ss-1, subsuelo 2, 1ss, 2ss
    const mSS = s.match(/^(ss|sub|s\/s|subsuelo)\s*[-.]?\s*(\d+)?/) || s.match(/^(\d+)\s*(ss|sub|s\/s|subsuelo)/);
    if (mSS) {
        // formato "ss2" → mSS[2]="2" | formato "2ss" → mSS[1]="2"
        const n = parseInt(mSS[2]) || parseInt(mSS[1]) || 1;
        return [-n, 0];
    }
    // Número negativo literal: -1, -2
    const mNeg = s.match(/^-(\d+)/);
    if (mNeg) return [-parseInt(mNeg[1]), 0];

    // Planta baja: pb, planta baja, g, ground, ez (entrepiso bajo)
    if (/^(pb|planta\s*baja|ground|piso\s*0|p\.?b\.?)$/.test(s)) return [0, 0];

    // Entre piso / mezzanine: ep, e/p, entrepiso, mezzanine, mz
    const mEP = s.match(/^(ep|e\/p|entre\s*piso|mezzanine|mz|piso\s*e)\s*(\d+)?/);
    if (mEP) {
        const n = mEP[2] ? parseInt(mEP[2]) : 1;
        return [n - 0.5, 0]; // entre piso 1 = 0.5, entre piso 2 = 1.5
    }

    // Piso numérico: 1, 2, piso 3, p3, p. 4
    const mP = s.match(/^(?:piso\s*|p\.?\s*)?(\d+)/);
    if (mP) return [parseInt(mP[1]), 0];

    // Letra sola o combinación alfanumérica: A, B, 1A
    const mAlfa = s.match(/^([a-z])(\d+)?/);
    if (mAlfa) return [5000 + mAlfa[1].charCodeAt(0), mAlfa[2] ? parseInt(mAlfa[2]) : 0];

    // Fallback: orden alfabético al final
    return [7000, s.charCodeAt(0)];
}

function _ordenarPisos(a, b) {
    const [ra1, ra2] = _rankPiso(a);
    const [rb1, rb2] = _rankPiso(b);
    return ra1 !== rb1 ? ra1 - rb1 : ra2 - rb2;
}

function _getGrupos(racks, agrupacion = _agrupInv) {
    if (agrupacion === 'ninguno') return null;

    if (agrupacion === 'patrimonio') {
        const _patNorm = r => (r.patrimonio || '').trim().toLowerCase();
        const aRelevar = racks.filter(r => { const p = _patNorm(r); return !p || p === 'relevar'; });
        const sinPatr = racks.filter(r => _patNorm(r) === 'no');
        const conPatr = racks.filter(r => { const p = _patNorm(r); return p && p !== 'relevar' && p !== 'no'; });
        return [
            { titulo: 'Con patrimonio', racks: conPatr },
            { titulo: 'Sin patrimonio', racks: sinPatr },
            { titulo: 'A relevar', racks: aRelevar },
        ].filter(g => g.racks.length > 0).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    }

    if (agrupacion === 'estado') {
        const map = { servicio: 'En servicio', inventario: 'Disponible', baja: 'Baja' };
        return ['servicio', 'inventario', 'baja'].map(e => ({
            titulo: map[e],
            racks: racks.filter(r => r.estado === e),
        })).filter(g => g.racks.length > 0).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    }

    if (agrupacion === 'edificio') {
        const porEdificio = {};
        racks.forEach(r => {
            const ed = r.edificio?.trim() || 'Depósito';
            if (!porEdificio[ed]) porEdificio[ed] = {};
            const piso = r.piso?.trim() || '(Sin piso)';
            if (!porEdificio[ed][piso]) porEdificio[ed][piso] = [];
            porEdificio[ed][piso].push(r);
        });
        const grupos = [];

        Object.keys(porEdificio).sort((a, b) => {
            if (a === 'Depósito') return 1;
            if (b === 'Depósito') return -1;
            return a.localeCompare(b, 'es');
        }).forEach(ed => {
            const pisos = porEdificio[ed];
            const keys = Object.keys(pisos).sort(_ordenarPisos);
            const totalEd = keys.reduce((s, k) => s + pisos[k].length, 0);
            if (keys.length === 1 && keys[0] === '(Sin piso)') {
                grupos.push({ titulo: ed, racks: pisos['(Sin piso)'], subgrupos: null });
            } else {
                const subgrupos = keys.map(piso => ({
                    titulo: `${piso}`,
                    racks: pisos[piso],
                }));
                grupos.push({ titulo: ed, racks: [], totalCount: totalEd, subgrupos });
            }
        });
        return grupos.sort((a, b) => {
            if (a.titulo === 'Depósito') return 1;
            if (b.titulo === 'Depósito') return -1;
            return a.titulo.localeCompare(b.titulo, 'es');
        });
    }

    if (_agrupInv === 'unidades') {
        const porU = {};
        racks.forEach(r => {
            const key = r.unidades != null ? `${r.unidades}U` : 'Sin especificar';
            if (!porU[key]) porU[key] = { u: r.unidades, racks: [] };
            porU[key].racks.push(r);
        });
        return Object.keys(porU).sort((a, b) => {
            const ua = porU[a].u, ub = porU[b].u;
            if (ua == null) return 1;
            if (ub == null) return -1;
            return ua - ub;
        }).map(k => ({ titulo: k, racks: porU[k].racks }));
    }

    return null;
}

function _htmlTablaGrupo(racks) {
    return racks.map(_filaRackInv).join('');
}

// ═══════════════════════════════════════════════════════
//  RENDER INVENTARIO
// ═══════════════════════════════════════════════════════
function renderInventario() {
    const racks = _getRacksFiltrados();
    const empty = DOM.inventarioEmpty;
    const count = DOM.inventarioCount;
    const tablaWrap = document.getElementById('inv-tabla-wrap');
    const gruposWrap = document.getElementById('inv-grupos-wrap');
    const tbody = DOM.tablaInventario;

    if (count) count.textContent = racks.length;

    if (!racks.length) {
        tablaWrap?.removeAttribute('hidden');
        gruposWrap?.setAttribute('hidden', '');
        if (tbody) tbody.innerHTML = '';
        empty?.classList.remove('empty-state-hidden');
        _actualizarIndicadoresSort('panel-inventario', _sortInv); // Mantenlo aquí para el caso vacío
        return;
    }
    empty?.classList.add('empty-state-hidden');

    const grupos = _getGrupos(racks);

    if (!grupos) {
        gruposWrap?.setAttribute('hidden', '');
        tablaWrap?.removeAttribute('hidden');
        if (tbody) tbody.innerHTML = racks.map(_filaRackInv).join('');
    } else {
        // Vista agrupada: una sola tabla con thead sticky, grupos como filas separadoras
        tablaWrap?.setAttribute('hidden', '');
        gruposWrap?.removeAttribute('hidden');

        // ── NUEVO: Determinar qué grupos mostrar abiertos (Búsqueda vs LocalStorage) ──
        const busq = normalizarTexto(document.getElementById('busq-global')?.value || '');
        let abiertos = null;

        if (!busq) {
            try {
                const saved = localStorage.getItem(APP_KEY + 'grupos_abiertos');
                if (saved !== null) abiertos = new Set(JSON.parse(saved));
            } catch (_) { }
        }

        if (gruposWrap) {
            const thead = `<thead class="inv-thead-sticky">
                <tr>
                    <th data-sort="estado" class="th-sortable">Estado</th>
                    <th data-sort="patrimonio" class="th-sortable">Patrimonio</th>
                    <th data-sort="unidades" class="th-sortable">Unidades</th>
                    <th data-sort="marca" class="th-sortable">Marca</th>
                    <th data-sort="identificador" class="th-sortable">Identificador</th>
                </tr>
            </thead>`;

            const _filaRack = (r, visible) =>
                `<tr class="tr-clickable rack-estado-${r.estado}" data-rack-id="${esc(r.id)}"${visible ? '' : ' hidden'}>
                    <td>${_badgeEstado(r)}</td>
                    <td class="td-muted">${esc(r.patrimonio || '—')}</td>
                    <td class="td-muted td-center">${r.unidades != null ? esc(String(r.unidades)) + 'U' : '—'}</td>
                    <td>${esc(r.marca || '—')}</td>
                    <td class="td-muted">${esc(r.identificador || '—')}</td>
                </tr>`;

            const tbodyRows = grupos.map((g, i) => {
                const key = g.titulo;
                // Si hay búsqueda se fuerza 'true', de lo contrario se lee del LocalStorage o por defecto el primero
                const isOpen = busq ? true : (abiertos !== null ? abiertos.has(key) : i === 0);

                if (g.subgrupos) {
                    // Grupo padre (edificio) con subgrupos de pisos
                    const subRows = g.subgrupos.map(sg => {
                        const subKey = `${key}__${sg.titulo}`;
                        // Si hay búsqueda se fuerza 'true', si no, LocalStorage o hereda del padre
                        const subOpen = busq ? true : (abiertos !== null ? abiertos.has(subKey) : isOpen);
                        const filasSub = sg.racks.map(r => _filaRack(r, isOpen && subOpen)).join('');
                        return `<tr class="inv-grupo-tr-header inv-grupo-tr-sub${subOpen ? ' open' : ''}" data-grupo-key="${esc(subKey)}"${isOpen ? '' : ' hidden'}>
                            <td colspan="5">
                                <div class="inv-grupo-header inv-grupo-header-sub">
                                    <span class="inv-grupo-titulo">PISO: ${esc(sg.titulo)}</span>
                                    <span class="inv-grupo-badge">${sg.racks.length}</span>
                                    <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                                </div>
                            </td>
                        </tr>${filasSub}`;
                    }).join('');
                    return `<tr class="inv-grupo-tr-header${isOpen ? ' open' : ''}" data-grupo-key="${esc(key)}">
                        <td colspan="5">
                            <div class="inv-grupo-header">
                                <span class="inv-grupo-titulo">${esc(g.titulo)}</span>
                                <span class="inv-grupo-badge">${g.totalCount}</span>
                                <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                            </div>
                        </td>
                    </tr>${subRows}`;
                } else {
                    // Grupo simple (sin subgrupos de pisos)
                    const filas = g.racks.map(r => _filaRack(r, isOpen)).join('');
                    return `<tr class="inv-grupo-tr-header${isOpen ? ' open' : ''}" data-grupo-key="${esc(key)}">
                        <td colspan="5">
                            <div class="inv-grupo-header">
                                <span class="inv-grupo-titulo">${esc(g.titulo)}</span>
                                <span class="inv-grupo-badge">${g.racks.length}</span>
                                <svg class="svg-icon inv-grupo-chevron"><use href="#icon-chevron-right"/></svg>
                            </div>
                        </td>
                    </tr>${filas}`;
                }
            }).join('');

            gruposWrap.innerHTML = `<div class="table-wrap inv-tabla-agrupada">
                <table class="table-equal-cols">
                    ${thead}
                    <tbody id="tabla-inventario-grupos">${tbodyRows}</tbody>
                </table>
            </div>`;
        }
    }
    _actualizarIndicadoresSort('panel-inventario', _sortInv);
}

// ═══════════════════════════════════════════════════════
//  RENDER GLOBAL
// ═══════════════════════════════════════════════════════
function renderTodo() {
    renderDashboard();
    if (_tabActual === 'servicio') renderServicio();
    else if (_tabActual === 'inventario') renderInventario();
    else { renderServicio(); renderInventario(); }
    actualizarFabServicio();
}

// ═══════════════════════════════════════════════════════
//  EXPORTAR / IMPORTAR
// ═══════════════════════════════════════════════════════
async function exportarDatos() {
    MM.cerrar('modal-ajustes');
    const firma = await generarFirma(state);
    const exp = { ...state, _firma: firma };
    const blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `racks_${getHoyLocal()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast('Datos exportados');
}

let _importarParsed = null;
function onImportarFileChange(e) {
    const file = e.target.files[0]; if (!file) return;
    const label = document.getElementById('importar-dropzone-label');
    const zone = document.getElementById('importar-dropzone');
    const btn = document.getElementById('importar-confirmar-btn');
    const btnC = document.getElementById('importar-combinar-btn');
    if (file.size > 5 * 1024 * 1024) {
        _importarParsed = null;
        label.textContent = '';
        const spanErr = document.createElement('span');
        spanErr.className = 'import-fail';
        spanErr.textContent = '✗ Archivo demasiado grande (máx 5 MB)';
        label.appendChild(spanErr);
        zone.classList.remove('dropzone-ok', 'dropzone-warn'); zone.classList.add('dropzone-error');
        btn.disabled = true; btnC.disabled = true; return;
    }
    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const raw = parseSeguro(ev.target.result);
            const esValida = await verificarFirma(raw);
            const parsed = sanitizarEstado(raw);
            if (!parsed) throw new Error('Esquema inválido');
            _importarParsed = { ...parsed, _firmaValida: esValida };
            label.textContent = '';
            const spanNombre = document.createElement('span');
            spanNombre.className = esValida ? 'import-ok' : 'import-warn';
            spanNombre.textContent = `${esValida ? '✓' : '⚠️'} ${file.name}`;
            const spanCount = document.createElement('span');
            spanCount.className = 'import-sub';
            spanCount.textContent = `${parsed.racks.length} racks`;
            label.appendChild(spanNombre);
            label.appendChild(document.createElement('br'));
            label.appendChild(spanCount);
            zone.classList.remove('dropzone-error', 'dropzone-warn', 'dropzone-ok');
            zone.classList.add(esValida ? 'dropzone-ok' : 'dropzone-warn');
            btn.disabled = false; btnC.disabled = false;
        } catch (_) {
            _importarParsed = null;
            label.textContent = '';
            const spanInv = document.createElement('span');
            spanInv.className = 'import-fail';
            spanInv.textContent = '✗ Archivo inválido o dañado';
            label.appendChild(spanInv);
            zone.classList.remove('dropzone-ok', 'dropzone-warn'); zone.classList.add('dropzone-error');
            btn.disabled = true; btnC.disabled = true;
        }
    };
    reader.readAsText(file);
}

function importarDatos(modo) {
    if (!_importarParsed) { toast('Seleccioná un archivo válido', 'error'); return; }
    const parsed = _importarParsed;
    const alerta = parsed._firmaValida ? '' : '⚠️ El archivo fue modificado externamente.\n\n';
    if (modo === 'reemplazar') {
        confirmar('¿Reemplazar todos los datos?', alerta + 'Todos los racks actuales serán reemplazados.', () => {
            historial.empujar('Importar y reemplazar');
            state.racks = parsed.racks || [];
            state.edificios = parsed.edificios || [];
            guardar(); MM.cerrar('modal-importar'); _importarParsed = null;
            renderTodo(); toast(`Datos reemplazados (${state.racks.length} racks)`);
        });
    } else {
        confirmar('¿Combinar datos?', alerta + 'Se agregarán los racks que no existan actualmente.', () => {
            historial.empujar('Combinar datos importados');

            // Usar IDs para combinar de forma segura
            const idsActuales = new Set(state.racks.map(r => r.id));
            let n = 0;
            (parsed.racks || []).forEach(r => {
                if (!idsActuales.has(r.id)) {
                    state.racks.push(r);
                    idsActuales.add(r.id);
                    n++;
                }
            });
            const edsExist = new Set(state.edificios.map(e => e.toLowerCase()));
            (parsed.edificios || []).forEach(e => { if (!edsExist.has(e.toLowerCase())) { state.edificios.push(e); edsExist.add(e.toLowerCase()); } });
            state.edificios.sort((a, b) => a.localeCompare(b, 'es'));

            guardar(); MM.cerrar('modal-importar'); _importarParsed = null;
            renderTodo(); toast(n > 0 ? `+${n} racks combinados` : 'Sin cambios', n > 0 ? 'success' : 'info');
        });
    }
}

function restablecerDatos() {
    confirmar('¿Restablecer todos los datos?', 'Se eliminarán todos los racks. Podés deshacer antes de cerrar la página.', () => {
        historial.empujar('Restablecer todos los datos');
        state.racks = [];
        state.edificios = [];
        MM.cerrar('modal-ajustes');
        guardar(); renderTodo(); toast('Datos restablecidos');
    });
}

// ═══════════════════════════════════════════════════════
//  GIST SYNC
// ═══════════════════════════════════════════════════════
const GistSync = (() => {
    const CFG_KEY = APP_KEY + 'gist_cfg', FILENAME = 'racks_data.json', DEBOUNCE_MS = 3000;
    const RE_GIST = /^[a-f0-9]{20,40}$/i;
    let _cfg = { token: '', gistId: '', lastSync: null, auto: false };
    let _debounceTimer = null, _subiendo = false, _bajarAutoTimer = null;
    let _maxRacksVistos = 0;
    let _alertaBorradoMostrada = false;

    function _cargarCfg() { try { const c = parseSeguro(localStorage.getItem(CFG_KEY) || 'null'); if (c) _cfg = { ..._cfg, ...c }; } catch (_) { } _actualizarBotonesAjustes(); }
    function _guardarCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(_cfg)); } catch (_) { } }
    function _spinStart() { document.getElementById('btn-ajustes')?.classList.add('icon-btn-spinning'); }
    function _spinStop() { document.getElementById('btn-ajustes')?.classList.remove('icon-btn-spinning'); }
    function _setBusy(busy) {
        _subiendo = busy;
        ['btn-gist-subir', 'btn-gist-bajar'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = busy; });
        busy ? _spinStart() : _spinStop();
    }
    function _setStatus(msg) { const el = document.getElementById('gist-sync-status'); if (el) el.textContent = msg; }
    function _setStatusSync() { const d = new Date(_cfg.lastSync); _setStatus(`Sincronizado: ${d.toLocaleDateString('es-AR')}, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`); }
    function _actualizarBotonesAjustes() {
        const token = !!(_cfg.token || '').trim(), gist = !!(_cfg.gistId || '').trim();
        const bu = document.getElementById('btn-ajustes-gist-subir'), bd = document.getElementById('btn-ajustes-gist-bajar');
        if (bu) bu.classList.toggle('gist-quick-hidden', !(token && gist));
        if (bd) bd.classList.toggle('gist-quick-hidden', !gist);
    }
    function _linkBtn() {
        const id = document.getElementById('gist-id')?.value.trim();
        const btn = document.getElementById('gist-link-btn'); if (!btn) return;
        if (id) { btn.href = `https://gist.github.com/${id}`; btn.classList.add('show'); } else { btn.classList.remove('show'); }
    }
    function toggleToken() {
        const inp = document.getElementById('gist-token'), icon = document.getElementById('gist-eye-icon');
        if (!inp) return;
        const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
        if (icon) icon.setAttribute('href', show ? '#icon-eye-off' : '#icon-eye');
    }
    function toggleAuto() { document.getElementById('gist-autosync-toggle')?.classList.toggle('on'); }
    function guardarConfig() {
        const t = document.getElementById('gist-token')?.value.trim() || '';
        const g = document.getElementById('gist-id')?.value.trim() || '';
        const a = document.getElementById('gist-autosync-toggle')?.classList.contains('on') ?? false;
        if (g && !RE_GIST.test(g)) { toast('El Gist ID tiene un formato inválido', 'error'); document.getElementById('gist-id')?.classList.add('error'); return; }
        if (_cfg.token === t && _cfg.gistId === g && !!_cfg.auto === a) { UI.cerrarGist(); toast('Sin cambios', 'info'); return; }
        _cfg.token = t; _cfg.gistId = g; _cfg.auto = a;
        _guardarCfg(); _actualizarBotonesAjustes();
        toast('Configuración guardada'); UI.cerrarGist();
    }
    async function _ejecutarSubida(silent = false) {
        const token = _cfg.token, gistId = _cfg.gistId;
        if (!token) { if (!silent) toast('Ingresá el token primero', 'error'); return; }
        if (gistId && !RE_GIST.test(gistId)) { if (!silent) toast('Gist ID inválido', 'error'); return; }
        _setBusy(true); if (!silent) _setStatus('Subiendo…');
        const firma = await generarFirma(state);
        const exp = { ...state, _firma: firma };
        const body = { files: { [FILENAME]: { content: JSON.stringify(exp, null, 2) } } };
        try {
            let res;
            if (gistId) {
                res = await fetch(`https://api.github.com/gists/${gistId}`, { method: 'PATCH', headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            } else {
                body.description = 'Racks — Control de Activos'; body.public = false;
                res = await fetch('https://api.github.com/gists', { method: 'POST', headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!gistId && data.id) { _cfg.gistId = data.id; const el = document.getElementById('gist-id'); if (el) el.value = data.id; _linkBtn(); }
            _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
            _maxRacksVistos = state.racks.length;
            _alertaBorradoMostrada = false;
            if (!silent) toast('Datos subidos a Gist');
        } catch (err) { _setStatus(`Error: ${err.message}`); if (!silent) toast(`Error al subir: ${err.message}`, 'error'); }
        finally { _setBusy(false); }
    }
    function subir() { _ejecutarSubida(false); }
    function subirAuto() {
        if (!_cfg.auto || !_cfg.token) return;

        // Actualiza el récord histórico si la base de datos creció
        if (state.racks.length > _maxRacksVistos) {
            _maxRacksVistos = state.racks.length;
        }

        // 🛡️ PROTECCIÓN CONTRA BORRADO MASIVO:
        const umbralSeguro = Math.floor(_maxRacksVistos * 0.5);
        if (state.racks.length === 0 || (state.racks.length < umbralSeguro && _maxRacksVistos > 5)) {
            if (!_alertaBorradoMostrada) {
                toast('Sync auto pausada: Se detectó un borrado masivo', 'error');
                _alertaBorradoMostrada = true;
            }
            _setStatus('Pausada por seguridad (borrado masivo)');
            return; // Aborta
        } else {
            _alertaBorradoMostrada = false; // Se recuperó el nivel seguro
        }

        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => { if (!_subiendo) _ejecutarSubida(true); }, DEBOUNCE_MS);
    }
    async function bajar() {
        const token = document.getElementById('gist-token')?.value.trim() || _cfg.token;
        const gistId = document.getElementById('gist-id')?.value.trim() || _cfg.gistId;
        if (!gistId) { toast('Ingresá el Gist ID primero', 'error'); return; }
        if (!RE_GIST.test(gistId)) { toast('Gist ID inválido', 'error'); return; }
        _setBusy(true); _setStatus('Bajando…');
        try {
            const headers = {}; if (token) headers['Authorization'] = `token ${token}`;
            const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const file = data.files?.[FILENAME];
            if (!file) throw new Error(`No se encontró "${FILENAME}" en el Gist`);
            let contenido = file.content;
            if (file.truncated) {
                const rawOrigin = new URL(file.raw_url).hostname;
                if (!rawOrigin.endsWith('.githubusercontent.com')) throw new Error('raw_url inválida');
                const r2 = await fetch(file.raw_url); contenido = await r2.text();
            }
            const rawRemoto = parseSeguro(contenido);
            const esValida = await verificarFirma(rawRemoto);
            const remoto = sanitizarEstado(rawRemoto);
            if (!remoto) throw new Error('Formato inválido');

            const procesarBajada = () => {
                _setBusy(true);
                let nuevos = 0, actualizados = 0, nuevosEdificios = 0;
                (remoto.racks || []).forEach(r => {
                    const idx = state.racks.findIndex(x => x.id === r.id);
                    if (idx === -1) {
                        // Rack nuevo: agregar
                        state.racks.push(r);
                        nuevos++;
                    } else {
                        // Rack existente: reemplazar solo si el remoto es más nuevo
                        const tsRemoto = new Date(r._updatedAt || 0).getTime();
                        const tsLocal = new Date(state.racks[idx]._updatedAt || 0).getTime();
                        if (tsRemoto > tsLocal) {
                            state.racks[idx] = r;
                            actualizados++;
                        }
                    }
                });
                const edsExist = new Set(state.edificios.map(e => e.toLowerCase()));
                (remoto.edificios || []).forEach(e => {
                    if (!edsExist.has(e.toLowerCase())) {
                        state.edificios.push(e);
                        edsExist.add(e.toLowerCase());
                        nuevosEdificios++;
                    }
                });
                if (nuevosEdificios > 0) state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
                if (nuevos === 0 && actualizados === 0 && nuevosEdificios === 0) {
                    _cfg.token = token; _cfg.gistId = gistId; _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
                    toast('Sin cambios', 'info'); _setBusy(false); return;
                }
                historial.empujar(esValida ? 'Bajar desde Gist' : 'Bajar desde Gist (Forzado)');
                guardar(); renderTodo();
                _cfg.token = token; _cfg.gistId = gistId; _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
                const resumen = [nuevos > 0 ? `+${nuevos} racks` : '', actualizados > 0 ? `${actualizados} actualizados` : '', nuevosEdificios > 0 ? `+${nuevosEdificios} edificios` : ''].filter(Boolean).join(', ');
                toast(`Sincronizado: ${resumen}`, esValida ? 'success' : 'info'); _setBusy(false);
            };
            if (!esValida) { _setBusy(false); confirmar('Datos alterados', 'Los datos fueron modificados externamente. ¿Combinar de todos modos?', procesarBajada); }
            else procesarBajada();
        } catch (err) { _setStatus(`Error: ${err.message}`); toast(`Error al bajar: ${err.message}`, 'error'); }
        finally { _setBusy(false); }
    }
    async function bajarAuto() {
        if (!_cfg.auto || !_cfg.gistId) return;
        if (!RE_GIST.test(_cfg.gistId)) return;
        // Mismo debounce que subirAuto para no disparar en cada recarga rápida
        clearTimeout(_bajarAutoTimer);
        _bajarAutoTimer = setTimeout(async () => {
            if (_subiendo) return;
            _setBusy(true); _setStatus('Sincronizando…');
            try {
                const headers = {}; if (_cfg.token) headers['Authorization'] = `token ${_cfg.token}`;
                const res = await fetch(`https://api.github.com/gists/${_cfg.gistId}`, { headers });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const file = data.files?.[FILENAME];
                if (!file) throw new Error(`No se encontró "${FILENAME}"`);
                let contenido = file.content;
                if (file.truncated) {
                    const rawOrigin = new URL(file.raw_url).hostname;
                    if (!rawOrigin.endsWith('.githubusercontent.com')) throw new Error('raw_url inválida');
                    const r2 = await fetch(file.raw_url); contenido = await r2.text();
                }
                const rawRemoto = parseSeguro(contenido);
                const remoto = sanitizarEstado(rawRemoto);
                if (!remoto) throw new Error('Formato inválido');
                let nuevos = 0, actualizados = 0, nuevosEdificios = 0;
                (remoto.racks || []).forEach(r => {
                    const idx = state.racks.findIndex(x => x.id === r.id);
                    if (idx === -1) {
                        state.racks.push(r); nuevos++;
                    } else {
                        const tsRemoto = new Date(r._updatedAt || 0).getTime();
                        const tsLocal = new Date(state.racks[idx]._updatedAt || 0).getTime();
                        if (tsRemoto > tsLocal) { state.racks[idx] = r; actualizados++; }
                    }
                });
                const edsExist = new Set(state.edificios.map(e => e.toLowerCase()));
                (remoto.edificios || []).forEach(e => {
                    if (!edsExist.has(e.toLowerCase())) {
                        state.edificios.push(e);
                        edsExist.add(e.toLowerCase());
                        nuevosEdificios++;
                    }
                });
                if (nuevosEdificios > 0) state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
                if (nuevos > 0 || actualizados > 0 || nuevosEdificios > 0) {
                    // No empuja al historial para no contaminar undo en el arranque
                    guardar(); renderTodo();
                    const resumen = [nuevos > 0 ? `+${nuevos} racks` : '', actualizados > 0 ? `${actualizados} actualizados` : '', nuevosEdificios > 0 ? `+${nuevosEdificios} edificios` : ''].filter(Boolean).join(', ');
                    toast(`AutoSync: ${resumen}`, 'success');
                }
                _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
            } catch (err) { _setStatus(`Error auto-sync: ${err.message}`); }
            finally { _setBusy(false); }
        }, DEBOUNCE_MS);
    }
    function poblarModal() {
        const te = document.getElementById('gist-token'), ie = document.getElementById('gist-id'), to = document.getElementById('gist-autosync-toggle');
        if (te) te.value = _cfg.token || ''; if (ie) ie.value = _cfg.gistId || '';
        if (to) to.classList.toggle('on', !!_cfg.auto);
        if (_cfg.lastSync) _setStatusSync(); else _setStatus('Sin sincronizar');
        _linkBtn();
    }
    function init() { _cargarCfg(); _maxRacksVistos = state.racks.length; bajarAuto(); }
    return { init, subir, subirAuto, bajar, bajarAuto, poblarModal, guardarConfig, toggleToken, toggleAuto, _linkBtn };
})();

// ═══════════════════════════════════════════════════════
//  KEYBOARD + SCROLL
// ═══════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
    const modalOpen = document.body.classList.contains('modal-open');

    if (e.key === 'Escape') {
        if (modalOpen) { MM.cerrarTop(); return; }
        if (_fabOpen) { cerrarFab(); return; }

        if (_tabActual === 'dashboard' && _resumenEdificioActual) { _resumenEdificioActual = null; renderResumenEdificios(); return; }

        const b = document.getElementById('busq-global');
        if (b) {
            if (b.value) {
                limpiarBusqueda();
                return;
            } else if (document.activeElement === b) {
                b.blur();
                return;
            }
        }
    }

    // 1. NUEVO: Tecla Enter para guardar en los modales
    if (e.key === 'Enter' && modalOpen) {
        const active = document.activeElement;
        // Si el usuario está parado sobre un botón (ej. navegó con Tab hasta "Cancelar"), dejamos el Enter normal
        if (active && (active.tagName === 'BUTTON' || active.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        const abiertos = [...document.querySelectorAll('.modal.show')];
        const topModal = abiertos[abiertos.length - 1]; // Toma el modal que esté más arriba

        if (topModal) {
            if (topModal.id === 'modal-rack-nuevo') document.getElementById('rack-nuevo-guardar-btn')?.click();
            else if (topModal.id === 'modal-rack-editar') document.getElementById('rack-editar-guardar-btn')?.click();
            else if (topModal.id === 'modal-rack-servicio') document.getElementById('servicio-confirmar-btn')?.click();
            else if (topModal.id === 'modal-rack-editar-servicio') document.getElementById('editar-servicio-guardar-btn')?.click();
            else if (topModal.id === 'modal-confirmar') document.getElementById('confirmar-ok')?.click();
        }
        return;
    }

    if (e.ctrlKey && !e.altKey) {
        // 2. NUEVO: Ctrl + Flechas para ciclar entre pestañas
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const tabs = ['dashboard', 'inventario', 'servicio'];
            let idx = tabs.indexOf(_tabActual);

            if (e.key === 'ArrowRight') idx = (idx + 1) % tabs.length;
            else idx = (idx - 1 + tabs.length) % tabs.length; // Cicla hacia atrás sin dar negativo

            switchTab(tabs[idx]);
            return;
        }

        if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); historial.undo(); return; }
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); historial.redo(); return; }
    }

    if (!modalOpen && !_fabOpen && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = document.activeElement?.tagName;
        const enInput = tag === 'INPUT' || tag === 'TEXTAREA';

        // 3. MODIFICADO: La tecla "+" ahora abre el modal "Poner en Servicio"
        if (e.key === '+' || e.key === '=') { e.preventDefault(); UI.abrirServicio(); return; }

        if (!enInput && (e.key === 'Backspace' || (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)))) {
            const b = document.getElementById('busq-global');
            if (b) { b.focus(); if (e.key === 'Backspace') { e.preventDefault(); b.value = b.value.slice(0, -1); onBusqGlobal(); } }
        }
    }
});

window.addEventListener('scroll', () => {
    const btn = document.getElementById('btn-scroll-top');
    if (btn) btn.classList.toggle('show', window.scrollY > window.innerHeight);
    const h = document.getElementById('main-header');
    if (h) h.classList.toggle('scrolled', window.scrollY > 50);
    _cerrarTodosDropdowns();
}, { passive: true });

document.addEventListener('input', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') e.target.classList.remove('error');
});

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
function _init() {
    cargar();

    try {
        if (localStorage.getItem(APP_KEY + 'dark') === '1') {
            document.getElementById('dark-icon-use')?.setAttribute('href', '#icon-sun');
        }
    } catch (_) { }

    try {
        const t = localStorage.getItem(APP_KEY + 'tab');
        if (t && ['servicio', 'inventario'].includes(t)) {
            document.getElementById('panel-dashboard').classList.remove('activa');
            document.getElementById(`panel-${t}`).classList.add('activa');
            document.getElementById('tab-dashboard').classList.remove('activa');
            document.getElementById(`tab-${t}`).classList.add('activa');
            _tabActual = t;
            const htt = document.getElementById('header-tab-title');
            if (htt) htt.innerHTML = `<svg class="svg-icon"><use href="${TAB_ICONS[t]}"/></svg> ${TAB_LABELS[t]}`;
        }
    } catch (_) { }

    renderTodo();
    _restaurarCamposBusq();
    GistSync.init();
}

// ═══════════════════════════════════════════════════════
//  EXPORTAR REPORTE DE INVENTARIO
// ═══════════════════════════════════════════════════════
function generarReporteInventario(gruposFiltrados) {
    // 1. Tomamos los datos tal cual los ve el usuario (filtrados y ordenados)
    const racks = _getRacksFiltrados();
    if (!racks.length) {
        toast('No hay datos para generar el reporte', 'info');
        return;
    }

    // 2. Usamos los grupos pre-filtrados que vienen del modal (o los recalculamos si es vista plana)
    const grupos = gruposFiltrados !== undefined ? gruposFiltrados : _getGrupos(racks);
    const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    let htmlSecciones = '';

    const thead = `<thead>
        <tr>
            <th>Estado</th>
            <th>Patrimonio</th>
            <th>Unidades</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Identificador</th>
        </tr>
    </thead>`;

    const _filaRackHTML = (r) => {
        // Formateo del estado para lectura
        const est = r.estado === 'servicio' ? (r.numero || 'En servicio') : (r.estado === 'baja' ? 'Baja' : 'Disponible');
        return `<tr>
            <td><strong>${esc(est)}</strong></td>
            <td>${esc(r.patrimonio || '—')}</td>
            <td style="text-align: center;">${r.unidades != null ? esc(String(r.unidades)) + 'U' : '—'}</td>
            <td>${esc(r.marca || '—')}</td>
            <td>${esc(r.modelo || '—')}</td>
            <td>${esc(r.identificador || '—')}</td>
        </tr>`;
    };

    const _generarTabla = (titulo, items) => {
        return `<section>
            <h2>${esc(titulo)} <span style="font-size: 0.95rem; color: var(--muted); font-weight: normal;">(${items.length} racks)</span></h2>
            <table>
                ${thead}
                <tbody>
                    ${items.map(_filaRackHTML).join('')}
                </tbody>
            </table>
        </section>`;
    };

    // 3. Generar las secciones de tablas según el agrupamiento
    if (!grupos) {
        // Vista plana sin agrupar
        htmlSecciones = _generarTabla('Listado General de racks', racks);
    } else {
        // Vista agrupada
        grupos.forEach(g => {
            if (g.subgrupos) {
                // Grupos con subniveles (Ej: Edificios -> Pisos)
                g.subgrupos.forEach(sg => {
                    htmlSecciones += _generarTabla(`${g.titulo} — Piso: ${sg.titulo}`, sg.racks);
                });
            } else {
                // Grupos simples (Ej: Estado, Patrimonio)
                htmlSecciones += _generarTabla(g.titulo, g.racks);
            }
        });
    }

    const _agrupLabel = typeof _agrupInv !== 'undefined' && _agrupInv !== 'ninguno' ? _agrupInv : 'sin agrupar';

    // ── NUEVO: Capturar texto de búsqueda ──
    const terminoBusqueda = document.getElementById('busq-global')?.value.trim() || '';
    const infoFiltro = terminoBusqueda ? `<br>Filtrado por: <strong>"${esc(terminoBusqueda)}"</strong>` : '';

    // 4. Armar el HTML completo con CSS para pantalla e impresión (print)
    const htmlCompleto = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Reporte de Inventario de racks— ${fecha}</title>
    <style>
        :root { --blue: #4c72ac; --border: #e2e6ef; --muted: #5a6070; --bg: #f5f6fa; --card: #fff; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: #1a1d23; padding: 2rem 1rem 4rem; }
        .reporte-wrap { max-width: 960px; margin: 0 auto; }
        header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--blue); display: flex; justify-content: space-between; align-items: flex-end; }
        header h1 { font-size: 1.5rem; color: var(--blue); font-weight: 700; margin: 0; }
        header .meta { font-size: 0.85rem; color: var(--muted); text-align: right; line-height: 1.4; }
        section { background: var(--card); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.05); border: 1px solid var(--border); }
        h2 { font-size: 1.1rem; margin-bottom: 1rem; color: #1a1d23; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        th, td { padding: 0.6rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
        th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.02em; }
        tr:last-child td { border-bottom: none; }
        .btn-print { position: fixed; bottom: 1.5rem; right: 1.5rem; background: var(--blue); color: #fff; border: none; border-radius: 999px; padding: .8rem 1.5rem; font-size: .9rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(59,100,210,.3); transition: transform 0.2s; }
        .btn-print:hover { transform: translateY(-2px); }
        @media print {
            .btn-print { display: none; }
            body { background: #fff; padding: 0; }
            section { box-shadow: none; border: none; padding: 0; margin-bottom: 2rem; page-break-inside: avoid; }
            header { border-bottom: 2px solid #000; }
        }
    </style>
</head>
<body>
    <div class="reporte-wrap">
        <header>
            <div><h1>📋 Reporte de Inventario de racks</h1></div>
            <div class="meta">
                Exportado el ${fecha}<br>
                Criterio de agrupamiento: <strong>${_agrupLabel.toUpperCase()}</strong>
                ${infoFiltro}
            </div>
        </header>
        ${htmlSecciones}
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</body>
</html>`;

    // 5. Descargar el HTML de forma automática
    const blob = new Blob([htmlCompleto], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-inventario-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    toast('Reporte generado correctamente', 'success');
}

// ═══════════════════════════════════════════════════════
//  BINDINGS
// ═══════════════════════════════════════════════════════
function _initBindings() {
    _initDOMRefs();
    _init();

    // Tabs
    document.getElementById('tab-dashboard')?.addEventListener('click', () => switchTab('dashboard'));
    document.getElementById('tab-servicio')?.addEventListener('click', () => switchTab('servicio'));
    document.getElementById('tab-inventario')?.addEventListener('click', () => switchTab('inventario'));

    // Header
    document.getElementById('btn-inicio-logo')?.addEventListener('click', () => window.location.href = '../index.html');
    document.getElementById('btn-inicio-titulo')?.addEventListener('click', () => window.location.href = '../index.html');
    document.getElementById('btn-dark-mode')?.addEventListener('click', toggleDarkMode);
    document.getElementById('btn-ajustes')?.addEventListener('click', () => UI.abrirAjustes());
    document.getElementById('btn-undo')?.addEventListener('click', () => historial.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => historial.redo());

    // Búsqueda
    document.getElementById('busq-global')?.addEventListener('input', onBusqGlobal);
    document.getElementById('busq-clear-btn')?.addEventListener('click', limpiarBusqueda);

    // Chips clickeables del dashboard → activan búsqueda por estado
    document.getElementById('stats-grid')?.addEventListener('click', e => {
        const chip = e.target.closest('[data-busq]');
        if (!chip) return;
        const term = chip.dataset.busq;
        DOM.busqGlobal.value = term;
        onBusqGlobal();
        DOM.busqGlobal.focus();
    });

    // FAB dropdown
    document.getElementById('btn-fab-main')?.addEventListener('click', toggleFab);
    document.getElementById('fab-nuevo-rack')?.addEventListener('click', () => UI.abrirNuevoRack());
    document.getElementById('fab-rack-servicio')?.addEventListener('click', () => UI.abrirServicio());
    document.getElementById('servicio-confirmar-btn')?.addEventListener('click', confirmarPonerEnServicio);
    document.getElementById('servicio-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-rack-servicio'));

    // Modal editar rack en servicio
    document.getElementById('editar-servicio-guardar-btn')?.addEventListener('click', guardarEditarServicio);
    document.getElementById('editar-servicio-quitar-btn')?.addEventListener('click', quitarDeServicio);
    document.getElementById('editar-servicio-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-rack-editar-servicio'));
    // Botón ir al activo (desde editar-servicio → editar-rack)
    document.getElementById('editar-servicio-ir-rack-btn')?.addEventListener('click', () => {
        if (!_editandoServicioId) return;
        MM.nav('modal-rack-editar-servicio', () => abrirModalEditarRack(_editandoServicioId));
    });
    // Cerrar FAB al hacer click fuera
    document.addEventListener('click', e => {
        if (_fabOpen && !e.target.closest('#fab-container')) cerrarFab();
    });

    // Scroll top
    document.getElementById('btn-scroll-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Modal nuevo rack
    document.getElementById('rack-nuevo-guardar-btn')?.addEventListener('click', guardarNuevoRack);
    document.getElementById('rack-nuevo-cancelar-btn')?.addEventListener('click', () => UI.cerrarNuevoRack());

    // Modal editar rack
    document.getElementById('rack-editar-guardar-btn')?.addEventListener('click', guardarEditarRack);
    document.getElementById('rack-editar-eliminar-btn')?.addEventListener('click', eliminarRackActual);
    document.getElementById('rack-editar-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-rack-editar'));
    document.getElementById('rack-editar-baja-btn')?.addEventListener('click', toggleBajaRack);
    // Botón ir a servicio (desde editar-rack → editar-servicio)
    document.getElementById('rack-editar-ir-servicio-btn')?.addEventListener('click', () => {
        if (!_editandoRackId) return;
        MM.nav('modal-rack-editar', () => abrirModalEditarServicio(_editandoRackId));
    });

    // Clics en filas de tablas
    document.getElementById('tabla-servicio')?.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-rack-id]');
        if (tr) abrirModalEditarServicio(tr.dataset.rackId);
    });
    document.getElementById('tabla-inventario')?.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-rack-id]');
        if (tr) abrirModalEditarRack(tr.dataset.rackId);
    });

    document.getElementById('ajustes-edificios-btn')?.addEventListener('click', () => GestorEdificios.abrir());

    // (selector de edificio eliminado)
    // Ajustes
    document.getElementById('ajustes-cerrar-btn')?.addEventListener('click', () => UI.cerrarAjustes());
    document.getElementById('ajustes-exportar-btn')?.addEventListener('click', exportarDatos);
    document.getElementById('ajustes-importar-btn')?.addEventListener('click', () => UI.abrirImportar());
    document.getElementById('ajustes-restablecer-btn')?.addEventListener('click', restablecerDatos);
    document.getElementById('ajustes-gist-main-btn')?.addEventListener('click', () => UI.abrirGist());
    document.getElementById('btn-ajustes-gist-subir')?.addEventListener('click', () => GistSync.subir());
    document.getElementById('btn-ajustes-gist-bajar')?.addEventListener('click', () => GistSync.bajar());

    // Modal Gist
    document.getElementById('gist-cerrar-btn')?.addEventListener('click', () => UI.cerrarGist());
    document.getElementById('gist-token-eye')?.addEventListener('click', () => GistSync.toggleToken());
    document.getElementById('gist-autosync-label')?.addEventListener('click', () => GistSync.toggleAuto());
    document.getElementById('gist-id')?.addEventListener('input', () => GistSync._linkBtn());
    document.getElementById('gist-guardar-config-btn')?.addEventListener('click', () => GistSync.guardarConfig());
    document.getElementById('btn-gist-subir')?.addEventListener('click', () => GistSync.subir());
    document.getElementById('btn-gist-bajar')?.addEventListener('click', () => GistSync.bajar());

    // Modal importar
    document.getElementById('importar-cerrar-btn')?.addEventListener('click', () => UI.cerrarImportar());
    document.getElementById('importar-file-input')?.addEventListener('change', onImportarFileChange);
    document.getElementById('importar-dropzone')?.addEventListener('click', () => document.getElementById('importar-file-input').click());
    document.getElementById('importar-confirmar-btn')?.addEventListener('click', () => importarDatos('reemplazar'));
    document.getElementById('importar-combinar-btn')?.addEventListener('click', () => importarDatos('combinar'));
    const dz = document.getElementById('importar-dropzone');
    if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('import-dropzone-drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('import-dropzone-drag'));
        dz.addEventListener('drop', e => {
            e.preventDefault(); dz.classList.remove('import-dropzone-drag');
            const file = e.dataTransfer.files[0];
            if (file) { const dt = new DataTransfer(); dt.items.add(file); document.getElementById('importar-file-input').files = dt.files; onImportarFileChange({ target: { files: [file] } }); }
        });
    }

    // Modal edificios
    document.getElementById('edificios-cerrar-btn')?.addEventListener('click', () => GestorEdificios.cerrar());
    document.getElementById('edificios-agregar-btn')?.addEventListener('click', () => GestorEdificios.agregar());
    document.getElementById('edificios-nuevo-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') GestorEdificios.agregar(); });

    // Botones de bloqueo de modales
    document.getElementById('rack-editar-lock-btn')?.addEventListener('click', () => ModalLocker.toggle('modal-rack-editar'));
    document.getElementById('editar-servicio-lock-btn')?.addEventListener('click', () => ModalLocker.toggle('modal-rack-editar-servicio'));
    document.getElementById('edificios-lock-btn')?.addEventListener('click', () => ModalLocker.toggle('modal-edificios'));

    // Modal confirmar
    document.getElementById('confirmar-ok')?.addEventListener('click', () => {
        MM.cerrar('modal-confirmar');
        const cb = _confirmarCb; _confirmarCb = null;
        cb?.();
    });
    document.getElementById('confirmar-cancelar')?.addEventListener('click', () => _volverAlPadreConfirmar());

    // Ordenamiento de tablas con delegación de eventos (Soporta clics en la vista plana y agrupada)
    document.getElementById('panel-inventario')?.addEventListener('click', e => {
        const th = e.target.closest('th.th-sortable');
        if (!th || !th.dataset.sort) return;

        const col = th.dataset.sort;
        if (_sortInv.col === col) _sortInv.dir *= -1;
        else { _sortInv.col = col; _sortInv.dir = 1; }
        try { localStorage.setItem(APP_KEY + 'sort_inv', JSON.stringify(_sortInv)); } catch (_) { }
        renderInventario();
    });

    document.querySelectorAll('#panel-servicio th.th-sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (_sortServ.col === col) _sortServ.dir *= -1;
            else { _sortServ.col = col; _sortServ.dir = 1; }
            try { localStorage.setItem(APP_KEY + 'sort_serv', JSON.stringify(_sortServ)); } catch (_) { }
            renderServicio();
        });
    });

    // Filtro de Búsqueda — botón icono con dropdown multi-select
    const filtroBtn = document.getElementById('busq-filtro-btn');
    const filtroMenu = document.getElementById('busq-filtro-menu');
    const filtroToggleAll = document.getElementById('busq-filtro-toggle-all');

    if (filtroBtn && filtroMenu) {
        filtroBtn.addEventListener('click', e => {
            e.stopPropagation();
            const abierto = filtroMenu.classList.contains('open');
            cerrarFab();
            _cerrarVistaSafe();
            filtroBtn.classList.toggle('activo', !abierto);
            if (!abierto) {
                const rect = filtroBtn.getBoundingClientRect();
                const menuW = 270;
                const menuH = filtroMenu.offsetHeight || 280;
                const spaceBelow = window.innerHeight - rect.bottom;
                const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
                filtroMenu.style.left = left + 'px';
                filtroMenu.style.right = 'auto';
                if (spaceBelow < menuH + 12 && rect.top > menuH + 12) {
                    filtroMenu.style.top = 'auto';
                    filtroMenu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
                } else {
                    filtroMenu.style.top = (rect.bottom + 6) + 'px';
                    filtroMenu.style.bottom = 'auto';
                }
            }
            filtroMenu.classList.toggle('open', !abierto);
        });

        filtroMenu.addEventListener('click', e => e.stopPropagation());

        document.addEventListener('click', () => {
            if (filtroMenu.classList.contains('open')) {
                filtroMenu.classList.remove('open');
                filtroBtn.classList.remove('activo');
            }
        });

        const _allChecks = Array.from(filtroMenu.querySelectorAll('input[type="checkbox"]'));
        const _total = _allChecks.length;

        _allChecks.forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = _allChecks.filter(c => c.checked).length;
                if (filtroToggleAll) filtroToggleAll.textContent = checked === _total ? 'Desactivar todo' : 'Activar todo';
                filtroBtn.classList.toggle('con-filtro', checked < _total);
                _guardarCamposBusq();
                onBusqGlobal();
            });
        });

        if (filtroToggleAll) {
            filtroToggleAll.addEventListener('click', e => {
                e.stopPropagation();
                const allChecked = _allChecks.every(c => c.checked);
                _allChecks.forEach(c => { c.checked = !allChecked; });
                filtroToggleAll.textContent = allChecked ? 'Activar todo' : 'Desactivar todo';
                filtroBtn.classList.toggle('con-filtro', allChecked);
                _guardarCamposBusq();
                onBusqGlobal();
            });
        }
    }
    // ── Botón vista inventario ──
    const btnVista = document.getElementById('btn-vista-inv');
    const vistaMenu = document.getElementById('inv-vista-menu');
    if (btnVista && vistaMenu) {
        // Poblar opciones
        vistaMenu.innerHTML = `
            <p class="inv-vista-label">Agrupar por</p>
            <button class="inv-vista-opt" data-agrup="ninguno">Sin agrupar</button>
            <button class="inv-vista-opt" data-agrup="patrimonio">Patrimonio</button>
            <button class="inv-vista-opt" data-agrup="estado">Estado</button>
            <button class="inv-vista-opt" data-agrup="edificio">Edificio</button>
            <button class="inv-vista-opt" data-agrup="unidades">Unidades</button>
        `;
        // Mover al body para evitar clipping del card
        document.body.appendChild(vistaMenu);

        const _syncVistaOpts = () => {
            vistaMenu.querySelectorAll('.inv-vista-opt').forEach(b => {
                b.classList.toggle('activo', b.dataset.agrup === _agrupInv);
            });
        };
        _syncVistaOpts();

        const _cerrarVista = () => {
            vistaMenu.classList.remove('open');
            btnVista.classList.remove('activo');
        };

        btnVista.addEventListener('click', e => {
            e.stopPropagation();
            const abierto = vistaMenu.classList.contains('open');
            if (abierto) { _cerrarVista(); return; }
            cerrarFab();
            _cerrarFiltro();
            const rect = btnVista.getBoundingClientRect();
            vistaMenu.style.top = (rect.bottom + 6) + 'px';
            vistaMenu.style.left = 'auto';
            vistaMenu.style.right = (window.innerWidth - rect.right) + 'px';
            vistaMenu.classList.add('open');
            btnVista.classList.add('activo');
            _syncVistaOpts();
        });

        vistaMenu.addEventListener('click', e => {
            e.stopPropagation();
            const opt = e.target.closest('.inv-vista-opt');
            if (!opt) return;
            _setAgrupInv(opt.dataset.agrup);
            _syncVistaOpts();
            renderInventario();
            // Animar el contenedor tras el render
            const tablaWrap = document.getElementById('inv-tabla-wrap');
            const gruposWrap = document.getElementById('inv-grupos-wrap');
            [tablaWrap, gruposWrap].forEach(el => {
                if (el && !el.hasAttribute('hidden')) {
                    el.classList.remove('inv-agrup-entrando');
                    void el.offsetWidth; // reflow para reiniciar animación
                    el.classList.add('inv-agrup-entrando');
                    el.addEventListener('animationend', () => el.classList.remove('inv-agrup-entrando'), { once: true });
                }
            });
            _cerrarVista();
        });

        document.addEventListener('click', () => {
            if (vistaMenu.classList.contains('open')) _cerrarVista();
        });
    }

    // ── Botón vista SERVICIO ──
    const btnVistaServ = document.getElementById('btn-vista-serv');
    const vistaMenuServ = document.getElementById('serv-vista-menu');
    if (btnVistaServ && vistaMenuServ) {
        // Poblar opciones
        vistaMenuServ.innerHTML = `
            <p class="inv-vista-label">Agrupar por</p>
            <button class="inv-vista-opt" data-agrup="ninguno">Sin agrupar</button>
            <button class="inv-vista-opt" data-agrup="edificio">Edificio</button>
        `;
        // Mover al body para evitar clipping del card
        document.body.appendChild(vistaMenuServ);

        const _syncVistaOptsServ = () => {
            vistaMenuServ.querySelectorAll('.inv-vista-opt').forEach(b => {
                b.classList.toggle('activo', b.dataset.agrup === _agrupServ);
            });
        };
        _syncVistaOptsServ();

        const _cerrarVistaServ = () => {
            vistaMenuServ.classList.remove('open');
            btnVistaServ.classList.remove('activo');
        };

        btnVistaServ.addEventListener('click', e => {
            e.stopPropagation();
            const abierto = vistaMenuServ.classList.contains('open');
            if (abierto) { _cerrarVistaServ(); return; }
            cerrarFab();
            _cerrarFiltro();
            _cerrarVistaSafe(); // Cierra el de inventario si estaba abierto
            const rect = btnVistaServ.getBoundingClientRect();
            vistaMenuServ.style.top = (rect.bottom + 6) + 'px';
            vistaMenuServ.style.left = 'auto';
            vistaMenuServ.style.right = (window.innerWidth - rect.right) + 'px';
            vistaMenuServ.classList.add('open');
            btnVistaServ.classList.add('activo');
            _syncVistaOptsServ();
        });

        vistaMenuServ.addEventListener('click', e => {
            e.stopPropagation();
            const opt = e.target.closest('.inv-vista-opt');
            if (!opt) return;
            _setAgrupServ(opt.dataset.agrup);
            _syncVistaOptsServ();
            renderServicio();
            
            // Animar el contenedor tras el render
            const tablaWrap = document.getElementById('serv-tabla-wrap');
            const gruposWrap = document.getElementById('serv-grupos-wrap');
            [tablaWrap, gruposWrap].forEach(el => {
                if (el && !el.hasAttribute('hidden')) {
                    el.classList.remove('inv-agrup-entrando');
                    void el.offsetWidth;
                    el.classList.add('inv-agrup-entrando');
                    el.addEventListener('animationend', () => el.classList.remove('inv-agrup-entrando'), { once: true });
                }
            });
            _cerrarVistaServ();
        });

        document.addEventListener('click', () => {
            if (vistaMenuServ.classList.contains('open')) _cerrarVistaServ();
        });
    }

    // ── Botón reporte inventario ──
    document.getElementById('btn-reporte-inv')?.addEventListener('click', () => {
        const racks = _getRacksFiltrados();
        if (!racks.length) { toast('No hay datos para generar el reporte', 'info'); return; }

        const grupos = _getGrupos(racks);
        const lista = document.getElementById('reporte-grupos-lista');
        const desc = document.getElementById('reporte-modal-desc');
        const toggleAllBtn = document.getElementById('reporte-toggle-all-btn');

        if (!grupos) {
            // Vista plana: no hay grupos para elegir, generar directo
            generarReporteInventario(null);
            return;
        }

        // Armar la lista de grupos como checkboxes con subtítulo de conteo
        lista.innerHTML = grupos.map((g, i) => {
            const count = g.totalCount != null ? g.totalCount : g.racks.length;
            return `<label class="reporte-grupo-item">
                <input type="checkbox" class="reporte-grupo-check" data-idx="${i}" checked>
                <span class="reporte-grupo-texto">
                    <span class="reporte-grupo-nombre">${esc(g.titulo)}</span>
                    <span class="reporte-grupo-sub">${count} rack(s) en este bloque</span>
                </span>
            </label>`;
        }).join('');

        const labels = { patrimonio: 'GRUPOS A INCLUIR', estado: 'GRUPOS A INCLUIR', edificio: 'GRUPOS A INCLUIR' };
        desc.textContent = labels[_agrupInv] || 'GRUPOS A INCLUIR';

        // Estado inicial del botón toggle
        let _todosSeleccionados = true;
        if (toggleAllBtn) toggleAllBtn.textContent = 'Deseleccionar todo';

        const _syncToggleAll = () => {
            const checks = [...lista.querySelectorAll('.reporte-grupo-check')];
            const allChecked = checks.every(c => c.checked);
            const noneChecked = checks.every(c => !c.checked);
            _todosSeleccionados = allChecked;
            if (toggleAllBtn) toggleAllBtn.textContent = allChecked ? 'Deseleccionar todo' : 'Seleccionar todo';
            document.getElementById('reporte-confirmar-btn').disabled = noneChecked;
        };

        lista.querySelectorAll('.reporte-grupo-check').forEach(cb => {
            cb.addEventListener('change', _syncToggleAll);
        });

        document.getElementById('reporte-confirmar-btn').disabled = false;
        MM.abrir('modal-reporte');
    });

    document.getElementById('reporte-toggle-all-btn')?.addEventListener('click', () => {
        const lista = document.getElementById('reporte-grupos-lista');
        const checks = [...lista.querySelectorAll('.reporte-grupo-check')];
        const allChecked = checks.every(c => c.checked);
        checks.forEach(cb => { cb.checked = !allChecked; });
        const btn = document.getElementById('reporte-toggle-all-btn');
        if (btn) btn.textContent = allChecked ? 'Seleccionar todo' : 'Deseleccionar todo';
        document.getElementById('reporte-confirmar-btn').disabled = allChecked;
    });

    document.getElementById('reporte-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-reporte'));

    document.getElementById('reporte-confirmar-btn')?.addEventListener('click', () => {
        const racks = _getRacksFiltrados();
        const grupos = _getGrupos(racks);
        const checks = [...document.querySelectorAll('.reporte-grupo-check')];
        const seleccionados = new Set(checks.filter(c => c.checked).map(c => parseInt(c.dataset.idx)));
        const gruposFiltrados = grupos ? grupos.filter((_, i) => seleccionados.has(i)) : null;
        MM.cerrar('modal-reporte');
        generarReporteInventario(gruposFiltrados);
    });

    // ── Colapso de grupos (delegado en todos los wrappers: Inventario y Servicio) ──
    document.querySelectorAll('.inv-grupos-wrap').forEach(wrap => {
        let pressTimer = null;
        let isLongPress = false;
        let startY = 0;
        let startX = 0;

        const localStorageKey = wrap.id === 'inv-grupos-wrap' ? 'grupos_abiertos' : 'grupos_serv_abiertos';

        const guardarGruposAbiertos = () => {
            const busq = normalizarTexto(document.getElementById('busq-global')?.value || '');
            if (busq) return; 

            const arr = [];
            wrap.querySelectorAll('.inv-grupo-tr-header.open').forEach(el => {
                if (el.dataset.grupoKey) arr.push(el.dataset.grupoKey);
            });
            localStorage.setItem(APP_KEY + localStorageKey, JSON.stringify(arr));
        };

        const syncGlobal = () => {
            const allMains = wrap.querySelectorAll('.inv-grupo-tr-header:not(.inv-grupo-tr-sub)');
            allMains.forEach(main => {
                const isOpen = main.classList.contains('open');
                let next = main.nextElementSibling;
                let isSubOpen = true;

                while (next && !(next.classList.contains('inv-grupo-tr-header') && !next.classList.contains('inv-grupo-tr-sub'))) {
                    if (next.classList.contains('inv-grupo-tr-sub')) {
                        next.hidden = !isOpen;
                        isSubOpen = next.classList.contains('open');
                    } else {
                        next.hidden = !isOpen || !isSubOpen;
                    }
                    next = next.nextElementSibling;
                }
            });
        };

        const cancelPress = () => clearTimeout(pressTimer);

        wrap.addEventListener('pointerdown', e => {
            const header = e.target.closest('.inv-grupo-tr-header');
            if (!header) return;

            isLongPress = false;
            startY = e.clientY;
            startX = e.clientX;

            pressTimer = setTimeout(() => {
                isLongPress = true;
                const isSub = header.classList.contains('inv-grupo-tr-sub');
                const targetState = !header.classList.contains('open');

                if (navigator.vibrate) navigator.vibrate(40);

                if (isSub) {
                    const allSubs = wrap.querySelectorAll('.inv-grupo-tr-sub');
                    allSubs.forEach(sub => sub.classList.toggle('open', targetState));
                } else {
                    const allMains = wrap.querySelectorAll('.inv-grupo-tr-header:not(.inv-grupo-tr-sub)');
                    allMains.forEach(main => main.classList.toggle('open', targetState));

                    if (!targetState) {
                        const allSubs = wrap.querySelectorAll('.inv-grupo-tr-sub');
                        allSubs.forEach(sub => sub.classList.remove('open'));
                    }
                }
                syncGlobal();
                guardarGruposAbiertos(); 
            }, 500);
        });

        wrap.addEventListener('pointerup', cancelPress);
        wrap.addEventListener('pointercancel', cancelPress);
        wrap.addEventListener('pointermove', e => {
            if (Math.abs(e.clientY - startY) > 8 || Math.abs(e.clientX - startX) > 8) {
                cancelPress();
            }
        });

        wrap.addEventListener('click', e => {
            const tr = e.target.closest('tr[data-rack-id]');
            if (tr) { 
                if (wrap.id === 'inv-grupos-wrap') abrirModalEditarRack(tr.dataset.rackId);
                if (wrap.id === 'serv-grupos-wrap') abrirModalEditarServicio(tr.dataset.rackId);
                return; 
            }

            const header = e.target.closest('.inv-grupo-tr-header');
            if (!header) return;

            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const isSub = header.classList.contains('inv-grupo-tr-sub');
            const isOpen = header.classList.toggle('open');

            if (isSub) {
                let next = header.nextElementSibling;
                while (next && !next.classList.contains('inv-grupo-tr-header')) {
                    next.hidden = !isOpen;
                    next = next.nextElementSibling;
                }
            } else {
                let next = header.nextElementSibling;
                let isSubOpen = true;
                while (next && !(next.classList.contains('inv-grupo-tr-header') && !next.classList.contains('inv-grupo-tr-sub'))) {
                    if (next.classList.contains('inv-grupo-tr-sub')) {
                        next.hidden = !isOpen;
                        isSubOpen = next.classList.contains('open');
                    } else {
                        next.hidden = !isOpen || !isSubOpen;
                    }
                    next = next.nextElementSibling;
                }
            }
            guardarGruposAbiertos(); 
        });
    });
    // ── Card edificios: tocar fuera de la tabla vuelve al listado ──
    document.getElementById('card-resumen-edificios')?.addEventListener('click', e => {
        if (!_resumenEdificioActual) return;
        if (e.target.closest('#resumen-edificios-tabla')) return;
        _resumenEdificioActual = null;
        renderResumenEdificios();
    });

    // ── Tooltip para columna estado (muestra texto completo al hacer hover) ──
    (function () {
        const tip = document.getElementById('td-tooltip-global');
        if (!tip) return;

        let _current = null;

        function _posicionar(x, y) {
            const GAP = 10;
            const tw = tip.offsetWidth;
            const th = tip.offsetHeight;
            let left = x + GAP;
            let top = y - th - GAP;
            if (left + tw > window.innerWidth - 8) left = x - tw - GAP;
            if (top < 4) top = y + GAP;
            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
        }

        document.addEventListener('mousemove', e => {
            const el = e.target.closest('[data-tooltip]');
            if (!el) {
                if (_current) { tip.classList.remove('visible'); _current = null; }
                return;
            }
            if (el !== _current) {
                _current = el;
                tip.textContent = el.dataset.tooltip || '';
                tip.classList.add('visible');
            }
            _posicionar(e.clientX, e.clientY);
        });

        document.addEventListener('mouseleave', () => {
            tip.classList.remove('visible');
            _current = null;
        });
    }());

} // <-- Este es el cierre correcto de _initBindings()

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initBindings);
} else {
    _initBindings();
}
