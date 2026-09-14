🇬🇧 English · [🇩🇪 Deutsch](./SECURITY-REVIEW.de.md)

# Security Review — Wave 5 (adversarial, with fix mandate)

Date: 2026-09-14. Scope: pdf-redact/verify, pdf-sanitize, license, API, archives, web headers/SW/pipeline, network, desktop.

Second pass (same day): every claim of the first pass was checked against code **and** tests.
Where a test was green without actually modelling the attack (F26), the test was rebuilt into a real
attack and the implementation repaired. New findings from F25 onwards.

## Findings by severity

| Severity | Count (total) | fixed | documented limit |
|---|---|---|---|
| critical | 3 (F1–F3) | 3 | 0 |
| high | 9 (F4–F9, F25, F29, F35) | 9 | residual risks → limits 1, 6, 7 |
| medium | 18 (F10–F18, F26–F28, F31–F33, F36, F37, F41) | 18 | limits 8, 9, 10 |
| low | 11 (F19–F24, F30, F34, F38–F40) | 11 | limit 11 |

## Findings

| ID | Severity | Area | Repro | Fix | Residual |
|---|---|---|---|---|---|
| F1 | critical | API jobs | `GET /jobs/:id` with another key | bind job to `sha256(apiKey)`; 404 otherwise | — |
| F2 | critical | Desktop | `read_file`/`save_file` with arbitrary path | allowlist: dialog, argv, association | — |
| F3 | critical | PDF redact | unused streams / incremental update keep plaintext | `savePdfRewritten` (new doc, `useObjectStreams: false`) | — |
| F4 | high | PDF redact | TJ kerning, form XObject, AP streams, outline, XMP, StructTree `ActualText` | stream rewrite incl. TJ join, AP, meta walk, struct/XMP scrub | glyphs without ToUnicode: verify **fail** + warning |
| F5 | high | PDF sanitize | `/AA`, XFA, URI/Launch/SubmitForm, RichMedia, raw bytes | strip + byte scan outside streams | keyword in compressed stream body only after inflate |
| F6 | high | License | token without pubkey / `payloadFromResult` on fail | Community, never Pro; `hasFeature` fail-closed | no trusted clock |
| F7 | high | API auth | `Set.has` not constant-time; file names `../` in ZIP | `timingSafeEqual`; `safeDownloadName` | — |
| F8 | high | Archive | zip bomb only a warning; TAR symlink | ratio+size → abort; type 1/2 skipped | 7z via optional WASM |
| F9 | high | Web pipeline | hash import without tool whitelist / `__proto__` | `sanitizePipelineSteps` | — |
| F10 | medium | API upload | `toBuffer()` before limit | stream + `Content-Length` + multipart `fileSize` | — |
| F11 | medium | API | predictable job IDs | 16-byte CSPRNG | — |
| F12 | medium | API | no security headers / CORS | headers + `NEOTOOLS_CORS_ORIGINS` | — |
| F13 | medium | License | `alg=none` JWT; non-canonical JSON | reject | — |
| F14 | medium | Web SW | cache-all GET | precache + `/_astro` + `/assets` only | — |
| F15 | medium | Web | `assessExtension` bypass by renaming | magic + markup independent of extension | — |
| F16 | medium | Web | download file name / Markdown | escape + DOMPurify FORBID | — |
| F17 | medium | PDF verify | pixel skip `passed: true` | advisory + `warnings[]`, UI not silently green | Node without canvas: warning |
| F18 | medium | Archive | case/Unicode collision, glob ReDoS | NFC+case key; glob length | — |
| F19 | low | Branding | `javascript:` logo, CSS injection | `safeAssetUrl` / `safeCssColor` | — |
| F20 | low | Desktop | deep link unvalidated | only `neotools://tool/<kebab>` | — |
| F21 | low | History | IDB settings after `clear` | settings store + `deleteDatabase` | — |
| F22 | low | License | `issuedAt` in the future | fail-closed (>24h) | — |
| F23 | low | API audit | file names | hashes only (unchanged) | — |
| F24 | low | CSP | `vercel.json` without Permissions-Policy | added; nginx/`_headers`/Astro middleware identical | `unsafe-inline` for Astro hydration |
| **F25** | **high** | PDF redact | IBAN **only** in an annotation (`/Contents`, `/RC`, `/Subj`, `/T`, popup) or AP stream: pdf.js text extraction does not see it → no hit → no scrub, raw bytes/AP keep the IBAN. Verify equally blind to AP text (false green). | `collectMetaHits()` scans Info/Outline/StructTree/XMP/annotations/AP streams with the patterns and produces hits (page 0 or annotation page); `collectAppearanceText()` feeds into `verify :meta` | AP hex strings without font mapping are read as Latin-1 |
| **F26** | **medium** | PDF redact (test) | the "incremental update" test created an **unregistered** flate stream → never landed in the file, precondition wrong, the test would never have checked an attack | test now builds a real `/Prev` update section with an orphaned, uncompressed stream; additional verify-fail test (`:incremental`, `:bytes`) | — |
| **F27** | **medium** | PDF redact | rewrite of form XObjects/AP streams discarded dict keys (`Subtype`, `Matrix`, `Group`, `FormType`) → renderer may ignore the form; AP stream resources (nested XObjects) were not rewritten | `copyStreamDict()` keeps all keys except encoding; AP → `rewriteXObjectForms` recursively; test "two levels deep" | — |
| **F28** | **medium** | PDF verify | `pagesMissingToUnicode` ignored Type3 and fonts in AP streams | Type3 always reported; AP resources walked; test | Type3 page without canvas stays **fail** (honestly red) |
| **F29** | **high** | PDF sanitize | preset "keep comments": page `/AA`, field `/AA` (JS/SubmitForm), outline `/A` (Launch) remained; `inspectPdf` did not see outline/AcroForm actions → verify green despite Launch | `stripActionsDeep()` (AA everywhere, `/A` except GoTo/Named), `/CO` removed, page AA always; inspect walks outlines + AcroForm; test | — |
| **F30** | **low** | PDF sanitize | byte scan matched substrings (`/AA` in `/AAPL`, `/JS` in `/JSON`); list without `/SubmitForm`, `/URI`, `/GoToR`, `/Screen`, `/FileAttachment`; trailer `/ID` unverified | token-boundary match, list extended, `trailerId` check | keyword in stream body only after inflate (see limit 6) |
| **F31** | **medium** | License | `payloadFromResult`/`hasFeature` accepted `ok:false && grace:true` (constructible object) | only `ok === true`; type guards; tests: feature/plan escalation, foreign pubkey, grace boundary 14d ± 1s, forged grace | no `domain` binding check (limit 9) |
| **F32** | **medium** | API rate limit | bucket key = presented key → every attempt with a new (invalid) key got a fresh bucket; brute force unthrottled | only a **valid** key gets its own bucket (`key:sha256`), otherwise `ip:`; `/docs` no longer allowlisted; test 3×401 → 429 | behind proxy `trustProxy:false` → one IP (limit 10) |
| **F33** | **medium** | API jobs | job records incl. output bytes never evicted (memory DoS); `get()` released jobs without owner / without key | retention 10 min + cap 1000 (`evict()`), strict owner check; test | inline worker not abortable (limit 8) |
| **F34** | **low** | API | CORS preflight of allowed origins → 404; error texts could carry paths (`ENOENT … /root/…`); job timeout as 500; no `requestTimeout` | preflight 204 + expose headers; `publicErrorMessage()` for 4xx/job errors, 5xx generic, 504 on timeout; `requestTimeout`/`connectionTimeout`; `whenMime`/step count validated | — |
| **F35** | **high** | Archive | bomb check only **after** `unzipSync` (everything already in RAM); `.tgz` via `gunzipSync` without limit; password ZIP without limit | `unzipSync(..., { filter })` checks central directory sizes before inflate; `gunzipLimited()` streams with cap; zip.js path checks `uncompressedSize`/ratio; tests 2 MiB bomb, 80 MiB total, gzip bomb | 7z/rar not bundled |
| **F36** | **medium** | Archive TAR | ustar `prefix` ignored (path misassignment, `..` in prefix); device/FIFO entries as files; no total cap; no collision check | prefix joined → `safeRelPath`; only type 0/NUL/7; `maxTotal`; NFC/case collision; tests | — |
| **F37** | **medium** | Web pipeline | `sanitizePipelineOptions` let arrays through raw (objects with `__proto__` in arrays), no depth/key/string limits, hash length unbounded, `whenMime` unvalidated, objects with foreign prototype | recursive plain-JSON sanitization (depth 6, 256 keys, 4 KiB strings, 32 steps), `decodePipelineHash()` 64 KiB + base64url regex, MIME regex; tests | — |
| **F38** | **low** | Web SW | no origin/protocol guard (GET check only); `/api/` responses and requests with `Authorization`/`Range` could enter the cache logic | same-origin + http(s) + `/api/` passthrough + header guard; static test counts `cache.put` sites (2) | — |
| **F39** | **low** | Desktop | Tauri CSP without `frame-ancestors`; validator only checked `fs:allow-all`/`fs:default` | CSP parity (Vitest compares directives), validator: all `fs/shell/http/process/os/…` permissions, `allow-all`, `remote`, window scope, `path_allowed()` in `read_file`/`save_file`, `'unsafe-eval'` ban | — |
| **F40** | **low** | E2E | network whitelist took the page list from home cards (not dist), no `/en` mirror, foreign requests were only logged | page list from `apps/web/dist` (all `index.html`, 10 % `formats`/`convert`), `context.route` **aborts** foreign origins, phone-home probe (fetch + `sendBeacon` must fail) | — |
| **F41** | **medium** | PDF verify (browser) | after F25 metadata hits carried `page: 0`; the pixel sample called `pdf.getPage(0)` → `Invalid page request`, the verify block never appeared in the browser (E2E d2 + form XObject red). `CreationDate`/`Producer` were also reported as `telefon`/`datum` hits | `pixelSample` only for pages ≥ 1 with a visible box, `sampleBoxMeans` clamps to `numPages`; `collectMetaHits` filters `isTechnicalPdfMeta`; regression test with `capabilities.canvas=true` in Node (fails with `Invalid page request` without the fix) | — |

## Documented limits (UI / verify never falsely green)

1. **ToUnicode missing** (CID/Type0 without CMap) and **Type3**: pdf.js yields no plaintext. Verify sets `passed: false` + warning "glyph codes may hold plaintext". Backlog: CMap/glyph analysis.
2. **Clipped text (Tr 4–7)** and **Type3**: stream is blanked, page `hard` → raster fallback. Without canvas: "rasterization not possible" + verify stays red.
3. **IBAN in image pixels** (scan): only with `ocrScanned` / raster. The auto-regex sees no OCR text.
4. **Clock rollback** under 24h: license stays valid (no trusted timestamp). Beyond that, fail-closed.
5. **TSA / model download**: user URL or same-origin `/assets` — see network table.
6. **Sanitize byte scan** only sees outside of `stream…endstream`. Since `savePdfRewritten` writes with `useObjectStreams:false`, all dicts are uncompressed → the scan is meaningful for the output; for *inputs* with object streams only after parsing.
7. **Archive nesting**: depth 0 — nested archives are never extracted recursively, only reported (`MAX_NESTING_DEPTH = 0`). 7z/rar only with optional libarchive.js.
8. **API inline worker** (`NEOTOOLS_API_INLINE=1`, tests): a hanging job cannot be terminated; only worker threads are ended on timeout. The response is still 504.
9. **License `domain`**: signed but not checked against the host at runtime (the web origin is not trustworthy).
10. **Rate limit** is in-memory per process and `trustProxy:false`: behind a reverse proxy all clients with an *invalid* key share one IP bucket (valid keys have their own buckets). Configure `X-Forwarded-For` deliberately when running behind a proxy.
11. **ZIP ratio for tiny files**: a 20 KB text file with 200× compression triggers the ratio abort (the pre-filter only kicks in from 1 MiB, the post-check stays strict). Conservative from a security point of view, usability backlog.

## Verified on 2026-09-14

Run (all green):

| Command / file | Result |
|---|---|
| `pnpm --filter @neotools/tools-pdf test` | 19 files, 76 tests — of which `test/pdf-redact-adversarial.test.ts` 20, `test/pdf-sanitize-adversarial.test.ts` 4 |
| `pnpm --filter @neotools/license test` | 15 tests (`test/license.test.ts`) |
| `pnpm --filter @neotools/tools-archive test` | 14 tests (`test/archive-pack.test.ts`) |
| `pnpm --filter @neotools/api test` | 15 tests (`test/api.test.ts`) |
| `pnpm --filter @neotools/web test` | 11 files, 41 tests — of which `test/security-wave5.test.ts` 11 |
| `node apps/desktop/scripts/validate-config.mjs` | ok |
| `pnpm --filter @neotools/web exec playwright test e2e/wave5.spec.ts -g Form-XObject` | 1 passed (verdict line + check lines, red only with a reason) |
| `pnpm --filter @neotools/web exec playwright test e2e/network-whitelist.spec.ts` | 2 passed — all dist pages (> 220 incl. `/en`, tool, static, `vergleich`, `guides` pages) + 10 % `formats`/`convert`, 3.5 min, 0 foreign origins |
| `pnpm -r typecheck` | ok |
| `pnpm lint` | 0 errors (18 pre-existing warnings in other packages) |

New/extended tests in this pass: 25 (tools-pdf 7 new, 2 rebuilt · license 3 · archive 5 · api 5 · web 5 · e2e 2 rebuilt/tightened).

No private key in the repo: `rg -n "BEGIN (EC |RSA |OPENSSH |)PRIVATE" /root/Neotools --glob '!node_modules'` → no hits.

## New tests (wave 5, both passes)

- `packages/tools-pdf/test/pdf-redact-adversarial.test.ts` — TJ join, form XObject (1 + 2 levels, dict keys preserved), FreeText/Text/Popup/Link/Stamp annotations incl. RC/Subj/T/AP, outline, XMP, StructTree, real incremental update (redact + verify fail), image overlay, Tr 7, Tc/Tw/Tz, IBAN with ZWSP/NBSP/soft hyphen/WJ/CRLF, ToUnicode fail, Type3 fail, overlay-only fail, pixel-skip advisory
- `packages/tools-pdf/test/pdf-sanitize-adversarial.test.ts` — strict preset, keep-annots preset (page AA, field AA, outline Launch, link URI), byte-scan token boundaries + keyword list, raw `/JavaScript` fail
- `packages/license/test/license.test.ts` — pubkey missing, validUntil/features/plan tamper, unknown feature, foreign pubkey, canonical JSON, `alg=none`, grace 14d boundary, forged grace, fail-closed, no PEM
- `apps/api/test/api.test.ts` — job isolation + eviction, rate limit per IP for invalid keys, CORS preflight/deny, security headers, `publicErrorMessage`, `safeDownloadName`, Content-Length 413, pipeline whitelist
- `packages/tools-archive/test/archive-pack.test.ts` — backslash/UNC/drive/`~`/NUL, ZIP bomb before inflate, total cap, gzip bomb, TAR cap, TAR device/FIFO/hardlink/symlink/prefix, nesting depth 0, collision, glob
- `apps/web/test/security-wave5.test.ts` — header parity `_headers`/`vercel.json`/`nginx.conf`/`server.mjs`/`middleware.ts`/Tauri, CSP invariants, SW policy, pipeline import limits, `decodePipelineHash`, branding, DOMPurify, download names, extension bypass
- `apps/web/e2e/network-whitelist.spec.ts` — dist-based page list, foreign origins aborted + fail, phone-home probe
- `apps/web/e2e/wave5.spec.ts` — pdf-redact form XObject: verdict never empty; red ⇒ FAIL/WARN with text, green ⇒ no FAIL, `:bytes`/`:text` check visible
- Desktop: `valid_deep_link` Rust tests; `scripts/validate-config.mjs` (capabilities, lib.rs guard, CSP)

## Network sweep (runtime sources)

`rg -n "https?://" packages apps --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/*.test.ts' --glob '!**/*.md'` plus `fetch(|XMLHttpRequest|WebSocket|sendBeacon|EventSource` across all `src` trees.

| Location | URL | Class |
|---|---|---|
| `packages/tools-pdf/src/wasm-bytes.ts` (`fetchSameOrigin`) | `/assets/…` | same-origin; `https?://` throws |
| `packages/tools-image/src/codec/wasm.ts` (`fetchSameOrigin`) | `/assets/jsquash/…` | same-origin; `https?://` throws |
| `packages/tools-image-ai/src/wasm-bytes.ts` (`fetchSameOrigin`) | `/assets/…` | same-origin; `https?://` throws |
| `packages/tools-media/src/ffmpeg/wasm.ts` | `${origin}/assets/ffmpeg/…`, `core-flavor.json`, `BUILD-INFO.json` | same-origin |
| `packages/tools-media/src/ffmpeg/font.ts`, `packages/tools-office/src/core/fonts.ts`, `packages/tools-image/src/fonts/ofl.ts` | `/assets/fonts/…` | same-origin |
| `packages/models/src/{load,cache,paths}.ts` | `platform.assets.modelBase` (default `/assets/models`), HEAD + GET | same-origin; remote URL throws; user confirms model; SHA-256 checked |
| `packages/tools-pdf/src/sign/create.ts` | `tsaUrl` | **user opt-in** (PAdES TSA, option) |
| `packages/tools-dach/src/hash/rfc3161.ts` | `tsaUrl` | **user opt-in** (RFC 3161, option) |
| `apps/web/src/worker/tool-worker.ts` | `/presets.json` | same-origin |
| `apps/web/public/sw.js` | cache + same-origin fetch (guard: origin, http(s), no `/api/`) | same-origin |
| `apps/web/public/assets/{ffmpeg,tesseract,onnx}/*` | internal WASM XHR | same-origin assets |
| `packages/tools-image/src/meta/read.ts` | `https://maps.google.com/?q=…` | **documentation link** in the report (string, no fetch) |
| `apps/web/src/data/formats/*.ts`, `apps/web/src/data/specs.ts`, `packages/tools-creator/src/platform-targets.ts` | specification/platform links | **documentation link** (anchor in HTML, no fetch) |
| `apps/web/src/lib/branding.ts` | `releasesUrl` (GitHub releases) | **documentation link**, desktop opens externally only on click (`opener`) |
| `apps/web/astro.config.ts`, `src/pages/robots.txt.ts` | `https://neotools.local` | build constant (sitemap base), no fetch |
| `apps/api/src/server.ts` | `http://host:port/api/v1/docs` | log output |
| `packages/tools-media/Dockerfile.ffmpeg-lgpl`, `scripts/ffmpeg-wasm/**` | GitHub clones, videolan | build time (Docker), not runtime |
| `apps/api/test/api.test.ts`, `apps/web/playwright.config.ts` | `127.0.0.1` | test |
| `sendBeacon` / `WebSocket` / `EventSource` / `XMLHttpRequest` | — | no occurrence in app sources |

No unauthorized phone-home removed (none found). The E2E guard aborts every foreign origin and fails the test.

## CSP / COOP / COEP

Identical (enforced via Vitest `security-wave5.test.ts`) in `apps/web/public/_headers`, `vercel.json`, `deploy/docker/nginx.conf`, `apps/web/e2e/server.mjs`, `apps/web/src/middleware.ts` (Astro dev) and — directive by directive — Tauri `app.security.csp`:

- COOP `same-origin`, COEP `credentialless` (SharedArrayBuffer/WASM), CORP `same-origin`
- `script-src 'self' blob: 'wasm-unsafe-eval' 'unsafe-inline'` — **no** `unsafe-eval`
- `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Desktop

Capabilities (`default.json`): `core:default`, `core:event`, window focus, `dialog`, `opener`, `updater`, `deep-link`, `tray`, `menu` — no `fs:*`, no `shell:*`, no `http:*`. File I/O exclusively via the Rust commands `read_file`/`save_file` with the `path_allowed()` allowlist (dialog, argv, file association). `scripts/validate-config.mjs` aborts the build on any deviation.

## Open items (backlog)

- CMap/glyph analysis for fonts without ToUnicode (today: honestly red).
- Sanitize: inflate stream bodies for the keyword scan on inputs with object streams.
- Archive: relax the ratio threshold for tiny files (usability), libarchive.js path with the same caps.
- API: `trustProxy` option via env for proxy operation; rate-limit store optionally external.
- License: optional `domain` binding for self-hosted web.
