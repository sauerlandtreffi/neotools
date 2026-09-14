import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, safeAssetUrl, safeCssColor } from '../src/lib/branding';
import { sanitizeHtml } from '../src/lib/sanitize-html';
import { PIPELINE_IMPORT_LIMITS, decodePipelineHash, sanitizePipelineOptions, sanitizePipelineSteps } from '../src/lib/pipeline-import';
import { assessExtension } from '../src/lib/assess-extension';
import { safeDownloadName } from '../src/lib/worker-client';

const repo = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(repo, rel), 'utf8');

const HEADER_NAMES = [
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Resource-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Content-Security-Policy',
] as const;

type HeaderMap = Record<string, string>;

function fromNetlifyHeaders(text: string): HeaderMap {
  const out: HeaderMap = {};
  for (const line of text.split('\n')) {
    const m = /^\s{2}([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function fromVercel(text: string): HeaderMap {
  const json = JSON.parse(text) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const all = json.headers.find((h) => h.source === '/(.*)');
  expect(all, 'vercel.json needs a catch-all header rule').toBeTruthy();
  return Object.fromEntries(all!.headers.map((h) => [h.key, h.value]));
}

function fromNginx(text: string): HeaderMap {
  const out: HeaderMap = {};
  for (const m of text.matchAll(/add_header\s+([A-Za-z-]+)\s+"([^"]+)"\s+always;/g)) {
    if (!(m[1]! in out)) out[m[1]!] = m[2]!;
  }
  return out;
}

/** Parses `'Header-Name': 'value'` / `"value"` object literals (server.mjs, middleware.ts). */
function fromJsObject(text: string, startMarker: string): HeaderMap {
  const start = text.indexOf(startMarker);
  expect(start, `marker ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('};', start);
  const body = text.slice(start, end);
  const out: HeaderMap = {};
  for (const m of body.matchAll(/'([A-Za-z-]+)':\s*\n?\s*(?:'([^']*)'|"([^"]*)")/g)) {
    out[m[1]!] = (m[2] ?? m[3])!;
  }
  return out;
}

function cspDirectives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name) out[name] = vals.sort();
  }
  return out;
}

describe('security headers are identical across every deployment surface', () => {
  const sources: Record<string, HeaderMap> = {
    '_headers': fromNetlifyHeaders(read('apps/web/public/_headers')),
    'vercel.json': fromVercel(read('apps/web/vercel.json')),
    'nginx.conf': fromNginx(read('deploy/docker/nginx.conf')),
    'e2e/server.mjs': fromJsObject(read('apps/web/e2e/server.mjs'), 'const SECURITY = {'),
    'middleware.ts': fromJsObject(read('apps/web/src/middleware.ts'), 'SECURITY_HEADERS: Record<string, string> = {'),
  };

  it('every source defines all seven headers with the same value', () => {
    const reference = sources['_headers']!;
    for (const name of HEADER_NAMES) expect(reference[name], `_headers: ${name}`).toBeTruthy();
    for (const [file, map] of Object.entries(sources)) {
      for (const name of HEADER_NAMES) {
        expect(map[name], `${file}: ${name}`).toBe(reference[name]);
      }
    }
  });

  it('CSP: wasm-unsafe-eval but never unsafe-eval; connect-src self only; object-src none', () => {
    const csp = sources['_headers']!['Content-Security-Policy']!;
    const d = cspDirectives(csp);
    expect(d['script-src']).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(d['connect-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    for (const dir of Object.values(d)) for (const v of dir) expect(v).not.toMatch(/^https?:\/\//);
    expect(sources['_headers']!['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(sources['_headers']!['Cross-Origin-Embedder-Policy']).toBe('credentialless');
  });

  it('Tauri CSP matches the web CSP directive-by-directive', () => {
    const tauri = JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')) as { app: { security: { csp: string } } };
    const web = cspDirectives(sources['_headers']!['Content-Security-Policy']!);
    const desk = cspDirectives(tauri.app.security.csp);
    expect(desk).toEqual(web);
  });
});

describe('service worker caching policy (static analysis of public/sw.js)', () => {
  const sw = read('apps/web/public/sw.js');
  it('ignores non-GET, non-http(s), cross-origin, /api/ and credentialed requests', () => {
    expect(sw).toMatch(/if \(req\.method !== 'GET'\) return;/);
    expect(sw).toMatch(/url\.protocol !== 'http:' && url\.protocol !== 'https:'\) return;/);
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return;/);
    expect(sw).toMatch(/req\.headers\.has\('Authorization'\)/);
    expect(sw).toMatch(/url\.pathname\.startsWith\('\/api\/'\)\) return;/);
    // the only cache writes are stale-while-revalidate for runtime assets and precache pages
    const puts = sw.match(/cache\.put|c\.put/g) ?? [];
    expect(puts.length).toBe(2);
    expect(sw).not.toMatch(/blob:/);
    expect(sw).not.toMatch(/https?:\/\//);
  });
});

describe('branding escape', () => {
  it('rejects javascript: logos and CSS injection colors', () => {
    expect(safeAssetUrl('javascript:alert(1)', '/logo.svg')).toBe('/logo.svg');
    expect(safeAssetUrl('https://evil.example/x.svg', '/logo.svg')).toBe('/logo.svg');
    expect(safeAssetUrl('/brand/logo.svg', '/logo.svg')).toBe('/brand/logo.svg');
    expect(safeCssColor('red; background:url(https://x)', '#10221c')).toBe('#10221c');
    expect(safeCssColor('#3ee0b4', '#000')).toBe('#3ee0b4');
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('pipeline import', () => {
  it('drops unknown tools and prototype-pollution keys', () => {
    const steps = sanitizePipelineSteps(
      [
        { toolId: 'pdf-merge', options: { __proto__: { admin: true }, bookmarkPerFile: true } },
        { toolId: 'rm-rf', options: {} },
        { ['__proto__']: { x: 1 }, toolId: 'pdf-sanitize', options: { constructor: { prototype: { a: 1 } } } },
      ],
      new Set(['pdf-merge', 'pdf-sanitize']),
    );
    expect(steps.map((s) => s.toolId)).toEqual(['pdf-merge', 'pdf-sanitize']);
    expect(Object.prototype.hasOwnProperty.call(steps[0]!.options, '__proto__')).toBe(false);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('enforces plain JSON with depth/key/string/step limits and scrubs arrays', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 12; i++) {
      cur.next = {};
      cur = cur.next as Record<string, unknown>;
    }
    cur.leaf = 1;
    const opts = sanitizePipelineOptions({
      deep,
      // literal `__proto__:` sets the prototype → exotic object → dropped entirely
      arr: [{ __proto__: { evil: 1 }, ok: 1 }, () => 1, Symbol('x'), 3, 'a', JSON.parse('{"__proto__":{"evil":2},"keep":true}')],
      fn: () => 1,
      big: 'x'.repeat(10_000),
      nan: Number.NaN,
      date: new Date(0),
      map: new Map(),
    });
    expect(JSON.stringify(opts)).not.toMatch(/evil/);
    expect(opts.arr).toEqual([3, 'a', { keep: true }]);
    expect(Object.prototype.hasOwnProperty.call((opts.arr as unknown[])[2], '__proto__')).toBe(false);
    expect(opts.fn).toBeUndefined();
    expect(opts.nan).toBeUndefined();
    expect(opts.date).toBeUndefined();
    expect(opts.map).toBeUndefined();
    expect((opts.big as string).length).toBe(PIPELINE_IMPORT_LIMITS.maxStringLength);
    expect(JSON.stringify(opts).split('"next"').length - 1).toBeLessThanOrEqual(PIPELINE_IMPORT_LIMITS.maxDepth);
    const many: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) many[`k${i}`] = i;
    expect(Object.keys(sanitizePipelineOptions(many)).length).toBeLessThanOrEqual(PIPELINE_IMPORT_LIMITS.maxKeys);
    const steps = sanitizePipelineSteps(
      Array.from({ length: 100 }, () => ({ toolId: 'pdf-merge', options: {}, whenMime: ['application/pdf', 'javascript:alert(1)', 5] })),
      new Set(['pdf-merge']),
    );
    expect(steps.length).toBe(PIPELINE_IMPORT_LIMITS.maxSteps);
    expect(steps[0]!.whenMime).toEqual(['application/pdf']);
    expect(sanitizePipelineSteps([{ toolId: '__proto__', options: {} }], new Set(['__proto__']))).toEqual([]);
  });

  it('decodePipelineHash caps size and rejects non-base64url input', () => {
    const payload = Buffer.from(JSON.stringify({ steps: [{ toolId: 'pdf-merge', options: {} }] })).toString('base64url');
    expect(decodePipelineHash(payload)).toEqual({ steps: [{ toolId: 'pdf-merge', options: {} }] });
    expect(decodePipelineHash('x'.repeat(PIPELINE_IMPORT_LIMITS.maxEncodedLength + 1))).toBeUndefined();
    expect(decodePipelineHash('<script>')).toBeUndefined();
    expect(decodePipelineHash('')).toBeUndefined();
    expect(decodePipelineHash(Buffer.from('not json').toString('base64url'))).toBeUndefined();
  });
});

describe('markdown XSS', () => {
  it('strips script handlers from report markdown', () => {
    if (typeof window === 'undefined') {
      expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe('');
      return;
    }
    const dirty = '<p>file <img src=x onerror="alert(1)"> <script>alert(2)</script></p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/onerror|script/i);
  });
});

describe('download names', () => {
  it('strips zip-slip and quotes', () => {
    expect(safeDownloadName('../../etc/passwd')).toBe('passwd');
    expect(safeDownloadName('a"b.pdf')).toBe('a_b.pdf');
  });
});

describe('assessExtension rename bypass', () => {
  it('still warns when HTML is named photo.png', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script><body>x</body></html>');
    const result = await assessExtension({ name: 'photo.png', mime: 'image/png', bytes: html });
    expect(result.severity === 'medium' || result.severity === 'high' || result.severity === 'critical').toBe(true);
    expect(result.mismatch).toBe(true);
  });
});
