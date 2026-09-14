🇬🇧 English · [🇩🇪 Deutsch](./ROADMAP.de.md)

# NeoTools Roadmap

Related: [BACKLOG.md](./BACKLOG.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

Phases correspond to `docs/BACKLOG.md`. Another agent owns the code scaffolding; this file is the order of execution.

## Overview

| Phase | Goal | Tools (excluding community) | Dependency |
|---|---|---|---|
| 1 | Core + PDF + redaction + forensics basics + web/CLI/Docker/Tauri | 38 | — |
| 2 | Image core + archives + export pack + screenshot studio | 69 | phase 1 engine |
| 3 | FFmpeg core video+audio, presets, OPFS streaming | 76 | phase 1 engine; reuse image UI |
| 4 | Whisper/WebGPU, office, DACH deepening, WebLLM | 64 | models in Cache Storage; PDF/OCR from 1 |
| 5 | Remaining creator tools, AI showcases, exotic formats, community | 11 (+5 plugins) | usage data before exotic formats |

---

## Phase 1 — Core, PDF, privacy, scaffolding

**Milestone M1:** the user can merge PDFs locally in the browser, via CLI and in the Docker image, redact (click + pattern + NER) with verification, sanitize and run a beA/ERV check. Tauri opens `.pdf`. No upload, no CDN, no tracking.

### Definition of Done phase 1

- [ ] `pnpm` monorepo, TypeScript `strict`, packages as in `ARCHITECTURE.md`
- [ ] `defineTool` + registry + one complete reference tool `pdf-merge`
- [ ] worker pool (Comlink), cancel, progress, error protocol without file contents
- [ ] `Platform` adapters browser and Node
- [ ] pipeline: JSON + URL hash, at least `pdf-merge` → `pdf-sanitize`
- [ ] OPFS + IndexedDB + Cache Storage wired (even if the history UI is still a stub)
- [ ] `privacySensitive` hook + `forensics-verify` after redact/sanitize
- [ ] provenance JSON optionally attached to the output
- [ ] `apps/web`: Astro, i18n de/en, static tool pages from the registry
- [ ] `apps/cli`: `run`, `pipeline`
- [ ] `deploy/docker`: nginx, COOP/COEP/CSP, `/licenses`, `branding.json`
- [ ] `apps/desktop`: Tauri 2 starts, `.pdf` file association, deep-link scheme registered
- [ ] PWA: `file_handlers`, `share_target`, `shortcuts`
- [ ] format KB: schema + entry `pdf` + one `/formats/pdf` page
- [ ] Vitest engine green; Playwright smoke: merge, redact+verify, share-safe
- [ ] golden files for `pdf-merge`, `pdf-split`
- [ ] no AGPL dependency, no CDN runtime, license page lists pdf-lib/pdfjs/qpdf
- [ ] all phase 1 tool IDs from the backlog are registered (UI may show "Beta" for XL tools, `run()` must exist)

### Wave 1 — work packages (1–3 days, parallelizable)

Each WP: own branch, DoD at the end of the block, no "half in another WP". Effort = calendar days of one person.

#### Foundation (engine)

| ID | Work package | Days | Result |
|---|---|---|---|
| WP-01 | Monorepo, `pnpm-workspace`, `tsconfig.base` strict, empty packages `engine` / `tools-pdf` / `format-kb` / `apps/web` / `apps/cli` / `apps/desktop` / `deploy/docker` | 1 | `pnpm -r build` runs (stub exports) |
| WP-02 | `defineTool`, Zod options, registry, pack manifest type, `registerPack` | 1–2 | unit test: duplicate ID throws; `listTools()` sorted |
| WP-03 | `Platform` interface + browser adapter (Blob/OPFS) + Node adapter (`fs`) | 2 | the same 3 tests green on both adapters |
| WP-04 | worker pool Comlink, progress, cancel (`AbortController` + `terminate`), transferables / OPFS path | 2–3 | test: cancel during fake loop aborts; second job starts on a fresh worker |
| WP-05 | error protocol (schema, write, JSON export, no bytes in the log) | 1 | test with a deliberately broken PDF |
| WP-06 | pipeline model: steps, MIME binding, load/save JSON, URL hash encode/decode | 2 | test: incompatible binding is rejected |
| WP-07 | provenance builder + optional manifest at the output | 1 | hash chain input→output in JSON |
| WP-08 | privacy verify hook in the engine (without real OCR yet): interface, mandatory after `privacySensitive` | 1–2 | a tool without a verify callback must not set `shared-safe` when flagged |

#### Surfaces

| ID | Work package | Days | Result |
|---|---|---|---|
| WP-09 | Astro app: layout, i18n de/en, tool page from the registry (Preact island: file input, options form from Zod, progress, download) | 3 | `/de/tools/pdf-merge` and `/en/tools/pdf-merge` prerendered |
| WP-10 | SEO generator: `getStaticPaths` from `seo.path` + `hreflang` | 1 | every registered tool has exactly one canonical URL per locale |
| WP-11 | format KB schema, entry `pdf`, page `/formats/pdf`, stub `/convert` (without matrix yet) | 2 | KB JSON validates against Zod |
| WP-12 | CLI: `neotools run <tool> [zod-flags] files…`, `neotools pipeline file.json`, `neotools list` | 2 | `run pdf-merge a.pdf b.pdf` writes `merged.pdf` |
| WP-13 | Docker: nginx, static assets, headers COOP/COEP/CSP, volume `/assets` | 1–2 | `curl -I` shows COOP/COEP; `/` 200 |
| WP-14 | read `branding.json` + white-label placeholders (name, logo, color); Ed25519 license check as a **stub** (key optional, Community default) | 2 | without a key, Community branding starts |
| WP-15 | PWA manifest: `file_handlers` (.pdf), `share_target`, `shortcuts` (merge, redact, share-safe); service worker shell | 2 | Lighthouse PWA basics; share route accepts a file |
| WP-16 | Tauri 2 shell, window loads web dist, deep link `neotools://`, file association `.pdf` (Linux `.desktop` + Windows stub) | 3 | app starts; double-clicking a PDF opens the reader route |
| WP-17 | license page `/licenses` from pack manifests; CI script `licenses:check` (AGPL fail) | 1 | page lists pdf-lib, pdfjs, qpdf; Ghostscript does not appear |

#### PDF wave

| ID | Work package | Days | Result |
|---|---|---|---|
| WP-18 | `pdf-merge`, `pdf-split`, `pdf-rotate`, `pdf-reorder` | 2 | goldens merge+split; CLI+web |
| WP-19 | `pdf-compress`, `pdf-to-images`, `images-to-pdf` | 2–3 | dpi/quality as Zod options |
| WP-20 | qpdf WASM: `pdf-lock` (encrypt/decrypt, permissions), linearize as an option | 2 | password round-trip test |
| WP-21 | `pdf-watermark` (text/image) + `pdf-forms` (read, fill, flatten) | 2–3 | flatten removes AcroForm |
| WP-22 | `pdf-redact` click rectangles + text search + patterns (IBAN, tax ID, social security no., ID card no., license plate, e-mail, phone) | 3 | pixels **and** text object gone; extract no longer contains hits |
| WP-23 | auto-NER (Transformers.js, small local model) for names + verification UI (checklist of hits) | 3 | verify fails if the box still yields OCR text |
| WP-24 | `pdf-sanitize` + `forensics-share-safe` (orchestration) | 2–3 | JS, attachments, metadata, hidden layers in the report |
| WP-25 | `pdf-ocr` Tesseract.js deu+eng, text layer | 2–3 | searchable PDF, model from `/assets` |
| WP-26 | `pdf-a` convert + validate **without** Ghostscript/MuPDF (pdf-lib + validator WASM or own rule core v1: version, embedding, annotations) | 3 | report lists violations; v1 may honestly say "not PDF/A" instead of false green |
| WP-27 | `pdf-aktenbundler` (case-file bundler): merge + outline + Bates + table-of-contents page | 2–3 | Bates on every page, outline per source |
| WP-28 | `pdf-compare`: text diff PDF + pixel diff preset (`vertrag`) | 3 | two similar texts, diff page produced |
| WP-29 | `pdf-sign`: **verify** signature (browser) + **create** PKCS#12 (CLI/Tauri, not necessarily web) | 3 | fixtures: valid / expired / broken |

#### DACH / forensics basics

| ID | Work package | Days | Result |
|---|---|---|---|
| WP-30 | `dach-bea-erv` rule set v1 (size, PDF version, JS, encrypt, fonts, attachments) as JSON + report | 2 | fixture "unsuitable for beA" turns red |
| WP-31 | `dach-hash-timestamp`: SHA-256 + RFC 3161 client (TSA URL configurable, timeout, attach token) | 2 | without network: hash only; with TSA mock: token present |
| WP-32 | `forensics-identify`, `forensics-autopsy`, `forensics-bytes-compare`, `forensics-hash` | 2 | PDF vs. renamed ZIP detected |
| WP-33 | `forensics-hidden-data` + `forensics-fake-ext` | 2–3 | ZIP-after-JPEG and PDF attachment trigger |
| WP-34 | `forensics-watermark-find` (detection only) + `forensics-fingerprint` | 2 | no "remove" button in the UI |
| WP-35 | real `forensics-verify` (re-extract, patterns, OCR sample) connected to WP-08 | 2 | mandatory path after redact/sanitize |

#### Quality / desktop reader

| ID | Work package | Days | Result |
|---|---|---|---|
| WP-36 | Vitest harness + golden update flag; goldens for merge/split/lock | 1–2 | CI without `GOLDEN_UPDATE` |
| WP-37 | Playwright: three smokes (merge, redact+verify, share-safe), i18n switch | 2 | runs headless in CI |
| WP-38 | desktop reader cut phase 1: display (pdfjs), search, save, jump to `pdf-redact` | 3 | opened `.pdf` is searchable, save writes locally |
| WP-39 | error protocol UI + OPFS history stub (list + download last output, no undo yet) | 2 | journal exportable |

**Ordering note:** WP-01→08 before tool WPs. WP-09 can start in parallel with WP-04 (mock `run`). WP-16/38 after WP-09. WP-23 needs WP-22. WP-35 after WP-23/24.

**Not in wave 1:** form mail merge, PDF/UA repair, E-Rechnung, REST API, WebLLM, FFmpeg, image packs.

---

## Phase 2 — Image, archives, export, screenshot

**Milestone M2:** image converter (wave 2 formats), document photo repair, screenshot studio, export pack presets, archive round-trip. All local, jSquash/heic/UTIF self-hosted.

### Definition of Done phase 2

- [ ] `packages/tools-image` and `tools-archive` lazily loaded
- [ ] `image-convert` for the wave 2 formats named in the backlog (without PSD/EXR/DDS/XWD/JP2/RAW development)
- [ ] `image-doc-repair` with presets scanner / whiteboard / kinderzeichnung (child's drawing) / moire / notiz-ocr
- [ ] `image-screenshot-studio` with all eight presets
- [ ] `creator-export-pack` reads sizes from the format KB
- [ ] OpenCV.js only lazily on the document photo page
- [ ] archive create/extract/inspect for ZIP + at least one 7z/TAR path
- [ ] `platform-folder-convert` + `platform-watch` (FSA and CLI)
- [ ] OPFS history with undo (one step)
- [ ] Playwright: convert PNG→WebP, doc-repair, export-pack favicon
- [ ] no exotic formats in the UI except a "not supported" hint

### Milestones phase 2 (no 1-day WPs, rough)

1. Image I/O + compress/resize/crop/adjust/metadata  
2. Doc repair + screenshot studio + auto-blur + verify  
3. Export pack + spec check + sticker set  
4. Archive suite + sidecar matching (without RAW develop)  
5. Folder convert, watch, undo  

---

## Phase 3 — FFmpeg (video + audio)

**Milestone M3:** an LGPL ffmpeg.wasm in Cache Storage; video and audio convert; simple filters only as presets on the core; large files streamed via OPFS. H.264 encoding only via WebCodecs, otherwise VP9/AV1 or a clear refusal.

### Definition of Done phase 3

- [ ] ffmpeg.wasm **LGPL build** documented in the repo (configure flags, no x264/x265)
- [ ] `video-convert`, `video-edit`, `audio-convert`, `audio-edit` as the only filter carriers
- [ ] all 18 backlog FFmpeg presets as preset IDs, not as separate routes
- [ ] `media-fit` binary search for target size
- [ ] `platform-stream-opfs` for files above the RAM threshold
- [ ] `/licenses` lists LGPL FFmpeg + note on H.264/WebCodecs
- [ ] Playwright: trim + remux (where the fixture is small enough)
- [ ] Whisper-dependent video tools do **not** exist yet (phase 4)

### Milestones phase 3

1. WASM build, loader, OPFS streaming  
2. Video I/O + remux/trim/concat/extract  
3. Filter core + preset table  
4. Audio I/O + normalize/join/silence  
5. Repair, HDR presets, scene detect, epilepsy report  

---

## Phase 4 — Speech, office, DACH deepening

**Milestone M4:** Whisper locally (WebGPU), subtitle chain, validate/generate E-Rechnung, PDF/UA check, team presets, optional REST API, WebLLM chat against local PDFs.

### Definition of Done phase 4

- [ ] `speech-transcribe` with selectable model; models same-origin
- [ ] jump cut / auto chapters / OCR subs hang off Whisper, no second engine
- [ ] office: DOCX, XLSX (**SheetJS Community**), EPUB unpack
- [ ] `dach-erechnung-validate` + `generate` (ZUGFeRD/XRechnung/Factur-X)
- [ ] `pdf-ua` checks; repair best-effort, no false green
- [ ] `platform-rest-api` sidecar only in the Docker Compose profile `api`
- [ ] `platform-fulltext` via OPFS (FlexSearch or SQLite WASM)
- [ ] WebLLM behind `speech-chat-doc`, default model documented
- [ ] team presets JSON locks tools / sets defaults
- [ ] benchmark **not** needed (phase 5)

### Milestones phase 4

1. Whisper + subtitle edit + translate  
2. Speech-dependent video/audio tools  
3. Office pack  
4. E-Rechnung + receipts + GoBD + GiroCode  
5. PDF/UA, mail merge, inbox pipeline, API, full text, WebLLM  

---

## Phase 5 — Creator, showcases, community

**Milestone M5:** plugin loader, two showcases (super-resolution, denoise) clearly labelled as demos, extension optional, exotic formats only if telemetry/usage data (self-hosted counts) show demand.

### Definition of Done phase 5

- [ ] community manifest loader, sandbox: no `platform` except declared caps
- [ ] `image-superres` and `image-denoise` one page each, banner "Showcase"
- [ ] `community-exotic` behind a feature flag, default off
- [ ] no ROM header, inpainting watermark or CLIP tools in the core
- [ ] `platform-benchmark` measures worker/WASM/WebGPU on an internal page
- [ ] browser extension shares the registry, no second tool implementation

---

## Cross-cutting (all phases)

| Topic | Rule |
|---|---|
| License | every new pack updates manifest + `/licenses` in the same PR |
| i18n | no hard-coded German UI text without an `en` counterpart |
| Tests | new tool: at least 1 Vitest + golden, or explicit justification (lossy → metric band) |
| SEO | no `/convert/a-to-b` page without a KB edge and a tool |
| Privacy | register new privacy ops with the verify hook |
| Models | file name contains the content hash; the service worker cache-busts on it |

---

## Wave 1 list (copy template)

1. WP-01 monorepo + empty packages  
2. WP-02 tool schema + registry  
3. WP-03 platform browser/Node  
4. WP-04 worker pool + cancel + progress  
5. WP-05 error protocol  
6. WP-06 pipeline + URL hash  
7. WP-07 provenance  
8. WP-08 verify hook (interface)  
9. WP-09 Astro + i18n + tool island  
10. WP-10 SEO paths  
11. WP-11 format KB + `/formats/pdf`  
12. WP-12 CLI `run` / `pipeline` / `list`  
13. WP-13 Docker nginx + headers  
14. WP-14 branding + license stub  
15. WP-15 PWA manifest + SW  
16. WP-16 Tauri 2 + file association + deep link  
17. WP-17 license page + AGPL CI  
18. WP-18 pdf-merge/split/rotate/reorder  
19. WP-19 compress + raster I/O  
20. WP-20 qpdf lock/unlock  
21. WP-21 watermark + forms  
22. WP-22 redact click + patterns  
23. WP-23 NER + verification UI  
24. WP-24 sanitize + share-safe  
25. WP-25 OCR deu+eng  
26. WP-26 PDF/A without AGPL  
27. WP-27 case-file bundler (Aktenbundler)  
28. WP-28 compare text+pixels  
29. WP-29 verify PAdES / PKCS#12 (CLI/desktop)  
30. WP-30 beA/ERV v1  
31. WP-31 hash + RFC 3161  
32. WP-32 identify / autopsy / bytes / hash  
33. WP-33 hidden data + fake ext  
34. WP-34 watermark find + fingerprint  
35. WP-35 wire verify for real  
36. WP-36 Vitest + goldens  
37. WP-37 Playwright smokes  
38. WP-38 desktop reader display/search/save  
39. WP-39 journal UI + history stub  

Waves 1–3 (WP-16–38, packs pdf/forensics/image/image-ai, format KB, desktop reader, QA) are contained in the commits up to `f99d54f`/`97c3ffa`/`2f43d07`/`626240d`.

## State after wave 4

Wave 4 packs and platform are wired. **187 tools** (web grid 186 — `audio-stems` registered but hidden). Previous WP status blocks are merged here.

| Pack | Tools | Note |
|---|---|---|
| pdf | 24 | incl. mail merge, UA, attachment stamp |
| forensics | 10 | phase 1 complete |
| image | 17 | jSquash, HEIC dynamic LGPL |
| image-ai | 7 | ONNX/Transformers, showcases without quality promise |
| dach | 12 | E-Rechnung TS rules, GoBD, team presets tool |
| office | 32 | no LibreOffice WASM; OFL fonts |
| media | 62 | `video-cutlist` new; browser loads the FFmpeg core in-process (no nested worker). WASM core **GPL temporarily** — Docker LGPL build failed (`EM_TOOLCHAIN_FILE`); GH workflow `ffmpeg-lgpl.yml` + `scripts/fetch-ffmpeg-lgpl.mjs` |
| speech | 12 | Whisper locally; `transcript-edits` → `video-cutlist`, bleep list → `audio-bleep` |
| archive | 11 | ZIP/TAR native; 7z-wasm LGPL dynamic |

**Platform:** REST API (`apps/api`), offline license (`@neotools/license`, gates only api/watch/presets/whitelabel/audit), team presets in web/CLI/API, watch CLI+`/watch`, pipeline builder with five library presets, desktop updater/deep link/menu, `docs/DEPLOYMENT.md`.

Pack commits: `bd5d049` office, `21d6a16` speech, `4d3b6b1` media, `53761f3` dach/pdf/archive.

**Open for wave 5**

- Use the LGPL FFmpeg WASM artifact from Docker/GH release (core > 2 MB, gitignored); until then source-code offer + GPL note on `/lizenzen`.
- `audio-stems`: no compact MIT/Apache ONNX model.
- HEIC decode in Node without optional libheif; SVG raster without `@resvg` stays browser-only.
- PDF/A honest subset (no veraPDF); PDF/UA without real MCIDs; PAdES TSA only with a URL.
- WebLLM/`speech-chat-doc`, full-text OPFS, super-resolution/denoise remain showcases.
- Desktop updater pubkey and signed bundles are placeholders (`createUpdaterArtifacts` off).

## State after wave 5 (2026-09-14)

Wave 5 = security review with fixes, creator pack, image/media gaps, LGPL FFmpeg build, launch pages. **235 tools** in ten logical packs (registry `node apps/cli/dist/cli.js list --json`; web grid without `audio-stems`).

| Pack | Tools | New in wave 5 |
|---|---|---|
| pdf | 24 | redact/verify hardening (form XObjects, TJ, AP streams, outline/XMP/StructTree, rewrite), sanitize hardening |
| forensics | 10 | — |
| image | 35 | burst-best, color-transfer, film-scan, geotag-export, hdr-tonemap, hidden-layer-check, icc, line-art, live-photo, lut, normal-map, passport, pixel-art, red-eye, scopes, seamless-texture, sort-by-date, to-svg … |
| image-ai | 9 | `a11y-easy-read`, `a11y-sign-friendly` (plus background removal, face blur, object detection, alt text, super-res/denoise showcases) |
| creator | 22 | own package `packages/tools-creator`; category "Creator & Social" |
| dach | 12 | — |
| office | 32 | — |
| media | 68 | +6: audio-click-track, audio-spatial-flatten, video-360-reframe, video-chroma-key, video-highlight-reel, video-smart-reframe; **LGPL core** (own build) |
| speech | 12 | — |
| archive | 11 | zip-slip/bomb hardening |

**LGPL FFmpeg:** `packages/tools-media/Dockerfile.ffmpeg-lgpl` (derived from ffmpegwasm/ffmpeg.wasm v0.12.10, without `--enable-gpl`/x264/x265; libvpx, opus, vorbis, lame, libass+freetype+fribidi+harfbuzz, zlib, native AAC/FLAC/PCM, 436 LGPL filters; patch `-sSTACK_SIZE=5MB` against VP9 stack overflow). Artifact `vendor/ffmpeg-lgpl/{ffmpeg-core.js,ffmpeg-core.wasm,BUILD-INFO.json,LICENSE.txt}` (gitignored, ~23.7 MB), copied to `apps/web/public/assets/ffmpeg/lgpl/`. Loader prefers the LGPL core (Node: vendor path, browser: `/assets/ffmpeg/lgpl/`), fallback `@ffmpeg/core` labelled `GPL-2.0-or-later (temporary)`. CI: `.github/workflows/ffmpeg-lgpl.yml` + `scripts/fetch-ffmpeg-lgpl.mjs`.

**Security:** `docs/SECURITY-REVIEW.md` — findings F1 ff. with fix/limit; adversarial Vitest suites for redact, sanitize, license, API, archives, web; Playwright network whitelist across all static and tool pages; redact attack case (form XObject) in E2E.

**Launch:** start page (counter from the registry, packs, desktop, self-hosting), `/preise` · `/en/pricing`, `/vergleich/{ilovepdf,smallpdf,adobe-acrobat}` · `/en/compare/*` (as-of date in `LandingCompareData.ts`), `/ueber` · `/en/about`, `/impressum` · `/datenschutz` as templates from `branding.json` `legal.*` (§ 5 DDG / § 18 MStV, "not legal advice"), 24 guides de+en, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/PLUGINS.md`, `docs/BRANDING.md`, `.github/workflows/release.yml`, `scripts/check-i18n.mjs`.

**Community:** `packages/plugins/3d-lite` as a plugin example (manifest, caps, licenses) — without a runtime loader.

### Open after wave 5

- `/app` workspace (drop zone, history, pipeline builder in one view) — in progress.
- Community plugin loader + sandbox (DoD phase 5), `community-exotic` behind a feature flag.
- `audio-stems` hidden (no license-clean compact model); WebLLM/`speech-chat-doc`, super-resolution/denoise remain showcases.
- LGPL core: MT variant (`FFMPEG_MT`) not built; GPL filters (`hqdn3d`, `cropdetect`, `eq`, `boxblur`, `delogo`, `mpdecimate`) and H.264 encoder missing (H.264 in the browser via WebCodecs).
- Redact limits: CID fonts without ToUnicode (verify reports red), Type3/clipped text only via raster fallback, OCR only via `ocrScanned`.
- License: no trusted clock (grace 24 h), desktop updater pubkey placeholder.
- Comparison pages: facts as of the stated date, review yearly. Legal texts: templates, have them legally reviewed before launch.
- `docs/BACKLOG.md` column *Status*: 164 rows `open` (many are presets/merges under another ID).
