const CACHE_NAME = 'idr-suite-260924.0213';
const RUNTIME_CACHE = 'idr-runtime-260924.0213';

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
