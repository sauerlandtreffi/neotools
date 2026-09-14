#!/usr/bin/env node
/**
 * Static server for Playwright smokes.
 * Astro `preview` does not apply public/_headers; this process serves dist/
 * with the same COOP/COEP/CSP as production (nginx / _headers / vercel.json).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRedirect } from '../redirects.mjs';

const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const host = process.env.E2E_HOST ?? '127.0.0.1';
const port = Number(process.env.E2E_PORT ?? 4173);

const SECURITY = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveUrl(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const candidates = [rel, `${rel}.html`, join(rel, 'index.html')];
  for (const candidate of candidates) {
    const full = resolve(dist, candidate);
    const prefix = dist.endsWith(sep) ? dist : dist + sep;
    if (!full.startsWith(prefix) && full !== dist) continue;
    if (isFile(full)) return full;
  }
  return null;
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error(
    `e2e server: missing ${join(dist, 'index.html')} — run pnpm --filter @neotools/web build`,
  );
  process.exit(1);
}

const server = createServer((req, res) => {
  const [pathOnly, query] = (req.url ?? '/').split('?');
  // Old URLs → 301 (same map as astro.config redirects / dist/_redirects)
  const target = resolveRedirect(decodeURIComponent(pathOnly));
  if (target) {
    const location = query && !target.includes('?') ? `${target}?${query}` : target;
    res.writeHead(301, { Location: location, 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
    res.end(`Moved: ${location}`);
    return;
  }
  const file = resolveUrl(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
    res.end('Not found');
    return;
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, ...SECURITY });
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`e2e static server http://${host}:${port}  (root ${dist})`);
});
