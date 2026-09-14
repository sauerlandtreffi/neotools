import type { FastifyInstance } from 'fastify';
import type { Registry } from '@neotools/engine';

export function openApiDocument(registry: Registry): Record<string, unknown> {
  const toolIds = registry.list().map((t) => t.id);
  return {
    openapi: '3.1.0',
    info: {
      title: 'NeoTools Self-Hosting API',
      version: '1.0.0',
      description:
        'Lokale REST-API, gleiche Registry wie die CLI. Dateien nur im RAM, kein Persistieren. Auth: Bearer oder X-Api-Key.',
    },
    servers: [{ url: '/' }],
    paths: {
      '/api/v1/health': {
        get: { summary: 'Health', responses: { '200': { description: 'ok' } } },
      },
      '/api/v1/license': {
        get: { summary: 'Lizenzstatus (ohne Dateiinhalte)', responses: { '200': { description: 'status' } } },
      },
      '/api/v1/tools': {
        get: {
          summary: 'Tool-Definitionen inkl. JSON-Schema der Optionen',
          security: [{ apiKey: [] }],
          responses: { '200': { description: 'tools' } },
        },
      },
      '/api/v1/run/{toolId}': {
        post: {
          summary: 'Tool ausführen (multipart: files + options JSON)',
          security: [{ apiKey: [] }],
          parameters: [
            { name: 'toolId', in: 'path', required: true, schema: { type: 'string', enum: toolIds } },
          ],
          responses: {
            '200': { description: 'Datei oder ZIP + X-NeoTools-Report' },
            '401': { description: 'ungültiger Key' },
            '402': { description: 'Lizenz-Feature api fehlt' },
            '413': { description: 'Upload zu groß' },
          },
        },
      },
      '/api/v1/pipeline': {
        post: {
          summary: 'Pipeline (multipart: files + spec JSON)',
          security: [{ apiKey: [] }],
          responses: { '200': { description: 'Ergebnis' } },
        },
      },
      '/api/v1/jobs/{id}': {
        get: {
          summary: 'Asynchroner Job',
          security: [{ apiKey: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'job' } },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}

export function docsHtml(): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"/><title>NeoTools API</title>
<style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
code,pre{background:#f4f1ea;padding:.2rem .4rem} pre{padding:1rem;overflow:auto}</style>
</head><body>
<h1>NeoTools Self-Hosting API</h1>
<p>Gleiche Engine wie CLI. Dateien bleiben im RAM/tmpfs und werden nach der Antwort verworfen. Kein Tracking.</p>
<ul>
<li><code>GET /api/v1/health</code></li>
<li><code>GET /api/v1/license</code></li>
<li><code>GET /api/v1/tools</code></li>
<li><code>POST /api/v1/run/:toolId</code> multipart <code>files</code> + <code>options</code></li>
<li><code>POST /api/v1/pipeline</code> multipart <code>files</code> + <code>spec</code></li>
<li><code>GET /api/v1/jobs/:id</code></li>
<li><code>GET /api/v1/openapi.json</code></li>
</ul>
<p>Auth: <code>Authorization: Bearer &lt;key&gt;</code> oder <code>X-Api-Key</code> (<code>NEOTOOLS_API_KEYS</code>).</p>
<pre>curl -sS -H "Authorization: Bearer $NEOTOOLS_API_KEYS" \\
  -F "files=@a.pdf" -F "files=@b.pdf" -F 'options={"bookmarkPerFile":true}' \\
  http://127.0.0.1:8080/api/v1/run/pdf-merge -o merged.pdf</pre>
</body></html>`;
}

export function registerDocs(app: FastifyInstance, registry: Registry): void {
  app.get('/api/v1/openapi.json', async () => openApiDocument(registry));
  app.get('/api/v1/docs', async (_req, reply) => reply.type('text/html').send(docsHtml()));
}
