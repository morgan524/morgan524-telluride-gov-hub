// Livable Telluride service worker — RETIRED at the 2026 redesign cutover.
// No page registers a service worker anymore; this file exists only so any
// long-ago registration still controlling a browser self-destructs: it takes
// over immediately, deletes every cache, unregisters itself, and reloads the
// open tabs so they fetch the new site directly from the network.
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
