🇬🇧 English · [🇩🇪 Deutsch](./README.de.md)

# NeoTools Self-Hosting (Docker)

Two images:

1. **neotools** — nginx, static Astro output, COOP/COEP/CSP. Browser tools stay local.
2. **api** — Node 22 sidecar (`@neotools/api`), internal network only. Files live in RAM/tmpfs only, nothing is persisted.

## Branding (white-label)

`branding.json` (name, logo path, colors, Impressum (legal notice) text, optional `license`, `licensePubkey`, `presetsPath`, `hiddenTools`) is read **at build time**.

```bash
export NEOTOOLS_BRANDING=/absolute/path/to/branding.json
export NEOTOOLS_LICENSE=   # optional, embedded token
docker compose -f deploy/docker/docker-compose.yml up --build
# http://localhost:8080
```

Fields:

| Field | Meaning |
| --- | --- |
| `name` | Product name in header/title |
| `tagline.de` / `tagline.en` | Subtitle |
| `logo` | Public path (e.g. `/logo.svg`) |
| `colors.primary` / `accent` / `ink` | Theme |
| `impressum` / `privacy` | Texts for `/impressum` and `/datenschutz` |
| `hiddenTools` | Tool IDs that disappear from grid, search, sitemap and command palette. |
| `license` / `licensePubkey` | Offline license (Ed25519). Empty = Community, all tools free. |
| `presetsPath` | Team `presets.json` (signature optional). |
| `showPoweredBy` | `false` only with the `whitelabel` feature. |

Header, footer, theme color, manifest name/colors and the OG image (`/og.svg`) read the same file.

## API (sidecar)

Not published to the host. nginx proxies `/api/` internally to `api:3000`.

Env (see `.env.example`):

- `NEOTOOLS_API_KEYS` — comma-separated or file-based keys
- `NEOTOOLS_MAX_UPLOAD_BYTES`, `NEOTOOLS_MAX_PARALLEL`, `NEOTOOLS_JOB_TIMEOUT_MS`
- `NEOTOOLS_LICENSE` / `NEOTOOLS_LICENSE_PUBKEY` — feature `api` for `/run` and `/pipeline`
- `NEOTOOLS_PRESETS` — server-side team preset (enforced)

## Watch profile

```bash
docker compose -f deploy/docker/docker-compose.yml --profile watch up --build
```

Requires the `watch` feature and a `--pipeline` JSON.

## Headers

nginx sets COOP `same-origin`, COEP `credentialless`, a CSP without external sources, gzip/Brotli. `.wasm` is served as `application/wasm`.
