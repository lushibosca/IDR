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
        if (tabAjustes) {
            // Tocar la fila acciona su interruptor, y Enter/Espacio sobre una fila-botón: apariencia.js (compartido)
        }
    });
}
