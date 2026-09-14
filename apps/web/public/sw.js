const VERSION = 'neotools-v0.2.0';
const PRECACHE = [
  '/',
  '/offline',
  '/en/offline',
  '/manifest.webmanifest',
  '/logo.svg',
  '/favicon.svg',
  '/pipeline',
  '/open',
  '/verlauf',
  '/formats',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function staleWhileRevalidate(request) {
  return caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(request);
    const fetched = fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
      .catch(() => cached);
    return cached || fetched;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/open')) {
    event.respondWith(Response.redirect('/open', 303));
    return;
  }
  // Only plain same-origin GETs are ever answered from or written to Cache Storage.
  // POST/PUT bodies, blob-/data-/filesystem-URLs, cross-origin requests and
  // requests carrying credentials/ranges bypass the worker entirely.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('Authorization') || req.headers.has('Range')) return;
  if (url.pathname.startsWith('/api/')) return;
  // FFmpeg cores / WASM: never clone into Cache Storage. A failed clone() on
  // the 30 MB ffmpeg-core.wasm body surfaces as TypeError: Failed to fetch
  // inside the tool worker.
  if (url.pathname.includes('/assets/ffmpeg') || url.pathname.endsWith('.wasm')) {
    return;
  }
  // Never cache user content (OPFS/history/blob downloads are not HTTP, but
  // HTML navigations must not be stored as a stand-in for job output).
  const runtime =
    /\.(woff2|ttf)$/.test(url.pathname) ||
    (url.pathname.includes('/assets/') && !url.pathname.includes('/history')) ||
    url.pathname.includes('/_astro/');
  if (runtime) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  const precacheHit = PRECACHE.includes(url.pathname) || PRECACHE.includes(url.pathname.replace(/\/$/, '') || '/');
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (precacheHit && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((c) => c || caches.match('/offline') || caches.match('/')),
      ),
  );
});
