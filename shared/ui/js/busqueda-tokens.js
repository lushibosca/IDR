// Sintaxis de búsqueda de la suite (la de SGC, para el buscador global de todas las apps): palabras sueltas (todas tienen que
// estar: Y), "frase exacta" entre comillas (o (entre paréntesis), que además pide palabra completa), exclusión con ! o - delante
// de una palabra o frase (`domo !ptz`, `domo -ptz`, `domo ! ptz`, `camara -"piso 3"`). No distingue mayúsculas ni tildes.
// Cada app decide DÓNDE busca (qué campos); esto solo parte el texto y aplica la regla de inclusión/exclusión.

// ==== BUSQUEDA TOKENS PURO BEGIN ====
/** Minúsculas, sin tildes y con los espacios colapsados. */
function idrNormalizarBusqueda(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Partes de lo escrito: [{ texto (normalizado), esExacto (entre comillas o paréntesis), excluir (con ! o - delante) }]. */
function idrTokensBusqueda(consulta) {
    if (!consulta || typeof consulta !== 'string') return [];
    const limpia = consulta.replace(/(^|\s)([!-])\s+(?=\S)/g, '$1$2');            // «! ptz» y «- ptz» valen como «!ptz» y «-ptz»
    const crudos = limpia.match(/[!-]?"[^"]+"|[!-]?\([^)]+\)|[!-]\S+|\S+/g) || [];
    const tokens = [];
    for (const crudo of crudos) {
        let t = crudo;
        const excluir = /^[!-]/.test(t) && t.length > 1;
        if (excluir) t = t.slice(1);
        const esExacto = (t.startsWith('"') && t.endsWith('"') && t.length > 1) || (t.startsWith('(') && t.endsWith(')') && t.length > 1);
        if (esExacto) t = t.slice(1, -1);
        const texto = idrNormalizarBusqueda(t);
        if (texto) tokens.push({ texto, esExacto, excluir });
    }
    return tokens;
}

/** ¿Cumple lo escrito? `coincide(token)` dice si el token está en lo que se mira; hacen falta todos los de inclusión y ninguno de
 *  exclusión. Sin tokens (o solo exclusiones y nada excluido) cumple. */
function idrCumpleTokens(tokens, coincide) {
    return tokens.every((t) => (t.excluir ? !coincide(t) : coincide(t)));
}

/** ¿`texto` (ya normalizado) contiene el token? Con comillas o paréntesis pide palabra completa (no «ptz» dentro de «aptzx»). */
function idrTextoContiene(texto, token) {
    if (!token.esExacto) return texto.includes(token.texto);
    let desde = 0;
    const largo = token.texto.length;
    for (;;) {
        const i = texto.indexOf(token.texto, desde);
        if (i < 0) return false;
        const antes = i === 0 ? '' : texto[i - 1], despues = texto[i + largo] ?? '';
        if (!/[\p{L}\p{N}]/u.test(antes) && !/[\p{L}\p{N}]/u.test(despues)) return true;
        desde = i + 1;
    }
}
// ==== BUSQUEDA TOKENS PURO END ====
