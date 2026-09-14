🇬🇧 English · [🇩🇪 Deutsch](./CONTRIBUTING.de.md)

# Contributing to NeoTools

Thank you for your interest. NeoTools is a pnpm monorepo (TypeScript `strict`, Node 22, pnpm 10) with an
isomorphic tool engine that runs identically in the browser (workers), in Node (CLI/API) and on the desktop
(Tauri). The basic principle behind every change: **files never leave the machine** — no upload, no CDN at
runtime, no tracking, no AGPL dependency.

Related: [README.md](./README.md) · [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) ·
[docs/ROADMAP.md](./docs/ROADMAP.md) · [SECURITY.md](./SECURITY.md) · [docs/PLUGINS.md](./docs/PLUGINS.md)

## Setup

```bash
corepack enable                 # pnpm version from package.json (packageManager)
pnpm install                    # postinstall copies WASM assets, fetches tessdata (--optional)
pnpm -r build                   # all workspace packages
pnpm -r test                    # Vitest per package
pnpm -r typecheck               # tsc --noEmit per package (~3 min)
pnpm lint                       # ESLint flat config (root)
pnpm format:check               # Prettier (see .prettierignore)
pnpm e2e                        # Playwright smoke tests against apps/web/dist (builds if needed)
node scripts/check-i18n.mjs     # de/en dictionary + categoryLabels must match
```

More scripts: `pnpm dev` (Astro dev server for the web app), `pnpm cli` (alias for `apps/cli`),
`node scripts/copy-wasm-assets.mjs`, `node scripts/fetch-tessdata.mjs`,
`node scripts/fetch-ffmpeg-lgpl.mjs` (LGPL FFmpeg core from our own GitHub release, gitignored).

Playwright needs Chromium once:
`pnpm --filter @neotools/web exec playwright install chromium --with-deps`.

Before opening a PR, `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint` and
`node scripts/check-i18n.mjs` should be green — CI (`.github/workflows/ci.yml`) checks exactly that plus `pnpm e2e`.

## Structure

```
packages/engine          defineTool, registry, pipeline, batch, provenance, verify hook, platform types
packages/license         offline Ed25519 license (gates only for platform extras)
packages/parsers         JPEG/PNG/TIFF parsers (shared)
packages/models          ONNX/Whisper catalog (same-origin, no CDN)
packages/tools-<pack>    one pack per package: pdf, forensics, image, image-ai, dach, office, media, speech,
                         archive, creator — src/tools/<tool-id>.ts, src/licenses.ts, src/index.ts, test/
packages/plugins/*       community plugin examples (not registered in core, see docs/PLUGINS.md)
apps/web                 Astro 5 + Preact + Tailwind 4, tool workers via Comlink, static pages from the registry
apps/cli                 same tool definitions, Zod options → flags
apps/api                 Fastify REST sidecar (Compose profile api)
apps/desktop             Tauri 2 (reader, file associations, deep link)
deploy/docker            nginx static + optional API, branding.json at build time
docs/                    architecture, roadmap, backlog, deployment, security review, plugins, branding
scripts/                 asset copies, tessdata, LGPL FFmpeg fetch, i18n check
```

**Import direction:** `apps/*` → `packages/engine` + packs. Packs import only `engine`, `parsers`,
`models` and approved libraries. Packs import each other only if the pack's `package.json` declares it
explicitly (e.g. `tools-creator` → `tools-image`, `tools-media`). The engine has no DOM dependency.

## Adding a tool

Each tool is a file `packages/tools-<pack>/src/tools/<tool-id>.ts` that calls `defineTool` from
`@neotools/engine`. Good templates: `packages/tools-pdf/src/tools/pdf-rotate.ts` (batch, provenance)
or `packages/tools-creator/src/tools/creator-meme-ratios.ts` (raster, ZIP output).

```ts
import { z } from 'zod';
import { defineTool, MIME, mapFiles, createProvenance, attachProvenance } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';

const options = z.object({
  angle: z.coerce.number().default(90),
  pages: z.string().default('all'),
});

export const pdfRotate = defineTool({
  id: 'pdf-rotate', // kebab-case, prefix = pack
  pack: 'pdf',
  category: 'pdf', // must exist in apps/web/src/lib/i18n.ts categoryLabels (de + en)
  title: { de: 'PDF drehen', en: 'Rotate PDF' },
  description: { de: '…', en: '…' },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [{ id: 'cw', title: { de: '90° im Uhrzeigersinn', en: '90° clockwise' }, options: { angle: 90 } }],
  licenses: PDF_LICENSES, // pack license list, no ad-hoc entries in the tool
  seo: { keywords: ['pdf rotate', 'pdf drehen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / files.length, file.name);
      // honor ctx.signal, ctx.log() without file contents
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

Checklist:

1. **Register:** add the tool to the tool array in the pack's `src/index.ts` (`registerXxxTools`).
   Web, CLI and API read exclusively from the registry (`apps/web/src/lib/registry.ts`,
   `apps/cli/src/cli.ts`, `apps/api/src/optional-packs.ts`); no per-app special cases.
2. **Options** always as a Zod schema with defaults; the web UI and CLI flags are generated from it.
   Password fields: `.describe('password')` or a field name containing `password`.
3. **i18n:** `title`/`description`/preset titles in **de and en**. New `category` → `categoryLabels` in
   `apps/web/src/lib/i18n.ts` for both languages, then `node scripts/check-i18n.mjs`.
4. **Licenses:** every new runtime library (including dynamically loaded ones and model weights) goes into
   the pack's `src/licenses.ts` (`{ name, license, url }`) and, if applicable, into
   `packages/engine/src/licenses.ts` (`PLATFORM_LICENSES`). `/lizenzen`, `/licenses.json` and
   `/THIRD_PARTY_NOTICES.txt` are generated from these. No AGPL (Ghostscript, MuPDF, iText). GPL only as a
   documented, dynamically labelled transition (FFmpeg core fallback).
5. **No CDN, no tracking:** WASM/models live under `/assets/…` (same-origin) or are loaded from the
   file system. `fetch` to foreign hosts only for an explicit user-provided URL (e.g. TSA).
   `unpkg`, `jsdelivr`, `cdnjs` and Hugging Face Hub defaults are forbidden.
6. **Tests:** at least one Vitest per tool in `packages/tools-<pack>/test/`. Deterministic outputs as
   goldens (hash/structure); lossy codecs with a metric band (size/SSIM) instead of binary goldens. Keep
   fixtures small (repo limit: no files > 5 MB).
7. **Privacy tools** (`privacySensitive: true`) must implement `verify()`; the engine reloads outputs from
   bytes for this. Verify must never be "silently green" — documented limits go into `advisory` +
   `warnings[]`.
8. **Errors:** plain-text error messages without file contents; a batch does not abort on one broken file
   (`mapFiles` → `ok|error`).
9. **Heavy engines** (FFmpeg, Tesseract, ONNX, OpenCV) only lazily (`import()`), never in the initial bundle.

## Cross-cutting rules (from `docs/ROADMAP.md`)

| Topic   | Rule                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| License | Every new pack/library updates the manifest + `/lizenzen` in the same PR                    |
| i18n    | No hard-coded German UI text without an `en` counterpart                                    |
| Tests   | New tool: at least 1 Vitest + golden, or an explicit justification (lossy → metric band)    |
| SEO     | No `/convert/a-to-b` page without a format knowledge-base edge and a tool                   |
| Privacy | New privacy operations register with the verify hook                                        |
| Models  | File name contains the content hash; the service worker cache-busts on it                   |

Additionally: CSP/COOP/COEP changes always in **all** places at once (`apps/web/public/_headers`,
`apps/web/vercel.json`, `deploy/docker/nginx.conf`, `apps/web/e2e/server.mjs`, `apps/web/src/middleware.ts`,
Tauri `app.security.csp`) — see `docs/SECURITY-REVIEW.md`.

## Code style

- Prettier (`singleQuote`, `trailingComma: all`, `printWidth: 100`), ESLint flat config in the root.
  `.prettierignore` protects areas being edited in parallel; format only the files you change
  (`pnpm exec prettier --check <files>`).
- ESM (`"type": "module"`), relative imports with `.js` extension inside the packs.
- No `any`; type Zod output (`z.infer`).
- German (`de`) is the primary language for user-facing strings; `en` must be equivalent.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
feat(image): image-lut with .cube import
fix(pdf): pdfjs workerSrc in the tool worker
chore(deps): fflate 0.8.3
docs: extend CONTRIBUTING
test(archive): TAR symlink fixture
security(api): job owner binding   # or fix(api): … with a security note in the body
```

Scope = pack/app name (`pdf`, `image`, `media`, `creator`, `web`, `cli`, `api`, `desktop`, `engine`,
`license`, `docker`). Breaking changes with `!` and a `BREAKING CHANGE:` footer. One PR = one topic; tool PRs
contain the tool, test, license and i18n changes together. Add an entry to `CHANGELOG.md` under `[Unreleased]`.

Please report security-relevant findings **not** as a public issue but as described in [SECURITY.md](./SECURITY.md).

## License

By contributing you agree that your contribution is published under the project's [MIT license](./LICENSE).
