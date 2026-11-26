// Helpers compartidos de formato de porcentaje, comparación de texto y ordenamiento de columnas de tablas
// (usados por Activos y los modales de detalle). Se carga justo después de comun.js.

// ==== COMUN ORDEN PURO BEGIN ====
function uiFormatoPorcentaje(parte, total) {
    const p = Number(parte) || 0;
    if (!(total > 0)) return '-';
    return `${Math.round((p / total) * 1000) / 10}%`;
}

// Orden natural en español sin distinguir mayúsculas ni tildes.
function uiCompararTexto(a, b) {
    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

// Ciclo de orden de una columna ordenable: sin orden -> asc -> desc -> sin orden (null).
function uiSiguienteOrden(colActual, dirActual, columna, validas = null) {
    const ok = !validas || (typeof validas.has === 'function' ? validas.has(columna) : Array.isArray(validas) && validas.includes(columna));
    if (!columna || !ok) return [colActual || null, dirActual === 'desc' ? 'desc' : 'asc'];
    if (colActual !== columna) return [columna, 'asc'];
    return dirActual === 'asc' ? [columna, 'desc'] : [null, 'asc'];
}

function uiIconoOrdenClase(activa, dir) {
    return activa ? `bi ${dir === 'desc' ? 'bi-arrow-down' : 'bi-arrow-up'} ms-1 text-primary`
        : 'bi bi-arrow-down-up ms-1 text-secondary opacity-50';
}
// ==== COMUN ORDEN PURO END ====

function uiInsigniaPorcentaje(cantidad, total, extraClase = 'ms-2') {
    const pct = uiFormatoPorcentaje(cantidad, total);
    if (pct === '-') return null;
    const sp = uiNodo('span', `badge bg-secondary-subtle text-secondary ${extraClase}`, pct);
    sp.title = `${pct} de la vista actual (${cantidad} de ${total})`;
    return sp;
}

function uiAplicarCabeceraOrden(th, { activa, dir, icono = null }) {
    if (!th) return;
    th.setAttribute('aria-sort', activa ? (dir === 'desc' ? 'descending' : 'ascending') : 'none');
    const ic = icono || th.querySelector('.bi');
    if (ic) ic.className = uiIconoOrdenClase(activa, dir);
}

/** Delega clic y teclado (Enter / Espacio) sobre encabezados ordenables (`selector`) dentro de `raiz`. */
function uiDelegarOrdenTabla(raiz, selector, alElegir) {
    if (!raiz) return;
    raiz.addEventListener('click', (e) => {
        const th = e.target instanceof Element ? e.target.closest(selector) : null;
        if (th && th.dataset.sort) alElegir(th.dataset.sort, th);
    });
    raiz.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const th = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!th || !th.dataset.sort) return;
        e.preventDefault();
        alElegir(th.dataset.sort, th);
    });
}
