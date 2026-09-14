🇬🇧 English · [🇩🇪 Deutsch](./DEPLOYMENT.de.md)

# NeoTools self-hosting

Step by step for Docker Compose. The web app stays stateless (no server-side storage for files). The optional API keeps jobs in RAM only.

## 1. Prerequisites

- Docker + Compose
- Node 22 / pnpm 10 only for a local build without Docker
- Optional: your own `branding.json`, team `presets.json`, Ed25519 license

## 2. Start

```bash
cd /path/to/Neotools
cp deploy/docker/.env.example deploy/docker/.env
# adjust keys in .env — never commit real secrets
docker compose -f deploy/docker/docker-compose.yml up --build
```

- Web: `http://localhost:8080`
- API (internal only, via nginx): `http://localhost:8080/api/v1/health`
- Docs: `http://localhost:8080/api/v1/docs`
- OpenAPI 3.1: `http://localhost:8080/api/v1/openapi.json`

## 3. Branding

`NEOTOOLS_BRANDING` points to a JSON file (see `deploy/docker/README.md` and [BRANDING.md](./BRANDING.md)). `hiddenTools` applies at build time. `license` / `licensePubkey` are embedded; empty = Community.

## 4. Team presets

`presets.json` in the schema of `@neotools/engine` `teamPresetsSchema` (`organization`, `defaults`, `locked`, `hiddenTools`, `requiredPipelines`). Optional Ed25519 signature (`signature`). CLI: `--presets` or `NEOTOOLS_PRESETS`. The API applies the same presets server-side. Enforcement (locked options) is the `presets` feature (Pro/Enterprise); Community tools remain usable.

## 5. License

```bash
node apps/cli/dist/cli.js license keygen --out /tmp/neotools-ed25519.json
node apps/cli/dist/cli.js license issue --org "Law firm" --plan pro --days 365 \
  --features api,watch,presets,whitelabel --key /tmp/neotools-ed25519.json
```

Public key goes into `branding.json` → `licensePubkey` or `license-pubkey.json`. Token via `NEOTOOLS_LICENSE` or the `/lizenz` page (IndexedDB, local verification).

**Free promise:** Community remains fully functional for **all tools** (browser, CLI `run`/`pipeline`). Gates only: REST API, watch automation, team preset enforcement, white-label without "Powered by NeoTools", signed audit export. No phone-home.

## 6. API with curl

```bash
export KEY=dev-key-change-me
curl -sS http://127.0.0.1:8080/api/v1/health
curl -sS -H "Authorization: Bearer $KEY" http://127.0.0.1:8080/api/v1/tools | head
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@a.pdf" -F "files=@b.pdf" -F 'options={}' \
  http://127.0.0.1:8080/api/v1/run/pdf-merge -o merged.pdf
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@in.pdf" \
  -F 'spec={"steps":[{"toolId":"pdf-sanitize","options":{}}]}' \
  http://127.0.0.1:8080/api/v1/pipeline -o out.pdf
# asynchronous
curl -sS -H "Authorization: Bearer $KEY" \
  -F "files=@in.pdf" \
  "http://127.0.0.1:8080/api/v1/run/pdf-sanitize?async=1"
curl -sS -H "Authorization: Bearer $KEY" http://127.0.0.1:8080/api/v1/jobs/<id>
```

Response: single file or ZIP. Report without file contents in `X-NeoTools-Report` (Base64URL JSON). Invalid key → 401, too large → 413.

## 7. Watch folders

CLI (feature `watch`):

```bash
neotools watch ./in --pipeline pipeline.json --out ./out --pattern "*.pdf" --poll 2s
# or --fs-events
```

Idempotency via a hash journal in `out/.neotools-watch.jsonl`, errors go to `out/errors/`. Docker: `--profile watch`.

Web (Chromium): `/watch` — `showDirectoryPicker`, persistent permission, polling, output `neotools-out/`, journal in the history. Firefox/Safari: not supported.

## 8. Reverse proxy / TLS

Terminate TLS in front of nginx (Caddy, Traefik, NPM). Important headers to **pass through or set yourself**:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`
- `Cross-Origin-Resource-Policy: same-origin`
- CSP without third-party hosts (see `deploy/docker/nginx.conf`)

Without COOP/COEP, SharedArrayBuffer/WASM threads may be unavailable.

## 9. Backups

Not needed for the server: **stateless**. No user files, no sessions. Optionally back up: `branding.json`, `presets.json`, license public key, API key file, audit JSONL (`NEOTOOLS_AUDIT_LOG`, hashes/metadata only).

## 10. Data protection (law firms / public authorities)

- Processing in the users' browser or in your own network (API sidecar).
- No upload to NeoTools, no tracking, no CDN runtime.
- The API does not store files; buffers are discarded after the response (tmpfs).
- Audit JSONL contains hash, tool, option keys, duration, status — no contents.
- Community tools are fully usable without telemetry.

## Pricing/plan matrix (proposal)

**Proposal, not a binding offer.**

| Plan       | Price idea                  | Contents                                                   |
| ---------- | --------------------------- | ---------------------------------------------------------- |
| Community  | free                        | All tools locally (web/CLI). No watermark.                 |
| Pro        | per installation / year     | + REST API, watch automation, team preset enforcement      |
| Enterprise | by effort                   | + white-label without footer, signed audit export, support |

Private keys and real licenses do not belong in Git.
