// Canales: el detalle por grabador (tabla del modal, con su columna «% del total») y la participación de cada grabador en el
// uso, integrada en el chip de capacidad (leyenda con la dona que se dibuja al pasar el cursor). Se carga DESPUÉS de
// resumen.js, que lo llama.

// ==== DISTRIBUCION CANALES PURO BEGIN ====
const MAX_GRABADORES_TORTA = 8;

// Participación de cada grabador (canales configurados en uso, excluyendo «solo pantalla») sobre el total de canales en
// uso. Ordena de mayor a menor uso y limita a `limite` entradas: si hay más, agrupa el resto en «Otros (N)».
function distribuirUsoGrabadores(detalle, limite = MAX_GRABADORES_TORTA) {
    const tope = Math.max(1, Number.isInteger(limite) ? limite : MAX_GRABADORES_TORTA);
    const activos = [];
    let total = 0;
    for (const [clave, d] of detalle instanceof Map ? detalle.entries() : []) {
        if (!d) continue;
        const enUso = Math.max(0, Number(d.enUso) || 0);
        if (enUso <= 0) continue;
        total += enUso;
        activos.push({
            clave: String(clave),
            nombre: String(d.nombre || clave),
            ip: String(d.ip || ''),
            enUso,
        });
    }
    if (total <= 0 || activos.length === 0) return { total: 0, items: [], todos: [], ocultos: 0 };
    activos.sort((a, b) => (b.enUso - a.enUso) || a.nombre.localeCompare(b.nombre) || a.clave.localeCompare(b.clave));
    const redondearPct = (v) => Math.round((v / total) * 1000) / 10;
    const todos = activos.map((a, i) => ({
        ...a,
        pct: redondearPct(a.enUso),
        frac: a.enUso / total,
        esOtros: false,
        indice: i < tope ? i : null,
    }));
    let items;
    let ocultos = 0;
    if (activos.length <= tope) {
        items = todos.slice();
    } else {
        const visibles = Math.max(1, tope - 1);
        const principales = activos.slice(0, visibles).map((a, i) => ({
            ...a,
            pct: redondearPct(a.enUso),
            frac: a.enUso / total,
            esOtros: false,
            indice: i,
        }));
        const resto = activos.slice(visibles);
        ocultos = resto.length;
        const usoOtros = resto.reduce((acc, a) => acc + a.enUso, 0);
        for (const t of todos.slice(visibles)) t.indice = null;
        principales.push({
            clave: '__otros__',
            nombre: `Otros (${ocultos})`,
            ip: '',
            enUso: usoOtros,
            pct: redondearPct(usoOtros),
            frac: usoOtros / total,
            esOtros: true,
            indice: null,
        });
        items = principales;
    }
    return { total, items, todos, ocultos };
}
// ==== DISTRIBUCION CANALES PURO END ====

// Canales: leyenda de participación por grabador (máx. 8) dentro del chip unificado y dona dinámica al pasar el cursor.
let _firmaDistribucionGrabadores = '';
let _capPctActual = 0;
const DONUT_GRABADOR = { cx: 42, cy: 42, r: 32, trazo: 12 };

function pintarDistribucionGrabadores(cap) {
    _capPctActual = cap.pct;
    const tarjeta = document.getElementById('card-kpi-capacidad');
    const grupoDonut = document.getElementById('kpi-cap-donut-grupo');
    const caja = document.getElementById('cap-distribucion-caja');
    const leyenda = document.getElementById('cap-distribucion-leyenda');
    if (!tarjeta || !grupoDonut || !caja || !leyenda) return;
    const dist = distribuirUsoGrabadores(cap.detalle, MAX_GRABADORES_TORTA);
    const firma = JSON.stringify({ total: dist.total, items: dist.items.map(i => [i.clave, i.enUso, i.pct]) });
    caja.classList.toggle('d-none', dist.items.length === 0);
    if (firma === _firmaDistribucionGrabadores) return;
    _firmaDistribucionGrabadores = firma;

    const NS = 'http://www.w3.org/2000/svg';
    const { cx, cy, r, trazo } = DONUT_GRABADOR;
    const circ = 2 * Math.PI * r;
    const segmentos = [];
    const filasLeyenda = [];
    const resaltar = (idx) => {
        const activo = idx !== null && dist.items[idx];
        const estabaActivo = tarjeta.classList.contains('cap-donut-activo');
        tarjeta.classList.toggle('cap-donut-activo', Boolean(activo));
        segmentos.forEach((s, j) => {
            s.classList.toggle('donut-resaltado', Boolean(activo) && j === idx);
            s.classList.toggle('donut-atenuado', Boolean(activo) && j !== idx);
        });
        filasLeyenda.forEach((f, j) => {
            f.classList.toggle('donut-resaltado', Boolean(activo) && j === idx);
            f.classList.toggle('donut-atenuado', Boolean(activo) && j !== idx);
        });
        const sub = document.getElementById('kpi-cap-sub');
        if (activo) {
            const it = dist.items[idx];
            uiPonerTexto('kpi-cap-pct', `${it.pct}%`);
            uiPonerTexto('kpi-cap-etiqueta', it.nombre);
            if (sub) {
                sub.textContent = `${it.enUso} de ${dist.total} ch`;
                sub.classList.remove('d-none');
            }
        } else if (estabaActivo) {
            uiPonerTexto('kpi-cap-pct', `${_capPctActual}%`);
            uiPonerTexto('kpi-cap-etiqueta', 'Usado');
            if (sub) {
                sub.textContent = '';
                sub.classList.add('d-none');
            }
        }
    };

    let acum = 0;
    dist.items.forEach((item, idx) => {
        const claseColor = `donut-color-${item.esOtros ? 'otros' : item.indice}`;
        const len = item.frac * circ;
        const seg = document.createElementNS(NS, 'circle');
        seg.setAttribute('class', `donut-seg ${claseColor}`);
        seg.setAttribute('cx', String(cx));
        seg.setAttribute('cy', String(cy));
        seg.setAttribute('r', String(r));
        seg.setAttribute('stroke-width', String(trazo));
        seg.style.strokeDasharray = `${len} ${circ}`;
        seg.style.strokeDashoffset = String(-acum);
        segmentos.push(seg);
        acum += len;

        const fila = uiNodo('div', 'donut-item');
        const sufIp = !item.esOtros && item.ip ? ` (${item.ip})` : '';
        fila.title = `${item.nombre}${sufIp}: ${item.enUso} de ${dist.total} canales (${item.pct}%)`;
        fila.append(
            uiNodo('span', `donut-dot ${claseColor}`),
            uiNodo('span', 'donut-nombre', item.nombre),
            uiNodo('span', 'donut-pct', `${item.pct}%`),
        );
        fila.addEventListener('mouseenter', () => resaltar(idx));
        fila.addEventListener('mouseleave', () => resaltar(null));
        filasLeyenda.push(fila);
    });

    grupoDonut.replaceChildren(...segmentos);
    leyenda.replaceChildren(...filasLeyenda);
    if (!leyenda.dataset.donutHover) {
        leyenda.dataset.donutHover = '1';
        leyenda.addEventListener('mouseleave', () => resaltar(null));
        tarjeta.addEventListener('mouseleave', () => resaltar(null));
    }
    resaltar(null);
}

// Un grabador del detalle de canales (la tabla principal y la de «solo pantalla» van igual): columnas y fila.
// Sin capacidad conocida muestra «-» (no 0) y sin porcentaje: no tiene base para calcularlo.
// Si `conParticipacion` es true, agrega el % que representan sus canales en uso sobre el total en uso (`totalEnUso`).
function columnasCapacidad(d, fmt, modo, totalEnUso = 0, conParticipacion = false) {
    const base = d.cap > 0 ? [d.cap, fmt(d.enUso, d.cap), fmt(d.libres, d.cap)] : ['-', modo === 'pct' ? '-' : d.enUso, '-'];
    if (!conParticipacion) return base;
    const part = formatoParticipacion(d.enUso, totalEnUso);
    return [...base, part];
}
// Solo el nombre del grabador (la IP sale de la descripción); doble clic = buscarlo en Activos. `conNivel`: el borde, el
// color de Disponibles según el uso y el punto de color de su porción (un solo pantalla no los lleva)
function ponerFilaCapacidad(tr, d, conNivel, colorIdx = null) {
    if (conNivel && d.enUso > 0) {
        const punto = uiNodo('span', `donut-dot donut-dot-tabla donut-color-${colorIdx !== null ? colorIdx : 'otros'}`);
        tr.cells[0].replaceChildren(punto, document.createTextNode(d.nombre));
    } else {
        tr.cells[0].textContent = d.nombre;
    }
    tr.dataset.nvrIp = d.ip;
    tr.title = 'Doble clic: buscar en Activos';
    if (conNivel && d.cap > 0) {
        const pct = Math.min(100, Math.round((d.enUso / d.cap) * 100));
        const nivel = typeof nivelCapacidad === 'function' ? nivelCapacidad(pct) : (pct >= 90 ? 'critico' : (pct >= 70 ? 'aviso' : 'ok'));
        tr.classList.add(nivel === 'critico' ? 'cap-fila-critico' : (nivel === 'aviso' ? 'cap-fila-aviso' : 'cap-fila-ok'));
    }
}

function pintarDetalleCapacidad() {
    const cap = _ultimaCapacidad;
    if (!cap) return;
    const modo = modoCapacidadValido(storage.get(CLAVE_MODO_CAPACIDAD));
    const fmt = (val, base) => formatoCapacidad(val, base, modo);
    const dist = distribuirUsoGrabadores(cap.detalle, MAX_GRABADORES_TORTA);
    const indicePorClave = new Map(dist.todos.map(t => [t.clave, t.indice]));
    const colorPorNombre = new Map(dist.todos.map(t => [t.ip ? `${t.nombre} (${t.ip})` : t.nombre, t.indice]));
    pintarTablaResumen('#tabla-detalle-capacidad tbody', cap.detalle, d => columnasCapacidad(d, fmt, modo, cap.enUso, true),
        (tr, d) => {
            const clave = d.ip && d.nombre !== d.ip ? `${d.nombre} (${d.ip})` : d.nombre;
            const idx = indicePorClave.has(clave) ? indicePorClave.get(clave) : (colorPorNombre.get(clave) ?? null);
            ponerFilaCapacidad(tr, d, true, idx);
        });
    // Los grabadores solo pantalla no suman en nada: tabla aparte, sin totales ni colores de uso, y oculta si no hay
    const pantallas = cap.pantallas || new Map();
    pintarTablaResumen('#tabla-detalle-pantallas tbody', pantallas, d => columnasCapacidad(d, fmt, modo),
        (tr, d) => ponerFilaCapacidad(tr, d, false));
    const seccionPantallas = document.getElementById('cap-pantallas-seccion');
    if (seccionPantallas) seccionPantallas.classList.toggle('d-none', pantallas.size === 0);
    uiPonerTexto('cap-detalle-total', cap.total);      // fila de totales: las mismas sumas del chip
    // en porcentaje, el uso de los grabadores con capacidad conocida (los mismos que suman la capacidad total)
    uiPonerTexto('cap-detalle-uso', fmt(modo === 'pct' ? cap.enUsoMedido : cap.enUso, cap.total));
    const nota = document.getElementById('cap-detalle-nota');
    if (nota) {
        nota.classList.toggle('d-none', !(cap.sinCapacidad > 0));
        nota.textContent = cap.sinCapacidad > 0
            ? `«-»: capacidad desconocida (${cap.sinCapacidad}); no cuenta en la capacidad ni en los porcentajes.` : '';
    }
    uiPonerTexto('cap-detalle-libres', fmt(cap.libres, cap.total));
    uiPonerTexto('cap-detalle-part', cap.enUso > 0 ? '100%' : '-');
    for (const b of document.querySelectorAll('[data-cap-modo]')) {
        const activo = b.dataset.capModo === modo;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', String(activo));
    }
    envolverValoresCapacidad();
}
