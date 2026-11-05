'use strict';
// Producción > canal libre: elegir qué dispositivo del stock va en ese canal (o dar de alta uno nuevo ahí). Al elegir,
// se abre el formulario del dispositivo (stock.js, `StockNucleo.abrirParaCanal`) con «Instalado», el grabador y el
// canal ya puestos: se revisa y se guarda como cualquier edición (las reglas son las del stock). Solo textContent.

// ==== ASIGNAR CANAL PURO BEGIN ====
const ASIGNAR_TIPOS_GRABADOR = ['nvr', 'dvr'];
const ASIGNAR_MAX = 200;

function asignarNormalizar(t) {
    return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** El id del stock del grabador de un grupo de Producción (por IP y, si no tiene, por nombre), o ''. */
function asignarGrabadorDe(nvrs, nvrIp, nvrNombre, limpiar) {
    const lista = Array.isArray(nvrs) ? nvrs : [];
    const n = (nvrIp && lista.find(x => x && x.ip === nvrIp && x.stock))
        || lista.find(x => x && x.stock && limpiar(x.nvr_name) === limpiar(nvrNombre));
    return n && n.stock && typeof n.stock.id === 'string' ? n.stock.id : '';
}

/** Qué se puede poner en un canal: todo lo que no es un grabador, primero lo del depósito listo para usar, después lo
 *  del depósito en otra condición, lo instalado sin canal y lo que está en otro canal (se mueve). `texto`: palabras
 *  que tienen que estar todas (descripción, marca, modelo, serie, MAC, patrimonio o IP). */
function asignarCandidatos(dispositivos, texto, nombre) {
    const palabras = asignarNormalizar(texto).split(/\s+/).filter(Boolean);
    const orden = (d) => {
        const i = d.instalacion;
        if (!i) return d.condicion === 'operativo' ? 0 : 1;
        return i.grabador ? 3 : 2;
    };
    const detalle = (d) => {
        const i = d.instalacion;
        const partes = [[d.marca, d.modelo].filter(Boolean).join(' ')];
        if (d.serie) partes.push(`serie ${d.serie}`);
        if (!i) partes.push(d.condicion === 'operativo' ? 'en depósito' : `en depósito (${d.condicion})`);
        else if (i.grabador) partes.push(`en el CH ${i.canal} de otro grabador`);
        else partes.push('instalado, sin canal');
        return partes.filter(Boolean).join(' · ');
    };
    return (Array.isArray(dispositivos) ? dispositivos : [])
        .filter(d => d && !ASIGNAR_TIPOS_GRABADOR.includes(d.tipo))
        .filter(d => {
            if (!palabras.length) return true;
            const i = d.instalacion || {};
            const pajar = asignarNormalizar([nombre(d), d.marca, d.modelo, d.serie, d.mac, d.patrimonio, i.ip].join(' '));
            return palabras.every(p => pajar.includes(p));
        })
        .map(d => ({ id: d.id, nombre: nombre(d), detalle: detalle(d), orden: orden(d) }))
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }))
        .slice(0, ASIGNAR_MAX);
}
// ==== ASIGNAR CANAL PURO END ====

(() => {
    const $ = (id) => document.getElementById(id);
    let destino = null;               // { grabador, canal, nombre }

    const nombre = (d) => stockNombreVisible(d, String(d.tipo || '').toUpperCase() || 'Dispositivo');
    const nucleo = () => window.StockNucleo;
    const dispositivos = () => {
        const e = nucleo() && nucleo().estado();
        return e && e.datos ? e.datos.dispositivos : [];
    };

    function pintar() {
        const lista = $('asignar-lista');
        const vacio = $('asignar-vacio');
        if (!lista || !vacio) return;
        const items = asignarCandidatos(dispositivos(), $('asignar-buscar').value, nombre);
        lista.replaceChildren(...items.map(it => {
            const b = uiNodo('button', 'list-group-item asignar-item');
            b.type = 'button';
            b.dataset.asignarId = it.id;
            b.append(uiNodo('span', 'fw-semibold', it.nombre), uiNodo('span', 'asignar-item-detalle', it.detalle));
            return b;
        }));
        vacio.textContent = items.length ? '' : 'No hay dispositivos que coincidan: podés dar de alta uno nuevo en este canal.';
        vacio.classList.toggle('d-none', items.length > 0);
    }

    function elegir(d) {
        const modalEl = $('asignarCanalModal');
        const { grabador, canal } = destino;
        // el formulario se abre cuando este modal terminó de cerrarse (dos modales no se apilan)
        modalEl.addEventListener('ui:modal-cerrado', () => nucleo().abrirParaCanal(d, grabador, canal), { once: true });
        UI.modal.cerrar(modalEl);
    }

    /** `datos`: el dataset del canal libre (channelId, nvrIp, nvrName). */
    async function abrir(datos) {
        if (!nucleo() || typeof UI === 'undefined') return;
        const e = nucleo().estado();
        if (!e || !e.datos) await nucleo().cargar();
        const grabador = asignarGrabadorDe(uiNvrsCargados(), datos.nvrIp || '', datos.nvrName || '', limpiarNombreNvr);
        const canal = uiNumeroCanal(datos.channelId);
        if (!grabador || !canal) {
            mostrarToast('No se encontró el grabador de ese canal en el stock.', 'warning');
            return;
        }
        destino = { grabador, canal };
        uiPonerTexto('asignar-titulo-texto', `CH ${canal} de ${datos.nvrName || 'el grabador'}`);
        $('asignar-buscar').value = '';
        pintar();
        UI.modal.abrir($('asignarCanalModal'));
        setTimeout(() => $('asignar-buscar').focus(), 50);
    }
    window.abrirAsignarCanal = abrir;

    document.addEventListener('DOMContentLoaded', () => {
        const buscar = $('asignar-buscar');
        const lista = $('asignar-lista');
        if (!buscar || !lista) return;
        buscar.addEventListener('input', pintar);
        buscar.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            const primero = lista.querySelector('[data-asignar-id]');
            if (primero) primero.click();
        });
        lista.addEventListener('click', (ev) => {
            const b = ev.target instanceof Element ? ev.target.closest('[data-asignar-id]') : null;
            if (!b || !destino) return;
            const d = dispositivos().find(x => x.id === b.dataset.asignarId);
            if (d) elegir(d);
        });
        $('asignar-nuevo').addEventListener('click', () => { if (destino) elegir(null); });
    });
})();
