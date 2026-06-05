
// Bump this on any change to the SW's caching behavior. The `activate` handler
// deletes every cache whose key !== CACHE_NAME, so bumping the version is what
// purges stale entries from a prior deploy. (v1 → v2: drop the index.html
// precache + force a one-time clear of the old immortal cache that was pinning
// stale assets across deploys — a contributor to "Failed to fetch dynamically
// imported module" crashes. See ErrorBoundary.tsx for the client-side recovery
// half of this fix.)
const CACHE_NAME = 'sat-bank-v2';
// NB: deliberately do NOT precache '/' or '/index.html'. Caching the app shell
// risks pinning an index.html that references chunk hashes a newer deploy has
// already removed. The HTML shell is always fetched network-first (it falls
// through the fetch handler below to the browser default). Only content-hashed
// /assets/ files — safe to cache because a new build means a new filename —
// get cached.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for index.json
  if (url.pathname.endsWith('/data/index.json')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cache-first for question JSON and built assets
  if (url.pathname.startsWith('/data/json/') || url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Network-first / default for everything else
});
