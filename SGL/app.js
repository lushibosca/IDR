
const APP_KEY = 'sgl'; // Prefijo único para localStorage — no pisar otras apps del mismo dominio

// --- SECURITY & UTILS MODULE ---
const S = (function () {
    const SECURITY_LIMITS = { MAX_PERSONAS: 500, MAX_STRING_LENGTH: 100, MAX_JSON_SIZE: 4 * 1024 * 1024, SCHEMA_VERSION: 1 };
    const REGEX_FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

    function sanitizeString(str, maxLength = SECURITY_LIMITS.MAX_STRING_LENGTH) {
        if (typeof str !== 'string') return '';
        return str.replace(/[<>"'`]/g, '').replace(/javascript:/gi, '').replace(/data:/gi, '').replace(/vbscript:/gi, '').replace(/on\w+\s*=/gi, '').replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, maxLength);
    }

    function validarFechaSegura(f) {
        if (!f || !REGEX_FECHA.test(f)) return false;
        try {
            const [y, m, d] = f.split('-').map(Number);
            const fecha = new Date(y, m - 1, d);
            if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return false;
            const ahora = new Date();
            const hace20 = new Date(ahora.getFullYear() - 20, 0, 1);
            const en10 = new Date(ahora.getFullYear() + 10, 11, 31);
            return fecha >= hace20 && fecha <= en10 && !isNaN(fecha.getTime());
        } catch (e) { return false; }
    }

    async function calcularHashSHA256(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function validarPersonaSegura(p) {
        if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
        if (typeof p.name !== 'string' || p.name.trim().length === 0 || p.name.length > 100) return false;
        const propPermitidas = ['id', 'name', 'area', 'years'];
        if (Object.keys(p).some(k => !propPermitidas.includes(k))) return false;
        if (p.area !== undefined && !Array.isArray(p.area) && typeof p.area !== 'string') return false;
        if (p.years !== undefined) {
            if (typeof p.years !== 'object' || Array.isArray(p.years)) return false;
            for (const [yr, yCfg] of Object.entries(p.years)) {
                if (!/^\d{4}$/.test(yr)) return false;
                if (!yCfg || typeof yCfg !== 'object') return false;
                const yProps = ['summer', 'winter', 'unlimited', 'sStart', 'sEnd'];
                if (Object.keys(yCfg).some(k => !yProps.includes(k))) return false;
                if (yCfg.summer !== undefined && (!Number.isFinite(yCfg.summer) || yCfg.summer < 0 || yCfg.summer > 365)) return false;
                if (yCfg.winter !== undefined && (!Number.isFinite(yCfg.winter) || yCfg.winter < 0 || yCfg.winter > 365)) return false;
                if (yCfg.unlimited !== undefined && typeof yCfg.unlimited !== 'boolean') return false;
                if (yCfg.sStart !== undefined && (!Number.isFinite(yCfg.sStart) || yCfg.sStart < 0 || yCfg.sStart > 11)) return false;
                if (yCfg.sEnd !== undefined && (!Number.isFinite(yCfg.sEnd) || yCfg.sEnd < 0 || yCfg.sEnd > 11)) return false;
            }
        }
        return true;
    }

    function validarVacationKey(key) {
        if (typeof key !== 'string' || key.length > 60) return false;
        const partes = key.split('-');
        if (partes.length < 4) return false;
        const fecha = partes.slice(-3).join('-');
        return REGEX_FECHA.test(fecha);
    }

    function fechaLocalISO() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Normalización sin tildes, minúsculas — reutilizada en búsquedas, deduplicación y combos
    function norm(str) {
        if (typeof str !== 'string') return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    // Normaliza el campo area de una persona a array siempre (legacy: podía ser string)
    function toAreaArray(area) {
        if (Array.isArray(area)) return area;
        return area ? [area] : [];
    }

    // Fecha de hoy en formato ISO local YYYY-MM-DD (sin conversión UTC)
    function fechaHoyLocal() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    return { SECURITY_LIMITS, sanitizeString, escapeHTML, validarFechaSegura, calcularHashSHA256, validarPersonaSegura, validarVacationKey, fechaLocalISO, norm, toAreaArray, fechaHoyLocal };
})();


// --- AREAS MODULE ---
const Areas = (function () {
    const LS_KEY = `${APP_KEY}_areas_v1`;
    let _areas = [];

    function cargar() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) _areas = parsed.map(a => S.sanitizeString(String(a), 60)).filter(a => a.length > 0);
            }
        } catch (e) { _areas = []; }
    }

    function persistir() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(_areas)); } catch (e) { }
    }

    function getAll() { return [..._areas]; }

    function add() {
        const input = document.getElementById('area-name-input');
        const name = S.sanitizeString(input.value.trim(), 60);
        if (!name) return UI.toast('Ingresá un nombre de área', 'info');
        if (_areas.some(a => a.toLowerCase() === name.toLowerCase())) return UI.toast('Esa área ya existe', 'info');
        if (_areas.length >= 100) return UI.toast('Límite de 100 Areas alcanzado', 'error');
        _areas.push(name);
        persistir();
        input.value = '';
        renderList();
        _refreshAreaSelects();
        UI.toast(`✓ Área "${name}" agregada`, 'success');
    }

    function remove(name) {
        _areas = _areas.filter(a => a !== name);
        persistir();
        // Limpiar el área de todas las personas que la tenían asignada
        [...Data.people()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })).forEach(p => {
            if (!Array.isArray(p.area)) return;
            p.area = p.area.filter(a => a !== name);
            if (p.area.length === 0) delete p.area;
        });
        Data.notifyChange();
        Gantt.render();
        renderList();
        _refreshAreaSelects();
        UI.toast(`✓ Área "${name}" eliminada`, 'success');
    }

    function renderList() {
        const list = document.getElementById('areas-list');
        if (!list) return;
        if (_areas.length === 0) {
            list.innerHTML = `<div class="empty-state-msg">No hay Areas definidas.</div>`;
            return;
        }
        list.innerHTML = [..._areas].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })).map(a =>
            `<div class="area-management-item"><span>${a}</span><button class="btn-remove-area" data-area="${a.replace(/"/g, '&quot;')}" title="Eliminar">✕</button></div>`
        ).join('');
        if (!list._delegated) {
            list._delegated = true;
            list.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-remove-area');
                if (btn) Areas.remove(btn.dataset.area);
            });
        }
    }

    // --- COMBOBOX STATE ---
    const _comboState = {}; // { 'p-area': { selected: [], highlighted: -1 }, ... }

    function _comboGetState(prefix) {
        if (!_comboState[prefix]) _comboState[prefix] = { selected: [], highlighted: -1 };
        return _comboState[prefix];
    }

    function _comboRenderChips(prefix) {
        const chips = document.getElementById(prefix + '-chips');
        if (!chips) return;
        const state = _comboGetState(prefix);
        chips.innerHTML = state.selected.map(a =>
            `<span class="area-tag">${S.escapeHTML(a)}<button class="area-tag-remove" data-prefix="${prefix}" data-area="${a.replace(/"/g, '&quot;')}">✕</button></span>`
        ).join('');
        if (!chips._delegated) {
            chips._delegated = true;
            chips.addEventListener('click', (e) => {
                const btn = e.target.closest('.area-tag-remove');
                if (btn) Areas.comboRemove(btn.dataset.prefix, btn.dataset.area);
            });
        }
    }

    function _comboRenderDropdown(prefix, filterVal) {
        const dropdown = document.getElementById(prefix + '-dropdown');
        if (!dropdown) return;
        const state = _comboGetState(prefix);
        const norm = S.norm;
        const fv = norm(filterVal || '');
        const sorted = [..._areas].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        const filtered = fv ? sorted.filter(a => norm(a).includes(fv)) : sorted;

        let html = '';

        if (!filtered.length) {
            html += `<div class="area-combobox-empty">Sin resultados</div>`;
        } else {
            html += filtered.map((a, i) => {
                const isSel = state.selected.includes(a);
                return `<div class="area-combobox-option${isSel ? ' already-selected' : ''}" data-area="${a.replace(/"/g, '&quot;')}" data-idx="${i}">${S.escapeHTML(a)}</div>`;
            }).join('');
        }

        // Agregamos el botón de acción anclado al final
        html += `
        <div class="area-combobox-action" data-prefix="${prefix}">
            <svg class="icon-sm icon-margin-right"><use href="#icon-plus" /></svg>
            Agregar nueva área
        </div>`;

        dropdown.innerHTML = html;

        if (!dropdown._delegated) {
            dropdown._delegated = true;
            dropdown.addEventListener('mousedown', (e) => {
                // Interceptar clic en "Agregar nueva área"
                const actionOpt = e.target.closest('.area-combobox-action');
                if (actionOpt) {
                    e.preventDefault();
                    document.activeElement?.blur();
                    const pfx = actionOpt.dataset.prefix;
                    const source = pfx === 'p-area' ? 'new-person' : 'edit-person';
                    Areas.comboClose(pfx);
                    UI.openAreasModal(source); // Le pasamos el origen al modal
                    return;
                }

                // Interceptar clic en una opción normal
                const opt = e.target.closest('.area-combobox-option');
                if (opt) { e.preventDefault(); Areas.comboSelect(prefix, opt.dataset.area); }
            });
        }
        state.highlighted = -1;
    }

    function comboOpen(prefix) {
        const dropdown = document.getElementById(prefix + '-dropdown');
        if (!dropdown) return;
        const input = document.getElementById(prefix + '-input');
        _comboRenderDropdown(prefix, input ? input.value : '');
        dropdown.classList.add('open');
    }

    function comboFilter(prefix) {
        const input = document.getElementById(prefix + '-input');
        _comboRenderDropdown(prefix, input ? input.value : '');
        const dropdown = document.getElementById(prefix + '-dropdown');
        if (dropdown) dropdown.classList.add('open');
    }

    function comboSelect(prefix, area) {
        const state = _comboGetState(prefix);
        if (!state.selected.includes(area)) {
            state.selected.push(area);
            _comboRenderChips(prefix);
        }
        const input = document.getElementById(prefix + '-input');
        if (input) { input.value = ''; input.focus(); }
        _comboRenderDropdown(prefix, '');
    }

    function comboRemove(prefix, area) {
        const state = _comboGetState(prefix);
        state.selected = state.selected.filter(a => a !== area);
        _comboRenderChips(prefix);
    }

    function comboAdd(prefix) {
        // Agrega el área resaltada o el texto exacto si coincide
        const state = _comboGetState(prefix);
        const input = document.getElementById(prefix + '-input');
        const val = input ? input.value.trim() : '';
        const dropdown = document.getElementById(prefix + '-dropdown');
        const opts = dropdown ? [...dropdown.querySelectorAll('.area-combobox-option')] : [];
        let target = null;
        if (state.highlighted >= 0 && opts[state.highlighted]) {
            target = opts[state.highlighted].dataset.area;
        } else if (val) {
            target = _areas.find(a => S.norm(a) === S.norm(val)) || (opts[0] ? opts[0].dataset.area : null);
        } else if (opts.length === 1) {
            target = opts[0].dataset.area;
        }
        if (target) comboSelect(prefix, target);
    }

    function comboKey(e, prefix) {
        const dropdown = document.getElementById(prefix + '-dropdown');
        const state = _comboGetState(prefix);
        if (!dropdown || !dropdown.classList.contains('open')) { if (e.key === 'ArrowDown') comboOpen(prefix); return; }
        const opts = [...dropdown.querySelectorAll('.area-combobox-option')];
        if (e.key === 'ArrowDown') { e.preventDefault(); state.highlighted = Math.min(state.highlighted + 1, opts.length - 1); _comboHighlight(dropdown, opts, state.highlighted); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); state.highlighted = Math.max(state.highlighted - 1, 0); _comboHighlight(dropdown, opts, state.highlighted); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); comboAdd(prefix); }
        else if (e.key === 'Escape') { e.stopPropagation(); dropdown.classList.remove('open'); document.activeElement?.blur(); }
    }

    function _comboHighlight(dropdown, opts, idx) {
        opts.forEach((o, i) => o.classList.toggle('highlighted', i === idx));
        if (opts[idx]) opts[idx].scrollIntoView({ block: 'nearest' });
    }

    function comboClose(prefix) {
        const dropdown = document.getElementById(prefix + '-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    function getSelected(prefix) {
        return [...(_comboGetState(prefix).selected)];
    }

    function populateSelect(prefix, selectedAreas) {
        const arr = Array.isArray(selectedAreas) ? selectedAreas : (selectedAreas ? [selectedAreas] : []);
        const state = _comboGetState(prefix);
        state.selected = arr.filter(a => a);
        state.highlighted = -1;
        _comboRenderChips(prefix);
        const input = document.getElementById(prefix + '-input');
        if (input) input.value = '';
        const dropdown = document.getElementById(prefix + '-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    function _refreshAreaSelects() {
        ['p-area', 'ep-area'].forEach(prefix => {
            const state = _comboGetState(prefix);
            // Quitar de selected las áreas que ya no existen
            state.selected = state.selected.filter(a => _areas.includes(a));
            _comboRenderChips(prefix);
        });
    }

    function importAll(arr) {
        if (!Array.isArray(arr)) return;
        _areas = arr.map(a => S.sanitizeString(String(a), 60)).filter(a => a.length > 0).slice(0, 100);
        persistir();
    }

    return { cargar, getAll, add, remove, renderList, populateSelect, getSelected, comboOpen, comboFilter, comboSelect, comboRemove, comboAdd, comboKey, comboClose, importAll, refresh: _refreshAreaSelects };
})();


// --- FILE MODULE ---
const FileIO = (function () {
    let isDirty = false;
    function markDirty(val) { isDirty = val; }
    function createNew() {
        Data.loadFromObj({ people: [], vacations: {}, config: { defSummer: 30, defWinter: 15, sStart: 11, sEnd: 2 } });
        markDirty(false);
    }
    return { markDirty, createNew };
})();

// --- DATA MODULE ---
const Data = (function () {
    let people = [], vacations = {}, config = { defSummer: 30, defWinter: 15, sStart: 11, sEnd: 2, scrollSpeed: 3 };
    const LS_KEY = `${APP_KEY}_data_v1`;

    // Índice pid → Set<date> para evitar iterar Object.keys(vacations) por persona en cada render
    const _vacIdx = new Map();

    function _rebuildVacIdx() {
        _vacIdx.clear();
        for (const key of Object.keys(vacations)) {
            const dash = key.indexOf('-');
            const pid = key.slice(0, dash);
            const date = key.slice(dash + 1);
            if (!_vacIdx.has(pid)) _vacIdx.set(pid, new Set());
            _vacIdx.get(pid).add(date);
        }
    }

    function persistir() {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ people, vacations, config })); } catch (e) { console.warn('localStorage no disponible:', e); }
    }

    function loadFromObj(db) {
        people = db.people || [];
        vacations = db.vacations || {};
        config = { ...{ defSummer: 30, defWinter: 15, sStart: 11, sEnd: 2, scrollSpeed: 3 }, ...db.config };
        _rebuildVacIdx();
        Gantt.render();
    }

    let _loaded = false;

    function cargarDesdeLocalStorage() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return false;
            const db = JSON.parse(raw);
            if (!Array.isArray(db.people)) return false;
            loadFromObj(db);
            _loaded = true;
            return true;
        } catch (e) { return false; }
    }

    function notifyChange() { if (!_loaded) return; FileIO.markDirty(true); persistir(); GistSync.subirAuto(); }

    // Devuelve la persona que colisiona con `name` (tokens subconjunto de otro), ignorando `excludeId`
    function _findNameCollision(name, excludeId) {
        const tokenize = s => S.norm(s).split(/\s+/).filter(t => t.length > 0);
        const newSet = new Set(tokenize(name));
        return people.find(x => {
            if (excludeId !== undefined && x.id == excludeId) return false;
            const exSet = new Set(tokenize(x.name));
            return [...newSet].every(t => exSet.has(t)) || [...exSet].every(t => newSet.has(t));
        }) || null;
    }

    function _saveEditPerson(editId) {
        const name = S.sanitizeString(document.getElementById('ep-name').value.trim(), 100);
        if (!name) return UI.toast("Nombre requerido", "info");
        const p = people.find(x => x.id == editId);
        if (!p) return;

        const tokenize = s => S.norm(s).split(/\s+/).filter(t => t.length > 0);
        if (tokenize(name).length < 2) return UI.toast(`"${name}": ingresá al menos nombre y apellido`, "error");
        const collision = _findNameCollision(name, editId);
        if (collision) return UI.toast(`"${name}": similar a "${collision.name}"`, "error");

        const year = parseInt(document.getElementById('ep-year-select').value);
        const useCustomLimits = document.getElementById('ep-custom-limits').classList.contains('active');
        const useCustomSeason = document.getElementById('ep-custom-season').classList.contains('active');
        const areas = Areas.getSelected('ep-area').map(a => S.sanitizeString(a, 60)).filter(a => a);

        const prevYearCfg = (p.years && p.years[year]) ? { ...p.years[year] } : undefined;
        let newYearCfg = undefined;
        if (useCustomLimits || useCustomSeason) {
            newYearCfg = {};
            if (useCustomLimits) {
                newYearCfg.summer = parseInt(document.getElementById('ep-summer').value) || 0;
                newYearCfg.winter = parseInt(document.getElementById('ep-winter').value) || 0;
                newYearCfg.unlimited = document.getElementById('ep-unlimited').classList.contains('active');
            }
            if (useCustomSeason) {
                newYearCfg.sStart = parseInt(document.getElementById('ep-sStart').value);
                newYearCfg.sEnd = parseInt(document.getElementById('ep-sEnd').value);
            }
        }

        const prevAreas = S.toAreaArray(p.area);
        const yearCfgChanged = JSON.stringify(prevYearCfg) !== JSON.stringify(newYearCfg);
        const changed = p.name !== name || JSON.stringify(prevAreas.sort()) !== JSON.stringify([...areas].sort()) || yearCfgChanged;
        if (!changed) { UI.closeModals(); UI.toast("Sin cambios", "info"); return; }

        Historial.empujar(`Editar persona "${p.name}"`);
        p.name = name;
        if (areas.length) p.area = areas; else delete p.area;
        if (!p.years) p.years = {};
        if (newYearCfg) p.years[year] = newYearCfg;
        else delete p.years[year];
        if (Object.keys(p.years).length === 0) delete p.years;

        notifyChange(); UI.closeModals(); Gantt.render();
        UI.toast(yearCfgChanged ? "✓ Cambios guardados · Configuración de año actualizada" : "✓ Cambios guardados", "success");
    }

    function _saveNewPerson() {
        const rawName = document.getElementById('p-name').value;
        const areas = Areas.getSelected('p-area').map(a => S.sanitizeString(a, 60)).filter(a => a);
        const names = rawName.split(',').map(n => n.trim()).filter(n => n.length > 0);
        if (!names.length) return UI.toast("Falta el nombre", "info");

        const tokenize = s => S.norm(s).split(/\s+/).filter(t => t.length > 0);
        const agregados = [], rechazados = [];

        for (const name of names) {
            if (tokenize(name).length < 2) { rechazados.push({ name, reason: 'ingresá al menos nombre y apellido' }); continue; }
            const collision = _findNameCollision(name);
            if (collision) { rechazados.push({ name, reason: `similar a "${collision.name}"` }); continue; }
            agregados.push(name);
        }

        rechazados.forEach(r => UI.toast(`✗ "${r.name}": ${r.reason}`, 'error'));
        if (agregados.length) {
            Historial.empujar(agregados.length > 1 ? `Agregar ${agregados.length} personas` : `Agregar "${agregados[0]}"`);
            agregados.forEach((name, i) => {
                const persona = { id: Date.now() + i, name, summer: config.defSummer, winter: config.defWinter, unlimited: false };
                if (areas.length) persona.area = areas;
                people.push(persona);
            });
            notifyChange(); UI.closeModals(); Gantt.render();
            UI.toast(agregados.length > 1 ? `✓ ${agregados.length} personas agregadas` : `✓ ${agregados[0]} agregado`, "success");
        }
    }

    function savePerson() {
        const isEdit = document.getElementById('modal-edit-person').classList.contains('show');
        const editId = document.getElementById('modal-edit-person')?.dataset.id;
        if (isEdit) _saveEditPerson(editId); else _saveNewPerson();
    }

    function deletePerson() {
        const id = document.getElementById('modal-edit-person').dataset.id;
        const p = people.find(x => x.id == id);
        if (!p) return;
        UI.showConfirm(
            'Eliminar persona',
            `¿Eliminar a ${p.name}? Esta acción no se puede deshacer.`,
            () => {
                Historial.empujar(`Eliminar "${p.name}"`);
                people = people.filter(x => x.id != id);
                notifyChange(); UI.closeModals(); Gantt.render();
                UI.toast(`✓ ${p.name} eliminado`, "success");
            }
        );
    }

    function saveConfig() {
        const newSummer = parseInt(document.getElementById('conf-summer').value);
        const newWinter = parseInt(document.getElementById('conf-winter').value);
        const newSStart = parseInt(document.getElementById('conf-s-start').value);
        const newSEnd = parseInt(document.getElementById('conf-s-end').value);
        const spd = parseInt(document.getElementById('conf-scroll-speed').value);
        const newSpeed = (Number.isFinite(spd) && spd >= 1 && spd <= 10) ? spd : 3;

        if (newSummer === config.defSummer && newWinter === config.defWinter &&
            newSStart === config.sStart && newSEnd === config.sEnd && newSpeed === config.scrollSpeed) {
            UI.closeModals();
            UI.toast('Sin cambios', 'info');
            return;
        }

        Historial.empujar('Guardar configuración');
        config.defSummer = newSummer;
        config.defWinter = newWinter;
        config.sStart = newSStart;
        config.sEnd = newSEnd;
        config.scrollSpeed = newSpeed;
        notifyChange(); UI.closeModals(); Gantt.render();
        UI.toast('✓ Configuración guardada', 'success');
    }

    function setVacation(pid, date, val) {
        const key = `${pid}-${date}`;
        const pidStr = String(pid);
        if (val) {
            vacations[key] = true;
            if (!_vacIdx.has(pidStr)) _vacIdx.set(pidStr, new Set());
            _vacIdx.get(pidStr).add(date);
        } else {
            delete vacations[key];
            _vacIdx.get(pidStr)?.delete(date);
        }
    }

    function isVacation(pid, d) { return vacations[`${pid}-${d}`]; }

    function getYearConfig(p, year) {
        // Devuelve la config del año dado, o defaults globales si no existe
        const y = p.years && p.years[year];
        return {
            summer: y && y.summer !== undefined ? y.summer : config.defSummer,
            winter: y && y.winter !== undefined ? y.winter : config.defWinter,
            unlimited: y && y.unlimited !== undefined ? y.unlimited : false,
            sStart: y && y.sStart !== undefined ? y.sStart : config.sStart,
            sEnd: y && y.sEnd !== undefined ? y.sEnd : config.sEnd,
        };
    }

    function getLimits(p, year) {
        return getYearConfig(p, year ?? new Date().getFullYear());
    }

    function getStatus(p, year) {
        const today = fechaHoyLocal();
        const pidStr = String(p.id);
        const dates = _vacIdx.get(pidStr);
        if (dates?.has(today)) return { text: "En curso", cls: "curso" };
        const lim = getYearConfig(p, year);
        if (lim.unlimited) return { text: "Libre", cls: "libre" };
        let taken_s = 0, taken_w = 0;
        if (dates) {
            for (const date of dates) {
                if (parseInt(date.slice(0, 4)) !== year) continue;
                if (date <= today) {
                    if (getSeason(date, p) === 'summer') taken_s++; else taken_w++;
                }
            }
        }
        const balance = (lim.summer + lim.winter) - (taken_s + taken_w);
        return (balance > 0) ? { text: "Pendiente", cls: "pendiente" } : { text: "Completa", cls: "completa" };
    }

    function getSeason(dateStr, person) {
        const month = parseInt(dateStr.split('-')[1]) - 1;
        const year = parseInt(dateStr.split('-')[0]);
        const yCfg = person ? getYearConfig(person, year) : null;
        const start = yCfg ? yCfg.sStart : config.sStart;
        const end = yCfg ? yCfg.sEnd : config.sEnd;
        if (start < end) { return (month >= start && month < end) ? 'summer' : 'winter'; }
        else { return (month >= start || month < end) ? 'summer' : 'winter'; }
    }

    function getUsedCounts(p, year) {
        let sUsed = 0, wUsed = 0;
        const dates = _vacIdx.get(String(p.id));
        if (dates) {
            for (const date of dates) {
                if (year !== undefined && parseInt(date.slice(0, 4)) !== year) continue;
                if (getSeason(date, p) === 'summer') sUsed++; else wUsed++;
            }
        }
        return { s: sUsed, w: wUsed };
    }

    function getRealTimeStats(p, year) {
        const lim = getYearConfig(p, year);
        if (lim.unlimited) return { s: Infinity, w: Infinity };
        const used = getUsedCounts(p, year);
        return { s: lim.summer - used.s, w: lim.winter - used.w };
    }

    async function exportData() {
        try {
            const peopleClean = people.map(p => {
                const obj = { id: p.id, name: p.name };
                if (p.area !== undefined) obj.area = p.area;
                if (p.years && Object.keys(p.years).length) obj.years = p.years;
                return obj;
            });
            const payload = { people: peopleClean, vacations, config };
            const data = {
                people: peopleClean, vacations, config, holidays: Holidays.getAll(), areas: Areas.getAll(), fecha: S.fechaLocalISO(),
                version: S.SECURITY_LIMITS.SCHEMA_VERSION, hash: await S.calcularHashSHA256(payload), timestamp: Date.now(),
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `Licencias_backup_${fechaHoyLocal()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            UI.toast(" Backup exportado", "success");
        } catch (e) { console.error(e); UI.toast(" Error al exportar", "error"); }
    }

    function importData(parsedData, mode) {
        const data = parsedData;
        const peopleImportadas = data.people.slice(0, S.SECURITY_LIMITS.MAX_PERSONAS).filter(p => S.validarPersonaSegura(p)).map(p => {
            const persona = {
                id: (typeof p.id === 'number' || typeof p.id === 'string') ? p.id : Date.now(),
                name: S.sanitizeString(p.name, 100),
            };
            if (p.area !== undefined) {
                const areasClean = S.toAreaArray(p.area).map(a => S.sanitizeString(String(a), 60)).filter(a => a);
                if (areasClean.length) persona.area = areasClean;
            }
            if (p.years && typeof p.years === 'object') {
                persona.years = {};
                for (const [yr, yCfg] of Object.entries(p.years)) {
                    if (!/^\d{4}$/.test(yr) || !yCfg) continue;
                    const yClean = {};
                    if (Number.isFinite(yCfg.summer)) yClean.summer = Math.max(0, Math.min(365, yCfg.summer));
                    if (Number.isFinite(yCfg.winter)) yClean.winter = Math.max(0, Math.min(365, yCfg.winter));
                    if (typeof yCfg.unlimited === 'boolean') yClean.unlimited = yCfg.unlimited;
                    if (Number.isFinite(yCfg.sStart) && yCfg.sStart >= 0 && yCfg.sStart <= 11) yClean.sStart = yCfg.sStart;
                    if (Number.isFinite(yCfg.sEnd) && yCfg.sEnd >= 0 && yCfg.sEnd <= 11) yClean.sEnd = yCfg.sEnd;
                    if (Object.keys(yClean).length) persona.years[yr] = yClean;
                }
                if (!Object.keys(persona.years).length) delete persona.years;
            }

            return persona;
        });

        if (peopleImportadas.length === 0 && data.people.length > 0) { UI.toast(" No se encontraron personas válidas", "error"); return; }

        const vacationsImportadas = {};
        if (data.vacations && typeof data.vacations === 'object' && !Array.isArray(data.vacations)) {
            Object.keys(data.vacations).forEach(key => { if (S.validarVacationKey(key)) vacationsImportadas[key] = true; });
        }

        const configBase = { defSummer: 30, defWinter: 15, sStart: 11, sEnd: 2, scrollSpeed: 5 };
        let configImportada = { ...configBase };
        if (data.config && typeof data.config === 'object') {
            const ds = parseInt(data.config.defSummer), dw = parseInt(data.config.defWinter);
            const ss = parseInt(data.config.sStart), se = parseInt(data.config.sEnd), spd = parseInt(data.config.scrollSpeed);
            if (Number.isFinite(ds) && ds >= 0 && ds <= 365) configImportada.defSummer = ds;
            if (Number.isFinite(dw) && dw >= 0 && dw <= 365) configImportada.defWinter = dw;
            if (Number.isFinite(ss) && ss >= 0 && ss <= 11) configImportada.sStart = ss;
            if (Number.isFinite(se) && se >= 0 && se <= 11) configImportada.sEnd = se;
            if (Number.isFinite(spd) && spd >= 1 && spd <= 10) configImportada.scrollSpeed = spd;
        }

        // Dentro de Data.importData en app.js
        if (mode === 'hybrid') {
            let countUpdated = 0;
            const localPeople = people;

            // 1. ACTUALIZAR CONFIGURACIÓN GLOBAL (Temporadas y límites generales)
            if (parsedData.config) {
                config = { ...config, ...configImportada };
            }

            peopleImportadas.forEach(remotoP => {
                const index = localPeople.findIndex(p => String(p.id) === String(remotoP.id));
                if (index !== -1) {
                    // 2. ACTUALIZAR DATOS Y CONFIGURACIÓN PERSONALIZADA (Años/Límites)
                    localPeople[index].name = remotoP.name;
                    if (remotoP.area) localPeople[index].area = remotoP.area; else delete localPeople[index].area;

                    // Reemplazo total de la configuración de años para esta persona
                    if (remotoP.years) localPeople[index].years = remotoP.years; else delete localPeople[index].years;

                    // 3. REEMPLAZO DE LICENCIAS
                    Object.keys(vacations).forEach(k => {
                        if (k.startsWith(remotoP.id + '-')) delete vacations[k];
                    });
                    Object.keys(vacationsImportadas).forEach(k => {
                        if (k.startsWith(remotoP.id + '-')) vacations[k] = true;
                    });
                    countUpdated++;
                } else {
                    // 2b. INSERTAR persona que no existe localmente (ej: después de un reset)
                    localPeople.push(remotoP);
                    Object.keys(vacationsImportadas).forEach(k => {
                        if (k.startsWith(remotoP.id + '-')) vacations[k] = true;
                    });
                    countUpdated++;
                }
            });

            if (parsedData.holidays) Holidays.importAll(parsedData.holidays);
            if (parsedData.areas) Areas.importAll(parsedData.areas);

            persistir();
            Gantt.render();
            FileIO.markDirty(true);
            UI.refreshYearSelector && UI.refreshYearSelector();
            UI.toast(`✓ Sincronización híbrida completada`, "success");
            return;
        }

        if (mode === 'merge') {
            const existingIds = new Set(people.map(p => String(p.id)));
            const nuevas = peopleImportadas.filter(p => !existingIds.has(String(p.id)));
            people = [...people, ...nuevas];

            // --- NUEVA LÓGICA DE VALIDACIÓN DE LÍMITES ---
            let diasAgregados = 0;
            let diasIgnorados = 0;

            // 1. Ordenamos las fechas cronológicamente. 
            // Si hay límite, asignará primero los días más antiguos.
            const keysOrdenadas = Object.keys(vacationsImportadas).sort((a, b) => {
                const fechaA = a.split('-').slice(1).join('-');
                const fechaB = b.split('-').slice(1).join('-');
                return fechaA.localeCompare(fechaB);
            });

            keysOrdenadas.forEach(k => {
                if (vacations[k]) return; // El día ya existe localmente

                const partes = k.split('-');
                const pid = partes[0];
                const dateStr = partes.slice(1).join('-');
                const year = parseInt(partes[1]);

                const person = people.find(p => p.id == pid);
                if (!person) return;

                // 2. Verificamos los límites en tiempo real antes de insertar
                if (!person.unlimited) {
                    const season = getSeason(dateStr, person);
                    const stats = getRealTimeStats(person, year);

                    if ((season === 'summer' && stats.s <= 0) || (season === 'winter' && stats.w <= 0)) {
                        diasIgnorados++;
                        return; // ⛔ Se ignora este día, límite alcanzado
                    }
                }

                // 3. Si pasa la validación, lo agregamos
                vacations[k] = true;
                diasAgregados++;
            });
            // ---------------------------------------------

            // Merge areas
            if (data.areas && Array.isArray(data.areas)) {
                const existingAreas = new Set(Areas.getAll().map(a => a.toLowerCase()));
                const newAreas = data.areas.map(a => S.sanitizeString(String(a), 60)).filter(a => a && !existingAreas.has(a.toLowerCase()));
                if (newAreas.length > 0) { Areas.importAll([...Areas.getAll(), ...newAreas]); Areas.refresh(); }
            }

            persistir(); Gantt.render(); FileIO.markDirty(true); UI.refreshYearSelector && UI.refreshYearSelector();

            // Feedback dinámico en el toast
            let msj = `✓ Combinado: ${nuevas.length} persona(s), ${diasAgregados} día(s)`;
            if (diasIgnorados > 0) msj += ` (${diasIgnorados} omitidos por límite)`;
            UI.toast(msj, diasIgnorados > 0 ? "info" : "success");
        } else {
            loadFromObj({ people: peopleImportadas, vacations: vacationsImportadas, config: configImportada });
            _loaded = true;
            persistir();
            if (data.holidays && typeof data.holidays === 'object') Holidays.importAll(data.holidays);
            if (data.areas && Array.isArray(data.areas)) { Areas.importAll(data.areas); Areas.refresh(); }
            FileIO.markDirty(true); UI.refreshYearSelector && UI.refreshYearSelector();
            UI.toast(` Restaurado: ${peopleImportadas.length} persona(s)`, "success");
        }
        UI.closeModals();
    }

    function vacacionesDe(pid) {
        return [...(_vacIdx.get(String(pid)) || [])];
    }

    return { loadFromObj, notifyChange, setLoaded: () => { _loaded = true; }, people: () => people, config: () => config, vacations: () => vacations, isVacation, setVacation, getStatus, getRealTimeStats, getLimits, getYearConfig, getSeason, getUsedCounts, savePerson, deletePerson, saveConfig, exportData, importData, cargarDesdeLocalStorage, vacacionesDe };
})();

// --- GANTT MODULE (REFACTORIZADO A CSS GRID) ---

// ── Column mode registry (modular, extensible) ──────────────────────────
const COLUMN_MODES = [
    {
        id: 'remaining',
        label: 'Por cursar',
        headers: { summer: 'Verano', winter: 'Invierno' },
        getStats(p, year, vacations, getUsedCounts, getYearConfig, getSeason, fechaHoy) {
            const lim = getYearConfig(p, year);
            if (lim.unlimited) return { s: Infinity, w: Infinity };
            // Contar solo los días ya cursados (pasados)
            let taken_s = 0, taken_w = 0;
            Object.keys(vacations).forEach(k => {
                if (!k.startsWith(p.id + '-')) return;
                const datePart = k.split('-').slice(1).join('-');
                if (parseInt(datePart.split('-')[0]) !== year) return;
                if (datePart <= fechaHoy) {
                    if (getSeason(datePart, p) === 'summer') taken_s++; else taken_w++;
                }
            });
            return { s: lim.summer - taken_s, w: lim.winter - taken_w };
        },
        colorize(val) { return (val !== Infinity && val <= 0) ? 'var(--c-red)' : 'inherit'; }
    },
    {
        id: 'unassigned',
        label: 'Por asignar',
        headers: { summer: 'Verano', winter: 'Invierno' },
        getStats(p, year, vacations, getUsedCounts, getYearConfig, getSeason, fechaHoy) {
            const lim = getYearConfig(p, year);
            if (lim.unlimited) return { s: Infinity, w: Infinity };
            const used = getUsedCounts(p, year);
            return { s: lim.summer - used.s, w: lim.winter - used.w };
        },
        colorize(val) { return (val !== Infinity && val <= 0) ? 'var(--c-red)' : 'inherit'; }
    },
    {
        id: 'assigned',
        label: 'Asignados',
        headers: { summer: 'Verano', winter: 'Invierno' },
        getStats(p, year, vacations, getUsedCounts, getYearConfig, getSeason, fechaHoy) {
            const used = getUsedCounts(p, year);
            return { s: used.s, w: used.w };
        },
        colorize(val) { return 'inherit'; }
    },
    {
        id: 'taken',
        label: 'Cursados',
        headers: { summer: 'Verano', winter: 'Invierno' },
        getStats(p, year, vacations, getUsedCounts, getYearConfig, getSeason, fechaHoy) {
            let s = 0, w = 0;
            Object.keys(vacations).forEach(k => {
                if (!k.startsWith(p.id + '-')) return;
                const datePart = k.split('-').slice(1).join('-');
                if (parseInt(datePart.split('-')[0]) !== year) return;
                if (datePart <= fechaHoy) {
                    if (getSeason(datePart, p) === 'summer') s++; else w++;
                }
            });
            return { s, w };
        },
        colorize(val) { return 'inherit'; }
    },
];
let _colModeIdx = 0;
let _colModeDir = 1; // 1 = forward (right), -1 = backward (left)
let _animateCols = false;
let _colModeTimer = null;
let _colModePaused = false; // NUEVA VARIABLE PARA LA PAUSA
const COL_MODE_INTERVAL = 15000; // 15 segundos

function _resetColModeTimer() {
    if (_colModeTimer) clearInterval(_colModeTimer);
    const bar = document.getElementById('col-mode-progress');

    // Si está pausado, limpiamos la animación y dejamos la barra llena
    if (_colModePaused) {
        if (bar) {
            bar.style.animation = 'none';
            bar.style.width = '100%';
        }
        return;
    }

    // Si no está pausado, arranca el temporizador y la animación normalmente
    _colModeTimer = setInterval(() => cycleColumnMode(1), COL_MODE_INTERVAL);
    if (bar) {
        bar.style.width = ''; // Limpiamos el width forzado
        bar.style.animation = 'none';
        bar.offsetWidth; // forzar reflow
        bar.style.animation = `colModeCountdown ${COL_MODE_INTERVAL}ms linear forwards`;
    }
}

function cycleColumnMode(dir = 1, manual = false) {
    _colModeDir = dir;
    _colModeIdx = (_colModeIdx + dir + COLUMN_MODES.length) % COLUMN_MODES.length;
    _animateCols = true;
    Gantt.refreshColumnMode();
    _animateCols = false;
    _resetColModeTimer();
}
function getColumnMode() { return COLUMN_MODES[_colModeIdx]; }
// ────────────────────────────────────────────────────────────────────────

const Gantt = (function () {
    const gridContainer = document.getElementById('gantt-grid');
    const containerScroll = document.getElementById('gantt-container');
    let currentViewYear = new Date().getFullYear();
    let dateRange = [], isDragging = false, dragStartValue = false, toastDebounce = 0;
    let _dragPid = null, _dragPersonName = '', _dragVacSnapBefore = null;
    let isPanoramic = false;
    let _onContextMenuRow = null; // asignado desde DOMContentLoaded
    let _onNavReset = null;       // asignado desde DOMContentLoaded
    const _unlockedIds = new Set(); // IDs de personas con edición habilitada

    function _updateVisibleLicenses() {
        const cRect = containerScroll.getBoundingClientRect();
        document.querySelectorAll('.person-row').forEach(row => {
            const cellName = row.querySelector('.person-cell');
            if (!cellName) return;
            const activeBars = row.querySelectorAll('.bar-segment.active');
            let visible = false;
            for (const bar of activeBars) {
                const bRect = bar.getBoundingClientRect();
                if (bRect.right > cRect.left && bRect.left < cRect.right) { visible = true; break; }
            }
            cellName.classList.toggle('has-visible-license', visible);
        });
    }
    containerScroll.addEventListener('scroll', _updateVisibleLicenses, { passive: true });

    // ÁRBITRO DE PRIORIDADES (Single Source of Truth)
    const DAY_PRIORITY = { WORKDAY: 0, WEEKEND: 1, HOLIDAY: 2, TODAY: 3 };

    function getDayType(dateObj, dateStr) {
        const todayStr = fechaHoyLocal();
        let type = 'workday';
        let maxPriority = DAY_PRIORITY.WORKDAY;

        const isWknd = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        if (isWknd) { type = 'weekend'; maxPriority = DAY_PRIORITY.WEEKEND; }
        if (Holidays.isHoliday(dateStr) && DAY_PRIORITY.HOLIDAY > maxPriority) { type = 'holiday'; maxPriority = DAY_PRIORITY.HOLIDAY; }
        if (dateStr === todayStr && DAY_PRIORITY.TODAY > maxPriority) { type = 'today'; }

        return type;
    }

    function generateDateRange() {
        const todayStr = fechaHoyLocal();
        dateRange = [];
        const start = new Date(currentViewYear, 0, 1);
        const end = new Date(currentViewYear, 11, 31);
        let curr = new Date(start);
        while (curr <= end) {
            const d = new Date(curr);
            const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dow = d.getDay();
            let dayType = 'workday';
            if (dow === 0 || dow === 6) dayType = 'weekend';
            if (Holidays.isHoliday(dStr) && DAY_PRIORITY.HOLIDAY > DAY_PRIORITY[dayType.toUpperCase()]) dayType = 'holiday';
            if (dStr === todayStr) dayType = 'today';
            dateRange.push({ date: d, dateStr: dStr, dayType });
            curr.setDate(curr.getDate() + 1);
        }
    }

    function changeYear(y, afterRender) {
        containerScroll.style.opacity = '0';
        setTimeout(() => {
            currentViewYear = parseInt(y);
            render();
            containerScroll.style.opacity = '1';
            if (afterRender) setTimeout(afterRender, 50);
        }, 180);
    }

    function render() {
        const wasPanoramic = isPanoramic;
        generateDateRange();
        gridContainer.innerHTML = '';
        if (wasPanoramic) gridContainer.classList.add('panoramic-mode');

        // Inyectamos dinámicamente cuántas columnas dibujar
        gridContainer.style.setProperty('--days-count', dateRange.length);

        // 1. Fila de Meses
        const rowMonths = document.createElement('div');
        rowMonths.className = 'gantt-row header-months';

        const searchCorner = document.createElement('div');
        searchCorner.className = 'gantt-cell sticky-left-header';
        searchCorner.classList.add('gantt-corner-search');
        const _swrap = document.createElement('div'); _swrap.className = 'search-wrapper';
        const _sinner = document.createElement('div'); _sinner.className = 'search-inner';
        const _sinput = document.createElement('input'); _sinput.type = 'text'; _sinput.id = 'search-filter'; _sinput.className = 'search-input'; _sinput.placeholder = 'Nombre, area...';
        _sinput.addEventListener('input', function () { Gantt.filterRows(this.value); });
        const _sclear = document.createElement('button'); _sclear.className = 'btn-clear-search'; _sclear.tabIndex = -1; _sclear.textContent = '✕';
        _sclear.addEventListener('click', () => Gantt.clearFilter());
        _sinner.appendChild(_sinput); _sinner.appendChild(_sclear); _swrap.appendChild(_sinner);
        searchCorner.appendChild(_swrap);
        rowMonths.appendChild(searchCorner);

        let currentMonth = -1, colSpan = 0, lastCell = null;
        let isFirstMonth = true;
        dateRange.forEach(({ date: d, dateStr }) => {
            if (d.getMonth() !== currentMonth) {
                if (lastCell) lastCell.style.gridColumn = `span ${colSpan}`;
                currentMonth = d.getMonth(); colSpan = 1;

                const cellMonth = document.createElement('div');
                cellMonth.className = `gantt-cell month-header${!isFirstMonth ? ' month-start' : ''}`;
                isFirstMonth = false;
                const mName = d.toLocaleDateString('es-ES', { month: 'long' });
                cellMonth.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
                cellMonth.onclick = () => togglePanoramicMode(dateStr);

                rowMonths.appendChild(cellMonth);
                lastCell = cellMonth;
            } else { colSpan++; }
        });
        if (lastCell) lastCell.style.gridColumn = `span ${colSpan}`;

        // Toggle de modo de columna: ocupa las 3 columnas derechas del grid (span 3)
        const cellToggle = document.createElement('div');
        cellToggle.className = 'gantt-cell sticky-right-header sticky-right col-status col-mode-toggle';
        cellToggle.classList.add('col-mode-toggle-header');
        cellToggle.title = 'Cambiar vista de columnas';
        const mode = getColumnMode();
        const animClass = _animateCols ? 'anim-fade' : '';
        cellToggle.innerHTML = '';
        const _trow = document.createElement('div'); _trow.className = 'toggle-top-row';
        const _tarL = document.createElement('span'); _tarL.className = 'toggle-arrow toggle-arrow-btn'; _tarL.textContent = '◀';
        _tarL.addEventListener('click', (e) => { e.stopPropagation(); cycleColumnMode(-1, true); });
        const _tlbl = document.createElement('span'); _tlbl.className = `toggle-label ${animClass}`; _tlbl.textContent = mode.label;
        const _tarR = document.createElement('span'); _tarR.className = 'toggle-arrow toggle-arrow-btn'; _tarR.textContent = '▶';
        _tarR.addEventListener('click', (e) => { e.stopPropagation(); cycleColumnMode(1, true); });

        // --- NUEVO: BOTÓN DE PAUSA ---
        const _tPause = document.createElement('span');
        _tPause.className = 'toggle-pause-btn';
        // Dibujamos un SVG de Play o Pause según el estado
        _tPause.innerHTML = _colModePaused
            ? '<svg class="icon-sm"><use href="#icon-play" /></svg>'
            : '<svg class="icon-sm"><use href="#icon-pause" /></svg>';
        _tPause.title = _colModePaused ? 'Reanudar rotación' : 'Pausar rotación';

        _tPause.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que el clic cambie la columna
            _colModePaused = !_colModePaused;
            _resetColModeTimer();
            Gantt.refreshColumnMode();
        });

        // Agregamos el botón _tPause al contenedor
        _trow.appendChild(_tarL); _trow.appendChild(_tlbl); _trow.appendChild(_tarR); _trow.appendChild(_tPause);
        const _tpwrap = document.createElement('div'); _tpwrap.className = 'col-mode-progress-wrap';
        const _tpbar = document.createElement('div'); _tpbar.className = 'col-mode-progress-bar'; _tpbar.id = 'col-mode-progress';
        _tpwrap.appendChild(_tpbar); cellToggle.appendChild(_trow); cellToggle.appendChild(_tpwrap);
        cellToggle.addEventListener('click', () => cycleColumnMode(1, true));
        rowMonths.appendChild(cellToggle);
        gridContainer.appendChild(rowMonths);

        // 2. Fila de Días de la Semana
        const rowWeekdays = document.createElement('div');
        rowWeekdays.className = 'gantt-row header-weekdays';

        const cornerWk = document.createElement('div');
        cornerWk.className = 'gantt-cell sticky-left-header';
        cornerWk.classList.add('gantt-corner-wk');
        rowWeekdays.appendChild(cornerWk);

        dateRange.forEach(({ date: d, dateStr: dStrWd, dayType }, i) => {
            const cellD = document.createElement('div');

            cellD.className = `gantt-cell day-name-header type-${dayType}${d.getDate() === 1 && i > 0 ? ' month-start' : ''}`;
            cellD.textContent = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase();
            rowWeekdays.appendChild(cellD);
        });

        ['col-summer', 'col-winter', 'col-status'].forEach(cls => {
            const wkCell = document.createElement('div');
            wkCell.className = 'gantt-cell sticky-right-header sticky-right ' + cls;
            rowWeekdays.appendChild(wkCell);
        });
        gridContainer.appendChild(rowWeekdays);

        // 3. Fila de Números de Día
        const rowDays = document.createElement('div');
        rowDays.className = 'gantt-row header-days';

        const cornerNum = document.createElement('div');
        cornerNum.className = 'gantt-cell sticky-left-header';
        cornerNum.classList.add('gantt-corner-num');
        const _cnSpan = document.createElement('span'); _cnSpan.textContent = 'PERSONAL';
        const _cnBtn = document.createElement('button'); _cnBtn.className = 'btn-add-person'; _cnBtn.title = 'Nueva persona';
        _cnBtn.addEventListener('click', () => UI.openPersonModal(true));
        const _cnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); _cnSvg.setAttribute('class', 'icon-sm'); _cnSvg.setAttribute('viewBox', '0 0 24 24'); _cnSvg.setAttribute('fill', 'none'); _cnSvg.setAttribute('stroke', 'currentColor'); _cnSvg.setAttribute('stroke-width', '2'); _cnSvg.setAttribute('stroke-linecap', 'round'); _cnSvg.setAttribute('stroke-linejoin', 'round');
        const _cnUse = document.createElementNS('http://www.w3.org/2000/svg', 'use'); _cnUse.setAttribute('href', '#icon-user-plus');
        _cnSvg.appendChild(_cnUse); _cnBtn.appendChild(_cnSvg); cornerNum.appendChild(_cnSpan); cornerNum.appendChild(_cnBtn);
        rowDays.appendChild(cornerNum);

        dateRange.forEach(({ date: d, dateStr: dStrDn, dayType }, i) => {
            const cellN = document.createElement('div');

            cellN.className = `gantt-cell day-num-header type-${dayType}${d.getDate() === 1 && i > 0 ? ' month-start' : ''}`;
            cellN.textContent = d.getDate();
            rowDays.appendChild(cellN);
        });

        {
            const m = getColumnMode();
            ['col-summer', 'col-winter', 'col-status'].forEach((cls, i) => {
                const hdr = document.createElement('div');
                hdr.className = `gantt-cell sticky-right-header sticky-right ${cls}`;
                hdr.textContent = [m.headers.summer, m.headers.winter, 'Estado'][i];
                rowDays.appendChild(hdr);
            });
        }
        gridContainer.appendChild(rowDays);

        // 4. Filas de Personas (Data Rows)
        [...Data.people()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })).forEach(p => {
            const areas = S.toAreaArray(p.area);
            const rowP = document.createElement('div');
            rowP.dataset.name = p.name.toLowerCase();
            rowP.dataset.pid = p.id;
            if (areas.length) {
                rowP.dataset.area = areas.map(a => a.toLowerCase()).join(' ');
                rowP.dataset.areaLabel = areas.join(', ');
            }
            rowP.className = "gantt-row person-row";

            const cellName = document.createElement('div');
            cellName.className = 'gantt-cell sticky-left person-cell';
            const statusDot = document.createElement('span');
            statusDot.className = 'status-dot';
            cellName.appendChild(statusDot);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'person-name-span';
            nameSpan.textContent = p.name;
            nameSpan.title = areas.length ? `${p.name} · ${areas.join(', ')}` : p.name;
            nameSpan.classList.add('person-name-text');
            cellName.appendChild(nameSpan);

            cellName.onclick = (e) => {
                if (SelectionMode.active()) {
                    SelectionMode.toggle(p.id);
                } else {
                    if (_onContextMenuRow) _onContextMenuRow(rowP);

                    // --- NUEVO: Mostrar toast si la persona no tiene licencias asignadas ---
                    if (Data.vacacionesDe(p.id).length === 0) {
                        UI.toast('Sin licencias asignadas', 'info');
                    }
                }
            };
            cellName.oncontextmenu = (e) => { e.preventDefault(); CtxMenu.open(e, p.id, rowP); };
            rowP.appendChild(cellName);

            dateRange.forEach(({ date: d, dateStr: dStr, dayType }, i) => {
                const cellDay = document.createElement('div');

                // Importante: usamos nuestra clase base gantt-cell pero con la variante day-cell (display block en vez de flex)
                cellDay.className = `gantt-cell day-cell type-${dayType}${d.getDate() === 1 && i > 0 ? ' month-start' : ''}`;

                const bar = document.createElement('div');
                bar.className = 'bar-segment';
                bar.dataset.date = dStr;
                bar.addEventListener('mouseenter', (e) => {
                    if (!Data.isVacation(p.id, dStr)) return;
                    const season = Data.getSeason(dStr, p);
                    const tt = document.getElementById('bar-tooltip');
                    tt.querySelector('.tt-name').textContent = p.name;
                    // Calcular rango continuo de la barra
                    const allBars = [...rowP.querySelectorAll('.bar-segment')];
                    const thisIdx = allBars.indexOf(bar);
                    let rangeStart = thisIdx, rangeEnd = thisIdx;
                    while (rangeStart > 0 && Data.isVacation(p.id, allBars[rangeStart - 1].dataset.date)) rangeStart--;
                    while (rangeEnd < allBars.length - 1 && Data.isVacation(p.id, allBars[rangeEnd + 1].dataset.date)) rangeEnd++;
                    const fmtDate = iso => { const [, m, d] = iso.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };
                    const startDate = allBars[rangeStart].dataset.date;
                    const endDate = allBars[rangeEnd].dataset.date;
                    tt.querySelector('.tt-range').textContent = startDate === endDate ? fmtDate(startDate) : `Del ${fmtDate(startDate)} al ${fmtDate(endDate)}`;
                    const seasonEl = tt.querySelector('.tt-season');
                    seasonEl.textContent = season === 'summer' ? '☀ Verano' : '❄ Invierno';
                    seasonEl.className = `tt-season ${season}`;
                    tt.classList.add('visible');
                });
                bar.addEventListener('mouseleave', () => {
                    document.getElementById('bar-tooltip').classList.remove('visible');
                });
                bar.addEventListener('mousemove', (e) => {
                    const tt = document.getElementById('bar-tooltip');
                    const offset = 14;
                    let x = e.clientX + offset, y = e.clientY + offset;
                    if (x + tt.offsetWidth > window.innerWidth) x = e.clientX - tt.offsetWidth - offset;
                    if (y + tt.offsetHeight > window.innerHeight) y = e.clientY - tt.offsetHeight - offset;
                    tt.style.left = x + 'px';
                    tt.style.top = y + 'px';
                });
                cellDay.appendChild(bar);

                cellDay.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    if (isPanoramic) { e.preventDefault(); togglePanoramicMode(dStr); return; }
                    isDragging = true; dragStartValue = !Data.isVacation(p.id, dStr);
                    // Capturamos snapshot y pid ANTES de mutar — empujamos en mouseup solo si hubo cambios reales
                    _dragPid = p.id;
                    _dragPersonName = p.name;
                    _dragVacSnapBefore = { ...Data.vacations() };
                    handleInteraction(p.id, dStr, bar, rowP, p);
                };
                cellDay.onmouseover = () => { if (isDragging && !isPanoramic) handleInteraction(p.id, dStr, bar, rowP, p); };
                rowP.appendChild(cellDay);
            });

            const tdSummer = document.createElement('div'); tdSummer.className = 'gantt-cell sticky-right col-summer';
            const tdWinter = document.createElement('div'); tdWinter.className = 'gantt-cell sticky-right col-winter';
            const tdStatus = document.createElement('div'); tdStatus.className = 'gantt-cell sticky-right col-status';

            rowP.appendChild(tdSummer); rowP.appendChild(tdWinter); rowP.appendChild(tdStatus);
            refreshRowVisuals(rowP, p);
            gridContainer.appendChild(rowP);
        });

        containerScroll.style.maxHeight = '';
        _updateLockUI();
        _updateVisibleLicenses();
    }

    function filterRows(val) {
        const normalize = S.norm;
        const term = normalize(val);
        const tokens = term.split(/\s+/).filter(t => t.length > 0);
        const allTokensMatch = (target) => tokens.every(t => target.includes(t));
        const rows = document.querySelectorAll('.person-row');

        // Encontrar áreas individuales que coincidan con el término
        let matchingAreas = new Set();
        if (tokens.length) {
            rows.forEach(row => {
                const areaLabel = row.dataset.areaLabel || '';
                areaLabel.split(',').map(a => a.trim()).filter(a => a).forEach(a => {
                    if (allTokensMatch(normalize(a))) matchingAreas.add(a.toLowerCase());
                });
            });
        }

        rows.forEach(row => {
            const nameMatch = tokens.length ? allTokensMatch(normalize(row.dataset.name)) : true;
            const areaVal = row.dataset.area || '';
            const areaDirectMatch = areaVal && allTokensMatch(normalize(areaVal));
            // peer: comparte al menos una área con las que matchearon
            const rowAreas = (row.dataset.areaLabel || '').split(',').map(a => a.trim().toLowerCase()).filter(a => a);
            const areaPeerMatch = rowAreas.some(a => matchingAreas.has(a));
            const matches = !tokens.length || nameMatch || areaDirectMatch || areaPeerMatch;
            if (matches) {
                row.style.display = '';
                requestAnimationFrame(() => row.classList.remove('filtered-out'));
            } else {
                row.classList.add('filtered-out');
                setTimeout(() => { if (row.classList.contains('filtered-out')) row.style.display = 'none'; }, 210);
            }
        });

        setTimeout(() => {
            const headerHeight = 84;
            const rowHeight = 35;
            const visibleRows = [...rows].filter(r => !r.classList.contains('filtered-out')).length;
            const newHeight = Math.min(window.innerHeight * 0.75, headerHeight + visibleRows * rowHeight + 20);
            containerScroll.style.maxHeight = newHeight + 'px';
        }, 10);
    }

    function clearFilter() {
        const input = document.getElementById('search-filter');
        if (input) { input.value = ''; filterRows(''); input.focus(); }
        setTimeout(() => { if (_onNavReset) _onNavReset(); }, 220);
    }

    function handleInteraction(pid, dateStr, barEl, rowEl, person) {
        if (!_unlockedIds.has(pid)) {
            const now = Date.now();
            if (now - toastDebounce > 1500) { UI.toast('Calendario bloqueado', 'info'); toastDebounce = now; }
            return;
        }
        if (dragStartValue && !person.unlimited) {
            const season = Data.getSeason(dateStr, person);
            const stats = Data.getRealTimeStats(person, currentViewYear);
            const now = Date.now();
            if (season === 'summer' && stats.s <= 0) { if (now - toastDebounce > 1000) { UI.toast("Sin días de Verano disponibles", "error"); toastDebounce = now; } return; }
            if (season === 'winter' && stats.w <= 0) { if (now - toastDebounce > 1000) { UI.toast("Sin días de Invierno disponibles", "error"); toastDebounce = now; } return; }
        }
        Data.setVacation(pid, dateStr, dragStartValue);
        refreshRowVisuals(rowEl, person);
    }

    function refreshRowVisuals(rowEl, person) {
        const bars = rowEl.querySelectorAll('.bar-segment');
        const pid = person.id;

        // Limpiar labels anteriores
        rowEl.querySelectorAll('.bar-range-label').forEach(el => el.remove());

        bars.forEach((bar, i) => {
            const date = bar.dataset.date;
            const isActive = Data.isVacation(pid, date);
            if (isActive) {
                const prevActive = bars[i - 1]?.dataset.date && Data.isVacation(pid, bars[i - 1]?.dataset.date);
                const nextActive = bars[i + 1]?.dataset.date && Data.isVacation(pid, bars[i + 1]?.dataset.date);

                // Obtenemos la temporada (retornará 'summer' o 'winter')
                const season = Data.getSeason(date, person);

                // Agregamos la temporada como clase CSS
                bar.className = `bar-segment active ${season}`;

                if (!prevActive && !nextActive) bar.classList.add('bar-single');
                else if (!prevActive && nextActive) bar.classList.add('bar-start');
                else if (prevActive && !nextActive) bar.classList.add('bar-end');
            } else { bar.className = 'bar-segment'; }
        });

        // Detectar rangos y colocar badge en la celda del medio
        let rangeStart = -1;
        for (let i = 0; i <= bars.length; i++) {
            const isActive = i < bars.length && Data.isVacation(pid, bars[i].dataset.date);
            if (isActive && rangeStart === -1) {
                rangeStart = i;
            } else if (!isActive && rangeStart !== -1) {
                const rangeEnd = i - 1;
                const count = rangeEnd - rangeStart + 1;
                const midIdx = Math.floor((rangeStart + rangeEnd) / 2);
                const midCell = bars[midIdx].closest('.day-cell');
                if (midCell) {
                    const label = document.createElement('span');
                    label.className = 'bar-range-label';
                    label.textContent = `${count} día${count !== 1 ? 's' : ''}`;
                    midCell.appendChild(label);
                }
                rangeStart = -1;
            }
        }
        const mode = getColumnMode();
        const stats = mode.getStats(person, currentViewYear, Data.vacations(), Data.getUsedCounts, Data.getYearConfig, Data.getSeason, fechaHoyLocal());
        const status = Data.getStatus(person, currentViewYear);
        const sText = (stats.s === Infinity) ? "∞" : stats.s;
        const wText = (stats.w === Infinity) ? "∞" : stats.w;
        const sColor = mode.colorize(stats.s);
        const wColor = mode.colorize(stats.w);
        const animClass = _animateCols ? 'anim-fade' : '';
        ['col-summer', 'col-winter'].forEach((cls, i) => {
            const cell = rowEl.querySelector('.' + cls);
            const val = i === 0 ? sText : wText;
            const color = i === 0 ? sColor : wColor;
            if (animClass) {
                cell.innerHTML = `<span class="toggle-label ${animClass}">${val}</span>`;
                cell.style.color = color;
            } else {
                cell.textContent = val;
                cell.style.color = color;
            }
        });
        rowEl.querySelector('.col-status').innerHTML = `<span class="badge ${status.cls}">${status.text}</span>`;
        const dot = rowEl.querySelector('.status-dot');
        if (dot) {
            dot.className = 'status-dot';
            dot.textContent = '';
            if (status.cls === 'curso') { dot.classList.add('active-curso'); }
            else if (status.cls === 'completa') { dot.classList.add('active-completa'); }
            else if (status.cls === 'libre') { dot.classList.add('active-libre'); dot.textContent = '!'; }
        }
    }

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            // Solo empujamos al historial si hubo un cambio real en las vacaciones
            if (_dragVacSnapBefore !== null) {
                const vacsAhora = Data.vacations();
                const hayDif = Object.keys(vacsAhora).some(k => !_dragVacSnapBefore[k]) ||
                    Object.keys(_dragVacSnapBefore).some(k => !vacsAhora[k]);
                if (hayDif) {
                    Historial.empujar(`${dragStartValue ? 'Asignar' : 'Quitar'} licencia — ${_dragPersonName}`);
                }
                _dragVacSnapBefore = null;
            }
            Data.notifyChange(); UI.refreshYearSelector && UI.refreshYearSelector();
        }
    });

    let _smoothScrollRaf = null;

    function smoothScrollTo(left) {
        const target = Math.max(0, Math.round(left));
        if (_smoothScrollRaf) { cancelAnimationFrame(_smoothScrollRaf); _smoothScrollRaf = null; }
        const start = containerScroll.scrollLeft;
        const dist = target - start;
        if (Math.abs(dist) < 1) { containerScroll.scrollLeft = target; return; }
        const duration = 350;
        const startTime = performance.now();
        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
        function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            containerScroll.scrollLeft = Math.round(start + dist * easeOut(progress));
            if (progress < 1) _smoothScrollRaf = requestAnimationFrame(step);
            else { containerScroll.scrollLeft = target; _smoothScrollRaf = null; }
        }
        _smoothScrollRaf = requestAnimationFrame(step);
    }

    function scrollToDate(dateStr) {
        const bars = document.querySelectorAll(`.bar-segment[data-date="${dateStr}"]`);
        let cell = null;
        for (const bar of bars) {
            const row = bar.closest('.gantt-row');
            if (row && row.style.display !== 'none') { cell = bar.closest('.day-cell'); break; }
        }
        if (!cell) {
            const bar = document.querySelector(`.bar-segment[data-date="${dateStr}"]`);
            if (bar) cell = bar.closest('.day-cell');
        }
        if (cell) smoothScrollTo(cell.offsetLeft - (containerScroll.clientWidth / 2) + 180);
    }

    function scrollToToday() {
        // 1. Verificamos si estamos en un año distinto al actual
        const now = new Date();
        if (now.getFullYear() !== currentViewYear) {
            document.getElementById('year-selector').value = now.getFullYear();
            changeYear(now.getFullYear());
            setTimeout(() => {
                const tNew = document.querySelector('.day-cell.type-today');
                if (tNew) smoothScrollTo(tNew.offsetLeft - (containerScroll.clientWidth / 2) + 180);
            }, 50);
            return;
        }

        // 2. Buscamos la celda de "Hoy"
        const allToday = document.querySelectorAll('.day-cell.type-today');
        let t = null;
        for (const cell of allToday) {
            const row = cell.closest('.gantt-row');
            if (row && row.style.display !== 'none') { t = cell; break; }
        }
        if (!t) t = allToday[0];

        if (t) {
            // Calculamos la posición destino de "Hoy"
            const targetToday = Math.max(0, Math.round(t.offsetLeft - (containerScroll.clientWidth / 2) + 180));
            const currentScroll = Math.round(containerScroll.scrollLeft);

            // Si la diferencia entre el scroll actual y el objetivo es mínima (estamos en Hoy)
            if (Math.abs(currentScroll - targetToday) <= 5) {
                // Saltamos al inicio (Enero)
                smoothScrollTo(0);
            } else {
                // Saltamos a Hoy
                smoothScrollTo(targetToday);
            }
        }
    }

    let scrollPendiente = 0;
    let rafScroll = null;

    function togglePanoramicMode(monthDate) {
        containerScroll.style.opacity = '0';
        setTimeout(() => {
            if (isPanoramic) {
                isPanoramic = false;
                gridContainer.classList.remove('panoramic-mode');
                containerScroll.style.overflowX = ''; // restaurar overflow-x:auto

                if (monthDate) {
                    const yearMonth = monthDate.substring(0, 7);
                    const allDayHeaders = gridContainer.querySelectorAll('.header-days .day-num-header');
                    const targetIdx = dateRange.findIndex(({ dateStr }) => dateStr.startsWith(yearMonth));
                    if (targetIdx >= 0 && allDayHeaders[targetIdx]) {
                        containerScroll.style.scrollBehavior = 'auto';
                        containerScroll.scrollLeft = allDayHeaders[targetIdx].offsetLeft - 220;
                        containerScroll.style.scrollBehavior = '';
                    }
                }
            } else {
                isPanoramic = true;
                gridContainer.classList.add('panoramic-mode');
                // Forzar overflow-x:scroll (en lugar de auto) para que position:sticky right
                // funcione aunque el grid no desborde horizontalmente en modo panorámico
                containerScroll.style.overflowX = 'scroll';
            }
            containerScroll.style.opacity = '1';
        }, 180);
    }

    containerScroll.addEventListener('wheel', (evt) => {
        if (evt.ctrlKey) {
            evt.preventDefault();
            togglePanoramicMode(null);
            return;
        }

        const target = evt.target;
        const isSticky = target.closest('.sticky-left') || target.closest('.sticky-right') || target.closest('.sticky-left-header') || target.closest('.sticky-right-header') || target.classList.contains('person-cell');

        if (!isSticky) {
            if (evt.deltaY !== 0) {
                evt.preventDefault();
                const speed = Data.config().scrollSpeed ?? 3;
                const dayWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--day-width')) || 38;
                let delta;
                if (evt.deltaMode === 0) delta = evt.deltaY * (speed / 3);
                else if (evt.deltaMode === 1) delta = evt.deltaY * dayWidth * speed;
                else delta = evt.deltaY * containerScroll.clientWidth * (speed / 3);

                scrollPendiente += delta;

                if (!rafScroll) {
                    rafScroll = requestAnimationFrame(() => {
                        containerScroll.scrollLeft += scrollPendiente;
                        scrollPendiente = 0;
                        rafScroll = null;
                    });
                }
            }
        }
    }, { passive: false });

    function unlockPerson(pid, forceState) {
        // forceState: true = forzar unlock, false = forzar lock, undefined = toggle
        const id = parseInt(pid);
        if (forceState === true || (forceState === undefined && !_unlockedIds.has(id))) {
            _unlockedIds.add(id);
        } else {
            _unlockedIds.delete(id);
        }
        _updateLockUI();
    }

    function _updateLockUI() {
        document.querySelectorAll('.person-row').forEach(row => row.classList.remove('gantt-unlocked'));
        _unlockedIds.forEach(id => {
            const row = document.querySelector(`.person-row[data-pid="${id}"]`);
            if (row) row.classList.add('gantt-unlocked');
        });
    }

    function refreshColumnMode() {
        const cellToggle = gridContainer.querySelector('.col-mode-toggle');
        if (cellToggle) {
            const mode = getColumnMode();
            const animClass = _animateCols ? 'anim-fade' : '';

            const labelEl = cellToggle.querySelector('.toggle-label');
            if (labelEl) {
                labelEl.classList.remove('anim-fade');
                void labelEl.offsetWidth;
                labelEl.className = `toggle-label ${animClass}`;
                labelEl.textContent = mode.label;
            }

            // --- NUEVO: Actualizar el ícono de pausa dinámicamente ---
            const pauseBtn = cellToggle.querySelector('.toggle-pause-btn');
            if (pauseBtn) {
                pauseBtn.innerHTML = _colModePaused
                    ? '<svg class="icon-sm"><use href="#icon-play" /></svg>'
                    : '<svg class="icon-sm"><use href="#icon-pause" /></svg>';
                pauseBtn.title = _colModePaused ? 'Reanudar rotación' : 'Pausar rotación';
            }
        }

        const people = Data.people();
        gridContainer.querySelectorAll('.person-row').forEach(rowEl => {
            const person = people.find(p => p.name.toLowerCase() === rowEl.dataset.name);
            if (person) refreshRowVisuals(rowEl, person);
        });
    }

    return { render, refreshColumnMode, scrollToToday, scrollToDate, filterRows, clearFilter, changeYear, refreshRow: refreshRowVisuals, togglePanoramicMode, isPanoramicActive: () => isPanoramic, closePanoramic: () => { if (isPanoramic) togglePanoramicMode(null); }, setContextMenuRowHandler: (fn) => { _onContextMenuRow = fn; }, setNavResetHandler: (fn) => { _onNavReset = fn; }, unlockPerson, isPersonUnlocked: (pid) => _unlockedIds.has(parseInt(pid)) };
})();

// --- UI UTILS MODULE ---
const UI = (function () {
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isD = document.body.classList.contains('dark-mode');
        localStorage.setItem(`${APP_KEY}_dark`, isD ? 'dark' : 'light');
        const icon = document.getElementById('theme-icon'), label = document.getElementById('theme-label');
        if (icon) icon.innerHTML = `<use href="#icon-${isD ? 'sun' : 'moon'}"/>`;
        if (label) label.textContent = isD ? 'Modo claro' : 'Modo oscuro';
    }

    const _toastQueue = [];
    let _toastRunning = false;
    let _toastLast = '';

    function toast(msg, type = '') {
        if (msg === _toastLast && _toastQueue.length === 0) return;
        _toastQueue.push({ msg, type });
        if (!_toastRunning) _toastNext();
    }

    function _toastNext() {
        if (!_toastQueue.length) { _toastRunning = false; _toastLast = ''; return; }
        _toastRunning = true;
        const { msg, type } = _toastQueue.shift();
        if (msg === _toastLast && !_toastQueue.length) { _toastNext(); return; }
        _toastLast = msg;
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show' + (type ? ' ' + type : '');

        // --- LÓGICA DE ACELERACIÓN ---
        const tiempoExposicion = _toastQueue.length >= 2 ? 1350 : 2700;

        setTimeout(() => {
            t.className = 'toast';
            setTimeout(_toastNext, 300);
        }, tiempoExposicion);
    }

    function $(id) { return document.getElementById(id); }

    function openPersonModal(fromGantt = false) {
        $('p-name').value = "";
        Areas.populateSelect('p-area', []);
        $('modal-new-person').dataset.fromGantt = fromGantt ? '1' : '';
        const btnBack = document.getElementById('btn-new-person-back');
        if (fromGantt) {
            btnBack.onclick = () => UI.closeModals();
            btnBack.innerHTML = '<svg class="icon"><use href="#icon-close"/></svg>Cerrar';
        } else {
            btnBack.onclick = () => UI.openConfig();
            btnBack.innerHTML = '<svg class="icon"><use href="#icon-undo"/></svg>Volver';
        }
        $('modal-new-person').classList.add('show');
        setTimeout(() => $('p-name').focus(), 50);
    }

    function editPerson(id) {
        const p = Data.people().find(x => x.id == id);
        $('ep-name').value = p.name;
        const pAreas = S.toAreaArray(p.area);
        Areas.populateSelect('ep-area', pAreas);
        $('modal-edit-person').dataset.id = id;
        const h3 = document.querySelector('#modal-edit-person h3'); if (h3) h3.textContent = p.name;

        // Poblar selector de años: año actual + siguiente + años con config propia + años con licencias
        const currentYear = new Date().getFullYear();
        const yearSet = new Set([currentYear, currentYear + 1]);
        if (p.years) Object.keys(p.years).forEach(y => yearSet.add(parseInt(y)));
        Data.vacacionesDe(p.id).forEach(f => yearSet.add(parseInt(f.split('-')[0])));
        const years = [...yearSet].sort((a, b) => a - b);
        const sel = $('ep-year-select');
        sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
        sel.value = currentYear;

        UI.loadYearConfig(currentYear);
        refreshVacList(id); $('modal-edit-person').classList.add('show');
        // Reflejar si esta persona ya tiene el gantt desbloqueado
        const btnEG = $('btn-edit-gantt');
        if (btnEG) {
            if (Gantt.isPersonUnlocked(id)) {
                btnEG.innerHTML = '<svg class="icon"><use href="#icon-close"/></svg>Bloquear Calendario';
                btnEG.classList.add('active');
            } else {
                btnEG.innerHTML = '<svg class="icon"><use href="#icon-edit"/></svg>Editar Calendario';
                btnEG.classList.remove('active');
            }
        }
        if (document.activeElement) document.activeElement.blur();
        setTimeout(() => $('ep-name').focus(), 50);
    }

    function loadYearConfig(year) {
        year = parseInt(year);
        const id = $('modal-edit-person').dataset.id;
        const p = Data.people().find(x => x.id == id);
        if (!p) return;
        const cfg = Data.config();
        const y = p.years && p.years[year];

        const hasCustomLimits = y && (y.summer !== undefined || y.winter !== undefined || y.unlimited !== undefined);
        const btnL = $('ep-custom-limits'), fieldsL = $('ep-limits-fields');
        const limitsCurrentlyOpen = btnL.classList.contains('active');
        if (hasCustomLimits) {
            $('ep-summer').value = y.summer !== undefined ? y.summer : cfg.defSummer;
            $('ep-winter').value = y.winter !== undefined ? y.winter : cfg.defWinter;
            y.unlimited ? $('ep-unlimited').classList.add('active') : $('ep-unlimited').classList.remove('active');
            if (!limitsCurrentlyOpen) animateSection(btnL, fieldsL, true);
            else { btnL.classList.add('active'); btnL.textContent = 'Sí'; }
        } else {
            $('ep-summer').value = cfg.defSummer; $('ep-winter').value = cfg.defWinter;
            $('ep-unlimited').classList.remove('active');
            if (limitsCurrentlyOpen) animateSection(btnL, fieldsL, false);
            else { btnL.classList.remove('active'); btnL.textContent = 'No'; }
        }
        UI.toggleEditLimits(hasCustomLimits && y && y.unlimited);

        const hasCustomSeason = y && (y.sStart !== undefined || y.sEnd !== undefined);
        const btnS = $('ep-custom-season'), fieldsS = $('ep-season-fields');
        const seasonCurrentlyOpen = btnS.classList.contains('active');
        if (hasCustomSeason) {
            $('ep-sStart').value = y.sStart !== undefined ? y.sStart : cfg.sStart;
            $('ep-sEnd').value = y.sEnd !== undefined ? y.sEnd : cfg.sEnd;
            if (!seasonCurrentlyOpen) animateSection(btnS, fieldsS, true);
            else { btnS.classList.add('active'); btnS.textContent = 'Sí'; }
        } else {
            $('ep-sStart').value = cfg.sStart; $('ep-sEnd').value = cfg.sEnd;
            if (seasonCurrentlyOpen) animateSection(btnS, fieldsS, false);
            else { btnS.classList.remove('active'); btnS.textContent = 'No'; }
        }
    }

    function refreshVacList(pid) {
        const person = Data.people().find(x => x.id == pid);
        const vacaciones = Data.vacacionesDe(pid), container = $('person-vac-items');
        container.innerHTML = '';
        const rangos = agruparEnRangos(vacaciones);
        rangos.forEach(r => {
            const item = document.createElement('div'); item.className = 'vac-item';
            const texto = r.inicio === r.fin ? formatearFecha(r.inicio) : `${formatearFecha(r.inicio)} → ${formatearFecha(r.fin)}`;
            const dias = r.dias === 1 ? '1 día' : `${r.dias} días`;
            const temporada = Data.getSeason(r.inicio, person) === 'summer' ? '☀️' : '❄️';
            item.innerHTML = `<span class="vac-item-text">${texto}</span><span class="vac-item-season">${temporada} ${dias}</span><button class="vac-item-delete" title="Eliminar rango">✕</button>`;
            item.classList.add('vac-item-clickable');
            item.onclick = (e) => {
                if (e.target.closest('.vac-item-delete')) return;
                UI.closeModals();
                const targetYear = parseInt(r.inicio.split('-')[0]), targetMonth = parseInt(r.inicio.split('-')[1]);
                const viewYear = targetMonth === 12 ? targetYear + 1 : targetYear;
                const sel = document.getElementById('year-selector');
                if (parseInt(sel.value) !== viewYear) {
                    sel.value = viewYear;
                    Gantt.changeYear(viewYear, () => Gantt.scrollToDate(r.inicio));
                } else {
                    setTimeout(() => Gantt.scrollToDate(r.inicio), 50);
                }
            };
            item.querySelector('.vac-item-delete').onclick = (e) => {
                e.stopPropagation();
                const p = Data.people().find(x => x.id == pid);
                Historial.empujar(`Eliminar licencia — ${p?.name || pid} (${r.inicio} → ${r.fin})`);
                eliminarRango(pid, r.inicio, r.fin); refreshVacList(pid);
                const personRow = document.querySelector(`.person-row[data-name="${Data.people().find(x => x.id == pid)?.name?.toLowerCase()}"]`);
                if (personRow) Gantt.refreshRow(personRow, Data.people().find(x => x.id == pid));
                Data.notifyChange(); refreshYearSelector();
            };
            container.appendChild(item);
        });
    }

    function eliminarRango(pid, inicio, fin) {
        let curr = new Date(inicio + 'T00:00:00'); const endD = new Date(fin + 'T00:00:00');
        while (curr <= endD) { Data.setVacation(pid, curr.toISOString().split('T')[0], false); curr.setDate(curr.getDate() + 1); }
    }

    function agruparEnRangos(fechas) {
        const sorted = [...fechas].sort(), rangos = [];
        if (!sorted.length) return rangos;
        let inicio = sorted[0], fin = sorted[0], dias = 1;
        for (let i = 1; i < sorted.length; i++) {
            const prev = new Date(sorted[i - 1]), curr = new Date(sorted[i]);
            if ((curr - prev) / 86400000 === 1) { fin = sorted[i]; dias++; } else { rangos.push({ inicio, fin, dias }); inicio = sorted[i]; fin = sorted[i]; dias = 1; }
        }
        rangos.push({ inicio, fin, dias });
        return rangos.sort((a, b) => b.inicio.localeCompare(a.inicio));
    }

    function toggleDateQuick(inputId) { const input = $(inputId); input.value = input.value ? '' : fechaHoyLocal(); }
    function formatearFecha(dateStr) { const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`; }
    function animateSection(btn, fields, enable) {
        if (enable) {
            btn.classList.add('active'); btn.textContent = 'Sí';
            fields.style.display = 'block';
            fields.style.overflow = 'hidden';
            fields.style.height = '0';
            fields.style.opacity = '0';
            const toH = fields.scrollHeight;
            requestAnimationFrame(() => {
                fields.style.transition = 'height 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease';
                fields.style.height = toH + 'px';
                fields.style.opacity = '1';
                setTimeout(() => { fields.style.transition = ''; fields.style.height = ''; fields.style.overflow = ''; fields.style.opacity = ''; }, 270);
            });
        } else {
            btn.classList.remove('active'); btn.textContent = 'No';
            const fromH = fields.scrollHeight;
            fields.style.height = fromH + 'px';
            fields.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                fields.style.transition = 'height 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease';
                fields.style.height = '0';
                fields.style.opacity = '0';
                setTimeout(() => { fields.style.transition = ''; fields.style.height = ''; fields.style.overflow = ''; fields.style.opacity = ''; fields.style.display = 'none'; }, 270);
            });
        }
    }

    function toggleCustomLimits(isActive) {
        const btn = $('ep-custom-limits'), fields = $('ep-limits-fields');
        if (!btn || !fields) return;
        animateSection(btn, fields, !isActive);
    }

    function toggleCustomSeason(isActive) {
        const btn = $('ep-custom-season'), fields = $('ep-season-fields');
        if (!btn || !fields) return;
        animateSection(btn, fields, !isActive);
    }
    function toggleEditLimits(unl) { $('ep-summer').disabled = unl; $('ep-winter').disabled = unl; }

    function toggleGanttEditMode() {
        const pid = parseInt($('modal-edit-person').dataset.id);
        const isUnlocked = Gantt.isPersonUnlocked(pid);
        if (isUnlocked) {
            // Bloquear solo esta persona
            Gantt.unlockPerson(pid, false);
            const btn = $('btn-edit-gantt');
            if (btn) { btn.innerHTML = '<svg class="icon"><use href="#icon-edit"/></svg>Editar Calendario'; btn.classList.remove('active'); }
            UI.toast('Calendario bloqueado', 'info');
        } else {
            // Desbloquear esta persona y cerrar modal
            Gantt.unlockPerson(pid, true);
            const person = Data.people().find(p => p.id === pid);
            closeModals();
            UI.toast(`Editando fila de ${person ? person.name : ''}`, 'success');
        }
    }

    function openHolidayModal() {
        closeModals();
        const sel = document.getElementById('year-selector');
        Holidays.renderList(sel ? parseInt(sel.value) : new Date().getFullYear());
        document.getElementById('modal-holidays').classList.add('show');
    }

    let _areasModalSource = null; // Guardará 'new-person', 'edit-person' o null

    function openAreasModal(source = null) {
        _areasModalSource = source;
        closeModals();
        Areas.renderList();
        $('modal-areas').classList.add('show');
        setTimeout(() => $('area-name-input').focus(), 100);
    }

    // Función para manejar el botón "Volver" con inteligencia
    function goBackFromAreas() {
        closeModals();
        if (_areasModalSource === 'new-person') {
            $('modal-new-person').classList.add('show');
        } else if (_areasModalSource === 'edit-person') {
            $('modal-edit-person').classList.add('show');
        } else if (_areasModalSource === 'ctx-selection') {
            // Volver al menú de selección no tiene sentido sin evento de mouse,
            // así que simplemente actualizamos la lista si el menú sigue visible
            Areas.refresh();
            _areasModalSource = null;
            return;
        } else {
            openConfig(); // Default: vuelve al menú de ajustes
        }
        _areasModalSource = null; // Reseteamos la memoria
    }

    function resetAll() {
        showConfirm(
            'Restablecer todo',
            'Se eliminarán todas las personas, licencias, feriados, áreas y configuración. Esta acción no se puede deshacer.',
            () => {
                localStorage.removeItem(`${APP_KEY}_data_v1`);
                localStorage.removeItem(`${APP_KEY}_holidays_v1`);
                localStorage.removeItem(`${APP_KEY}_areas_v1`);
                location.reload();
            }
        );
    }

    function openConfig() {
        closeModals();
        const c = Data.config();
        $('conf-summer').value = c.defSummer; $('conf-winter').value = c.defWinter;
        $('conf-s-start').value = c.sStart; $('conf-s-end').value = c.sEnd;
        const spd = c.scrollSpeed ?? 3; $('conf-scroll-speed').value = spd; $('conf-scroll-speed-label').textContent = spd;
        $('modal-config').classList.add('show');
    }

    function openGist() {
        closeModals();
        GistSync.poblarModal();
        $('modal-gist').classList.add('show');
    }

    function closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    }

    function goBack() {
        const modal = document.querySelector('.modal.show');
        if (!modal) return;
        const btnBack = modal.querySelector('button svg use[href="#icon-undo"]')?.closest('button');
        if (btnBack) btnBack.click();
        else closeModals();
    }
    function initYearSelector() { refreshYearSelector(); }

    function refreshYearSelector() {
        const sel = document.getElementById('year-selector'), current = new Date().getFullYear();
        const currentVal = parseInt(sel.value) || current;
        const vacYears = new Set(Object.keys(Data.vacations()).map(k => parseInt(k.split('-')[1])).filter(y => !isNaN(y) && y > 1900));
        vacYears.add(current);
        const years = Array.from(vacYears).sort((a, b) => a - b);
        sel.innerHTML = '';
        years.forEach(y => {
            const opt = document.createElement('option'); opt.value = y; opt.textContent = y;
            if (y === currentVal) opt.selected = true; sel.appendChild(opt);
        });
        if (!years.includes(currentVal)) { sel.value = current; }
    }

    function toggleAddRangeForm(forceOpen) {
        const form = $('add-range-form');
        if (forceOpen !== undefined ? forceOpen : !form.classList.contains('open')) {
            form.classList.add('open');
            const hoy = new Date();
            const hoyStr = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`;
            if (!$('range-start').value) $('range-start').value = hoyStr;
            if (!$('range-end').value) $('range-end').value = hoyStr;
            setTimeout(() => $('range-start').focus(), 50);
        } else { form.classList.remove('open'); }
    }

    function confirmAddRange() {
        const pid = $('modal-edit-person').dataset.id;
        if (!pid) return UI.toast("Guarda la persona primero", "info");
        const anioDefault = parseInt(document.getElementById('year-selector')?.value || new Date().getFullYear());
        const start = Holidays.parsearFechaLibre($('range-start').value || '', anioDefault);
        const end = Holidays.parsearFechaLibre($('range-end').value || '', anioDefault);
        if (!start) return UI.toast("Fecha 'Desde' inválida", "info");
        if (!end) return UI.toast("Fecha 'Hasta' inválida", "info");
        if (start > end) return UI.toast("La fecha de inicio debe ser ≤ fin", "info");

        const person = Data.people().find(x => x.id == pid);
        if (!person) return;

        let curr = new Date(start + 'T00:00:00'), endD = new Date(end + 'T00:00:00'), added = 0;
        while (curr <= endD) {
            const dStr = curr.toISOString().split('T')[0];
            if (!Data.isVacation(pid, dStr)) {
                if (!person.unlimited) {
                    const season = Data.getSeason(dStr, person), stats = Data.getRealTimeStats(person, parseInt(dStr.split('-')[0]));
                    if (season === 'summer' && stats.s <= 0 || season === 'winter' && stats.w <= 0) { curr.setDate(curr.getDate() + 1); continue; }
                }
                Data.setVacation(pid, dStr, true); added++;
            }
            curr.setDate(curr.getDate() + 1);
        }
        if (added > 0) Historial.empujar(`Agregar licencias — ${person.name} (${start} → ${end})`);
        Data.notifyChange(); Gantt.render(); refreshYearSelector();
        $('range-start').value = ''; $('range-end').value = '';
        refreshVacList(pid);
        UI.toast(added > 0 ? ` ${added} día(s) agregado(s)` : " Sin días disponibles en ese rango", added > 0 ? "success" : "info");
    }

    let _parsedImportData = null;
    function openImportModal() {
        _parsedImportData = null;
        $('import-dropzone-text').textContent = '📂 Tocá para seleccionar un archivo JSON';
        $('import-dropzone').classList.remove('has-file');
        $('btn-import-replace').disabled = true; $('btn-import-merge').disabled = true;
        if ($('import-file-input')) $('import-file-input').value = '';
        UI.closeModals(); $('modal-import').classList.add('show');
        setTimeout(() => { const f = $('import-file-input'); if (f) f.click(); }, 200);
    }

    let _confirmParent = null;
    function showConfirm(title, msg, onOk) {
        // Recordar el modal padre que estaba abierto (si hay alguno)
        _confirmParent = document.querySelector('.modal.show:not(#modal-confirm)') || null;
        if (_confirmParent) _confirmParent.classList.remove('show');
        $('confirm-title').textContent = title;
        $('confirm-msg').textContent = msg;
        $('confirm-ok').onclick = () => { closeConfirm(); onOk(); };
        $('modal-confirm').classList.add('show');
    }

    function closeConfirm() {
        $('modal-confirm').classList.remove('show');
        // Restaurar el modal padre si había uno
        if (_confirmParent) { _confirmParent.classList.add('show'); _confirmParent = null; }
    }

    function onImportFileSelected(input) {
        const file = input.files[0]; if (!file) return;
        if (file.size > S.SECURITY_LIMITS.MAX_JSON_SIZE) { UI.toast("Archivo demasiado grande", "error"); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result, (k, v) => ['__proto__', 'constructor', 'prototype'].includes(k) ? undefined : v);
                if (!data || typeof data !== 'object' || Array.isArray(data.people) === false) throw "Estructura inválida";

                // Verificar versión
                if (data.version !== undefined && data.version !== S.SECURITY_LIMITS.SCHEMA_VERSION) {
                    UI.toast(`Versión de backup incompatible (v${data.version})`, "error"); return;
                }

                const proceder = () => {
                    _parsedImportData = data;
                    $('import-dropzone-text').textContent = `✓ ${file.name} (${data.people.length} persona(s))`;
                    $('import-dropzone').classList.add('has-file');
                    $('btn-import-replace').disabled = false; $('btn-import-merge').disabled = false;
                };

                // Verificar hash
                if (data.hash) {
                    const payload = { people: data.people, vacations: data.vacations, config: data.config };
                    const hashCalculado = await S.calcularHashSHA256(payload);
                    if (hashCalculado !== data.hash) {
                        UI.showConfirm(
                            '⚠ Hash no coincide',
                            'El archivo fue modificado manualmente o está corrupto. El hash de integridad no coincide con el contenido. ¿Querés importarlo de todos modos?',
                            proceder
                        );
                        return;
                    }
                } else {
                    UI.showConfirm(
                        'Backup sin verificación',
                        'Este archivo no tiene hash de integridad, posiblemente es un backup antiguo. ¿Querés importarlo de todos modos?',
                        proceder
                    );
                    return;
                }

                proceder();
            } catch (err) { UI.toast("Error al leer el archivo", "error"); }
        };
        reader.readAsText(file);
    }

    function confirmImport(mode) { if (_parsedImportData) Data.importData(_parsedImportData, mode); _parsedImportData = null; }

    return { toggleTheme, toast, openPersonModal, editPerson, closeModals, goBack, openConfig, openGist, toggleEditLimits, toggleCustomLimits, toggleCustomSeason, loadYearConfig, initYearSelector, refreshYearSelector, toggleAddRangeForm, confirmAddRange, refreshVacList, toggleDateQuick, openHolidayModal, openAreasModal, resetAll, openImportModal, onImportFileSelected, confirmImport, showConfirm, closeConfirm, toggleGanttEditMode, goBackFromAreas };
})();

// --- HOLIDAYS MODULE ---
const Holidays = (function () {
    const LS_KEY = `${APP_KEY}_holidays_v1`; let data = {};
    function cargar() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { data = {}; return; }
            // Validar y sanear cada entrada
            data = {};
            for (const [year, yearData] of Object.entries(parsed)) {
                if (!/^\d{4}$/.test(year) || typeof yearData !== 'object') continue;
                data[year] = {};
                for (const [dateStr, name] of Object.entries(yearData)) {
                    if (!S.validarFechaSegura(dateStr)) continue;
                    data[year][dateStr] = S.sanitizeString(String(name), 60) || 'Feriado';
                }
                if (!Object.keys(data[year]).length) delete data[year];
            }
        } catch (e) { data = {}; }
    }
    function persistir() { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { } }
    function getYear(year) { return data[year] || {}; }
    function isHoliday(dateStr) { const year = dateStr.substring(0, 4); return !!(data[year] && data[year][dateStr]); }

    function parsearFechaLibre(token, anioDefault) {
        const partes = token.trim().replace(/[-\.]/g, '/').split('/').map(p => parseInt(p, 10));
        if (partes.length < 2 || partes.some(isNaN)) return null;
        let [d, m, a] = partes; if (!a) a = anioDefault; else if (a < 100) a = 2000 + a;
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function add() {
        const rawDates = document.getElementById('holiday-date-input').value.trim();
        const name = S.sanitizeString(document.getElementById('holiday-name-input').value.trim(), 60) || 'Feriado';
        if (!rawDates) return UI.toast('Ingresá al menos una fecha', 'info');

        const anioDefault = parseInt(document.getElementById('holiday-year-selector')?.value || document.getElementById('year-selector')?.value || new Date().getFullYear());
        const agregadas = [], duplicadas = [], invalidas = [];
        rawDates.split(',').forEach(token => {
            const iso = parsearFechaLibre(token, anioDefault);
            if (!iso) { invalidas.push(token.trim()); return; }
            const year = iso.substring(0, 4);
            if (data[year] && data[year][iso]) { duplicadas.push(iso); return; }
            if (!data[year]) data[year] = {};
            data[year][iso] = name; agregadas.push(iso);
        });

        // Solo errores, nada se agregó
        if (!agregadas.length) {
            if (invalidas.length) return UI.toast(`Fecha(s) inválida(s): ${invalidas.join(', ')}`, 'error');
            if (duplicadas.length) return UI.toast(duplicadas.length === 1 ? `"${duplicadas[0]}" ya existe` : `${duplicadas.length} fechas ya existen`, 'error');
            return;
        }

        persistir(); document.getElementById('holiday-name-input').value = ''; document.getElementById('holiday-date-input').value = '';
        renderList(parseInt(agregadas[0].substring(0, 4))); Gantt.render();

        const partes = [];
        if (agregadas.length) partes.push(`${agregadas.length === 1 ? '1 feriado agregado' : `${agregadas.length} feriados agregados`}`);
        if (duplicadas.length) partes.push(`${duplicadas.length} duplicado${duplicadas.length > 1 ? 's' : ''}`);
        if (invalidas.length) partes.push(`${invalidas.length} inválido${invalidas.length > 1 ? 's' : ''}`);
        UI.toast(`✓ ${partes.join(' · ')}`, duplicadas.length || invalidas.length ? 'info' : 'success');
    }

    function remove(dateStr) {
        const year = dateStr.substring(0, 4);
        if (data[year]) { delete data[year][dateStr]; if (Object.keys(data[year]).length === 0) delete data[year]; persistir(); }
        renderList(parseInt(document.getElementById('holiday-year-selector')?.value || document.getElementById('year-selector')?.value || new Date().getFullYear())); Gantt.render();
    }

    function renderList(year) {
        const list = document.getElementById('holiday-list');
        const sel = document.getElementById('holiday-year-selector');
        if (!list) return;
        if (sel) {
            if (!sel.options.length) {
                const currentYear = new Date().getFullYear();
                for (let y = currentYear - 1; y <= currentYear + 1; y++) {
                    const opt = document.createElement('option');
                    opt.value = y; opt.textContent = y;
                    sel.appendChild(opt);
                }
            }
            sel.value = year;
        }

        // 1. Fijar altura actual como punto de partida
        const fromH = list.getBoundingClientRect().height;
        list.style.transition = 'none';
        list.style.height = fromH + 'px';
        list.style.overflow = 'hidden';

        // 2. Fade out
        requestAnimationFrame(() => {
            list.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            list.style.opacity = '0';
            list.style.transform = 'translateY(-5px)';
        });

        setTimeout(() => {
            // 3. Actualizar contenido con height:auto temporalmente para medir
            list.style.transition = 'none';
            list.style.height = 'auto';
            const holidays = getYear(year), sorted = Object.keys(holidays).sort();
            if (sorted.length === 0) {
                list.innerHTML = `<div class="empty-state-msg">No hay feriados cargados para ${year}.</div>`;
            } else {
                list.innerHTML = sorted.map(d => `<div class="holiday-item"><span class="holiday-date">${d.split('-')[2]}/${d.split('-')[1]}/${d.split('-')[0]}</span><span class="holiday-name">${S.escapeHTML(holidays[d])}</span><button class="btn-remove-holiday" data-date="${d}" title="Eliminar">✕</button></div>`).join('');
                if (!list._delegated) {
                    list._delegated = true;
                    list.addEventListener('click', (e) => {
                        const btn = e.target.closest('.btn-remove-holiday');
                        if (btn) Holidays.remove(btn.dataset.date);
                    });
                }
            }
            // 4. Medir nueva altura y volver al fromH antes de animar
            const toH = list.scrollHeight;
            list.style.height = fromH + 'px';

            requestAnimationFrame(() => {
                list.style.transition = 'height 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease, transform 0.2s ease';
                list.style.height = toH + 'px';
                list.style.opacity = '1';
                list.style.transform = 'translateY(0)';
                setTimeout(() => {
                    list.style.transition = '';
                    list.style.height = '';
                    list.style.overflow = '';
                }, 270);
            });
        }, 160);
    }

    return {
        cargar, isHoliday, getYear, add, remove, renderList, parsearFechaLibre, getAll: () => data, importAll: (rawData) => {
            if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return;
            data = {};
            for (const [year, yearData] of Object.entries(rawData)) {
                if (!/^\d{4}$/.test(year) || typeof yearData !== 'object') continue;
                data[year] = {};
                for (const [dateStr, name] of Object.entries(yearData)) {
                    if (!S.validarFechaSegura(dateStr)) continue;
                    data[year][dateStr] = S.sanitizeString(String(name), 60) || 'Feriado';
                }
                if (!Object.keys(data[year]).length) delete data[year];
            }
            persistir(); Gantt.render();
        }
    };
})();

// Alias corto — la implementación vive en S.fechaHoyLocal()
const fechaHoyLocal = S.fechaHoyLocal;

// --- HISTORIAL MODULE (undo/redo) ---
const Historial = (function () {
    const MAX = 30;
    let _pasado = [];
    let _futuro = [];

    function _snap() {
        return JSON.parse(JSON.stringify({
            people: Data.people(),
            vacations: Data.vacations(),
            config: Data.config()
        }));
    }

    function _actualizarBotones() {
        const u = document.getElementById('btn-undo');
        const r = document.getElementById('btn-redo');
        if (u) u.disabled = _pasado.length === 0;
        if (r) r.disabled = _futuro.length === 0;
    }

    // Llamar ANTES de mutar datos
    function empujar(label) {
        _pasado.push({ snap: _snap(), label });
        if (_pasado.length > MAX) _pasado.shift();
        _futuro = [];
        _actualizarBotones();
    }

    function _aplicar(snap) {
        Data.loadFromObj(snap);
        Data.setLoaded();
        Data.notifyChange();
        UI.refreshYearSelector && UI.refreshYearSelector();
    }

    function undo() {
        if (!_pasado.length) return;
        const entrada = _pasado.pop();
        _futuro.push({ snap: _snap(), label: entrada.label });
        if (_futuro.length > MAX) _futuro.shift();
        _aplicar(entrada.snap);
        _actualizarBotones();
        UI.toast(`Deshecho: ${entrada.label}`, 'info');
    }

    function redo() {
        if (!_futuro.length) return;
        const entrada = _futuro.pop();
        _pasado.push({ snap: _snap(), label: entrada.label });
        if (_pasado.length > MAX) _pasado.shift();
        _aplicar(entrada.snap);
        _actualizarBotones();
        UI.toast(`Rehecho: ${entrada.label}`, 'info');
    }

    return { empujar, undo, redo };
})();

// --- GIST SYNC MODULE ---
const GistSync = (function () {
    const CFG_KEY = `${APP_KEY}_gist_cfg`;
    const FILENAME = 'licencias_data.json';
    const DEBOUNCE_MS = 3000;
    const RE_GIST_ID = /^[a-f0-9]{20,40}$/i;

    let _cfg = { token: '', gistId: '', lastSync: null, auto: false };
    let _debounceTimer = null;
    let _subiendo = false;

    // ── Valida completamente el payload remoto antes de cualquier importación ──
    function _validarPayloadRemoto(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Formato de payload inválido';
        if (!Array.isArray(raw.people)) return 'El campo "people" no es un array';
        if (raw.people.length > S.SECURITY_LIMITS.MAX_PERSONAS) return `El payload supera el límite de ${S.SECURITY_LIMITS.MAX_PERSONAS} personas`;
        for (const p of raw.people) {
            if (!S.validarPersonaSegura(p)) return `Persona con datos inválidos (id: ${p?.id ?? 'desconocido'})`;
        }
        if (raw.vacations !== undefined) {
            if (typeof raw.vacations !== 'object' || Array.isArray(raw.vacations)) return 'El campo "vacations" no es un objeto';
            for (const k of Object.keys(raw.vacations)) {
                if (!S.validarVacationKey(k)) return `Clave de vacación inválida: "${k}"`;
            }
        }
        if (raw.config !== undefined && (typeof raw.config !== 'object' || Array.isArray(raw.config))) {
            return 'El campo "config" no es un objeto';
        }
        if (raw.version !== undefined && raw.version !== S.SECURITY_LIMITS.SCHEMA_VERSION) {
            return `Versión de esquema incompatible (esperada: ${S.SECURITY_LIMITS.SCHEMA_VERSION}, recibida: ${raw.version})`;
        }
        return null;
    }

    // ── Convierte códigos HTTP en mensajes amigables sin revelar infraestructura ──
    function _mensajeErrorHTTP(status) {
        if (status === 401 || status === 403) return 'Token inválido o sin permisos suficientes';
        if (status === 404) return 'Gist no encontrado. Verificá el ID';
        if (status === 422) return 'Datos rechazados por GitHub. Verificá el contenido';
        if (status >= 500) return 'El servicio de GitHub no está disponible. Intentá más tarde';
        return 'Error de conexión. Verificá tu acceso a internet';
    }

    function _cargarCfg() {
        try {
            const raw = localStorage.getItem(CFG_KEY);
            if (raw) { const c = JSON.parse(raw); if (c) _cfg = { ..._cfg, ...c }; }
        } catch (_) { }
        _actualizarBotonesConfig();
    }

    function _guardarCfg() {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(_cfg)); } catch (_) { }
    }

    // ── Detección de cambios compartida (config, personas, vacs nuevas) ──
    function _detectarCambiosBasico(remotoRaw) {
        const localConfig = Data.config();
        const localPeople = Data.people();
        const localVacs = Data.vacations();
        const configCambio = JSON.stringify(remotoRaw.config) !== JSON.stringify(localConfig);
        const personasDiff = (remotoRaw.people || []).filter(p => {
            const local = localPeople.find(lp => String(lp.id) === String(p.id));
            if (!local) return S.validarPersonaSegura(p);
            return JSON.stringify(p.years) !== JSON.stringify(local.years) ||
                p.name !== local.name ||
                JSON.stringify(p.area) !== JSON.stringify(local.area);
        });
        const vacsNuevas = Object.keys(remotoRaw.vacations || {}).filter(k =>
            S.validarVacationKey(k) && !localVacs[k]
        );
        return { configCambio, personasDiff, vacsNuevas };
    }

    // ── Arma el modal de novedades y lo muestra ──────────
    // chips: array de { label, count } — el llamador decide qué mostrar
    // onOk: callback al confirmar
    // delay: ms antes de mostrar (0 = inmediato)
    function _mostrarModalNovedades(chips, onOk, delay = 0) {
        const detalle = document.getElementById('gist-novedades-detalle');
        if (detalle) {
            detalle.innerHTML = chips.map(c =>
                `<div class="gist-novedades-chip"><span class="gist-novedades-chip-label">${c.label}</span><span class="gist-novedades-chip-count">${c.count}</span></div>`
            ).join('');
        }
        const btnOk = document.getElementById('gist-novedades-ok');
        if (btnOk) btnOk.onclick = onOk;
        const show = () => document.getElementById('modal-gist-novedades')?.classList.add('show');
        if (delay) setTimeout(show, delay); else show();
    }

    // ── Spinner en el botón de config principal ──────────
    function _spinStart() {
        document.getElementById('btn-open-config')?.classList.add('icon-btn-spinning');
    }
    function _spinStop() {
        document.getElementById('btn-open-config')?.classList.remove('icon-btn-spinning');
    }

    // ── UI helpers ───────────────────────────────────────
    function _setBusy(busy) {
        _subiendo = busy;
        ['btn-gist-subir', 'btn-gist-bajar'].forEach(id => {
            const b = document.getElementById(id); if (b) b.disabled = busy;
        });
        if (busy) _spinStart(); else _spinStop();
    }

    function _setStatus(msg) {
        const el = document.getElementById('gist-sync-status'); if (el) el.textContent = msg;
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
        if (id) { btn.href = `https://gist.github.com/${id}`; btn.style.display = 'flex'; }
        else btn.style.display = 'none';
    }

    function _actualizarToggleUI() {
        const t = document.getElementById('gist-autosync-toggle');
        if (t) t.classList.toggle('on', !!_cfg.auto);
    }

    // ── Mostrar/ocultar botones rápidos en modal Config ──
    function _actualizarBotonesConfig() {
        const tieneToken = !!((_cfg.token || '').trim());
        const tieneGistId = !!((_cfg.gistId || '').trim());
        const btnUp = document.getElementById('btn-config-gist-subir');
        const btnDn = document.getElementById('btn-config-gist-bajar');
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
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        if (icon) icon.setAttribute('href', show ? '#icon-eye-off' : '#icon-eye');
    }

    // ── Toggle auto-sync ─────────────────────────────────
    function toggleAuto() {
        // Solo cambiamos la clase CSS visualmente. El guardado real se hace en guardarConfig()
        const t = document.getElementById('gist-autosync-toggle');
        if (t) t.classList.toggle('on');
    }

    // ── Guardar config ───────────────────────────────────
    function guardarConfig() {
        const tokenEl = document.getElementById('gist-token');
        const idEl = document.getElementById('gist-id');
        const toggleEl = document.getElementById('gist-autosync-toggle');

        const nuevoToken = tokenEl?.value.trim() || '';
        const nuevoGistId = idEl?.value.trim() || '';
        const nuevoAuto = toggleEl ? toggleEl.classList.contains('on') : false;

        if (nuevoGistId && !RE_GIST_ID.test(nuevoGistId)) {
            UI.toast('El Gist ID tiene un formato inválido', 'error');
            if (idEl) idEl.classList.add('error');
            return;
        }

        const tokenActual = _cfg.token || '';
        const idActual = _cfg.gistId || '';
        const autoActual = !!_cfg.auto;

        if (tokenActual === nuevoToken && idActual === nuevoGistId && autoActual === nuevoAuto) {
            UI.closeModals();
            UI.toast('Sin cambios', 'info');
            return;
        }

        _cfg.token = nuevoToken;
        _cfg.gistId = nuevoGistId;
        _cfg.auto = nuevoAuto;
        _guardarCfg();
        _actualizarBotonesConfig();

        if (autoActual !== nuevoAuto) {
            UI.toast(nuevoAuto ? 'Configuración guardada. Sincronización automática activada' : 'Configuración guardada. Sincronización automática desactivada');
        } else {
            UI.toast('Configuración guardada');
        }

        UI.closeModals();
    }

    // ── Limpia propiedades legacy del objeto persona antes de subir ──
    // Las personas creadas antes de la migración a `years` tienen summer/winter/unlimited
    // directamente en el objeto, lo que hace fallar validarPersonaSegura() al importar.
    function _cleanPeople() {
        return Data.people().map(p => {
            const obj = { id: p.id, name: p.name };
            if (p.area !== undefined) obj.area = p.area;
            if (p.years && Object.keys(p.years).length) obj.years = p.years;
            return obj;
        });
    }

    // ── Núcleo de subida (compartido por manual y auto) ──
    async function _ejecutarSubida(silencioso = false) {
        const token = _cfg.token, gistId = _cfg.gistId;
        if (!token) { if (!silencioso) UI.toast('Ingresá el token primero', 'error'); return; }
        if (gistId && !RE_GIST_ID.test(gistId)) { if (!silencioso) UI.toast('Gist ID inválido', 'error'); return; }

        _setBusy(true);
        if (!silencioso) _setStatus('Subiendo…');

        const payload = JSON.stringify({
            people: _cleanPeople(),
            vacations: Data.vacations(),
            config: Data.config(),
            holidays: Holidays.getAll(),
            areas: Areas.getAll(),
            fecha: S.fechaLocalISO(),
            version: S.SECURITY_LIMITS.SCHEMA_VERSION,
            timestamp: Date.now()
        }, null, 2);
        const body = { files: { [FILENAME]: { content: payload } } };

        try {
            let res;
            if (gistId) {
                res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                body.description = 'Licencias — Control de Vacaciones';
                body.public = false;
                res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            }

            if (!res.ok) throw new Error(_mensajeErrorHTTP(res.status));
            const data = await res.json();

            if (!gistId && data.id) {
                _cfg.gistId = data.id;
                const el = document.getElementById('gist-id'); if (el) el.value = data.id;
                _actualizarLinkBtn();
            }
            _cfg.lastSync = new Date().toISOString();
            _guardarCfg();
            _setStatusSync();
            if (!silencioso) UI.toast('Datos subidos a Gist', 'success');

        } catch (err) {
            _setStatus('Error al subir');
            if (!silencioso) UI.toast(`Error al subir: ${err.message}`, 'error');
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
        _debounceTimer = setTimeout(() => { if (!_subiendo) _ejecutarSubida(true); }, DEBOUNCE_MS);
    }

    // ── BAJAR ────────────────────────────────────────────
    async function bajar() {
        const token = document.getElementById('gist-token')?.value.trim() || _cfg.token;
        const gistId = document.getElementById('gist-id')?.value.trim() || _cfg.gistId;
        if (!gistId) { UI.toast('Ingresá el Gist ID primero', 'error'); return; }
        if (!RE_GIST_ID.test(gistId)) { UI.toast('Gist ID inválido', 'error'); return; }

        _setBusy(true); _setStatus('Bajando…');

        try {
            const headers = {};
            if (token) headers['Authorization'] = `token ${token}`;

            const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
            if (!res.ok) throw new Error(_mensajeErrorHTTP(res.status));
            const data = await res.json();

            const file = data.files?.[FILENAME];
            if (!file) throw new Error(`No se encontró "${FILENAME}" en el Gist`);

            let contenido = file.content;
            if (file.truncated) {
                const rawOrigin = new URL(file.raw_url).hostname;
                if (!rawOrigin.endsWith('.githubusercontent.com')) throw new Error('Origen de descarga no permitido');
                const r2 = await fetch(file.raw_url); contenido = await r2.text();
            }

            if (contenido.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) throw new Error('El archivo del Gist excede el tamaño máximo permitido');
            const remotoRaw = JSON.parse(contenido);

            const errorValidacion = _validarPayloadRemoto(remotoRaw);
            if (errorValidacion) throw new Error(`Payload inválido: ${errorValidacion}`);

            const { configCambio, personasDiff, vacsNuevas } = _detectarCambiosBasico(remotoRaw);

            // bajar() también detecta vacaciones eliminadas (que verificarAlAbrir no hace)
            const remoteIds = new Set((remotoRaw.people || []).map(p => String(p.id)));
            const vacsEliminadas = Object.keys(Data.vacations()).filter(k => {
                const pid = k.split('-')[0];
                return remoteIds.has(pid) && !remotoRaw.vacations?.[k];
            });
            const vacsCambiadas = vacsNuevas.length + vacsEliminadas.length;

            if (!configCambio && personasDiff.length === 0 && vacsCambiadas === 0) {
                _cfg.token = token; _cfg.gistId = gistId;
                _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
                UI.toast('Sin cambios', 'info'); _setBusy(false); return;
            }

            const chips = [];
            if (configCambio) chips.push({ label: 'Configuración', count: 'Dif.' });
            if (personasDiff.length) chips.push({ label: 'Personas', count: `${personasDiff.length} act.` });
            if (vacsCambiadas > 0) chips.push({ label: 'Licencias', count: `${vacsCambiadas} dif.` });

            _mostrarModalNovedades(chips, () => {
                Historial.empujar('Sincronización híbrida desde Gist');
                Data.importData(remotoRaw, 'hybrid');
                _cfg.token = token; _cfg.gistId = gistId;
                _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
                document.getElementById('modal-gist-novedades')?.classList.remove('show');
            });
            _setBusy(false);

        } catch (err) {
            _setStatus('Error al bajar');
            UI.toast(`Error al bajar: ${err.message}`, 'error');
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
        if (_cfg.lastSync) _setStatusSync(); else _setStatus('');
    }

    async function verificarAlAbrir() {
        if (!_cfg.auto || !_cfg.gistId) return;
        _spinStart();
        try {
            const headers = {};
            if (_cfg.token) headers['Authorization'] = `token ${_cfg.token}`;

            const res = await fetch(`https://api.github.com/gists/${_cfg.gistId}`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            const file = data.files?.[FILENAME];
            if (!file) return;

            let contenido = file.content;
            if (file.truncated) {
                const rawOrigin = new URL(file.raw_url).hostname;
                if (!rawOrigin.endsWith('.githubusercontent.com')) return;
                const r2 = await fetch(file.raw_url); contenido = await r2.text();
            }

            if (contenido.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) return;
            const remotoRaw = JSON.parse(contenido);
            if (_validarPayloadRemoto(remotoRaw) !== null) return;

            const { configCambio, personasDiff, vacsNuevas } = _detectarCambiosBasico(remotoRaw);
            if (!configCambio && !personasDiff.length && !vacsNuevas.length) return;

            const chips = [];
            if (configCambio) chips.push({ label: 'Configuración', count: 'Actualizar' });
            if (personasDiff.length) chips.push({ label: 'Personas/Límites', count: `+${personasDiff.length}` });
            if (vacsNuevas.length) chips.push({ label: 'Licencias', count: `+${vacsNuevas.length}` });

            _mostrarModalNovedades(chips, () => {
                Historial.empujar('Sincronización automática desde Gist');
                Data.importData(remotoRaw, 'hybrid');
                _cfg.lastSync = new Date().toISOString(); _guardarCfg(); _setStatusSync();
                document.getElementById('modal-gist-novedades')?.classList.remove('show');
            }, 600);

        } catch (_) { } finally { _spinStop(); }
    }

    function init() {
        _cargarCfg();
        const idEl = document.getElementById('gist-id');
        if (idEl) idEl.addEventListener('input', _actualizarLinkBtn);
        _actualizarBotonesConfig();
    }

    return { init, subir, subirAuto, bajar, guardarConfig, toggleToken, toggleAuto, poblarModal, verificarAlAbrir, actualizarBotonesConfig: _actualizarBotonesConfig };
})();

// --- CONTEXT MENU MODULE ---
const CtxMenu = (function () {
    let _pid = null;
    const menu = () => document.getElementById('ctx-menu');

    // ── Helpers de posicionamiento ────────────────────────
    function _position(e) {
        const m = menu();
        if (!m) return;
        m.classList.remove('show');
        m.style.left = '0'; m.style.top = '0';
        requestAnimationFrame(() => {
            let x = e.clientX, y = e.clientY;
            m.style.display = 'block';
            const mw = m.offsetWidth || 210, mh = m.offsetHeight || 120;
            if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
            if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
            m.style.left = x + 'px';
            m.style.top = y + 'px';
            requestAnimationFrame(() => m.classList.add('show'));
        });
    }

    function open(e, pid, rowEl) {
        _pid = pid;
        const m = menu();
        if (!m) return;

        if (SelectionMode.active()) {
            // En modo selección: solo mostrar menú de áreas, sin togglear
            _openSelectionMenu(e);
        } else {
            // Modo normal
            document.getElementById('ctx-mode-normal').classList.remove('d-none');
            document.getElementById('ctx-mode-selection').classList.add('d-none');
            m.classList.remove('selection-mode-active');
            const isUnlocked = Gantt.isPersonUnlocked(pid);
            const ganttLabel = document.getElementById('ctx-gantt-label');
            if (ganttLabel) ganttLabel.textContent = isUnlocked ? 'Bloquear Calendario' : 'Editar Calendario';
            _position(e);
        }
    }

    function _openSelectionMenu(e) {
        const m = menu();
        if (!m) return;
        document.getElementById('ctx-mode-normal').classList.add('d-none');
        document.getElementById('ctx-mode-selection').classList.remove('d-none');
        m.classList.add('selection-mode-active');

        // Actualizar contador
        const count = SelectionMode.selectedIds().length;
        const countEl = document.getElementById('ctx-selection-count');
        if (countEl) countEl.textContent = count === 1 ? '1 seleccionada' : `${count} seleccionadas`;

        // Renderizar lista de áreas
        _renderAreaList();
        _position(e);
    }

    function _renderAreaList() {
        const list = document.getElementById('ctx-area-list');
        if (!list) return;
        const areas = Areas.getAll().sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
        if (!areas.length) {
            list.innerHTML = '<div class="ctx-area-empty">Sin áreas definidas</div>';
            return;
        }
        list.innerHTML = areas.map(a =>
            `<div class="ctx-area-option" data-area="${a.replace(/"/g, '&quot;')}"><span class="ctx-area-dot"></span>${S.escapeHTML(a)}</div>`
        ).join('');
        if (!list._delegated) {
            list._delegated = true;
            list.addEventListener('click', (e) => {
                const opt = e.target.closest('.ctx-area-option');
                if (opt) _assignArea(opt.dataset.area);
            });
        }
    }

    function _assignArea(area) {
        const ids = SelectionMode.selectedIds();
        if (!ids.length) { close(); return; }
        const cleanArea = S.sanitizeString(area, 60);
        if (!cleanArea) return;

        Historial.empujar(`Asignar área "${cleanArea}" a ${ids.length} persona(s)`);
        let changed = 0;
        ids.forEach(pid => {
            const p = Data.people().find(x => String(x.id) === String(pid));
            if (!p) return;
            const current = S.toAreaArray(p.area);
            if (!current.includes(cleanArea)) {
                p.area = [...current, cleanArea];
                changed++;
            }
        });

        if (changed) {
            Data.notifyChange();
            Gantt.render();
            UI.toast(`✓ Área "${cleanArea}" asignada a ${changed} persona(s)`, 'success');
        } else {
            UI.toast('Todas las personas ya tienen esa área', 'info');
        }
        SelectionMode.exit();
        close();
    }

    function close() {
        const m = menu();
        if (!m) return;
        m.classList.remove('show');
    }

    function action(type) {
        close();
        if (_pid === null) return;
        if (type === 'config') {
            UI.editPerson(_pid);
        } else if (type === 'gantt') {
            const isUnlocked = Gantt.isPersonUnlocked(_pid);
            if (isUnlocked) {
                Gantt.unlockPerson(_pid, false);
                UI.toast('Calendario bloqueado', 'info');
            } else {
                Gantt.unlockPerson(_pid, true);
                const person = Data.people().find(p => p.id === _pid);
                UI.toast(`Editando fila de ${person ? person.name : ''}`, 'success');
            }
        } else if (type === 'start-selection') {
            // Activar modo selección e incluir la persona sobre la que se hizo clic
            SelectionMode.enter();
            SelectionMode.toggle(_pid);
        }
    }

    // Cerrar al hacer click fuera
    document.addEventListener('mousedown', (e) => {
        const m = menu();
        if (m && !m.contains(e.target)) close();
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            close();
            if (SelectionMode.active()) SelectionMode.exit();
        }
    }, true);

    return { open, close, action, openSelectionMenu: _openSelectionMenu };
})();

// ── SELECTION MODE ────────────────────────────────────────
const SelectionMode = (function () {
    let _active = false;
    const _selected = new Set();

    function active() { return _active; }
    function selectedIds() { return [..._selected]; }

    function enter() {
        _active = true;
        _selected.clear();
        document.body.classList.add('selection-mode');

        // --- NUEVO: Bloquear cualquier calendario que estuviera en modo edición ---
        const unlockedRows = document.querySelectorAll('.person-row.gantt-unlocked');
        if (unlockedRows.length > 0) {
            unlockedRows.forEach(row => {
                Gantt.unlockPerson(row.dataset.pid, false);
            });
            UI.toast('Calendario bloqueado al iniciar selección', 'info');
        }
    }

    function exit() {
        _active = false;
        _selected.clear();
        document.body.classList.remove('selection-mode');
        // Quitar highlight de todas las filas
        document.querySelectorAll('.person-row.row-selected').forEach(r => r.classList.remove('row-selected'));
    }

    function toggle(pid) {
        const pidStr = String(pid);
        if (_selected.has(pidStr)) {
            _selected.delete(pidStr);
        } else {
            _selected.add(pidStr);
        }
        // Actualizar visual de la fila
        const row = document.querySelector(`.person-row[data-pid="${pidStr}"]`);
        if (row) row.classList.toggle('row-selected', _selected.has(pidStr));

        // Si no queda ninguna seleccionada, salir del modo
        if (_selected.size === 0) exit();
    }

    return { active, enter, exit, toggle, selectedIds };
})();

window.addEventListener('DOMContentLoaded', () => {
    // ── Migración de claves viejas → prefijo APP_KEY (una sola vez) ──
    [
        ['licencias_data_v1',     `${APP_KEY}_data_v1`],
        ['licencias_areas_v1',    `${APP_KEY}_areas_v1`],
        ['licencias_holidays_v1', `${APP_KEY}_holidays_v1`],
        ['lic_gist_cfg',          `${APP_KEY}_gist_cfg`],
        ['theme_v5',              `${APP_KEY}_dark`],
    ].forEach(([oldKey, newKey]) => {
        try {
            const val = localStorage.getItem(oldKey);
            if (val !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, val);
            if (val !== null) localStorage.removeItem(oldKey);
        } catch (_) { }
    });

    const saved = localStorage.getItem(`${APP_KEY}_dark`);
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
        if (document.getElementById('theme-icon')) document.getElementById('theme-icon').innerHTML = '<use href="#icon-sun"/>';
        if (document.getElementById('theme-label')) document.getElementById('theme-label').textContent = 'Modo claro';
    }
    UI.initYearSelector(); Holidays.cargar(); Areas.cargar();
    if (Data.cargarDesdeLocalStorage()) { FileIO.markDirty(false); UI.refreshYearSelector(); } else { FileIO.createNew(); Data.setLoaded(); }
    GistSync.init();
    GistSync.verificarAlAbrir();
    _resetColModeTimer(); // iniciar ciclo automático de columnas (después de Gantt.render para que #col-mode-progress exista)
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            if (modal.id === 'modal-confirm') UI.closeConfirm();
            else UI.goBack();
        });
    });

    // NAVEGACIÓN POR TECLADO
    const navState = (() => {
        let rowIndex = -1, rangoIndex = 0;
        function getVisibleRows() { return [...document.querySelectorAll('.person-row:not(.filtered-out)')]; }
        function setFocus(rows, idx) { rows.forEach(r => r.classList.remove('keyboard-focus')); if (idx >= 0 && idx < rows.length) { rows[idx].classList.add('keyboard-focus'); rows[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
        function move(dir) { const rows = getVisibleRows(); if (!rows.length) return; rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex + dir)); rangoIndex = 0; setFocus(rows, rowIndex); }
        function cycleRanges() {
            const rows = getVisibleRows(); if (rowIndex < 0 || rowIndex >= rows.length) return;
            const person = Data.people().find(p => p.name.toLowerCase() === rows[rowIndex].dataset.name); if (!person) return;
            const currentYear = parseInt(document.getElementById('year-selector').value);
            const fechas = Data.vacacionesDe(person.id).filter(f => parseInt(f.split('-')[0]) === currentYear).sort();
            if (!fechas.length) return;
            // Construir rangos como {start, end} para scrollear al centro de cada uno
            const rangos = [];
            let rStart = 0;
            for (let i = 1; i <= fechas.length; i++) {
                if (i === fechas.length || (new Date(fechas[i]) - new Date(fechas[i - 1])) / 86400000 !== 1) {
                    rangos.push({ start: fechas[rStart], end: fechas[i - 1] });
                    rStart = i;
                }
            }
            const rango = rangos[rangoIndex % rangos.length];
            const msStart = new Date(rango.start).getTime();
            const msEnd = new Date(rango.end).getTime();
            const midDate = new Date((msStart + msEnd) / 2).toISOString().split('T')[0];
            Gantt.scrollToDate(midDate);
            rangoIndex++;
        }
        function openFocused() { const rows = getVisibleRows(); if (rowIndex >= 0) { const p = Data.people().find(p => p.name.toLowerCase() === rows[rowIndex].dataset.name); if (p) UI.editPerson(p.id); } }
        function reset() { rowIndex = -1; rangoIndex = 0; document.querySelectorAll('.person-row.keyboard-focus').forEach(r => r.classList.remove('keyboard-focus')); }
        function focusRow(rowEl) {
            const rows = getVisibleRows();
            const idx = rows.indexOf(rowEl);
            if (idx < 0) return;
            if (idx !== rowIndex) { rowIndex = idx; rangoIndex = 0; setFocus(rows, rowIndex); }
            cycleRanges();
        }
        setTimeout(() => Gantt.scrollToToday(), 300);
        return { move, cycleRanges, openFocused, reset, focusRow, hasFocus: () => rowIndex >= 0 };
    })();
    Gantt.setContextMenuRowHandler((rowEl) => navState.focusRow(rowEl));
    Gantt.setNavResetHandler(() => navState.reset());

    document.addEventListener('keydown', (e) => {
        const isTyping = ['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase());
        const searchInput = document.getElementById('search-filter'), modalAbierto = document.querySelector('.modal.show');

        if (e.key === 'Escape') {
            if (Gantt.isPanoramicActive()) Gantt.closePanoramic(); else if (modalAbierto) UI.goBack(); else if (searchInput && searchInput.value) { Gantt.clearFilter(); navState.reset(); } else if (document.activeElement) document.activeElement.blur();
            return;
        }

        // Ctrl+Z / Ctrl+Y — undo/redo
        if (e.ctrlKey && !e.altKey && !e.shiftKey) {
            if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); Historial.undo(); return; }
            if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); Historial.redo(); return; }
        }

        if (e.key === 'Delete' && !isTyping) {
            const editModal = document.getElementById('modal-edit-person');
            if (editModal && editModal.classList.contains('show')) {
                const btnDel = editModal.querySelector('.btn-danger');
                if (btnDel) btnDel.click();
                return;
            }
        }

        if (e.key === 'Delete' && isTyping) {
            const activeId = document.activeElement?.id;
            if (activeId === 'range-start' || activeId === 'range-end') {
                const editModal = document.getElementById('modal-edit-person');
                if (editModal && editModal.classList.contains('show')) {
                    const btnDel = editModal.querySelector('.btn-danger');
                    if (btnDel) btnDel.click();
                    return;
                }
            }
        }

        if (e.key === 'Enter' && modalAbierto && document.activeElement?.tagName?.toLowerCase() !== 'button') {
            if (document.activeElement?.id === 'range-end') { UI.confirmAddRange(); return; }
            const btnConfirm = modalAbierto.querySelector('.btn-primary'); if (btnConfirm && !btnConfirm.disabled) btnConfirm.click(); return;
        }

        if (searchInput && searchInput.value.trim().length > 0 && !modalAbierto) {
            // Flechas ↑↓: desde el input (primera vez) o navegando sin foco
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (document.activeElement === searchInput || navState.hasFocus()) {
                    e.preventDefault(); navState.move(e.key === 'ArrowDown' ? 1 : -1); searchInput.blur(); return;
                }
            }
            // Scroll horizontal: solo si el input tiene foco
            if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement === searchInput) {
                e.preventDefault(); document.getElementById('gantt-container').scrollLeft += (e.key === 'ArrowRight' ? 1 : -1) * (Data.config().scrollSpeed ?? 5) * (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--day-width')) || 38); return;
            }
            // Space y Enter: mientras navState tenga foco y no se esté escribiendo
            if (!isTyping && navState.hasFocus()) {
                if (e.key === ' ') { e.preventDefault(); navState.cycleRanges(); return; }
                if (e.key === 'Enter') { e.preventDefault(); navState.openFocused(); return; }
            }
        }

        if (!isTyping && !modalAbierto && searchInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]$/.test(e.key)) searchInput.focus();
            else if (e.key === 'Backspace' && navState.hasFocus()) { searchInput.focus(); }
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (Gantt.isPanoramicActive() && !document.getElementById('gantt-container').contains(e.target)) Gantt.closePanoramic();
        ['p-area', 'ep-area'].forEach(prefix => {
            const combobox = document.getElementById(prefix + '-combobox');
            if (combobox && !combobox.contains(e.target)) Areas.comboClose(prefix);
        });

        // Quitar la selección/foco de la persona al tocar el calendario u otro lado
        if (!e.target.closest('.person-cell')) {
            navState.reset();

            // Salir del modo selección al hacer clic fuera
            if (SelectionMode.active() && !e.target.closest('#ctx-menu')) {
                SelectionMode.exit();
            }
        }

        // --- NUEVO: Bloquear calendarios en edición si se hace clic fuera del Gantt ---
        // Excluimos clics en el propio Gantt, en los modales y en el menú contextual
        if (!e.target.closest('#gantt-container') && !e.target.closest('.modal') && !e.target.closest('#ctx-menu')) {
            const unlockedRows = document.querySelectorAll('.person-row.gantt-unlocked');
            if (unlockedRows.length > 0) {
                unlockedRows.forEach(row => {
                    Gantt.unlockPerson(row.dataset.pid, false);
                });
                UI.toast('Calendario bloqueado', 'info');
            }
        }
    });

    // ── LISTENERS MIGRADOS DESDE INLINE HANDLERS ──
    function _on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

    // Header
    _on('btn-inicio', 'click', () => window.location.href = '../index.html');
    _on('year-selector', 'change', function () { Gantt.changeYear(this.value); });
    _on('btn-undo', 'click', () => Historial.undo());
    _on('btn-redo', 'click', () => Historial.redo());
    _on('btn-open-config', 'click', () => UI.openConfig());
    document.querySelector('.btn-today')?.addEventListener('click', () => Gantt.scrollToToday());

    // Menú contextual
    _on('ctx-item-config', 'click', () => CtxMenu.action('config'));
    _on('ctx-item-gantt', 'click', () => CtxMenu.action('gantt'));
    _on('ctx-item-select-areas', 'click', () => CtxMenu.action('start-selection'));
    _on('ctx-area-add-new', 'click', () => {
        CtxMenu.close();
        UI.openAreasModal('ctx-selection');
    });

    // Modal confirmar
    _on('btn-confirm-cancel', 'click', () => UI.closeConfirm());

    // Modal feriados
    _on('holiday-year-selector', 'change', function () { Holidays.renderList(parseInt(this.value)); });
    _on('btn-holiday-add', 'click', () => Holidays.add());
    _on('btn-holiday-back', 'click', () => UI.openConfig());

    // Modal nueva persona
    const pAreaInput = document.getElementById('p-area-input');
    if (pAreaInput) {
        pAreaInput.addEventListener('input', () => Areas.comboFilter('p-area'));
        pAreaInput.addEventListener('focus', () => Areas.comboOpen('p-area'));
        pAreaInput.addEventListener('click', () => Areas.comboOpen('p-area'));
        pAreaInput.addEventListener('keydown', (e) => Areas.comboKey(e, 'p-area'));
    }
    _on('btn-new-person-save', 'click', () => Data.savePerson());
    _on('btn-new-person-back', 'click', () => UI.openConfig());

    // Modal editar persona
    const epAreaInput = document.getElementById('ep-area-input');
    if (epAreaInput) {
        epAreaInput.addEventListener('input', () => Areas.comboFilter('ep-area'));
        epAreaInput.addEventListener('focus', () => Areas.comboOpen('ep-area'));
        epAreaInput.addEventListener('click', () => Areas.comboOpen('ep-area'));
        epAreaInput.addEventListener('keydown', (e) => Areas.comboKey(e, 'ep-area'));
    }
    _on('ep-year-select', 'change', function () { UI.loadYearConfig(this.value); });
    _on('ep-custom-limits', 'click', function () { UI.toggleCustomLimits(this.classList.contains('active')); });
    _on('ep-unlimited', 'click', function () { this.classList.toggle('active'); UI.toggleEditLimits(this.classList.contains('active')); });
    _on('ep-custom-season', 'click', function () { UI.toggleCustomSeason(this.classList.contains('active')); });
    _on('btn-edit-gantt', 'click', () => UI.toggleGanttEditMode());
    _on('btn-add-range', 'click', () => UI.confirmAddRange());
    _on('btn-edit-person-save', 'click', () => Data.savePerson());
    _on('btn-edit-person-delete', 'click', () => Data.deletePerson());
    _on('btn-edit-person-close', 'click', () => UI.closeModals());

    // Modal áreas
    _on('btn-areas-add', 'click', () => Areas.add());
    _on('btn-areas-back', 'click', () => UI.goBackFromAreas());

    // Modal importar
    _on('import-dropzone', 'click', () => document.getElementById('import-file-input').click());
    _on('import-file-input', 'change', function () { UI.onImportFileSelected(this); });
    _on('btn-import-replace', 'click', () => UI.confirmImport('replace'));
    _on('btn-import-merge', 'click', () => UI.confirmImport('merge'));
    _on('btn-import-back', 'click', () => UI.openConfig());

    // Modal config
    _on('btn-config-holidays', 'click', () => UI.openHolidayModal());
    _on('btn-config-areas', 'click', () => UI.openAreasModal());
    _on('btn-config-new-person', 'click', () => { UI.closeModals(); UI.openPersonModal(); });
    _on('conf-scroll-speed', 'input', function () {
        const lbl = document.getElementById('conf-scroll-speed-label');
        if (lbl) lbl.textContent = this.value;
    });
    _on('btn-export', 'click', () => Data.exportData());
    _on('btn-open-import', 'click', () => UI.openImportModal());
    _on('btn-open-gist', 'click', () => UI.openGist());
    _on('btn-reset-all', 'click', () => UI.resetAll());
    _on('btn-toggle-theme', 'click', () => UI.toggleTheme());
    _on('btn-save-config', 'click', () => Data.saveConfig());
    _on('btn-config-close', 'click', () => UI.closeModals());

    // Modal Gist sync
    _on('gist-token-eye', 'click', () => GistSync.toggleToken());
    _on('btn-gist-subir', 'click', () => GistSync.subir());
    _on('btn-gist-bajar', 'click', () => GistSync.bajar());
    _on('gist-autosync-toggle', 'click', () => GistSync.toggleAuto());
    _on('btn-gist-save', 'click', () => GistSync.guardarConfig());
    _on('btn-gist-back', 'click', () => UI.openConfig());
    // Botones rápidos desde modal Config
    _on('btn-config-gist-subir', 'click', () => GistSync.subir());
    _on('btn-config-gist-bajar', 'click', () => GistSync.bajar());

    // Modal Gist novedades
    _on('gist-novedades-ignorar-btn', 'click', () => { document.getElementById('modal-gist-novedades')?.classList.remove('show'); });
});