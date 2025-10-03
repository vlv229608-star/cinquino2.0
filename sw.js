// Aggiorna questo nome quando pubblichi nuove versioni
const CACHE_NAME = 'cinquino20-cache-v4';

// Asset precache (percorsi assoluti sul progetto /cinquino2.0/)
const BASE = '/cinquino2.0';
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/sw.js`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`
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
    // Pulisci vecchie cache
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
    );

    // Abilita navigation preload se disponibile (migliora UX)
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navigazioni: network-first con fallback a index.html per SPA/GitHub Pages
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Usa eventuale preload
        const preload = await event.preloadResponse;
        if (preload) return preload;

        // Prova la rete
        const networkResp = await fetch(req);
        return networkResp;
      } catch (err) {
        // Offline/errore → rispondi con index.html dalla cache
        const cache = await caches.open(CACHE_NAME);

        // Se si richiede esattamente /cinquino2.0/ mappa a index.html
        const indexResp =
          (url.pathname === `${BASE}/` && await cache.match(`${BASE}/index.html`)) ||
          await cache.match(`${BASE}/index.html`);

        return indexResp || new Response('Offline', { status: 503, statusText: 'Offline' });
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
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resp.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      // Non in cache → rete e poi memorizza
      const resp = await fetch(req);
      const copy = resp.clone();
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, copy);
      return resp;
    })());
  }
});


