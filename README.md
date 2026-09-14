🇬🇧 English · [🇩🇪 Deutsch](./README.de.md)

# NeoTools

Local tools for PDFs, images, video/audio, speech, office documents, archives, forensics, creator formats and DACH (Germany/Austria/Switzerland) compliance — in the browser, as a CLI, via Docker, as a REST API or as a desktop app.  
No upload, no watermark, no tracking, no CDN runtime dependency.

Repository: <https://github.com/sauerlandtreffi/neotools> · License: MIT

## What it is

NeoTools is an open-source, offline-first toolbox built on a single **isomorphic engine** that runs the same tool definitions in the browser (Web Workers + WASM) and in Node (CLI, REST API, desktop). Where cloud PDF services upload your files to a server, NeoTools processes everything on your own machine.

Differentiators:

- **Isomorphic engine** — one `defineTool` per tool, executed in browser and Node with identical results.
- **Privacy tooling** — Sanitize, metadata removal, redaction with cryptographic-style verification, hidden-data forensics.
- **White-label self-hosting** — `branding.json`, Docker image, nginx with hardened headers.
- **Desktop integration** — Tauri 2 app with file associations and deep links.
- **DACH compliance** — beA/ERV checks, E-Rechnung (ZUGFeRD/XRechnung/Factur-X), GoBD export, GiroCode, RFC 3161 timestamps.

UI language: **German** (no prefix), English under `/en/...`. A unified `/app` workspace (drop zone, history, pipeline builder in one view) is in progress.

## Privacy model

- **No upload.** Every tool runs locally: in a Web Worker in the browser (WASM: qpdf, jSquash, Tesseract.js, FFmpeg, ONNX Runtime) or in-process in Node.
- **No CDN at runtime.** All WASM cores, models and fonts are self-hosted under `apps/web/public/assets/` and `public/tessdata/`; nothing is fetched from jsDelivr, unpkg or Hugging Face at runtime.
- **No analytics, no tracking pixels, no external badges.**
- **The only user-controlled outbound URLs** are TSA endpoints for PAdES/RFC 3161 timestamps, and the desktop update check (opt-in).
- **Local history** (`/verlauf`, `/en/history`) lives in OPFS/IndexedDB and can be wiped completely.
- **Hardened headers**: CSP, COOP/COEP (`credentialless`), Permissions-Policy — identical in `public/_headers`, `vercel.json`, nginx, the E2E server, Astro middleware and Tauri.
- **Fail-closed verification**: redaction verify checks text, raw bytes and ToUnicode maps; a glyph without a ToUnicode entry fails the check instead of passing silently.

Details: [docs/SECURITY-REVIEW.md](./docs/SECURITY-REVIEW.md) (adversarial review, wave 5, F1–F41, no open critical/high findings).

## Tool packs

**235 tools in 10 packs** — state after wave 5 (launch preparation):

| Pack        | Tools | Package                    | Focus                                                                         |
| ----------- | ----: | -------------------------- | ----------------------------------------------------------------------------- |
| `pdf`       |    24 | `packages/tools-pdf`       | Merge, Redact + Verify, Sanitize, OCR, PDF/A, PDF/UA, PAdES, mail merge       |
| `image`     |    35 | `packages/tools-image`     | jSquash codecs, document repair, LUT, film scan, passport photo, SVG tracer   |
| `image-ai`  |     9 | `packages/tools-image-ai`  | ONNX/Transformers.js: background removal, face blur, alt text, easy-read      |
| `office`    |    32 | `packages/tools-office`    | DOCX/XLSX/CSV/e-book/fonts/SQL, SheetJS Community, OFL fonts                  |
| `speech`    |    12 | `packages/tools-speech`    | Whisper locally: transcript, subtitles, chapters, translation                 |
| `media`     |    68 | `packages/tools-media`     | FFmpeg WASM (LGPL build) + WebCodecs: video/audio convert, edit, normalize    |
| `dach`      |    12 | `packages/tools-dach`      | beA/ERV, E-Rechnung, GoBD, GiroCode, RFC 3161                                 |
| `archive`   |    11 | `packages/tools-archive`   | ZIP/TAR native, 7z dynamic, folder conversion, sidecars                       |
| `forensics` |    10 | `packages/tools-forensics` | Identify, hidden data, fake extension, fingerprint, share-safe                |
| `creator`   |    22 | `packages/tools-creator`   | Platform packs, spec check, audiogram, collage, stickers, device mockups      |

Counts come from the registry: `node apps/cli/dist/cli.js list --json`. `audio-stems` stays registered but is not shown in the web grid (no license-clean small model available).

## Usage

### Web

Prerequisite: Node 20+ (developed with Node 22), pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm --filter @neotools/web dev          # http://localhost:4321
pnpm -r build
pnpm -r test
pnpm -r typecheck
node scripts/check-i18n.mjs              # de/en dictionary + categoryLabels must match
```

Root aliases (from `/`):

| Command                                       | Purpose                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                    | Astro dev server for the web app (`@neotools/web`)                      |
| `pnpm build` / `pnpm test` / `pnpm typecheck` | `pnpm -r` across all workspace packages with the respective script      |
| `pnpm lint`                                   | ESLint flat config (root)                                               |
| `pnpm format` / `pnpm format:check`           | Prettier                                                                |
| `pnpm e2e`                                    | Playwright smoke tests against `apps/web/dist` (builds if dist missing) |
| `pnpm cli`                                    | Alias for `apps/cli` (`neotools`)                                       |
| `node scripts/check-i18n.mjs`                 | Fails if the de/en UI dictionary or `categoryLabels` diverge            |
| `node scripts/fetch-ffmpeg-lgpl.mjs`          | Fetches the LGPL FFmpeg core from our own GitHub release (gitignored)   |

Playwright needs Chromium once:

```bash
pnpm --filter @neotools/web exec playwright install chromium --with-deps
```

`--with-deps` installs system libraries (Ubuntu). If that fails: `playwright install chromium` and install missing libs via `apt` (typically `libnss3`, `libnspr4`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libdrm2`, `libxkbcommon0`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libasound2`, `libpango-1.0-0`, `libcairo2`).

The smoke tests run against a small static server (`apps/web/e2e/server.mjs`), not `astro preview`: preview does not apply `public/_headers`. The server sets the same COOP/COEP/`credentialless` headers as nginx / Vercel.

### CLI

```bash
pnpm --filter @neotools/cli build
node apps/cli/dist/cli.js list
node apps/cli/dist/cli.js run pdf-merge a.pdf b.pdf -o out
node apps/cli/dist/cli.js info pdf-sanitize
node apps/cli/dist/cli.js pipeline pipeline.json in.pdf -o out
node apps/cli/dist/cli.js watch ./inbox --tool pdf-sanitize -o ./outbox
```

Every Zod option of a tool becomes a CLI flag; `info <toolId>` prints them.

### API

`apps/api` is a Fastify REST sidecar running the same engine. It is gated behind an offline license (see *License compliance*), listens on `NEOTOOLS_API_PORT` (default 3000) and is normally reached through nginx under `/api/v1/`:

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
```

OpenAPI 3.1 at `/api/v1/openapi.json`, interactive docs at `/api/v1/docs`. Jobs are bound to `sha256(apiKey)`; uploads are streamed with size limits; audit logs contain hashes only.

### Desktop

Tauri 2 app under `apps/desktop` (PDF reader, file associations, `neotools://tool/<kebab>` deep links). See [apps/desktop/README.md](./apps/desktop/README.md). `pnpm --filter @neotools/desktop test` validates `tauri.conf.json`; `cargo build --release` requires rustup + WebKitGTK 4.1.

### Docker

```bash
export NEOTOOLS_BRANDING=$PWD/branding.json
docker compose -f deploy/docker/docker-compose.yml up --build
```

nginx serves the static build with the hardened headers; the Compose profile `api` adds the REST sidecar. Full walkthrough: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Self-hosting & white-label

`branding.json` in the repo root controls name, tagline, logo, colors, `hiddenTools`, `footerLinks`, `legal.*`, `pricing.*`, `contact.*`, `hosting.*`, `desktop.*`, license token and presets. The build reads `NEOTOOLS_BRANDING=/path/branding.json`. Logo path and colors are validated via `safeAssetUrl`/`safeCssColor` (no `javascript:`, no remote logo, no CSS injection). All fields: [docs/BRANDING.md](./docs/BRANDING.md).

Launch pages (all static, content from `branding.json`):

| Page                                                                    | English         | Content                                                                                                        |
| ----------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| `/preise`                                                               | `/en/pricing`   | Community (all tools, free), Pro, Enterprise/Self-Host — prices from `pricing.*`, otherwise "on request"      |
| `/vergleich/ilovepdf`, `/vergleich/smallpdf`, `/vergleich/adobe-acrobat` | `/en/compare/*` | Feature/privacy comparison: local vs. upload, watermarks, limits, licenses                                    |
| `/ueber`                                                                | `/en/about`     | Project, engine, operator (`legal.operator`, `contact.*`)                                                      |
| `/impressum`                                                            | `/en/imprint`   | **Template** for the Impressum (legal notice, § 5 DDG / § 18 MStV) from `legal.*` — empty fields stay visible |
| `/datenschutz`                                                          | `/en/privacy`   | **Template** privacy policy from `legal.*`, `hosting.*`, `desktop.*` (local processing, no uploads)           |
| `/lizenzen`, `/licenses.json`, `/THIRD_PARTY_NOTICES.txt`               | `/en/licenses`  | generated license lists                                                                                        |

Impressum and privacy policy are text templates, **not legal advice** — have them reviewed by a qualified person before launch and set `legal.updated`.

**Free promise:** the Community edition keeps **all tools** fully functional (browser, CLI `run`/`pipeline`). The offline Ed25519 license (`@neotools/license`) gates only platform extras: REST API, watch automation, enforced team presets, white-label without "Powered by NeoTools", signed audit export. No phone-home.

Release flow: tag `v*` → `.github/workflows/release.yml` (web dist, CLI tarball, optional LGPL core, GitHub release with CHANGELOG excerpt); desktop bundles via `desktop.yml` (`desktop-v*`).

## Architecture

```
packages/engine          @neotools/engine          defineTool, registry, pipeline, batch, provenance, team presets
packages/license         @neotools/license         offline Ed25519, gates only for platform extras
packages/parsers         @neotools/parsers         JPEG/PNG/TIFF parsers (shared)
packages/models          @neotools/models          ONNX/Whisper catalog (no CDN)
packages/tools-pdf       @neotools/tools-pdf       24 PDF tools (pdf-lib, pdfjs, qpdf WASM, PAdES, PDF/A, UA)
packages/tools-forensics @neotools/tools-forensics 10 forensics tools
packages/tools-image     @neotools/tools-image     35 image tools (jSquash, own codecs, LUT, film scan, SVG tracer)
packages/tools-image-ai  @neotools/tools-image-ai  9 AI/CV image and a11y tools (ONNX, Transformers.js)
packages/tools-creator   @neotools/tools-creator   22 creator/social tools (built on tools-image + tools-media)
packages/tools-dach      @neotools/tools-dach      12 DACH tools (beA/ERV, E-Rechnung, GoBD, GiroCode)
packages/tools-office    @neotools/tools-office    32 office/e-book/data tools
packages/tools-media     @neotools/tools-media     68 video/audio tools (FFmpeg LGPL build, WebCodecs)
packages/tools-speech    @neotools/tools-speech    12 speech/subtitle tools (Whisper)
packages/tools-archive   @neotools/tools-archive   11 archive/folder tools
packages/plugins/3d-lite @neotools-plugin/3d-lite  community plugin example (manifest, caps sandbox; not registered)
apps/web                 Astro 5 + Preact + Tailwind 4, workers via Comlink (static pages)
apps/cli                 same tool definitions, Zod → flags, watch, license
apps/api                 Fastify REST sidecar (same engine)
apps/desktop             Tauri 2 desktop (PDF reader, file associations, deep link)
deploy/docker            nginx static + optional API, branding.json at build time
```

The engine has no DOM dependency. Platform adapters:

- `platform/browser.ts` — Worker (Comlink), OffscreenCanvas, OPFS flag, `qpdf` + `ocr`
- `platform/node.ts` — fs, optional `@napi-rs/canvas`, `qpdf` + `ocr`

Pipeline: steps `{ toolId, options }`, MIME type check outputs→inputs, JSON and URL hash `#p=<base64url>`. Batch: one broken file does not abort the rest (`ok|error` + reason). Community plugins: [docs/PLUGINS.md](./docs/PLUGINS.md) (loader phase 5 open). Full description: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

### Notable decisions

- **COEP:** `credentialless` instead of `require-corp`, so local workers/WASM do not fail on missing CORP headers.
- **pdf-to-images in Node:** optional `@napi-rs/canvas` (native). If not installed, the tool returns a clear error. In the browser: OffscreenCanvas in the worker. The web build stubs the native module.
- **pnpm 10:** `onlyBuiltDependencies` for `esbuild` and `sharp` (otherwise pnpm skips their postinstall and Vite/Astro break).
- **qpdf WASM:** `@jspawn/qpdf-wasm@0.0.2` (Apache-2.0), compiled ourselves via `WebAssembly.compile` and passed via `instantiateWasm`; fresh Emscripten instance per `callMain` (not re-entrant). Wrapper in `packages/tools-pdf/src/qpdf/`, fallback `@cantoo/pdf-lib` (AES-256). Linearization ("Fast Web View") optional in `pdf-lock` / `pdf-repair` / `pdf-compress`.
- **OCR:** Tesseract.js v7; core WASM and `worker.min.js` are bundled/copied to `apps/web/public/assets/tesseract/` — **no jsDelivr defaults**. `node scripts/fetch-tessdata.mjs` (eng+deu from tessdata_fast) and `node scripts/copy-wasm-assets.mjs` run via `postinstall --optional`. Node needs `NEOTOOLS_TESSDATA` or `apps/web/public/tessdata/`.
- **Password fields:** Zod `.describe('password')` (or a field name containing `password`) → web form `type=password`.
- **No analytics.**

## License compliance

Own code: **MIT** (`LICENSE`).  
Runtime: pdf-lib (MIT), PDF.js (Apache-2.0), qpdf-wasm (Apache-2.0), @cantoo/pdf-lib (MIT), jSquash/mozjpeg/oxipng (Apache-2.0/BSD/MIT), Tesseract.js (Apache-2.0), ONNX Runtime (MIT), Transformers.js (Apache-2.0), Zod, Comlink, fflate, Astro, Preact, Tailwind, @noble/ed25519 (MIT), SheetJS Community (Apache-2.0), OFL fonts (Source Sans/Serif/Code), mp4-muxer (MIT), mp4box.js (BSD-3-Clause). libheif/7z-wasm only loaded dynamically (LGPL).  
**Not used:** Ghostscript, MuPDF, iText (AGPL).

**FFmpeg WASM core:** our own **LGPL-2.1-or-later build** without `--enable-gpl`/x264/x265 (`packages/tools-media/Dockerfile.ffmpeg-lgpl`, `packages/tools-media/scripts/build-ffmpeg-lgpl.sh`, workflow `.github/workflows/ffmpeg-lgpl.yml` → release `ffmpeg-lgpl`). `node scripts/fetch-ffmpeg-lgpl.mjs` stores the artifact gitignored under `packages/tools-media/vendor/ffmpeg-lgpl/`; `scripts/copy-wasm-assets.mjs` copies it to `apps/web/public/assets/ffmpeg/`. The loader prefers the LGPL core. **Only if the artifact is missing** does it fall back to the GPL core from `@ffmpeg/core` — `/lizenzen` labels the actually loaded core dynamically (`getFfmpegCoreFlavor()`). H.264 encoding runs exclusively via WebCodecs + mp4-muxer.

The page `/lizenzen` (`/en/licenses`) aggregates `licenses` of all tools plus platform libraries (`packages/engine/src/licenses.ts`), also as `/licenses.json` and `/THIRD_PARTY_NOTICES.txt`. Rule: every new runtime library is added to the pack's `src/licenses.ts` in the same PR.

SEO routes: `/formats/[id]`, `/convert/[from]-to-[to]`, `/spec/[platform]`, `/guides/[slug]` (24 guides, de + `/en/...`).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) (setup, conventions, how to add a tool or pack, PR checklist). Changes are tracked in [CHANGELOG.md](./CHANGELOG.md); roadmap and backlog in [docs/ROADMAP.md](./docs/ROADMAP.md) and [docs/BACKLOG.md](./docs/BACKLOG.md).

Repository hygiene: `.gitattributes` marks `*.wasm` / `*.pdf` as binary and normalizes text to LF. Ignored: `node_modules/`, `dist/`, `.astro/`, Tauri `target/`/`gen/`, downloaded OCR models (`**/tessdata/*.traineddata*`), copied WASM assets under `apps/web/public/assets/{qpdf,jsquash,tesseract,ffmpeg}/*`, logs, `.env*`, coverage and Playwright reports, OS/editor files.

## Security

Report vulnerabilities as described in [SECURITY.md](./SECURITY.md). The wave 5 adversarial review with fix mandate is documented in [docs/SECURITY-REVIEW.md](./docs/SECURITY-REVIEW.md).

## Status

Waves 1–5 are in `main` (details: [CHANGELOG.md](./CHANGELOG.md), [docs/ROADMAP.md](./docs/ROADMAP.md)). Wave 5 delivered the adversarial security review with fix mandate, the creator pack, new image and media tools, the LGPL FFmpeg build, the launch pages and 24 guides. Capabilities `qpdf`/`ocr` are `true` on both browser and Node platforms; `@napi-rs/canvas` stays optional (OCR raster and pdf-to-images in Node).

In progress: `/app` workspace (drop zone, history, pipeline builder in one view). Open: community plugin loader (phase 5), `audio-stems` model, WebLLM/full-text as showcases, desktop updater signature, veraPDF-equivalent PDF/A validation.

## License

MIT — see [LICENSE](./LICENSE).
