'use strict';

// Componentes de interfaz propios (reemplazan al JS de Bootstrap: docs/diseno/CSS-Y-UI.md).
// Se carga antes que app.js y expone un único global, `UI`, con tres piezas:
//   UI.pestana     pestañas y "pills"          data-ui-toggle="tab|pill"  data-ui-target="#panel"
//   UI.modal       ventanas modales            data-ui-toggle="modal"     data-ui-target="#modal"   data-ui-dismiss="modal"
//   UI.desplegable menús desplegables          data-ui-toggle="dropdown"  data-ui-offset="x,y"      data-ui-auto-close
// Los nombres de clase de estado son los de siempre (active, show, fade, modal-open, modal-backdrop) porque el CSS
// los usa. Eventos (burbujean; los "-ocultar/-mostrar/-abrir/-cerrar" se pueden cancelar con preventDefault):
//   ui:pestana-ocultar → ui:pestana-mostrar → ui:pestana-oculta → ui:pestana-mostrada   (detail.relacionado)
//   ui:modal-abrir → ui:modal-abierto ;  ui:modal-cerrar → ui:modal-cerrado            (detail.disparador)
//   ui:modal-flotante (detail.flotante): el modal pasó a flotante («PiP», botón data-ui-flotar) o volvió a modal
// Nada de innerHTML: este archivo no arma HTML con datos.

// ==== UI PURO BEGIN ====
/**
 * Milisegundos que dura la transición de un elemento según su estilo calculado (como hace el navegador con el
 * primer valor de cada lista). Valores inválidos o vacíos = 0.
 * @param {string} duracion - p. ej. "0.3s, 1s" o "150ms"
 * @param {string} retardo
 */
function uiDuracionTransicion(duracion, retardo) {
    const ms = (texto) => {
        const v = String(texto || '').split(',')[0].trim();
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return v.endsWith('ms') ? n : n * 1000;
    };
    return ms(duracion) + ms(retardo);
}

/**
 * Índice del elemento siguiente/anterior en una lista de `total` elementos, dando la vuelta si `ciclico`.
 * `actual` = -1 (ninguno elegido): adelante → el primero; atrás → el último.
 */
function uiIndiceVecino(total, actual, adelante, ciclico) {
    if (total <= 0) return -1;
    if (actual < 0) return adelante ? 0 : total - 1;
    let i = actual + (adelante ? 1 : -1);
    if (ciclico) i = (i + total) % total;
    return Math.max(0, Math.min(total - 1, i));
}

/**
 * Posición de un menú desplegable anclado a su botón, en coordenadas de la ventana.
 * Abre hacia abajo; si abajo no entra y arriba sí, hacia arriba. Alineado al inicio o al final del botón y corrido
 * en horizontal lo justo para no salirse de la ventana.
 * @param {{left:number, top:number, right:number, bottom:number}} ref - rectángulo del botón
 * @param {{width:number, height:number}} menu
 * @param {{width:number, height:number}} ventana
 * @param {{alinear?: 'start'|'end', desplazamiento?: number, distancia?: number}} [opciones]
 * @returns {{x:number, y:number, lado:'bottom'|'top', posicion:string}}
 */
function uiPosicionDesplegable(ref, menu, ventana, opciones = {}) {
    const alinear = opciones.alinear === 'end' ? 'end' : 'start';
    const desplazamiento = Number.isFinite(opciones.desplazamiento) ? opciones.desplazamiento : 0;
    const distancia = Number.isFinite(opciones.distancia) ? opciones.distancia : 2;

    const espacioAbajo = ventana.height - ref.bottom - distancia;
    const espacioArriba = ref.top - distancia;
    const lado = (menu.height > espacioAbajo && espacioArriba >= menu.height) ? 'top' : 'bottom';
    const y = lado === 'bottom' ? ref.bottom + distancia : ref.top - distancia - menu.height;

    let x = alinear === 'end' ? ref.right - menu.width - desplazamiento : ref.left + desplazamiento;
    x = Math.max(0, Math.min(x, ventana.width - menu.width));
    return { x: Math.round(x), y: Math.round(y), lado, posicion: `${lado}-${alinear}` };
}

/**
 * ¿Un clic (o un Tab que soltó el foco) cierra este menú abierto? Reglas de `data-ui-auto-close`:
 * 'true' (por defecto) cierra con clics dentro y fuera, 'outside' solo fuera, 'inside' solo dentro, 'false' nunca.
 * El clic en su propio botón no cuenta (lo maneja el botón), ni el que cae en un campo de formulario del menú ni en una parte
 * del menú que no es un botón o enlace (encabezado, separador, margen: `enItem === false`).
 * @param {{autoCierre: string, enBoton: boolean, enMenu: boolean, etiqueta: string, enItem?: boolean}} c
 */
function uiDebeCerrarDesplegable(c) {
    if (c.enBoton) return false;
    const regla = ['true', 'false', 'inside', 'outside'].includes(c.autoCierre) ? c.autoCierre : 'true';
    if (regla === 'false') return false;
    if (regla === 'inside' && !c.enMenu) return false;
    if (regla === 'outside' && c.enMenu) return false;
    if (c.enMenu && c.enItem === false) return false;
    if (c.enMenu && /^(input|select|option|textarea|form)$/i.test(String(c.etiqueta || ''))) return false;
    return true;
}

/**
 * Lee `data-ui-offset` ("desplazamiento,distancia" en px). Inválido o ausente = [0, 2].
 * @param {string|null|undefined} texto
 * @returns {[number, number]}
 */
function uiLeerOffset(texto) {
    const partes = String(texto || '').split(',').map((p) => Number(p.trim()));
    if (partes.length !== 2 || !partes.every(Number.isFinite)) return [0, 2];
    return [partes[0], partes[1]];
}
// Posición (esquina superior izquierda) de un modal flotante de `ancho` x `alto`: la pedida, sin salirse de la ventana
// (con `margen` px de borde). Sin posición pedida, abajo a la derecha.
function uiPosicionFlotante(pedida, tam, ventana, margen = 16) {
    const maxX = Math.max(margen, ventana.width - tam.width - margen);
    const maxY = Math.max(margen, ventana.height - tam.height - margen);
    const x = pedida && Number.isFinite(pedida.x) ? pedida.x : maxX;
    const y = pedida && Number.isFinite(pedida.y) ? pedida.y : maxY;
    return { x: Math.min(Math.max(margen, x), maxX), y: Math.min(Math.max(margen, y), maxY) };
}
// Transformación que deja una caja que ya está en `nueva` visualmente en `vieja` (de donde viene): traslación y UNA sola
// escala, la del ancho, desde la esquina superior izquierda (con escalas distintas en x e y la imagen se estiraba). Sin
// tamaño medible, null (no se anima).
function uiTransformacionRecorrido(vieja, nueva) {
    const medible = (r) => Boolean(r) && r.width > 0 && r.height > 0;
    if (!medible(vieja) || !medible(nueva)) return null;
    const dx = Math.round((vieja.left - nueva.left) * 100) / 100;
    const dy = Math.round((vieja.top - nueva.top) * 100) / 100;
    const escala = Math.round((vieja.width / nueva.width) * 1000) / 1000;
    return `translate(${dx}px, ${dy}px) scale(${escala})`;
}
// ¿Menos movimiento? Lo pide la persona en el menú de ajustes (`data-movimiento="reducido"` en <html>) o el sistema
// (`prefers-reduced-motion`). Pura: los dos datos se pasan.
function uiReduceMovimiento(atributo, sistemaPide) {
    return atributo === 'reducido' || Boolean(sistemaPide);
}
// Capas de los modales apilados (uno abre a otro: el de detalle abre el del dispositivo). El primero usa las de siempre (null:
// las pone el CSS); cada nivel más sube dos: el fondo queda entre el modal de abajo y el de arriba. Sin pasarse de los
// popups y desplegables (`--capa-popup`, 5 por encima del modal base: aguanta tres niveles).
function uiCapasModal(nivel, base) {
    const n = Math.floor(Number(nivel));
    const b = Math.floor(Number(base));
    if (!(n >= 1) || !(b > 0)) return null;
    return { fondo: b + 2 * n - 1, modal: b + 2 * n };
}
// ==== UI PURO END ====

/** ¿Hay que evitar las animaciones? ÚNICA lectura de la preferencia (ajuste de la persona o del sistema). */
function uiMovimientoReducido() {
    return uiReduceMovimiento(document.documentElement.getAttribute('data-movimiento'),
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const UI = (() => {
    const SEL_PESTANA = '[data-ui-toggle="tab"], [data-ui-toggle="pill"]';
    const SEL_GRUPO_PESTANAS = '.nav, .list-group, [role="tablist"]';
    const SEL_ENFOCABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
        + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

    // ------------------------------------------------------------------ utilidades
    function emitir(el, nombre, detail, cancelable) {
        const ev = new CustomEvent(nombre, { bubbles: true, cancelable: Boolean(cancelable), detail: detail || {} });
        el.dispatchEvent(ev);
        return ev;
    }

    // Solo `#id` (lo que usa el HTML): nunca se pasa un selector arbitrario a querySelector.
    function objetivo(disparador) {
        const sel = disparador && (disparador.getAttribute('data-ui-target') || disparador.getAttribute('href'));
        if (!sel || sel.length < 2 || sel[0] !== '#') return null;
        return document.getElementById(sel.slice(1));
    }

    // Llama a `fn` cuando termina la transición de `el` (o enseguida si no hay que esperar). Como el navegador puede
    // no emitir transitionend (pestaña oculta, transición anulada), siempre hay un temporizador de respaldo.
    function alTerminarTransicion(el, fn, esperar) {
        if (!esperar) { fn(); return; }
        const cs = getComputedStyle(el);
        const ms = uiDuracionTransicion(cs.transitionDuration, cs.transitionDelay) + 5;
        let hecho = false;
        const terminar = (e) => {
            if (e && e.target !== el) return;
            if (hecho) return;
            hecho = true;
            el.removeEventListener('transitionend', terminar);
            fn();
        };
        el.addEventListener('transitionend', terminar);
        setTimeout(terminar, ms);
    }

    const reflujo = (el) => void el.offsetHeight;

    function visible(el) {
        return Boolean(el && el.isConnected && el.getClientRects().length > 0
            && getComputedStyle(el).visibility !== 'hidden');
    }

    function enfocar(el) {
        if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
    }

    // ------------------------------------------------------------------ pestañas
    function grupoDe(boton) {
        return boton.closest(SEL_GRUPO_PESTANAS);
    }

    function hermanas(boton) {
        const grupo = grupoDe(boton);
        if (!grupo) return [boton];
        return [...grupo.querySelectorAll(SEL_PESTANA)].filter((b) => grupoDe(b) === grupo);
    }

    function prepararGrupo(boton) {
        const grupo = grupoDe(boton);
        if (!grupo || grupo.dataset.uiPestanas === '1') return;
        grupo.dataset.uiPestanas = '1';
        grupo.setAttribute('role', 'tablist');
        for (const b of hermanas(boton)) {
            const activa = b.classList.contains('active');
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(activa));
            if (activa) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1');
            const panel = objetivo(b);
            if (panel) {
                if (panel.id) b.setAttribute('aria-controls', panel.id);
                panel.setAttribute('role', 'tabpanel');
                if (b.id) panel.setAttribute('aria-labelledby', b.id);
            }
        }
    }

    function desactivarPestana(boton, nueva) {
        boton.classList.remove('active');
        boton.blur();
        const panel = objetivo(boton);
        if (panel) {
            panel.classList.remove('active');
            alTerminarTransicion(panel, () => panel.classList.remove('show'), panel.classList.contains('fade'));
        }
        boton.setAttribute('aria-selected', 'false');
        boton.setAttribute('tabindex', '-1');
        emitir(boton, 'ui:pestana-oculta', { relacionado: nueva });
    }

    function activarPestana(boton, anterior) {
        boton.classList.add('active');
        const panel = objetivo(boton);
        if (panel) {
            panel.classList.add('active');
            alTerminarTransicion(panel, () => panel.classList.add('show'), panel.classList.contains('fade'));
        }
        boton.removeAttribute('tabindex');
        boton.setAttribute('aria-selected', 'true');
        emitir(boton, 'ui:pestana-mostrada', { relacionado: anterior });
    }

    // Igual que siempre: si ya está activa no hace nada; los eventos salen en orden ocultar → mostrar → oculta →
    // mostrada, todos SINCRÓNICOS (la animación de "mutación" de app.js cuenta con eso).
    function mostrarPestana(boton) {
        if (!boton || boton.classList.contains('active') || boton.disabled) return;
        prepararGrupo(boton);
        const anterior = hermanas(boton).find((b) => b !== boton && b.classList.contains('active')) || null;
        const evOcultar = anterior ? emitir(anterior, 'ui:pestana-ocultar', { relacionado: boton }, true) : null;
        const evMostrar = emitir(boton, 'ui:pestana-mostrar', { relacionado: anterior }, true);
        if ((evOcultar && evOcultar.defaultPrevented) || evMostrar.defaultPrevented) return;
        if (anterior) desactivarPestana(anterior, boton);
        activarPestana(boton, anterior);
    }

    function teclaEnPestana(e) {
        const boton = e.target instanceof Element ? e.target.closest(SEL_PESTANA) : null;
        if (!boton || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();   // como antes: con el foco en una pestaña, las flechas son de la pestaña
        const lista = hermanas(boton).filter((b) => !b.disabled && !b.classList.contains('disabled') && !b.hasAttribute('data-sin-ciclo'));
        const adelante = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        const i = uiIndiceVecino(lista.length, lista.indexOf(boton), adelante, true);
        if (i < 0) return;
        enfocar(lista[i]);
        mostrarPestana(lista[i]);
    }

    // ------------------------------------------------------------------ modales
    const estadoModal = new WeakMap();   // modal → { abierto, fondo, foco, inertes }
    const abiertos = [];                 // pila de modales abiertos (el último es el de arriba)

    function estado(modal) {
        let s = estadoModal.get(modal);
        if (!s) {
            s = { abierto: false, fondo: null, foco: null, inertes: [] };
            estadoModal.set(modal, s);
        }
        return s;
    }

    function modalArriba() {
        return abiertos.length ? abiertos[abiertos.length - 1] : null;
    }

    // Bloqueo de scroll SIN saltos: `html { scrollbar-gutter: stable }` (base.css) reserva el lugar de la barra,
    // así que ocultarla con `body.modal-open { overflow: hidden }` no cambia el ancho del contenido.
    function actualizarBloqueoScroll() {
        document.body.classList.toggle('modal-open', abiertos.length > 0);
        document.documentElement.classList.toggle('ui-modal-abierto', abiertos.length > 0);   // oscurece la franja reservada
    }

    // El resto de la página queda inerte (ni foco ni clics) mientras el modal está abierto.
    function volverInerte(modal, s) {
        s.inertes = [];
        for (const hijo of document.body.children) {
            if (hijo === modal || hijo === s.fondo || hijo.inert || hijo.tagName === 'SCRIPT') continue;
            if (abiertos.includes(hijo) && estado(hijo).flotante) continue;        // un modal flotante no bloquea nada ni se bloquea
            if (hijo.hasAttribute('data-ui-sobre-modal')) continue;     // un popup que se abre desde el modal (p. ej. el de un dispositivo)
            hijo.inert = true;
            s.inertes.push(hijo);
        }
    }

    function liberarInerte(s) {
        for (const el of s.inertes) el.inert = false;
        s.inertes = [];
    }

    function mostrarFondo(modal, s) {
        if (!s.fondo) {
            s.fondo = document.createElement('div');
            s.fondo.className = modal.classList.contains('fade') ? 'modal-backdrop fade' : 'modal-backdrop';
            document.body.appendChild(s.fondo);
            reflujo(s.fondo);
        }
        s.fondo.classList.add('show');
    }

    function quitarFondo(s) {
        if (s.fondo) s.fondo.remove();
        s.fondo = null;
    }

    function abrirModal(modal, disparador) {
        if (!modal) return;
        const s = estado(modal);
        if (s.abierto) return;
        if (emitir(modal, 'ui:modal-abrir', { disparador: disparador || null }, true).defaultPrevented) return;
        s.abierto = true;
        s.foco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        abiertos.push(modal);
        actualizarBloqueoScroll();
        mostrarFondo(modal, s);
        // un modal que abre a otro queda debajo (a igual capa gana el que está más abajo en el DOM, y los de armado a demanda
        // se agregan al final: el de arriba se vería tapado)
        const capas = uiCapasModal(abiertos.length - 1,
            parseInt(getComputedStyle(document.documentElement).getPropertyValue('--capa-modal'), 10) || 1055);
        modal.style.zIndex = capas ? String(capas.modal) : '';
        if (s.fondo) s.fondo.style.zIndex = capas ? String(capas.fondo) : '';

        if (!modal.isConnected) document.body.append(modal);
        modal.style.display = 'block';
        modal.removeAttribute('aria-hidden');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('role', 'dialog');
        modal.scrollTop = 0;
        const cuerpo = modal.querySelector('.modal-body');
        if (cuerpo) cuerpo.scrollTop = 0;
        // el modal que abre otro modal lo deja inerte (el de abajo no se toca), y este, que el de abajo había vuelto inerte
        // junto con el resto de la página (estaba en el DOM antes), vuelve a responder
        modal.inert = false;
        volverInerte(modal, s);
        reflujo(modal);
        modal.classList.add('show');

        const dialogo = modal.querySelector('.modal-dialog') || modal;
        alTerminarTransicion(dialogo, () => {
            if (!s.abierto) return;                 // se empezó a cerrar durante la apertura
            if (!modal.contains(document.activeElement)) enfocar(modal);
            emitir(modal, 'ui:modal-abierto', { disparador: disparador || null });
        }, modal.classList.contains('fade'));
    }

    // Cierra todos los modales abiertos (de arriba hacia abajo; los flotantes no cuentan): al irse a otra sección desde un popup
    // que se abrió dentro de un modal, el modal no tiene por qué quedar tapando la pantalla a la que se fue.
    function cerrarTodosModales() {
        for (const m of [...abiertos].reverse()) if (!estado(m).flotante) cerrarModal(m);
    }

    // Cerrar no espera a que termine la apertura: se puede interrumpir en cualquier momento.
    function cerrarModal(modal) {
        if (!modal) return;
        const s = estado(modal);
        if (!s.abierto) return;
        if (emitir(modal, 'ui:modal-cerrar', {}, true).defaultPrevented) return;
        s.abierto = false;
        const i = abiertos.indexOf(modal);
        if (i >= 0) abiertos.splice(i, 1);
        liberarInerte(s);
        modal.classList.remove('show');
        if (s.fondo) s.fondo.classList.remove('show');

        alTerminarTransicion(modal, () => {
            if (s.abierto) return;                  // se volvió a abrir mientras se cerraba
            modal.style.display = 'none';
            if (s.flotante) {                       // la próxima vez se abre como modal normal
                s.flotante = false;
                modal.classList.remove('modal-flotante');
                const dialogo = modal.querySelector('.modal-dialog');
                if (dialogo) { dialogo.style.left = ''; dialogo.style.top = ''; }
            }
            modal.setAttribute('aria-hidden', 'true');
            modal.removeAttribute('aria-modal');
            modal.removeAttribute('role');
            quitarFondo(s);
            actualizarBloqueoScroll();
            const volver = s.foco;
            s.foco = null;
            if (volver && visible(volver) && !modalArriba()) enfocar(volver);
            emitir(modal, 'ui:modal-cerrado', {});
        }, modal.classList.contains('fade'));
    }

    // Modal flotante («PiP»): deja de bloquear la página (sin fondo, sin inerte, sin bloqueo de scroll ni Escape) y queda
    // como una ventana chica arrastrable; sigue abierto (lo que corre adentro, como el video, no se corta). `flotar(modal,
    // false)` lo devuelve a modal normal. Cerrarlo funciona igual en los dos modos.
    const posicionFlotante = new WeakMap();   // modal → { x, y } donde el usuario lo dejó

    function ubicarFlotante(modal) {
        const dialogo = modal.querySelector('.modal-dialog');
        if (!dialogo) return;
        const r = dialogo.getBoundingClientRect();
        const p = uiPosicionFlotante(posicionFlotante.get(modal) || null, { width: r.width, height: r.height },
            { width: window.innerWidth, height: window.innerHeight });
        posicionFlotante.set(modal, p);
        dialogo.style.left = `${p.x}px`;
        dialogo.style.top = `${p.y}px`;
    }

    // El contenido del modal recorre el camino de su caja vieja a la nueva (FLIP): se pone con la transformación inversa y se
    // suelta con transición. Se mide y se mueve `.modal-content` (la caja visible: el diálogo puede ser más alto) con una
    // sola escala. Con menos movimiento cambia directo.
    const TRANSICION_FLOTAR = 'transform 0.32s cubic-bezier(0.2, 0, 0, 1)';
    function animarRecorrido(modal, cajaVieja) {
        const contenido = modal.querySelector('.modal-content');
        if (!contenido || uiMovimientoReducido()) return;
        const t = uiTransformacionRecorrido(cajaVieja, contenido.getBoundingClientRect());
        if (!t) return;
        contenido.style.transition = 'none';
        contenido.style.transformOrigin = '0 0';
        contenido.style.transform = t;
        reflujo(contenido);
        contenido.style.transition = TRANSICION_FLOTAR;
        contenido.style.transform = 'none';
        let hecho = false;
        const terminar = (e) => {
            if (hecho || (e && e.target !== contenido)) return;
            hecho = true;
            contenido.removeEventListener('transitionend', terminar);
            contenido.style.transition = '';
            contenido.style.transform = '';
            contenido.style.transformOrigin = '';
        };
        contenido.addEventListener('transitionend', terminar);
        setTimeout(terminar, 400);
    }

    function flotarModal(modal, flotar = true) {
        if (!modal) return;
        const s = estado(modal);
        if (!s.abierto || Boolean(s.flotante) === flotar) return;
        s.flotante = flotar;
        const dialogo = modal.querySelector('.modal-dialog');
        const contenidoModal = modal.querySelector('.modal-content');
        const cajaVieja = contenidoModal ? contenidoModal.getBoundingClientRect() : null;
        if (flotar) {
            const i = abiertos.indexOf(modal);
            if (i >= 0) abiertos.splice(i, 1);
            liberarInerte(s);
            const fondo = s.fondo;                  // el fondo se desvanece en lugar de desaparecer de golpe
            s.fondo = null;
            if (fondo) {
                fondo.classList.remove('show');
                alTerminarTransicion(fondo, () => fondo.remove(), fondo.classList.contains('fade'));
            }
            modal.classList.add('modal-flotante');
            modal.removeAttribute('aria-modal');
            actualizarBloqueoScroll();
            ubicarFlotante(modal);
            animarRecorrido(modal, cajaVieja);
        } else {
            modal.classList.remove('modal-flotante');
            if (dialogo) { dialogo.style.left = ''; dialogo.style.top = ''; }
            abiertos.push(modal);
            actualizarBloqueoScroll();
            mostrarFondo(modal, s);
            modal.setAttribute('aria-modal', 'true');
            volverInerte(modal, s);
            animarRecorrido(modal, cajaVieja);
        }
        emitir(modal, 'ui:modal-flotante', { flotante: flotar });
    }

    // Arrastre del modal flotante desde cualquier parte de su contenido (no desde sus botones ni campos)
    let arrastre = null;
    function alPresionarFlotante(e) {
        if (e.button !== 0 || !(e.target instanceof Element)) return;
        const cab = e.target.closest('.modal-flotante .modal-content');
        if (!cab || e.target.closest('button, a, input, select, textarea')) return;
        const modal = cab.closest('.modal');
        const dialogo = modal.querySelector('.modal-dialog');
        const r = dialogo.getBoundingClientRect();
        arrastre = { modal, dialogo, dx: e.clientX - r.left, dy: e.clientY - r.top, ancho: r.width, alto: r.height };
        modal.classList.add('modal-flotante-arrastrando');
        e.preventDefault();
    }
    function alMoverFlotante(e) {
        if (!arrastre) return;
        const p = uiPosicionFlotante({ x: e.clientX - arrastre.dx, y: e.clientY - arrastre.dy },
            { width: arrastre.ancho, height: arrastre.alto }, { width: window.innerWidth, height: window.innerHeight });
        posicionFlotante.set(arrastre.modal, p);
        arrastre.dialogo.style.left = `${p.x}px`;
        arrastre.dialogo.style.top = `${p.y}px`;
    }
    function alSoltarFlotante() {
        if (!arrastre) return;
        arrastre.modal.classList.remove('modal-flotante-arrastrando');
        arrastre = null;
    }

    function alternarModal(modal, disparador) {
        if (!modal) return;
        if (estado(modal).abierto) cerrarModal(modal); else abrirModal(modal, disparador);
    }

    // ¿Está dentro de algo marcado `data-ui-sobre-modal` (popup que convive con el modal abierto, fuera de él en el DOM)?
    function deSobreModal(nodo) {
        return nodo instanceof Element && nodo.closest('[data-ui-sobre-modal]') !== null;
    }

    // Tab y Shift+Tab dan la vuelta dentro del modal de arriba (con `inert` el foco ya no puede salir; esto es para
    // que tampoco se escape a la barra del navegador).
    function atraparFoco(e) {
        const modal = modalArriba();
        if (!modal || e.key !== 'Tab') return;
        const lista = [...modal.querySelectorAll(SEL_ENFOCABLE)].filter(visible);
        if (!lista.length) { e.preventDefault(); enfocar(modal); return; }
        const primero = lista[0];
        const ultimo = lista[lista.length - 1];
        const actual = document.activeElement;
        if (deSobreModal(actual)) return;                       // el foco está en un popup abierto desde el modal
        if (e.shiftKey && (actual === primero || actual === modal || !modal.contains(actual))) {
            e.preventDefault();
            enfocar(ultimo);
        } else if (!e.shiftKey && (actual === ultimo || !modal.contains(actual))) {
            e.preventDefault();
            enfocar(primero);
        }
    }

    // ------------------------------------------------------------------ desplegables
    function menuDe(boton) {
        let hermano = boton.nextElementSibling;
        while (hermano && !hermano.classList.contains('dropdown-menu')) hermano = hermano.nextElementSibling;
        if (hermano) return hermano;
        return boton.parentElement ? boton.parentElement.querySelector(':scope > .dropdown-menu') : null;
    }

    function desplegableAbierto(boton) {
        const menu = menuDe(boton);
        return Boolean(menu && menu.classList.contains('show'));
    }

    function posicionarMenu(boton, menu) {
        // En la barra superior el menú va donde lo pone el CSS (debajo del botón), como siempre: sin cálculo.
        if (boton.closest('.navbar')) {
            menu.setAttribute('data-ui-posicion', 'estatica');
            return;
        }
        const [desplazamiento, distancia] = uiLeerOffset(boton.getAttribute('data-ui-offset'));
        const r = uiPosicionDesplegable(
            boton.getBoundingClientRect(),
            { width: menu.offsetWidth, height: menu.offsetHeight },
            { width: document.documentElement.clientWidth, height: window.innerHeight },
            { alinear: menu.classList.contains('dropdown-menu-end') ? 'end' : 'start', desplazamiento, distancia });
        // De coordenadas de la ventana a coordenadas del contenedor posicionado del menú.
        const padre = menu.offsetParent || document.documentElement;
        const rp = padre.getBoundingClientRect();
        const x = r.x - rp.left - padre.clientLeft + padre.scrollLeft;
        const y = r.y - rp.top - padre.clientTop + padre.scrollTop;
        menu.style.position = 'absolute';
        menu.style.inset = '0 auto auto 0';
        menu.style.margin = '0';                // la separación la da `distancia` (el margin del CSS se sumaría)
        menu.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        menu.setAttribute('data-ui-posicion', r.posicion);
    }

    function abrirDesplegable(boton) {
        if (!boton || boton.disabled || boton.classList.contains('disabled')) return;
        const menu = menuDe(boton);
        if (!menu || menu.classList.contains('show')) return;
        enfocar(boton);
        boton.setAttribute('aria-expanded', 'true');
        boton.classList.add('show');
        menu.scrollTop = 0;
        menu.classList.add('show');
        posicionarMenu(boton, menu);
    }

    function cerrarDesplegable(boton) {
        if (!boton) return;
        const menu = menuDe(boton);
        if (!menu || !menu.classList.contains('show')) return;
        menu.classList.remove('show');
        boton.classList.remove('show');
        boton.setAttribute('aria-expanded', 'false');
        menu.style.position = '';
        menu.style.inset = '';
        menu.style.margin = '';
        menu.style.transform = '';
        menu.removeAttribute('data-ui-posicion');
    }

    function alternarDesplegable(boton) {
        if (desplegableAbierto(boton)) cerrarDesplegable(boton); else abrirDesplegable(boton);
    }

    function botonesAbiertos() {
        return [...document.querySelectorAll('[data-ui-toggle="dropdown"]')].filter(desplegableAbierto);
    }

    function cerrarDesplegables(e) {
        for (const boton of botonesAbiertos()) {
            const menu = menuDe(boton);
            const destino = e && e.target instanceof Node ? e.target : null;
            const cerrar = uiDebeCerrarDesplegable({
                autoCierre: boton.getAttribute('data-ui-auto-close') || 'true',
                enBoton: Boolean(destino && boton.contains(destino)),
                enMenu: Boolean(destino && menu.contains(destino)),
                etiqueta: destino && destino.tagName,
                enItem: Boolean(destino && destino.closest && destino.closest('button, a, [role="menuitem"], .dropdown-item')),
            });
            if (cerrar) cerrarDesplegable(boton);
        }
    }

    function itemsDe(menu) {
        return [...menu.querySelectorAll('.dropdown-item:not(.disabled):not(:disabled)')].filter(visible);
    }

    function teclaEnDesplegable(e) {
        if (!(e.target instanceof Element)) return;
        const enMenu = e.target.closest('.dropdown-menu');
        const boton = e.target.closest('[data-ui-toggle="dropdown"]')
            || (enMenu && [...document.querySelectorAll('[data-ui-toggle="dropdown"]')].find((b) => menuDe(b) === enMenu));
        if (!boton) return;
        const esFlecha = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        if (!esFlecha && e.key !== 'Escape') return;
        if (/^(input|textarea)$/i.test(e.target.tagName) && e.key !== 'Escape') return;
        if (e.key === 'Escape' && !desplegableAbierto(boton)) return;   // no la consume: puede cerrar un modal
        e.preventDefault();
        if (e.key === 'Escape') {
            cerrarDesplegable(boton);
            enfocar(boton);
            return;
        }
        e.stopPropagation();
        abrirDesplegable(boton);
        const items = itemsDe(menuDe(boton));
        const i = uiIndiceVecino(items.length, items.indexOf(e.target), e.key === 'ArrowDown', false);
        if (i >= 0) {
            enfocar(items[i]);
            items[i].scrollIntoView?.({ block: 'nearest' });
        }
    }

    // ------------------------------------------------------------------ delegación (una vez, en document)
    let fondoPresionado = null;

    function alPresionar(e) {
        fondoPresionado = e.target instanceof Element && e.target.classList.contains('modal') ? e.target : null;
    }

    function alClic(e) {
        if (!(e.target instanceof Element)) return;

        // Clic en el fondo de un modal (el propio .modal, fuera del diálogo): cierra, salvo data-ui-backdrop="static".
        const m = e.target.classList.contains('modal') ? e.target : null;
        if (m && m === fondoPresionado && estado(m).abierto && m.getAttribute('data-ui-backdrop') !== 'static') {
            cerrarModal(m);
        }
        fondoPresionado = null;

        cerrarDesplegables(e);

        const disp = e.target.closest('[data-ui-toggle]');
        if (disp) {
            const tipo = disp.getAttribute('data-ui-toggle');
            if (disp.tagName === 'A') e.preventDefault();
            if (tipo === 'tab' || tipo === 'pill') {
                mostrarPestana(disp);
            } else if (tipo === 'modal') {
                const destino = objetivo(disp);
                const otro = modalArriba();
                if (otro && otro !== destino) cerrarModal(otro);   // dos modales no se apilan
                alternarModal(destino, disp);
            } else if (tipo === 'dropdown') {
                e.preventDefault();
                alternarDesplegable(disp);
            }
        }

        const flot = e.target.closest('[data-ui-flotar]');
        if (flot) {
            const m = flot.closest('.modal');
            if (m) flotarModal(m, !estado(m).flotante);
        }

        const cierre = e.target.closest('[data-ui-dismiss="modal"]');
        if (cierre) {
            if (cierre.tagName === 'A') e.preventDefault();
            cerrarModal(cierre.closest('.modal'));
        }
    }

    function alTecla(e) {
        teclaEnPestana(e);
        if (e.defaultPrevented) return;
        teclaEnDesplegable(e);
        atraparFoco(e);
        if (e.key === 'Escape') {
            const modal = modalArriba();
            if (modal && modal.getAttribute('data-ui-backdrop') !== 'static' && !e.defaultPrevented) {
                cerrarModal(modal);
                e.preventDefault();
            }
        }
    }

    function alSoltarTecla(e) {
        if (e.key === 'Tab') cerrarDesplegables(e);
    }

    // El foco no sale del modal de arriba (respaldo de `inert` para navegadores viejos).
    function alEnfocar(e) {
        const modal = modalArriba();
        if (modal && e.target instanceof Node && !modal.contains(e.target) && !deSobreModal(e.target)) enfocar(modal);
    }

    function iniciar() {
        document.querySelectorAll(SEL_PESTANA).forEach((b) => { if (b.classList.contains('active')) prepararGrupo(b); });
    }

    document.addEventListener('pointerdown', alPresionar, true);
    document.addEventListener('pointerdown', alPresionarFlotante);
    document.addEventListener('pointermove', alMoverFlotante);
    document.addEventListener('pointerup', alSoltarFlotante);
    document.addEventListener('pointercancel', alSoltarFlotante);
    document.addEventListener('click', alClic);
    document.addEventListener('keydown', alTecla);
    document.addEventListener('keyup', alSoltarTecla);
    document.addEventListener('focusin', alEnfocar);
    window.addEventListener('resize', () => {
        for (const m of document.querySelectorAll('.modal-flotante')) ubicarFlotante(m);   // sin salirse de la ventana
        for (const b of botonesAbiertos()) posicionarMenu(b, menuDe(b));
    }, { passive: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    return Object.freeze({
        pestana: Object.freeze({ mostrar: mostrarPestana }),
        modal: Object.freeze({ abrir: abrirModal, cerrar: cerrarModal, cerrarTodos: cerrarTodosModales, alternar: alternarModal,
            abierto: (m) => Boolean(m && estado(m).abierto), arriba: modalArriba, flotar: flotarModal,
            flotante: (m) => Boolean(m && estado(m).flotante) }),
        desplegable: Object.freeze({ abrir: abrirDesplegable, cerrar: cerrarDesplegable, alternar: alternarDesplegable,
            abierto: desplegableAbierto, cerrarTodos: () => botonesAbiertos().forEach(cerrarDesplegable) }),
    });
})();
window.UI = UI;
