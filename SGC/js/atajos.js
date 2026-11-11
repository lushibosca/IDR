// atajos.js: modal «Atajos» del menú ⚙: todos los atajos de teclado y de mouse / toque que tiene la web. La lista es DATOS
// (`ATAJOS`, abajo): al agregar un atajo nuevo a la página, se anota ahí (una fila) y aparece en el modal. Solo textContent.
//
// Cada entrada: { donde, tipo: 'teclado' | 'mouse', teclas?: [..] (teclado), gesto?: 'Doble clic' (mouse), accion }.

// ==== ATAJOS DATOS BEGIN ====
const ATAJOS = [
    // ---- Teclado
    { donde: 'General', tipo: 'teclado', teclas: ['?'], accion: 'Abrir ayuda y atajos (sin foco en campo de texto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['a-z / 0-9'], accion: 'Empezar a buscar: lo que se escribe va al buscador global (con el foco fuera de un campo)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '←'], accion: 'Volver al buscador global (abre el panel lateral si estaba oculto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '→'], accion: 'Ir al primer resultado de la búsqueda (Activos o Producción); el foco pasa también por los grupos y subgrupos, sin abrirlos' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '↑ / ↓'], accion: 'Recorrer las pestañas del panel lateral: Estado, Activos, Producción, Historial y Ajustes' },
    { donde: 'General', tipo: 'teclado', teclas: ['Esc'], accion: 'Salir paso a paso: cierra el popup abierto, vuelve del resultado al buscador, saca el foco o limpia la búsqueda' },
    { donde: 'General', tipo: 'teclado', teclas: ['← → ↑ ↓'], accion: 'En un menú desplegable o entre pestañas: moverse entre las opciones (Esc lo cierra)' },
    { donde: 'Búsqueda', tipo: 'teclado', teclas: ['Enter'], accion: 'En el buscador: buscar ahora (sin esperar); con el campo vacío, limpiar' },
    { donde: 'Búsqueda', tipo: 'teclado', teclas: ['← → ↑ ↓'], accion: 'Con un resultado o un encabezado de grupo enfocado: pasar al vecino (los grupos cerrados no se abren solos)' },
    { donde: 'Búsqueda', tipo: 'teclado', teclas: ['Enter / Espacio'], accion: 'En el encabezado de un grupo o subgrupo enfocado: abrirlo o cerrarlo' },
    { donde: 'Búsqueda', tipo: 'teclado', teclas: ['Enter'], accion: 'Con un resultado enfocado: abrir el popup del equipo (en Producción también Espacio)' },
    { donde: 'Popup del equipo', tipo: 'teclado', teclas: ['← → ↑ ↓ / Inicio / Fin'], accion: 'Moverse entre sus botones' },
    { donde: 'Popup del equipo', tipo: 'teclado', teclas: ['Esc'], accion: 'Cerrarlo y volver al equipo' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Alt', 'Shift', 'L'], accion: 'Listar (con selección activa, lista lo seleccionado; también en Producción, con los que tienen alta en el stock)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Alt', 'Shift', 'P'], accion: 'Ocultar o mostrar las IP y MAC en pantalla (modo privacidad)' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Alt', 'Shift', 'G'], accion: 'Abrir «Agrupar» (con el foco en la primera opción; otra vez lo cierra)' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Alt', 'Shift', 'V'], accion: 'Alternar la vista de lista y tarjetas (también en Producción)' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Espacio'], accion: 'Con un dispositivo enfocado: empezar la selección con ese marcado (requiere poder editar)' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Enter / Espacio'], accion: 'En el encabezado de una columna: ordenar por ella' },
    { donde: 'Producción', tipo: 'teclado', teclas: ['Espacio'], accion: 'Con un equipo enfocado: empezar la selección con ese marcado (Enter abre el popup)' },
    { donde: 'Modo selección', tipo: 'teclado', teclas: ['Enter / Espacio'], accion: 'Marcar o desmarcar el dispositivo enfocado (Espacio es el que empieza la selección)' },
    { donde: 'Modo selección', tipo: 'teclado', teclas: ['Shift', '← → ↑ ↓'], accion: 'Con un dispositivo enfocado: marcar desde el último marcado hasta el vecino (con Ctrl se suma a lo ya marcado)' },
    { donde: 'Modo selección', tipo: 'teclado', teclas: ['Ctrl', 'A'], accion: 'Marcar todo lo de los grupos abiertos (respeta la búsqueda); también en Producción' },
    { donde: 'Modo selección', tipo: 'teclado', teclas: ['Esc'], accion: 'Con una búsqueda activa, la limpia (la selección sigue); con otro Esc sale del modo selección' },
    { donde: 'Listar', tipo: 'teclado', teclas: ['Enter'], accion: 'Al abrirse, el foco queda en «Ver»: Enter muestra el resultado' },
    { donde: 'Panel Estado', tipo: 'teclado', teclas: ['Enter / Espacio'], accion: 'En el encabezado de una sección: plegarla o desplegarla' },
    { donde: 'Panel Estado', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En el encabezado de una sección: reubicarla (entre las zonas y dentro de ellas)' },
    { donde: 'Panel Estado', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En un tile de Favoritos o un chip de Activos: reubicarlo' },
    { donde: 'Panel lateral', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En «Ocultar / Mover»: llevar el panel a la izquierda, derecha, arriba o abajo (solo escritorio)' },
    { donde: 'Acordeones', tipo: 'teclado', teclas: ['Shift', 'Enter'], accion: 'En un encabezado de grupo: abrir o cerrar todos' },

    // ---- Mouse y toque
    { donde: 'Equipos', tipo: 'mouse', gesto: 'Clic', accion: 'Abrir el popup del equipo (Activos, Producción y Favoritos); en el modo selección, marcarlo' },
    { donde: 'Equipos', tipo: 'mouse', gesto: 'Doble clic', accion: 'Ver los datos del equipo (Activos, Producción y Favoritos)' },
    { donde: 'Producción', tipo: 'mouse', gesto: 'Clic en un canal libre', accion: 'Elegir qué dispositivo del stock va en ese canal (o dar de alta uno nuevo ahí)' },
    { donde: 'Equipos', tipo: 'mouse', gesto: 'Doble clic en un dato', accion: 'Copiar el nombre, la IP, la MAC, el modelo o el firmware' },
    { donde: 'Popup del equipo', tipo: 'mouse', gesto: 'Clic en la estrella', accion: 'Agregar o quitar de Favoritos (equipos en producción)' },
    { donde: 'Activos', tipo: 'mouse', gesto: 'Mantener presionado el encabezado de una columna (vista lista) y arrastrar', accion: 'Mover la columna a otro lugar de la tabla; el orden se recuerda y sigue a la persona (un clic ordena por esa columna)' },
    { donde: 'Activos', tipo: 'teclado', teclas: ['Alt', '← →'], accion: 'En el encabezado de una columna de la lista: moverla (Enter o espacio ordena por ella)' },
    { donde: 'Activos', tipo: 'mouse', gesto: 'Clic en un encabezado de columna', accion: 'Ordenar por esa columna (otro clic invierte)' },
    { donde: 'Activos', tipo: 'mouse', gesto: 'Mantener presionado un dispositivo', accion: 'Entrar al modo selección con ese dispositivo marcado (también en Producción)' },
    { donde: 'Modo selección', tipo: 'mouse', gesto: 'Shift + clic', accion: 'Marcar desde el último marcado hasta el elegido (con Ctrl se suma a lo ya marcado)' },
    { donde: 'Modo selección', tipo: 'mouse', gesto: 'Mantener presionado y desplazar', accion: 'Marcar (o desmarcar, según el primero) lo que se recorre' },
    { donde: 'Modo selección', tipo: 'mouse', gesto: 'Clic en «Visibles»', accion: 'Marcar lo que está en pantalla; con todo marcado, desmarcarlo' },
    { donde: 'Modo selección', tipo: 'mouse', gesto: 'Clic afuera', accion: 'Salir del modo (el botón de ocultar el panel no cuenta)' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Clic en el encabezado', accion: 'Plegar o desplegar la sección' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Mantener presionado el encabezado', accion: 'Reubicar la sección (entre las zonas y dentro de ellas)' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Mantener presionado un tile o chip', accion: 'Reubicar un favorito o un chip de Activos' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Doble clic en un modelo', accion: 'En el detalle de stock: ir a Activos con ese modelo buscado' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Doble clic en un grabador', accion: 'En el detalle de canales: buscarlo en Activos' },
    { donde: 'Panel Estado', tipo: 'mouse', gesto: 'Clic en un tipo', accion: 'En el detalle de stock: abrir sus modelos (se abre un tipo a la vez: el anterior se cierra)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Rueda sobre el panel', accion: 'Recorrer las pestañas: Estado, Activos, Producción, Historial y Ajustes (se apaga en Ajustes > «Rueda sobre el panel lateral»)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Mantener presionado «Ocultar / Mover»', accion: 'Arrastrar el panel a otro borde y soltar (solo escritorio)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Clic en «Ocultar / Mover»', accion: 'Ocultar o mostrar el panel (solo íconos)' },
];
const ATAJOS_TIPOS = [
    { tipo: 'teclado', titulo: 'Teclado', icono: 'bi-keyboard' },
    { tipo: 'mouse', titulo: 'Mouse y toque', icono: 'bi-mouse' },
];

/** Los atajos que contienen `texto` (sin distinguir mayúsculas ni tildes) en la acción, el lugar, las teclas o el gesto. */
function filtrarAtajos(atajos, texto) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const buscado = norm(texto).trim();
    if (!buscado) return [...atajos];
    return atajos.filter(a => norm([a.donde, a.accion, a.gesto || '', ...(a.teclas || [])].join(' ')).includes(buscado));
}

/** Los atajos de un tipo agrupados por `donde`, en el orden en que se anotaron: [[donde, [atajos]]]. */
function agruparAtajos(atajos, tipo) {
    const grupos = new Map();
    for (const a of atajos.filter(x => x.tipo === tipo)) {
        if (!grupos.has(a.donde)) grupos.set(a.donde, []);
        grupos.get(a.donde).push(a);
    }
    return [...grupos.entries()];
}
// ==== ATAJOS DATOS END ====

(function () {
    const $ = (id) => document.getElementById(id);
    const modal = $('modal-atajos');
    if (!modal) return;

    function pintar(texto) {
        const cuerpo = $('atajos-lista');
        const visibles = filtrarAtajos(ATAJOS, texto);
        const bloques = [];
        for (const { tipo, titulo, icono } of ATAJOS_TIPOS) {
            const grupos = agruparAtajos(visibles, tipo);
            if (!grupos.length) continue;
            const seccion = uiNodo('section', 'atajos-seccion');
            const h = uiNodo('h6', 'atajos-titulo text-secondary fw-bold text-uppercase');
            h.append(uiNodo('i', `bi ${icono} me-2`), titulo);
            seccion.append(h);
            for (const [donde, lista] of grupos) {
                const grupo = uiNodo('div', 'atajos-grupo');
                grupo.append(uiNodo('div', 'atajos-donde', donde));
                for (const a of lista) {
                    const fila = uiNodo('div', 'atajo-fila');
                    const claves = uiNodo('span', 'atajo-claves');
                    if (a.tipo === 'teclado') {
                        a.teclas.forEach((t, i) => {
                            if (i > 0) claves.append(uiNodo('span', 'atajo-mas', '+'));
                            claves.append(uiNodo('kbd', 'atajo-tecla', t));
                        });
                    } else {
                        claves.append(uiNodo('span', 'atajo-gesto', a.gesto));
                    }
                    fila.append(claves, uiNodo('span', 'atajo-accion', a.accion));
                    grupo.append(fila);
                }
                seccion.append(grupo);
            }
            bloques.push(seccion);
        }
        if (!bloques.length) bloques.push(uiNodo('div', 'text-secondary small p-3', 'Ningún atajo coincide con la búsqueda.'));
        cuerpo.replaceChildren(...bloques);
    }

    const buscar = $('atajos-buscar');
    if (buscar) {
        buscar.addEventListener('input', () => {
            const tabAtajos = $('ayuda-tab-atajos');
            if (tabAtajos && !tabAtajos.classList.contains('active') && typeof UI !== 'undefined' && UI.pestana) {
                UI.pestana.mostrar(tabAtajos);
            }
            pintar(buscar.value);
        });
    }
    modal.addEventListener('ui:modal-abrir', () => {
        if (buscar) buscar.value = '';
        pintar('');
    });
    pintar('');

    // Una letra con el modal abierto y el foco fuera de un campo se escribe en su filtro (no en la búsqueda del panel)
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || !/^[a-z0-9]$/i.test(e.key)) return;
        if (typeof UI === 'undefined' || UI.modal.arriba() !== modal) return;
        if (e.target instanceof Element
            && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        const tabAtajos = $('ayuda-tab-atajos');
        if (tabAtajos && typeof UI !== 'undefined' && UI.pestana) {
            UI.pestana.mostrar(tabAtajos);
        }
        if (buscar) {
            buscar.focus();
            buscar.value += e.key;
            buscar.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // «?» (con el foco fuera de un campo de texto y sin otro modal abierto): abre la lista de atajos
    document.addEventListener('keydown', (e) => {
        if (e.key !== '?' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
        if (document.documentElement.classList.contains('modo-kiosco')) return;
        if (e.target instanceof Element
            && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (typeof hayModalBloqueante === 'function' && hayModalBloqueante()) return;
        if (typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function' && UI.modal.arriba()) return;
        e.preventDefault();
        if (typeof UI !== 'undefined' && UI.modal) {
            UI.modal.abrir(modal);
        }
    });
})();
