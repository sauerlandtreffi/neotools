# Mitarbeiten an NeoTools

Danke für dein Interesse. NeoTools ist ein pnpm-Monorepo (TypeScript `strict`, Node 22, pnpm 10) mit einer
isomorphen Tool-Engine, die im Browser (Worker), in Node (CLI/API) und im Desktop (Tauri) identisch läuft.
Grundprinzip jeder Änderung: **Dateien verlassen den Rechner nicht** — kein Upload, kein CDN zur Laufzeit,
kein Tracking, keine AGPL-Abhängigkeit.

Verwandt: [README.md](./README.md) · [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) ·
[docs/ROADMAP.md](./docs/ROADMAP.md) · [SECURITY.md](./SECURITY.md) · [docs/PLUGINS.md](./docs/PLUGINS.md)

## Setup

```bash
corepack enable                 # pnpm-Version aus package.json (packageManager)
pnpm install                    # postinstall kopiert WASM-Assets, lädt tessdata (--optional)
pnpm -r build                   # alle Workspace-Pakete
pnpm -r test                    # Vitest je Paket
pnpm -r typecheck               # tsc --noEmit je Paket (~3 min)
pnpm lint                       # ESLint flat config (Root)
pnpm format:check               # Prettier (siehe .prettierignore)
pnpm e2e                        # Playwright-Smokes gegen apps/web/dist (baut bei Bedarf)
node scripts/check-i18n.mjs     # de/en-Dictionary + categoryLabels müssen deckungsgleich sein
```

Weitere Skripte: `pnpm dev` (Astro-Dev der Web-App), `pnpm cli` (Alias auf `apps/cli`),
`node scripts/copy-wasm-assets.mjs`, `node scripts/fetch-tessdata.mjs`,
`node scripts/fetch-ffmpeg-lgpl.mjs` (LGPL-FFmpeg-Core aus dem eigenen GitHub-Release, gitignored).

Playwright braucht einmalig Chromium:
`pnpm --filter @neotools/web exec playwright install chromium --with-deps`.

Vor einem PR sollten `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint` und
`node scripts/check-i18n.mjs` grün sein — CI (`.github/workflows/ci.yml`) prüft genau das plus `pnpm e2e`.

## Struktur

```
packages/engine          defineTool, Registry, Pipeline, Batch, Provenance, Verify-Hook, Plattform-Typen
packages/license         Offline-Ed25519-Lizenz (Gates nur für Plattform-Extras)
packages/parsers         JPEG/PNG/TIFF-Parser (geteilt)
packages/models          ONNX/Whisper-Katalog (same-origin, kein CDN)
packages/tools-<pack>    ein Pack je Paket: pdf, forensics, image, image-ai, dach, office, media, speech,
                         archive, creator — src/tools/<tool-id>.ts, src/licenses.ts, src/index.ts, test/
packages/plugins/*       Community-Plugin-Beispiele (nicht im Kern registriert, siehe docs/PLUGINS.md)
apps/web                 Astro 5 + Preact + Tailwind 4, Tool-Worker via Comlink, statische Seiten aus Registry
apps/cli                 dieselben Tool-Definitionen, Zod-Optionen → Flags
apps/api                 Fastify REST-Sidecar (Compose-Profil api)
apps/desktop             Tauri 2 (Reader, Dateizuordnung, Deep-Link)
deploy/docker            nginx-static + optionale API, branding.json zur Build-Zeit
docs/                    Architektur, Roadmap, Backlog, Deployment, Security-Review, Plugins, Branding
scripts/                 Asset-Kopien, tessdata, LGPL-FFmpeg-Fetch, i18n-Check
```

**Import-Richtung:** `apps/*` → `packages/engine` + Packs. Packs importieren nur `engine`, `parsers`,
`models` und erlaubte Libs. Packs importieren einander nur, wenn es das `package.json` des Packs
ausdrücklich deklariert (z. B. `tools-creator` → `tools-image`, `tools-media`). Die Engine kennt kein DOM.

## Ein Tool anlegen

Jedes Tool ist eine Datei `packages/tools-<pack>/src/tools/<tool-id>.ts`, die `defineTool` aus
`@neotools/engine` aufruft. Vorbilder: `packages/tools-pdf/src/tools/pdf-rotate.ts` (Batch, Provenance)
oder `packages/tools-creator/src/tools/creator-meme-ratios.ts` (Raster, ZIP-Ausgabe).

```ts
import { z } from 'zod';
import { defineTool, MIME, mapFiles, createProvenance, attachProvenance } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';

const options = z.object({
  angle: z.coerce.number().default(90),
  pages: z.string().default('all'),
});

export const pdfRotate = defineTool({
  id: 'pdf-rotate', // kebab-case, Präfix = Pack
  pack: 'pdf',
  category: 'pdf', // muss in apps/web/src/lib/i18n.ts categoryLabels (de + en) existieren
  title: { de: 'PDF drehen', en: 'Rotate PDF' },
  description: { de: '…', en: '…' },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [{ id: 'cw', title: { de: '90° im Uhrzeigersinn', en: '90° clockwise' }, options: { angle: 90 } }],
  licenses: PDF_LICENSES, // Pack-Lizenzliste, keine Ad-hoc-Einträge im Tool
  seo: { keywords: ['pdf rotate', 'pdf drehen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / files.length, file.name);
      // ctx.signal beachten, ctx.log() ohne Dateiinhalte
      return /* NeoFile */;
    });
    const provenance = await createProvenance('pdf-rotate', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
```

Checkliste:

1. **Registrieren:** Tool in `src/index.ts` des Packs in das Tool-Array aufnehmen (`registerXxxTools`).
   Web, CLI und API lesen ausschließlich die Registry (`apps/web/src/lib/registry.ts`,
   `apps/cli/src/cli.ts`, `apps/api/src/optional-packs.ts`); keine Sonderfälle je App.
2. **Optionen** immer als Zod-Schema mit Defaults; die Web-UI und die CLI-Flags werden daraus generiert.
   Passwortfelder: `.describe('password')` oder Feldname enthält `password`.
3. **i18n:** `title`/`description`/Preset-Titel in **de und en**. Neue `category` → `categoryLabels` in
   `apps/web/src/lib/i18n.ts` für beide Sprachen, dann `node scripts/check-i18n.mjs`.
4. **Lizenzen:** Jede neue Laufzeit-Bibliothek (auch dynamisch geladene und Modellgewichte) kommt in
   `src/licenses.ts` des Packs (`{ name, license, url }`) und ggf. in
   `packages/engine/src/licenses.ts` (`PLATFORM_LICENSES`). `/lizenzen`, `/licenses.json` und
   `/THIRD_PARTY_NOTICES.txt` werden daraus generiert. Keine AGPL (Ghostscript, MuPDF, iText). GPL nur als
   dokumentierter, dynamisch gekennzeichneter Übergang (FFmpeg-Core-Fallback).
5. **Kein CDN, kein Tracking:** WASM/Modelle liegen unter `/assets/…` (same-origin) oder werden aus dem
   Dateisystem geladen. `fetch` auf fremde Hosts nur bei ausdrücklicher Nutzer-URL (z. B. TSA).
   `unpkg`, `jsdelivr`, `cdnjs`, Hugging-Face-Hub-Defaults sind verboten.
6. **Tests:** Mindestens ein Vitest je Tool in `packages/tools-<pack>/test/`. Deterministische Ausgaben als
   Golden (Hash/Struktur); lossy Codecs mit Metrikband (Größe/SSIM) statt Binär-Golden. Fixtures klein
   halten (Repo-Limit: keine Dateien > 5 MB).
7. **Privacy-Tools** (`privacySensitive: true`) müssen `verify()` implementieren; die Engine lädt Outputs
   dafür neu von den Bytes. Verify darf nie „still grün“ sein — dokumentierte Grenzen als `advisory` +
   `warnings[]`.
8. **Fehler:** Klartext-Fehlermeldungen ohne Dateiinhalte; Batch bricht bei einer defekten Datei nicht ab
   (`mapFiles` → `ok|error`).
9. **Schwere Engines** (FFmpeg, Tesseract, ONNX, OpenCV) nur lazy (`import()`), nie im Initial-Bundle.

## Querschnittsregeln (aus `docs/ROADMAP.md`)

| Thema   | Regel                                                                                  |
| ------- | -------------------------------------------------------------------------------------- |
| Lizenz  | Jedes neue Pack/jede neue Lib aktualisiert Manifest + `/lizenzen` im selben PR         |
| i18n    | Kein hardcodiertes UI-Deutsch ohne `en`-Pendant                                        |
| Tests   | Neues Tool: mindestens 1 Vitest + Golden oder explizite Begründung (lossy → Metrikband) |
| SEO     | Keine `/convert/a-to-b`-Seite ohne Format-KB-Kante und Tool                            |
| Privacy | Neue Privacy-Operationen am Verify-Hook anmelden                                       |
| Modelle | Dateiname enthält Content-Hash; Service Worker cache-bustet darüber                    |

Zusätzlich: CSP/COOP/COEP-Änderungen immer an **allen** Stellen gleichzeitig (`apps/web/public/_headers`,
`apps/web/vercel.json`, `deploy/docker/nginx.conf`, `apps/web/e2e/server.mjs`, `apps/web/src/middleware.ts`,
Tauri `app.security.csp`) — siehe `docs/SECURITY-REVIEW.md`.

## Code-Stil

- Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`), ESLint flat config im Root.
  `.prettierignore` schützt parallel bearbeitete Bereiche; formatiere nur Dateien, die du änderst
  (`pnpm exec prettier --check <dateien>`).
- ESM (`"type": "module"`), relative Imports mit `.js`-Endung innerhalb der Packs.
- Keine `any`; Zod-Ausgabe typisieren (`z.infer`).
- Deutsch in Nutzertexten (`de`) ist die Primärsprache, `en` muss gleichwertig sein.

## Commits und Pull Requests

Commit-Nachrichten nach [Conventional Commits](https://www.conventionalcommits.org/de/v1.0.0/):

```
feat(image): image-lut mit .cube-Import
fix(pdf): pdfjs workerSrc im Tool-Worker
chore(deps): fflate 0.8.3
docs: CONTRIBUTING ergänzt
test(archive): TAR-Symlink-Fixture
security(api): Job-Owner-Bindung   # oder fix(api): … mit Security-Hinweis im Body
```

Scope = Pack-/App-Name (`pdf`, `image`, `media`, `creator`, `web`, `cli`, `api`, `desktop`, `engine`,
`license`, `docker`). Breaking Changes mit `!` und `BREAKING CHANGE:`-Footer. Ein PR = ein Thema; Tool-PRs
enthalten Tool, Test, Lizenz- und i18n-Anpassung zusammen. `CHANGELOG.md` unter `[Unreleased]` ergänzen.

Sicherheitsrelevante Funde bitte **nicht** als öffentliches Issue, sondern nach [SECURITY.md](./SECURITY.md).

## Lizenz

Mit deinem Beitrag stimmst du zu, dass er unter der [MIT-Lizenz](./LICENSE) des Projekts veröffentlicht wird.
