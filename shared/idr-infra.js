/**
 * IDRInfra - Módulo Centralizado de Infraestructura para la Suite IDR
 * Gestiona Edificios (clave global compartida) y Racks (fuente canónica: SGR).
 * Compatible con SGC (CCTV), SGP (Patcheras) y SGR (Racks).
 */
const IDRInfra = (() => {
    'use strict';

    const KEY_EDIFICIOS = 'IDR_edificios';
    const KEY_SGR = 'RCK_data';
    const KEY_PCH = 'PCH_data';
    const KEY_CCTV_EDIFICIOS = 'CCTV:cctv_edificios';

    const EVT_EDIFICIOS = 'idr:edificios-changed';
    const EVT_RACKS = 'idr:racks-changed';

    function _parseSeguro(raw, fallback = null) {
        if (!raw || typeof raw !== 'string') return fallback;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    // ── 1. MIGRACIÓN AUTOMÁTICA AL INICIALIZAR ────────────────
    function _migrarSiEsNecesario() {
        try {
            const actual = localStorage.getItem(KEY_EDIFICIOS);
            if (actual !== null) return; // Ya existe la clave global

            const set = new Set();

            // A. Desde SGR (RCK_data)
            const rck = _parseSeguro(localStorage.getItem(KEY_SGR));
            if (rck && typeof rck === 'object') {
                if (Array.isArray(rck.edificios)) {
                    rck.edificios.forEach(e => {
                        if (typeof e === 'string' && e.trim()) set.add(e.trim().slice(0, 100));
                    });
                }
                if (Array.isArray(rck.racks)) {
                    rck.racks.forEach(r => {
                        if (typeof r?.edificio === 'string' && r.edificio.trim()) {
                            set.add(r.edificio.trim().slice(0, 100));
                        }
                    });
                }
            }

            // B. Desde SGP (PCH_data)
            const pch = _parseSeguro(localStorage.getItem(KEY_PCH));
            if (pch && typeof pch === 'object' && Array.isArray(pch.edificios)) {
                pch.edificios.forEach(e => {
                    if (typeof e === 'string' && e.trim()) set.add(e.trim().slice(0, 100));
                });
            }

            // C. Desde SGC (CCTV:cctv_edificios)
            const cctv = _parseSeguro(localStorage.getItem(KEY_CCTV_EDIFICIOS));
            if (Array.isArray(cctv)) {
                cctv.forEach(e => {
                    if (typeof e === 'string' && e.trim()) set.add(e.trim().slice(0, 100));
                });
            }

            const unificada = Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
            localStorage.setItem(KEY_EDIFICIOS, JSON.stringify(unificada));
        } catch (err) {
            console.warn('[IDRInfra] Error durante migración de edificios:', err);
        }
    }

    _migrarSiEsNecesario();

    // ── 2. GESTIÓN DE EDIFICIOS ───────────────────────────────
    function getEdificios() {
        try {
            const raw = localStorage.getItem(KEY_EDIFICIOS);
            if (!raw) return [];
            const data = _parseSeguro(raw, []);
            return Array.isArray(data) ? data : [];
        } catch (_) {
            return [];
        }
    }

    function _sincronizarLegacy(limpia) {
        // Mantiene actualizadas las claves viejas por retrocompatibilidad
        try {
            localStorage.setItem(KEY_CCTV_EDIFICIOS, JSON.stringify(limpia));
        } catch (_) {}

        try {
            const rck = _parseSeguro(localStorage.getItem(KEY_SGR));
            if (rck && typeof rck === 'object') {
                rck.edificios = limpia;
                localStorage.setItem(KEY_SGR, JSON.stringify(rck));
            }
        } catch (_) {}

        try {
            const pch = _parseSeguro(localStorage.getItem(KEY_PCH));
            if (pch && typeof pch === 'object') {
                pch.edificios = limpia;
                localStorage.setItem(KEY_PCH, JSON.stringify(pch));
            }
        } catch (_) {}
    }

    function setEdificios(lista, dispararEvento = true) {
        if (!Array.isArray(lista)) lista = [];
        const limpia = Array.from(
            new Set(lista.map(e => (typeof e === 'string' ? e.trim().slice(0, 100) : '')).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, 'es'));

        try {
            localStorage.setItem(KEY_EDIFICIOS, JSON.stringify(limpia));
            _sincronizarLegacy(limpia);
        } catch (err) {
            console.error('[IDRInfra] Error al guardar edificios:', err);
        }

        if (dispararEvento) {
            window.dispatchEvent(new CustomEvent(EVT_EDIFICIOS, { detail: { edificios: limpia } }));
        }
        return limpia;
    }

    function agregarEdificio(nombreOStringConComas) {
        if (!nombreOStringConComas) return { agregados: [], duplicados: [], total: getEdificios() };
        const partes = (typeof nombreOStringConComas === 'string' ? nombreOStringConComas.split(',') : [nombreOStringConComas])
            .map(n => String(n).trim().slice(0, 100))
            .filter(Boolean);

        const actuales = getEdificios();
        const existentesMap = new Map(actuales.map(e => [e.toLowerCase(), e]));
        const agregados = [];
        const duplicados = [];

        partes.forEach(p => {
            const norm = p.toLowerCase();
            if (existentesMap.has(norm)) {
                duplicados.push(existentesMap.get(norm));
            } else {
                existentesMap.set(norm, p);
                actuales.push(p);
                agregados.push(p);
            }
        });

        if (agregados.length) {
            setEdificios(actuales);
        }

        return { agregados, duplicados, total: getEdificios() };
    }

    function eliminarEdificio(nombre) {
        if (!nombre) return false;
        const norm = String(nombre).trim().toLowerCase();
        const actuales = getEdificios();
        const filtrados = actuales.filter(e => e.trim().toLowerCase() !== norm);
        if (filtrados.length !== actuales.length) {
            setEdificios(filtrados);
            return true;
        }
        return false;
    }

    function combinarRemotos(remotoEdificios) {
        if (!Array.isArray(remotoEdificios)) return { nuevos: 0, total: getEdificios() };
        const actuales = getEdificios();
        const existentes = new Set(actuales.map(e => e.trim().toLowerCase()));
        let nuevos = 0;

        remotoEdificios.forEach(e => {
            if (typeof e === 'string' && e.trim()) {
                const lim = e.trim().slice(0, 100);
                if (!existentes.has(lim.toLowerCase())) {
                    actuales.push(lim);
                    existentes.add(lim.toLowerCase());
                    nuevos++;
                }
            }
        });

        if (nuevos > 0) {
            setEdificios(actuales);
        }
        return { nuevos, total: getEdificios() };
    }

    // ── 3. RACKS (Lectura desde SGR) ──────────────────────────
    function getRacks(edificio = '', { soloEnServicio = true } = {}) {
        try {
            const raw = localStorage.getItem(KEY_SGR);
            if (!raw) return [];
            const data = _parseSeguro(raw);
            if (!data || !Array.isArray(data.racks)) return [];

            let list = data.racks.filter(r => r && (r.numero || r.identificador || r.marca || r.id));
            if (soloEnServicio) {
                list = list.filter(r => r.estado === 'servicio');
            }
            if (edificio) {
                const edNorm = edificio.trim().toLowerCase();
                list = list.filter(r => (r.edificio || '').trim().toLowerCase() === edNorm);
            }

            return list.sort((a, b) => {
                const numA = (a.numero || a.identificador || '').toString();
                const numB = (b.numero || b.identificador || '').toString();
                return numA.localeCompare(numB, 'es', { numeric: true });
            });
        } catch (_) {
            return [];
        }
    }

    // ── 4. POBLADO DE SELECTS Y DATALISTS ─────────────────────
    function poblarSelectEdificios(selectElementOrId, valorActual = '', opciones = {}) {
        const sel = typeof selectElementOrId === 'string' ? document.getElementById(selectElementOrId) : selectElementOrId;
        if (!sel) return;

        const {
            incluirVacio = true,
            textoVacio = '— Sin edificio —',
            textoTodos = 'Todos los edificios',
            incluirOpcionTodos = false,
            opcionAgregar = false,
            textoAgregar = '＋ Agregar edificio…'
        } = opciones;

        const lista = getEdificios();
        sel.innerHTML = '';

        if (incluirOpcionTodos) {
            const optTodos = document.createElement('option');
            optTodos.value = '';
            optTodos.textContent = textoTodos;
            sel.appendChild(optTodos);
        } else if (incluirVacio) {
            const optVacia = document.createElement('option');
            optVacia.value = '';
            optVacia.textContent = textoVacio;
            sel.appendChild(optVacia);
        }

        lista.forEach(ed => {
            const opt = document.createElement('option');
            opt.value = ed;
            opt.textContent = ed;
            if (valorActual && ed === valorActual) opt.selected = true;
            sel.appendChild(opt);
        });

        if (valorActual && !lista.includes(valorActual)) {
            const optCustom = document.createElement('option');
            optCustom.value = valorActual;
            optCustom.textContent = `${valorActual} (personalizado)`;
            optCustom.selected = true;
            sel.appendChild(optCustom);
        }

        if (opcionAgregar) {
            const optAgregar = document.createElement('option');
            optAgregar.value = '__agregar__';
            optAgregar.textContent = textoAgregar;
            sel.appendChild(optAgregar);
        }

        if (!valorActual && !incluirVacio && !incluirOpcionTodos && lista.length) {
            sel.value = lista[0];
        } else if (valorActual) {
            sel.value = valorActual;
        }
    }

    function buscarRack(query) {
        if (!query) return null;
        const norm = String(query).trim().toLowerCase();
        const racks = getRacks();
        return racks.find(r => {
            const num = r.numero ? `rack ${r.numero}`.toLowerCase() : '';
            const rawNum = String(r.numero || '').toLowerCase();
            const idf = String(r.identificador || '').toLowerCase();
            const id = String(r.id || '').toLowerCase();
            return (num && num === norm) || (rawNum && rawNum === norm) || (idf && idf === norm) || (id && id === norm);
        }) || null;
    }

    function poblarDatalistRacks(datalistElementOrId, edificio = '') {
        const dl = typeof datalistElementOrId === 'string' ? document.getElementById(datalistElementOrId) : datalistElementOrId;
        if (!dl) return;

        const racks = getRacks(edificio);
        dl.innerHTML = '';

        racks.forEach(r => {
            const opt = document.createElement('option');
            const num = r.numero ? `Rack ${r.numero}` : (r.identificador || `Rack ${r.id ? r.id.slice(0, 6) : ''}`);
            opt.value = num;

            const partes = [];
            if (!edificio && r.edificio) partes.push(r.edificio);
            if (r.piso) partes.push(`Piso ${r.piso}`);
            if (r.marca || r.modelo) partes.push(`${r.marca || ''} ${r.modelo || ''}`.trim());
            if (r.unidades) partes.push(`${r.unidades}U`);
            if (r.dependencia) partes.push(r.dependencia);
            if (partes.length) opt.label = partes.join(' · ');

            dl.appendChild(opt);
        });
    }

    // ── 5. SINCRONIZACIÓN REACTIVA ENTRE PESTAÑAS ─────────────
    window.addEventListener('storage', (e) => {
        if (e.key === KEY_EDIFICIOS) {
            try {
                const nuevos = _parseSeguro(e.newValue, []);
                window.dispatchEvent(new CustomEvent(EVT_EDIFICIOS, { detail: { edificios: nuevos } }));
            } catch (_) {}
        } else if (e.key === KEY_SGR) {
            window.dispatchEvent(new CustomEvent(EVT_RACKS));
        }
    });

    return {
        KEY_EDIFICIOS,
        getEdificios,
        setEdificios,
        agregarEdificio,
        eliminarEdificio,
        combinarRemotos,
        getRacks,
        buscarRack,
        poblarSelectEdificios,
        poblarDatalistRacks,
        onEdificiosChange(fn) {
            window.addEventListener(EVT_EDIFICIOS, fn);
        },
        offEdificiosChange(fn) {
            window.removeEventListener(EVT_EDIFICIOS, fn);
        },
        onRacksChange(fn) {
            window.addEventListener(EVT_RACKS, fn);
        },
        offRacksChange(fn) {
            window.removeEventListener(EVT_RACKS, fn);
        }
    };
})();

if (typeof window !== 'undefined') window.IDRInfra = IDRInfra;
if (typeof globalThis !== 'undefined') globalThis.IDRInfra = IDRInfra;
