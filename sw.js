// Bump della cache: cambia questo nome quando pubblichi nuove versioni
const CACHE_NAME = 'segnapunti-cache-v4';

// Elenco asset precache con PERCORSI ASSOLUTI del progetto /segnapunti/
const ASSETS = [
  '/segnapunti/index.html',
  '/segnapunti/styles.css',
  '/segnapunti/sw.js',
  '/segnapunti/manifest.webmanifest',
  '/segnapunti/icons/icon-192.png',
  '/segnapunti/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Elimina vecchie cache
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );

    // Abilita la navigation preload (migliora caricamento su rete lenta)
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navigazioni (apertura/refresh di pagine): network-first con fallback a index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Se il browser ha già pre-caricato la risposta, usala
        const preload = await event.preloadResponse;
        if (preload) return preload;

        // Prova la rete
        const networkResp = await fetch(req);
        return networkResp;
      } catch (err) {
        // Offline o errore → servi la index.html dal cache (SPA fallback)
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('/segnapunti/index.html');
        return cachedIndex || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) Asset same-origin: cache-first con aggiornamento in background
  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Aggiorna in background
        fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
        }).catch(() => {});
        return cached;
      }
      // Non in cache → rete e poi cache
      const resp = await fetch(req);
      const copy = resp.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, copy);
      return resp;
    })());
  }
});
