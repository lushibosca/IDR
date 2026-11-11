// privacidad.js: modo privacidad (Ajustes > «Ocultar IP y MAC», o Alt+Shift+P): desenfoca las direcciones IP y MAC que se ven en pantalla
// para compartirla o sacar capturas. Es del dispositivo (como el sonido). No toca los datos ni el texto: cada dirección del
// texto de la página se envuelve en un <span class="dato-privado"> y el CSS la desenfoca solo con `html[data-privacidad]`
// (textContent, la búsqueda y «copiar» siguen igual). Los campos de formulario de IP y MAC se desenfocan con la misma clase.

// ==== PRIVACIDAD PURO BEGIN ====
const CLAVE_PRIVACIDAD = 'cctv:privacidad';
// IPv4 con octetos de 0 a 255, o MAC de seis pares; sin pegarse a otra palabra, dígito o punto («V5.7.1.2» no es una IP)
const RE_DATO_PRIVADO = /(?<![\w.:-])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}|(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2})(?![\w:-]|\.\d)/g;

// El texto partido en tramos [{ texto, privado }]: lo que es dirección IP o MAC va con `privado: true`
function partirDatosPrivados(texto) {
    const partes = [];
    if (typeof texto !== 'string' || texto === '') return partes;
    let desde = 0;
    for (const m of texto.matchAll(RE_DATO_PRIVADO)) {
        if (m.index > desde) partes.push({ texto: texto.slice(desde, m.index), privado: false });
        partes.push({ texto: m[0], privado: true });
        desde = m.index + m[0].length;
    }
    if (desde < texto.length) partes.push({ texto: texto.slice(desde), privado: false });
    return partes;
}
// ==== PRIVACIDAD PURO END ====

if (typeof document !== 'undefined') {
    const IDS_CAMPOS_PRIVADOS = ['stock-f-ip', 'stock-f-mac'];          // campos de formulario con IP o MAC
    const SALTAR = 'script, style, textarea, input, select, option, .dato-privado';
    let observador = null;

    const activa = () => typeof storage !== 'undefined' && storage.get(CLAVE_PRIVACIDAD) === '1';

    // Envuelve cada dirección de los nodos de texto bajo `raiz` (una sola vez: lo ya envuelto se salta)
    function envolver(raiz) {
        if (!raiz || (raiz.nodeType !== Node.ELEMENT_NODE && raiz.nodeType !== Node.TEXT_NODE)) return;
        const textos = [];
        if (raiz.nodeType === Node.TEXT_NODE) {
            textos.push(raiz);
        } else {
            const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
            for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) textos.push(n);
        }
        for (const nodo of textos) {
            const padre = nodo.parentElement;
            if (!padre || padre.closest(SALTAR)) continue;
            const partes = partirDatosPrivados(nodo.nodeValue);
            if (!partes.some(p => p.privado)) continue;
            const frag = document.createDocumentFragment();
            for (const p of partes) {
                if (p.privado) {
                    const s = document.createElement('span');
                    s.className = 'dato-privado';
                    s.textContent = p.texto;
                    frag.append(s);
                } else {
                    frag.append(document.createTextNode(p.texto));
                }
            }
            nodo.replaceWith(frag);
        }
    }

    function marcarCampos() {
        for (const id of IDS_CAMPOS_PRIVADOS) document.getElementById(id)?.classList.add('dato-privado');
    }

    function aplicar() {
        const si = activa();
        document.documentElement.toggleAttribute('data-privacidad', si);
        if (observador) { observador.disconnect(); observador = null; }
        if (!si) return;
        marcarCampos();
        envolver(document.body);
        observador = new MutationObserver((cambios) => {
            for (const c of cambios) for (const n of c.addedNodes) envolver(n);
        });
        observador.observe(document.body, { childList: true, subtree: true });
    }

    // Prende o apaga el modo (el interruptor de Ajustes y Alt+Shift+P); avisa a quien lo muestre con `cctv:privacidad`
    function alternar() {
        const activo = !activa();
        storage.set(CLAVE_PRIVACIDAD, activo ? '1' : '0');
        aplicar();
        document.dispatchEvent(new CustomEvent('cctv:privacidad', { detail: { activo } }));
        mostrarToast(activo ? 'IP y MAC ocultas en pantalla.' : 'IP y MAC visibles.', 'info', 2500);
    }

    window.privacidadActiva = activa;
    window.alternarPrivacidad = alternar;
    document.addEventListener('DOMContentLoaded', aplicar);
    document.addEventListener('keydown', (ev) => {         // Alt+Shift+P: en cualquier pestaña, también con un modal abierto
        if (!uiEsAtajoAltShift(ev, 'p')) return;
        ev.preventDefault();
        alternar();
    });
}
