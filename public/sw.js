// GOVAPARK - service worker (mode hors ligne limite).
// Il met en cache UNIQUEMENT : (1) le shell statique de l'application, (2) les tuiles/styles de carte
// publics (OpenFreeMap, OpenStreetMap), avec une limite de quantite. Il ne touche jamais a /api, /trpc,
// aux requetes non-GET ni aux donnees personnelles. Les dernieres places sont gardees cote page (localStorage).
const SHELL_CACHE = 'govapark-shell-v3';
const TILE_CACHE = 'govapark-tiles-v1';
const MAX_TILE_ENTRIES = 600;
const SHELL_URLS = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/govapark-192.svg', '/icons/govapark-512.svg'];
const TILE_HOSTS = ['tiles.openfreemap.org', 'tile.openstreetmap.org'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // allSettled : une ressource absente ne doit pas empecher l'installation.
    await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('govapark-') && key !== SHELL_CACHE && key !== TILE_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // les plus anciennes d'abord
}

// Tuiles et styles de carte : en cache au fil de l'eau, avec plafond. Requete CORS sans cookies
// (les reponses "opaques" gonfleraient le quota de stockage).
async function handleMapRequest(request, url) {
  const cache = await caches.open(TILE_CACHE);
  const volatile = url.hostname === 'tiles.openfreemap.org' && (url.pathname.startsWith('/styles/') || url.pathname === '/planet');
  const fromNetwork = async () => {
    const response = await fetch(new Request(request.url, { mode: 'cors', credentials: 'omit' }));
    if (response.ok) { await cache.put(request.url, response.clone()); trimCache(cache, MAX_TILE_ENTRIES).catch(() => {}); }
    return response;
  };
  if (volatile) {
    try { return await fromNetwork(); } catch (error) {
      const cached = await cache.match(request.url);
      if (cached) return cached;
      throw error;
    }
  }
  const cached = await cache.match(request.url);
  if (cached) return cached;
  return fromNetwork();
}

async function handleNavigation(request) {
  const shell = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/html')) shell.put('/', response.clone()).catch(() => {});
    return response;
  } catch (error) {
    // Hors ligne (ou reseau tres lent) : on rouvre l'application depuis le shell mis en cache.
    return (await shell.match('/')) || (await shell.match('/offline.html')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (TILE_HOSTS.includes(url.hostname)) { event.respondWith(handleMapRequest(request, url)); return; }
  if (url.origin !== self.location.origin) return;
  // Ne jamais mettre en cache les API, l'authentification ou les donnees privees.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/trpc') || url.pathname.includes('auth')) return;
  if (request.mode === 'navigate') { event.respondWith(handleNavigation(request)); return; }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })());
    return;
  }
  if (SHELL_URLS.includes(url.pathname) && url.pathname !== '/') {
    event.respondWith((async () => (await caches.match(request)) || fetch(request))());
  }
});

// La page envoie la liste de ses fichiers /assets/ (noms hashes par Vite) pour qu'ils soient disponibles hors ligne.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'GOVAPARK_PRECACHE' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const raw of event.data.urls.slice(0, 120)) {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) continue;
        if (await cache.match(url.pathname)) continue;
        const response = await fetch(url.pathname);
        if (response.ok) await cache.put(url.pathname, response);
      } catch { /* ressource suivante */ }
    }
  })());
});

// Notifications système reçues via Web Push (le serveur doit envoyer les push).
self.addEventListener('push', (event) => {
  let payload = { title: 'GOVAPARK', body: 'Une information de stationnement est disponible.', url: '/' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { /* payload texte ou vide */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'GOVAPARK', {
    body: payload.body || 'Une place pourrait être disponible à proximité.',
    icon: '/icons/govapark-192.svg',
    badge: '/icons/govapark-192.svg',
    tag: payload.tag || 'govapark-parking-alert',
    data: { url: payload.url || '/' },
    renotify: false,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) { await client.focus(); if ('navigate' in client) await client.navigate(target); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GOVAPARK_ENABLE_PARKING_ALERTS') {
    // Permission accordée et service worker actif. L'abonnement Web Push devra
    // être créé côté client puis enregistré côté serveur avec une clé VAPID.
    event.source?.postMessage?.({ type: 'GOVAPARK_ALERTS_READY' });
  }
});
