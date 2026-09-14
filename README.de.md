🇩🇪 Deutsch · [🇬🇧 English](./README.md)

# NeoTools

Lokale Werkzeuge für PDFs, Bilder, Video/Audio, Sprache, Office, Archive, Forensik, Creator-Formate und DACH-Recht — im Browser, als CLI, per Docker, REST-API oder Desktop-App.  
Kein Upload, kein Wasserzeichen, kein Tracking, keine CDN-Laufzeitabhängigkeit.

Repository: <https://github.com/sauerlandtreffi/neotools> · Lizenz: MIT

Anders als Cloud-PDF-Dienste verarbeitet NeoTools alles lokal. Differenzierung: **isomorphe Engine** (Browser + Node), White-Label-Self-Hosting, Datenschutz-Tools (Sanitize, Metadaten, Verify), Desktop-Dateizuordnung.

UI-Sprache: **Deutsch** (ohne Prefix), Englisch unter `/en/...`. Ein gemeinsamer `/app`-Arbeitsbereich (Dropzone, Verlauf, Pipeline-Builder in einer Ansicht) ist in Arbeit.

**235 Tools in 10 Packs** — Stand Welle 5 (Launch-Vorbereitung):

| Pack        | Tools | Paket                      | Schwerpunkt                                                        |
| ----------- | ----: | -------------------------- | ------------------------------------------------------------------ |
| `pdf`       |    24 | `packages/tools-pdf`       | Merge, Redact + Verify, Sanitize, OCR, PDF/A, UA, PAdES, Mailmerge |
| `forensics` |    10 | `packages/tools-forensics` | Identify, Hidden-Data, Fake-Ext, Fingerprint, Share-Safe           |
| `image`     |    35 | `packages/tools-image`     | jSquash-Codecs, Doc-Repair, LUT, Film-Scan, Passfoto, SVG-Tracer   |
| `image-ai`  |     9 | `packages/tools-image-ai`  | ONNX/Transformers.js: Hintergrund, Gesichter, Alt-Text, Easy-Read  |
| `creator`   |    22 | `packages/tools-creator`   | Plattform-Packs, Spec-Check, Audiogram, Collage, Sticker, Mockups  |
| `dach`      |    12 | `packages/tools-dach`      | beA/ERV, E-Rechnung, GoBD, GiroCode, RFC-3161                      |
| `speech`    |    12 | `packages/tools-speech`    | Whisper lokal: Transkript, Untertitel, Kapitel, Übersetzung        |
| `office`    |    32 | `packages/tools-office`    | DOCX/XLSX/CSV/E-Book/Fonts/SQL, SheetJS Community, OFL-Fonts       |
| `media`     |    68 | `packages/tools-media`     | FFmpeg-WASM (LGPL-Build) + WebCodecs: Video/Audio-Convert, Edit    |
| `archive`   |    11 | `packages/tools-archive`   | ZIP/TAR nativ, 7z dynamisch, Ordner-Konvertierung, Sidecars        |

Zähler aus der Registry: `node apps/cli/dist/cli.js list --json`. `audio-stems` bleibt registriert, aber nicht im Web-Grid (kein lizenzsauberes kleines Modell).

## Quickstart

Voraussetzung: Node 20+ (entwickelt mit Node 22). pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm --filter @neotools/web dev          # http://localhost:4321
pnpm -r build
pnpm -r test
pnpm -r typecheck
node scripts/check-i18n.mjs              # de/en-Dictionary + categoryLabels deckungsgleich
```

Mitarbeit: [CONTRIBUTING.de.md](./CONTRIBUTING.de.md) · Änderungen: [CHANGELOG.de.md](./CHANGELOG.de.md) · Sicherheitsmeldungen: [SECURITY.de.md](./SECURITY.de.md) · Plugins: [docs/PLUGINS.de.md](./docs/PLUGINS.de.md) · White-Label: [docs/BRANDING.de.md](./docs/BRANDING.de.md) · Deployment: [docs/DEPLOYMENT.de.md](./docs/DEPLOYMENT.de.md) · Security-Review: [docs/SECURITY-REVIEW.de.md](./docs/SECURITY-REVIEW.de.md)

## Entwicklung & Qualität

Root-Aliase (von `/` aus):

| Befehl                                        | Zweck                                                             |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                    | Astro-Dev der Web-App (`@neotools/web`)                           |
| `pnpm build` / `pnpm test` / `pnpm typecheck` | `pnpm -r` über alle Workspace-Pakete mit dem jeweiligen Script    |
| `pnpm lint`                                   | ESLint flat config (root)                                         |
| `pnpm format` / `pnpm format:check`           | Prettier                                                          |
| `pnpm e2e`                                    | Playwright-Smokes gegen `apps/web/dist` (baut bei fehlendem Dist) |
| `pnpm cli`                                    | Alias auf `apps/cli` (`neotools`)                                 |
| `node scripts/check-i18n.mjs`                 | Fail, wenn de/en-UI-Dictionary oder `categoryLabels` divergieren  |
| `node scripts/fetch-ffmpeg-lgpl.mjs`          | LGPL-FFmpeg-Core aus dem eigenen GitHub-Release (gitignored)      |

Playwright braucht einmalig Chromium:

```bash
pnpm --filter @neotools/web exec playwright install chromium --with-deps
```

`--with-deps` installiert Systembibliotheken (Ubuntu). Schlägt das fehl: `playwright install chromium` und fehlende Libs per `apt` (typisch `libnss3`, `libnspr4`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libdrm2`, `libxkbcommon0`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libasound2`, `libpango-1.0-0`, `libcairo2`).

Die Smokes laufen gegen einen kleinen Static-Server (`apps/web/e2e/server.mjs`), nicht gegen `astro preview`: Preview wendet `public/_headers` nicht an. Der Server setzt dieselben COOP/COEP/`credentialless`-Header wie nginx / Vercel.

**Git:** Branch `main`, Remote `origin` = <https://github.com/sauerlandtreffi/neotools>. Lokal `user.name`/`user.email` nur im Repo (`NeoTools Bot` / `bot@neotools.local`). Ignoriert u. a.:

- `node_modules/`, `dist/`, `.astro/` — Build/Install-Artefakte
- `apps/desktop/src-tauri/target/`, `apps/desktop/src-tauri/gen/` — Cargo/Tauri-Ausgabe
- `apps/web/public/tessdata/*` (außer `.gitkeep`) und `**/tessdata/*.traineddata*` — heruntergeladene OCR-Modelle, mehrere MB
- `apps/web/public/assets/{qpdf,jsquash,tesseract}/*` — Kopien aus `scripts/copy-wasm-assets.mjs` (u. a. Tesseract-WASM ≫ 2 MB)
- `*.log`, `.env*`, `coverage/`, `test-results/`, `playwright-report/`
- OS-/Editor-Dateien (`.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/`)

`.gitattributes` markiert `*.wasm` / `*.pdf` als binary und normalisiert Text auf LF.

CLI nach dem Build:

```bash
pnpm --filter @neotools/cli build
node apps/cli/dist/cli.js list
node apps/cli/dist/cli.js run pdf-merge a.pdf b.pdf -o out
node apps/cli/dist/cli.js info pdf-sanitize
node apps/cli/dist/cli.js pipeline pipeline.json in.pdf -o out
```

Docker (White-Label):

```bash
export NEOTOOLS_BRANDING=$PWD/branding.json
docker compose -f deploy/docker/docker-compose.yml up --build
```

## Architektur

```
packages/engine         @neotools/engine          defineTool, Registry, Pipeline, Batch, Provenance, Team-Presets
packages/license        @neotools/license         Offline-Ed25519, Gates nur für Plattform-Extras
packages/parsers        @neotools/parsers         JPEG/PNG/TIFF-Parser (geteilt)
packages/models         @neotools/models          ONNX/Whisper-Katalog (kein CDN)
packages/tools-pdf      @neotools/tools-pdf       24 PDF-Tools (pdf-lib, pdfjs, qpdf-WASM, PAdES, PDF/A, UA)
packages/tools-forensics @neotools/tools-forensics 10 Forensik-Tools
packages/tools-image    @neotools/tools-image     35 Bild-Tools (jSquash, eigene Codecs, LUT, Film-Scan, SVG-Tracer)
packages/tools-image-ai @neotools/tools-image-ai  9 KI/CV-Bild- und A11y-Tools (ONNX, Transformers.js)
packages/tools-creator  @neotools/tools-creator   22 Creator/Social-Tools (baut auf tools-image + tools-media)
packages/tools-dach     @neotools/tools-dach      12 DACH-Tools (beA/ERV, E-Rechnung, GoBD, GiroCode)
packages/tools-office   @neotools/tools-office    32 Office/E-Book/Daten-Tools
packages/tools-media    @neotools/tools-media     68 Video/Audio-Tools (FFmpeg LGPL-Build, WebCodecs)
packages/tools-speech   @neotools/tools-speech    12 Sprache/Untertitel-Tools (Whisper)
packages/tools-archive  @neotools/tools-archive   11 Archiv/Ordner-Tools
packages/plugins/3d-lite @neotools-plugin/3d-lite Community-Plugin-Beispiel (Manifest, Caps-Sandbox; nicht registriert)
apps/web                Astro 5 + Preact + Tailwind 4, Worker via Comlink (1202 statische Seiten)
apps/cli                dieselben Tool-Definitionen, Zod → Flags, watch, license
apps/api                Fastify REST-Sidecar (gleiche Engine)
apps/desktop            Tauri 2 Desktop (PDF-Reader, Dateizuordnung, Deep-Link)
deploy/docker           nginx-static + optional API, branding.json zur Build-Zeit
```

Tool-Zahlen je logischem Pack: siehe Tabelle oben (235 / 10 Packs). White-Label: `branding.json` (`hiddenTools`, Name, Farben, `legal.*`, Lizenz) — Details in [docs/BRANDING.de.md](./docs/BRANDING.de.md). Community-Plugins: [docs/PLUGINS.de.md](./docs/PLUGINS.de.md) (Loader Phase 5 offen).

Die Engine kennt kein DOM. Platform-Adapter:

- `platform/browser.ts` — Worker (Comlink), OffscreenCanvas, OPFS-Flag, `qpdf` + `ocr`
- `platform/node.ts` — fs, optionales `@napi-rs/canvas`, `qpdf` + `ocr`

Pipeline: Schritte `{ toolId, options }`, MIME-Typprüfung Outputs→Inputs, JSON und URL-Hash `#p=<base64url>`.

Batch: eine kaputte Datei bricht den Rest nicht ab (`ok|error` + Grund).

## Lizenzen

Eigener Code: **MIT** (`LICENSE`).  
Laufzeit: pdf-lib (MIT), PDF.js (Apache-2.0), qpdf-wasm (Apache-2.0), @cantoo/pdf-lib (MIT), jSquash/mozjpeg/oxipng (Apache-2.0/BSD/MIT), Tesseract.js (Apache-2.0), ONNX Runtime (MIT), Transformers.js (Apache-2.0), Zod, Comlink, fflate, Astro, Preact, Tailwind, @noble/ed25519 (MIT), SheetJS Community (Apache-2.0), OFL-Fonts (Source Sans/Serif/Code), mp4-muxer (MIT), mp4box.js (BSD-3-Clause). libheif/7z-wasm nur dynamisch (LGPL).  
**Nicht verwendet:** Ghostscript, MuPDF, iText (AGPL).

**FFmpeg-WASM-Core:** eigener **LGPL-2.1-or-later-Build** ohne `--enable-gpl`/x264/x265 (`packages/tools-media/Dockerfile.ffmpeg-lgpl`, `packages/tools-media/scripts/build-ffmpeg-lgpl.sh`, Workflow `.github/workflows/ffmpeg-lgpl.yml` → Release `ffmpeg-lgpl`). `node scripts/fetch-ffmpeg-lgpl.mjs` legt das Artefakt gitignored unter `packages/tools-media/vendor/ffmpeg-lgpl/` ab; `scripts/copy-wasm-assets.mjs` kopiert es nach `apps/web/public/assets/ffmpeg/`. Der Loader bevorzugt den LGPL-Core. **Nur wenn das Artefakt fehlt**, fällt er auf den GPL-Core aus `@ffmpeg/core` zurück — `/lizenzen` kennzeichnet den tatsächlich geladenen Core dynamisch (`getFfmpegCoreFlavor()`). H.264-Encode läuft ausschließlich über WebCodecs + mp4-muxer.

Die Seite `/lizenzen` sammelt `licenses` aller Tools plus Plattform-Libs (`packages/engine/src/licenses.ts`). Zusätzlich `/licenses.json` und `/THIRD_PARTY_NOTICES.txt`. Regel: jede neue Laufzeit-Lib landet im selben PR in `src/licenses.ts` des Packs.

SEO: `/formats/[id]`, `/convert/[from]-to-[to]`, `/spec/[platform]`, `/guides/[slug]` (24 Guides, de + `/en/...`). Verlauf lokal unter `/verlauf`.

## Launch

Seiten für den Launch (alle statisch, Inhalte aus `branding.json`):

| Seite                                                                                           | Englisch        | Inhalt                                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `/preise`                                                                                       | `/en/pricing`   | Community (alle Tools, kostenlos), Pro, Enterprise/Self-Host — Preise aus `pricing.*`, sonst „auf Anfrage“ |
| `/vergleich/ilovepdf`, `/vergleich/smallpdf`, `/vergleich/adobe-acrobat`                          | `/en/compare/*` | Funktions-/Datenschutzvergleich: lokal vs. Upload, Wasserzeichen, Limits, Lizenzen                         |
| `/ueber`                                                                                        | `/en/about`     | Projekt, Engine, Betreiber (`legal.operator`, `contact.*`)                                                 |
| `/impressum`                                                                                    | `/en/imprint`   | **Vorlage** aus `legal.*` — leere Felder bleiben Platzhalter                                               |
| `/datenschutz`                                                                                  | `/en/privacy`   | **Vorlage** aus `legal.*`, `hosting.*`, `desktop.*` (lokale Verarbeitung, keine Uploads, Update-Check)     |
| `/lizenzen`, `/licenses.json`, `/THIRD_PARTY_NOTICES.txt`                                       | `/en/licenses`  | generierte Lizenzlisten                                                                                    |

Impressum und Datenschutzerklärung sind Textvorlagen, **keine Rechtsberatung** — vor dem Launch von einer fachkundigen Person prüfen lassen und `legal.updated` setzen. Release-Ablauf: Tag `v*` → `.github/workflows/release.yml` (Web-Dist, CLI-Tarball, optional LGPL-Core, GitHub-Release mit CHANGELOG-Auszug); Desktop-Bundles über `desktop.yml` (`desktop-v*`).

## Branding

`branding.json` im Repo-Root (Name, Tagline, Logo, Farben, `hiddenTools`, `footerLinks`, `legal.*`, `pricing.*`, `contact.*`, `hosting.*`, `desktop.*`, Lizenz-Token, Presets).  
Build liest `NEOTOOLS_BRANDING=/pfad/branding.json`. Logo-Pfad und Farben werden über `safeAssetUrl`/`safeCssColor` geprüft (kein `javascript:`, kein Remote-Logo, keine CSS-Injection). Alle Felder: [docs/BRANDING.de.md](./docs/BRANDING.de.md).

## Bekannte Entscheidungen

- **COEP:** `credentialless` statt `require-corp`, damit lokale Worker/WASM nicht an fehlenden CORP-Headern scheitern.
- **pdf-to-images in Node:** optionales `@napi-rs/canvas` (Native). In dieser Umgebung nicht installiert — der Tool-Lauf gibt eine klare Fehlermeldung. Im Browser: OffscreenCanvas im Worker. Der Web-Build stubbt das Native-Modul.
- **pnpm 10:** `onlyBuiltDependencies` für `esbuild` und `sharp` (sonst ignoriert pnpm deren postinstall und Vite/Astro brechen).
- **Desktop:** Tauri 2 unter `apps/desktop` (siehe `apps/desktop/README.md`). `pnpm --filter @neotools/desktop test` validiert `tauri.conf.json`; `cargo build --release` braucht rustup + WebKitGTK 4.1.
- **Kein Analytics.**

## qpdf-WASM

Kein eigenes `@neotools/qpdf`-Paket — Wrapper liegt in `packages/tools-pdf/src/qpdf/`.

- **Build:** `@jspawn/qpdf-wasm@0.0.2` (Apache-2.0, CLI-WASM, `qpdf.wasm` ~1.2 MB). Der Default-ESM-Loader bricht unter Node 22 (`fetch` eines Dateipfads). Wir kompilieren das WASM selbst (`WebAssembly.compile`) und übergeben es per `instantiateWasm`. Frische Emscripten-Instanz pro `callMain` (nicht re-entrant).
- **Selbst gehostet:** `scripts/copy-wasm-assets.mjs` kopiert `qpdf.wasm` nach `apps/web/public/assets/qpdf/` (kein CDN). Im Browser läuft qpdf im Tool-Worker; in Node direkt.
- **Fallback:** `@cantoo/pdf-lib` (MIT, pdf-lib-Fork mit AES-256). Wird genutzt, wenn qpdf nicht instanziiert.
- **Linearisierung** („Fast Web View“) ist optional (`--linearize`) in `pdf-lock` / `pdf-repair` / `pdf-compress`.

## OCR-Sprachdaten (Tesseract.js)

Tesseract.js v7 (Apache-2.0). Core-WASM und `worker.min.js` werden gebündelt bzw. nach `apps/web/public/assets/tesseract/` kopiert — **keine jsDelivr-Defaults**.

```bash
node scripts/fetch-tessdata.mjs          # eng+deu von tessdata_fast, gzip nach apps/web/public/tessdata/
node scripts/copy-wasm-assets.mjs        # qpdf / jSquash / tesseract-core
```

`pnpm install` ruft beides mit `--optional` auf (`postinstall`), damit Offline-Install nicht scheitert. Dateien `*.traineddata.gz` und kopierte WASM-Assets sind gitignored, wenn groß (>5 MB nicht committen). Node braucht `NEOTOOLS_TESSDATA` oder `apps/web/public/tessdata/`. Wiederverwendbar: `recognizePage(imageData, langs, ctx)` in `@neotools/tools-pdf`.

**Passwortfelder:** Zod `.describe('password')` (oder Feldname enthält `password`) → Web-Formular `type=password`.

## Stand

Wellen 1–5 sind in `main` (Details: [CHANGELOG.de.md](./CHANGELOG.de.md), [docs/ROADMAP.de.md](./docs/ROADMAP.de.md)). Welle 5 brachte den adversarial Security-Review mit Fix-Mandat ([docs/SECURITY-REVIEW.de.md](./docs/SECURITY-REVIEW.de.md), F1–F41, keine offenen kritischen/hohen Findings), das Creator-Pack, 18 neue Bild- und 6 neue Media-Tools, den LGPL-FFmpeg-Build, die Launch-Seiten und 24 Guides. Capabilities `qpdf`/`ocr` sind in Browser- und Node-Platform `true`; `@napi-rs/canvas` bleibt optional (OCR-Raster und pdf-to-images in Node).

In Arbeit: `/app`-Arbeitsbereich. Offen: Community-Plugin-Loader (Phase 5), `audio-stems`-Modell, WebLLM/Volltext als Showcases, Desktop-Updater-Signatur, veraPDF-äquivalente PDF/A-Validierung.
