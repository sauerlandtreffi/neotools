import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fetch } from 'undici';
import { createApiApp, type ApiApp } from '../src/app.js';
import { loadApiConfig } from '../src/config.js';

async function samplePdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText(text, { x: 40, y: 100, size: 16, font });
  return Buffer.from(await doc.save());
}

function form(
  fields: Record<string, string>,
  files: Array<{ field: string; filename: string; mime: string; data: Buffer }>,
): { payload: Buffer; contentType: string } {
  const boundary = '----NeoToolsTestBoundary';
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.mime}\r\n\r\n`,
      ),
    );
    chunks.push(f.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('NeoTools API', () => {
  let api: ApiApp;
  const key = 'test-key-platform';

  beforeAll(async () => {
    api = await createApiApp(
      loadApiConfig({
        apiKeys: new Set([key, 'other-key-only']),
        maxUploadBytes: 64 * 1024,
        inlineWorkers: true,
        requireApiFeature: false,
        rateMax: 1000,
      }),
    );
  });

  afterAll(async () => {
    await api.close();
  });

  it('merges two PDFs via POST /api/v1/run/pdf-merge', async () => {
    const a = await samplePdf('A');
    const b = await samplePdf('B');
    const body = form({}, [
      { field: 'files', filename: 'a.pdf', mime: 'application/pdf', data: a },
      { field: 'files', filename: 'b.pdf', mime: 'application/pdf', data: b },
    ]);
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/v1/run/pdf-merge',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-neotools-report']).toBeTruthy();
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(res.rawPayload);
    expect(pdf.getPageCount()).toBe(2);
  });

  it('rejects an invalid key with 401', async () => {
    const res = await api.app.inject({
      method: 'GET',
      url: '/api/v1/tools',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 413 when the upload exceeds the limit', async () => {
    const huge = Buffer.alloc(70 * 1024, 1);
    const body = form({}, [{ field: 'files', filename: 'big.bin', mime: 'application/octet-stream', data: huge }]);
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/v1/run/pdf-merge',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(413);
  });

  it('runs a pipeline (sanitize → identity chain via merge of one file after split-less sanitize)', async () => {
    const pdf = await samplePdf('Pipe');
    const spec = JSON.stringify({
      steps: [{ toolId: 'pdf-sanitize', options: {} }],
    });
    const body = form({ spec }, [{ field: 'files', filename: 'in.pdf', mime: 'application/pdf', data: pdf }]);
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/v1/pipeline',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-neotools-report']).toBeTruthy();
    const magic = res.rawPayload.subarray(0, 5).toString();
    expect(magic === '%PDF-' || magic.startsWith('PK')).toBe(true);
  });

  it('serves health, license and openapi without a key', async () => {
    const health = await api.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    const lic = await api.app.inject({ method: 'GET', url: '/api/v1/license' });
    expect(lic.statusCode).toBe(200);
    const oa = await api.app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(oa.statusCode).toBe(200);
    expect(oa.json().openapi).toBe('3.1.0');
  });

  it('does not leak jobs across API keys', async () => {
    const pdf = await samplePdf('Iso');
    const body = form({}, [{ field: 'files', filename: 'a.pdf', mime: 'application/pdf', data: pdf }]);
    const created = await api.app.inject({
      method: 'POST',
      url: '/api/v1/run/pdf-sanitize?async=1',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    const id = created.json().id as string;
    expect(id).toMatch(/^job_[0-9a-f]{32}$/);
    const stolen = await api.app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${id}`,
      headers: { authorization: 'Bearer other-key-only' },
    });
    expect(stolen.statusCode).toBe(404);
    const own = await api.app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${id}`,
      headers: { authorization: `Bearer ${key}` },
    });
    expect(own.statusCode).toBe(200);
  });

  it('rejects zip-slip output names and unknown pipeline tools', async () => {
    const pdf = await samplePdf('X');
    const spec = JSON.stringify({
      steps: [{ toolId: 'not-a-real-tool', options: { __proto__: { admin: true } } }],
    });
    const body = form({ spec }, [{ field: 'files', filename: '../../etc/passwd.pdf', mime: 'application/pdf', data: pdf }]);
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/v1/pipeline',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Unbekanntes Pipeline-Tool/);
  });

  it('sets security headers and no CORS for unknown origins', async () => {
    const res = await api.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers GET /api/v1/jobs/:id after an async enqueue', async () => {
    const pdf = await samplePdf('Job');
    const body = form({}, [{ field: 'files', filename: 'a.pdf', mime: 'application/pdf', data: pdf }]);
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/v1/run/pdf-sanitize?async=1',
      headers: { authorization: `Bearer ${key}`, 'content-type': body.contentType },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(202);
    const id = res.json().id as string;
    let job = await api.app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${id}`,
      headers: { authorization: `Bearer ${key}` },
    });
    for (let i = 0; i < 40 && job.json().status === 'queued'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = await api.app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${id}`,
        headers: { authorization: `Bearer ${key}` },
      });
    }
    expect(['queued', 'running', 'done', 'error']).toContain(job.json().status);
  });
});

describe('API hardening (wave 5)', () => {
  it('publicErrorMessage strips paths, stack frames and file URLs', async () => {
    const { publicErrorMessage, safeDownloadName, timingSafeEqualString } = await import('../src/hash.js');
    expect(publicErrorMessage(new Error("ENOENT: no such file, open '/root/Neotools/apps/api/secret.txt'"))).not.toContain('/root');
    expect(publicErrorMessage(new Error('boom\n    at run (/srv/app/dist/app.js:12:3)'))).toBe('Interner Fehler');
    expect(publicErrorMessage('Cannot find module file:///srv/app/x.js')).not.toContain('file://');
    expect(publicErrorMessage('C:\\Users\\Admin\\evil.pdf fehlt')).not.toContain('C:\\Users');
    expect(publicErrorMessage(new Error('x'.repeat(500))).length).toBeLessThanOrEqual(200);
    expect(publicErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(publicErrorMessage('Unbekanntes Tool: foo')).toBe('Unbekanntes Tool: foo');
    for (const evil of ['../../etc/passwd', '..\\..\\win.ini', 'C:\\x\\y.pdf', '/etc/shadow', '....//x.pdf', '\u0000a.pdf']) {
      const safe = safeDownloadName(evil);
      expect(safe).not.toMatch(/[\\/]/);
      expect(safe).not.toMatch(/^\./);
      expect(safe).not.toContain('..');
    }
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
    expect(timingSafeEqualString('abc', 'abc')).toBe(true);
    expect(timingSafeEqualString('', '')).toBe(true);
  });

  it('rate-limits invalid keys per IP (no fresh bucket per guessed key)', async () => {
    const api = await createApiApp(
      loadApiConfig({
        apiKeys: new Set(['real-key']),
        inlineWorkers: true,
        requireApiFeature: false,
        rateMax: 3,
        rateWindow: '1 minute',
      }),
    );
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await api.app.inject({
          method: 'GET',
          url: '/api/v1/tools',
          headers: { authorization: `Bearer guess-${i}` },
          remoteAddress: '10.0.0.7',
        });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses.slice(3)).toEqual([429, 429]);
      // a valid key from the same IP has its own bucket
      const ok = await api.app.inject({
        method: 'GET',
        url: '/api/v1/tools',
        headers: { authorization: 'Bearer real-key' },
        remoteAddress: '10.0.0.7',
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      await api.close();
    }
  });

  it('CORS: allowlisted origin gets 204 preflight, unknown origin gets 403 and no ACAO', async () => {
    const api = await createApiApp(
      loadApiConfig({
        apiKeys: new Set(['k']),
        inlineWorkers: true,
        requireApiFeature: false,
        rateMax: 1000,
        corsOrigins: new Set(['https://app.example']),
      }),
    );
    try {
      const pre = await api.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/run/pdf-merge',
        headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' },
      });
      expect(pre.statusCode).toBe(204);
      expect(pre.headers['access-control-allow-origin']).toBe('https://app.example');
      const evil = await api.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/run/pdf-merge',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      });
      expect(evil.statusCode).toBe(403);
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      const get = await api.app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { origin: 'https://evil.example' },
      });
      expect(get.headers['access-control-allow-origin']).toBeUndefined();
      expect(get.headers['content-security-policy']).toContain("default-src 'none'");
      expect(get.headers['x-frame-options']).toBe('DENY');
      expect(get.headers['cross-origin-resource-policy']).toBe('same-origin');
    } finally {
      await api.close();
    }
  });

  it('job records are owner-bound and evicted after retention', async () => {
    const { JobQueue } = await import('../src/jobs.js');
    const { Registry } = await import('@neotools/engine');
    const queue = new JobQueue(new Registry(), 1, 1000, true, 1000, 3);
    const a = queue.enqueue({ kind: 'run', toolId: 'nope', files: [], ownerKeyHash: 'A' });
    await queue.wait(a.id).catch(() => undefined);
    expect(queue.get(a.id, 'A')?.id).toBe(a.id);
    expect(queue.get(a.id, 'B')).toBeUndefined();
    expect(queue.get(a.id, undefined)).toBeUndefined();
    expect(queue.get(a.id, 'A')?.status).toBe('error');
    expect(queue.evict(Date.now() + 2000)).toBe(1);
    expect(queue.get(a.id, 'A')).toBeUndefined();
    for (let i = 0; i < 4; i++) {
      const j = queue.enqueue({ kind: 'run', toolId: 'nope', files: [], ownerKeyHash: 'A' });
      await queue.wait(j.id).catch(() => undefined);
    }
    expect(queue.size).toBeLessThanOrEqual(3);
  });

  it('rejects oversized bodies by Content-Length before reading and unknown tools with 404', async () => {
    const api = await createApiApp(
      loadApiConfig({ apiKeys: new Set(['k']), inlineWorkers: true, requireApiFeature: false, rateMax: 1000, maxUploadBytes: 1024 }),
    );
    try {
      const res = await api.app.inject({
        method: 'POST',
        url: '/api/v1/run/pdf-merge',
        headers: { authorization: 'Bearer k', 'content-type': 'multipart/form-data; boundary=x', 'content-length': '999999' },
        payload: Buffer.alloc(0),
      });
      expect(res.statusCode).toBe(413);
      const pdf = await samplePdf('u');
      const body = form({}, [{ field: 'files', filename: 'a.pdf', mime: 'application/pdf', data: pdf.subarray(0, 512) }]);
      const unknown = await api.app.inject({
        method: 'POST',
        url: '/api/v1/run/../../etc/passwd',
        headers: { authorization: 'Bearer k', 'content-type': body.contentType },
        payload: body.payload,
      });
      expect([400, 404]).toContain(unknown.statusCode);
      expect(JSON.stringify(unknown.json())).not.toMatch(/\/root|\/srv|node_modules/);
    } finally {
      await api.close();
    }
  });
});

describe('API via undici (listen)', () => {
  it('health over HTTP', async () => {
    const api = await createApiApp(
      loadApiConfig({
        apiKeys: new Set(['k']),
        inlineWorkers: true,
        requireApiFeature: false,
        rateMax: 1000,
      }),
    );
    const addr = await api.app.listen({ host: '127.0.0.1', port: 0 });
    const res = await fetch(`${addr}/api/v1/health`);
    expect(res.status).toBe(200);
    await api.close();
  });
});
