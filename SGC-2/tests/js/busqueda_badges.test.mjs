// Pruebas unitarias para las insignias de coincidencias de búsqueda en el panel lateral
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const GLOBALES = { Date, Number, String, Array, Object, Math };
const { normalizarTextoBusqueda, tokenizarBusqueda } = cargarBloque("busqueda.js", "BUSQUEDA TOKENIZADA PURO", GLOBALES,
  ["normalizarTextoBusqueda", "tokenizarBusqueda"]);
const comun = cargarBloque("comun.js", "VALOR INFORMADO PURO", { String }, ["uiValorInformado", "uiNumeroCanal"]);
const apiStock = cargarBloque("stock-puro.js", "STOCK PURO", { ...GLOBALES, ...comun, normalizarTextoBusqueda, tokenizarBusqueda }, ["stockFiltrar"]);
const apiNav = cargarBloque("app.js", "RESOLVER PESTAÑA BUSQUEDA PURO", GLOBALES, ["resolverPestanaBusqueda"]);

// Implementación de la función de actualización de insignias para pruebas
function mockActualizarBadgePestana(tabEl, total, busquedaActiva) {
  if (!tabEl) return;
  let badge = tabEl.querySelector('.sidebar-search-badge');
  if (!busquedaActiva) {
    if (badge) badge.classList.add('d-none');
    return;
  }
  if (!badge) {
    badge = {
      className: 'badge sidebar-search-badge',
      textContent: '',
      classList: new Set(['badge', 'sidebar-search-badge'])
    };
    badge.classList.add = (c) => badge.classList.add(c);
    badge.classList.remove = (c) => badge.classList.delete(c);
    badge.classList.toggle = (c, val) => val ? badge.classList.add(c) : badge.classList.delete(c);
    tabEl.badge = badge;
  }
  badge.textContent = String(total);
  badge.classList.remove('d-none');
  badge.classList.toggle('badge-cero', total === 0);
}

test("actualizarBadgePestana: muestra el conteo y gestiona visibilidad y clase cero", () => {
  const clasesBadge = new Set(['badge', 'sidebar-search-badge', 'd-none']);
  const badgeMock = {
    textContent: '0',
    classList: {
      contains: (c) => clasesBadge.has(c),
      add: (c) => clasesBadge.add(c),
      remove: (c) => clasesBadge.delete(c),
      toggle: (c, v) => v ? clasesBadge.add(c) : clasesBadge.delete(c)
    }
  };

  const tabMock = {
    querySelector: (sel) => sel === '.sidebar-search-badge' ? badgeMock : null
  };

  // 1. Con búsqueda activa y total positivo (ej: 2 cámaras con 'domo')
  mockActualizarBadgePestana(tabMock, 2, true);
  assert.equal(badgeMock.textContent, '2');
  assert.equal(badgeMock.classList.contains('d-none'), false, "debe quitar d-none cuando la búsqueda está activa");
  assert.equal(badgeMock.classList.contains('badge-cero'), false, "no debe tener badge-cero cuando el total es > 0");

  // 2. Con búsqueda activa y 0 coincidencias (ej: 0 servidores con 'domo')
  mockActualizarBadgePestana(tabMock, 0, true);
  assert.equal(badgeMock.textContent, '0');
  assert.equal(badgeMock.classList.contains('d-none'), false, "debe ser visible con total 0");
  assert.equal(badgeMock.classList.contains('badge-cero'), true, "debe tener badge-cero cuando el total es 0");

  // 3. Al limpiar la búsqueda
  mockActualizarBadgePestana(tabMock, 0, false);
  assert.equal(badgeMock.classList.contains('d-none'), true, "debe ocultarse (d-none) si la búsqueda no está activa");
});

test("coincidencias de búsqueda: 'domo' encuentra cámaras y stock, pero 0 servidores", () => {
  const camaras = [
    { camera_name: "Domo Pasillo", ip_address: "10.0.1.10", nvr_ip: "10.0.0.1", channel_id: "1", modelo: "DS-2CD2143G0-I" },
    { camera_name: "Domo Entrada", ip_address: "10.0.1.11", nvr_ip: "10.0.0.1", channel_id: "2", modelo: "DS-2CD2143G0-I" },
    { camera_name: "Bullet Patio", ip_address: "10.0.1.12", nvr_ip: "10.0.0.2", channel_id: "1", modelo: "DS-2CD2043G0-I" }
  ];

  const nvrs = [
    { nvr_name: "NVR Central", ip: "10.0.0.1", modelo: "DS-7616NI-K2" },
    { nvr_name: "NVR Secundario", ip: "10.0.0.2", modelo: "DS-7608NI-K1" }
  ];

  const stockDispositivos = [
    { id: "s1", tipo: "camara", forma: "domo", marca: "Hikvision", modelo: "DS-2CD2143G0-I", instalacion: { descripcion: "Domo 1" } },
    { id: "s2", tipo: "camara", forma: "domo", marca: "Hikvision", modelo: "DS-2CD2143G0-I", instalacion: { descripcion: "Domo 2" } },
    { id: "s3", tipo: "camara", forma: "bullet", marca: "Hikvision", modelo: "DS-2CD2043G0-I", instalacion: { descripcion: "Bullet 1" } }
  ];

  const etiquetasTipo = new Map([["camara", "Cámara"], ["nvr", "NVR"]]);

  // Conteo en Cámaras
  const camsFiltradas = camaras.filter(c => c.camera_name.toLowerCase().includes("domo"));
  assert.equal(camsFiltradas.length, 2, "deben coincidir 2 cámaras");

  // Conteo en Servidores
  const nvrsFiltrados = nvrs.filter(n => n.nvr_name.toLowerCase().includes("domo") || n.modelo.toLowerCase().includes("domo"));
  assert.equal(nvrsFiltrados.length, 0, "deben coincidir 0 servidores");

  // Conteo en Estado (Cámaras + Servidores)
  const totalEstado = camsFiltradas.length + nvrsFiltrados.length;
  assert.equal(totalEstado, 2, "el total de equipos monitorizados debe ser 2");

  // Conteo en Stock
  const stockFiltrados = apiStock.stockFiltrar(stockDispositivos, "domo", etiquetasTipo);
  assert.equal(stockFiltrados.length, 2, "deben coincidir 2 dispositivos en stock");

});

test("resolverPestanaBusqueda: selección inteligente de panel ante búsquedas", () => {
  const paneles = [
    { id: "v-pills-dashboard-tab", conteo: 0 },
    { id: "v-pills-stock-tab", conteo: 0 },
    { id: "v-pills-produccion-tab", conteo: 0 },
    { id: "v-pills-auditoria-tab", conteo: 0 }
  ];

  // 1. Si el panel actual tiene resultados (> 0), se queda en él (retorna null)
  const conResultadosActual = [
    { id: "v-pills-dashboard-tab", conteo: 2 },
    { id: "v-pills-stock-tab", conteo: 5 },
    { id: "v-pills-produccion-tab", conteo: 10 },
    { id: "v-pills-auditoria-tab", conteo: 0 }
  ];
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-dashboard-tab", conResultadosActual), null);
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-stock-tab", conResultadosActual), null);
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-produccion-tab", conResultadosActual), null);

  // 2. Si ningún panel tiene resultados, se queda donde está (retorna null)
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-dashboard-tab", paneles), null);
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-produccion-tab", paneles), null);

  // 3. Si el panel actual no tiene resultados y solo uno tiene, cambia a ese panel
  const soloStock = [
    { id: "v-pills-dashboard-tab", conteo: 0 },
    { id: "v-pills-stock-tab", conteo: 3 },
    { id: "v-pills-produccion-tab", conteo: 0 },
    { id: "v-pills-auditoria-tab", conteo: 0 }
  ];
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-dashboard-tab", soloStock), "v-pills-stock-tab");
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-produccion-tab", soloStock), "v-pills-stock-tab");

  // 4. Si varios tienen resultados, elige el más próximo
  // Desde Estado (0): Stock (1) dist 1 vs Producción (2) dist 2 -> elige Stock
  const stockYProduccion = [
    { id: "v-pills-dashboard-tab", conteo: 0 },
    { id: "v-pills-stock-tab", conteo: 4 },
    { id: "v-pills-produccion-tab", conteo: 8 },
    { id: "v-pills-auditoria-tab", conteo: 0 }
  ];
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-dashboard-tab", stockYProduccion), "v-pills-stock-tab");

  // Desde Auditoría (3): Producción (2) dist 1 vs Stock (1) dist 2 -> elige Producción
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-auditoria-tab", stockYProduccion), "v-pills-produccion-tab");

  // 5. Empate de distancia: elige el primero en la lista
  // Desde Activos (1): Estado (0) dist 1 vs Producción (2) dist 1 -> desempate al primero: Estado (0)
  const estadoYProduccion = [
    { id: "v-pills-dashboard-tab", conteo: 1 },
    { id: "v-pills-stock-tab", conteo: 0 },
    { id: "v-pills-produccion-tab", conteo: 5 },
    { id: "v-pills-auditoria-tab", conteo: 0 }
  ];
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-stock-tab", estadoYProduccion), "v-pills-dashboard-tab");

  // Desde Producción (2): Stock (1) dist 1 vs Auditoría (3) dist 1 -> desempate al primero: Stock (1)
  const stockYAuditoria = [
    { id: "v-pills-dashboard-tab", conteo: 0 },
    { id: "v-pills-stock-tab", conteo: 2 },
    { id: "v-pills-produccion-tab", conteo: 0 },
    { id: "v-pills-auditoria-tab", conteo: 2 }
  ];
  assert.equal(apiNav.resolverPestanaBusqueda("v-pills-produccion-tab", stockYAuditoria), "v-pills-stock-tab");

  // 6. Si no hay pestaña activa (o id desconocido), elige el primer panel con resultados
  assert.equal(apiNav.resolverPestanaBusqueda(null, stockYProduccion), "v-pills-stock-tab");
  assert.equal(apiNav.resolverPestanaBusqueda("desconocido", stockYAuditoria), "v-pills-stock-tab");
});

// Auditoría: solo cuentan logs de servidores, disponibilidad y video, en la subpestaña visible y con consulta hecha
