🇬🇧 English · [🇩🇪 Deutsch](./ARCHITECTURE.de.md)

# NeoTools Architecture

Related: [BACKLOG.md](./BACKLOG.md) · [ROADMAP.md](./ROADMAP.md)

Binding decisions. Deviations only with a changelog entry in this document.

## 1. Monorepo layout

```
Neotools/
  pnpm-workspace.yaml
  package.json                 # private root, scripts: build, test, lint
  tsconfig.base.json           # strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes
  packages/
    engine/                    # tool schema, registry, worker runtime, pipeline, error protocol, platform adapters
    format-kb/                 # format knowledge base (JSON), no runtime
    tools-pdf/
    tools-image/
    tools-media/               # ffmpeg.wasm LGPL, WebCodecs
    tools-speech/
    tools-forensics/
    tools-office/
    tools-archive/
    tools-dach/
  apps/
    web/                       # Astro + TypeScript, Preact islands, i18n de/en
    cli/                       # Node, same registry
    desktop/                   # Tauri 2 (Rust shell + web UI)
  deploy/
    docker/                    # nginx image + optional API sidecar
  docs/
```

Workspace protocol: `pnpm`. No npm/yarn lockfile. Every package has `name: @neotools/<id>` and its own `tsconfig` with `extends`.

**Import direction:** `apps/*` → `packages/engine` + packs. Packs → only `engine` + approved libraries. Packs do not import each other; orchestration runs via pipeline IDs.

**Isomorphism:** `packages/engine` and all `run()` functions must not touch `window`/`fs` directly. Access only via `Platform` (section 3).

---

## 2. Tool schema

A tool is a declarative unit. UI, CLI subcommands, pipelines, SEO pages and docs are generated from it. No tool page without `defineTool`.

### 2.1 Types

```ts
import { z } from "zod";

export type LocaleText = { de: string; en: string };

export type MimeOrExt = string; // "application/pdf" | ".pdf"

export interface ToolInputs {
  accept: readonly MimeOrExt[];
  multiple: boolean;
  min?: number;
  max?: number;
  /** Semantic port name for pipeline wiring */
  port?: string;
}

export interface ToolOutput {
  name: string;
  mime: string;
  filename: string;
  bytes: Uint8Array | Blob;
  /** Optional: OPFS handle instead of full bytes (large files) */
  opfsPath?: string;
}

export interface ToolError {
  code: string;          // e.g. "PDF_ENCRYPTED", "INPUT_TYPE"
  message: LocaleText;
  fileId?: string;
  recoverable: boolean;
  cause?: unknown;
}

export interface ProgressEvent {
  phase: "load" | "parse" | "transform" | "encode" | "verify" | "write";
  ratio: number;         // 0..1
  detail?: LocaleText;
}

export interface CancelToken {
  readonly aborted: boolean;
  throwIfAborted(): void;
}

export interface ToolContext {
  platform: Platform;
  progress(ev: ProgressEvent): void;
  cancel: CancelToken;
  log: ErrorJournal;
  /** Mandatory after privacy ops */
  verify?: VerifyFn;
  provenance: ProvenanceBuilder;
}

export interface ToolSeo {
  path: string;                 // "/tools/pdf-merge"
  title: LocaleText;
  description: LocaleText;
  keywords: readonly string[];
  /** Additional static pages, e.g. convert pairs */
  aliases?: readonly string[];
}

export interface ToolPreset<TOptions> {
  id: string;
  title: LocaleText;
  options: TOptions;
}

export interface ToolDefinition<TOptions extends z.ZodTypeAny> {
  id: string;                   // kebab-case, stable
  category: string;
  pack: string;                 // "pdf" | "image" | …
  title: LocaleText;
  description: LocaleText;
  inputs: ToolInputs;
  options: TOptions;
  presets?: readonly ToolPreset<z.infer<TOptions>>[];
  seo: ToolSeo;
  /** If true: the engine calls verify() after run() */
  privacySensitive?: boolean;
  licenses: readonly string[];  // SPDX, for the license page
  run: (
    ctx: ToolContext,
    files: readonly InputFile[],
    options: z.infer<TOptions>,
  ) => Promise<readonly ToolOutput[]>;
}

export interface InputFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  hashSha256?: string;
  bytes?: Uint8Array;
  opfsPath?: string;
}

export function defineTool<T extends z.ZodTypeAny>(
  def: ToolDefinition<T>,
): ToolDefinition<T> {
  if (!/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`Invalid tool id: ${def.id}`);
  }
  return def;
}
```

### 2.2 Example: `pdf-merge` in full

```ts
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { defineTool } from "@neotools/engine";

const optionsSchema = z.object({
  /** Order of input IDs. If missing, upload order applies. */
  order: z.array(z.string()).optional(),
  /** First page of each file as an outline entry */
  outline: z.boolean().default(true),
  /** Drop empty pages at the end of each source */
  dropTrailingEmpty: z.boolean().default(false),
});

export const pdfMerge = defineTool({
  id: "pdf-merge",
  category: "pdf",
  pack: "pdf",
  title: {
    de: "PDFs zusammenführen",
    en: "Merge PDFs",
  },
  description: {
    de: "Mehrere PDF-Dateien lokal im Browser zu einer Datei verbinden. Kein Upload.",
    en: "Merge PDF files locally in the browser. No upload.",
  },
  inputs: {
    accept: ["application/pdf", ".pdf"],
    multiple: true,
    min: 2,
    port: "pdfs",
  },
  options: optionsSchema,
  presets: [
    {
      id: "simple",
      title: { de: "Einfach", en: "Simple" },
      options: { outline: false, dropTrailingEmpty: false },
    },
    {
      id: "akte",
      title: { de: "Akte mit Lesezeichen", en: "File with bookmarks" },
      options: { outline: true, dropTrailingEmpty: true },
    },
  ],
  seo: {
    path: "/tools/pdf-merge",
    title: {
      de: "PDF zusammenführen – lokal, ohne Upload",
      en: "Merge PDF – local, no upload",
    },
    description: {
      de: "PDFs im Browser verbinden. Kostenlos, ohne Wasserzeichen, Dateien bleiben auf dem Gerät.",
      en: "Merge PDFs in the browser. Free, no watermark, files stay on device.",
    },
    keywords: ["pdf merge", "pdf zusammenführen", "pdf verbinden"],
    aliases: ["/de/tools/pdf-zusammenfuehren"],
  },
  privacySensitive: false,
  licenses: ["MIT", "Apache-2.0"], // pdf-lib
  async run(ctx, files, options) {
    ctx.cancel.throwIfAborted();
    if (files.length < 2) {
      throw ctx.log.fail({
        code: "INPUT_MIN",
        message: {
          de: "Mindestens zwei PDF-Dateien.",
          en: "At least two PDF files.",
        },
        recoverable: true,
      });
    }

    const byId = new Map(files.map((f) => [f.id, f]));
    const ordered = options.order
      ? options.order.map((id) => {
          const f = byId.get(id);
          if (!f) {
            throw ctx.log.fail({
              code: "ORDER_UNKNOWN_ID",
              message: { de: `Unbekannte Datei: ${id}`, en: `Unknown file: ${id}` },
              recoverable: true,
            });
          }
          return f;
        })
      : files;

    const out = await PDFDocument.create();
    const n = ordered.length;

    for (let i = 0; i < n; i++) {
      ctx.cancel.throwIfAborted();
      ctx.progress({
        phase: "parse",
        ratio: i / n,
        detail: { de: `Lese ${ordered[i].name}`, en: `Reading ${ordered[i].name}` },
      });

      const bytes = await ctx.platform.readBytes(ordered[i]);
      const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
      const indices = src.getPageIndices();
      const copied = await out.copyPages(src, indices);
      const start = out.getPageCount();
      copied.forEach((p) => out.addPage(p));

      if (options.outline) {
        out.addOutline(ordered[i].name.replace(/\.pdf$/i, ""), [start]);
      }
    }

    ctx.progress({ phase: "encode", ratio: 0.95 });
    const bytes = await out.save();
    const hash = await ctx.platform.sha256(bytes);

    ctx.provenance.record({
      tool: "pdf-merge",
      options,
      inputHashes: await Promise.all(ordered.map((f) => ctx.platform.sha256File(f))),
      outputHash: hash,
    });

    ctx.progress({ phase: "write", ratio: 1 });
    return [
      {
        name: "merged",
        mime: "application/pdf",
        filename: "merged.pdf",
        bytes,
      },
    ];
  },
});
```

`addOutline` is an engine helper around the pdf-lib outline; if the library API differs, encapsulate it in `packages/tools-pdf/src/lib/outline.ts`.

---

## 3. Engine runtime

### 3.1 Worker pool (browser)

- A **pool** of Web Workers, size `navigator.hardwareConcurrency` capped to 2–4 (WASM memory).
- RPC via **Comlink**. Every worker loads packs lazily (`import()`), not the whole monorepo.
- **One job = one tool run** (or one pipeline step). No shared mutable state between jobs.
- **Progress:** the worker posts `ProgressEvent`; the UI binds to the job ID.
- **Cancel:** `AbortController` → worker `cancel.throwIfAborted()` in loops; on hard abort `worker.terminate()` + respawn the worker.
- **Transfer:** `ArrayBuffer` as transferable. Files above the threshold (64 MiB) live in **OPFS**; the worker receives a path, not bytes.

### 3.2 Error protocol

Every run writes to `ErrorJournal`:

| Field | Content |
|---|---|
| jobId | UUID |
| toolId | kebab ID |
| fileId / name | without content |
| inputHash | SHA-256 |
| code | stable error code |
| message | i18n |
| recoverable | bool |
| ts | ISO |

Export as JSON. No file contents, no PII from the document in the log.

### 3.3 Isomorphism: `Platform`

```ts
export interface Platform {
  kind: "browser" | "node" | "tauri";
  readBytes(file: InputFile): Promise<Uint8Array>;
  writeOpfs?(path: string, data: Uint8Array): Promise<void>;
  readOpfs?(path: string): Promise<Uint8Array>;
  sha256(data: Uint8Array): Promise<string>;
  sha256File(file: InputFile): Promise<string>;
  spawnWorker(spec: WorkerSpec): WorkerHandle;
  now(): number;
  fetchAsset(url: string): Promise<ArrayBuffer>; // same-origin / file only
}
```

| Adapter | FS | Worker |
|---|---|---|
| Browser | OPFS + Blob + File System Access | `new Worker(new URL(...), { type: "module" })` |
| Node (CLI, API) | `node:fs/promises` | `worker_threads` + Comlink Node |
| Tauri | `fs` plugin + OPFS in the WebView | like browser; native dialogs via invoke |

WASM modules and models come from `/assets/…` (self-hosted), never from a CDN.

### 3.4 Registry

```ts
registerTool(def);
registerPack(manifest);
getTool(id): ToolDefinition;
listTools(filter?: { pack?: string; phase?: number }): ToolDefinition[];
```

CLI, Astro `getStaticPaths`, pipeline resolver and docs read the same registry.

---

## 4. Pipeline model

```ts
export interface PipelineStep {
  id: string;              // local to the pipeline
  tool: string;            // tool ID
  options: unknown;        // validated against the tool's Zod schema
  /** stepId.port → this input port */
  bind: Record<string, string>;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
  /** Optional team policy */
  policyId?: string;
}
```

**Type compatibility:** every tool declares `inputs.accept` and implicit output MIMEs (from `run` + `seo`/manifest `emits: string[]`). The resolver only connects if the output MIME is in the next `accept` or a registered **adapter step** exists (`pdf-to-images` between a PDF and an image tool).

**Serialization:** `PipelineConfig` is plain JSON, no files. Sharing via **URL hash**:

```
https://neotools.example/#pipeline=<base64url(json)>
```

The hash stays client-side. No server stores the config. Upper limit ~8 KB; above that, download a `.neopipeline.json`.

**Execution:** sequential in phase 1. Parallel only for independent branches (phase 2+, same cancel scope). Intermediate results in OPFS, undo = restore the previous snapshot.

---

## 5. Pack / plugin mechanics

### 5.1 Manifest

```ts
export interface PackManifest {
  id: string;                  // "pdf"
  version: string;             // semver
  title: LocaleText;
  tools: readonly string[];
  licenses: readonly PackLicense[];
  assets: readonly string[];   // WASM, models, relative URLs
  lazy: boolean;
  /** Docker build: pack can be omitted */
  optional: boolean;
}

export interface PackLicense {
  spdx: string;
  component: string;
  url: string;
  note?: string;               // e.g. "FFmpeg LGPL build, no x264"
}
```

Community plugins: same manifest, loaded from `/plugins/<id>/` (self-host) or `node_modules/@neotools-plugin/*`. No remote code from third-party hosts at runtime.

### 5.2 Lazy loading

Web: `import("@neotools/tools-pdf")` only on the tool page or when the pipeline needs the pack. ffmpeg.wasm, Tesseract, ONNX, OpenCV **never** in the initial bundle.

### 5.3 Docker without packs

```dockerfile
# build-arg PACKS=pdf,forensics,dach
ARG PACKS=pdf,image,media,speech,forensics,office,archive,dach
```

The bundler (`apps/web`) receives `import.meta.env.NEOTOOLS_PACKS`. Unlisted packs: no JS, no models in the image. The license page lists only included packs.

---

## 6. Storage layers

| Layer | Content | Lifetime |
|---|---|---|
| OPFS | large files, pipeline intermediates, history, undo snapshots | user-controlled; quota warning |
| IndexedDB | metadata: job, hashes, provenance header, audit log, presets | persistent locally |
| Cache Storage | WASM engines, ONNX/Whisper/WebLLM models | cache, versioned via asset hash in the file name |
| Memory | current job < 64 MiB | end of job |

No cookies for tracking. Optional: self-hosted Plausible, without personal event props.

**History:** IndexedDB shows the list; bytes live in OPFS under `/history/<jobId>/`. Undo restores the last output, not the input (the input stays untouched).

---

## 7. Privacy verification

Applies after every run with `privacySensitive: true` (`pdf-redact`, `pdf-sanitize`, `image-redact`, `image-auto-blur`, `image-metadata` preset `strip-*`, screenshot wash).

Flow:

1. The tool writes the output + machine-readable **hits** (page, bbox, pattern ID).
2. The engine starts `forensics-verify`: renewed text extraction, regex of the same patterns, sample OCR on redacted boxes (pixels must be below threshold, no readable text).
3. UI: checklist hit × status (`removed` / `still visible` / `uncertain`). The user confirms or corrects.
4. Only after confirmation does the job count as `shared-safe`. Download before that is possible, but with a banner.

Verification runs locally, same worker model. Failure ≠ silent OK.

---

## 8. Provenance manifest

Optional JSON, with or next to the output:

```ts
interface ProvenanceManifest {
  version: 1;
  createdAt: string;
  tool: string;
  pipeline?: PipelineConfig;
  options: unknown;            // no file contents
  inputHashes: string[];
  outputHash: string;
  engineVersion: string;
  packVersions: Record<string, string>;
}
```

No PII, no extracted real names. The user can switch provenance off (a team preset may enforce it).

---

## 9. SEO generation

**Sources:** `defineTool.seo` + `packages/format-kb`.

Astro `getStaticPaths` generates:

| Pattern | Source |
|---|---|
| `/tools/<id>` | every tool, de + en |
| `/formats/<format>` | KB entry (container, codec, limits) |
| `/convert/<a>-to-<b>` | KB edge, only if a tool serves the edge |
| `/spec/<platform>` | KB spec (WhatsApp, beA, …) |
| `/guides/<slug>` | manual MDX, links tool IDs |

No doorway pages without a backing tool. `hreflang` de/en. Canonical per locale.

Format KB fields (minimum): `id`, `mimes`, `extensions`, `tools[]`, `limits[]` (size, codec, fps), `notes` i18n. Spec check and export pack presets **read** the KB; they do not duplicate magic numbers.

---

## 10. i18n

- Locales: `de` (default), `en`.
- UI strings: JSON under `apps/web/src/i18n/{de,en}/*.json`.
- Tool `title`/`description`/`seo` live **in the tool definition**, not in the UI JSON files.
- CLI: `--lang de|en`, default `LANG`.
- Routing: `/de/...`, `/en/...` or prefix-free de + `/en` — pin one variant in the web app scaffolding, do not mix.

---

## 11. Desktop (Tauri 2)

| Topic | Decision |
|---|---|
| Shell | Tauri 2, WebView = the same `apps/web` build (or embedded `dist`) |
| File association | `.pdf` → app; Windows registry / macOS `CFBundleDocumentTypes` / Linux `.desktop` |
| Deep link | `neotools://tool/<id>?pipeline=…` |
| Updater | Tauri updater, Ed25519-signed bundles, own endpoint (self-host or project CDN, no forced telemetry) |
| Signing Windows | Authenticode (OV/EV), MSI + NSIS `.exe` |
| Signing macOS | Developer ID + notarization; later |
| PDF reader mode | phase 1: display (pdfjs-dist), search, save, redaction. Forms/signature/comments: follow-up WPs |
| Native FS | do not push large PDFs through the WebView copy; `fs.read` + OPFS mirror |

No Electron.

---

## 12. PWA manifest (required fields)

```json
{
  "name": "NeoTools",
  "short_name": "NeoTools",
  "display": "standalone",
  "start_url": "/",
  "file_handlers": [
    {
      "action": "/open",
      "accept": { "application/pdf": [".pdf"] }
    }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": { "files": [{ "name": "file", "accept": ["*/*"] }] }
  },
  "shortcuts": [
    { "name": "PDF mergen", "url": "/tools/pdf-merge" },
    { "name": "Schwärzen", "url": "/tools/pdf-redact" },
    { "name": "Sicher teilen?", "url": "/tools/forensics-share-safe" }
  ]
}
```

Service worker: precache app shell + active locale; engines on demand in Cache Storage. Offline: all packs already loaded.

---

## 13. CLI

Package: `@neotools/cli`, binary `neotools`.

```
neotools run <tool> [options] <files…>
neotools pipeline <file.json>
neotools watch <dir> --tool <id> [--out <dir>] [--debounce ms]
neotools list [--pack pdf]
neotools inspect <file>          # forensics-identify
```

Options: the Zod fields 1:1 as `--kebab-case`. `--json` for machine output. Exit codes: `0` OK, `2` validation, `3` tool error, `4` verify failed, `130` cancel.

`watch` = Node `fs.watch` / chokidar, same `run()` function. Team presets: `--policy ./policy.json`.

---

## 14. Docker / white-label

Two images:

1. **`neotools-web`:** nginx, static Astro output, `/assets` models + WASM. No Node in the request path.
2. **`neotools-api` (optional):** Node sidecar, same engine, REST:

   `POST /v1/run/:tool` multipart; `POST /v1/pipeline`; synchronous or local job queue.

`branding.json` (mount):

```json
{
  "name": "Kanzlei-Werkzeuge",
  "logo": "/brand/logo.svg",
  "primary": "#1a2744",
  "hiddenTools": [],
  "defaultPolicy": "team-presets.json",
  "plausible": null
}
```

nginx serves branding files; the web app reads `/branding.json` at boot time.

**License key (self-host white-label):** offline verification. Payload (org, packs, expiry) + **Ed25519 signature** with the project public key in the binary. No phone-home. If the key is missing: the build runs as Community (branding placeholders, all free packs).

---

## 15. License compliance

| Rule | Implementation |
|---|---|
| License page | `/licenses` generated from all loaded `PackManifest.licenses` + root NOTICE |
| FFmpeg | **LGPL build only**, no x264/x265, no GPL enable. H.264 encoding via **WebCodecs** (browser) or refuse with a clear message |
| AGPL | Ghostscript, MuPDF, iText **forbidden** — not even optionally |
| SheetJS | Community only, no Pro |
| Models | self-host; license per model in the manifest (e.g. Whisper Apache-2.0, Kokoro) |
| Tesseract traineddata | deu+eng in the image, further languages as optional same-origin download |
| Community plugins | must ship manifest + SPDX, otherwise no load |

CI job: `pnpm licenses:check` fails on AGPL/unknown SPDX in the graph.

---

## 16. Security headers

Multi-threaded WASM (ffmpeg, ONNX, wasm-bindgen) needs isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

CSP (sketch):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:;
connect-src 'self';
img-src 'self' blob: data:;
style-src 'self' 'unsafe-inline';
font-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
```

No `unsafe-eval` except WASM. No third-party pixels. File picker and clipboard only via user gesture.

Tauri: `dangerousRemoteDomainIpcAccess` off; IPC whitelist.

---

## 17. Test strategy

| Layer | Tool | What |
|---|---|---|
| Engine, schema, pipeline resolver, platform mocks | **Vitest** | Zod rejects, cancel, progress order, MIME binding, journal without PII |
| Pack `run()` | Vitest + **golden files** | per tool: `tests/goldens/<id>/in.*` → hash or structured compare of the output. No binary goldens for lossy codecs: SSIM/size band |
| Privacy path | Vitest | redact: the string must no longer appear in the extract; verify must `fail` if the box is too bright |
| Web | **Playwright** | smoke per wave: upload → option → download; i18n switch; PWA manifest present |
| CLI | Vitest spawn | `neotools run pdf-merge a.pdf b.pdf` exit 0, file not empty |
| Docker | smoke-compose | `/` 200, COOP/COEP set, `/licenses` contains pdf-lib and not Ghostscript |

Golden update only with an explicit `GOLDEN_UPDATE=1` and review. Test files: synthetic, no real ID cards/invoices with real data.

---

## 18. Dependencies (runtime, self-hosted)

| Area | Lib | Ban / condition |
|---|---|---|
| PDF | pdf-lib, pdfjs-dist v4/5, qpdf WASM, optional PDFium WASM | no MuPDF, no iText, no Ghostscript |
| OCR | Tesseract.js deu+eng | models local |
| Image | jSquash, heic-decode, UTIF | OpenCV.js only lazily (document photo) |
| Video | ffmpeg.wasm **LGPL**, mp4box.js, mp4-muxer, WebCodecs | no x264/x265 |
| ML | ONNX Runtime Web (WebGPU), Transformers.js v3, kokoro-js, WebLLM | no CDN |
| Office | SheetJS Community, mammoth/docx | no SheetJS Pro |
| Archive | JSZip/fflate, libarchive.js or 7z-wasm | |
| Codes | zxing-wasm | |

Everything from `/assets` or the bundle. No runtime CDN dependency.
