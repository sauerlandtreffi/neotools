🇬🇧 English · [🇩🇪 Deutsch](./CHANGELOG.de.md)

# Changelog

All notable changes to NeoTools are documented in this file.

The format follows [Keep a Changelog 1.1](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/). Until the first `v*` tag, sections are organized by
development waves (commit hashes in parentheses, branch `main`).

## [Unreleased]

- Documentation is now English-first; German versions live next to each file as `*.de.md`.
- `/app` workspace (drop zone, history, pipeline builder in one view) in progress.
- References to former reference sites and the corresponding comparison page removed.

## [Wave 5] - 2026-09-14

Launch preparation (commits `fix(security)`, `feat(creator)`, `feat(media): lgpl ffmpeg`, `docs(launch)`, `chore: wave 5 wiring` — see `git log` for hashes). Adversarial security review with fix mandate, creator pack,
new image/media tools, own LGPL FFmpeg build, launch pages, guides.

### Added

- **Creator pack** `packages/tools-creator`: platform pack, spec check, thumbnail factory,
  contact sheet, brand kit, audiogram, lyric video, karaoke, meme captions, meme ratios, before/after,
  podcast video, intro/outro, sticker set, cinemagraph, collage, timelapse, movie barcode, storyboard PDF,
  social card, device mockup, sprite sheet and more; built on `tools-image` and `tools-media`.
- **Image tools**: `image-burst-best`, `image-color-transfer`, `image-film-scan`,
  `image-geotag-export`, `image-hdr-tonemap`, `image-hidden-layer-check`, `image-icc`, `image-line-art`,
  `image-live-photo`, `image-lut`, `image-normal-map`, `image-passport`, `image-pixel-art`, `image-red-eye`,
  `image-scopes`, `image-seamless-texture`, `image-sort-by-date`, `image-to-svg` (own contour tracer, MIT).
- **Media tools** (`media` now 68): `audio-click-track`, `audio-spatial-flatten`, `video-360-reframe`,
  `video-chroma-key`, `video-highlight-reel`, `video-smart-reframe`.
- **A11y tools** in `tools-image-ai`: `a11y-easy-read`, `a11y-sign-friendly`.
- **Community plugin example** `packages/plugins/3d-lite` (`manifest.json`, `neotoolsPlugin` in
  `package.json`, caps sandbox, license list; `gltf-inspect` stub, not registered in core).
- **LGPL FFmpeg core, own build:** `packages/tools-media/Dockerfile.ffmpeg-lgpl`,
  `packages/tools-media/scripts/build-ffmpeg-lgpl.sh`, workflow `.github/workflows/ffmpeg-lgpl.yml`
  (artifact + release `ffmpeg-lgpl`), `scripts/fetch-ffmpeg-lgpl.mjs`. The artifact is stored gitignored under
  `packages/tools-media/vendor/ffmpeg-lgpl/`. The loader prefers the LGPL core, with fallback to the GPL core from
  `@ffmpeg/core` and dynamic labelling on `/lizenzen` (`getFfmpegCoreFlavor()`).
- **Launch pages:** `/preise` · `/en/pricing`, `/vergleich/{ilovepdf,smallpdf,adobe-acrobat}` ·
  `/en/compare/*`, `/ueber` · `/en/about`, `/impressum` · `/datenschutz` (templates from `branding.json`
  `legal.*`, `hosting.*`, `desktop.*`; empty fields remain visible placeholders).
- **Guides:** 24 how-tos in de + en under `apps/web/src/content/guides/` (`/guides/[slug]`, `/en/guides/*`).
- `scripts/check-i18n.mjs`: fails if de/en dictionary keys or `categoryLabels` diverge.
- `branding.json`: new blocks `legal`, `pricing`, `contact`, `hosting`, `desktop`, `footerLinks`,
  `showPoweredBy`.
- New tests: `pdf-redact-adversarial`, `pdf-sanitize-adversarial`, license tamper tests, API job isolation,
  archive path attacks, `apps/web/test/security-wave5.test.ts`, Playwright `network-whitelist.spec.ts`
  (all dist pages + 10 % of `formats`/`convert`, foreign origins abort), `wave5.spec.ts` (launch pages,
  creator run, redact attack case form XObject), LGPL core test `packages/tools-media/test/lgpl-core.test.ts`
  (VP9/Opus/MP3/AAC/loudnorm/subtitles/GIF), Rust tests `valid_deep_link`.
- `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/PLUGINS.md`, `docs/BRANDING.md`,
  release workflow `.github/workflows/release.yml` (tag `v*`: build/test/typecheck/lint, web dist and
  CLI tarball, optional LGPL FFmpeg core from the `ffmpeg-lgpl` release, GitHub release with CHANGELOG excerpt).
- `docs/BACKLOG.md`: **Status** column (derived from the registry) + section "State after wave 5".

### Changed

- FFmpeg license entry is now dynamic (`MEDIA_LICENSES` / `refreshMediaLicenses()`), depending on the
  loaded core.
- `pdf-redact` rewrites documents completely (`savePdfRewritten`, no object streams, no
  incremental update); verify checks text, raw bytes and ToUnicode fail-closed.
- Verify reports carry `warnings[]` and `advisory` checks; the UI no longer shows a silent green.
- Service worker caches only the precache, `/_astro` and `/assets` (no cache-all GET).
- `docs/ROADMAP.md`: "State after wave 5" + "Open after wave 5"; `README.md`/`docs/ARCHITECTURE.md` at
  launch state (235 tools, 10 packs).
- License manifests: `@ffmpeg/util` and `@ffmpeg/core-mt` added; `/lizenzen` explains the FFmpeg core depending on
  the loaded flavor (own LGPL build vs. temporary GPL).
- LGPL core linked with `-sSTACK_SIZE=5MB`: the 64 KB default of emsdk ≥ 3.1.27 crashes the libvpx VP9 encoder
  with "memory access out of bounds" (reproducible with the official `@ffmpeg/core` 0.12.10 as well).
- `/en/preise`, `/en/ueber`, `/en/vergleich/*` redirect stubs removed (the locale switch knows the target paths).

### Fixed

- `assessExtension` detects file types independently of the extension (magic + markup).
- History: IndexedDB settings are actually removed on "Delete" (`deleteDatabase`).
- Download file names and Markdown output are escaped (DOMPurify `FORBID`).
- `creator-sprite-sheet`: default `columns=0` (auto) violated `min(1)` — the tool crashed with default options.
- `creator-cinemagraph`: missing `-map [v]` (FFmpeg exit 234), triple decoding, `zoompan` path.
- `datenschutz.astro`/`en/privacy.astro`: `{'\n'}` expression and template-literal ternary crashed the
  Astro compiler (web build red).
- `scripts/check-i18n.mjs`: counted the locale keys `de`/`en` themselves as a category.

### Security

Summary from `docs/SECURITY-REVIEW.md` (F1–F41 in two passes; 3 critical, 9 high, 18 medium,
11 low — all fixed, residual risks documented as limits 1–11):

- **API (F1, F7, F10–F12, F23):** jobs bound to `sha256(apiKey)` (404 for foreign keys), constant-time
  key comparison, `safeDownloadName` against `../` in ZIP names, upload as stream with `Content-Length` and
  multipart limit, 16-byte CSPRNG job IDs, security headers + `NEOTOOLS_CORS_ORIGINS`, audit with hashes only.
- **Desktop (F2, F20):** file I/O only via allowlist (dialog, argv, file association); no `fs:allow-all`;
  deep link only `neotools://tool/<kebab>`.
- **PDF redact/verify (F3, F4, F17):** rewrite without unused streams; TJ kerning, form XObjects,
  AP streams, outline/XMP/StructTree `ActualText` are scrubbed; glyphs without ToUnicode ⇒ verify **fail**;
  pixel skip is advisory instead of green.
- **PDF sanitize (F5):** `/AA`, `OpenAction`, XFA, `Launch`/`URI`/`SubmitForm`, RichMedia, `PieceInfo`,
  thumbs removed; keyword scan outside of streams.
- **License (F6, F13, F22):** without a pubkey always Community; `alg=none` and non-canonical JSON rejected;
  `hasFeature` fail-closed; `issuedAt` > 24 h in the future ⇒ invalid; verify on every IndexedDB load.
- **Archives (F8, F18):** zip bomb (ratio + size) aborts, TAR sym-/hardlinks skipped,
  NFC/case path collisions detected, glob length limited (ReDoS).
- **Web (F9, F14–F16, F19, F21, F24):** pipeline import via `sanitizePipelineSteps` (tool whitelist, no
  `__proto__`), SW without user cache, magic-based type check, HTML escaping, `safeAssetUrl`/`safeCssColor`
  for branding, IDB reset, CSP/COOP/COEP/Permissions-Policy identical in `_headers`, `vercel.json`, nginx,
  E2E server, Astro middleware and Tauri.
- **Second pass (F25–F41):** annotation strings/AP streams are scanned and scrubbed (F25/F27/F28),
  real incremental-update attack in the test (F26), sanitize removes page/field `/AA` and outline launch also
  in "keep comments" mode (F29), byte scan with token boundaries (F30), license grace only with a valid
  signature (F31), rate limit per IP instead of per guessed key (F32), job eviction + strict owner check (F33),
  CORS preflight/error texts/timeouts (F34), zip bomb detected before inflate via central directory + `gunzipLimited`
  (F35), TAR prefix/device entries (F36), pipeline import with depth/size/hash limit (F37), SW origin guard
  (F38), Tauri CSP parity (F39), dist-based network whitelist (F40), browser verify with metadata hits
  (F41).
- Network sweep: all runtime sources same-origin; the only user URLs are TSA endpoints (PAdES, RFC 3161).

## [Wave 4] - 2026-09-14

Office, speech, media, DACH deepening, archives, platform (`bd5d049`, `21d6a16`, `4d3b6b1`, `53761f3`,
`89771bd`, `28371d1`, `e9f73a8`).

### Added

- **Office pack** `packages/tools-office` (32 tools): DOCX/XLSX/CSV/JSON/YAML/Markdown/e-book/font/code/SQL —
  SheetJS Community, mammoth, parse5, Papa Parse, KaTeX, bwip-js, sql.js, fonteditor-core, wawoff2,
  OFL fonts (Source Sans/Serif/Code). No LibreOffice WASM.
- **Speech pack** `packages/tools-speech` (Whisper locally, `@neotools/models`): transcription, subtitles,
  translation (OPUS-MT), chapters, summary, diarization, bleep list → `audio-bleep`,
  `transcript-edits` → `video-cutlist`.
- **Media pack** `packages/tools-media` (FFmpeg WASM + WebCodecs): video/audio convert, edit, trim, concat,
  remux, normalize, presets, `media-fit`, `video-cutlist`; H.264 only via WebCodecs/`mp4-muxer`.
- **Archive pack** `packages/tools-archive` (11 tools): ZIP/TAR native, 7z-wasm dynamic (LGPL), inspect,
  sidecar matching, folder conversion.
- **DACH/PDF:** validate/generate E-Rechnung (ZUGFeRD/XRechnung/Factur-X), receipts, GoBD export, GiroCode,
  PDF/UA check, mail merge, attachment stamp, team presets tool.
- **Platform:** REST API `apps/api` (Fastify, Compose profile `api`), offline license `@neotools/license`
  (Ed25519, gates only for api/watch/presets/whitelabel/audit), team presets in web/CLI/API, `watch` in CLI and
  `/watch`, pipeline builder with five library presets, desktop updater/deep link/menu,
  `docs/DEPLOYMENT.md`.
- `scripts/fetch-ffmpeg-lgpl.mjs` and workflow `ffmpeg-lgpl.yml` (build attempt; core still GPL in wave 4).

### Changed

- License page lists the FFmpeg core as GPL-2.0-or-later (temporary) with a source-code note.
- `docs/ROADMAP.md`: state after wave 4 (187 tools, nine packs).

## [Wave 3] - 2026-09-14

Image packs, DACH basics, PDF deepening, format knowledge base (`97c3ffa`, `2f43d07`, `626240d`, `d774f77`,
`103f7ae`).

### Added

- **Image pack** `packages/tools-image` (jSquash codecs JPEG/PNG/WebP/AVIF/JXL/oxipng, GIF, TIFF, HEIC
  dynamic LGPL): convert, compress, resize, crop, adjust, metadata, document repair, screenshot studio.
- **AI/CV pack** `packages/tools-image-ai` (ONNX Runtime, Transformers.js): remove background, blur
  faces, object detection, alt text, super-resolution/denoise as showcases.
- **DACH pack** `packages/tools-dach`: beA/ERV check, hash + RFC 3161, team presets.
- **PDF:** `pdf-compare` (text + pixels), PDF/A (honest subset without veraPDF), `pdf-aktenbundler`
  (case-file bundler: outline, Bates numbering, table of contents), `pdf-sign` (verify PAdES, create PKCS#12).
- **Web:** format knowledge base, SEO routes `/formats/[id]`, `/convert/[from]-to-[to]`, `/spec/[platform]`,
  `/guides/[slug]`; local history `/verlauf`; `/lizenzen`, `/licenses.json`, `/THIRD_PARTY_NOTICES.txt`.
- `packages/parsers` (JPEG/PNG/TIFF parsers, shared between packs).

### Fixed

- pdf.js `workerSrc` in the tool worker (`d774f77`).

## [Wave 2] - 2026-09-14

PDF expansion within the initial commit (`619e3f1`) and QA scaffolding (`f99d54f`).

### Added

- `pdf-lock` (qpdf WASM, AES-256 fallback `@cantoo/pdf-lib`), `pdf-repair`, `pdf-compress` with optional
  linearization, `pdf-ocr` (Tesseract.js deu+eng, self-hosted `tessdata`), `pdf-forms` (read, fill,
  flatten).
- Playwright smoke tests against a static server with COOP/COEP headers, ESLint flat config, CI workflow `ci.yml`.

### Changed

- `pdf-organize` → `pdf-reorder`; capabilities `qpdf`/`ocr` `true` on browser and Node platform.

## [Wave 1] - 2026-09-14

Initial monorepo state (`619e3f1`).

### Added

- pnpm monorepo, TypeScript strict, `packages/engine` (`defineTool`, registry, pipeline with URL hash, batch,
  provenance, error protocol, verify hook), platform adapters browser/Node, worker pool (Comlink).
- **PDF pack:** merge, split, rotate, reorder, to-images, images-to-pdf, watermark, redact (click, pattern,
  NER), sanitize.
- **Forensics pack** (10 tools): identify, autopsy, bytes-compare, hash, hidden-data, fake-ext, watermark-find,
  fingerprint, verify, share-safe.
- `apps/web` (Astro 5 + Preact + Tailwind 4, i18n de/en, PWA), `apps/cli` (`run`, `pipeline`, `list`,
  `info`), `apps/desktop` (Tauri 2, file associations, deep link), `deploy/docker` (nginx, COOP/COEP/CSP,
  `branding.json`).
- License page from pack manifests; no AGPL dependency, no CDN runtime, no tracking.

[Unreleased]: ./CHANGELOG.md#unreleased
[Wave 5]: ./docs/SECURITY-REVIEW.md
[Wave 4]: ./docs/ROADMAP.md#state-after-wave-4
[Wave 3]: ./docs/ROADMAP.md
[Wave 2]: ./README.md#status
[Wave 1]: ./docs/ROADMAP.md#phase-1--core-pdf-privacy-scaffolding
