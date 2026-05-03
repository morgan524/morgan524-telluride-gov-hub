/**
 * Livable Telluride — Service Worker
 * Strategy:
 *   - Static shell (HTML, CSS, JS, logos): cache-first, refresh in background
 *   - Everything else (RSS feeds, Firebase, external APIs): network-first
 */

const CACHE_NAME = 'livable-tlr-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/site.css',
  '/css/hub-bub.css',
  '/js/gov-hub.js',
  '/js/community-pulse.js',
  '/js/hub-bub.js',
  '/js/events-proximity.js',
  '/js/corrections.js',
  '/js/mobile-nav.js',
  '/js/subscribe.js',
  '/js/local-groups.js',
  '/logo/Livable Telluride Logo.png',
  '/logo/icon-192.png',
  '/logo/icon-512.png',
  '/manifest.json'
];

// Install: pre-cache the static shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and cross-origin requests we don't control
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin &&
      !url.hostname.endsWith('firebasestorage.googleapis.com')) return;

  const isStatic =
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/logo/') ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/manifest.json';

  if (isStatic) {
    // Cache-first, then refresh in background (stale-while-revalidate)
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    );
  } else {
    // Network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
