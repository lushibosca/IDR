// favoritos.js: sección Favoritos del panel Estado. Equipos que ya monitorea el sistema (cámaras, grabadores y equipos de
// red de /api/v2/datos) a un clic: su foto, su descripción y su estado. Se agregan con la estrella del popup del equipo
// (`favoritosConfigurarBoton`, que llama abrirPopupDispositivo en produccion.js). La lista es una preferencia por
// usuario (`panel.favoritos`, cctv/preferencias.py): la sigue a otra PC. Solo se pintan los que hoy están en los datos.

// ==== FAVORITOS PURO BEGIN ====
const CLAVE_FAVORITOS = 'cctv:favoritos';
const CLAVE_FAVORITOS_COMPACTO = 'cctv:favoritos_compacto';
const CLAVE_FAVORITOS_CAPTURA = 'cctv:favoritos_captura';
// Tope y forma: lo mismo que `MAX_FAVORITOS`, `IP_FAVORITO` y `CANAL_FAVORITO` de cctv/preferencias.py (test_preferencias.py)
const MAX_FAVORITOS = 15;
const RE_IP_FAVORITO = /^[0-9A-Fa-f:.]{2,45}$/;
const RE_CANAL_FAVORITO = /^[0-9]{1,5}$/;

/** Identidad estable de un favorito: `cam:IP_DEL_NVR:CANAL`, `nvr:IP` o `eq:IP` (equipo de red); null si no es válida. */
function claveFavorito(tipo, ip, canal) {
    const i = uiValorInformado(ip);
    if (!RE_IP_FAVORITO.test(i)) return null;
    if (tipo === 'nvr' || tipo === 'eq') return `${tipo}:${i}`;
    const c = uiNumeroCanal(canal);
    return tipo === 'cam' && RE_CANAL_FAVORITO.test(c) ? `cam:${i}:${c}` : null;
}

/** `clave` -> {tipo, ip, canal} (canal solo en las cámaras), o null si no tiene la forma de `claveFavorito`. */
function partesFavorito(clave) {
    const m = typeof clave === 'string' ? /^(?:(nvr|eq):(.+)|(cam):(.+):([0-9]+))$/.exec(clave) : null;
    if (!m) return null;
    const partes = m[1] ? { tipo: m[1], ip: m[2], canal: '' } : { tipo: m[3], ip: m[4], canal: m[5] };
    return claveFavorito(partes.tipo, partes.ip, partes.canal) === clave ? partes : null;
}

/** Lista guardada (entrada no confiable) -> claves válidas, sin repetidos y hasta el máximo. */
function favoritosValidos(guardado) {
    if (!Array.isArray(guardado)) return [];
    return [...new Set(guardado.filter(c => partesFavorito(c) !== null))].slice(0, MAX_FAVORITOS);
}

/** Agrega o quita `clave`: {lista, agregado, lleno}. Con la lista llena no agrega (y lo dice en `lleno`). */
function alternarFavorito(lista, clave, max = MAX_FAVORITOS) {
    const actual = Array.isArray(lista) ? lista : [];
    if (actual.includes(clave)) return { lista: actual.filter(c => c !== clave), agregado: false, lleno: false };
    if (actual.length >= max) return { lista: [...actual], agregado: false, lleno: true };
    return { lista: [...actual, clave], agregado: true, lleno: false };
}

/** El favorito de lo que abre el popup: {clave, tipo} solo si el sistema lo monitorea hoy (está en `datos`); si no, null.
 *  Cámara = nvr_ip + canal; grabador (`esGrabador`) = su IP; equipo de red = el que no tiene grabador ni canal. */
function favoritoDeEquipo(cam, esGrabador, datos) {
    if (!cam || !datos) return null;
    const lista = (k) => (Array.isArray(datos[k]) ? datos[k] : []);
    const nvrIp = uiValorInformado(cam.nvr_ip);
    const canal = uiNumeroCanal(cam.channel_id);
    if (esGrabador) {
        const ip = nvrIp || uiValorInformado(cam.ip_address);
        const clave = claveFavorito('nvr', ip);
        return clave && lista('nvrs').some(n => n && uiValorInformado(n.ip) === ip) ? { clave, tipo: 'nvr' } : null;
    }
    if (nvrIp && canal) {
        const clave = claveFavorito('cam', nvrIp, canal);
        return clave && lista('camaras').some(c => c && uiValorInformado(c.nvr_ip) === nvrIp && uiNumeroCanal(c.channel_id) === canal)
            ? { clave, tipo: 'cam' } : null;
    }
    const ip = uiValorInformado(cam.ip_address);
    const clave = claveFavorito('eq', ip);
    return clave && !nvrIp && !canal && lista('equipos_red').some(e => e && uiValorInformado(e.ip) === ip)
        ? { clave, tipo: 'eq' } : null;
}

/** Un favorito con lo que muestra el tile: {clave, tipo, nombre, ip, modelo, estado, cam}. `cam` es la forma que espera el popup.
 *  estado: 'online' | 'offline' | 'sin_senal' | 'desconocido'. null si ya no está en los datos. */
function resolverFavorito(clave, datos) {
    const partes = partesFavorito(clave);
    if (!partes || !datos) return null;
    const lista = (k) => (Array.isArray(datos[k]) ? datos[k] : []);
    const { tipo, ip, canal } = partes;
    if (tipo === 'cam') {
        const c = lista('camaras').find(x => x && uiValorInformado(x.nvr_ip) === ip && uiNumeroCanal(x.channel_id) === canal);
        if (!c) return null;
        const estado = c.is_offline ? (c.sin_senal ? 'sin_senal' : 'offline') : 'online';
        return { clave, tipo, nombre: uiValorInformado(c.camera_name) || `Canal ${canal}`, ip: uiValorInformado(c.ip_address),
            modelo: uiValorInformado(c.modelo) || uiValorInformado(c.stock?.modelo), estado, cam: c };
    }
    if (tipo === 'nvr') {
        const n = lista('nvrs').find(x => x && uiValorInformado(x.ip) === ip);
        if (!n) return null;
        const nombre = uiValorInformado(n.nvr_name) || ip;
        const cam = { camera_name: nombre, ip_address: n.ip, nvr_ip: n.ip, nvr_name: nombre, modelo: uiValorInformado(n.modelo),
            firmware: uiValorInformado(n.firmware), mac_address: uiValorInformado(n.mac_address), channel_id: null,
            is_offline: !!n.is_offline, tipo: 'nvr', stock: n.stock };
        return { clave, tipo, nombre, ip: n.ip, modelo: cam.modelo, estado: n.is_offline ? 'offline' : 'online', cam };
    }
    if (tipo === 'eq') {
        const e = lista('equipos_red').find(x => x && uiValorInformado(x.ip) === ip);
        if (!e) return null;
        const nombre = uiValorInformado(e.nombre) || ip;
        const estado = e.estado === 'offline' ? 'offline' : (e.estado === 'online' ? 'online' : 'desconocido');
        const cam = { camera_name: nombre, ip_address: e.ip, nvr_ip: '', nvr_name: '', channel_id: null,
            modelo: uiValorInformado(e.modelo), firmware: '', mac_address: '', tipo: uiValorInformado(e.tipo) || 'equipo',
            is_offline: e.estado === 'offline', stock: e.stock, id: e.stock?.id };
        return { clave, tipo, nombre, ip: e.ip, modelo: cam.modelo, estado, cam };
    }
    return null;
}

/** Los favoritos guardados que hoy se pueden pintar, en el orden en que se agregaron. */
function modeloFavoritos(claves, datos) {
    return favoritosValidos(claves).map(c => resolverFavorito(c, datos)).filter(Boolean);
}

/** Las claves de favoritos de los dispositivos del stock `ids` que el sistema monitorea hoy (el vínculo de /api/v2/datos:
 *  `stock.id` de la cámara, del grabador o del equipo de red). {claves, noMonitoreados}. */
function favoritosDeStock(ids, datos) {
    const lista = (k) => (datos && Array.isArray(datos[k]) ? datos[k] : []);
    const claves = [];
    let noMonitoreados = 0;
    for (const id of ids) {
        const cam = lista('camaras').find(c => c && c.stock && c.stock.id === id);
        const nvr = lista('nvrs').find(n => n && n.stock && n.stock.id === id);
        const eq = lista('equipos_red').find(e => e && e.stock && e.stock.id === id);
        const clave = cam ? claveFavorito('cam', cam.nvr_ip, uiNumeroCanal(cam.channel_id))
            : nvr ? claveFavorito('nvr', nvr.ip) : eq ? claveFavorito('eq', eq.ip) : null;
        if (clave) claves.push(clave); else noMonitoreados++;
    }
    return { claves, noMonitoreados };
}

/** Suma `nuevas` a la lista sin repetir y sin pasar del máximo: {lista, agregados, yaEstaban, sinLugar}. */
function sumarFavoritos(lista, nuevas, max = MAX_FAVORITOS) {
    const resultado = [...lista];
    let agregados = 0, yaEstaban = 0, sinLugar = 0;
    for (const c of new Set(nuevas)) {
        if (resultado.includes(c)) yaEstaban++;
        else if (resultado.length >= max) sinLugar++;
        else { resultado.push(c); agregados++; }
    }
    return { lista: resultado, agregados, yaEstaban, sinLugar };
}

/** Qué se le dice a la persona tras «Agregar a favoritos» de una selección. */
function textoSumaFavoritos(r, noMonitoreados, max = MAX_FAVORITOS) {
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    const partes = [r.agregados ? `${plural(r.agregados, 'agregado', 'agregados')} a favoritos` : 'No se agregó ninguno a favoritos'];
    if (r.yaEstaban) partes.push(`${plural(r.yaEstaban, 'ya estaba', 'ya estaban')}`);
    if (noMonitoreados) partes.push(`${plural(noMonitoreados, 'no se monitorea', 'no se monitorean')}`);
    if (r.sinLugar) partes.push(`${plural(r.sinLugar, 'quedó afuera', 'quedaron afuera')} (máximo ${max})`);
    return partes.join(' · ');
}

/** Lo que cambia lo que se ve: si no cambió, el panel no se repinta (no pierde el foco ni el popup abierto). */
function firmaFavoritos(items, compacto = false, captura = false) {
    return JSON.stringify([compacto, captura, items.map(i => [i.clave, i.nombre, i.modelo, i.estado])]);
}
/** El texto de la etiqueta flotante del tile en el modo «solo íconos»: «Nombre · Estado». */
function etiquetaFavorito(item, estados) {
    return `${item.nombre} · ${estados[item.estado]}`;
}
/** Columnas de la grilla: las que entran en `ancho` (tiles de al menos `minimo`, separados por `hueco`), repartidas en
 *  filas parejas (6 tiles donde entran 4: 2 filas de 3, no 4 + 2) y así cada tile aprovecha el ancho. */
function columnasFavoritos(cantidad, ancho, minimo = 210, hueco = 12) {
    if (!(cantidad > 0)) return 1;
    const caben = Math.max(1, Math.floor((ancho + hueco) / (minimo + hueco)));
    return Math.ceil(cantidad / Math.ceil(cantidad / caben));
}
/** La lista guardada con el nuevo orden de los que se ven (`visibles`, en orden): ocupan los mismos lugares que tenían y los
 *  guardados que hoy no se pintan (ya no están en los datos) no se mueven. */
function reordenarFavoritos(guardados, visibles) {
    const lugares = new Set(visibles);
    const orden = [...visibles];
    return guardados.map(c => (lugares.has(c) ? orden.shift() : c));
}

/** El dispositivo que el sistema monitorea hoy con esa IP (cámara, grabador o equipo de red), con la forma de
 *  `resolverFavorito`; null si ninguno la tiene. Sirve para referenciar una IP «origen» sin ocultarla. */
function dispositivoPorIp(ip, datos) {
    const i = uiValorInformado(ip);
    if (!i || !datos) return null;
    const lista = (k) => (Array.isArray(datos[k]) ? datos[k] : []);
    const cam = lista('camaras').find(c => c && uiValorInformado(c.ip_address) === i);
    const nvr = cam ? null : lista('nvrs').find(n => n && uiValorInformado(n.ip) === i);
    const eq = cam || nvr ? null : lista('equipos_red').find(e => e && uiValorInformado(e.ip) === i);
    const clave = cam ? claveFavorito('cam', cam.nvr_ip, uiNumeroCanal(cam.channel_id))
        : nvr ? claveFavorito('nvr', nvr.ip) : eq ? claveFavorito('eq', eq.ip) : null;
    return clave ? resolverFavorito(clave, datos) : null;
}

/** La cámara en producción de ese canal de ese grabador (forma de `resolverFavorito`), o null. El canal de un log
 *  puede venir como `D34` (localID del NVR): se quita el prefijo; `A1` (analógico) no está en el inventario IP. */
function dispositivoDeCanal(nvrIp, canal, datos) {
    const clave = claveFavorito('cam', nvrIp, uiNumeroCanal(canal).replace(/^D(?=[0-9])/i, ''));
    return clave ? resolverFavorito(clave, datos) : null;
}

/** «Cámara · Nombre», para el tooltip de una IP que es de un dispositivo conocido. */
function dispositivoTitulo(fav) {
    const tipos = { cam: 'Cámara', nvr: 'Grabador', eq: 'Equipo de red' };
    return `${tipos[fav.tipo] || 'Dispositivo'} en producción: ${fav.nombre}`;
}
// ==== FAVORITOS PURO END ====

/** Hace que `el` abra el popup del dispositivo `fav` (clic) o su modal (doble clic, si tiene IP). Solo agrega la
 *  interacción: el texto de `el` no se toca. */
function uiEnlazarDispositivo(el, fav, titulo) {
    if (!el || !fav || typeof window.abrirPopupDispositivo !== 'function') return el;
    const conIp = !!uiValorInformado(fav.cam.ip_address);
    el.classList.add('disp-etiqueta-abrible');
    el.title = `${titulo ? `${titulo} · ` : ''}${conIp ? 'Clic: opciones del equipo · Doble clic: ver sus datos' : 'Clic: opciones del equipo'}`;
    el.addEventListener('click', (e) => {
        if (uiSeleccionTextoEn(el)) return;
        window.abrirPopupDispositivo(fav.cam, el, { x: e.clientX, y: e.clientY },
            { enProduccion: true, esGrabador: fav.tipo === 'nvr' });
    });
    if (conIp && typeof window.abrirModalDispositivo === 'function') {
        el.addEventListener('dblclick', () => {
            if (typeof window.ocultarPopupProduccion === 'function') window.ocultarPopupProduccion();
            window.abrirModalDispositivo(fav.cam, 'lectura');
        });
    }
    return el;
}

/** Renueva el título `id` (sin listeners ni marcas de una consulta anterior) con `texto` y lo enlaza al popup del dispositivo
 *  `fav` (de `dispositivoPorIp` / `dispositivoDeCanal`); sin `fav` y con `alta`, al alta precargada. Devuelve el nodo nuevo. */
function uiTituloDispositivo(id, texto, fav, alta = null) {
    const viejo = document.getElementById(id);
    if (!viejo) return null;
    const el = viejo.cloneNode(false);
    for (const atributo of ['role', 'tabindex', 'title']) el.removeAttribute(atributo);
    for (const clave of Object.keys(el.dataset)) delete el.dataset[clave];
    el.classList.remove('disp-etiqueta-abrible');
    el.textContent = texto;
    viejo.replaceWith(el);
    if (fav) uiEnlazarDispositivo(el, fav, dispositivoTitulo(fav));
    else if (alta) uiEnlazarActivoStock(el, alta);
    return el;
}

const ESTADOS_FAVORITO = {
    online: 'Levantado',
    offline: 'Caído',
    sin_senal: 'Sin señal',
    desconocido: 'Sin dato'
};
const ICONOS_FAVORITO = { cam: 'bi-camera-video', nvr: 'bi-hdd-rack', eq: 'bi-pc-display' };

(function () {
    const $ = (id) => document.getElementById(id);
    let firmaPintada = null;
    let hayPintado = false;           // ya se pintó una vez (la primera no desliza)
    let reordenable = null;           // uiReordenable: con un tile en movimiento no se repinta debajo de él

    // «Solo íconos»: preferencia sincronizada (panel.favoritos_compacto); cada tile muestra la foto con el punto de estado
    const soloIconos = () => storage.get(CLAVE_FAVORITOS_COMPACTO) === '1';
    const usarCaptura = () => storage.get(CLAVE_FAVORITOS_CAPTURA) === '1';
    function pintarCasilla(id, activo) {
        const boton = $(id);
        if (!boton) return;
        boton.classList.toggle('active', activo);
        boton.setAttribute('aria-pressed', String(activo));
        const marca = boton.querySelector('.bi-check2');
        if (marca) marca.classList.toggle('d-none', !activo);
    }
    const pintarBotonSoloIconos = () => {
        pintarCasilla('favoritos-solo-iconos', soloIconos());
        pintarCasilla('favoritos-usar-captura', usarCaptura());
    };

    function leerFavoritos() {
        return favoritosValidos(storage.getJSON(CLAVE_FAVORITOS, []));
    }

    function guardarFavoritos(lista) {
        preferencias.setLista(CLAVE_FAVORITOS, lista);
    }

    function datosActuales() {
        return typeof globalData !== 'undefined' ? globalData : null;
    }

    // Foto del modelo en un cuadrado; sin foto (o si no carga), el ícono del tipo de equipo
    function construirIcono(item) {
        const caja = uiNodo('div', `favorito-icono favorito-icono-${item.tipo}`);
        const icono = () => caja.replaceChildren(uiNodo('i', `bi ${ICONOS_FAVORITO[item.tipo]}`));
        const modelo = typeof buscarImagenDispositivo === 'function' ? buscarImagenDispositivo(item.modelo) : null;
        // Con «Usar captura», las cámaras que la tienen muestran su captura; si no carga, la foto del modelo y, si tampoco, el ícono
        const captura = usarCaptura() && item.tipo === 'cam' ? uiRutaCaptura(item.cam.nvr_ip, item.cam.channel_id) : null;
        const rutas = [captura, modelo].filter(Boolean);
        if (!rutas.length) {
            icono();
            return caja;
        }
        const img = uiNodo('img', 'favorito-foto');
        img.alt = '';
        img.draggable = false;            // el navegador no arrastra la imagen: la pulsación larga mueve la ficha
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            rutas.shift();
            if (rutas.length) img.src = rutas[0]; else icono();
        });
        img.src = rutas[0];
        caja.append(img);
        return caja;
    }

    function construirTile(item, compacto) {
        const tile = uiNodo('div', `favorito-tile favorito-${item.estado}`);
        tile.dataset.favorito = item.clave;
        tile.setAttribute('role', 'button');
        tile.tabIndex = 0;
        tile.setAttribute('aria-label', `${item.nombre}: ${ESTADOS_FAVORITO[item.estado]}`);
        if (compacto) tile.dataset.etiqueta = etiquetaFavorito(item, ESTADOS_FAVORITO);     // etiqueta flotante (uiEtiquetasDeIconos)
        else tile.title = `${item.nombre}: ${ESTADOS_FAVORITO[item.estado]}. Clic para ver las opciones`;
        const estado = uiNodo('div', 'favorito-estado');
        estado.append(uiNodo('span', 'favorito-punto'), uiNodo('span', '', ESTADOS_FAVORITO[item.estado]));
        const texto = uiNodo('div', 'favorito-texto');
        texto.append(uiNodo('div', 'favorito-nombre', item.nombre), estado);
        tile.append(construirIcono(item), texto);
        return tile;
    }

    function pintarFavoritos() {
        const seccion = $('favoritos-section');
        const grilla = $('favoritos-grilla');
        if (!seccion || !grilla || (reordenable && reordenable.activo())) return;
        const items = modeloFavoritos(leerFavoritos(), datosActuales());
        const compacto = soloIconos();
        const firma = firmaFavoritos(items, compacto, usarCaptura());
        if (firma === firmaPintada) {
            seccion.classList.toggle('d-none', items.length === 0);
            return;
        }
        firmaPintada = firma;
        // Al quitar o agregar uno, las demás fichas y las secciones de abajo deslizan a su lugar (no saltan); la primera vez no
        const pintar = () => {
            seccion.classList.toggle('d-none', items.length === 0);
            grilla.classList.toggle('favoritos-compacta', compacto);
            grilla.replaceChildren(...items.map(i => construirTile(i, compacto)));
            ajustarColumnas();
        };
        if (!hayPintado || !seccion.getClientRects().length) { pintar(); hayPintado = true; return; }
        uiReubicarVecinos(seccion, pintar, {
            extra: () => [...grilla.querySelectorAll('.favorito-tile')],
            clave: (x) => (x.dataset && x.dataset.favorito ? `f:${x.dataset.favorito}` : x),
        });
    }

    // Las columnas siguen el ancho de la sección (ventana, panel lateral, zona del panel)
    function ajustarColumnas() {
        const grilla = $('favoritos-grilla');
        if (!grilla || grilla.offsetWidth === 0) return;
        const n = grilla.children.length;
        const cols = columnasFavoritos(n, grilla.offsetWidth);
        if (grilla.dataset.columnas !== String(cols)) {
            grilla.dataset.columnas = String(cols);
            grilla.style.setProperty('--favoritos-columnas', String(cols));
        }
    }

    function abrirOpciones(tile, coords) {
        const item = modeloFavoritos(leerFavoritos(), datosActuales()).find(i => i.clave === tile.dataset.favorito);
        if (!item || typeof window.abrirPopupDispositivo !== 'function') return;
        const verDatos = item.tipo === 'cam' ? null : () => {
            if (typeof window.abrirModalDispositivo === 'function') window.abrirModalDispositivo(item.cam, 'lectura');
        };
        window.abrirPopupDispositivo(item.cam, tile, coords, { enProduccion: true, esGrabador: item.tipo === 'nvr', verDatos });
    }

    function pintarEstrella(boton, activo) {
        boton.classList.toggle('popup-disp-fav-activo', activo);
        boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
        const texto = activo ? 'Quitar de favoritos' : 'Agregar a favoritos';
        boton.title = texto;
        boton.setAttribute('aria-label', texto);
        const icono = boton.querySelector('i');
        if (icono) icono.className = activo ? 'bi bi-star-fill' : 'bi bi-star';
    }

    // «Agregar a favoritos» del modo selección (Activos: solo `stockIds`; Producción: también los canales sin alta en el stock,
    // `claves` = `cam:IP:canal`); solo entran los que el sistema monitorea hoy
    window.favoritosAgregarSeleccion = function (stockIds, claves = []) {
        const datos = datosActuales();
        const deStock = favoritosDeStock(stockIds, datos);
        const propias = claves.filter(c => resolverFavorito(c, datos) !== null);
        const r = sumarFavoritos(leerFavoritos(), [...deStock.claves, ...propias]);
        if (r.agregados) {
            guardarFavoritos(r.lista);
            pintarFavoritos();
        }
        return { texto: textoSumaFavoritos(r, deStock.noMonitoreados + (claves.length - propias.length)), agregados: r.agregados };
    };

    // La estrella del popup: solo para un equipo que el sistema monitorea (está en /api/v2/datos)
    window.favoritosConfigurarBoton = function (boton, cam, esGrabador) {
        if (!boton) return;
        const fav = favoritoDeEquipo(cam, esGrabador, datosActuales());
        boton.classList.toggle('d-none', !fav);
        boton.onclick = null;
        if (!fav) return;
        pintarEstrella(boton, leerFavoritos().includes(fav.clave));
        boton.onclick = (e) => {
            e.stopPropagation();
            const r = alternarFavorito(leerFavoritos(), fav.clave);
            if (r.lleno) {
                mostrarToast(`Máximo ${MAX_FAVORITOS} favoritos: quitá alguno para agregar otro.`, 'warning');
                return;
            }
            guardarFavoritos(r.lista);
            pintarEstrella(boton, r.agregado);
            pintarFavoritos();
        };
    };

    // Reubicar: el mismo helper que los chips de Activos (comun.js: pulsación larga y arrastre, o Alt + flechas)
    const tiles = () => [...$('favoritos-grilla').querySelectorAll('.favorito-tile')];

    function guardarOrden() {
        const claves = tiles().map(t => t.dataset.favorito);
        guardarFavoritos(reordenarFavoritos(leerFavoritos(), claves));
        // la firma sigue el orden: con el nuevo ya pintado no se repinta (se perdería el foco)
        firmaPintada = firmaFavoritos(modeloFavoritos(leerFavoritos(), datosActuales()), soloIconos(), usarCaptura());
    }

    function iniciar() {
        const grilla = $('favoritos-grilla');
        if (!grilla) return;
        reordenable = uiReordenable(grilla, { selector: '.favorito-tile', clave: t => t.dataset.favorito, alGuardar: guardarOrden });
        grilla.addEventListener('click', (e) => {
            const tile = e.target instanceof Element ? e.target.closest('.favorito-tile') : null;
            if (tile) abrirOpciones(tile, { x: e.clientX, y: e.clientY });
        });
        // doble clic: directo al modal del equipo (el popup del primer clic se cierra)
        grilla.addEventListener('dblclick', (e) => {
            const tile = e.target instanceof Element ? e.target.closest('.favorito-tile') : null;
            const item = tile ? modeloFavoritos(leerFavoritos(), datosActuales()).find(i => i.clave === tile.dataset.favorito) : null;
            if (!item) return;
            if (typeof window.ocultarPopupProduccion === 'function') window.ocultarPopupProduccion();
            if (typeof window.abrirModalDispositivo === 'function') window.abrirModalDispositivo(item.cam, 'lectura');
        });
        grilla.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const tile = e.target instanceof Element ? e.target.closest('.favorito-tile') : null;
            if (!tile) return;
            e.preventDefault();
            abrirOpciones(tile, null);
        });
        const botonIconos = $('favoritos-solo-iconos');
        if (botonIconos) {
            botonIconos.addEventListener('click', () => {
                preferencias.set(CLAVE_FAVORITOS_COMPACTO, soloIconos() ? '0' : '1');
                pintarBotonSoloIconos();
                pintarFavoritos();
            });
        }
        const botonCaptura = $('favoritos-usar-captura');
        if (botonCaptura) {
            botonCaptura.addEventListener('click', () => {
                preferencias.set(CLAVE_FAVORITOS_CAPTURA, usarCaptura() ? '0' : '1');
                pintarBotonSoloIconos();
                pintarFavoritos();
            });
        }
        preferencias.alAplicar(CLAVE_FAVORITOS_CAPTURA, () => { pintarBotonSoloIconos(); pintarFavoritos(); });
        // La etiqueta flotante del modo «solo íconos» (la misma del panel lateral colapsado)
        uiEtiquetasDeIconos(grilla, '.favorito-tile', () => soloIconos());
        preferencias.alAplicar(CLAVE_FAVORITOS_COMPACTO, () => { pintarBotonSoloIconos(); pintarFavoritos(); });
        pintarBotonSoloIconos();
        // «Quitar todos» en dos pasos: el primer clic arma «Confirmar» (el menú sigue abierto: `data-ui-auto-close="outside"`)
        // y el segundo borra; a los 3 s, o al volver a abrir el menú, vuelve solo a «Quitar todos»
        const quitar = $('favoritos-quitar-todos');
        if (quitar) {
            let confirmando = false;
            const pintarQuitar = (armado) => {
                confirmando = armado;
                quitar.classList.toggle('text-danger', armado);
                quitar.lastChild.textContent = armado ? `Confirmar (${leerFavoritos().length})` : 'Quitar todos';
            };
            const volver = uiConfirmacionTemporizada(() => pintarQuitar(false));
            quitar.addEventListener('click', () => {
                if (!confirmando) {
                    pintarQuitar(true);
                    volver.armar();
                    return;
                }
                volver.cancelar();
                pintarQuitar(false);
                if (typeof UI !== 'undefined') UI.desplegable.cerrarTodos();
                guardarFavoritos([]);
                pintarFavoritos();
                mostrarToast('Se quitaron todos los favoritos.', 'info');
            });
            const abrirMenu = $('favoritos-opciones-btn');
            if (abrirMenu) abrirMenu.addEventListener('click', () => { volver.cancelar(); pintarQuitar(false); });
        }
        if (typeof ResizeObserver === 'function') new ResizeObserver(ajustarColumnas).observe(grilla);
        preferencias.alAplicar(CLAVE_FAVORITOS, pintarFavoritos);
        document.addEventListener('cctv:datos', pintarFavoritos);
        pintarFavoritos();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
