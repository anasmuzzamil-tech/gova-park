const CACHE_NAME = 'govapark-shell-v2';
const APP_SHELL = ['/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icons/govapark-192.svg', '/icons/govapark-512.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('govapark-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Ne jamais mettre en cache les API, l'authentification ou les données privées.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/trpc') || url.pathname.includes('auth')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html'))));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    })());
  }
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
