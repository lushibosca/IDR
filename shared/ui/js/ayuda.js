// Modal de ayuda y atajos (#modal-atajos) de las apps con el esqueleto común: pestañas «Secciones», «Búsqueda y comodines» y «Atajos».
// Lo que cambia por app son DATOS que la app define antes (globales, todos opcionales):
//   ATAJOS            [{ donde, tipo: 'teclado' | 'mouse', teclas?: [..], gesto?: '..', accion }]   → pestaña Atajos (con filtro)
//   AYUDA_SECCIONES   [{ icono, titulo, insignia, desc, items: [[negrita, texto]] }]                → #ayuda-secciones (si está vacío)
//   AYUDA_BUSQUEDA    { intro, consejos: [texto] }                                                  → #ayuda-busqueda-intro / -consejos
// La tabla de operadores (#ayuda-comodines) es la misma para todas las apps (AYUDA_COMODINES). SGC trae esas pestañas escritas
// en su index.html y usa solo el render de Atajos. Además: «?» (con el foco fuera de un campo y sin otro modal) abre la ayuda, y una
// letra con el modal abierto se escribe en el filtro de atajos. Solo textContent. Se carga al final, después de ui.js.

// ==== AYUDA PURO BEGIN ====
const ATAJOS_TIPOS = [
    { tipo: 'teclado', titulo: 'Teclado', icono: 'bi-keyboard' },
    { tipo: 'mouse', titulo: 'Mouse y toque', icono: 'bi-mouse' },
];

// Operadores del buscador global (la sintaxis común: ../shared/ui/js/busqueda-tokens.js)
const AYUDA_COMODINES = [
    { nombre: 'Término simple', ejemplos: ['domo'], texto: 'Busca lo que contenga esa palabra en cualquiera de los campos activos.' },
    { nombre: 'Múltiples palabras (Y)', ejemplos: ['domo pasillo'], texto: 'Filtra lo que contenga todas las palabras (intersección).' },
    { nombre: 'Exclusión (!)', ejemplos: ['domo !ptz', 'domo ! ptz'], texto: 'Descarta los resultados que incluyan la palabra que sigue al signo.' },
    { nombre: 'Exclusión alternativa (-)', ejemplos: ['domo -ptz', 'domo - ptz'], texto: 'Equivalente a !: descarta los resultados con esa palabra.' },
    { nombre: 'Frase exacta', ejemplos: ['"acceso norte"'], texto: 'Busca la frase exacta, con las palabras contiguas y en ese orden (también entre paréntesis).' },
    { nombre: 'Frase de exclusión', ejemplos: ['camara !"piso 3"', 'camara -"piso 3"'], texto: 'Descarta lo que contenga la frase exacta completa.' },
    { nombre: 'Búsqueda combinada', ejemplos: ['hikvision !ptz "puerta 1" -caido'], texto: 'Combina palabras, frases exactas y varias exclusiones.' },
];

/** Los atajos que contienen `texto` (sin distinguir mayúsculas ni tildes) en la acción, el lugar, las teclas o el gesto. */
function filtrarAtajos(atajos, texto) {
    const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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
// ==== AYUDA PURO END ====

(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const nodo = (tag, clase, texto) => {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined && texto !== null) e.textContent = texto;
        return e;
    };
    const datos = {
        atajos: () => (typeof ATAJOS !== 'undefined' ? ATAJOS : []),
        secciones: () => (typeof AYUDA_SECCIONES !== 'undefined' ? AYUDA_SECCIONES : []),
        busqueda: () => (typeof AYUDA_BUSQUEDA !== 'undefined' ? AYUDA_BUSQUEDA : null),
    };

    function pintarSecciones(destino) {
        const cards = datos.secciones().map((s, i, todas) => {
            const card = nodo('div', 'ayuda-seccion-card' + (i === todas.length - 1 ? ' mb-0' : ''));
            const cab = nodo('div', 'ayuda-seccion-header');
            const titulo = nodo('span', 'ayuda-seccion-titulo');
            titulo.append(nodo('i', `bi ${s.icono} text-primary me-2`), s.titulo);
            cab.append(titulo, nodo('span', 'badge bg-secondary-subtle text-secondary', s.insignia));
            const items = nodo('div', 'ayuda-seccion-items');
            for (const [negrita, texto] of s.items || []) {
                const it = nodo('div', 'ayuda-seccion-item');
                it.append(nodo('strong', '', `${negrita}:`), ` ${texto}`);
                items.append(it);
            }
            card.append(cab, nodo('div', 'ayuda-seccion-desc', s.desc), items);
            return card;
        });
        destino.replaceChildren(...cards);
    }

    function pintarBusqueda() {
        const b = datos.busqueda();
        const intro = $('ayuda-busqueda-intro'), consejos = $('ayuda-busqueda-consejos'), tabla = $('ayuda-comodines');
        if (intro && b) intro.textContent = b.intro;
        if (consejos && b) consejos.replaceChildren(...(b.consejos || []).map((c) => nodo('li', '', c)));
        if (tabla && !tabla.children.length) {
            tabla.replaceChildren(...AYUDA_COMODINES.map((c) => {
                const tr = nodo('tr');
                const nombre = nodo('td'); nombre.append(nodo('strong', '', c.nombre));
                const ej = nodo('td');
                c.ejemplos.forEach((e, i) => { if (i) ej.append(' o '); ej.append(nodo('code', 'ayuda-code', e)); });
                tr.append(nombre, ej, nodo('td', '', c.texto));
                return tr;
            }));
        }
    }

    function pintarAtajos(texto) {
        const cuerpo = $('atajos-lista');
        if (!cuerpo) return;
        const visibles = filtrarAtajos(datos.atajos(), texto);
        const bloques = [];
        for (const { tipo, titulo, icono } of ATAJOS_TIPOS) {
            const grupos = agruparAtajos(visibles, tipo);
            if (!grupos.length) continue;
            const seccion = nodo('section', 'atajos-seccion');
            const h = nodo('h6', 'atajos-titulo text-secondary fw-bold text-uppercase');
            h.append(nodo('i', `bi ${icono} me-2`), titulo);
            seccion.append(h);
            for (const [donde, filas] of grupos) {
                const grupo = nodo('div', 'atajos-grupo');
                grupo.append(nodo('div', 'atajos-donde', donde));
                for (const a of filas) {
                    const fila = nodo('div', 'atajo-fila');
                    const claves = nodo('span', 'atajo-claves');
                    if (a.tipo === 'teclado') {
                        a.teclas.forEach((t, i) => {
                            if (i > 0) claves.append(nodo('span', 'atajo-mas', '+'));
                            claves.append(nodo('kbd', 'atajo-tecla', t));
                        });
                    } else {
                        claves.append(nodo('span', 'atajo-gesto', a.gesto));
                    }
                    fila.append(claves, nodo('span', 'atajo-accion', a.accion));
                    grupo.append(fila);
                }
                seccion.append(grupo);
            }
            bloques.push(seccion);
        }
        if (!bloques.length) bloques.push(nodo('div', 'text-secondary small p-3', 'Ningún atajo coincide con la búsqueda.'));
        cuerpo.replaceChildren(...bloques);
    }

    function iniciar() {
        const modal = $('modal-atajos');
        if (!modal) return;
        const secciones = $('ayuda-secciones');
        if (secciones && !secciones.children.length) pintarSecciones(secciones);
        pintarBusqueda();

        const buscar = $('atajos-buscar');
        const mostrarPestanaAtajos = () => {
            const pestana = $('ayuda-tab-atajos');
            if (pestana && !pestana.classList.contains('active') && typeof UI !== 'undefined' && UI.pestana) UI.pestana.mostrar(pestana);
        };
        if (buscar) {
            buscar.addEventListener('input', () => { mostrarPestanaAtajos(); pintarAtajos(buscar.value); });
        }
        modal.addEventListener('ui:modal-abrir', () => {
            if (buscar) buscar.value = '';
            pintarAtajos('');
        });
        pintarAtajos('');

        // Una letra con el modal abierto y el foco fuera de un campo se escribe en su filtro (no en la búsqueda del panel)
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || !/^[a-z0-9]$/i.test(e.key)) return;
            if (typeof UI === 'undefined' || UI.modal.arriba() !== modal) return;
            if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            e.preventDefault();
            const pestana = $('ayuda-tab-atajos');
            if (pestana && typeof UI !== 'undefined' && UI.pestana) UI.pestana.mostrar(pestana);
            if (buscar) {
                buscar.focus();
                buscar.value += e.key;
                buscar.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // «?» (con el foco fuera de un campo de texto y sin otro modal abierto): abre la ayuda
        document.addEventListener('keydown', (e) => {
            if (e.key !== '?' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
            if (document.documentElement.classList.contains('modo-kiosco')) return;
            if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (typeof hayModalBloqueante === 'function' && hayModalBloqueante()) return;
            if (typeof UI !== 'undefined' && UI.modal && typeof UI.modal.arriba === 'function' && UI.modal.arriba()) return;
            e.preventDefault();
            if (typeof UI !== 'undefined' && UI.modal) UI.modal.abrir(modal);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
