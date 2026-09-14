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
        apiKeys: new Set([key]),
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
