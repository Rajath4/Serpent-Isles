// Serpent Isles offline shell — network-first for navigations (fresh deploys),
// cache-first for versioned assets (offline play).
const CACHE = 'serpent-isles-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html', './manifest.webmanifest']))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let sameOrigin = true;
  try {
    sameOrigin = new URL(req.url).origin === self.location.origin;
  } catch {
    return;
  }
  if (!sameOrigin) return;
  const isNavigate =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isNavigate) {
    // Fresh HTML when online, last-known shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? caches.match(req))),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return res;
        }),
    ),
  );
});
