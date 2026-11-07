const CACHE_NAME = 'idr-suite-261107.1200';
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

  // ── SGC (CCTV) ──
  './SGC/',
  './SGC/index.html',
  './SGC/flash.js',
  './SGC/manifest.json',
  './SGC/styles.css',
  './SGC/app.js',
  './SGC/icon.svg',
  './SGC/icons/icon-192.png',
  './SGC/icons/icon-512.png',
  './SGC/icons/icon-1024.png',

  // ── SGC-2 (CCTV estático; las fotos de modelos se guardan al verlas) ──
  './SGC-2/',
  './SGC-2/css/app/activos.css',
  './SGC-2/css/app/ajustes.css',
  './SGC-2/css/app/animaciones.css',
  './SGC-2/css/app/atajos.css',
  './SGC-2/css/app/auditoria.css',
  './SGC-2/css/app/estado.css',
  './SGC-2/css/app/estructura.css',
  './SGC-2/css/app/favoritos.css',
  './SGC-2/css/app/interaccion.css',
  './SGC-2/css/app/produccion.css',
  './SGC-2/css/app/tema.css',
  './SGC-2/css/base.css',
  './SGC-2/css/componentes/acordeon.css',
  './SGC-2/css/componentes/alertas.css',
  './SGC-2/css/componentes/botones.css',
  './SGC-2/css/componentes/desplegables.css',
  './SGC-2/css/componentes/formularios.css',
  './SGC-2/css/componentes/insignias.css',
  './SGC-2/css/componentes/listas.css',
  './SGC-2/css/componentes/modal.css',
  './SGC-2/css/componentes/navegacion.css',
  './SGC-2/css/componentes/progreso.css',
  './SGC-2/css/componentes/spinner.css',
  './SGC-2/css/componentes/tablas.css',
  './SGC-2/css/componentes/tarjetas.css',
  './SGC-2/css/componentes/toast.css',
  './SGC-2/css/componentes/transiciones.css',
  './SGC-2/css/grilla.css',
  './SGC-2/css/tokens.css',
  './SGC-2/css/utilidades.css',
  './SGC-2/favicon.svg',
  './SGC-2/js/ajustes.js',
  './SGC-2/js/animaciones.js',
  './SGC-2/js/api-local.js',
  './SGC-2/js/app.js',
  './SGC-2/js/atajos.js',
  './SGC-2/js/auditoria-bd.js',
  './SGC-2/js/busqueda.js',
  './SGC-2/js/comun.js',
  './SGC-2/js/datos-puro.js',
  './SGC-2/js/datos-ui.js',
  './SGC-2/js/favoritos.js',
  './SGC-2/js/gist.js',
  './SGC-2/js/migrar-sgc.js',
  './SGC-2/js/parseador.js',
  './SGC-2/js/preload.js',
  './SGC-2/js/privacidad.js',
  './SGC-2/js/produccion-asignar.js',
  './SGC-2/js/produccion-seleccion.js',
  './SGC-2/js/produccion.js',
  './SGC-2/js/resumen.js',
  './SGC-2/js/selector.js',
  './SGC-2/js/sesion-local.js',
  './SGC-2/js/stock-alta-lote.js',
  './SGC-2/js/stock-catalogos.js',
  './SGC-2/js/stock-listar.js',
  './SGC-2/js/stock-puro.js',
  './SGC-2/js/stock-seleccion.js',
  './SGC-2/js/stock.js',
  './SGC-2/js/ui.js',
  './SGC-2/vendor/bootstrap-icons/bootstrap-icons.min.css',
  './SGC-2/vendor/bootstrap-icons/fonts/bootstrap-icons.woff',
  './SGC-2/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './SGC-2/vendor/fonts/inter-latin-ext.woff2',
  './SGC-2/vendor/fonts/inter-latin.woff2',
  './SGC-2/vendor/fonts/inter.css',

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
            if (pathname.includes('/SGC-2')) {
              return caches.match('./SGC-2/index.html');
            }
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
