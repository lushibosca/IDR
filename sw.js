const CACHE_NAME = 'idr-suite-v261112.0109';
const RUNTIME_CACHE = 'idr-runtime-261105.0300';

const PRECACHE_URLS = [
  // ── Launcher (Portada) ──
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './img/cco_light.jpeg',
  './img/cco_dark.jpeg',

  // ── SGC (CCTV estático; las fotos de modelos se guardan al verlas) ──
  './SGC/',
  './SGC/index.html',
  './SGC/css/app/activos.css',
  './SGC/css/app/ajustes.css',
  './SGC/css/app/animaciones.css',
  './SGC/css/app/auditoria.css',
  './SGC/css/app/barra-movil.css',
  './SGC/css/app/estado.css',
  './SGC/css/app/detalle-movil.css',
  './SGC/css/app/estructura.css',
  './SGC/css/app/favoritos.css',
  './SGC/css/app/interaccion.css',
  './SGC/css/app/produccion.css',
  './SGC/favicon.svg',
  './SGC/icon.svg',
  './SGC/icons/icon-192.png',
  './SGC/icons/icon-512.png',
  './SGC/icons/icon-1024.png',
  './SGC/manifest.json',
  './SGC/js/ajustes.js',
  './SGC/js/animaciones.js',
  './SGC/js/api-local.js',
  './SGC/js/historial-puro.js',
  './SGC/js/historial.js',
  './SGC/js/app.js',
  './SGC/js/atajos.js',
  './SGC/js/auditoria-bd.js',
  './SGC/js/busqueda.js',
  './SGC/js/comun.js',
  './SGC/js/consultas.js',
  './SGC/js/datos-puro.js',
  './SGC/js/doble-toque.js',
  './SGC/js/datos-ui.js',
  './SGC/js/favoritos.js',
  './SGC/js/gist.js',
  './SGC/js/historial-modal.js',
  './SGC/js/imagen-ampliada.js',
  './SGC/js/migrar-sgc.js',
  './SGC/js/parseador.js',
  './SGC/js/preload.js',
  './SGC/js/privacidad.js',
  './SGC/js/produccion-asignar.js',
  './SGC/js/produccion-seleccion.js',
  './SGC/js/produccion.js',
  './SGC/js/resumen.js',
  './SGC/js/selector.js',
  './SGC/js/sesion-local.js',
  './SGC/js/stock-alta-lote.js',
  './SGC/js/stock-catalogos.js',
  './SGC/js/stock-listar.js',
  './SGC/js/stock-puro.js',
  './SGC/js/stock-seleccion.js',
  './SGC/js/stock.js',

  // ── SGI (Materiales) ──
  './SGI/',
  './SGI/index.html',
  './SGI/manifest.json',
  './SGI/css/sgi.css',
  './SGI/app.js',
  './SGI/atajos.js',
  './SGI/icon.svg',
  './SGI/icons/icon-192.png',
  './SGI/icons/icon-512.png',
  './SGI/icons/icon-1024.png',

  // ── SGL (Licencias) ──
  './SGL/',
  './SGL/index.html',
  './SGL/flash.js',
  './SGL/manifest.json',
  './SGL/styles.css',
  './SGL/app.js',
  './SGL/icon.svg',
  './SGL/icons/icon-192.png',
  './SGL/icons/icon-512.png',
  './SGL/icons/icon-1024.png',

  // ── SGR (Racks) ──
  './SGR/',
  './SGR/index.html',
  './SGR/manifest.json',
  './SGR/css/sgr.css',
  './SGR/app.js',
  './SGR/atajos.js',
  './SGR/icon.svg',
  './SGR/icons/icon-192.png',
  './SGR/icons/icon-512.png',
  './SGR/icons/icon-1024.png',

  // ── SGP (Patcheras) ──
  './SGP/',
  './SGP/index.html',
  './SGP/manifest.json',
  './SGP/css/sgp.css',
  './SGP/atajos.js',
  './SGP/parser_planilla.js',
  './SGP/app.js',
  './SGP/icon.svg',
  './SGP/icons/icon-192.png',
  './SGP/icons/icon-512.png',
  './SGP/icons/icon-1024.png',

  // ── Recursos Compartidos Suite ──
  './shared/idr-actualizacion.css',
  './shared/idr-actualizacion.js',
  './shared/idr-atras.js',
  './shared/idr-infra.js',
  './shared/idr-tema.js',
  './shared/idr-version.js',
  // base de estilo común (porte del estilo de SGC: docs/PORTE-ESTILO-SGC.md)
  './shared/ui/base.css',
  './shared/ui/esqueleto.css',
  './shared/ui/panel.css',
  './shared/ui/ayuda.css',
  './shared/ui/fondo.css',
  './shared/ui/legado/variables.css',
  './shared/ui/legado/comunes.css',
  './shared/ui/grilla.css',
  './shared/ui/tokens.css',
  './shared/ui/utilidades.css',
  './shared/ui/js/apariencia.js',
  './shared/ui/js/ajustes-columnas.js',
  './shared/ui/js/ayuda.js',
  './shared/ui/js/fondo.js',
  './shared/ui/js/navegacion.js',
  './shared/ui/js/busqueda-tokens.js',
  './shared/ui/js/gestos.js',
  './shared/ui/js/instalar.js',
  './shared/ui/js/panel.js',
  './shared/ui/js/panel-mover.js',
  './shared/ui/js/panel-etiquetas.js',
  './shared/ui/js/toast.js',
  './shared/ui/js/transicion-pestanas.js',
  './shared/ui/js/volver-arriba.js',
  './shared/ui/js/arranque.js',
  './shared/ui/js/atras-modales.js',
  './shared/ui/js/busqueda-movil.js',
  './shared/ui/js/mm.js',
  './shared/ui/js/swipe-pestanas.js',
  './shared/ui/js/ui.js',
  './shared/ui/componentes/acordeon.css',
  './shared/ui/componentes/alertas.css',
  './shared/ui/componentes/botones.css',
  './shared/ui/componentes/desplegables.css',
  './shared/ui/componentes/formularios.css',
  './shared/ui/componentes/insignias.css',
  './shared/ui/componentes/listas.css',
  './shared/ui/componentes/modal.css',
  './shared/ui/componentes/navegacion.css',
  './shared/ui/componentes/progreso.css',
  './shared/ui/componentes/spinner.css',
  './shared/ui/componentes/tablas.css',
  './shared/ui/componentes/tarjetas.css',
  './shared/ui/componentes/toast.css',
  './shared/ui/componentes/transiciones.css',
  './shared/vendor/bootstrap-icons/bootstrap-icons.min.css',
  './shared/vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
  './shared/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './shared/vendor/fonts/inter-latin-ext.woff2',
  './shared/vendor/fonts/inter-latin.woff2',
  './shared/vendor/fonts/inter.css'
];

// Avisa a las páginas abiertas cómo va la descarga de la versión nueva (shared/idr-actualizacion.js muestra el toast con la barra)
function avisarAClientes(mensaje) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clientes => clientes.forEach(c => c.postMessage(mensaje)))
    .catch(() => { });
}

// Instalación: descarga todos los archivos en paralelo (sin usar la caché HTTP) e informa el avance. Es todo o nada: si falla
// uno, la instalación falla y se conserva la versión anterior (el test de la suite vigila que todo lo listado exista).
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const total = PRECACHE_URLS.length;
    let descargados = 0;
    let ultimoAviso = -1;
    const informar = () => {
      const porcentaje = Math.floor((descargados / total) * 100);
      if (porcentaje === ultimoAviso) return;
      ultimoAviso = porcentaje;
      avisarAClientes({ tipo: 'sw-progreso', progreso: porcentaje, version: CACHE_NAME });
    };
    try {
      informar();
      await Promise.all(PRECACHE_URLS.map(async url => {
        const respuesta = await fetch(new Request(url, { cache: 'reload' }));
        if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
        await cache.put(url, respuesta);
        descargados++;
        informar();
      }));
    } catch (err) {
      console.error('[IDR-SW] Falló la descarga de la versión nueva:', err);
      await avisarAClientes({ tipo: 'sw-error', version: CACHE_NAME });
      throw err;
    }
    await self.skipWaiting();
  })());
});

// Activación
self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, RUNTIME_CACHE];
  // Solo se limpian cachés de esta suite. El origen de GitHub Pages se comparte con otras apps (Horarios, Servicios):
  // borrar todo lo que no sea de IDR les rompe el modo sin conexión en cada actualización de la suite.
  // La lista incluye los nombres que usaron los Service Workers por app antes de unificarse en este.
  const PREFIJOS_PROPIOS = ['idr-', 'IDR-', 'SGR-', 'SGI-', 'licencias-', 'CCTVS-'];
  const esDeLaSuite = nombre => PREFIJOS_PROPIOS.some(prefijo => nombre.startsWith(prefijo));

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (esDeLaSuite(cacheName) && !allowedCaches.includes(cacheName)) {
            console.log('[IDR-SW] Eliminando caché obsoleta:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First con guardado dinámico y fallback de navegación offline
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            const pathname = url.pathname;
            if (pathname.includes('/SGC')) {
              return caches.match('./SGC/index.html');
            }
            if (pathname.includes('/SGI')) {
              return caches.match('./SGI/index.html');
            }
            if (pathname.includes('/SGL')) {
              return caches.match('./SGL/index.html');
            }
            if (pathname.includes('/SGP')) {
              return caches.match('./SGP/index.html');
            }
            if (pathname.includes('/SGR')) {
              return caches.match('./SGR/index.html');
            }
            return caches.match('./index.html') || caches.match('./');
          }

          const esImagen = /\.(png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname);
          if (esImagen) {
            return new Response('', { status: 404, statusText: 'Offline - Image not found' });
          }
        });
    })
  );
});
