const VERSION = 'neotools-v0.1.0';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.svg',
  '/favicon.svg',
  '/pipeline',
  '/open',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/open')) {
    event.respondWith(Response.redirect('/open', 303));
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const runtime = /\.(wasm|woff2|ttf|mjs)$/.test(url.pathname);
  if (runtime) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('/'))),
  );
});
