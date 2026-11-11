// ajustes.js: pestaña «Ajustes»: qué apartados del panel Estado se ven (un interruptor por apartado). Los interruptores
// de tema y animaciones los maneja app.js. Solo textContent.

// ==== AJUSTES PURO BEGIN ====
const CLAVE_SECCIONES_OCULTAS = 'cctv:secciones_ocultas';
// Los apartados del panel Estado (los de resumen.js `IDS_SECCIONES_REUBICABLES`)
const SECCIONES_ESTADO = [
    { id: 'favoritos-section', etiqueta: 'Favoritos', icono: 'bi-star' },
    { id: 'canales-section', etiqueta: 'Canales', icono: 'bi-camera-video' },
    { id: 'infra-chips', etiqueta: 'Activos', icono: 'bi-box-seam' },
];

// Los ocultos que son apartados conocidos, sin repetir (lo guardado nunca va sin validar a un selector)
function seccionesOcultasVigentes(ocultas, todas = SECCIONES_ESTADO.map(s => s.id)) {
    return [...new Set((Array.isArray(ocultas) ? ocultas : []).filter(id => todas.includes(id)))];
}

// La lista nueva al mostrar u ocultar `id`
function alternarSeccionOculta(ocultas, id, visible) {
    const actual = seccionesOcultasVigentes(ocultas);
    if (!SECCIONES_ESTADO.some(s => s.id === id)) return actual;
    return visible ? actual.filter(x => x !== id) : [...new Set([...actual, id])];
}
// Calcula cuántas columnas independientes de al menos 26 rem (416 px) con separación de 1.5 rem (24 px) entran en Ajustes
function calcularColumnasAjustes(anchoPx, minColPx = 416, gapPx = 24) {
    const ancho = Number(anchoPx);
    if (!Number.isFinite(ancho) || ancho <= 0) return 2;
    return Math.max(1, Math.min(4, Math.floor((ancho + gapPx) / (minColPx + gapPx))));
}

// Reparte las secciones de Ajustes en `numColumnas` pilas verticales independientes
function repartirSeccionesAjustes(secciones, numColumnas = 2) {
    const lista = Array.isArray(secciones) ? secciones : [];
    const n = Math.max(1, Number.isInteger(numColumnas) ? numColumnas : 2);
    const columnas = Array.from({ length: n }, () => []);
    lista.forEach((sec, idx) => {
        columnas[idx % n].push(sec);
    });
    return columnas.filter(col => col.length > 0);
}
// ==== AJUSTES PURO END ====

if (typeof document !== 'undefined') {
    // Interruptores de comportamiento: «Cambiar de pestaña al buscar» y «Rueda sobre el panel» (de la persona, sincronizan) y el modo privacidad (del
    // dispositivo, privacidad.js)
    document.addEventListener('DOMContentLoaded', () => {
        const buscar = document.getElementById('btn-buscar-cambia-pestana');
        const pintarBuscar = () => uiInterruptor(buscar, buscarCambiaPestana());
        if (buscar) {
            buscar.addEventListener('click', () => {
                const activo = !buscarCambiaPestana();
                preferencias.set(CLAVE_BUSCAR_CAMBIA_PESTANA, activo ? '1' : '0');
                pintarBuscar();
                mostrarToast(activo ? 'La búsqueda cambia de pestaña sola.' : 'La búsqueda ya no cambia de pestaña.', 'info', 2500);
            });
            preferencias.alAplicar(CLAVE_BUSCAR_CAMBIA_PESTANA, pintarBuscar);
            pintarBuscar();
        }
        const rueda = document.getElementById('btn-rueda-pestanas');
        const pintarRueda = () => uiInterruptor(rueda, ruedaRecorrePestanas());
        if (rueda) {
            rueda.addEventListener('click', () => {
                const activo = !ruedaRecorrePestanas();
                preferencias.set(CLAVE_RUEDA_PESTANAS, activo ? '1' : '0');
                pintarRueda();
                mostrarToast(activo ? 'La rueda sobre el panel recorre las pestañas.' : 'La rueda ya no cambia de pestaña.', 'info', 2500);
            });
            preferencias.alAplicar(CLAVE_RUEDA_PESTANAS, pintarRueda);
            pintarRueda();
        }
        const privacidad = document.getElementById('btn-privacidad');
        if (privacidad) {
            const pintarPrivacidad = () => uiInterruptor(privacidad, privacidadActiva());
            privacidad.addEventListener('click', alternarPrivacidad);
            document.addEventListener('cctv:privacidad', pintarPrivacidad);      // también con Alt+Shift+P
            pintarPrivacidad();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const caja = document.getElementById('ajustes-secciones');
        if (!caja) return;
        const interruptores = new Map();

        function pintar() {
            const ocultas = seccionesOcultasVigentes(storage.getJSON(CLAVE_SECCIONES_OCULTAS, []));
            for (const { id } of SECCIONES_ESTADO) {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('seccion-oculta', ocultas.includes(id));
                uiInterruptor(interruptores.get(id), !ocultas.includes(id));
            }
        }

        SECCIONES_ESTADO.forEach(({ id, etiqueta, icono }, i) => {
            const fila = uiNodo('div', 'ajuste-fila');
            const texto = uiNodo('div', 'ajuste-texto');
            const titulo = uiNodo('span', 'ajuste-titulo', etiqueta);
            titulo.id = `ajuste-seccion-${i}-titulo`;
            texto.append(titulo);
            const boton = uiNodo('button', 'interruptor');
            boton.type = 'button';
            boton.id = `ajuste-seccion-${i}`;
            boton.setAttribute('role', 'switch');
            boton.setAttribute('aria-labelledby', titulo.id);
            boton.append(uiNodo('span', 'interruptor-perilla'));
            boton.addEventListener('click', () => {
                const visible = boton.getAttribute('aria-checked') !== 'true';
                preferencias.setLista(CLAVE_SECCIONES_OCULTAS,
                    alternarSeccionOculta(storage.getJSON(CLAVE_SECCIONES_OCULTAS, []), id, visible));
                pintar();
            });
            interruptores.set(id, boton);
            fila.append(uiNodo('i', `bi ${icono} ajuste-icono`), texto, boton);
            caja.append(fila);
        });
        preferencias.alAplicar(CLAVE_SECCIONES_OCULTAS, pintar);
        pintar();
    });

    // Clic en cualquier parte de un apartado con interruptor (slider): activa o desactiva el interruptor
    document.addEventListener('DOMContentLoaded', () => {
        const tabAjustes = document.getElementById('v-pills-ajustes');
        const grilla = tabAjustes ? tabAjustes.querySelector('.ajustes-grilla') : null;
        if (grilla) {
            const secciones = [...grilla.querySelectorAll('.ajuste-seccion')];
            let firmaActual = '';

            const obtenerNumColumnas = () => {
                const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
                const ancho = grilla.clientWidth || (grilla.parentElement ? grilla.parentElement.clientWidth : 0);
                return calcularColumnasAjustes(ancho, 26 * rem, 1.5 * rem);
            };

            const montarColumnas = (forzar = false) => {
                const numCol = obtenerNumColumnas();
                const visibles = secciones.filter(s => !s.classList.contains('d-none'));
                const ocultas = secciones.filter(s => s.classList.contains('d-none'));
                const firma = `${numCol}:${visibles.map(s => secciones.indexOf(s)).join(',')}`;
                if (!forzar && firma === firmaActual) return;
                firmaActual = firma;
                const grupos = repartirSeccionesAjustes(visibles, numCol);
                const columnas = (grupos.length ? grupos : [[]]).map((grupo, idx) => {
                    const col = uiNodo('div', 'ajustes-columna');
                    for (const sec of grupo) col.appendChild(sec);
                    if (idx === 0) {
                        for (const sec of ocultas) col.appendChild(sec);
                    }
                    return col;
                });
                grilla.replaceChildren(...columnas);
            };

            montarColumnas(true);

            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(() => {
                    if (grilla.clientWidth <= 0) return;
                    montarColumnas();
                }).observe(grilla);
            }

            if (typeof MutationObserver === 'function') {
                const mo = new MutationObserver(() => montarColumnas());
                for (const sec of secciones) {
                    mo.observe(sec, { attributes: true, attributeFilter: ['class'] });
                }
            }
        }
        if (tabAjustes) {
            tabAjustes.addEventListener('click', (e) => {
                const fila = e.target instanceof Element ? e.target.closest('.ajuste-fila') : null;
                if (!fila) return;
                const sw = fila.querySelector('.interruptor');
                if (!sw || sw.disabled || sw.getAttribute('aria-disabled') === 'true') return;
                if (e.target.closest('.interruptor')) return;
                sw.click();
            });

            tabAjustes.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element && e.target.classList.contains('ajuste-fila') && e.target.getAttribute('role') === 'button') {
                    e.preventDefault();
                    e.target.click();
                }
            });
        }
    });
}
