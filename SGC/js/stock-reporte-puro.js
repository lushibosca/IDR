// Reporte imprimible del stock (documento HTML autónomo). Lógica pura: usa CAMPOS_LISTAR, stockNormalizarDispositivo y demás
// helpers de stock-puro.js al llamarse; se carga después de él.

// ==== STOCK REPORTE PURO BEGIN ====
function stockEscHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Porcentaje de un grupo respecto al total incluido en el reporte (un decimal si hace falta; '-' si total <= 0).
function stockPorcentajeResumen(parte, total) {
    if (!(total > 0)) return '-';
    return `${Math.round((parte / total) * 1000) / 10}%`;
}

// Reporte imprimible por grupos (documento HTML autónomo, como el del SGC: con todo dato escapado y orden local por
// columnas sin red ni innerHTML). `bloques`: [{ etiqueta, items }] ya elegidos. Si llega `columnas` (fichas
// seleccionadas en Listar), las tablas usan exactamente esas columnas en ese orden; sin ellas, las columnas clásicas.
function stockReporteHtml(bloques, { criterio, criterioTexto, fecha, busqueda = '', etiquetasTipo = new Map(),
    catalogo = null, columnas = null, mapaCamaras = null, normalizados = false,
    titulo = 'Reporte de stock CCTV', agrupar = true }) {
    const e = stockEscHtml;
    const tituloTexto = String(titulo || '').trim() || 'Reporte de stock CCTV';
    const total = bloques.reduce((acc, b) => acc + b.items.length, 0);
    const resumen = bloques.map(b => `<tr><td><strong>${e(b.etiqueta)}</strong></td><td class="num">${b.items.length}</td>`
        + `<td class="num">${stockPorcentajeResumen(b.items.length, total)}</td></tr>`).join('');
    const colsElegidas = Array.isArray(columnas)
        ? columnas.map(id => CAMPOS_LISTAR.find(col => col.id === id)).filter(Boolean)
        : [];
    const fila = colsElegidas.length > 0
        ? (d) => {
            const norm = normalizados ? d : stockNormalizarDispositivo(d, stockCamaraDeDispositivo(d, mapaCamaras), etiquetasTipo, catalogo);
            return `<tr>${colsElegidas.map((col, idx) => {
                const txt = e(norm[col.id] || STOCK_ND);
                return idx === 0 ? `<td><strong>${txt}</strong></td>` : `<td>${txt}</td>`;
            }).join('')}</tr>`;
        }
        : (d) => {
            const i = d.instalacion || {};
            const estado = d.en_uso ? (i.descripcion || 'En producción') : (STOCK_ESTADOS.get(stockEstadoEfectivo(d)) || d.condicion);
            return `<tr><td><strong>${e(stockMacTexto(d.mac) || STOCK_ND)}</strong></td><td>${e(i.ip || STOCK_ND)}</td>`
                + `<td>${e(d.modelo || STOCK_ND)}</td><td>${e(d.serie || STOCK_ND)}</td>`
                + `<td>${e(stockGrupoTexto(d, catalogo) || STOCK_ND)}</td><td>${e(stockTipoTexto(d, etiquetasTipo))}</td>`
                + `<td>${e(d.patrimonio || 'Sin patrimonio')}</td>`
                + `<td>${e(estado)}</td><td>${e(stockUbicacionTexto(i))}</td></tr>`;
        };
    const cab = colsElegidas.length > 0
        ? `<tr>${colsElegidas.map(col => `<th data-col="${e(col.id)}" tabindex="0" role="button" aria-sort="none">${e(col.etiqueta)}</th>`).join('')}</tr>`
        : '<tr><th data-col="mac" tabindex="0" role="button" aria-sort="none">MAC</th>'
            + '<th data-col="ip" tabindex="0" role="button" aria-sort="none">IP</th>'
            + '<th data-col="modelo" tabindex="0" role="button" aria-sort="none">Modelo</th>'
            + '<th data-col="serial" tabindex="0" role="button" aria-sort="none">Serie</th>'
            + '<th data-col="grupo" tabindex="0" role="button" aria-sort="none">Grupo</th>'
            + '<th data-col="tipo" tabindex="0" role="button" aria-sort="none">Tipo</th>'
            + '<th data-col="patrimonio" tabindex="0" role="button" aria-sort="none">Patrimonio</th>'
            + '<th data-col="estado" tabindex="0" role="button" aria-sort="none">Estado / Descripción</th>'
            + '<th data-col="ubicacion" tabindex="0" role="button" aria-sort="none">Ubicación</th></tr>';
    const subGrupos = (b) => (normalizados ? [{ titulo: '', items: b.items }]
        : stockSubsecciones(b.items, criterio, etiquetasTipo, catalogo));
    const tabla = (items) => `<table><thead>${cab}</thead><tbody>${items.map(fila).join('')}</tbody></table>`;
    const secciones = agrupar
        ? bloques.flatMap(b => subGrupos(b).map(sub =>
            `<section><h2>${e(sub.titulo ? `${b.etiqueta} — ${sub.titulo}` : b.etiqueta)} (${sub.items.length})</h2>`
            + `${tabla(sub.items)}</section>`)).join('\n')
        : (() => {
            const todos = bloques.flatMap(b => b.items || []);
            return `<section><h2>Dispositivos (${todos.length})</h2>${tabla(todos)}</section>`;
        })();
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(tituloTexto)} — ${e(fecha)}</title>
<style>
  :root { --azul: #1a73e8; --borde: #e2e6ef; --tenue: #5a6070; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f6fa; color: #1a1d23; padding: 2rem 1.5rem; }
  .reporte { max-width: 1280px; margin: 0 auto; }
  header { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid var(--azul); display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; }
  header h1 { font-size: 1.3rem; color: var(--azul); }
  header .meta { font-size: .8rem; color: var(--tenue); text-align: right; line-height: 1.5; }
  section { background: #fff; border-radius: 10px; padding: 1.25rem; margin-bottom: 1.5rem; border: 1px solid var(--borde); }
  h2 { font-size: .95rem; color: var(--azul); margin-bottom: .75rem; padding-bottom: .4rem; border-bottom: 1px solid var(--borde); }
  table { width: 100%; border-collapse: collapse; font-size: .7rem; table-layout: fixed; }
  th { text-align: left; color: var(--tenue); padding: .25rem; border-bottom: 1px solid var(--borde); background: #f0f2f8; text-transform: uppercase; }
  th[data-col] { cursor: pointer; user-select: none; }
  th[data-col]:hover { color: var(--azul); }
  th[aria-sort="ascending"]::after { content: ' ▲'; color: var(--azul); font-size: .65rem; }
  th[aria-sort="descending"]::after { content: ' ▼'; color: var(--azul); font-size: .65rem; }
  td { padding: .25rem; border-bottom: 1px solid var(--borde); word-break: break-word; }
  table.resumen { table-layout: auto; }
  table.resumen .num { width: 1%; white-space: nowrap; text-align: right; padding-left: 1.5rem; font-variant-numeric: tabular-nums; }
  @media print { body { background: #fff; padding: 0; } section { page-break-inside: avoid; } th[data-col]::after { display: none; } }
</style>
</head>
<body>
<div class="reporte">
  <header>
    <h1>${e(tituloTexto)}</h1>
    <div class="meta">Exportado el ${e(fecha)}<br>Agrupado por: ${e(criterioTexto)}${busqueda ? `<br>Búsqueda: ${e(busqueda)}` : ''}</div>
  </header>
  <section><h2>Resumen</h2><table class="resumen"><thead><tr><th data-col="grupo" tabindex="0" role="button" aria-sort="none">Grupo</th><th class="num" data-col="cantidad" tabindex="0" role="button" aria-sort="none">Cantidad</th><th class="num" data-col="participacion" tabindex="0" role="button" aria-sort="none">Participación</th></tr></thead><tbody>${resumen}</tbody>
  <tfoot><tr><td><strong>TOTAL DE DISPOSITIVOS</strong></td><td class="num"><strong>${total}</strong></td><td class="num"><strong>${total > 0 ? '100%' : '-'}</strong></td></tr></tfoot></table></section>
${secciones}
</div>
<script>
  (function () {
    function pesoPiso(v) {
      var s = String(v || '').trim().toUpperCase();
      if (!s || s === '-') return 1e9;
      if (s === 'PB' || s === '0') return 0;
      var mSs = s.match(/^(\\d+)\\s*SS$/);
      if (mSs) return -parseInt(mSs[1], 10);
      var mEp = s.match(/^EP\\s*(\\d*)$/);
      if (mEp) return 0.5 + (mEp[1] ? parseInt(mEp[1], 10) * 0.01 : 0);
      var mN = s.match(/^(\\d+)\\s*P?$/);
      if (mN) return parseInt(mN[1], 10);
      return 1e8;
    }
    function cmp(a, b, col) {
      if (col === 'piso') {
        var pa = pesoPiso(a), pb = pesoPiso(b);
        if (pa !== pb) return pa - pb;
      }
      var rxIp = /^\\d{1,3}(?:\\.\\d{1,3}){3}$/;
      if (rxIp.test(a) && rxIp.test(b)) {
        var oa = a.split('.'), ob = b.split('.');
        for (var i = 0; i < 4; i++) {
          var diff = Number(oa[i]) - Number(ob[i]);
          if (diff) return diff;
        }
        return 0;
      }
      var rxNum = /^-?\\d+(?:\\.\\d+)?%?$/;
      if (rxNum.test(a) && rxNum.test(b)) return parseFloat(a) - parseFloat(b);
      return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
    }
    function ordenarUnaTabla(tabla, col, dir) {
      var tbody = tabla && tabla.tBodies && tabla.tBodies[0];
      var tHead = tabla && tabla.tHead && tabla.tHead.rows && tabla.tHead.rows[0];
      if (!tbody || !tHead) return;
      var ths = Array.prototype.slice.call(tHead.children);
      var idx = -1;
      for (var i = 0; i < ths.length; i++) {
        if (ths[i].getAttribute('data-col') === col) idx = i;
      }
      if (idx < 0) return;
      ths.forEach(function (el) {
        el.setAttribute('aria-sort', el.getAttribute('data-col') === col ? dir : 'none');
      });
      var signo = dir === 'descending' ? -1 : 1;
      var filas = Array.prototype.slice.call(tbody.rows);
      filas.sort(function (ra, rb) {
        var va = (ra.cells[idx] ? ra.cells[idx].textContent : '').trim();
        var vb = (rb.cells[idx] ? rb.cells[idx].textContent : '').trim();
        var ea = !va || va === '-', eb = !vb || vb === '-';
        if (ea !== eb) return ea ? 1 : -1;
        return signo * cmp(va, vb, col);
      });
      filas.forEach(function (r) { tbody.appendChild(r); });
    }
    function ordenarDesde(th) {
      var tabla = th.closest('table');
      var col = th.getAttribute('data-col') || '';
      if (!tabla || !col) return;
      var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      var esResumen = tabla.classList && tabla.classList.contains('resumen');
      if (esResumen) {
        ordenarUnaTabla(tabla, col, dir);
        return;
      }
      var tablas = document.querySelectorAll ? document.querySelectorAll('table:not(.resumen)') : [tabla];
      Array.prototype.forEach.call(tablas, function (t) { ordenarUnaTabla(t, col, dir); });
    }
    document.addEventListener('click', function (ev) {
      var th = ev.target && ev.target.closest ? ev.target.closest('th[data-col]') : null;
      if (th) ordenarDesde(th);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var th = ev.target && ev.target.closest ? ev.target.closest('th[data-col]') : null;
      if (!th) return;
      ev.preventDefault();
      ordenarDesde(th);
    });
  })();
</script>
</body>
</html>
`;
}
// ==== STOCK REPORTE PURO END ====
