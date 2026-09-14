# Security Review — Welle 5 (adversarial, mit Fix-Mandat)

Datum: 2026-09-14. Scope: pdf-redact/verify, pdf-sanitize, Lizenz, API, Archive, Web-Header/SW/Pipeline, Netzwerk, Desktop.

Zweiter Durchgang (gleicher Tag): jede Behauptung des ersten Durchgangs wurde gegen Code **und** Tests
geprüft. Wo ein Test grün war, ohne den Angriff wirklich abzubilden (F26), wurde der Test in einen echten
Angriff umgebaut und die Implementierung repariert. Neue Findings ab F25.

## Findings nach Schweregrad

| Schwere | Anzahl (gesamt) | gefixt | dokumentierte Grenze |
|---|---|---|---|
| kritisch | 3 (F1–F3) | 3 | 0 |
| hoch | 9 (F4–F9, F25, F29, F35) | 9 | Restrisiken → Grenzen 1, 6, 7 |
| mittel | 18 (F10–F18, F26–F28, F31–F33, F36, F37, F41) | 18 | Grenzen 8, 9, 10 |
| niedrig | 11 (F19–F24, F30, F34, F38–F40) | 11 | Grenze 11 |

## Findings

| ID | Schwere | Bereich | Repro | Fix | Rest |
|---|---|---|---|---|---|
| F1 | kritisch | API Jobs | `GET /jobs/:id` mit anderem Key | Job an `sha256(apiKey)` binden; 404 sonst | — |
| F2 | kritisch | Desktop | `read_file`/`save_file` beliebiger Pfad | Allowlist: Dialog, argv, Association | — |
| F3 | kritisch | PDF redact | Ungenutzte Streams / inkrementelles Update halten Klartext | `savePdfRewritten` (neues Doc, `useObjectStreams: false`) | — |
| F4 | hoch | PDF redact | TJ-Kerning, Form-XObject, AP-Streams, Outline, XMP, StructTree `ActualText` | Stream-Rewrite inkl. TJ-Join, AP, Meta-Walk, Struct/XMP-Scrub | Glyphs ohne ToUnicode: Verify **fail** + Warnung |
| F5 | hoch | PDF sanitize | `/AA`, XFA, URI/Launch/SubmitForm, RichMedia, Rohbytes | Strip + Byte-Scan außerhalb Streams | Keyword in komprimiertem Stream-Body nur nach inflate |
| F6 | hoch | License | Token ohne Pubkey / `payloadFromResult` bei Fail | Community, niemals Pro; `hasFeature` fail-closed | Keine vertrauenswürdige Uhr |
| F7 | hoch | API Auth | `Set.has` nicht zeitkonstant; Dateinamen `../` in ZIP | `timingSafeEqual`; `safeDownloadName` | — |
| F8 | hoch | Archive | Zip-Bomb nur Warning; TAR-Symlink | Ratio+Größe → Abbruch; Typ 1/2 übersprungen | 7z über optionales WASM |
| F9 | hoch | Web Pipeline | Hash-Import ohne Tool-Whitelist / `__proto__` | `sanitizePipelineSteps` | — |
| F10 | mittel | API Upload | `toBuffer()` vor Limit | Stream + `Content-Length` + multipart `fileSize` | — |
| F11 | mittel | API | vorhersagbare Job-IDs | 16 Byte CSPRNG | — |
| F12 | mittel | API | keine Security-Header / CORS | Header + `NEOTOOLS_CORS_ORIGINS` | — |
| F13 | mittel | License | `alg=none` JWT; nicht-kanonisches JSON | Reject | — |
| F14 | mittel | Web SW | Cache-all GET | nur Precache + `/_astro` + `/assets` | — |
| F15 | mittel | Web | `assessExtension` per Umbenennung | Magic + Markup unabhängig von Endung | — |
| F16 | mittel | Web | Download-Dateiname / Markdown | Escape + DOMPurify FORBID | — |
| F17 | mittel | PDF verify | Pixel-Skip `passed: true` | advisory + `warnings[]`, UI nicht still-grün | Node ohne Canvas: Warnung |
| F18 | mittel | Archive | Case/Unicode-Kollision, Glob-ReDoS | NFC+case key; Glob-Länge | — |
| F19 | niedrig | Branding | `javascript:` Logo, CSS-Injection | `safeAssetUrl` / `safeCssColor` | — |
| F20 | niedrig | Desktop | Deep-Link unvalidiert | nur `neotools://tool/<kebab>` | — |
| F21 | niedrig | History | IDB-Settings nach `clear` | Settings-Store + `deleteDatabase` | — |
| F22 | niedrig | License | `issuedAt` in der Zukunft | fail-closed (>24h) | — |
| F23 | niedrig | API Audit | Dateinamen | nur Hashes (unverändert) | — |
| F24 | niedrig | CSP | `vercel.json` ohne Permissions-Policy | ergänzt; nginx/`_headers`/Astro-Middleware gleich | `unsafe-inline` für Astro-Hydration |
| **F25** | **hoch** | PDF redact | IBAN **nur** in Annotation (`/Contents`, `/RC`, `/Subj`, `/T`, Popup) oder AP-Stream: pdf.js-Textextraktion sieht sie nicht → kein Hit → kein Scrub, Rohbytes/AP behalten IBAN. Verify ebenfalls blind für AP-Text (falsch-grün). | `collectMetaHits()` scannt Info/Outline/StructTree/XMP/Annotationen/AP-Streams mit den Patterns und erzeugt Hits (Seite 0 bzw. Annot-Seite); `collectAppearanceText()` fließt in `verify :meta` ein | AP-Hex-Strings ohne Font-Mapping werden als Latin-1 gelesen |
| **F26** | **mittel** | PDF redact (Test) | Test „inkrementelles Update“ erzeugte einen **unregistrierten** flate-Stream → landete nie in der Datei, Precondition falsch, Test hätte nie einen Angriff geprüft | Test baut jetzt eine echte `/Prev`-Update-Sektion mit verwaistem, unkomprimiertem Stream; zusätzlicher Verify-Fail-Test (`:incremental`, `:bytes`) | — |
| **F27** | **mittel** | PDF redact | Rewrite von Form-XObjects/AP-Streams verwarf Dict-Keys (`Subtype`, `Matrix`, `Group`, `FormType`) → Renderer kann Form ignorieren; AP-Stream-Resources (verschachtelte XObjects) wurden nicht rewritten | `copyStreamDict()` behält alle Keys außer Kodierung; AP → `rewriteXObjectForms` rekursiv; Test „zwei Ebenen tief“ | — |
| **F28** | **mittel** | PDF verify | `pagesMissingToUnicode` ignorierte Type3 und Fonts in AP-Streams | Type3 immer gemeldet; AP-Resources gewalkt; Test | Type3-Seite ohne Canvas bleibt **fail** (ehrlich rot) |
| **F29** | **hoch** | PDF sanitize | Preset „Kommentare behalten“: Seiten-`/AA`, Feld-`/AA` (JS/SubmitForm), Outline-`/A` (Launch) blieben; `inspectPdf` sah Outline/AcroForm-Aktionen nicht → Verify grün trotz Launch | `stripActionsDeep()` (AA überall, `/A` außer GoTo/Named), `/CO` weg, Seiten-AA immer; inspect walkt Outlines + AcroForm; Test | — |
| **F30** | **niedrig** | PDF sanitize | Byte-Scan matchte Substrings (`/AA` in `/AAPL`, `/JS` in `/JSON`); Liste ohne `/SubmitForm`, `/URI`, `/GoToR`, `/Screen`, `/FileAttachment`; Trailer-`/ID` unverifiziert | Token-Grenzen-Match, Liste erweitert, `trailerId`-Check | Keyword in Stream-Body nur nach inflate (siehe Grenze 6) |
| **F31** | **mittel** | License | `payloadFromResult`/`hasFeature` akzeptierten `ok:false && grace:true` (konstruierbares Objekt) | nur `ok === true`; Typ-Guards; Tests: Feature-/Plan-Eskalation, fremder Pubkey, Grace-Grenze 14d ± 1s, forged grace | kein `domain`-Binding-Check (Grenze 9) |
| **F32** | **mittel** | API Rate-Limit | Bucket-Key = präsentierter Key → jeder Rate-Versuch mit neuem (ungültigen) Key bekam frischen Bucket; Brute-Force ungebremst | nur **gültiger** Key erhält eigenen Bucket (`key:sha256`), sonst `ip:`; `/docs` nicht mehr allowlisted; Test 3×401 → 429 | hinter Proxy `trustProxy:false` → eine IP (Grenze 10) |
| **F33** | **mittel** | API Jobs | Job-Records inkl. Output-Bytes nie evicted (Memory-DoS); `get()` gab Jobs ohne Owner / ohne Key frei | Retention 10 min + Cap 1000 (`evict()`), Owner-Check strikt; Test | Inline-Worker nicht abbrechbar (Grenze 8) |
| **F34** | **niedrig** | API | CORS-Preflight erlaubter Origins → 404; Fehlertexte konnten Pfade tragen (`ENOENT … /root/…`); Job-Timeout als 500; kein `requestTimeout` | Preflight 204 + Expose-Headers; `publicErrorMessage()` für 4xx/Job-Fehler, 5xx generisch, 504 bei Timeout; `requestTimeout`/`connectionTimeout`; `whenMime`/Schrittzahl validiert | — |
| **F35** | **hoch** | Archive | Bomb-Prüfung erst **nach** `unzipSync` (alles bereits im RAM); `.tgz` via `gunzipSync` ohne Limit; Passwort-ZIP ohne Limit | `unzipSync(..., { filter })` prüft Central-Directory-Größen vor Inflate; `gunzipLimited()` streamt mit Cap; zip.js-Pfad prüft `uncompressedSize`/Ratio; Tests 2 MiB-Bombe, 80 MiB-Summe, gzip-Bombe | 7z/rar nicht gebündelt |
| **F36** | **mittel** | Archive TAR | ustar-`prefix` ignoriert (Pfad-Fehlzuordnung, `..` im Prefix); Device/FIFO-Einträge als Dateien; kein Gesamt-Cap; keine Kollisionsprüfung | Prefix gejoint → `safeRelPath`; nur Typ 0/NUL/7; `maxTotal`; NFC/Case-Kollision; Tests | — |
| **F37** | **mittel** | Web Pipeline | `sanitizePipelineOptions` ließ Arrays roh durch (Objekte mit `__proto__` in Arrays), keine Tiefen-/Key-/String-Limits, Hash-Länge unbegrenzt, `whenMime` unvalidiert, Objekte mit fremdem Prototyp | Rekursive Plain-JSON-Sanitisierung (Tiefe 6, 256 Keys, 4 KiB Strings, 32 Schritte), `decodePipelineHash()` 64 KiB + base64url-Regex, MIME-Regex; Tests | — |
| **F38** | **niedrig** | Web SW | Kein Origin-/Protokoll-Guard (nur GET-Check); `/api/`-Antworten und Requests mit `Authorization`/`Range` konnten in die Cache-Logik laufen | Same-origin + http(s) + `/api/`-Passthrough + Header-Guard; statischer Test zählt `cache.put`-Stellen (2) | — |
| **F39** | **niedrig** | Desktop | Tauri-CSP ohne `frame-ancestors`; Validator prüfte nur `fs:allow-all`/`fs:default` | CSP-Parität (Vitest vergleicht Direktiven), Validator: alle `fs/shell/http/process/os/…`-Permissions, `allow-all`, `remote`, Fenster-Scope, `path_allowed()` in `read_file`/`save_file`, `'unsafe-eval'`-Verbot | — |
| **F40** | **niedrig** | E2E | network-whitelist nahm Seitenliste von Home-Karten (nicht dist), kein `/en`-Spiegel, Fremdrequests wurden nur protokolliert | Seitenliste aus `apps/web/dist` (alle `index.html`, 10 % `formats`/`convert`), `context.route` **abortet** Fremd-Origins, Phone-home-Probe (fetch + `sendBeacon` müssen scheitern) | — |
| **F41** | **mittel** | PDF verify (Browser) | Nach F25 trugen Metadaten-Treffer `page: 0`; die Pixel-Stichprobe rief `pdf.getPage(0)` → `Invalid page request`, der Verify-Block erschien im Browser nie (E2E d2 + Form-XObject rot). Außerdem wurden `CreationDate`/`Producer` als `telefon`/`datum`-Treffer gemeldet | `pixelSample` nur für Seiten ≥ 1 mit sichtbarer Box, `sampleBoxMeans` clampt auf `numPages`; `collectMetaHits` filtert `isTechnicalPdfMeta`; Regressionstest mit `capabilities.canvas=true` in Node (fällt ohne Fix mit `Invalid page request` durch) | — |

## Dokumentierte Grenzen (UI / Verify niemals falsch-grün)

1. **ToUnicode fehlt** (CID/Type0 ohne CMap) und **Type3**: pdf.js liefert keinen Klartext. Verify setzt `passed: false` + Warnung „Glyph-Codes können Klartext halten“. Backlog: CMap-/Glyph-Analyse.
2. **Clip-Text (Tr 4–7)** und **Type3**: Stream wird geblankt, Seite `hard` → Raster-Fallback. Ohne Canvas: „Rasterisierung nicht möglich“ + Verify bleibt rot.
3. **IBAN über Bildpixel** (Scan): nur mit `ocrScanned` / Raster. Auto-Regex sieht keinen OCR-Text.
4. **Uhr-Rückstellung** unter 24h: License bleibt gültig (kein Trusted Timestamp). Darüber fail-closed.
5. **TSA / Modell-Download**: Nutzer-URL bzw. same-origin `/assets` — siehe Netzwerktabelle.
6. **Sanitize-Byte-Scan** sieht nur außerhalb von `stream…endstream`. Da `savePdfRewritten` mit `useObjectStreams:false` schreibt, liegen alle Dicts unkomprimiert → der Scan ist für die Ausgabe aussagekräftig; für *Eingaben* mit Objekt-Streams nur nach Parse.
7. **Archive-Verschachtelung**: Tiefe 0 — verschachtelte Archive werden nie rekursiv entpackt, nur gemeldet (`MAX_NESTING_DEPTH = 0`). 7z/rar nur mit optionalem libarchive.js.
8. **API Inline-Worker** (`NEOTOOLS_API_INLINE=1`, Tests): ein hängender Job kann nicht terminiert werden; nur Worker-Threads werden bei Timeout beendet. Antwort ist trotzdem 504.
9. **License `domain`**: wird signiert, aber zur Laufzeit nicht gegen den Host geprüft (Web-Origin ist nicht vertrauenswürdig).
10. **Rate-Limit** ist In-Memory pro Prozess und `trustProxy:false`: hinter einem Reverse-Proxy teilen sich alle Clients mit *ungültigem* Key einen IP-Bucket (gültige Keys haben eigene Buckets). Bei Proxy-Betrieb `X-Forwarded-For` bewusst konfigurieren.
11. **ZIP-Ratio bei Kleinstdateien**: Ein 20-KB-Textfile mit 200× Kompression löst den Ratio-Abbruch aus (Vorab-Filter greift erst ab 1 MiB, Post-Check bleibt strikt). Sicherheitsseitig konservativ, Usability-Backlog.

## Verifiziert am 2026-09-14

Gelaufen (alle grün):

| Befehl / Datei | Ergebnis |
|---|---|
| `pnpm --filter @neotools/tools-pdf test` | 19 Dateien, 76 Tests — davon `test/pdf-redact-adversarial.test.ts` 20, `test/pdf-sanitize-adversarial.test.ts` 4 |
| `pnpm --filter @neotools/license test` | 15 Tests (`test/license.test.ts`) |
| `pnpm --filter @neotools/tools-archive test` | 14 Tests (`test/archive-pack.test.ts`) |
| `pnpm --filter @neotools/api test` | 15 Tests (`test/api.test.ts`) |
| `pnpm --filter @neotools/web test` | 11 Dateien, 41 Tests — davon `test/security-wave5.test.ts` 11 |
| `node apps/desktop/scripts/validate-config.mjs` | ok |
| `pnpm --filter @neotools/web exec playwright test e2e/wave5.spec.ts -g Form-XObject` | 1 passed (Verdikt-Zeile + Check-Zeilen, rot nur mit Begründung) |
| `pnpm --filter @neotools/web exec playwright test e2e/network-whitelist.spec.ts` | 2 passed — alle dist-Seiten (> 220 inkl. `/en`, Tool-, Static-, `vergleich`-, `guides`-Seiten) + 10 % `formats`/`convert`, 3,5 min, 0 Fremd-Origins |
| `pnpm -r typecheck` | ok |
| `pnpm lint` | 0 Fehler (18 vorbestehende Warnungen in anderen Paketen) |

Neue/erweiterte Tests in diesem Durchgang: 25 (tools-pdf 7 neu, 2 umgebaut · license 3 · archive 5 · api 5 · web 5 · e2e 2 umgebaut/verschärft).

Kein privater Schlüssel im Repo: `rg -n "BEGIN (EC |RSA |OPENSSH |)PRIVATE" /root/Neotools --glob '!node_modules'` → keine Treffer.

## Neue Tests (Welle 5, beide Durchgänge)

- `packages/tools-pdf/test/pdf-redact-adversarial.test.ts` — TJ-Join, Form-XObject (1 + 2 Ebenen, Dict-Keys erhalten), FreeText/Text/Popup/Link/Stamp-Annotationen inkl. RC/Subj/T/AP, Outline, XMP, StructTree, echtes inkrementelles Update (Redact + Verify-Fail), Bild-Overlay, Tr 7, Tc/Tw/Tz, IBAN mit ZWSP/NBSP/Soft-Hyphen/WJ/CRLF, ToUnicode-Fail, Type3-Fail, Overlay-only-Fail, Pixel-Skip advisory
- `packages/tools-pdf/test/pdf-sanitize-adversarial.test.ts` — Strict-Preset, Keep-annots-Preset (Seiten-AA, Feld-AA, Outline-Launch, Link-URI), Byte-Scan-Tokengrenzen + Keyword-Liste, Roh-`/JavaScript`-Fail
- `packages/license/test/license.test.ts` — Pubkey fehlt, validUntil/features/plan-Tamper, unbekanntes Feature, fremder Pubkey, kanonisches JSON, `alg=none`, Grace 14d-Grenze, forged grace, fail-closed, kein PEM
- `apps/api/test/api.test.ts` — Job-Isolation + Eviction, Rate-Limit per IP für ungültige Keys, CORS-Preflight/Deny, Security-Header, `publicErrorMessage`, `safeDownloadName`, Content-Length-413, Pipeline-Whitelist
- `packages/tools-archive/test/archive-pack.test.ts` — Backslash/UNC/Drive/`~`/NUL, ZIP-Bombe vor Inflate, Summen-Cap, gzip-Bombe, TAR-Cap, TAR Device/FIFO/Hardlink/Symlink/Prefix, Verschachtelung Tiefe 0, Kollision, Glob
- `apps/web/test/security-wave5.test.ts` — Header-Parität `_headers`/`vercel.json`/`nginx.conf`/`server.mjs`/`middleware.ts`/Tauri, CSP-Invarianten, SW-Policy, Pipeline-Import-Limits, `decodePipelineHash`, Branding, DOMPurify, Download-Namen, Extension-Bypass
- `apps/web/e2e/network-whitelist.spec.ts` — dist-basierte Seitenliste, Fremd-Origins abgebrochen + Fail, Phone-home-Probe
- `apps/web/e2e/wave5.spec.ts` — pdf-redact Form-XObject: Verdikt nie leer; rot ⇒ FAIL/WARN mit Text, grün ⇒ kein FAIL, `:bytes`/`:text`-Check sichtbar
- Desktop: `valid_deep_link` Rust-Tests; `scripts/validate-config.mjs` (Capabilities, lib.rs-Guard, CSP)

## Netzwerk-Sweep (Laufzeitquellen)

`rg -n "https?://" packages apps --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/*.test.ts' --glob '!**/*.md'` plus `fetch(|XMLHttpRequest|WebSocket|sendBeacon|EventSource` über alle `src`-Bäume.

| Stelle | URL | Klasse |
|---|---|---|
| `packages/tools-pdf/src/wasm-bytes.ts` (`fetchSameOrigin`) | `/assets/…` | same-origin; `https?://` wird geworfen |
| `packages/tools-image/src/codec/wasm.ts` (`fetchSameOrigin`) | `/assets/jsquash/…` | same-origin; `https?://` wird geworfen |
| `packages/tools-image-ai/src/wasm-bytes.ts` (`fetchSameOrigin`) | `/assets/…` | same-origin; `https?://` wird geworfen |
| `packages/tools-media/src/ffmpeg/wasm.ts` | `${origin}/assets/ffmpeg/…`, `core-flavor.json`, `BUILD-INFO.json` | same-origin |
| `packages/tools-media/src/ffmpeg/font.ts`, `packages/tools-office/src/core/fonts.ts`, `packages/tools-image/src/fonts/ofl.ts` | `/assets/fonts/…` | same-origin |
| `packages/models/src/{load,cache,paths}.ts` | `platform.assets.modelBase` (default `/assets/models`), HEAD + GET | same-origin; Remote-URL wird geworfen; Nutzer bestätigt Modell; SHA-256 geprüft |
| `packages/tools-pdf/src/sign/create.ts` | `tsaUrl` | **Nutzer-Opt-in** (PAdES-TSA, Option) |
| `packages/tools-dach/src/hash/rfc3161.ts` | `tsaUrl` | **Nutzer-Opt-in** (RFC 3161, Option) |
| `apps/web/src/worker/tool-worker.ts` | `/presets.json` | same-origin |
| `apps/web/public/sw.js` | Cache + same-origin fetch (Guard: Origin, http(s), kein `/api/`) | same-origin |
| `apps/web/public/assets/{ffmpeg,tesseract,onnx}/*` | interne WASM-XHR | same-origin Assets |
| `packages/tools-image/src/meta/read.ts` | `https://maps.google.com/?q=…` | **Doku-Link** im Report (String, kein Fetch) |
| `apps/web/src/data/formats/*.ts`, `apps/web/src/data/specs.ts`, `packages/tools-creator/src/platform-targets.ts` | Spezifikations-/Plattform-Links | **Doku-Link** (Anker im HTML, kein Fetch) |
| `apps/web/src/lib/branding.ts` | `releasesUrl` (GitHub Releases) | **Doku-Link**, Desktop öffnet extern nur auf Klick (`opener`) |
| `apps/web/astro.config.ts`, `src/pages/robots.txt.ts` | `https://neotools.local` | Build-Konstante (Sitemap-Base), kein Fetch |
| `apps/api/src/server.ts` | `http://host:port/api/v1/docs` | Log-Ausgabe |
| `packages/tools-media/Dockerfile.ffmpeg-lgpl`, `scripts/ffmpeg-wasm/**` | GitHub-Clones, videolan | Build-Zeit (Docker), nicht Laufzeit |
| `apps/api/test/api.test.ts`, `apps/web/playwright.config.ts` | `127.0.0.1` | Test |
| `sendBeacon` / `WebSocket` / `EventSource` / `XMLHttpRequest` | — | keine Fundstelle in App-Quellen |

Kein unerlaubter Phone-Home entfernt (keine gefunden). E2E-Guard bricht jede Fremd-Origin ab und lässt den Test fehlschlagen.

## CSP / COOP / COEP

Identisch (per Vitest `security-wave5.test.ts` erzwungen) in `apps/web/public/_headers`, `vercel.json`, `deploy/docker/nginx.conf`, `apps/web/e2e/server.mjs`, `apps/web/src/middleware.ts` (Astro-Dev) und — Direktive für Direktive — Tauri `app.security.csp`:

- COOP `same-origin`, COEP `credentialless` (SharedArrayBuffer/WASM), CORP `same-origin`
- `script-src 'self' blob: 'wasm-unsafe-eval' 'unsafe-inline'` — **kein** `unsafe-eval`
- `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Desktop

Capabilities (`default.json`): `core:default`, `core:event`, Fenster-Fokus, `dialog`, `opener`, `updater`, `deep-link`, `tray`, `menu` — kein `fs:*`, kein `shell:*`, kein `http:*`. Datei-I/O ausschließlich über die Rust-Commands `read_file`/`save_file` mit `path_allowed()`-Allowlist (Dialog, argv, File-Association). `scripts/validate-config.mjs` bricht den Build bei jeder Abweichung ab.

## Offene Punkte (Backlog)

- CMap-/Glyph-Analyse für Fonts ohne ToUnicode (heute: ehrlich rot).
- Sanitize: Inflate der Stream-Bodies für den Keyword-Scan bei Eingaben mit Objekt-Streams.
- Archive: Ratio-Schwelle für Kleinstdateien entschärfen (Usability), libarchive.js-Pfad mit denselben Caps.
- API: `trustProxy`-Option per Env für Proxy-Betrieb; Rate-Limit-Store optional extern.
- License: optionales `domain`-Binding für Self-Host-Web.
