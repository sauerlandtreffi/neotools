import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { zipSync } from 'fflate';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { hasFeature, verifyLicense, type LicenseVerifyResult } from '@neotools/license';
import type { Registry } from '@neotools/engine';
import { writeAudit } from './audit.js';
import type { ApiConfig } from './config.js';
import { keyAllowed, publicErrorMessage, safeDownloadName, sha256Hex } from './hash.js';
import { JobQueue, type JobFile } from './jobs.js';
import { docsHtml, openApiDocument } from './openapi.js';
import { createApiRegistry } from './registry.js';

function extractKey(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const alt = req.headers['x-api-key'];
  return typeof alt === 'string' ? alt.trim() : '';
}

async function readParts(
  req: FastifyRequest,
  maxBytes: number,
): Promise<{ files: JobFile[]; fields: Record<string, string>; bytes: number }> {
  const files: JobFile[] = [];
  const fields: Record<string, string> = {};
  let bytes = 0;
  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      const chunks: Buffer[] = [];
      let partBytes = 0;
      for await (const chunk of part.file) {
        partBytes += chunk.byteLength;
        if (bytes + partBytes > maxBytes) {
          const err = new Error('UPLOAD_TOO_LARGE');
          err.name = 'PayloadTooLarge';
          throw err;
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      bytes += buf.byteLength;
      files.push({
        name: safeDownloadName(part.filename || 'upload.bin'),
        mime: part.mimetype || 'application/octet-stream',
        data: new Uint8Array(buf),
      });
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { files, fields, bytes };
}

function sendOutputs(reply: FastifyReply, outputs: JobFile[], report: unknown): FastifyReply {
  const reportJson = JSON.stringify(report ?? {});
  reply.header('X-NeoTools-Report', Buffer.from(reportJson, 'utf8').toString('base64url'));
  if (outputs.length === 1) {
    const file = outputs[0]!;
    const single = safeDownloadName(file.name);
    return reply
      .header('Content-Disposition', `attachment; filename="${single.replace(/"/g, '')}"`)
      .type(file.mime)
      .send(Buffer.from(file.data));
  }
  const entries: Record<string, Uint8Array> = {};
  for (const file of outputs) {
    const name = safeDownloadName(file.name);
    if (name.includes('..')) continue;
    entries[name] = file.data;
  }
  const zipped = zipSync(entries);
  return reply
    .header('Content-Disposition', 'attachment; filename="neotools.zip"')
    .type('application/zip')
    .send(Buffer.from(zipped));
}

export interface ApiApp {
  app: FastifyInstance;
  registry: Registry;
  license: LicenseVerifyResult;
  close(): Promise<void>;
}

export async function createApiApp(config: ApiConfig, registryOverride?: Registry): Promise<ApiApp> {
  const registry = registryOverride ?? (await createApiRegistry(config.presets));
  const license = await verifyLicense(config.licenseToken, config.licensePubkey);
  const queue = new JobQueue(registry, config.maxParallel, config.jobTimeoutMs, config.inlineWorkers);

  const app = Fastify({
    logger: false,
    bodyLimit: config.maxUploadBytes,
    // Slowloris / stuck-job protection: the socket is closed a little after the job timeout.
    requestTimeout: config.jobTimeoutMs + 30_000,
    connectionTimeout: config.jobTimeoutMs + 60_000,
    keepAliveTimeout: 5_000,
    trustProxy: false,
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 32, fields: 16, fieldSize: 64 * 1024, parts: 64 },
  });
  await app.register(rateLimit, {
    max: config.rateMax,
    timeWindow: config.rateWindow,
    // Only a *valid* key gets its own bucket; invalid/missing keys share the IP bucket
    // so brute-forcing keys cannot mint fresh buckets per attempt.
    keyGenerator: (req) => {
      const key = extractKey(req);
      return key && keyAllowed(key, config.apiKeys) ? `key:${sha256Hex(key)}` : `ip:${req.ip}`;
    },
    allowList: (req) => {
      const url = req.url.split('?')[0] ?? '';
      return url === '/api/v1/health';
    },
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin) return;
    if (config.corsOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Key');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Expose-Headers', 'X-NeoTools-Report, Content-Disposition');
      reply.header('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') return reply.code(204).send();
      return;
    }
    // Unknown origin: no ACAO header at all; preflights are refused explicitly.
    if (req.method === 'OPTIONS') {
      return reply.code(403).send({ error: 'Origin nicht erlaubt.' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = status >= 400 && status < 600 ? status : 500;
    // 5xx never echo internals; 4xx messages are scrubbed of paths/stack frames.
    return reply.code(code).send({
      error: code === 504 ? 'Job-Timeout' : code >= 500 ? 'Interner Fehler' : publicErrorMessage(err, 'Anfrage fehlgeschlagen'),
    });
  });

  const publicPaths = new Set([
    '/api/v1/health',
    '/api/v1/docs',
    '/api/v1/openapi.json',
    '/api/v1/license',
  ]);

  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (publicPaths.has(path) || req.method === 'OPTIONS') return;
    if (!config.apiKeys.size) {
      return reply.code(401).send({ error: 'NEOTOOLS_API_KEYS ist nicht gesetzt.' });
    }
    const key = extractKey(req);
    if (!key || !keyAllowed(key, config.apiKeys)) {
      return reply.code(401).send({ error: 'Ungültiger API-Key.' });
    }
    (req as FastifyRequest & { apiKeyHash?: string }).apiKeyHash = sha256Hex(key);
  });

  app.get('/api/v1/health', async () => ({ ok: true, tools: registry.size }));
  app.get('/api/v1/license', async () => ({
    ok: license.ok,
    plan: license.payload?.plan ?? 'community',
    org: license.payload?.org ?? 'Community',
    features: license.payload?.features ?? [],
    grace: license.grace,
    warnings: license.warnings,
    expired: license.expired,
    error: license.ok ? undefined : license.error,
    communityPromise:
      'Community bleibt für alle Tools voll funktionsfähig. Gates nur für api, watch, presets, whitelabel, audit.',
  }));
  app.get('/api/v1/openapi.json', async () => openApiDocument(registry));
  app.get('/api/v1/docs', async (_req, reply) => reply.type('text/html').send(docsHtml()));

  app.get('/api/v1/tools', async () => ({
    tools: registry.list().map((tool) => ({
      id: tool.id,
      pack: tool.pack,
      category: tool.category,
      title: tool.title,
      description: tool.description,
      inputs: tool.inputs,
      outputs: tool.outputs,
      optionsSchema: (zodToJsonSchema as (schema: unknown, opts?: { $refStrategy: string }) => unknown)(
        tool.options,
        { $refStrategy: 'none' },
      ),
    })),
  }));

  const gateApi = (reply: FastifyReply): boolean => {
    if (!config.requireApiFeature) return true;
    if (hasFeature('api', license)) return true;
    void reply.code(402).send({
      error: 'Feature api erfordert Pro/Enterprise. Community-Tools bleiben in Browser und CLI frei.',
    });
    return false;
  };

  const runJob = async (
    req: FastifyRequest,
    reply: FastifyReply,
    kind: 'run' | 'pipeline',
    toolId: string | undefined,
  ) => {
    if (!gateApi(reply)) return;
    const declared = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > config.maxUploadBytes) {
      return reply.code(413).send({ error: 'Upload überschreitet NEOTOOLS_MAX_UPLOAD_BYTES.' });
    }
    let parsed: { files: JobFile[]; fields: Record<string, string>; bytes: number };
    try {
      parsed = await readParts(req, config.maxUploadBytes);
    } catch (err) {
      if (err instanceof Error && (err.name === 'PayloadTooLarge' || err.message === 'UPLOAD_TOO_LARGE')) {
        return reply.code(413).send({ error: 'Upload überschreitet NEOTOOLS_MAX_UPLOAD_BYTES.' });
      }
      throw err;
    }
    let options: unknown = {};
    let spec: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> } | undefined;
    if (parsed.fields.options) {
      try {
        options = JSON.parse(parsed.fields.options);
      } catch {
        return reply.code(400).send({ error: 'options ist kein JSON.' });
      }
    }
    if (parsed.fields.spec) {
      try {
        spec = JSON.parse(parsed.fields.spec) as typeof spec;
      } catch {
        return reply.code(400).send({ error: 'spec ist kein JSON.' });
      }
    }
    if (kind === 'run' && toolId && !registry.get(toolId)) {
      return reply.code(404).send({ error: `Unbekanntes Tool: ${toolId}` });
    }
    if (kind === 'pipeline') {
      if (!spec || !Array.isArray(spec.steps) || !spec.steps.length) {
        return reply.code(400).send({ error: 'Pipeline-Spec fehlt oder ist leer.' });
      }
      if (spec.steps.length > 32) {
        return reply.code(400).send({ error: 'Pipeline-Spec: maximal 32 Schritte.' });
      }
      for (const step of spec.steps) {
        if (!step || typeof step !== 'object' || typeof step.toolId !== 'string' || !registry.get(step.toolId)) {
          return reply.code(400).send({ error: `Unbekanntes Pipeline-Tool: ${String(step?.toolId).slice(0, 64)}` });
        }
        if (step.whenMime !== undefined) {
          if (!Array.isArray(step.whenMime) || !step.whenMime.every((m) => typeof m === 'string' && m.length <= 128)) {
            return reply.code(400).send({ error: `Ungültiges whenMime für ${step.toolId}` });
          }
        }
        const parsedOpts = registry.get(step.toolId)!.options.safeParse(step.options ?? {});
        if (!parsedOpts.success) {
          return reply.code(400).send({ error: `Ungültige Optionen für ${step.toolId}` });
        }
        step.options = parsedOpts.data;
      }
    }
    const archiveIds = new Set(['archive-extract', 'archive-extract-selected', 'archive-convert']);
    if (toolId && archiveIds.has(toolId) && parsed.bytes > Math.min(config.maxUploadBytes, 8 * 1024 * 1024)) {
      return reply.code(413).send({ error: 'Archive über die API sind auf 8 MiB begrenzt (Zip-Bomb-Schutz).' });
    }
    const asyncWanted = req.query && typeof req.query === 'object' && (req.query as { async?: string }).async === '1';
    const ownerKeyHash = (req as FastifyRequest & { apiKeyHash?: string }).apiKeyHash;
    const job = queue.enqueue({ kind, toolId, spec, options, files: parsed.files, ownerKeyHash });
    if (asyncWanted) {
      return reply.code(202).send({ id: job.id, status: job.status });
    }
    const done = await queue.wait(job.id, config.jobTimeoutMs);
    const hashes = parsed.files.map((f) => sha256Hex(f.data));
    writeAudit(config.auditPath, {
      ts: new Date().toISOString(),
      jobId: done.id,
      toolId: toolId ?? 'pipeline',
      optionKeys: options && typeof options === 'object' ? Object.keys(options as object) : [],
      inputHashes: hashes,
      bytesIn: parsed.bytes,
      durationMs: (done.finishedAt ?? Date.now()) - (done.startedAt ?? done.createdAt),
      status: done.status === 'done' ? 'ok' : 'error',
    });
    parsed.files.forEach((f) => {
      f.data = new Uint8Array(0);
    });
    if (done.status !== 'done' || !done.result) {
      return reply.code(400).send({ error: publicErrorMessage(done.error, 'Job fehlgeschlagen'), id: done.id });
    }
    return sendOutputs(reply, done.result.outputs, done.result.report);
  };

  app.post('/api/v1/run/:toolId', async (req, reply) => {
    const toolId = (req.params as { toolId: string }).toolId;
    return runJob(req, reply, 'run', toolId);
  });

  app.post('/api/v1/pipeline', async (req, reply) => runJob(req, reply, 'pipeline', undefined));

  app.get('/api/v1/jobs/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const ownerKeyHash = (req as FastifyRequest & { apiKeyHash?: string }).apiKeyHash;
    const job = queue.get(id, ownerKeyHash);
    if (!job) return reply.code(404).send({ error: 'Job nicht gefunden.' });
    return {
      id: job.id,
      status: job.status,
      error: job.error ? publicErrorMessage(job.error, 'Job fehlgeschlagen') : undefined,
      warnings: job.result?.warnings,
      report: job.result?.report,
      outputs: job.result?.outputs.map((f) => ({ name: f.name, mime: f.mime, size: f.data.byteLength })),
    };
  });

  return {
    app,
    registry,
    license,
    async close() {
      await app.close();
    },
  };
}
