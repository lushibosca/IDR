/**
 * Service Worker Secundario (Heredado) - SGL
 * El control offline ha sido unificado en el Service Worker raíz (/sw.js).
 * Este archivo desregistra instancias huérfanas de este worker en los navegadores de los usuarios.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      console.log('[SGL-SW] Service worker secundario desregistrado con éxito.');
      return self.clients.matchAll({ type: 'window' });
    }).then(clients => {
      clients.forEach(client => client.navigate(client.url));
    })
  );
});
