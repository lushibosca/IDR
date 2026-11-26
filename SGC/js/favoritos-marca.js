// Estrella distintiva en la imagen/miniatura de dispositivos que están en Favoritos (Activos y Producción).
// Se carga DESPUÉS de favoritos.js (usa CLAVE_FAVORITOS, favoritosValidos, modeloFavoritos y claveFavorito).

// ==== FAVORITOS MARCA PURO BEGIN ====
/** Ids del stock cuyos dispositivos monitoreados están hoy en `claves` de favoritos (cámara, grabador o equipo de red). */
function favoritosStockIds(claves, datos) {
    const ids = new Set();
    for (const item of modeloFavoritos(claves, datos)) {
        const id = item.cam && item.cam.stock && item.cam.stock.id;
        if (id) ids.add(id);
    }
    return ids;
}
// ==== FAVORITOS MARCA PURO END ====

/** Agrega o quita la estrella distintiva de favorito en la esquina superior izquierda de una miniatura o imagen del modelo. */
function uiAplicarMarcaFavorito(contenedor, activo) {
    if (!contenedor) return;
    const actual = contenedor.querySelector(':scope > .disp-fav-marca');
    if (activo) {
        if (actual) return;
        const marca = uiNodo('span', 'disp-fav-marca');
        marca.title = 'En favoritos';
        marca.setAttribute('aria-label', 'En favoritos');
        const icono = uiNodo('i', 'bi bi-star-fill');
        icono.setAttribute('aria-hidden', 'true');
        marca.appendChild(icono);
        contenedor.appendChild(marca);
    } else if (actual) {
        actual.remove();
    }
}

(() => {
    const claves = () => favoritosValidos(storage.getJSON(CLAVE_FAVORITOS, []));
    const datos = () => (typeof globalData !== 'undefined' ? globalData : null);
    const stockActivos = () => favoritosStockIds(claves(), datos());
    const clavesActivas = () => new Set(claves());

    function esFavoritoProduccion(tipo, stockId, nvrIp, canalId, favs = { stock: stockActivos(), claves: clavesActivas() }) {
        if (tipo === 'otro') return Boolean(stockId && favs.stock.has(stockId));
        if (tipo === 'camara') {
            const c = claveFavorito('cam', nvrIp, canalId);
            return Boolean(c && favs.claves.has(c));
        }
        return false;
    }

    function sincronizarStock() {
        const acordeon = document.getElementById('stock-accordion');
        if (!acordeon) return;
        const favs = stockActivos();
        for (const el of acordeon.querySelectorAll('[data-stock-id]')) {
            const thumb = el.querySelector('.stock-card-thumb, .stock-lista-thumb');
            if (thumb) uiAplicarMarcaFavorito(thumb, favs.has(el.dataset.stockId));
        }
    }

    function sincronizarProduccion() {
        const accordion = document.getElementById('produccion-accordion');
        if (!accordion) return;
        const favs = { stock: stockActivos(), claves: clavesActivas() };
        for (const el of accordion.querySelectorAll('.canal-item')) {
            const esOtro = Boolean(el.dataset.stockId && !el.dataset.nvrIp);
            const esCam = Boolean(el.dataset.nvrIp && el.dataset.channelId);
            const tipo = esOtro ? 'otro' : (esCam ? 'camara' : 'libre');
            const activo = esFavoritoProduccion(tipo, el.dataset.stockId, el.dataset.nvrIp, el.dataset.channelId, favs);
            const thumb = el.querySelector('.canal-item-thumb');
            if (thumb) uiAplicarMarcaFavorito(thumb, activo);
            const captura = el.querySelector('.canal-item-captura');
            if (captura) uiAplicarMarcaFavorito(captura, activo);
        }
    }

    const sincronizarTodo = () => { sincronizarStock(); sincronizarProduccion(); };
    document.addEventListener('cctv:favoritos', sincronizarTodo);
    document.addEventListener('cctv:datos', sincronizarTodo);

    Object.assign(window, { favoritosStockActivos: stockActivos, esFavoritoProduccion });
})();
