const CACHE_NAME = 'idr-suite-261110.2332';
const RUNTIME_CACHE = 'idr-runtime-261105.0300';

const PRECACHE_URLS = [
  // ── Launcher (Portada) ──
  './',
  './index.html',
  './flash.js',
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
  './SGC/css/app/atajos.css',
  './SGC/css/app/auditoria.css',
  './SGC/css/app/barra-movil.css',
  './SGC/css/app/estado.css',
  './SGC/css/app/estructura.css',
  './SGC/css/app/favoritos.css',
  './SGC/css/app/interaccion.css',
  './SGC/css/app/produccion.css',
  './SGC/css/app/tema.css',
  './SGC/css/base.css',
  './SGC/css/componentes/acordeon.css',
  './SGC/css/componentes/alertas.css',
  './SGC/css/componentes/botones.css',
  './SGC/css/componentes/desplegables.css',
  './SGC/css/componentes/formularios.css',
  './SGC/css/componentes/insignias.css',
  './SGC/css/componentes/listas.css',
  './SGC/css/componentes/modal.css',
  './SGC/css/componentes/navegacion.css',
  './SGC/css/componentes/progreso.css',
  './SGC/css/componentes/spinner.css',
  './SGC/css/componentes/tablas.css',
  './SGC/css/componentes/tarjetas.css',
  './SGC/css/componentes/toast.css',
  './SGC/css/componentes/transiciones.css',
  './SGC/css/grilla.css',
  './SGC/css/tokens.css',
  './SGC/css/utilidades.css',
  './SGC/favicon.svg',
  './SGC/icon.svg',
  './SGC/icons/icon-192.png',
  './SGC/icons/icon-512.png',
  './SGC/icons/icon-1024.png',
  './SGC/manifest.json',
  './SGC/js/ajustes.js',
  './SGC/js/animaciones.js',
  './SGC/js/api-local.js',
  './SGC/js/app.js',
  './SGC/js/atajos.js',
  './SGC/js/auditoria-bd.js',
  './SGC/js/busqueda-movil.js',
  './SGC/js/busqueda.js',
  './SGC/js/comun.js',
  './SGC/js/consultas.js',
  './SGC/js/datos-puro.js',
  './SGC/js/datos-ui.js',
  './SGC/js/favoritos.js',
  './SGC/js/gist.js',
  './SGC/js/historial-modal.js',
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
  './SGC/js/ui.js',
  './SGC/vendor/bootstrap-icons/bootstrap-icons.min.css',
  './SGC/vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
  './SGC/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './SGC/vendor/fonts/inter-latin-ext.woff2',
  './SGC/vendor/fonts/inter-latin.woff2',
  './SGC/vendor/fonts/inter.css',

  // ── SGI (Materiales) ──
  './SGI/',
  './SGI/index.html',
  './SGI/flash.js',
  './SGI/manifest.json',
  './SGI/styles.css',
  './SGI/app.js',
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
  './SGR/flash.js',
  './SGR/manifest.json',
  './SGR/styles.css',
  './SGR/app.js',
  './SGR/icon.svg',
  './SGR/icons/icon-192.png',
  './SGR/icons/icon-512.png',
  './SGR/icons/icon-1024.png',

  // ── SGP (Patcheras) ──
  './SGP/',
  './SGP/index.html',
  './SGP/flash.js',
  './SGP/manifest.json',
  './SGP/styles.css',
  './SGP/parser_planilla.js',
  './SGP/app.js',
  './SGP/icon.svg',
  './SGP/icons/icon-192.png',
  './SGP/icons/icon-512.png',
  './SGP/icons/icon-1024.png',

  // ── Recursos Compartidos Suite ──
  './shared/idr-infra.js'
];

// Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[IDR-SW] Precacheando recursos de la suite...');
      try {
        await cache.addAll(PRECACHE_URLS);
        console.log('[IDR-SW] Precacheo completado exitosamente.');
      } catch (err) {
        console.warn('[IDR-SW] Falló cache.addAll atómico, precacheando archivo por archivo:', err);
        await Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(e => console.warn(`[IDR-SW] No se pudo precachear ${url}:`, e))
          )
        );
      }
    })
  );
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, RUNTIME_CACHE];

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!allowedCaches.includes(cacheName)) {
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
