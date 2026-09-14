# NeoTools

Lokale Werkzeuge für PDFs — im Browser, als CLI, per Docker oder (später) als Desktop-App.  
Kein Upload, kein Wasserzeichen, kein Tracking, keine CDN-Laufzeitabhängigkeit.

Vorbild: ihatepdf.cv / ihatefiles.com. Differenzierung: **isomorphe Engine** (Browser + Node), White-Label-Self-Hosting, Datenschutz-Tools (Sanitize, Metadaten), vorbereitete Desktop-Dateizuordnung.

UI-Sprache: **Deutsch** (ohne Prefix), Englisch unter `/en/...`.

## Quickstart

Voraussetzung: Node 20+ (entwickelt mit Node 22). pnpm via Corepack.

```bash
corepack enable
pnpm install
pnpm --filter @neotools/web dev          # http://localhost:4321
pnpm -r build
pnpm -r test
pnpm -r typecheck
```

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

Playwright braucht einmalig Chromium:

```bash
pnpm --filter @neotools/web exec playwright install chromium --with-deps
```

`--with-deps` installiert Systembibliotheken (Ubuntu). Schlägt das fehl: `playwright install chromium` und fehlende Libs per `apt` (typisch `libnss3`, `libnspr4`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libdrm2`, `libxkbcommon0`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libasound2`, `libpango-1.0-0`, `libcairo2`).

Die Smokes laufen gegen einen kleinen Static-Server (`apps/web/e2e/server.mjs`), nicht gegen `astro preview`: Preview wendet `public/_headers` nicht an. Der Server setzt dieselben COOP/COEP/`credentialless`-Header wie nginx / Vercel.

**Git:** Branch `main`, kein Remote. Lokal `user.name`/`user.email` nur im Repo (`NeoTools Bot` / `bot@neotools.local`). Ignoriert u. a.:

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
packages/engine      @neotools/engine     defineTool, Registry, Pipeline, Batch, Provenance
packages/tools-pdf   @neotools/tools-pdf  PDF-Tools (pdf-lib, pdfjs, qpdf-WASM, jSquash, Tesseract.js)
apps/web             Astro 5 + Preact + Tailwind 4, Worker via Comlink
apps/cli             dieselben Tool-Definitionen, Zod → Flags
apps/desktop         Tauri 2 Desktop (PDF-Reader, Dateizuordnung, Single-Instance)
deploy/docker        nginx-static, branding.json zur Build-Zeit
```

Die Engine kennt kein DOM. Platform-Adapter:

- `platform/browser.ts` — Worker (Comlink), OffscreenCanvas, OPFS-Flag, `qpdf` + `ocr`
- `platform/node.ts` — fs, optionales `@napi-rs/canvas`, `qpdf` + `ocr`

Pipeline: Schritte `{ toolId, options }`, MIME-Typprüfung Outputs→Inputs, JSON und URL-Hash `#p=<base64url>`.

Batch: eine kaputte Datei bricht den Rest nicht ab (`ok|error` + Grund).

## Lizenzen

Eigener Code: **MIT** (`LICENSE`).  
Laufzeit: pdf-lib (MIT), PDF.js (Apache-2.0), qpdf-wasm (Apache-2.0), @cantoo/pdf-lib (MIT), jSquash/mozjpeg/oxipng (Apache-2.0/BSD/MIT), Tesseract.js (Apache-2.0), Zod, Comlink, fflate, Astro, Preact, Tailwind.  
**Nicht verwendet:** Ghostscript, MuPDF, iText (AGPL).

Die Seite `/lizenzen` sammelt `licenses` aller Tools plus Plattform-Libs.

## Branding

`branding.json` im Repo-Root (Name, Logo, Farben, Impressum/Datenschutz-Platzhalter).  
Build liest `NEOTOOLS_BRANDING=/pfad/branding.json`.

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

## Welle 2 (Stand)

`pdf-lock`, `pdf-repair`, `pdf-compress` (WP-19), `pdf-ocr` (WP-25), `pdf-forms` (WP-21 Teil), Rename `pdf-organize` → `pdf-reorder`. Capabilities `qpdf`/`ocr` sind in Browser- und Node-Platform `true`. `@napi-rs/canvas` bleibt optional (OCR-Raster und pdf-to-images in Node).
