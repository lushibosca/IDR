// Ajustes en columnas independientes (las usa la pestaña Ajustes de todas las apps con el esqueleto común): los apartados
// (`.ajuste-seccion` dentro de `.ajustes-grilla`) se reparten en pilas verticales —tantas como entren a 26 rem—, así una sección
// alta no deja huecos en las vecinas (la grilla CSS sola alinea por filas y los deja). Se recalcula al cambiar el ancho y cuando
// un apartado se oculta o se muestra (`d-none`). Se carga al final.

// ==== AJUSTES COLUMNAS PURO BEGIN ====
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
// ==== AJUSTES COLUMNAS PURO END ====

document.addEventListener('DOMContentLoaded', () => {
    const grilla = document.querySelector('.ajustes-grilla');
    if (!grilla) return;
    const secciones = [...grilla.querySelectorAll('.ajuste-seccion')];
    let firmaActual = '';
    const nodo = (clase) => { const e = document.createElement('div'); e.className = clase; return e; };

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
            const col = nodo('ajustes-columna');
            for (const sec of grupo) col.appendChild(sec);
            if (idx === 0) for (const sec of ocultas) col.appendChild(sec);
            return col;
        });
        grilla.replaceChildren(...columnas);
    };

    montarColumnas(true);
    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(() => { if (grilla.clientWidth > 0) montarColumnas(); }).observe(grilla);
    }
    if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver(() => montarColumnas());
        for (const sec of secciones) mo.observe(sec, { attributes: true, attributeFilter: ['class'] });
    }
});
