/**
 * Livable Telluride — Service Worker
 * Strategy:
 *   - HTML (the shell): network-first with cache fallback for offline.
 *     Mobile users get fresh HTML on every connected visit, so new nav
 *     links / inline scripts / structure ship immediately. Cached shell
 *     is the offline fallback only.
 *   - Static CSS / JS / logos: cache-first, refresh in background
 *     (stale-while-revalidate).
 *   - Everything else (RSS feeds, Firebase, external APIs): network-first.
 *
 * If you change the cached-asset list or this fetch strategy in a way that
 * needs existing PWA installs to drop old entries, BUMP CACHE_NAME — the
 * activate handler purges every cache whose name doesn't match.
 */

const CACHE_NAME = 'livable-tlr-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/site.css',
  '/css/hub-bub.css',
  '/js/gov-helpers.js',
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

// Fetch: cache-first for static CSS/JS/logos, network-first for HTML and
// everything else. HTML deliberately falls into the network-first branch so
// fresh shell markup (new nav links, inline scripts, structural changes)
// ships to mobile on the next connected visit instead of being trapped behind
// stale-while-revalidate. The pre-cached HTML in STATIC_ASSETS still serves
// as the offline fallback via caches.match in the network-first .catch.
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
