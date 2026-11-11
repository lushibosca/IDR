/**
 * SGP — Patcheras (Sistema de Gestión de Patcheras)
 * Módulo de documentación de bocas de red en racks.
 */

'use strict';

// ══════════════════════════════════════════════════════════════
//  1. CONSTANTES & UTILIDADES
// ══════════════════════════════════════════════════════════════
const APP_KEY = 'PCH_';
const FILENAME = 'patcheras_data.json';
const RE_ID = /^[a-z0-9]+$/i;
const RE_GIST_ID = /^[a-f0-9]{20,40}$/i;
const RE_COLOR = /^(|blue|green|red|orange|yellow|purple|teal|gray)$/;
const MAX_STR = 200;
const MAX_IMPORT_MB = 5;

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _strSeg(v, max = MAX_STR) {
    if (typeof v !== 'string') return null;
    const s = v.trim().slice(0, max);
    return s.length ? s : null;
}

function parseSeguro(jsonString) {
    if (!jsonString) return null;
    try {
        return JSON.parse(jsonString, (key, value) => {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) {
                console.warn('Prototype pollution bloqueado');
                return undefined;
            }
            return value;
        });
    } catch (_) {
        return null;
    }
}

// ══════════════════════════════════════════════════════════════
//  2. CRIPTOGRAFÍA & FIRMAS SHA-256
// ══════════════════════════════════════════════════════════════
async function generarFirma(obj) {
    if (!obj) return '0';
    const core = {
        racks: (obj.racks || []).map(r => [
            r.id,
            r.nombre,
            r.us,
            r.edificio || '',
            r.sgrId || '',
            (r.unidades || []).map(u => [
                u.id,
                u.tipo,
                u.nombre,
                u.pos,
                (u.puertos || []).map(p => [p.num, p.label || '', p.notas || '', p.color || ''])
            ])
        ]),
        edificios: Array.isArray(obj.edificios) ? obj.edificios.slice().sort() : []
    };
    const str = JSON.stringify(core);
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function verificarFirma(raw) {
    if (!raw || typeof raw !== 'object' || !raw._firma) return false;
    const calc = await generarFirma(raw);
    if (raw._firma === calc) return true;

    // Fallback de retrocompatibilidad con firmas anteriores (sin edificios)
    try {
        const oldCore = {
            racks: (raw.racks || []).map(r => [
                r.id,
                r.nombre,
                r.us,
                (r.unidades || []).map(u => [
                    u.id,
                    u.tipo,
                    u.nombre,
                    u.pos,
                    (u.puertos || []).map(p => [p.num, p.label || '', p.notas || '', p.color || ''])
                ])
            ])
        };
        const enc = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify(oldCore)));
        const oldCalc = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        return raw._firma === oldCalc;
    } catch (_) {
        return false;
    }
}

// ══════════════════════════════════════════════════════════════
//  3. SANITIZACIÓN DE DATOS
// ══════════════════════════════════════════════════════════════
function _sanitizarPuerto(p) {
    if (!p || typeof p !== 'object') return null;
    const num = Number(p.num);
    if (!Number.isFinite(num) || num < 1 || num > 48) return null;
    const color = _strSeg(p.color || '', 10) ?? '';
    if (!RE_COLOR.test(color)) return null;
    return {
        num: Math.floor(num),
        label: _strSeg(p.label || '', 80) ?? '',
        notas: _strSeg(p.notas || '', 100) ?? '',
        color
    };
}

function _sanitizarUnidad(u) {
    if (!u || typeof u !== 'object') return null;
    const id = _strSeg(u.id, 32);
    if (!id || !RE_ID.test(id)) return null;
    let tipo = u.tipo;
    if (tipo !== 24 && tipo !== 48 && tipo !== 'fibra-v' && tipo !== 'fibra-h') {
        if (Number(tipo) === 24) tipo = 24;
        else if (Number(tipo) === 48) tipo = 48;
        else return null;
    }
    const nombre = _strSeg(u.nombre || '', 40) ?? '';
    const pos = Number(u.pos);
    const puertos = Array.isArray(u.puertos)
        ? u.puertos.map(_sanitizarPuerto).filter(Boolean)
        : [];
    return {
        id,
        tipo,
        nombre,
        pos: Number.isFinite(pos) && pos >= 1 && pos <= 42 ? Math.floor(pos) : 1,
        desc: _strSeg(u.desc || '', 100) ?? '',
        puertos
    };
}

function _sanitizarRack(r) {
    if (!r || typeof r !== 'object') return null;
    const id = _strSeg(r.id, 32);
    if (!id || !RE_ID.test(id)) return null;
    const nombre = _strSeg(r.nombre, 60);
    if (!nombre) return null;
    const us = Number(r.us);
    return {
        id,
        nombre,
        edificio: _strSeg(r.edificio || '', 80) ?? '',
        sgrId: _strSeg(r.sgrId || '', 32) ?? '',
        us: Number.isFinite(us) && us > 0 ? Math.floor(us) : 24,
        desc: _strSeg(r.desc || '', 120) ?? '',
        unidades: Array.isArray(r.unidades)
            ? r.unidades.map(_sanitizarUnidad).filter(Boolean)
            : [],
        abierto: !!r.abierto
    };
}

function sanitizarEstado(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(raw.racks)) return null;
    const edificios = Array.isArray(raw.edificios)
        ? raw.edificios.map(e => _strSeg(e, 80)).filter(Boolean)
        : [];
    return {
        racks: raw.racks.map(_sanitizarRack).filter(Boolean),
        edificios
    };
}

// ══════════════════════════════════════════════════════════════
//  4. ESTADO LOCAL
// ══════════════════════════════════════════════════════════════
let state = { racks: [], edificios: [] };

function guardar() {
    try {
        if (typeof IDRInfra !== 'undefined') {
            IDRInfra.setEdificios(state.edificios, false);
        }
        localStorage.setItem(APP_KEY + 'state', JSON.stringify(state));
    } catch (_) {}
    GistSync.subirAuto();
}

function cargar() {
    try {
        const raw = parseSeguro(localStorage.getItem(APP_KEY + 'state') || 'null');
        if (raw) {
            const limpio = sanitizarEstado(raw);
            if (limpio) state = limpio;
        }
    } catch (_) {}

    if (typeof IDRInfra !== 'undefined') {
        state.edificios = IDRInfra.getEdificios();
    }
}

// ══════════════════════════════════════════════════════════════
//  5. HISTORIAL (UNDO / REDO)
// ══════════════════════════════════════════════════════════════
const historial = (() => {
    const MAX = 30;
    let _pasado = [];
    let _futuro = [];

    function _clonar(s) {
        return parseSeguro(JSON.stringify(s));
    }

    function _actualizarBotones() {
        const bU = document.getElementById('btn-undo');
        const bR = document.getElementById('btn-redo');
        if (bU) bU.disabled = !_pasado.length;
        if (bR) bR.disabled = !_futuro.length;
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
        state = e.state;
        guardar();
        renderRacks();
        _actualizarBotones();
        toast(`Deshecho: ${e.label}`, 'info');
    }

    function redo() {
        if (!_futuro.length) return;
        const e = _futuro.pop();
        _pasado.push({ state: _clonar(state), label: e.label });
        if (_pasado.length > MAX) _pasado.shift();
        state = e.state;
        guardar();
        renderRacks();
        _actualizarBotones();
        toast(`Rehecho: ${e.label}`, 'info');
    }

    return { empujar, undo, redo };
})();

// ══════════════════════════════════════════════════════════════
//  6. MODALES Y AVISOS
// ══════════════════════════════════════════════════════════════
// Modales: `MM` (../shared/ui/js/mm.js, sobre UI.modal). Avisos: `toast` / `mostrarToast` (../shared/ui/js/toast.js).

// ══════════════════════════════════════════════════════════════
//  8. CONFIRMAR MODAL
// ══════════════════════════════════════════════════════════════
let _confirmarCb = null;

function confirmar(titulo, texto, cb) {
    document.getElementById('confirmar-titulo').textContent = titulo;
    document.getElementById('confirmar-texto').textContent = texto;
    _confirmarCb = cb;
    MM.abrir('modal-confirmar');       // queda encima del modal que lo pidió (UI.modal apila)
}

function _cerrarConfirmar() {
    _confirmarCb = null;
    MM.cerrar('modal-confirmar');
}

// ══════════════════════════════════════════════════════════════
//  10. JACK TOOLTIP
// ══════════════════════════════════════════════════════════════
const Tooltip = (() => {
    const el = document.getElementById('jack-tooltip');
    let _hideTimer = null;
    let _origen = null;                 // el puerto que lo abrió con un toque (para que un segundo toque lo edite)

    function show(port, label, notas, rect, origen = null) {
        if (!el) return;
        clearTimeout(_hideTimer);
        _origen = origen;
        document.getElementById('jt-port').textContent = port;
        document.getElementById('jt-label').textContent = label || '(sin destino asignado)';
        const notasEl = document.getElementById('jt-note');
        notasEl.textContent = notas || '';
        notasEl.classList.toggle('hidden', !notas);
        el.classList.add('show');

        // Cálculo de posición inteligente
        const tW = 220, tH = 80;
        let x = rect.left + rect.width / 2 - tW / 2;
        let y = rect.top - tH - 8;
        if (y < 8) y = rect.bottom + 8;
        if (x < 8) x = 8;
        if (x + tW > window.innerWidth - 8) x = window.innerWidth - tW - 8;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    }

    function hide(ya = false) {
        if (!el) return;
        clearTimeout(_hideTimer);
        _origen = null;
        if (ya) el.classList.remove('show');
        else _hideTimer = setTimeout(() => el.classList.remove('show'), 80);
    }

    return { show, hide, origen: () => _origen };
})();

/** ¿La pantalla se usa con el dedo? Ahí no hay «pasar el mouse»: el primer toque a un puerto muestra su tooltip y el segundo lo edita. */
const esTactil = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

// ══════════════════════════════════════════════════════════════
//  11. RENDER RACKS & PATCHERAS
// ══════════════════════════════════════════════════════════════
let _filtroEdificio = '';

function _initRacksListDelegation() {
    const container = document.getElementById('racks-list');
    if (!container || container._hasDelegation) return;
    container._hasDelegation = true;

    container.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        if (action === 'toggle-rack') {
            toggleRack(el.dataset.id);
        } else if (action === 'editar-rack') {
            abrirEditarRack(el.dataset.id);
        } else if (action === 'nueva-patchera') {
            abrirNuevaPatchera(el.dataset.rack);
        } else if (action === 'editar-patchera') {
            abrirEditarPatchera(el.dataset.rack, el.dataset.unidad);
        } else if (action === 'editar-jack') {
            if (esTactil() && Tooltip.origen() !== el) {
                Tooltip.show(`Puerto ${el.dataset.num}`, el.dataset.label || '', el.dataset.notas || '', el.getBoundingClientRect(), el);
                return;
            }
            Tooltip.hide(true);
            abrirEditarJack(el.dataset.rack, el.dataset.unidad, Number(el.dataset.num));
        }
    });

    // Tooltips interactivos con guardia contra layout thrashing
    container.addEventListener('mouseover', e => {
        if (esTactil()) return;               // el «mouseover» que el navegador inventa al tocar no debe abrir el tooltip
        const jack = e.target.closest('.jack, .fiber-coupler, .patch-label-cell');
        if (!jack || !jack.dataset.action) return;
        // Evitar recalcular getBoundingClientRect si el puntero se mueve entre hijos del mismo conector
        if (e.relatedTarget && jack.contains(e.relatedTarget)) return;

        const num = jack.dataset.num;
        const label = jack.dataset.label || '';
        const notas = jack.dataset.notas || '';
        const pNum = `Puerto ${num}`;
        Tooltip.show(pNum, label, notas, jack.getBoundingClientRect());
    });

    container.addEventListener('mouseout', e => {
        if (esTactil()) return;
        const jack = e.target.closest('.jack, .fiber-coupler, .patch-label-cell');
        if (!jack) return;
        // Evitar ocultar tooltip si seguimos dentro del mismo conector
        if (e.relatedTarget && jack.contains(e.relatedTarget)) return;
        Tooltip.hide();
    });
}

/** Lo que se busca en un rack: su nombre, edificio y descripción, y los de sus patcheras y puertos (etiqueta, notas y número). */
function _textoBuscableRack(rack) {
    const partes = [rack.nombre, rack.edificio, rack.desc];
    for (const u of rack.unidades) {
        partes.push(u.nombre, u.desc, 'patchera');
        for (const pu of u.puertos) partes.push(`puerto ${pu.num}`, pu.label, pu.notas);
    }
    return idrNormalizarBusqueda(partes.filter(Boolean).join(' · '));
}

/** ¿El rack cumple lo escrito en el buscador? (palabras, "frases" y exclusión con ! o -: ../shared/ui/js/busqueda-tokens.js) */
function _rackCoincide(rack, tokens) {
    const texto = _textoBuscableRack(rack);
    return idrCumpleTokens(tokens, t => idrTextoContiene(texto, t));
}

/** Resalta los puertos cuya etiqueta, notas o número cumplen las palabras buscadas (las exclusiones no resaltan nada). */
function _marcarCoincidencias(container, tokens) {
    const positivos = tokens.filter(t => !t.excluir);
    if (!positivos.length) return;
    container.querySelectorAll('[data-num]').forEach(el => {
        if (!el.dataset.label && !el.dataset.notas) return;
        const texto = idrNormalizarBusqueda(`puerto ${el.dataset.num} ${el.dataset.label || ''} ${el.dataset.notas || ''}`);
        if (positivos.every(t => idrTextoContiene(texto, t))) el.classList.add('coincide');
    });
}

function renderRacks() {
    const container = document.getElementById('racks-list');
    const empty = document.getElementById('racks-empty');
    if (!container || !empty) return;

    _initRacksListDelegation();

    const tokens = idrTokensBusqueda(document.getElementById('global-search')?.value || '');
    const buscando = tokens.length > 0;
    let racksMostrar = state.racks;
    if (_filtroEdificio) {
        const fEd = _filtroEdificio.toLowerCase().trim();
        racksMostrar = racksMostrar.filter(r => (r.edificio || '').toLowerCase().trim() === fEd);
    }
    if (buscando) racksMostrar = racksMostrar.filter(r => _rackCoincide(r, tokens));

    const conteo = document.getElementById('racks-count');
    if (conteo) conteo.textContent = String(racksMostrar.length);

    if (!racksMostrar.length) {
        container.replaceChildren();
        empty.classList.remove('empty-state-hidden');
        const emptyP = empty.querySelector('p');
        if (emptyP) {
            if (buscando) {
                emptyP.textContent = 'Ningún rack, patchera ni puerto coincide con la búsqueda.';
            } else if (state.racks.length > 0 && _filtroEdificio) {
                emptyP.textContent = `No hay racks en el edificio "${_filtroEdificio}".`;
            } else {
                emptyP.replaceChildren('No hay racks registrados.', document.createElement('br'), 'Comenzá creando tu primer rack de telecomunicaciones.');
            }
        }
        renderEstado();
        return;
    }
    empty.classList.add('empty-state-hidden');
    // con una búsqueda activa los racks que coinciden se muestran abiertos (sin tocar lo que se dejó abierto o cerrado)
    container.innerHTML = racksMostrar.map(r => renderRackCard(r, buscando)).join('');
    if (buscando) _marcarCoincidencias(container, tokens);
    renderEstado();
}

function _renderRackBodyContent(rack) {
    if (!rack.unidades.length) {
        return `
            <div class="empty-state empty-state-sm">
                <div class="empty-icon empty-icon-sm"><i class="bi bi-ethernet" aria-hidden="true"></i></div>
                <p class="empty-text-sm">Sin patcheras registradas en este rack.</p>
            </div>`;
    }
    return renderRackView(rack);
}

function renderRackCard(rack, forzarAbierto = false) {
    const totalPuertos = rack.unidades.reduce((s, u) => s + (typeof u.tipo === 'number' ? u.tipo : 24), 0);
    const usados = rack.unidades.reduce((s, u) => s + u.puertos.filter(p => p.label).length, 0);
    const pct = totalPuertos ? Math.round((usados / totalPuertos) * 100) : 0;
    const isOpen = rack.abierto || forzarAbierto;

    return `
    <div class="rack-item-card" id="rcard-${esc(rack.id)}">
        <div class="rack-item-header ${isOpen ? 'open' : ''}" id="rheader-${esc(rack.id)}" data-action="toggle-rack" data-id="${esc(rack.id)}">
            <i class="bi bi-hdd-rack icon-accent" aria-hidden="true"></i>
            <span class="rack-item-name">${esc(rack.nombre)}</span>
            ${rack.edificio ? `
                <span class="rack-edificio-badge" title="Edificio">
                    <i class="bi bi-building icon-xs" aria-hidden="true"></i>
                    ${esc(rack.edificio)}
                </span>` : ''}
            ${rack.sgrId ? `<span class="badge badge-sgr" title="Vinculado a rack de SGR">SGR</span>` : ''}
            ${rack.desc ? `<span class="rack-item-meta">${esc(rack.desc)}</span>` : ''}
            <span class="badge badge-gray" id="runits-${esc(rack.id)}">${rack.unidades.length} patchera${rack.unidades.length !== 1 ? 's' : ''}</span>
            <span class="badge ${pct > 80 ? 'badge-orange' : 'badge-blue'}" id="rocc-${esc(rack.id)}">${pct}% ocupado</span>
            <span class="badge badge-gray">${rack.us}U</span>
            <button type="button" class="btn btn-sm btn-outline-secondary card-action-btn" data-action="editar-rack" data-id="${esc(rack.id)}" title="Editar rack" aria-label="Editar rack">
                <i class="bi bi-pencil" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary card-action-btn" data-action="toggle-rack" data-id="${esc(rack.id)}" title="${isOpen ? 'Colapsar' : 'Expandir'}" aria-label="${isOpen ? 'Colapsar' : 'Expandir'}">
                <i class="bi bi-chevron-down rack-chevron" aria-hidden="true"></i>
            </button>
        </div>
        <div class="rack-item-body ${isOpen ? 'open' : ''}" id="rbody-${esc(rack.id)}">
            <div class="rack-card-actions">
                <button type="button" class="btn btn-sm btn-primary btn-nueva-patchera" data-action="nueva-patchera" data-rack="${esc(rack.id)}">
                    <i class="bi bi-plus-lg me-1" aria-hidden="true"></i> Agregar patchera
                </button>
            </div>
            <div class="rack-body-content" id="rcontent-${esc(rack.id)}">
                ${isOpen ? _renderRackBodyContent(rack) : ''}
            </div>
        </div>
    </div>`;
}

function renderRackView(rack) {
    return `
    <div class="rack-container">
        <div class="rack-header-row">
            <span class="rack-name">${esc(rack.nombre)}</span>
            <span class="rack-meta">${rack.unidades.length} unidades instaladas</span>
        </div>
        ${rack.unidades.map(u => renderPatchera(u, rack.id)).join('')}
    </div>`;
}

function renderPatchera(u, rackId) {
    const portMap = {};
    u.puertos.forEach(p => { portMap[p.num] = p; });

    if (u.tipo === 'fibra-v') {
        return renderPatcheraFibraVertical(u, rackId, portMap);
    } else if (u.tipo === 'fibra-h') {
        return renderPatcheraFibraHorizontal(u, rackId, portMap);
    } else if (Number(u.tipo) === 48) {
        return renderPatchera48(u, rackId, portMap);
    } else {
        return renderPatchera24(u, rackId, portMap);
    }
}

function _jackHTML(num, portMap, unidadId, rackId) {
    const p = portMap[num];
    const filled = p && p.label;
    const colorClass = p && p.color ? `col-${p.color}` : '';
    const labelAttr = p ? ` data-label="${esc(p.label || '')}" data-notas="${esc(p.notas || '')}"` : '';

    return `
    <div class="patch-port-col">
        <div class="patch-label-cell ${p && p.label ? 'has-label' : ''}"
             data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
             title="${p && p.label ? esc(p.label) : `Puerto ${num}`}">
            <span class="plc-text">${esc(p?.label || '')}</span>
        </div>
        <span class="patch-port-num">${num}</span>
        <div class="jack ${filled || colorClass ? 'filled' : ''} ${colorClass} ${!filled && !colorClass ? 'empty' : ''}"
             data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
             title="${p && p.label ? esc(p.label) : `Puerto ${num}`}">
            <div class="jack-bezel">
                <div class="jack-cavity">
                    <div class="jack-pins"></div>
                    <div class="jack-notch"></div>
                    <div class="jack-plug">
                        <div class="jack-plug-clip"></div>
                        <div class="jack-plug-led"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function _jacksGrupo(nums, portMap, unidadId, rackId) {
    // Dividir en bloques modulares de 6 bocas (estándar de plano técnico 1U)
    const blocks = [];
    for (let i = 0; i < nums.length; i += 6) {
        blocks.push(nums.slice(i, i + 6));
    }

    return blocks.map((block, idx) => {
        const divider = idx > 0 ? '<div class="patch-module-divider"></div>' : '';
        const portsHtml = block.map(n => _jackHTML(n, portMap, unidadId, rackId)).join('');
        return `${divider}
        <div class="patch-module" data-module="${idx + 1}">
            <div class="patch-module-inner">
                <div class="patch-module-ports">${portsHtml}</div>
            </div>
        </div>`;
    }).join('');
}

function renderPatchera24(u, rackId, portMap) {
    const nums = Array.from({ length: 24 }, (_, i) => i + 1);
    const totalPuertos = 24;
    const usados = u.puertos.filter(p => p.label || p.color).length;
    const pct = Math.round((usados / totalPuertos) * 100);

    return `
    <div class="rack-unit patch-panel-unit" id="unit-${esc(u.id)}">
        <div class="rack-unit-label">
            <div class="rul-info">
                <span class="rul-pos-badge">${u.pos}U</span>
                <span class="rul-name">${esc(u.nombre || `Patchera ${u.pos}U`)}</span>
                ${u.desc ? `<span class="rul-desc">${esc(u.desc)}</span>` : ''}
            </div>
            <div class="rack-unit-controls">
                <span class="rack-unit-pos">24p RJ45 · ${usados}/24 (${pct}%)</span>
                <button data-action="editar-patchera" data-rack="${esc(rackId)}" data-unidad="${esc(u.id)}">Editar</button>
            </div>
        </div>
        <div class="patch-chassis">
            <div class="patch-ear patch-ear-left">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ground-symbol" title="Puesta a tierra física">
                    <svg viewBox="0 0 16 16" class="patch-svg-icon">
                        <line x1="8" y1="2" x2="8" y2="9"/>
                        <line x1="3" y1="9" x2="13" y2="9"/>
                        <line x1="5" y1="12" x2="11" y2="12"/>
                        <line x1="7" y1="15" x2="9" y2="15"/>
                    </svg>
                </div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
            <div class="patch-faceplate">
                <div class="patch-modules-row">
                    ${_jacksGrupo(nums, portMap, u.id, rackId)}
                </div>
            </div>
            <div class="patch-ear patch-ear-right">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ear-tag">19" 1U</div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
        </div>
    </div>`;
}

function renderPatchera48(u, rackId, portMap) {
    const fila1 = Array.from({ length: 24 }, (_, i) => i + 1);
    const fila2 = Array.from({ length: 24 }, (_, i) => i + 25);
    const totalPuertos = 48;
    const usados = u.puertos.filter(p => p.label || p.color).length;
    const pct = Math.round((usados / totalPuertos) * 100);

    return `
    <div class="rack-unit patch-panel-unit patch-panel-48" id="unit-${esc(u.id)}">
        <div class="rack-unit-label">
            <div class="rul-info">
                <span class="rul-pos-badge">${u.pos}U</span>
                <span class="rul-name">${esc(u.nombre || `Patchera ${u.pos}U`)}</span>
                ${u.desc ? `<span class="rul-desc">${esc(u.desc)}</span>` : ''}
            </div>
            <div class="rack-unit-controls">
                <span class="rack-unit-pos">48p RJ45 · ${usados}/48 (${pct}%)</span>
                <button data-action="editar-patchera" data-rack="${esc(rackId)}" data-unidad="${esc(u.id)}">Editar</button>
            </div>
        </div>
        <div class="patch-chassis patch-chassis-48">
            <div class="patch-ear patch-ear-left">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ground-symbol" title="Puesta a tierra física">
                    <svg viewBox="0 0 16 16" class="patch-svg-icon">
                        <line x1="8" y1="2" x2="8" y2="9"/>
                        <line x1="3" y1="9" x2="13" y2="9"/>
                        <line x1="5" y1="12" x2="11" y2="12"/>
                        <line x1="7" y1="15" x2="9" y2="15"/>
                    </svg>
                </div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
            <div class="patch-faceplate patch-faceplate-48">
                <div class="patch-modules-row">
                    ${_jacksGrupo(fila1, portMap, u.id, rackId)}
                </div>
                <div class="patch-row-divider"></div>
                <div class="patch-modules-row">
                    ${_jacksGrupo(fila2, portMap, u.id, rackId)}
                </div>
            </div>
            <div class="patch-ear patch-ear-right">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ear-tag">19" 2U</div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
        </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PATCHERAS DE FIBRA ÓPTICA (ODF 19" 1U)
// ══════════════════════════════════════════════════════════════
const _FIBER_TIA598_PAIRS = [
    ['#2563eb', '#ea580c'], // Par 1: 1-Azul, 2-Naranja
    ['#16a34a', '#78350f'], // Par 2: 3-Verde, 4-Marrón
    ['#64748b', '#e2e8f0'], // Par 3: 5-Gris, 6-Blanco
    ['#dc2626', '#1e293b'], // Par 4: 7-Rojo, 8-Negro
    ['#eab308', '#9333ea'], // Par 5: 9-Amarillo, 10-Violeta
    ['#ec4899', '#06b6d4'], // Par 6: 11-Rosa, 12-Aqua
];

const _FIBER_COLOR_MAP = {
    blue: '#2563eb',
    orange: '#ea580c',
    green: '#16a34a',
    red: '#dc2626',
    yellow: '#eab308',
    purple: '#9333ea',
    teal: '#06b6d4',
    gray: '#64748b'
};

function _getFiberFerruleColors(portNum, portObj) {
    if (portObj && portObj.color && _FIBER_COLOR_MAP[portObj.color]) {
        const c = _FIBER_COLOR_MAP[portObj.color];
        return [c, c];
    }
    const pairIdx = ((portNum - 1) % 6);
    return _FIBER_TIA598_PAIRS[pairIdx] || ['#06b6d4', '#06b6d4'];
}

function _fiberCouplerVHTML(num, portMap, unidadId, rackId) {
    const p = portMap[num];
    const filled = p && p.label;
    const [c1, c2] = _getFiberFerruleColors(num, p);
    const colorClass = p && p.color ? `col-${p.color}` : '';
    const labelAttr = p ? ` data-label="${esc(p.label || '')}" data-notas="${esc(p.notas || '')}"` : '';

    return `
    <div class="patch-port-col fiber-port-col fiber-col-v">
        <div class="patch-label-cell ${filled ? 'has-label' : ''}"
             data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
             title="${filled ? esc(p.label) : `Fibra Dúplex ${num}`}">
            <span class="plc-text">${esc(p?.label || '')}</span>
        </div>
        <span class="patch-port-num">${num}</span>
        <div class="fiber-coupler fiber-coupler-v ${filled || colorClass ? 'active' : ''} ${colorClass}"
             data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
             title="${filled ? esc(p.label) : `Fibra Dúplex ${num}`}">
            <div class="fiber-flange-screw"></div>
            <div class="fiber-coupler-body">
                <div class="fiber-ferrule" style="background:${c1};">
                    <div class="fiber-core"></div>
                </div>
                <div class="fiber-ferrule-divider"></div>
                <div class="fiber-ferrule" style="background:${c2};">
                    <div class="fiber-core"></div>
                </div>
            </div>
            <div class="fiber-flange-screw"></div>
        </div>
    </div>`;
}

function _fiberCouplerHHTML(num, portMap, unidadId, rackId) {
    const p = portMap[num];
    const filled = p && p.label;
    const [c1, c2] = _getFiberFerruleColors(num, p);
    const colorClass = p && p.color ? `col-${p.color}` : '';
    const labelAttr = p ? ` data-label="${esc(p.label || '')}" data-notas="${esc(p.notas || '')}"` : '';

    return `
    <div class="fiber-coupler-h-wrap">
        <div class="patch-label-cell ${filled ? 'has-label' : ''}"
             data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
             title="${filled ? esc(p.label) : `Fibra Dúplex ${num}`}">
            <span class="plc-text">${esc(p?.label || '')}</span>
        </div>
        <div class="fiber-coupler-h-inner">
            <span class="patch-port-num">${num}</span>
            <div class="fiber-coupler fiber-coupler-h ${filled || colorClass ? 'active' : ''} ${colorClass}"
                 data-action="editar-jack" data-rack="${esc(rackId)}" data-unidad="${esc(unidadId)}" data-num="${num}"${labelAttr}
                 title="${filled ? esc(p.label) : `Fibra Dúplex ${num}`}">
                <div class="fiber-flange-screw"></div>
                <div class="fiber-coupler-body">
                    <div class="fiber-ferrule" style="background:${c1};">
                        <div class="fiber-core"></div>
                    </div>
                    <div class="fiber-ferrule-divider"></div>
                    <div class="fiber-ferrule" style="background:${c2};">
                        <div class="fiber-core"></div>
                    </div>
                </div>
                <div class="fiber-flange-screw"></div>
            </div>
        </div>
    </div>`;
}

function renderPatcheraFibraVertical(u, rackId, portMap) {
    const totalPuertos = 24;
    const usados = u.puertos.filter(p => p.label || p.color).length;
    const pct = Math.round((usados / totalPuertos) * 100);

    const portsG1 = Array.from({ length: 12 }, (_, i) => i + 1).map(n => _fiberCouplerVHTML(n, portMap, u.id, rackId)).join('');
    const portsG2 = Array.from({ length: 12 }, (_, i) => i + 13).map(n => _fiberCouplerVHTML(n, portMap, u.id, rackId)).join('');

    return `
    <div class="rack-unit patch-panel-unit patch-panel-fibra" id="unit-${esc(u.id)}">
        <div class="rack-unit-label">
            <div class="rul-info">
                <span class="rul-pos-badge">${u.pos}U</span>
                <span class="rul-name">${esc(u.nombre || `ODF ${u.pos}U`)}</span>
                ${u.desc ? `<span class="rul-desc">${esc(u.desc)}</span>` : ''}
            </div>
            <div class="rack-unit-controls">
                <span class="rack-unit-pos">24p Dúplex Vertical FO · ${usados}/24 (${pct}%)</span>
                <button data-action="editar-patchera" data-rack="${esc(rackId)}" data-unidad="${esc(u.id)}">Editar</button>
            </div>
        </div>
        <div class="patch-chassis">
            <div class="patch-ear patch-ear-left">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ground-symbol" title="Puesta a tierra física">
                    <svg viewBox="0 0 16 16" class="patch-svg-icon">
                        <line x1="8" y1="2" x2="8" y2="9"/>
                        <line x1="3" y1="9" x2="13" y2="9"/>
                        <line x1="5" y1="12" x2="11" y2="12"/>
                        <line x1="7" y1="15" x2="9" y2="15"/>
                    </svg>
                </div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
            <div class="patch-faceplate">
                <div class="fiber-v-row">
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                    ${portsG1}
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                    ${portsG2}
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                </div>
            </div>
            <div class="patch-ear patch-ear-right">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ear-tag patch-ear-tag-fo">19" 1U FO</div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
        </div>
    </div>`;
}

function renderPatcheraFibraHorizontal(u, rackId, portMap) {
    const totalPuertos = 24;
    const usados = u.puertos.filter(p => p.label || p.color).length;
    const pct = Math.round((usados / totalPuertos) * 100);

    const c1Row1 = [1, 2, 3, 4, 5, 6].map(n => _fiberCouplerHHTML(n, portMap, u.id, rackId)).join('');
    const c1Row2 = [7, 8, 9, 10, 11, 12].map(n => _fiberCouplerHHTML(n, portMap, u.id, rackId)).join('');

    const c2Row1 = [13, 14, 15, 16, 17, 18].map(n => _fiberCouplerHHTML(n, portMap, u.id, rackId)).join('');
    const c2Row2 = [19, 20, 21, 22, 23, 24].map(n => _fiberCouplerHHTML(n, portMap, u.id, rackId)).join('');

    return `
    <div class="rack-unit patch-panel-unit patch-panel-fibra patch-panel-fibra-h" id="unit-${esc(u.id)}">
        <div class="rack-unit-label">
            <div class="rul-info">
                <span class="rul-pos-badge">${u.pos}U</span>
                <span class="rul-name">${esc(u.nombre || `ODF ${u.pos}U`)}</span>
                ${u.desc ? `<span class="rul-desc">${esc(u.desc)}</span>` : ''}
            </div>
            <div class="rack-unit-controls">
                <span class="rack-unit-pos">24p Dúplex Horizontal FO (2 Filas) · ${usados}/24 (${pct}%)</span>
                <button data-action="editar-patchera" data-rack="${esc(rackId)}" data-unidad="${esc(u.id)}">Editar</button>
            </div>
        </div>
        <div class="patch-chassis">
            <div class="patch-ear patch-ear-left">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ground-symbol" title="Puesta a tierra física">
                    <svg viewBox="0 0 16 16" class="patch-svg-icon">
                        <line x1="8" y1="2" x2="8" y2="9"/>
                        <line x1="3" y1="9" x2="13" y2="9"/>
                        <line x1="5" y1="12" x2="11" y2="12"/>
                        <line x1="7" y1="15" x2="9" y2="15"/>
                    </svg>
                </div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
            <div class="patch-faceplate">
                <div class="fiber-h-container">
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                    <div class="fiber-h-cassette">
                        <div class="fiber-h-row">${c1Row1}</div>
                        <div class="fiber-h-row">${c1Row2}</div>
                    </div>
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                    <div class="fiber-h-cassette">
                        <div class="fiber-h-row">${c2Row1}</div>
                        <div class="fiber-h-row">${c2Row2}</div>
                    </div>
                    <div class="fiber-plunger" title="Perno de fijación rápida">
                        <div class="fiber-plunger-knob"></div>
                    </div>
                </div>
            </div>
            <div class="patch-ear patch-ear-right">
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
                <div class="patch-ear-tag patch-ear-tag-fo">19" 1U FO</div>
                <div class="patch-screw-slot"><div class="patch-screw"></div></div>
            </div>
        </div>
    </div>`;
}

function bindRackEvents(rackId) {
    // Delegado globalmente a #racks-list en _initRacksListDelegation()
}

// ══════════════════════════════════════════════════════════════
//  12. INTEGRACIÓN SGR & GESTOR DE EDIFICIOS
// ══════════════════════════════════════════════════════════════
const SGRBridge = {
    // Los datos de SGR se piden siempre a shared/idr-infra.js (una app no lee las claves de otra)
    obtenerEdificios() {
        return typeof IDRInfra !== 'undefined' ? IDRInfra.getEdificios() : [];
    },
    obtenerRacks(edificio = '') {
        return typeof IDRInfra !== 'undefined' ? IDRInfra.getRacks(edificio) : [];
    }
};

const GestorEdificios = (() => {
    function obtenerTodos() {
        if (typeof IDRInfra !== 'undefined') return IDRInfra.getEdificios();
        const set = new Set();
        (state.edificios || []).forEach(e => { if (typeof e === 'string' && e.trim()) set.add(e.trim()); });
        (state.racks || []).forEach(r => { if (typeof r?.edificio === 'string' && r.edificio.trim()) set.add(r.edificio.trim()); });
        SGRBridge.obtenerEdificios().forEach(e => set.add(e));
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    }

    function _renderLista() {
        const lista = document.getElementById('edificios-lista');
        const sgrAviso = document.getElementById('edificios-sgr-aviso');
        const sgrInfo = document.getElementById('edificios-sgr-info');
        if (!lista) return;

        const sgrEds = new Set(SGRBridge.obtenerEdificios());
        if (sgrAviso && sgrInfo) {
            if (sgrEds.size > 0) {
                sgrInfo.textContent = `Conectado a SGR (${sgrEds.size} edificio${sgrEds.size !== 1 ? 's' : ''} detectado${sgrEds.size !== 1 ? 's' : ''})`;
                sgrAviso.classList.remove('hidden');
            } else {
                sgrAviso.classList.add('hidden');
            }
        }

        const todos = obtenerTodos();
        if (!todos.length) {
            lista.innerHTML = '<div class="edificios-empty">Sin edificios declarados</div>';
            return;
        }

        lista.innerHTML = '';
        todos.forEach(ed => {
            const esDeSgr = sgrEds.has(ed);
            const row = document.createElement('div');
            row.className = 'tipo-custom-row';

            const span = document.createElement('span');
            span.className = 'tipo-custom-label';
            span.textContent = ed;

            if (esDeSgr) {
                const badge = document.createElement('span');
                badge.className = 'badge-sgr';
                badge.textContent = 'SGR';
                badge.title = 'Disponible desde módulo SGR';
                span.appendChild(badge);
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-danger btn-delete--sm';
            btn.title = 'Eliminar edificio';
            btn.setAttribute('aria-label', `Eliminar el edificio ${ed}`);
            const ico = document.createElement('i');
            ico.className = 'bi bi-trash3';
            btn.appendChild(ico);
            btn.addEventListener('click', () => eliminar(ed));

            row.appendChild(span);
            row.appendChild(btn);
            lista.appendChild(row);
        });
    }

    function poblarSelect(selectId, valorActual = '', incluirOpcionTodos = false) {
        if (typeof IDRInfra !== 'undefined') {
            IDRInfra.poblarSelectEdificios(selectId, valorActual, {
                incluirOpcionTodos,
                textoTodos: 'Todos los edificios',
                incluirVacio: !incluirOpcionTodos
            });
            return;
        }
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const todos = obtenerTodos();
        sel.innerHTML = '';

        const optVacia = document.createElement('option');
        optVacia.value = '';
        optVacia.textContent = incluirOpcionTodos ? 'Todos los edificios' : '— Sin edificio —';
        sel.appendChild(optVacia);

        todos.forEach(ed => {
            const opt = document.createElement('option');
            opt.value = ed;
            opt.textContent = ed;
            sel.appendChild(opt);
        });
        sel.value = (valorActual && todos.includes(valorActual)) ? valorActual : '';
    }

    function abrir() {
        _renderLista();
        MM.abrir('modal-edificios');
        setTimeout(() => document.getElementById('edificios-nuevo-input')?.focus(), 50);
    }

    function cerrar() {
        MM.cerrar('modal-edificios');
        actualizarFiltrosYSelects();
    }

    function agregar() {
        const input = document.getElementById('edificios-nuevo-input');
        if (!input) return;
        const raw = input.value.trim();
        if (!raw) {
            input.classList.add('error');
            setTimeout(() => input.classList.remove('error'), 1200);
            toast('Ingresá un nombre para el edificio', 'error');
            return;
        }

        historial.empujar('Agregar edificio');

        if (typeof IDRInfra !== 'undefined') {
            const res = IDRInfra.agregarEdificio(raw);
            state.edificios = res.total;
            guardar();
            actualizarFiltrosYSelects();
            input.value = '';
            input.classList.remove('error');
            _renderLista();
            if (res.agregados.length && !res.duplicados.length) {
                toast(res.agregados.length === 1 ? `Edificio "${res.agregados[0]}" agregado` : `${res.agregados.length} edificios agregados`, 'success');
            } else if (res.agregados.length && res.duplicados.length) {
                toast(`${res.agregados.length} agregado${res.agregados.length > 1 ? 's' : ''}, ${res.duplicados.length} ya existía${res.duplicados.length > 1 ? 'n' : ''}`, 'info');
            } else {
                toast(res.duplicados.length === 1 ? `Ya existe "${res.duplicados[0]}"` : 'Todos ya existen', 'error');
            }
            return;
        }

        const nombres = raw.split(',').map(n => n.trim().slice(0, 80)).filter(Boolean);
        if (!nombres.length) return;

        if (!Array.isArray(state.edificios)) state.edificios = [];
        const agregados = [], duplicados = [];
        const existentes = new Set(obtenerTodos().map(e => e.toLowerCase()));

        for (const n of nombres) {
            if (existentes.has(n.toLowerCase())) {
                duplicados.push(n);
            } else {
                state.edificios.push(n);
                existentes.add(n.toLowerCase());
                agregados.push(n);
            }
        }

        if (agregados.length) {
            state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
            guardar();
            actualizarFiltrosYSelects();
        }

        input.value = '';
        input.classList.remove('error');
        _renderLista();

        if (agregados.length && !duplicados.length) {
            toast(agregados.length === 1 ? `Edificio "${agregados[0]}" agregado` : `${agregados.length} edificios agregados`, 'success');
        } else if (agregados.length && duplicados.length) {
            toast(`${agregados.length} agregado${agregados.length > 1 ? 's' : ''}, ${duplicados.length} ya existía${duplicados.length > 1 ? 'n' : ''}`, 'info');
        } else {
            toast(duplicados.length === 1 ? `Ya existe "${duplicados[0]}"` : 'Todos ya existen', 'error');
        }
    }

    function sincronizarDesdeSGR() {
        const sgrEds = SGRBridge.obtenerEdificios();
        if (!sgrEds.length) {
            toast('No se encontraron edificios en SGR', 'info');
            return;
        }
        if (!Array.isArray(state.edificios)) state.edificios = [];
        const localesSet = new Set(state.edificios.map(e => e.toLowerCase()));
        let nuevos = 0;
        sgrEds.forEach(ed => {
            if (!localesSet.has(ed.toLowerCase())) {
                state.edificios.push(ed);
                localesSet.add(ed.toLowerCase());
                nuevos++;
            }
        });
        if (nuevos > 0) {
            state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
            guardar();
            actualizarFiltrosYSelects();
            toast(`${nuevos} edificio${nuevos > 1 ? 's' : ''} importado${nuevos > 1 ? 's' : ''} desde SGR`, 'success');
        } else {
            toast('Todos los edificios de SGR ya están sincronizados', 'info');
        }
        _renderLista();
    }

    function eliminar(ed) {
        const enUso = state.racks.some(r => r.edificio === ed);
        const count = state.racks.filter(r => r.edificio === ed).length;
        const msg = enUso
            ? `"${ed}" está asignado a ${count} rack(s) en SGP. ¿Eliminar de la lista? (los racks conservarán el nombre)`
            : `¿Eliminar el edificio "${ed}"?`;

        confirmar('Eliminar edificio', msg, () => {
            historial.empujar(`Eliminar edificio ${ed}`);
            if (typeof IDRInfra !== 'undefined') {
                IDRInfra.eliminarEdificio(ed);
                state.edificios = IDRInfra.getEdificios();
            } else {
                state.edificios = (state.edificios || []).filter(e => e !== ed);
            }
            guardar();
            _renderLista();
            actualizarFiltrosYSelects();
            toast(`Edificio "${ed}" eliminado`);
        });
    }

    if (typeof IDRInfra !== 'undefined') {
        IDRInfra.onEdificiosChange(() => {
            state.edificios = IDRInfra.getEdificios();
            _renderLista();
            actualizarFiltrosYSelects();
        });
        IDRInfra.onRacksChange(() => {
            _renderLista();
            actualizarFiltrosYSelects();
        });
    }

    return { obtenerTodos, poblarSelect, abrir, cerrar, agregar, eliminar, sincronizarDesdeSGR };
})();

function actualizarFiltrosYSelects() {
    const filtroSel = document.getElementById('filtro-edificio-select');
    const filtroWrap = document.getElementById('filtro-edificio-wrap');
    const todosEds = GestorEdificios.obtenerTodos();

    if (filtroSel) {
        const valActual = filtroSel.value;
        filtroSel.innerHTML = '<option value="">Todos los edificios</option>';
        todosEds.forEach(ed => {
            const opt = document.createElement('option');
            opt.value = ed;
            opt.textContent = ed;
            filtroSel.appendChild(opt);
        });
        if (todosEds.includes(valActual)) {
            filtroSel.value = valActual;
            _filtroEdificio = valActual;
        } else {
            filtroSel.value = '';
            _filtroEdificio = '';
        }
    }

    if (filtroWrap) {
        filtroWrap.classList.toggle('hidden', todosEds.length === 0);
    }
}

// ══════════════════════════════════════════════════════════════
//  13. CRUD DE RACKS
// ══════════════════════════════════════════════════════════════
function toggleRack(rackId) {
    const rack = state.racks.find(r => r.id === rackId);
    if (!rack) return;
    
    const abrir = !rack.abierto;

    if (abrir) {
        // Acordeón: cerrar los demás racks abiertos
        state.racks.forEach(otro => {
            if (otro.id !== rackId && otro.abierto) {
                otro.abierto = false;
                const oH = document.getElementById(`rheader-${otro.id}`);
                const oB = document.getElementById(`rbody-${otro.id}`);
                const oBtn = oH?.querySelector('button[data-action="toggle-rack"]');
                if (oH) oH.classList.remove('open');
                if (oB) oB.classList.remove('open');
                if (oBtn) oBtn.title = 'Expandir';
            }
        });
    }

    rack.abierto = abrir;
    guardar();

    const header = document.getElementById(`rheader-${rackId}`);
    const body = document.getElementById(`rbody-${rackId}`);
    const content = document.getElementById(`rcontent-${rackId}`);
    const btn = header?.querySelector('button[data-action="toggle-rack"]');

    if (rack.abierto) {
        if (header) header.classList.add('open');
        if (body) body.classList.add('open');
        if (btn) btn.title = 'Colapsar';
        if (content && !content.firstElementChild) {
            content.innerHTML = _renderRackBodyContent(rack);
        }

        setTimeout(() => {
            const card = document.getElementById(`rcard-${rackId}`);
            if (card && card.getBoundingClientRect().top < 60) {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (header && header.getBoundingClientRect().top < 60) {
                header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 380);
    } else {
        if (header) header.classList.remove('open');
        if (body) body.classList.remove('open');
        if (btn) btn.title = 'Expandir';
    }
}

let _editandoRackId = null;
let _rackSgrId = null;

function poblarSelectorSGR(edificioFiltro = '') {
    const sel = document.getElementById('rack-sgr-select');
    if (!sel) return;
    const racksSGR = SGRBridge.obtenerRacks(edificioFiltro);
    sel.innerHTML = '';

    const optDefecto = document.createElement('option');
    optDefecto.value = '';
    optDefecto.textContent = racksSGR.length
        ? '— Seleccionar de SGR (o cargar manual) —'
        : '— Sin racks en SGR (cargar manual) —';
    sel.appendChild(optDefecto);

    if (!racksSGR.length) return;

    const yaEnSgpIds = new Set(state.racks.map(r => r.sgrId).filter(Boolean));

    racksSGR.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        const yaExiste = yaEnSgpIds.has(r.id);
        const partes = [];
        if (r.numero) partes.push(`Rack ${r.numero}`);
        else if (r.identificador) partes.push(r.identificador);
        else partes.push(`Rack ${r.id.slice(0, 6)}`);

        if (r.marca || r.modelo) partes.push(`${r.marca || ''} ${r.modelo || ''}`.trim());
        if (r.unidades) partes.push(`[${r.unidades}U]`);
        if (r.edificio) partes.push(`· ${r.edificio}`);
        if (r.piso) partes.push(`P.${r.piso}`);

        opt.textContent = partes.join(' ') + (yaExiste ? ' ✓ (Ya en SGP)' : '');
        opt.dataset.rack = JSON.stringify(r);
        sel.appendChild(opt);
    });
}

function onRackSgrSelectChange() {
    const sel = document.getElementById('rack-sgr-select');
    if (!sel || !sel.value) {
        _rackSgrId = null;
        return;
    }

    const opt = sel.selectedOptions[0];
    if (!opt || !opt.dataset.rack) return;

    try {
        const r = JSON.parse(opt.dataset.rack);
        _rackSgrId = r.id;

        // Autocompletar nombre
        const inputNombre = document.getElementById('rack-nombre');
        if (inputNombre) {
            inputNombre.value = r.numero ? `Rack ${r.numero}` : (r.identificador || `${r.marca || ''} ${r.modelo || ''}`.trim() || `Rack`);
            inputNombre.classList.remove('error');
        }

        // Autocompletar descripción / ubicación
        const inputDesc = document.getElementById('rack-desc');
        if (inputDesc) {
            const detalles = [];
            if (r.edificio) detalles.push(r.edificio);
            if (r.piso) detalles.push(`Piso ${r.piso}`);
            if (r.dependencia) detalles.push(r.dependencia);
            if (r.notas) detalles.push(`(${r.notas})`);
            inputDesc.value = detalles.join(' - ');
        }

        // Autocompletar edificio
        if (r.edificio) {
            const selEd = document.getElementById('rack-edificio');
            if (selEd) {
                let found = Array.from(selEd.options).some(o => o.value === r.edificio);
                if (!found) {
                    const o = document.createElement('option');
                    o.value = r.edificio;
                    o.textContent = r.edificio;
                    selEd.appendChild(o);
                }
                selEd.value = r.edificio;
            }
        }

        // Autocompletar unidades (U)
        if (r.unidades) {
            const selUs = document.getElementById('rack-us');
            if (selUs) {
                const uVal = String(r.unidades);
                let found = Array.from(selUs.options).some(o => o.value === uVal);
                if (!found) {
                    const optU = document.createElement('option');
                    optU.value = uVal;
                    optU.textContent = `${uVal}U`;
                    selUs.appendChild(optU);
                }
                selUs.value = uVal;
            }
        }

        toast('Datos cargados desde Rack de SGR', 'info');
    } catch (_) {}
}

function onModalRackEdificioChange() {
    const selEd = document.getElementById('rack-edificio');
    const edificio = selEd ? selEd.value : '';
    poblarSelectorSGR(edificio);
}

function abrirNuevoRack() {
    _editandoRackId = null;
    _rackSgrId = null;
    document.getElementById('modal-rack-titulo').textContent = 'Nuevo Rack';
    document.getElementById('rack-nombre').value = '';
    document.getElementById('rack-desc').value = '';
    document.getElementById('rack-us').value = '24';
    document.getElementById('rack-eliminar-btn').classList.add('hidden');

    // Mostrar grupo de SGR y poblar selects
    document.getElementById('rack-sgr-group')?.classList.remove('hidden');
    GestorEdificios.poblarSelect('rack-edificio', '', false);
    poblarSelectorSGR('');

    MM.abrir('modal-rack');
    setTimeout(() => {
        const sgrSel = document.getElementById('rack-sgr-select');
        if (sgrSel && sgrSel.options.length > 1) {
            sgrSel.focus();
        } else {
            document.getElementById('rack-nombre')?.focus();
        }
    }, 150);
}

function abrirEditarRack(rackId) {
    const rack = state.racks.find(r => r.id === rackId);
    if (!rack) return;
    _editandoRackId = rackId;
    _rackSgrId = rack.sgrId || null;

    document.getElementById('modal-rack-titulo').textContent = 'Editar Rack';
    document.getElementById('rack-nombre').value = rack.nombre;
    document.getElementById('rack-desc').value = rack.desc || '';

    // Manejar unidades
    const selUs = document.getElementById('rack-us');
    if (selUs) {
        const uVal = String(rack.us);
        let found = Array.from(selUs.options).some(o => o.value === uVal);
        if (!found) {
            const optU = document.createElement('option');
            optU.value = uVal;
            optU.textContent = `${uVal}U`;
            selUs.appendChild(optU);
        }
        selUs.value = uVal;
    }

    // Poblar edificio
    GestorEdificios.poblarSelect('rack-edificio', rack.edificio || '', false);

    // En edición, ocultar selector de importación de SGR para evitar sobreescritura accidental
    document.getElementById('rack-sgr-group')?.classList.add('hidden');
    document.getElementById('rack-eliminar-btn').classList.remove('hidden');

    MM.abrir('modal-rack');
}

function guardarRack() {
    const nombre = document.getElementById('rack-nombre').value.trim();
    const desc = document.getElementById('rack-desc').value.trim();
    const us = Number(document.getElementById('rack-us').value);
    const edificio = document.getElementById('rack-edificio')?.value.trim() || '';

    if (!nombre) {
        document.getElementById('rack-nombre').classList.add('error');
        toast('Ingresá un nombre para el rack', 'error');
        return;
    }

    if (_editandoRackId) {
        historial.empujar(`Editar rack "${nombre}"`);
        const rack = state.racks.find(r => r.id === _editandoRackId);
        if (rack) {
            rack.nombre = nombre;
            rack.desc = desc;
            rack.us = us;
            rack.edificio = edificio;
            if (_rackSgrId) rack.sgrId = _rackSgrId;
        }
    } else {
        historial.empujar(`Agregar rack "${nombre}"`);
        state.racks.push({
            id: uid(),
            nombre,
            desc,
            us,
            edificio,
            sgrId: _rackSgrId || '',
            unidades: [],
            abierto: true
        });
    }

    if (edificio && Array.isArray(state.edificios) && !state.edificios.includes(edificio)) {
        state.edificios.push(edificio);
        state.edificios.sort((a, b) => a.localeCompare(b, 'es'));
    }

    guardar();
    MM.cerrar('modal-rack');
    actualizarFiltrosYSelects();
    renderRacks();
    toast(_editandoRackId ? 'Rack actualizado' : 'Rack creado');
}

function eliminarRack() {
    if (!_editandoRackId) return;
    const rack = state.racks.find(r => r.id === _editandoRackId);
    if (!rack) return;
    confirmar(
        `¿Eliminar rack "${rack.nombre}"?`,
        'Se eliminarán también todas sus patcheras y datos de puertos asociados. Esta acción se puede deshacer con Ctrl+Z.',
        () => {
            historial.empujar(`Eliminar rack "${rack.nombre}"`);
            state.racks = state.racks.filter(r => r.id !== _editandoRackId);
            _editandoRackId = null;
            guardar();
            MM.cerrar('modal-rack');
            actualizarFiltrosYSelects();
            renderRacks();
            toast('Rack eliminado', 'info');
        }
    );
}

// ══════════════════════════════════════════════════════════════
//  13. CRUD DE PATCHERAS
// ══════════════════════════════════════════════════════════════
let _editandoPatcheraRackId = null;
let _editandoPatcheraId = null;

function abrirNuevaPatchera(rackId) {
    _editandoPatcheraRackId = rackId;
    _editandoPatcheraId = null;
    document.getElementById('modal-patchera-titulo').textContent = 'Nueva Patchera';
    document.getElementById('patchera-nombre').value = '';
    document.getElementById('patchera-pos').value = '';
    document.getElementById('patchera-tipo').value = '24';
    document.getElementById('patchera-desc').value = '';
    document.getElementById('patchera-eliminar-btn').classList.add('hidden');
    MM.abrir('modal-patchera');
    setTimeout(() => document.getElementById('patchera-nombre').focus(), 150);
}

function abrirEditarPatchera(rackId, unidadId) {
    const rack = state.racks.find(r => r.id === rackId);
    if (!rack) return;
    const u = rack.unidades.find(x => x.id === unidadId);
    if (!u) return;
    _editandoPatcheraRackId = rackId;
    _editandoPatcheraId = unidadId;
    document.getElementById('modal-patchera-titulo').textContent = 'Editar Patchera';
    document.getElementById('patchera-nombre').value = u.nombre || '';
    document.getElementById('patchera-pos').value = u.pos;
    document.getElementById('patchera-tipo').value = String(u.tipo);
    document.getElementById('patchera-desc').value = u.desc || '';
    document.getElementById('patchera-eliminar-btn').classList.remove('hidden');
    MM.abrir('modal-patchera');
}

function guardarPatchera() {
    const nombre = document.getElementById('patchera-nombre').value.trim();
    const pos = Number(document.getElementById('patchera-pos').value);
    const tipoVal = document.getElementById('patchera-tipo').value;
    const tipo = (tipoVal === 'fibra-v' || tipoVal === 'fibra-h') ? tipoVal : Number(tipoVal);
    const desc = document.getElementById('patchera-desc').value.trim();

    if (!nombre) {
        document.getElementById('patchera-nombre').classList.add('error');
        toast('Ingresá un nombre para la patchera', 'error');
        return;
    }

    const rack = state.racks.find(r => r.id === _editandoPatcheraRackId);
    if (!rack) return;

    if (_editandoPatcheraId) {
        historial.empujar(`Editar patchera "${nombre}"`);
        const u = rack.unidades.find(x => x.id === _editandoPatcheraId);
        if (u) {
            u.nombre = nombre;
            u.pos = pos || 1;
            u.tipo = tipo;
            u.desc = desc;
        }
    } else {
        historial.empujar(`Agregar patchera "${nombre}" en rack "${rack.nombre}"`);
        rack.unidades.push({ id: uid(), nombre, tipo, pos: pos || 1, desc, puertos: [] });
        rack.abierto = true;
    }
    guardar();
    MM.cerrar('modal-patchera');
    renderRacks();
    toast(_editandoPatcheraId ? 'Patchera actualizada' : 'Patchera agregada');
}

function eliminarPatchera() {
    if (!_editandoPatcheraId || !_editandoPatcheraRackId) return;
    const rack = state.racks.find(r => r.id === _editandoPatcheraRackId);
    const u = rack?.unidades.find(x => x.id === _editandoPatcheraId);
    if (!u) return;
    confirmar(
        `¿Eliminar patchera "${u.nombre || 'sin nombre'}"?`,
        'Se eliminarán todos sus datos de puertos asignados. Esta acción se puede deshacer con Ctrl+Z.',
        () => {
            historial.empujar(`Eliminar patchera "${u.nombre || 'sin nombre'}"`);
            rack.unidades = rack.unidades.filter(x => x.id !== _editandoPatcheraId);
            guardar();
            MM.cerrar('modal-patchera');
            renderRacks();
            toast('Patchera eliminada', 'info');
        }
    );
}

// ══════════════════════════════════════════════════════════════
//  14. CRUD DE JACKS (PUERTOS)
// ══════════════════════════════════════════════════════════════
let _editandoJackRackId = null;
let _editandoJackUnidadId = null;
let _editandoJackNum = null;

function abrirEditarJack(rackId, unidadId, num) {
    const rack = state.racks.find(r => r.id === rackId);
    const u = rack?.unidades.find(x => x.id === unidadId);
    if (!u) return;

    _editandoJackRackId = rackId;
    _editandoJackUnidadId = unidadId;
    _editandoJackNum = num;

    const puerto = u.puertos.find(p => p.num === num);
    const nombreUnidad = u.nombre || `Patchera ${u.pos}U`;

    document.getElementById('modal-jack-titulo').textContent = `${nombreUnidad} — Puerto ${num}`;
    document.getElementById('jack-label').value = puerto?.label || '';
    document.getElementById('jack-notas').value = puerto?.notas || '';

    // Color swatches
    const color = puerto?.color || '';
    document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === color);
    });

    MM.abrir('modal-jack');
    setTimeout(() => document.getElementById('jack-label').focus(), 150);
}

function _actualizarStatsRackCard(rack) {
    const totalPuertos = rack.unidades.reduce((s, u) => s + (typeof u.tipo === 'number' ? u.tipo : 24), 0);
    const usados = rack.unidades.reduce((s, u) => s + u.puertos.filter(p => p.label).length, 0);
    const pct = totalPuertos ? Math.round((usados / totalPuertos) * 100) : 0;
    const occBadge = document.getElementById(`rocc-${rack.id}`);
    if (occBadge) {
        occBadge.className = `badge ${pct > 80 ? 'badge-orange' : 'badge-blue'}`;
        occBadge.textContent = `${pct}% ocupado`;
    }
    renderEstado();
}

function _actualizarUnidadDOM(rack, u) {
    const el = document.getElementById(`unit-${u.id}`);
    if (el) {
        el.outerHTML = renderPatchera(u, rack.id);
    } else {
        renderRacks();
        return;
    }
    _actualizarStatsRackCard(rack);
}

function guardarJack() {
    const rack = state.racks.find(r => r.id === _editandoJackRackId);
    const u = rack?.unidades.find(x => x.id === _editandoJackUnidadId);
    if (!u) return;

    const label = document.getElementById('jack-label').value.trim().slice(0, 80);
    const notas = document.getElementById('jack-notas').value.trim().slice(0, 100);
    const color = document.querySelector('.color-swatch.active')?.dataset.color || '';

    historial.empujar(`Editar puerto ${_editandoJackNum}`);

    u.puertos = u.puertos.filter(p => p.num !== _editandoJackNum);
    if (label || notas || color) {
        u.puertos.push({ num: _editandoJackNum, label, notas, color });
    }

    guardar();
    MM.cerrar('modal-jack');
    _actualizarUnidadDOM(rack, u);
    toast(label ? 'Puerto actualizado' : 'Puerto liberado', label ? 'success' : 'info');
}

function limpiarJack() {
    const rack = state.racks.find(r => r.id === _editandoJackRackId);
    const u = rack?.unidades.find(x => x.id === _editandoJackUnidadId);
    if (!u) return;
    historial.empujar(`Limpiar puerto ${_editandoJackNum}`);
    u.puertos = u.puertos.filter(p => p.num !== _editandoJackNum);
    guardar();
    MM.cerrar('modal-jack');
    _actualizarUnidadDOM(rack, u);
    toast('Puerto liberado', 'info');
}

// ══════════════════════════════════════════════════════════════
//  15. EXPORTAR / IMPORTAR
// ══════════════════════════════════════════════════════════════
async function exportarDatos() {
    const firma = await generarFirma(state);
    const data = { ...state, _firma: firma };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
    a.download = `patcheras_${fecha}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Datos exportados exitosamente');
}

let _importarParsed = null;

function _setImportLabel(label, { tipo, titulo, sub, warn }) {
    label.textContent = '';
    const strong = document.createElement('strong');
    strong.className = tipo === 'ok' ? 'import-ok' : 'import-fail';
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
        const spanW = document.createElement('span');
        spanW.className = 'import-sub import-warn';
        spanW.textContent = warn;
        label.appendChild(document.createElement('br'));
        label.appendChild(spanW);
    }
}

function onImportarFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const label = document.getElementById('importar-dropzone-label');
    const zone = document.getElementById('importar-dropzone');
    const btn = document.getElementById('importar-confirmar-btn');
    const btnC = document.getElementById('importar-combinar-btn');

    if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
        _importarParsed = null;
        _setImportLabel(label, { tipo: 'fail', titulo: '✗ Archivo demasiado grande', sub: `Máximo permitido: ${MAX_IMPORT_MB} MB` });
        zone.classList.remove('dropzone-ok', 'dropzone-warn');
        zone.classList.add('dropzone-error');
        btn.disabled = true;
        btnC.disabled = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = async ev => {
        try {
            const raw = parseSeguro(ev.target.result);
            const esValida = await verificarFirma(raw);
            const parsed = sanitizarEstado(raw);
            if (!parsed) throw new Error('Formato de datos no compatible');
            _importarParsed = { ...parsed, _firmaValida: esValida };
            const sub = `${parsed.racks.length} rack(s) detectados`;
            if (esValida) {
                _setImportLabel(label, { tipo: 'ok', titulo: `✓ ${file.name}`, sub });
                zone.classList.remove('dropzone-error', 'dropzone-warn');
                zone.classList.add('dropzone-ok');
            } else {
                _setImportLabel(label, { tipo: 'warn', titulo: '⚠️ Archivo modificado externamente', sub });
                zone.classList.remove('dropzone-ok', 'dropzone-error');
                zone.classList.add('dropzone-warn');
            }
            btn.disabled = false;
            btnC.disabled = false;
        } catch (_) {
            _importarParsed = null;
            _setImportLabel(label, { tipo: 'fail', titulo: '✗ Archivo inválido', sub: 'El archivo no contiene un respaldo válido de patcheras.' });
            zone.classList.remove('dropzone-ok', 'dropzone-warn');
            zone.classList.add('dropzone-error');
            btn.disabled = true;
            btnC.disabled = true;
        }
    };
    reader.readAsText(file);
}

function importarDatos(modo) {
    if (!_importarParsed) {
        toast('Seleccioná un archivo válido', 'error');
        return;
    }
    const parsed = _importarParsed;
    const alerta = parsed._firmaValida ? '' : '⚠️ ATENCIÓN: El archivo fue alterado externamente o carece de firma digital válida.\n\n';

    if (modo === 'reemplazar') {
        confirmar(
            '¿Importar y reemplazar?',
            alerta + 'Todos los racks, patcheras y edificios actuales serán reemplazados por el contenido del archivo.',
            () => {
                historial.empujar('Importar y reemplazar datos');
                state.racks = parsed.racks || [];
                if (Array.isArray(parsed.edificios)) {
                    state.edificios = parsed.edificios;
                }
                guardar();
                MM.cerrar('modal-importar');
                actualizarFiltrosYSelects();
                renderRacks();
                toast(`Datos reemplazados (${(parsed.racks || []).length} racks)`);
            }
        );
    } else {
        confirmar(
            '¿Combinar datos?',
            alerta + 'Se incorporarán los racks y edificios del archivo que no existan actualmente en este dispositivo.',
            () => {
                historial.empujar('Combinar datos importados');
                const ids = new Set(state.racks.map(r => r.id));
                let nuevos = 0;
                (parsed.racks || []).forEach(r => {
                    if (!ids.has(r.id)) {
                        state.racks.push(r);
                        nuevos++;
                    }
                });
                if (Array.isArray(parsed.edificios)) {
                    if (!Array.isArray(state.edificios)) state.edificios = [];
                    parsed.edificios.forEach(e => {
                        if (!state.edificios.includes(e)) state.edificios.push(e);
                    });
                }
                guardar();
                MM.cerrar('modal-importar');
                actualizarFiltrosYSelects();
                renderRacks();
                toast(nuevos > 0 ? `Combinados (+${nuevos} racks)` : 'Sin racks nuevos para agregar', nuevos > 0 ? 'success' : 'info');
            }
        );
    }
}

function restablecerDatos() {
    confirmar(
        '¿Restablecer todos los datos?',
        'Se eliminarán todos los racks, patcheras y edificios de la memoria local. Esta acción se puede revertir con Ctrl+Z antes de recargar.',
        () => {
            historial.empujar('Restablecer todos los datos');
            state.racks = [];
            state.edificios = [];
            GistSync.desactivarAuto();
            guardar();
            actualizarFiltrosYSelects();
            renderRacks();
            toast('Datos restablecidos');
        }
    );
}

// ══════════════════════════════════════════════════════════════
//  15b. IMPORTADOR DE PLANILLAS DE PATCHERAS (EXCEL / CSV / PEGAR)
// ══════════════════════════════════════════════════════════════
let _planillaParsed = null;

function abrirModalImportarPlanilla() {
    _planillaParsed = null;

    // Resetear formulario
    const inputArchivo = document.getElementById('input-archivo-planilla');
    if (inputArchivo) inputArchivo.value = '';
    const textarea = document.getElementById('textarea-pegar-planilla');
    if (textarea) textarea.value = '';

    const labelDrop = document.getElementById('label-dropzone-planilla');
    if (labelDrop) {
        labelDrop.innerHTML = `
            <span class="dropzone-icon">📊</span>
            <strong>Seleccioná o arrastrá tu archivo Excel (.xlsx) o CSV</strong>
            <span class="dropzone-sub">Detecta automáticamente el rack, patcheras A..G, bocas y servicios</span>
        `;
    }

    // Ocultar selector de hojas hasta que se cargue un archivo con múltiples hojas
    const groupHoja = document.getElementById('group-hoja-select');
    if (groupHoja) groupHoja.style.display = 'none';

    // Pestaña por defecto: archivo
    document.querySelectorAll('.importar-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'archivo');
    });
    document.querySelectorAll('.importar-tab-content').forEach(tab => {
        tab.classList.toggle('active', tab.id === 'tab-content-archivo');
    });

    // Ocultar preview
    const previewContainer = document.getElementById('importar-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');

    const btnConfirmar = document.getElementById('importar-planilla-confirmar-btn');
    if (btnConfirmar) btnConfirmar.disabled = true;

    // Poblar selector de destino
    const selectDestino = document.getElementById('importar-destino-select');
    if (selectDestino) {
        selectDestino.innerHTML = '<option value="nuevo">Crear como Nuevo Rack</option>';
        state.racks.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = `Agregar a: ${r.nombre} (${r.unidades.length} patcheras)`;
            selectDestino.appendChild(opt);
        });
    }

    MM.abrir('modal-importar-planilla');
}

async function procesarPlanillaEntrada(entrada) {
    try {
        toast('Analizando planilla...', 'info');
        const parsed = await PlanillaParser.procesarEntrada(entrada);
        _planillaParsed = parsed;
        _planillaParsed.seleccionHoja = '0';

        const groupHoja = document.getElementById('group-hoja-select');
        const selectHoja = document.getElementById('importar-hoja-select');

        if (parsed.todosRacks && parsed.todosRacks.length > 1) {
            if (groupHoja) groupHoja.style.display = 'block';
            if (selectHoja) {
                let optionsHtml = parsed.todosRacks.map((r, idx) => 
                    `<option value="${idx}">${esc(r.sheetName)}: ${esc(r.rackNombre)} (${r.patcheras.length} patcheras)</option>`
                ).join('');
                optionsHtml += `<option value="all">⭐ Todas las hojas (${parsed.todosRacks.length} racks)</option>`;
                selectHoja.innerHTML = optionsHtml;
                selectHoja.value = '0';
            }
        } else {
            if (groupHoja) groupHoja.style.display = 'none';
        }

        mostrarPreviewPlanilla(parsed);
        const totalP = parsed.todosRacks && parsed.todosRacks.length > 1
            ? parsed.todosRacks.reduce((s, r) => s + r.patcheras.length, 0)
            : parsed.patcheras.length;
        toast(`Planilla procesada: ${totalP} patcheras detectadas`, 'success');
    } catch (err) {
        _planillaParsed = null;
        console.error('Error parseando planilla:', err);
        toast(err.message || 'Error al procesar la planilla', 'error');

        const btnConfirmar = document.getElementById('importar-planilla-confirmar-btn');
        if (btnConfirmar) btnConfirmar.disabled = true;
        const previewContainer = document.getElementById('importar-preview-container');
        if (previewContainer) previewContainer.classList.add('hidden');
    }
}

function _obtenerRackSeleccionado(parsed) {
    if (!parsed) return null;
    if (!parsed.todosRacks || parsed.todosRacks.length <= 1) {
        return {
            rackNombre: parsed.rackNombre,
            rackFecha: parsed.rackFecha,
            patcheras: parsed.patcheras || [],
            esMultiples: false
        };
    }
    const sel = parsed.seleccionHoja ?? '0';
    if (sel === 'all') {
        return {
            rackNombre: `Múltiples Racks (${parsed.todosRacks.length})`,
            rackFecha: parsed.rackFecha,
            todos: parsed.todosRacks,
            patcheras: parsed.todosRacks.flatMap(r => r.patcheras),
            esMultiples: true
        };
    }
    const idx = parseInt(sel, 10) || 0;
    const rack = parsed.todosRacks[idx] || parsed.todosRacks[0];
    return {
        rackNombre: rack.rackNombre,
        rackFecha: rack.rackFecha,
        sheetName: rack.sheetName,
        patcheras: rack.patcheras || [],
        esMultiples: false
    };
}

function _renderPreviewPatcheraItem(p) {
    const chipsHtml = p.puertos.length
        ? p.puertos.map(pt => `
            <span class="preview-port-chip chip-${esc(pt.color || 'blue')}" title="${esc(pt.label)} (${esc(pt.notas || '')})">
                <strong>B${pt.num}:</strong> ${esc(pt.label)}
            </span>`).join('')
        : '<span class="empty-text-sm">Sin bocas en uso (panel libre)</span>';

    return `
    <div class="preview-patchera-item">
        <div class="preview-patchera-header">
            <span class="preview-patchera-name">${esc(p.nombre)}</span>
            <span class="preview-patchera-meta">${p.tipo === 'fibra-v' ? '24p Fibra Vert.' : p.tipo === 'fibra-h' ? '24p Fibra Horiz.' : p.tipo + ' bocas'} · ${p.puertos.length} activas</span>
        </div>
        <div class="preview-ports-chips">${chipsHtml}</div>
    </div>`;
}

function mostrarPreviewPlanilla(parsed) {
    const previewContainer = document.getElementById('importar-preview-container');
    const inputRackNombre = document.getElementById('importar-rack-nombre');
    const badgePatcheras = document.getElementById('preview-badge-patcheras');
    const badgePuertos = document.getElementById('preview-badge-puertos');
    const listPatcheras = document.getElementById('importar-patcheras-preview-list');
    const btnConfirmar = document.getElementById('importar-planilla-confirmar-btn');

    if (!previewContainer) return;

    const data = _obtenerRackSeleccionado(parsed);
    if (!data) return;

    if (inputRackNombre) {
        if (data.esMultiples) {
            inputRackNombre.value = 'Múltiples racks (creación individual)';
            inputRackNombre.disabled = true;
        } else {
            inputRackNombre.value = data.rackNombre || 'Rack Relevamiento';
            inputRackNombre.disabled = false;
        }
    }

    const totalPuertosUsados = data.patcheras.reduce((sum, p) => sum + p.puertos.length, 0);

    if (badgePatcheras) {
        badgePatcheras.textContent = `${data.patcheras.length} patchera${data.patcheras.length !== 1 ? 's' : ''}`;
    }
    if (badgePuertos) {
        badgePuertos.textContent = `${totalPuertosUsados} bocas rotuladas`;
    }

    if (listPatcheras) {
        if (data.esMultiples && data.todos) {
            listPatcheras.innerHTML = data.todos.map(r => `
                <div class="preview-rack-group-header">
                    📁 Hoja "${esc(r.sheetName)}": ${esc(r.rackNombre)} (${r.patcheras.length} patcheras)
                </div>
                ${r.patcheras.map(p => _renderPreviewPatcheraItem(p)).join('')}
            `).join('');
        } else {
            listPatcheras.innerHTML = data.patcheras.map(p => _renderPreviewPatcheraItem(p)).join('');
        }
    }

    previewContainer.classList.remove('hidden');
    if (btnConfirmar) btnConfirmar.disabled = false;
}

function confirmarImportarPlanilla() {
    if (!_planillaParsed) {
        toast('No hay datos válidos para importar', 'error');
        return;
    }

    const data = _obtenerRackSeleccionado(_planillaParsed);
    if (!data || !data.patcheras || !data.patcheras.length) {
        toast('No hay patcheras válidas para importar', 'error');
        return;
    }

    const inputRackNombre = document.getElementById('importar-rack-nombre');
    const selectDestino = document.getElementById('importar-destino-select');
    const destino = selectDestino?.value || 'nuevo';

    if (data.esMultiples && destino === 'nuevo') {
        // Importar todas las hojas como racks independientes
        historial.empujar(`Importar ${data.todos.length} racks desde planilla`);
        let totalUnidades = 0;
        data.todos.forEach(r => {
            const nuevoRack = {
                id: uid(),
                nombre: r.rackNombre,
                edificio: '',
                sgrId: '',
                us: Math.max(24, Math.ceil(r.patcheras.length * 1.5)),
                desc: r.rackFecha ? `Relevamiento ${esc(r.rackFecha)}` : `Importado de hoja "${esc(r.sheetName)}"`,
                unidades: r.patcheras.map((p, idx) => ({
                    id: uid(),
                    tipo: p.tipo,
                    nombre: p.nombre,
                    pos: idx + 1,
                    desc: p.desc || '',
                    puertos: p.puertos.map(pt => ({
                        num: pt.num,
                        label: pt.label || '',
                        notas: pt.notas || '',
                        color: pt.color || ''
                    }))
                })),
                abierto: true
            };
            totalUnidades += nuevoRack.unidades.length;
            state.racks.push(nuevoRack);
        });

        guardar();
        MM.cerrar('modal-importar-planilla');
        actualizarFiltrosYSelects();
        renderRacks();
        toast(`Se importaron ${data.todos.length} racks con éxito (+${totalUnidades} patcheras)`, 'success');
        return;
    }

    const rackNombre = (!data.esMultiples && inputRackNombre?.value.trim()) || data.rackNombre || 'Rack Importado';

    if (destino === 'nuevo') {
        const nuevoRack = {
            id: uid(),
            nombre: rackNombre,
            edificio: '',
            sgrId: '',
            us: Math.max(24, Math.ceil(data.patcheras.length * 1.5)),
            desc: data.rackFecha ? `Relevamiento ${esc(data.rackFecha)}` : 'Importado desde planilla',
            unidades: data.patcheras.map((p, idx) => ({
                id: uid(),
                tipo: p.tipo,
                nombre: p.nombre,
                pos: idx + 1,
                desc: p.desc || '',
                puertos: p.puertos.map(pt => ({
                    num: pt.num,
                    label: pt.label || '',
                    notas: pt.notas || '',
                    color: pt.color || ''
                }))
            })),
            abierto: true
        };

        historial.empujar(`Importar planilla en rack "${rackNombre}"`);
        state.racks.push(nuevoRack);
        guardar();
        MM.cerrar('modal-importar-planilla');
        actualizarFiltrosYSelects();
        renderRacks();
        toast(`Rack "${rackNombre}" importado con éxito (+${nuevoRack.unidades.length} patcheras)`, 'success');
    } else {
        const rack = state.racks.find(r => r.id === destino);
        if (!rack) {
            toast('Rack de destino no encontrado', 'error');
            return;
        }

        historial.empujar(`Agregar patcheras importadas a "${rack.nombre}"`);
        const inicioPos = rack.unidades.length;
        data.patcheras.forEach((p, idx) => {
            rack.unidades.push({
                id: uid(),
                tipo: p.tipo,
                nombre: p.nombre,
                pos: inicioPos + idx + 1,
                desc: p.desc || '',
                puertos: p.puertos.map(pt => ({
                    num: pt.num,
                    label: pt.label || '',
                    notas: pt.notas || '',
                    color: pt.color || ''
                }))
            });
        });
        rack.abierto = true;
        guardar();
        MM.cerrar('modal-importar-planilla');
        renderRacks();
        toast(`Se agregaron ${data.patcheras.length} patcheras a "${rack.nombre}"`, 'success');
    }
}

// ══════════════════════════════════════════════════════════════
//  16. GIST SYNC (GITHUB GIST SYNCHRONIZATION)
// ══════════════════════════════════════════════════════════════
const GistSync = (() => {
    const CFG_KEY = APP_KEY + 'gist_cfg';
    const DEBOUNCE_MS = 3000;
    let _cfg = { token: '', gistId: '', lastSync: null, auto: false };
    let _debounceTimer = null;
    let _subiendo = false;
    let _maxRacksVistos = 0;
    let _alertaBorradoMostrada = false;

    function _cargarCfg() {
        try {
            const c = parseSeguro(localStorage.getItem(CFG_KEY) || 'null');
            if (c) _cfg = { ..._cfg, ...c };
        } catch (_) {}
        _actualizarBotonesAjustes();
    }

    function _guardarCfg() {
        try {
            localStorage.setItem(CFG_KEY, JSON.stringify(_cfg));
        } catch (_) {}
    }

    function _spinStart() {
        document.getElementById('btn-ajustes')?.classList.add('icon-btn-spinning');
    }

    function _spinStop() {
        document.getElementById('btn-ajustes')?.classList.remove('icon-btn-spinning');
    }

    function _setBusy(busy) {
        _subiendo = busy;
        ['btn-gist-subir', 'btn-gist-bajar'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.disabled = busy;
        });
        if (busy) _spinStart();
        else _spinStop();
    }

    function _setStatus(msg) {
        const el = document.getElementById('gist-sync-status');
        if (el) el.textContent = msg;
    }

    function _setStatusSync() {
        if (!_cfg.lastSync) return;
        const d = new Date(_cfg.lastSync);
        _setStatus(
            `Sincronizado: ${d.toLocaleDateString('es-AR')}, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
        );
    }

    function _actualizarLinkBtn() {
        const id = document.getElementById('gist-id')?.value.trim() || _cfg.gistId;
        const btn = document.getElementById('gist-link-btn');
        if (!btn) return;
        btn.classList.toggle('hidden', !id);
        if (id) {
            btn.href = `https://gist.github.com/${id}`;
        }
    }

    function _actualizarToggleUI() {
        const t = document.getElementById('gist-autosync-toggle');
        if (t) t.classList.toggle('on', !!_cfg.auto);
    }

    function _actualizarBotonesAjustes() {
        const tieneToken = !!(_cfg.token || '').trim();
        const tieneId = !!(_cfg.gistId || '').trim();
        const bU = document.getElementById('btn-ajustes-gist-subir');
        const bD = document.getElementById('btn-ajustes-gist-bajar');
        if (bU) bU.classList.toggle('gist-quick-hidden', !(tieneToken && tieneId));
        if (bD) bD.classList.toggle('gist-quick-hidden', !tieneId);
    }

    function toggleToken() {
        const inp = document.getElementById('gist-token');
        const icon = document.getElementById('gist-eye-icon');
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        if (icon) icon.className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
    }

    function toggleAuto() {
        const t = document.getElementById('gist-autosync-toggle');
        if (t) t.classList.toggle('on');
    }

    function guardarConfig() {
        const tokenEl = document.getElementById('gist-token');
        const idEl = document.getElementById('gist-id');
        const toggleEl = document.getElementById('gist-autosync-toggle');
        const nuevoToken = tokenEl?.value.trim() || '';
        const nuevoId = idEl?.value.trim() || '';
        const nuevoAuto = toggleEl ? toggleEl.classList.contains('on') : false;

        if (nuevoId && !RE_GIST_ID.test(nuevoId)) {
            toast('Gist ID con formato inválido', 'error');
            idEl?.classList.add('error');
            return;
        }

        _cfg.token = nuevoToken;
        _cfg.gistId = nuevoId;
        _cfg.auto = nuevoAuto;
        _guardarCfg();
        _actualizarBotonesAjustes();
        toast('Configuración de Gist guardada');
        MM.cerrar('modal-gist');
    }

    async function _ejecutarSubida(silencioso = false) {
        const token = _cfg.token;
        const gistId = _cfg.gistId;

        if (!token) {
            if (!silencioso) toast('Ingresá el token de GitHub primero', 'error');
            return;
        }
        if (gistId && !RE_GIST_ID.test(gistId)) {
            if (!silencioso) toast('Gist ID inválido', 'error');
            return;
        }

        _setBusy(true);
        if (!silencioso) _setStatus('Subiendo a GitHub…');

        try {
            const firma = await generarFirma(state);
            const exportData = { ...state, _firma: firma };
            const payload = JSON.stringify(exportData, null, 2);
            const body = { files: { [FILENAME]: { content: payload } } };

            let res;
            if (gistId) {
                res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
            } else {
                body.description = 'Patcheras — Documentación de Bocas de Red';
                body.public = false;
                res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        Authorization: `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!gistId && data.id) {
                _cfg.gistId = data.id;
                const idEl = document.getElementById('gist-id');
                if (idEl) idEl.value = data.id;
                _actualizarLinkBtn();
            }

            _cfg.lastSync = new Date().toISOString();
            _guardarCfg();
            _setStatusSync();
            _maxRacksVistos = state.racks.length;
            _alertaBorradoMostrada = false;

            if (!silencioso) toast('Datos subidos a Gist exitosamente');
        } catch (err) {
            _setStatus(`Error: ${err.message}`);
            if (!silencioso) toast(`Error al subir: ${err.message}`, 'error');
        } finally {
            _setBusy(false);
        }
    }

    function subir() {
        _ejecutarSubida(false);
    }

    function subirAuto() {
        if (!_cfg.auto || !_cfg.token) return;

        if (state.racks.length > _maxRacksVistos) {
            _maxRacksVistos = state.racks.length;
        }

        // Guardia anti-vaciado / borrado masivo
        const umbralSeguro = Math.floor(_maxRacksVistos * 0.5);
        if (state.racks.length === 0 || (state.racks.length < umbralSeguro && _maxRacksVistos > 4)) {
            if (!_alertaBorradoMostrada) {
                toast('Sync auto pausada: se detectó una reducción masiva de racks', 'warning');
                _alertaBorradoMostrada = true;
            }
            _setStatus('Pausada por seguridad (reducción de datos)');
            return;
        } else {
            _alertaBorradoMostrada = false;
        }

        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => {
            if (!_subiendo) _ejecutarSubida(true);
        }, DEBOUNCE_MS);
    }

    function desactivarAuto() {
        if (!_cfg.auto) return;
        _cfg.auto = false;
        _guardarCfg();
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
        document.getElementById('gist-autosync-toggle')?.classList.remove('on');
    }

    async function bajar() {
        const token = document.getElementById('gist-token')?.value.trim() || _cfg.token;
        const gistId = document.getElementById('gist-id')?.value.trim() || _cfg.gistId;

        if (!gistId) {
            toast('Ingresá el Gist ID primero', 'error');
            return;
        }
        if (!RE_GIST_ID.test(gistId)) {
            toast('Gist ID inválido', 'error');
            return;
        }

        _setBusy(true);
        _setStatus('Bajando desde GitHub…');

        try {
            const headers = {};
            if (token) headers['Authorization'] = `token ${token}`;

            const url = `https://api.github.com/gists/${gistId}?_ts=${Date.now()}`;
            const res = await fetch(url, { headers, cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const file = data.files?.[FILENAME];
            if (!file) throw new Error(`No se encontró el archivo "${FILENAME}" en el Gist`);

            let contenido = file.content;
            if (file.truncated) {
                const rawOrigin = new URL(file.raw_url).hostname;
                if (!rawOrigin.endsWith('.githubusercontent.com')) {
                    throw new Error('Dominio raw_url inválido o no seguro');
                }
                const r2 = await fetch(file.raw_url);
                contenido = await r2.text();
            }

            const rawRemoto = parseSeguro(contenido);
            const esValida = await verificarFirma(rawRemoto);
            const remoto = sanitizarEstado(rawRemoto);
            if (!remoto) throw new Error('El archivo descargado no tiene formato de patcheras válido');

            const procesarBajada = () => {
                _setBusy(true);
                historial.empujar(esValida ? 'Bajar desde Gist' : 'Bajar desde Gist (Forzado)');

                const ids = new Set(state.racks.map(r => r.id));
                let nuevos = 0;
                (remoto.racks || []).forEach(r => {
                    if (!ids.has(r.id)) {
                        state.racks.push(r);
                        nuevos++;
                    }
                });

                let nuevosEdificios = 0;
                if (typeof IDRInfra !== 'undefined' && Array.isArray(remoto.edificios)) {
                    const resEds = IDRInfra.combinarRemotos(remoto.edificios);
                    state.edificios = resEds.total;
                    nuevosEdificios = resEds.nuevos;
                }

                guardar();
                renderRacks();
                _cfg.token = token;
                _cfg.gistId = gistId;
                _cfg.lastSync = new Date().toISOString();
                _guardarCfg();
                _setStatusSync();
                toast(
                    esValida ? `Datos combinados (+${nuevos} racks)` : `Datos alterados combinados (+${nuevos} racks)`,
                    esValida ? 'success' : 'info'
                );
                _setBusy(false);
            };

            if (!esValida) {
                _setBusy(false);
                confirmar(
                    'Firma digital alterada en Gist',
                    'Los datos en GitHub fueron modificados fuera de la aplicación. ¿Querés combinarlos de todos modos?',
                    procesarBajada
                );
            } else {
                procesarBajada();
            }
        } catch (err) {
            _setStatus(`Error: ${err.message}`);
            toast(`Error al bajar: ${err.message}`, 'error');
            _setBusy(false);
        }
    }

    function poblarModal() {
        _cargarCfg();
        const tokenEl = document.getElementById('gist-token');
        const idEl = document.getElementById('gist-id');
        const eyeIcon = document.getElementById('gist-eye-icon');
        if (tokenEl) {
            tokenEl.value = _cfg.token || '';
            tokenEl.type = 'password';
        }
        if (idEl) idEl.value = _cfg.gistId || '';
        if (eyeIcon) eyeIcon.className = 'bi bi-eye';
        _actualizarLinkBtn();
        _actualizarToggleUI();
        if (_cfg.lastSync) _setStatusSync();
        else _setStatus('');
    }

    function init() {
        _cargarCfg();
        const idEl = document.getElementById('gist-id');
        if (idEl) idEl.addEventListener('input', _actualizarLinkBtn);
        _actualizarBotonesAjustes();
    }

    async function verificarAlAbrir() {
        if (!_cfg.auto || !_cfg.gistId) return;
        _spinStart();
        try {
            const headers = {};
            if (_cfg.token) headers['Authorization'] = `token ${_cfg.token}`;
            const url = `https://api.github.com/gists/${_cfg.gistId}?_ts=${Date.now()}`;
            const res = await fetch(url, { headers, cache: 'no-store' });
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

            const rawRemoto = parseSeguro(contenido);
            const esValida = await verificarFirma(rawRemoto);
            const remoto = sanitizarEstado(rawRemoto);
            if (!remoto) return;

            const ids = new Set(state.racks.map(r => r.id));
            const nuevos = (remoto.racks || []).filter(r => !ids.has(r.id)).length;
            if (!nuevos) return;

            const desc = document.querySelector('.gist-novedades-desc');
            if (desc) {
                desc.innerHTML = esValida
                    ? 'Se encontraron racks nuevos en GitHub que no están presentes en este dispositivo:'
                    : 'Se encontraron datos en GitHub.<br><strong class="text-warn">⚠️ Los datos fueron modificados manualmente fuera de la app.</strong>';
            }

            const detalle = document.getElementById('gist-novedades-detalle');
            if (detalle) {
                detalle.innerHTML = `<div class="gist-novedades-badge">+${nuevos} rack(s) nuevos</div>`;
            }

            const btnOk = document.getElementById('gist-novedades-ok');
            if (btnOk) {
                btnOk.onclick = () => {
                    historial.empujar(esValida ? 'Bajar novedades desde Gist' : 'Bajar novedades (Forzado)');
                    const ids2 = new Set(state.racks.map(r => r.id));
                    (remoto.racks || []).forEach(r => {
                        if (!ids2.has(r.id)) state.racks.push(r);
                    });
                    guardar();
                    renderRacks();
                    MM.cerrar('modal-gist-novedades');
                    toast(
                        esValida ? `Datos combinados (+${nuevos} racks)` : `Datos alterados combinados (+${nuevos} racks)`,
                        esValida ? 'success' : 'info'
                    );
                };
            }

            setTimeout(() => MM.abrir('modal-gist-novedades'), 600);
        } catch (_) {}
        finally {
            _spinStop();
        }
    }

    return {
        subir,
        bajar,
        subirAuto,
        desactivarAuto,
        verificarAlAbrir,
        toggleToken,
        toggleAuto,
        guardarConfig,
        poblarModal,
        init,
        actualizarBotonesAjustes: _actualizarBotonesAjustes
    };
})();

// ══════════════════════════════════════════════════════════════
//  16b. ESTADO (resumen por edificio) Y PESTAÑAS
// ══════════════════════════════════════════════════════════════
const _el = (tag, clase, texto) => {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
};

/** Puertos de un rack: total (24, 48...) y los que tienen un servicio (etiqueta). */
function _puertosDe(rack) {
    let total = 0, usados = 0;
    for (const u of rack.unidades) {
        total += typeof u.tipo === 'number' ? u.tipo : 24;
        usados += u.puertos.filter(p => p.label).length;
    }
    return { total, usados };
}

/** Totales por edificio (los racks sin edificio van a «Sin edificio»), en orden alfabético y «Sin edificio» al final. */
function resumenPorEdificio(racks) {
    const mapa = new Map();
    for (const r of racks) {
        const clave = (r.edificio || '').trim();
        if (!mapa.has(clave)) mapa.set(clave, { edificio: clave, racks: 0, patcheras: 0, puertos: 0, usados: 0 });
        const f = mapa.get(clave);
        const { total, usados } = _puertosDe(r);
        f.racks += 1; f.patcheras += r.unidades.length; f.puertos += total; f.usados += usados;
    }
    return [...mapa.values()].sort((a, b) => (a.edificio === '') - (b.edificio === '') || a.edificio.localeCompare(b.edificio, 'es'));
}

function renderEstado() {
    const chips = document.getElementById('estado-chips');
    const cont = document.getElementById('estado-edificios');
    if (!chips || !cont) return;
    const filas = resumenPorEdificio(state.racks);
    const tot = filas.reduce((a, f) => ({ racks: a.racks + f.racks, patcheras: a.patcheras + f.patcheras, puertos: a.puertos + f.puertos, usados: a.usados + f.usados }),
        { racks: 0, patcheras: 0, puertos: 0, usados: 0 });
    const pct = (u, t) => (t ? Math.round((u / t) * 100) : 0);

    const chip = (etiqueta, valor, sub) => {
        const c = _el('div', 'stat-chip');
        c.append(_el('span', 'stat-chip-label', etiqueta), _el('span', 'stat-chip-value', valor), _el('span', 'stat-chip-sub', sub));
        return c;
    };
    chips.replaceChildren(
        chip('Racks', String(tot.racks), tot.racks === 1 ? 'registrado' : 'registrados'),
        chip('Patcheras', String(tot.patcheras), 'instaladas'),
        chip('Puertos', String(tot.usados), `con servicio de ${tot.puertos}`),
        chip('Ocupación', `${pct(tot.usados, tot.puertos)}%`, 'de las bocas'),
    );

    document.getElementById('estado-vacio')?.classList.toggle('empty-state-hidden', filas.length > 0);
    const cuenta = document.getElementById('estado-edificios-count');
    if (cuenta) cuenta.textContent = String(filas.length);
    if (!filas.length) { cont.replaceChildren(); return; }

    const tabla = _el('table', 'estado-tabla');
    const cab = _el('tr');
    ['Edificio', 'Racks', 'Patcheras', 'Puertos con servicio', 'Ocupación'].forEach((t, i) => {
        const th = _el('th', i >= 1 && i <= 3 ? 'num' : '', t);
        cab.appendChild(th);
    });
    tabla.appendChild(_el('thead')).appendChild(cab);
    const cuerpo = _el('tbody');
    for (const f of filas) {
        const tr = _el('tr', 'tr-clickable');
        tr.dataset.edificio = f.edificio;
        tr.title = f.edificio ? `Ver los racks de ${f.edificio}` : 'Ver los racks sin edificio';
        const porc = pct(f.usados, f.puertos);
        const ocup = _el('td');
        const wrap = _el('div', 'estado-ocupacion');
        const barra = _el('div', 'estado-barra');
        const relleno = _el('span', porc > 80 ? 'alta' : '');
        relleno.style.width = `${porc}%`;
        barra.appendChild(relleno);
        wrap.append(barra, _el('span', '', `${porc}%`));
        ocup.appendChild(wrap);
        tr.append(_el('td', '', f.edificio || 'Sin edificio'), _el('td', 'num', String(f.racks)), _el('td', 'num', String(f.patcheras)),
            _el('td', 'num', `${f.usados} / ${f.puertos}`), ocup);
        cuerpo.appendChild(tr);
    }
    tabla.appendChild(cuerpo);
    const wrapTabla = _el('div', 'table-wrap');
    wrapTabla.appendChild(tabla);
    cont.replaceChildren(wrapTabla);
}

let _tabActual = 'estado';
const TABS = ['estado', 'racks', 'ajustes'];

function switchTab(tab) {
    if (_tabActual === tab) return;
    const boton = document.getElementById(`tab-${tab}`);
    if (boton) UI.pestana.mostrar(boton);
}

// Cada cambio de pestaña (clic, flechas, swipe o switchTab): se recuerda
function _alMostrarPestana(e) {
    const tab = e.target && e.target.dataset ? e.target.dataset.tab : null;
    if (!tab || !TABS.includes(tab)) return;
    _tabActual = tab;
    try { localStorage.setItem(APP_KEY + 'tab', tab); } catch (_) { /* queda solo en esta página */ }
    window.scrollTo({ top: 0 });
}

// El buscador mira los racks: al escribir desde Estado o Ajustes pasa solo a Racks
let _busqTimer = null;
function onBusqGlobal() {
    const caja = document.getElementById('global-search');
    const val = caja ? caja.value : '';
    document.getElementById('sidebar-search-container')?.classList.toggle('search-active', !!val);
    if (val && _tabActual !== 'racks') switchTab('racks');
    if (_busqTimer) clearTimeout(_busqTimer);
    _busqTimer = setTimeout(renderRacks, 250);
}

function limpiarBusqueda() {
    if (_busqTimer) clearTimeout(_busqTimer);
    const caja = document.getElementById('global-search');
    if (caja) caja.value = '';
    document.getElementById('sidebar-search-container')?.classList.remove('search-active');
    caja?.dispatchEvent(new Event('input'));       // el ícono del buscador móvil deja de marcar texto
    renderRacks();
}

// ══════════════════════════════════════════════════════════════
//  17. INICIALIZACIÓN & EVENTOS
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    cargar();

    // ── Pestañas y buscador ──
    document.addEventListener('ui:pestana-mostrada', _alMostrarPestana);
    document.getElementById('global-search')?.addEventListener('input', onBusqGlobal);
    document.getElementById('search-clear')?.addEventListener('click', () => { limpiarBusqueda(); document.getElementById('global-search')?.focus(); });
    document.getElementById('global-search')?.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const caja = e.currentTarget;
            if (caja.value) limpiarBusqueda();
            caja.blur();
        }
    });
    // Resumen por edificio: un clic lleva a los racks de ese edificio
    document.getElementById('estado-edificios')?.addEventListener('click', e => {
        const fila = e.target.closest('tr[data-edificio]');
        if (!fila) return;
        _filtroEdificio = fila.dataset.edificio;
        const sel = document.getElementById('filtro-edificio-select');
        if (sel) sel.value = _filtroEdificio;
        renderRacks();
        switchTab('racks');
    });
    // Tocar fuera de un puerto esconde su tooltip (en pantallas táctiles)
    document.addEventListener('click', e => { if (!e.target.closest('.jack, .fiber-coupler, .patch-label-cell')) Tooltip.hide(true); });

    // ── Racks ──
    document.getElementById('btn-nuevo-rack')?.addEventListener('click', abrirNuevoRack);
    document.getElementById('btn-importar-planilla')?.addEventListener('click', abrirModalImportarPlanilla);
    document.getElementById('filtro-edificio-select')?.addEventListener('change', function () {
        _filtroEdificio = this.value;
        renderRacks();
    });
    document.getElementById('btn-undo')?.addEventListener('click', () => historial.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => historial.redo());

    // ── Modal Rack ──
    document.getElementById('rack-guardar-btn')?.addEventListener('click', guardarRack);
    document.getElementById('rack-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-rack'));
    document.getElementById('rack-eliminar-btn')?.addEventListener('click', eliminarRack);
    document.getElementById('rack-sgr-select')?.addEventListener('change', onRackSgrSelectChange);
    document.getElementById('rack-edificio')?.addEventListener('change', onModalRackEdificioChange);
    document.getElementById('rack-nombre')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); guardarRack(); }
    });

    // ── Modal Patchera ──
    document.getElementById('patchera-guardar-btn')?.addEventListener('click', guardarPatchera);
    document.getElementById('patchera-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-patchera'));
    document.getElementById('patchera-eliminar-btn')?.addEventListener('click', eliminarPatchera);
    document.getElementById('patchera-nombre')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); guardarPatchera(); }
    });

    // ── Modal Jack ──
    document.getElementById('jack-guardar-btn')?.addEventListener('click', guardarJack);
    document.getElementById('jack-limpiar-btn')?.addEventListener('click', limpiarJack);
    document.getElementById('jack-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-jack'));
    document.getElementById('jack-label')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); guardarJack(); }
    });
    document.getElementById('jack-color-swatches')?.addEventListener('click', e => {
        const sw = e.target.closest('.color-swatch');
        if (!sw) return;
        document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        sw.classList.add('active');
    });

    // ── Pestaña Ajustes ──
    document.getElementById('ajustes-nuevo-rack-btn')?.addEventListener('click', abrirNuevoRack);
    document.getElementById('ajustes-planilla-btn')?.addEventListener('click', abrirModalImportarPlanilla);
    document.getElementById('ajustes-edificios-btn')?.addEventListener('click', GestorEdificios.abrir);
    document.getElementById('ajustes-exportar-btn')?.addEventListener('click', exportarDatos);
    document.getElementById('ajustes-importar-btn')?.addEventListener('click', () => {
        document.getElementById('importar-file-input').value = '';
        document.getElementById('importar-dropzone-label').textContent = 'Seleccioná o arrastrá un archivo .json';
        document.getElementById('importar-dropzone').classList.remove('dropzone-ok', 'dropzone-warn', 'dropzone-error');
        document.getElementById('importar-confirmar-btn').disabled = true;
        document.getElementById('importar-combinar-btn').disabled = true;
        _importarParsed = null;
        MM.abrir('modal-importar');
    });
    document.getElementById('ajustes-restablecer-btn')?.addEventListener('click', restablecerDatos);
    document.getElementById('btn-abrir-gist')?.addEventListener('click', () => {
        GistSync.poblarModal();
        MM.abrir('modal-gist');
    });
    document.getElementById('btn-ajustes-gist-subir')?.addEventListener('click', () => GistSync.subir());
    document.getElementById('btn-ajustes-gist-bajar')?.addEventListener('click', () => GistSync.bajar());

    // ── Modal Edificios ──
    document.getElementById('edificios-cerrar-btn')?.addEventListener('click', GestorEdificios.cerrar);
    document.getElementById('edificios-agregar-btn')?.addEventListener('click', GestorEdificios.agregar);
    document.getElementById('btn-sync-edificios-sgr')?.addEventListener('click', GestorEdificios.sincronizarDesdeSGR);
    document.getElementById('edificios-nuevo-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); GestorEdificios.agregar(); }
    });
    document.getElementById('modal-edificios')?.addEventListener('ui:modal-cerrado', actualizarFiltrosYSelects);

    // ── Modal Gist ──
    document.getElementById('gist-cerrar-btn')?.addEventListener('click', () => MM.cerrar('modal-gist'));
    document.getElementById('gist-token-eye')?.addEventListener('click', () => GistSync.toggleToken());
    document.getElementById('btn-gist-subir')?.addEventListener('click', () => GistSync.subir());
    document.getElementById('btn-gist-bajar')?.addEventListener('click', () => GistSync.bajar());
    document.getElementById('gist-autosync-toggle')?.addEventListener('click', () => GistSync.toggleAuto());
    document.getElementById('gist-guardar-btn')?.addEventListener('click', () => GistSync.guardarConfig());
    document.getElementById('gist-novedades-ignorar-btn')?.addEventListener('click', () => MM.cerrar('modal-gist-novedades'));

    // ── Modal Importar respaldo ──
    document.getElementById('importar-dropzone')?.addEventListener('click', () => {
        document.getElementById('importar-file-input').click();
    });
    document.getElementById('importar-file-input')?.addEventListener('change', e => onImportarFileChange(e));
    document.getElementById('importar-confirmar-btn')?.addEventListener('click', () => importarDatos('reemplazar'));
    document.getElementById('importar-combinar-btn')?.addEventListener('click', () => importarDatos('combinar'));
    document.getElementById('importar-cerrar-btn')?.addEventListener('click', () => MM.cerrar('modal-importar'));
    const dz = document.getElementById('importar-dropzone');
    if (dz) {
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
        dz.addEventListener('drop', e => {
            e.preventDefault();
            dz.classList.remove('drag');
            const file = e.dataTransfer.files[0];
            if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                document.getElementById('importar-file-input').files = dt.files;
                onImportarFileChange({ target: { files: [file] } });
            }
        });
    }

    // ── Modal Importar Planilla (Excel / CSV / Pegar) ──
    document.getElementById('importar-planilla-cancelar-btn')?.addEventListener('click', () => MM.cerrar('modal-importar-planilla'));
    document.getElementById('importar-planilla-confirmar-btn')?.addEventListener('click', confirmarImportarPlanilla);
    document.getElementById('importar-hoja-select')?.addEventListener('change', function () {
        if (_planillaParsed) {
            _planillaParsed.seleccionHoja = this.value;
            mostrarPreviewPlanilla(_planillaParsed);
        }
    });
    document.querySelectorAll('.importar-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.importar-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.importar-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-content-${tabId}`)?.classList.add('active');
        });
    });
    const dzPlanilla = document.getElementById('dropzone-planilla');
    const inputPlanilla = document.getElementById('input-archivo-planilla');
    if (dzPlanilla && inputPlanilla) {
        dzPlanilla.addEventListener('click', () => inputPlanilla.click());
        inputPlanilla.addEventListener('change', e => {
            const f = e.target.files?.[0];
            if (f) procesarPlanillaEntrada(f);
        });
        dzPlanilla.addEventListener('dragover', e => { e.preventDefault(); dzPlanilla.classList.add('drag'); });
        dzPlanilla.addEventListener('dragleave', () => dzPlanilla.classList.remove('drag'));
        dzPlanilla.addEventListener('drop', e => {
            e.preventDefault();
            dzPlanilla.classList.remove('drag');
            const f = e.dataTransfer?.files?.[0];
            if (f) {
                const dt = new DataTransfer();
                dt.items.add(f);
                inputPlanilla.files = dt.files;
                procesarPlanillaEntrada(f);
            }
        });
    }
    document.getElementById('btn-procesar-pegado')?.addEventListener('click', () => {
        const txt = document.getElementById('textarea-pegar-planilla')?.value || '';
        if (!txt.trim()) {
            toast('Por favor pegá primero las celdas copiadas de Excel', 'error');
            return;
        }
        procesarPlanillaEntrada(txt);
    });
    document.getElementById('textarea-pegar-planilla')?.addEventListener('paste', () => {
        setTimeout(() => {
            const txt = document.getElementById('textarea-pegar-planilla')?.value || '';
            if (txt.trim()) procesarPlanillaEntrada(txt);
        }, 100);
    });

    // ── Confirmar ──
    document.getElementById('confirmar-ok-btn')?.addEventListener('click', () => {
        const cb = _confirmarCb;
        _cerrarConfirmar();
        if (cb) cb();
    });
    document.getElementById('confirmar-cancelar-btn')?.addEventListener('click', _cerrarConfirmar);

    // ── Atajos de teclado: deshacer / rehacer (dentro de un campo de texto vale el del navegador; Escape y Ctrl+flechas: la suite) ──
    document.addEventListener('keydown', e => {
        if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (UI.modal.arriba && UI.modal.arriba()) return;
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); historial.undo(); }
        else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); historial.redo(); }
    });

    // ── Limpiar clase error al escribir ──
    document.addEventListener('input', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            e.target.classList.remove('error');
        }
    });

    // Carga inicial
    actualizarFiltrosYSelects();
    renderRacks();

    // La pestaña con la que se cerró, sin animar (ya con todo dibujado: si no, el cambio deslizaría un fantasma vacío)
    try {
        const t = localStorage.getItem(APP_KEY + 'tab');
        const boton = t && ['racks', 'ajustes'].includes(t) ? document.getElementById(`tab-${t}`) : null;
        if (boton) {
            const panel = document.querySelector(boton.dataset.uiTarget);
            if (panel) panel.dataset.skipAnimation = 'true';
            UI.pestana.mostrar(boton);
        }
    } catch (_) { /* sin almacenamiento */ }

    GistSync.init();
    GistSync.verificarAlAbrir();
});
