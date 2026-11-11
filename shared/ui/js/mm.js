// MM: gestor de modales de las apps portadas al diseño de SGC (SGR, SGI, SGP), sobre `UI.modal` (ui.js). Es la API que esas
// apps usaban con su gestor propio (abrir, cerrar, alternar, padres, acción de volver...), pero los modales los abre y
// cierra `UI.modal`: animación, foco atrapado, fondo, Escape y modales apilados; el botón «atrás» lo maneja atras-modales.js.
// «Descartar» un modal (Escape, clic en el fondo, la X o «atrás») respeta lo de antes: si tiene acción de volver se ejecuta,
// y si se abrió desde otro (alternar) vuelve a ese. Cerrarlo desde el código (guardar, cancelar) solo lo cierra.
// Se carga después de ui.js y antes del app.js de cada app. Un solo global: `MM`.
const MM = (() => {
    const _padres = {};
    const _accionesVolver = {};
    let _interno = 0;                       // > 0: el cierre lo pidió el código, no es «descartar»

    const $m = (id) => (id ? document.getElementById(id) : null);
    const _abierto = (id) => { const m = $m(id); return Boolean(m) && UI.modal.abierto(m); };

    function _cerrarUI(id) {
        const m = $m(id);
        if (!m) return;
        _interno++;
        try { UI.modal.cerrar(m); } finally { _interno--; }
    }

    function registrarAccionVolver(modalId, fn) { _accionesVolver[modalId] = fn; }

    function _ejecutarAccionCierre(modalId) {
        const accionVolver = _accionesVolver[modalId];
        if (typeof accionVolver === 'function') { accionVolver(); return; }
        const padreId = _padres[modalId];
        if (padreId && $m(padreId) && !_abierto(padreId)) { alternar(modalId, padreId); return; }
        cerrar(modalId);
    }

    // En captura: corre antes que atras-modales.js, que solo saca la entrada del historial si el cierre no se frenó
    document.addEventListener('ui:modal-cerrar', (e) => {
        const m = e.target;
        if (_interno || !(m instanceof HTMLElement) || !m.id) return;
        if (!_accionesVolver[m.id] && !_padres[m.id]) return;      // sin nada especial: cierra como siempre
        e.preventDefault();
        _ejecutarAccionCierre(m.id);
    }, true);

    function abrir(modalId, optsOrCb) {
        const modal = $m(modalId);
        if (!modal) return;
        let cb, onEscape, padre;
        if (typeof optsOrCb === 'function') cb = optsOrCb;
        else if (optsOrCb && typeof optsOrCb === 'object') ({ cb, onEscape, padre } = optsOrCb);
        if (onEscape) _accionesVolver[modalId] = onEscape;
        else delete _accionesVolver[modalId];
        if (padre) _padres[modalId] = padre;
        UI.modal.abrir(modal);
        if (typeof cb === 'function') cb();
    }

    // Cerrado desde el código, el modal olvida de dónde vino (si después se abre solo, descartarlo no reabre un padre viejo);
    // alternar sí lo conserva, porque el que se cierra puede volver a abrirse en la misma cadena.
    function _cerrar(modalId, callback, olvidarPadre) {
        delete _accionesVolver[modalId];
        if (olvidarPadre) delete _padres[modalId];
        _cerrarUI(modalId);
        if (typeof callback === 'function') callback();
    }

    function cerrar(modalId, callback = null) { _cerrar(modalId, callback, true); }

    function alternar(modalIdCerrar, modalIdAbrir, callbackCerrar = null, callbackAbrir = null) {
        if (_padres[modalIdCerrar] === modalIdAbrir) delete _padres[modalIdCerrar];      // vuelve al padre
        else if (modalIdCerrar && modalIdAbrir) _padres[modalIdAbrir] = modalIdCerrar;
        _cerrar(modalIdCerrar, callbackCerrar, false);
        abrir(modalIdAbrir, callbackAbrir);
    }

    function abrirConPadre(modalId, setupFn = null) {
        const arriba = UI.modal.arriba();
        if (typeof setupFn === 'function') setupFn();
        if (arriba && arriba.id) alternar(arriba.id, modalId);
        else abrir(modalId);
    }

    function cerrarConPadre(modalId, callbackAbrirPadre = null) {
        const padre = _padres[modalId];
        if (padre) alternar(modalId, padre, null, callbackAbrirPadre ? () => callbackAbrirPadre(padre) : null);
        else cerrar(modalId);
    }

    function cerrarTodos() {
        Object.keys(_accionesVolver).forEach((k) => delete _accionesVolver[k]);
        Object.keys(_padres).forEach((k) => delete _padres[k]);
        _interno++;
        try { UI.modal.cerrarTodos(); } finally { _interno--; }
    }

    function cerrarTop() {
        const arriba = UI.modal.arriba();
        if (arriba && arriba.id) _ejecutarAccionCierre(arriba.id);
    }

    // Compatibilidad para transiciones legacy
    function nav(desde, fn) {
        if (desde && _abierto(desde)) cerrar(desde);
        if (typeof fn === 'function') fn();
    }

    return {
        abrir,
        cerrar,
        alternar,
        abrirConPadre,
        cerrarConPadre,
        cerrarTodos,
        cerrarTop,
        registrarAccionVolver,
        ejecutarAccionCierre: _ejecutarAccionCierre,
        getPadre: (id) => _padres[id] || null,
        setPadre: (id, padreId) => { if (id && padreId) _padres[id] = padreId; },
        nav
    };
})();
