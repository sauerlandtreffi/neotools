🇬🇧 English · [🇩🇪 Deutsch](./FRONTEND-REDESIGN.de.md)

# NeoTools Frontend Redesign — Workspace Concept

**Status:** concept, binding for UI work from wave W0  
**As of:** 2026-09-14  
**Scope:** `apps/web` (Astro + Preact), integration with `packages/engine`, Tauri desktop, PWA  
**Non-goals of this file:** code changes, bundle builds, pack implementation. Integration work running in parallel is unaffected.

Related: [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) · [BACKLOG.md](./BACKLOG.md)

---

## 0. The brief in one sentence

Open a document and, **in one tab**, compress it, reorder pages, redact, sanitize, OCR, sign and export one after another — without switching tool pages, without reopening, with undo/redo and a visible step stack. The same for images, audio/video and office documents.

This is not a skin over today's tool gallery. It is a second, document-centric product on the same engine.

---

## 1. Current-state analysis

### 1.1 What actually exists today

The architecture sketch (`ARCHITECTURE.md` §9) speaks of `/tools/<id>`. **In the code, tool pages live at `/{id}` and `/en/{id}`** (`pages/[toolId].astro`). Canonical URLs, sitemap, PWA shortcuts, compare links and Playwright smokes use these paths. The redesign must not bend them.

| Surface | Route (de / en) | Role | Interactive island |
|---|---|---|---|
| Marketing + tool grid | `/`, `/en` | SEO entry, pack teasers, ~186 visible tool cards | `HomeSearch` |
| Tool run | `/{id}`, `/en/{id}` | one task, one form, one download | `ToolApp` |
| PDF display | `/reader` | pdf.js, thumbs, search, forms, annotations | `Reader` |
| Multi-step | `/pipeline` | choose steps, MIME check, hash `#p=` | `PipelineBuilder` |
| Local runs | `/verlauf` / `/en/history` | IDB metadata + OPFS blobs, re-download, re-run | `HistoryApp` |
| PWA/share entry | `/open` | MIME → tool list; PDF → reader handoff | `OpenApp`, `ReaderLaunch` |
| Folder automation | `/watch` | license gate, directory picker, rules | `WatchApp` |
| SEO corpus | `/formats/*`, `/convert/*`, `/spec/*`, `/guides/*`, `/vergleich/*` | static, prerendered, hreflang | hardly any interaction |
| Legal/meta | `/impressum`, `/datenschutz`, `/lizenzen`, `/no-upload`, `/offline`, `/preise`, `/ueber` | trust, compliance | theme, license footer |

Global chrome: `layouts/Base.astro` — header, footer, `CommandPalette` (⌘K, **page search**), `ShortcutHelp` (`?`), `UpdateBanner`, `DesktopEvents`, theme init, service worker registration. `main` is `max-w-6xl`, except the reader (`wide`).

**No `/app`, no `/workspace`, no document-wide undo, no warm worker pool.**

### 1.2 Information architecture (today)

```
Landing / ⌘K / search
        │
        ├─► /{toolId}  ── drop ── ZodForm ── [Run] ── download
        │         │                              │
        │         │                              ├─► /reader   (handoff, PDF only)
        │         │                              └─► /pipeline (1-step hash)
        │         └─ ui.editor: redact | image-boxes | media-trim | doc-preview | transcript
        │
        ├─► /reader ── tool button ── location.assign(/{toolId}?from=reader)
        │                                    (bytes via IndexedDB handoff, 1 file)
        ├─► /pipeline ── choose files again ── runPipeline
        ├─► /verlauf ── re-run ── back to /{toolId}?rerun=
        └─► /open ── PDF→reader, otherwise link list of matching tools
```

The UI's mental model is **tool first**. The file is a consumable of one run. Exactly the opposite of the user requirement.

### 1.3 Navigation paths and state loss

| Path | What happens | What is lost |
|---|---|---|
| Card "Merge PDFs" | full load of `/{id}`, empty DropZone | nothing (no document yet) |
| Reader → `pdf-redact` | `putHandoff` + `location.assign` | reader zoom, page, search, unsaved annotations unless persisted before; **no way back as a session** |
| Redact result → reader | `putHandoffResult` + `?result=1` | mark undo, option state |
| Tool → "Save as pipeline" | hash with **one** step | files not in the URL (correct), but not in a session either |
| History → re-run | options + optional inputs from OPFS | other files of the session, intermediates, selection |
| Pipeline library | preset loads steps | files must be chosen again |
| ⌘K | navigation to a **different URL** | the entire island state |

`ToolApp` holds files as `WorkerFile[]` (`name`, `mime`, `data: Uint8Array`) in Preact `useState`. Every run does `createToolWorker()` — **a new worker, no pool**, often followed by `terminate()`. Large files sit fully in the page's RAM **and** are transferred to the worker again.

"Undo" on the tool page means `setPhase('input')` — back to the form, **not** one step back in the document.

### 1.4 Friction points (by audience)

**Law firms / tax consultants (Steuerberater) / public authorities**

- Case file: merge → Bates → redact → sanitize → beA check → export are **five pages**, five uploads or handoffs.
- Team presets (`applyTeamPresets`, `lockedKeys`, `requiredPipelines`) take effect but are invisible day to day: a lock icon in the Zod form, nothing else.
- Verification is a checklist **after** the run (`VerificationBlock`), not a seal on the document.
- Reports as raw `JSON.stringify` — useless for case workers.
- No "this file is share-safe" at export, only a banner-like block in the result phase.

**Creators / private users**

- Image: crop on `/image-crop`, metadata on `/image-metadata`, export pack elsewhere — the canvas is lost.
- Media: `MediaTrimEditor` is a `<video controls>` plus number fields, no waveform, no scrubbing of in/out marks on the timeline.
- "Make it fit" is explicitly marked as later in the i18n dictionary (`makeFitLater`).
- The homepage grid with 180+ cards is a catalog, not a workplace.

**Everyone**

- Re-parse: every tool reloads bytes; pdf.js in the reader **and** in the RedactEditor **and** in the worker.
- Options as a long Zod form **above** the preview, not next to it.
- Mobile: header with 9+ links wraps; reader sidebar fixed `14rem`; DropZone padding large, action density low.
- File > 500 MB: warning text, no streaming path in the UI (the OPFS threshold from the architecture is not wired in `ToolApp`).

### 1.5 Design system status

| Topic | Current | Gap |
|---|---|---|
| Tokens | `@theme` + `:root` / `:root.dark`: `--bg --fg --muted --card --line --accent --accent-fg`; brand colors `--brand-*` from `branding.json` | no spacing/radius/motion scale, no semantic tokens for OK/warn/lock/network |
| Type | `--font-sans` = **Iowan Old Style / Palatino** (serif); mono = IBM Plex / Cascadia | serif carries body text well, UI chrome (tables, dense toolbars) badly; no UI sans, no tabular numerals |
| Color | paper `#f3efe4`, ink `#10221c`, mint, rust | strong character but "editorial brochure", not "work surface"; rust doubles as warning and accent — conflict |
| Dark mode | class `dark` on `<html>`, `localStorage['neotools-theme']`, inline init | `ThemeToggle` is a text button "Darstellung"; no `prefers-color-scheme` after the first choice; reader pages invert via CSS filter |
| Components | ad-hoc Tailwind in islands; reader has its own `Reader.css` | no AppShell, no toast system, no drawer primitive, no shared toolbar |
| a11y | `focus-visible` 2px accent; `.sr-only`; dialog roles on palette/shortcuts | no skip links; palette without arrow keys/aria-activedescendant; progress without `aria-live`; reader canvas without page announcement; BITV contrast of the serif on mint unmeasured |
| Mobile | `viewport` set; grids `sm:`/`md:` | reader not viewport-broken; touch targets 32–36px; no bottom sheet |
| Motion | hover `-translate-y-0.5` on cards | no `prefers-reduced-motion`; no defined durations |

**Privacy chrome today:** header stamp "Lokal · kein Upload · kein Tracking" (local · no upload · no tracking); `NetworkStatus` counts **foreign** resource transfers (PerformanceObserver), link to `/no-upload`. This is honest — and too small to carry as a product promise. It only sits **inside** `ToolApp`, not globally.

### 1.6 Load time and bundle

| Mechanism | Current | Effect |
|---|---|---|
| Page model | Astro `output: 'static'`, islands `client:load` / `client:idle` | SEO pages fast; every tool page hydrates `ToolApp` + Zod + DropZone |
| Registry in the bundler | `lib/registry.ts` registers **all** packs at build time (sitemap, fields, FAQ) | `astro build` needs `max-old-space-size=7168`; the tool page itself does not run `run()` on the main thread |
| Worker | `new Worker(tool-worker.ts)` **per run** | cold start: pack `import()`, pdf.js `loadPdfjs()` already at worker boot; ffmpeg/ONNX/Tesseract only per pack |
| WASM/models | `/assets/*`, Cache Storage planned, confirm dialog `ModelConfirm` | good; no warm pool, no prefetch by file type |
| File I/O | `file.arrayBuffer()` immediately on drop | 200 MB PDF = 200 MB in React state + a copy in the worker |
| History | meta IndexedDB, blobs OPFS (fallback IDB), default 200 MB / 24 h | good as a shell for the session bin; today **per job**, not per document session |
| Lazy UI editors | `ui.editor` switches redact/image/media/doc/transcript | model for workspace modes; coupled to tool ID, not MIME |

`createToolWorker` is **not** a pool, although `ARCHITECTURE.md` §3.1 specifies a pool (2–4, Comlink, cancel, OPFS path). The UI must demand the pool; the engine must deliver it.

### 1.7 What is already workspace-like (do not throw away)

- `Reader`: shell, thumb rail, outline, search, zoom, keyboard, desktop save, dirty flag — **PDF canvas v0**.
- `RedactEditor`: page thumbs, canvas overlay, mark undo, auto hits, `previewRedact` in the worker — **first real editor**.
- `PipelineSpec` + `validatePipeline` + `#p=` + library presets — **step stack data model**.
- `runTool` + `verify` + `attachVerification` + `privacySensitive` — **trust display**.
- `applyTeamPresets` / `locked` / `hiddenTools` / `requiredPipelines` — **branding/locks**.
- `HistoryStore` + OPFS — **persistence core**.
- `inputs.accept` + `outputs.mime` + `whenMime` — **raw context filter**.
- `ui.editor` — **hook for which canvas type**.
- Handoff, PWA `file_handlers`, Tauri `read_opened_file` / `neotools://` — **file in, without upload**.

The leap is: **not** orchestrating these parts as separate pages, but as **one session around a document**.

---

## 2. Target concept "Workspace"

### 2.1 Product principles (non-negotiable)

1. **Document first.** The file stays visible while tools work on it.
2. **One tab, one stack.** Every operation is a pipeline step on the current document (or a selection), not a new page.
3. **Nothing leaves the device.** Privacy is chrome, not a footnote: local indicator, network zero, verify seal.
4. **SEO pages remain landings.** `/{id}` explains, convinces, accepts the file — and **opens the workspace** with the tool preselected.
5. **Same engine.** No second `run()`. The UI maps onto `defineTool` / `PipelineSpec` / `verify` / presets.

### 2.2 Route and name

| Public | Internal | Purpose |
|---|---|---|
| `/app` | Preact SPA island, `client:only` | canonical work surface |
| `/en/app` | same island | locale |
| `/workspace`, `/en/workspace` | **301/alias** to `/app` | memorable URL, docs, desktop |
| Deep link | `/app?tool=pdf-redact&pages=1-3` | SEO CTA, PWA shortcut, `neotools://app?tool=` |

The PWA `start_url` stays `/` (marketing/SEO). File handlers and share target point to **`/app`** (today `/open`). The desktop `.pdf` file association opens `/app` with the file, not just reader mode.

Rationale for `/app` instead of just `/workspace`: short, language-neutral, suitable as a PWA scope split (`/app` vs. the rest of the static site). Alias `/workspace` for humans and DACH copy.

### 2.3 Information architecture (target)

```
Marketing / SEO / ⌘K pages           Work surface (no SEO index)
───────────────────────────          ────────────────────────────
/  /formats  /convert  /guides       /app  = session
/{pdf-redact}  (landing)  ────────►    FileTray │ DocCanvas │ StepStack
/pipeline (redirect/embed) ───────►    ActionBar + ⌘K (actions, not pages)
/reader   (redirect/embed) ───────►    OptionsPanel | Diff | ExportDrawer
/verlauf  = session list   ───────►    reopen sessionId
/open     301 → /app
```

Two worlds, one engine. The boundary is deliberate: **prerendered trust** vs. **hydrated work**.

### 2.4 Main view — desktop

```
+------------------------------------------------------------------------------+
| [NT] NeoTools          ● LOCAL  ○ Net 0 B      Case Müller  v   [DE|EN] [☽] |
|  Files  Steps  History               Search in file…              ⌘K  Export |
+----------+-----------------------------------------------+-------------------+
| FILETRAY |  TOOLCHROME                                    | STEP STACK       |
| Session  |  PDF · 12 p. · 3.1 MB · not share-safe         | 1 compress  ✓    |
|          |  [Compr][Order][Redact][Sanitize][OCR]…        | 2 reorder   ✓    |
| v Antrag |                                                | 3 redact    ●    |
|   p.1-12 |  +--------+  +---------------------------+     | 4 sanitize  ·    |
|   ●p.3   |  |  1     |  |                           |     |                  |
|   p.4    |  | [thumb]|  |      DOCUMENT CANVAS      |     | Undo  Redo       |
|          |  |  2     |  |      page 3 / 12          |     | As pipeline      |
| v Foto   |  |  3 ### |  |      [redaction live]     |     |                  |
|   img    |  |  4     |  |                           |     | OPTIONS          |
|          |  +--------+  +---------------------------+     | Pattern ☑ IBAN   |
| + File   |                                                | ☑ Tax ID         |
|          |  FINDINGS: 3 IBAN · 1 JS · 2 attachments [Clean]| Strength ████░   |
+----------+-----------------------------------------------+-------------------+
| Progress: redact  ████████░░  72%   verifying…                       [Cancel]|
+------------------------------------------------------------------------------+
```

`###` = active page. The findings bar appears after auto-analysis, not as a modal.

### 2.5 Main view — mobile (≤ 768 px)

```
+---------------------------+
| ● LOCAL  Antrag.pdf   ☰   |
+---------------------------+
| [ <1  2  3● 4  5> ] thumbs|
|                           |
|      CANVAS / PLAYER      |
|                           |
+---------------------------+
| 3 IBAN  [Now]             |
+---------------------------+
| (Compr) (Rot) (Redact) →  |   horizontal ActionBar
+---------------------------+
| [Files] [Steps 3] [↓]     |   bottom nav: tray | stack | export
+---------------------------+
```

Options and step stack are **sheets** (height 50–90 %), not permanent columns. Command palette = full-screen search. Drop onto the window stays global.

### 2.6 File storage (session bin)

**Session** = one local unit of work (default name from the first file + date). Multiple files, mixed types.

| Layer | Content | Where |
|---|---|---|
| Memory | active document handle, thumb bitmaps, selection | main + worker |
| OPFS `/sessions/{id}/files/{fileId}` | bytes, intermediates, undo snapshots | quota warning from 80 % |
| IndexedDB `neotools-sessions` | metadata, steps, findings, UI cursor | persistent until the user deletes |
| History (existing) | completed exports / jobs, journal without PII | `/verlauf` lists sessions **and** legacy jobs |

Rules:

- Drop / paste / file picker / PWA / share / Tauri open **attach to the open session**, they do not silently replace it.
- PDF merge is an action **on several tray entries**, not a special upload.
- Closing the tab: the session stays (OPFS). Banner on the next `/app`: "Case Müller · 12 min ago".
- "Delete everything" as in the history: two confirmations, then OPFS+IDB of the session.
- Team preset `keepInputs: false` analogous to the history settings: after export only output + manifest.

Connection to the current state: extend `HistoryStore` or add a `SessionStore` next to it with the same blob backend (`opfsBlobStore` / `idbBlobStore`). Not two quota worlds.

### 2.7 Document canvas (four families)

The family follows MIME → `workspaceFamily` (engine field, fallback heuristic). One canvas host, four adapters:

| Family | Adapter | Core surfaces | First tools |
|---|---|---|---|
| `pdf` | pdf.js + overlay | pages, text layer (invisible, for search), boxes, thumbs | compress, reorder, rotate, redact, sanitize, ocr, sign, lock, watermark, forms, pdf-a |
| `image` | Canvas 2D / WebGL lazy | zoom, boxes, color picker, before/after wipe | crop, resize, compress, metadata, redact, doc-repair |
| `media` | `<video>`/`<audio>` + waveform (WebAudio peaks, off-thread) | timeline, in/out, optional video crop | convert, trim, fit, extract, normalize |
| `office` | HTML preview (mammoth / sheet grid read-only) + PDF fallback | structure, no office WYSIWYG lie | metadata, to-pdf, sanitize-ish, erechnung |

Multiple files: the tray chooses the **focus**. Split view only for `pdf-compare` / `forensics-bytes-compare` (two handles, one "compare" stack).

### 2.8 Action bar and command palette

Two levels, one source: **the tool registry**.

**ActionBar** (visible, 6–10 primary actions + overflow "More"):

- Filter: `inputs.accept` ∩ focus MIME, not `hiddenTools`, pack loaded or lazy allowed.
- Rank: `tool.workspace?.priority`, otherwise heuristic (PDF: compress, reorder, redact, sanitize, ocr, export).
- Disabled + tooltip if the selection is missing (`requires: ['pages']` and nothing selected).
- Locks from `getAppliedPresets().locked` shown as a lock, not hidden.

**Command palette (⌘K) in the workspace** — **no page change**:

```
> reda
  Redact                       pdf-redact      on selection / findings
  Redaction pattern IBAN       preset
  Check share-safe             forensics-share-safe
── Navigation (second group, Enter = leave) ──
  Help: redaction              /guides/…
```

Groups: *On this document* · *On selection* · *Pipeline* · *Session* · *Pages (SEO)*. The first three call `enqueueStep`. The last may navigate.

Today's global palette in `Base.astro` stays on marketing/SEO pages. In `/app` the workspace palette replaces it (one instance, two modes).

### 2.9 Non-destructive step stack

Every applied command:

```
SessionFile.revision[n] = {
  stepId,
  toolId,
  options,          // Zod-parsed, presets merged
  selection,        // pages | region | timeRange | fileIds
  inputHash,
  outputHash,       // after the run
  outputRef,        // OPFS
  verification?,    // verify hook
  provenance,       // createProvenance
}
```

- **Display** is always `revision[head]`.
- **Undo/redo** moves `head`; bytes come from the snapshot, not from an inverted op (too risky with lossy).
- Snapshot strategy: output to OPFS after each step; optional **delta** later (wave 3+). PDF < 32 MB: full snapshot acceptable.
- "Save as pipeline" serializes `steps[]` **without** bytes → existing `encodePipelineHash` / `.neopipeline.json`.
- Team `requiredPipelines` are **appended, not secretly prepended**: visible gray mandatory steps ("Policy: sanitize before sending").

This is `PipelineSpec` plus session binding. `runPipeline` remains the executor; the UI may call intermediate steps individually (`runTool`) to keep the live preview.

### 2.10 Inline options

`ZodForm` moves into `OptionsPanel` (desktop right below the stack, mobile sheet).

Rules:

- Fields that **are** the selection (`pages`, `regions`, `startSec`) are **not** shown as empty arrays — they come from the canvas.
- `locked` keys: read-only + policy source (`organization`).
- Preset chips at the top (already in `ToolApp`).
- Destructive tools (`privacySensitive` or `workspace.destructive`): panel header in rust, verify note **before** run.
- Live fields (`quality`, `dpi`, `crf`, `targetBytes`): debounce 200 ms → `preview()` if the engine can, otherwise a size estimate.

### 2.11 Live preview / diff

| Mode | When | Display |
|---|---|---|
| Overlay | redact, crop, watermark | on the current canvas, not yet committed |
| Wipe | compress, repair, sanitize raster | before/after slider on the same page |
| Report | sanitize, forensics, beA, PDF/A | structured list, no raw JSON as primary |
| Verify | after a privacy-sensitive commit | hit × status, seal |
| Waveform diff | audio normalize / trim | peaks before/after |

`verify` stays fail-closed (`run-tool.ts`). The UI may **not** show a green seal if `sharedSafe !== true` or `warnings.length > 0` (as `VerificationBlock` does today).

### 2.12 Export drawer

Not a "download button below a file list", but a drawer with mandatory questions:

1. What: current head / selected files / entire tray  
2. Format: original MIME · PDF · ZIP bundle  
3. File name: tokens `{name}-{date}-{step}`, team default  
4. Attach: provenance JSON yes/no (a preset may enforce it)  
5. **Share-safe check**: last verify + optional `forensics-share-safe`  
6. Target: download · file picker (desktop) · "put into session" (no download)

Download before verify passes: possible, banner **in the drawer**, not silent.

### 2.13 Batch

Same `PipelineSpec` on N tray files of the same family.

- UI: tray multi-select → "Apply stack".
- Executor: existing `mapFiles` (one error does not kill all).
- Progress: file i/N + step k/m, cancelable per file.
- Result: protocol table (today `report.batch`) + optional ZIP.

50 files: worker pool (2–4), not 50 workers.

### 2.14 Mapping onto the existing engine

| UI | Engine today | Extension |
|---|---|---|
| ActionBar / ⌘K actions | `listTools()`, `inputs.accept`, `title` | `workspace` metadata, `outputs.mime` mandatory |
| Step stack | `PipelineSpec.steps`, `validatePipeline`, `whenMime` | `selection` on the step; session binding |
| OptionsPanel | `zodObjectFields` + `ZodForm` + `lockedKeys` | hide selection fields from the schema |
| Verify seal | `tool.verify`, `privacySensitive`, `attachVerification` | UI states `idle \| running \| passed \| failed \| advisory` |
| Branding / locks | `applyTeamPresets`, `branding.json`, `hiddenTools` | visible policy bar |
| Provenance | `createProvenance`, manifest on the report | export drawer toggle |
| Handoff / open / desktop | IDB + Tauri invoke | write into SessionStore, not into a one-way slot |
| History | `HistoryStore.save` after job | session as the parent entity; job = export or single-step audit |

`defineTool` remains the single source for names, FAQ, licenses, presets. The workspace UI **generates** itself from it; it does not hard-code 180 buttons.

### 2.15 Required engine extensions

Do not rename existing fields (`inputs.accept` stays). Add:

#### A. Declared I/O family and workspace hints

```ts
/** Addition to ToolDefinition — all fields optional for backwards compatibility */
export type WorkspaceFamily = 'pdf' | 'image' | 'media' | 'office' | 'archive' | 'data';

export type SelectionKind = 'pages' | 'region' | 'timeRange' | 'fileIds' | 'textQuery';

export interface ToolWorkspaceMeta {
  family: WorkspaceFamily | readonly WorkspaceFamily[];
  /** ActionBar rank, smaller = further to the front */
  priority?: number;
  /** Grouping in ⌘K and overflow */
  verb?: 'transform' | 'inspect' | 'protect' | 'export' | 'compare';
  requires?: readonly SelectionKind[];
  destructive?: boolean;
  /** Can deliver a preview without a full encode */
  previewable?: boolean;
}

// ToolDefinition +=
workspace?: ToolWorkspaceMeta;
/** Make mandatory in wave W1, often already set today */
outputs: ToolOutputs;
```

#### B. Standard selection (Zod building blocks)

Many tools invent `regions`, `order`, `startSec` in parallel. The engine provides schemas, tools **extend** them:

```ts
import { z } from 'zod';

export const pagesSchema = z.object({
  /** 1-based, inclusive; empty = all */
  pages: z.array(z.number().int().positive()).optional(),
});

export const regionSchema = z.object({
  regions: z
    .array(
      z.object({
        page: z.number().int().positive().optional(), // PDF
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        unit: z.enum(['pdf', 'px', 'norm']).default('norm'),
      }),
    )
    .optional(),
});

export const timeRangeSchema = z.object({
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
});

export const fileIdsSchema = z.object({
  fileIds: z.array(z.string()).optional(),
  order: z.array(z.string()).optional(),
});
```

`RedactEditor.regions`, `ImageBoxEditor.boxesJson`, `MediaTrimEditor.startSec` converge on these. The UI writes **only these keys**.

#### C. Document handle (no re-parse per step)

```ts
export interface DocumentHandle {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** OPFS path or transferable */
  source: { kind: 'opfs'; path: string } | { kind: 'bytes'; bytes: Uint8Array };
  /** Pack-private, never structured via the UI */
  parsed?: unknown;
  generation: number;
}

export interface ToolContext /* += */ {
  document?: DocumentHandle;
  /** A follow-up step may reuse parsed if generation matches */
}

export async function mutateHandle(
  ctx: ToolContext,
  handle: DocumentHandle,
  tool: ToolDefinition,
  options: unknown,
): Promise<DocumentHandle>;
```

Rule: `verify` continues to see **freshly loaded** bytes (`reloadOutputs`) — that stays. Only `run` may use the cache. pdf-lib `PDFDocument`, decoded ImageBitmap, FFmpeg OPFS file are candidates for `parsed`.

#### D. Incremental preview

```ts
export interface PreviewRequest {
  toolId: string;
  options: unknown;
  selection?: unknown;
  /** e.g. only page 3, 72 dpi */
  window: { page?: number; width?: number; startSec?: number; durationSec?: number };
}

export interface PreviewFrame {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  data: Uint8Array;
  note?: Localized;
}

// optional on the tool
preview?(ctx: ToolContext, files: NeoFile[], req: PreviewRequest): Promise<PreviewFrame[]>;
```

Without `preview`: the UI shows a skeleton + the last commit. `previewRedact` in the worker is the first case to generalize.

#### E. Worker pool with warm WASM

Current: one worker per click. Target (as in the architecture):

- Pool size `min(4, hardwareConcurrency)`, hard upper limit because of WASM memory.
- Packs stay lazy, but **after the first PDF drop** `ensurePack('pdf')` + `loadPdfjs()` warm.
- Job queue: `run` / `runPipeline` / `preview` / `analyze`.
- Cancel: `AbortController`, on hang `terminate` + respawn **one** slot.
- Transfer: `ArrayBuffer` below 64 MiB; above that only the OPFS path (the platform has `readOpfs`/`writeOpfs` in the architecture — still narrow in the current `Platform`, **catch up here**).

#### F. Analysis hook (wow moment 1)

```ts
export interface Finding {
  id: string;
  kind: string; // 'iban' | 'js' | 'attachment' | 'exif-gps' | …
  severity: 'info' | 'warn' | 'high';
  label: Localized;
  selection?: unknown;
  suggestedToolId?: string;
  suggestedOptions?: unknown;
}

// pack-local, not every tool
analyze?(ctx: ToolContext, file: NeoFile): Promise<Finding[]>;
```

PDF pack: a thin run over `forensics-identify` + redact `previewRedactHits` + sanitize scan, **without** encode. Timeout 2 s, abort without drama.

---

## 3. Relationship to existing pages

### 3.1 SEO tool pages `/{id}` (not `/tools/{id}`)

**They stay.** Title, description, FAQ, guides, format links, JSON-LD unchanged. Never `noindex` on these URLs.

New contract of the island:

1. The user drops a file (existing `DropZone`).
2. Bytes → SessionStore (OPFS) + `sessionId`.
3. `location.assign('/app?tool={id}&session={sessionId}')` **or** `history.pushState` + the app's client router, if the island already preloads `/app`.
4. The workspace opens with the focus file and does **not** `enqueue` automatically (only the tool preselected, OptionsPanel open). Exception: the user clicks "Run now" on the landing — then one step, result in the workspace.

Deep links `/{id}?preset=&o=` stay; the workspace reads the same query keys (`readToolQuery`).

**No** soft 404, no canonical to `/app`. `/app` is `noindex`.

### 3.2 `/reader`

Merges into the PDF canvas of the workspace.

| Phase | Behavior |
|---|---|
| W1 | `/reader` stays, shares canvas components with `/app` |
| W2 | `/reader?…` 302/client redirect → `/app?family=pdf` + session from handoff |
| After | permanently redirect bookmark `/reader`, remove `hreflang`, remove from header nav |

Reader-only features (highlight, note, print, invert) become a **view mode** "Read" in the ActionBar, not a second product. The desktop menu "Open" targets `/app`.

### 3.3 `/pipeline`

The builder **is** the step stack plus an empty canvas.

| Phase | Behavior |
|---|---|
| W1–W2 | `/pipeline` stays; "Open in workspace" if files are present |
| W3 | hash `#p=` is understood by `/app` (`decodePipelineHash`) |
| W4 | `/pipeline` renders the same Preact app in `stack` mode, or 301 → `/app?mode=pipeline` |

URL-hash sharing without a server stays. Library presets (`PIPELINE_LIBRARY`) become workspace templates.

### 3.4 `/verlauf`

Becomes a **session list** plus the legacy journal.

- Row = session (file names, last step, date) or legacy job (`toolId` + outputs).
- Click: `/app?session=`.
- Journal export (JSONL/CSV without bytes) stays — compliance value for public authorities.
- TTL/quota UI stays, applies to sessions.

### 3.5 `/open`, PWA, share

`/open` becomes a thin entry: POST share saves into the session, redirect `/app`. Change `file_handlers.action` to `/app`, keep the old `/open` URL as a redirect (installed PWAs).

### 3.6 `/watch`

Remains its own page (license gate, folder permissions). Results land in the session bin and appear in the history. No need to squeeze watch into the canvas chrome.

### 3.7 Header navigation

Today: formats, history, reader, pipeline, watch, license, licenses — too much for one line.

Target:

- Marketing header: home, formats, compare, pricing, ⌘K, locale, theme, **Open** (`/app`).
- App header: session name, local badge, network zero, locale, theme, export. No SEO links.
- Watch/license under overflow or footer.

### 3.8 Migration path without SEO loss

1. Keep prerendering all `/{id}`; internal links unchanged.  
2. `ToolApp` step by step: same drop, new target `/app`. Fallback: the old runner stays behind `?legacy=1` for one wave.  
3. Rewire Playwright smokes: upload on the landing **or** directly `/app`, assert the download in the drawer — only once the W2 DoD stands. Until then keep the old selectors green.  
4. Sitemap: filter out `/app` (like `/offline`).  
5. Compare pages (`/vergleich/ilovepdf` …): extend the copy with "one tab, one document", URLs stay.  
6. **No** mass rename to `/tools/{id}`. If the architecture still wants that: aliases `/tools/{id}` → `/{id}`, not the other way round.

---

## 4. Visual concept / design system

### 4.1 Attitude

**A calm workbench, not a tool fairground.** Paper and mint stay as the brand (recognition, white-label capability via `branding.json`). The work surface becomes **cooler, denser, sans-serif**; the marketing pages may stay serif.

Deliberately different from iLovePDF / Smallpdf:

| Them | Us |
|---|---|
| colorful icon tiles as the product | the document fills the surface, tools are verbs at the edge |
| upload to the cloud, spinner, download | the file never leaves; progress on the document |
| one tool = one URL = one action | one document = many actions |
| freemium, watermarks, limit dialogs | Community complete; limits = the device, shown honestly |
| "secure" as a marketing word | verify seal, network zero, manifest — checkable |
| Inter-like generic SaaS UI | editorial brand outside, precision UI inside |
| modal hail | one panel, one stack, toasts only for errors/done |

No glassmorphism rain, no 3D drop shadows on every card, no purple gradient hero in the workspace.

### 4.2 Tokens

```css
/* Semantics — light */
--bg:            #f3efe4;      /* stays brand */
--bg-app:        #ebe6d8;      /* workspace slightly grayer than marketing */
--fg:            #10221c;
--muted:         #4a5a54;
--card:          #fffdf6;
--line:          #cfc8b6;
--accent:        #1f8f74;      /* brand / branding.json */
--accent-fg:     #06281f;
--ok:            #1b7f4e;
--warn:          #c45c26;      /* danger / verify fail only */
--info:          #2f6fed;      /* selection, not brand */
--lock:          #6b5c3e;
--net-zero:      #1b7f4e;
--net-foreign:   #c45c26;

/* Dark: existing #0c1210 system, --bg-app: #0a0f0d */

--font-ui:    "IBM Plex Sans", "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
--font-display: "Iowan Old Style", Palatino, ui-serif, serif; /* marketing H1 only */
--font-mono:  "IBM Plex Mono", ui-monospace, monospace;

--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px;
--radius-s: 4px; --radius-m: 8px; --radius-l: 16px;
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
--dur-1: 120ms; --dur-2: 200ms; --dur-3: 360ms;
--z-palette: 50; --z-drawer: 40; --z-toast: 60;
--focus: 2px solid var(--accent);
```

Self-host Plex (OFL) under `/assets/fonts`. No Google Fonts CDN. White-label: `--accent` / logo / name continue to come from `branding.json`; derive `--bg-app`, do not require overriding it.

**Motion:** only opacity/transform, no layout jumps. `@media (prefers-reduced-motion: reduce)` → duration 0, progress deterministic (no pulse).

### 4.3 Dark mode

- As today: class on `<html>`, init script before first paint.
- Workspace: keep the canvas paper **light** (PDF/photo color), chrome dark — otherwise "washed-out" pages. The toggle "Invert pages" remains reader heritage, default off (barrier: contrast vs. color fidelity).
- `color-scheme` already set — keep it.

### 4.4 Component list and props sketches

```ts
// AppShell — replaces header+max-w-6xl on /app
type AppShellProps = {
  locale: Locale;
  sessionName: string;
  local: boolean;          // always true on the browser path
  foreignBytes: number;    // NetworkStatus
  policyLabel?: string;    // team preset organization
  onExport: () => void;
  children: ComponentChildren;
};

// FileTray
type FileTrayProps = {
  files: SessionFileView[];
  activeId: string | null;
  selectedIds: string[];
  onActivate: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
};

// DocCanvas — adapter switch
type DocCanvasProps = {
  family: WorkspaceFamily;
  handle: DocumentHandleView;
  selection: Selection;
  overlays: Overlay[];      // redact marks, crop, hits
  findings: Finding[];
  onSelection: (sel: Selection) => void;
  onFindingClick: (id: string) => void;
};

// ThumbRail
type ThumbRailProps = {
  items: Array<{ id: string; label: string; src?: string; dirty?: boolean }>;
  activeId: string;
  onSelect: (id: string) => void;
};

// ActionBar
type ActionBarProps = {
  tools: Array<{
    id: string;
    title: string;
    locked?: boolean;
    disabledReason?: string;
    destructive?: boolean;
  }>;
  overflow: typeof tools;
  onRun: (toolId: string) => void;
};

// CommandPalette — workspace mode
type CommandPaletteProps = {
  locale: Locale;
  items: PaletteItem[];     // actions + nav
  open: boolean;
  onClose: () => void;
  onCommit: (item: PaletteItem) => void;
};

// StepStack
type StepStackProps = {
  steps: StepView[];
  head: number;
  onUndo: () => void;
  onRedo: () => void;
  onJump: (index: number) => void; // preview of an older state
  onSavePipeline: () => void;
};

// OptionsPanel
type OptionsPanelProps = {
  toolId: string | null;
  fields: FormField[];
  values: Record<string, unknown>;
  locked: string[];
  presets: ToolPreset[];
  onChange: (v: Record<string, unknown>) => void;
  onApply: () => void;
};

// DiffView
type DiffViewProps = {
  mode: 'wipe' | 'overlay' | 'report';
  before?: PreviewFrame;
  after?: PreviewFrame;
  report?: StructuredReport;
};

// ExportDrawer
type ExportDrawerProps = {
  open: boolean;
  files: SessionFileView[];
  shareSafe: 'yes' | 'no' | 'unknown';
  defaultName: string;
  includeProvenance: boolean;
  onConfirm: (spec: ExportSpec) => void;
  onClose: () => void;
};

// Toasts — one viewport
type Toast = { id: string; kind: 'ok' | 'warn' | 'err'; text: string; timeoutMs?: number };

// EmptyStates / onboarding
type EmptyWorkspaceProps = {
  locale: Locale;
  onPick: () => void;
  recent: Array<{ id: string; name: string; at: number }>;
};
```

Further: `TrustBadge`, `VerifySeal`, `FindingBar`, `JobTicker`, `PolicyBanner`, `OnboardingCoach`.

Existing islands **migrate**: `DropZone` → tray+empty; `ZodForm` → OptionsPanel; `VerificationBlock` → seal+report; `RedactEditor` → PdfCanvas plugin; `ImageBoxEditor` → ImageCanvas; `MediaTrimEditor` → MediaCanvas (waveform new); `Reader` → PdfCanvas+ReadMode; `PipelineBuilder` → StepStack+validator; `HistoryApp` → SessionList; `NetworkStatus` → TrustBadge.

### 4.5 Micro-interactions (concrete)

- **Drop:** 80 ms scale 1.01 on `--bg-app`, dashed accent ring, file chip flies into the tray (transform from the drop point, 200 ms). Reduced motion: ring + chip append without flight.
- **Analysis:** skeleton rows in the FindingBar (3 gray), then chips; the number counts up (120 ms / finding).
- **Step commit:** thumb gets a 160 ms mint ring, stack row slides 8 px.
- **Verify seal:** circle stroke 360 ms, then checkmark — only on `passed && !warnings`. Fail: rust X, no confetti.
- **Wipe:** CSS `clip-path` on the after layer, handle 44×44.
- **Job:** an indeterminate bar is forbidden if `ProgressEvent.ratio` is present; phase label from the engine (`load|parse|…`).
- **Error:** toast + row in the stack, the canvas stays on the last good head.

### 4.6 Keyboard-first

| Key | Action |
|---|---|
| ⌘K | palette (actions) |
| ⌘Z / ⌘⇧Z | undo / redo on the stack |
| ⌘S | export drawer (desktop: native save if unsaved) |
| ⌘E | export |
| ⌘1…9 | tray file |
| [ ] | previous/next page or thumb |
| ⌘F | search in document (reader heritage) |
| ⌘Enter | OptionsPanel apply |
| Esc | close panel/drawer/palette, clear selection |
| ? | shortcuts, workspace set (not just 4 lines) |

Focus order: tray → thumbs → canvas → ActionBar → options → stack. No focus trap in the palette (Tab cyclic, arrows for the list).

### 4.7 Touch / mobile

- ActionBar horizontal scroll, snap, 44 px height.
- Sheets with drag handle, close via swipe-down.
- Pinch zoom on PDF/image (pdf.js / CSS transform), not browser zoom of the chrome.
- Long file lists: tray as a bottom sheet with search.
- `mobileMediaWarn` stays; additionally "Continue on desktop" if `size > 200 MB && saveData`.

### 4.8 a11y — BITV 2.0 / WCAG 2.2 AA

- Contrast text ≥ 4.5:1, UI lines ≥ 3:1; **measure** mint on paper (stamp size 0.68rem is a risk).
- Target size 24 px minimum (WCAG 2.2 AA 2.5.8), primary actions 44 px.
- Canvas: `role="img"` + `aria-label="Page 3 of 12"`; findings as a list, not overlay only.
- Live region `polite` for progress and "Step redact done".
- Verify fail not by color alone (OK/FAIL text stays).
- Reduced motion: see tokens.
- Keyboard: all box drawing with an arrow+Enter alternative (redact: search mode mandatory, not only rectangle drag).
- Language: `lang` on html, the locale switch keeps the session query.
- White-label color: contrast check when loading `branding.json`; fallback to the default mint if insufficient.

Do not promise overlay-only redaction in the UI — the engine removes content; the UI must explain that (landing + panel).

---

## 5. Wow moments (feasible, not concept art)

| # | Moment | Technique | Wave |
|---|---|---|---|
| 1 | File into the window → first page < 300 ms + bar "3 IBANs, 2 attachments, JavaScript — clean up now?" | pdf.js first page in parallel with `analyze()`; hits from `previewRedact` + sanitize scan | W2 |
| 2 | Click on finding "IBAN p.3" → jump, box, one click "Redact these" | Finding.selection → overlay → `pdf-redact` only this region | W2 |
| 3 | Live redaction + seal after commit | overlay immediately; `verify` in the worker; stroke animation | W2 |
| 4 | "Make it fit" slider (target MB) with live size | debounced `preview` or estimator from image dpi/CRF; tool `pdf-compress` / `media-fit` | W2/W4 |
| 5 | Before/after wipe after compress/repair | two PreviewFrames, clip-path | W2 |
| 6 | Pipeline on 50 files, status per row | `mapFiles` + pool + tray progress | W5 |
| 7 | Desktop: double-click PDF → workspace with analysis, not an empty reader | Tauri open → `/app`, `readOpenedFile` → session | W2 |
| 8 | ⌘K "sanitize" applies, canvas stays | no `location.assign` | W3 |
| 9 | Export drawer share-safe traffic light, one tap "check" | `forensics-share-safe` as a step | W3 |
| 10 | Tab crash, come back: case file is there | OPFS session | W1 |

Do not sell as wow: generic Lottie, onboarding carousel, confetti.

---

## 6. Technical frontend architecture

### 6.1 Astro islands vs. `/app` SPA

**Decision: hybrid site. Marketing/SEO stays Astro SSG. `/app` is a dedicated Preact application as `client:only="preact"` on a thin Astro shell (no `max-w-6xl`, `noindex`).**

Rationale:

- 180+ tool landings + formats + convert need SSG, hreflang, JSON-LD. A CSR app for that would be an SEO and bundle regression.
- The workspace has shared state (session, head, jobs, worker). Ten `client:load` islands without a shared store repeat the handoff disaster.
- `ToolApp` stays on `/{id}` transitionally; it shares modules (`sessionStore`, `workerPool`) via import, not via iframe.

Not: Next.js, not React. The stack is Preact 10, MIT.

### 6.2 State: Preact + signals

**Choice: `@preact/signals` (MIT) + one module `workspace-store.ts`.**

| Alternative | Verdict |
|---|---|
| only `useState` (current) | prop drilling through shell/canvas/stack untenable |
| Redux / Zustand | additional license/API, heavier; no gain over signals |
| Solid | second runtime, bundle+brain |
| Nano Stores | ok, but signals are the Preact-native form |

```ts
import { signal, computed, batch } from '@preact/signals';

export interface Selection {
  pages?: number[];
  regions?: Array<{ page?: number; x: number; y: number; w: number; h: number; unit: 'pdf' | 'px' | 'norm' }>;
  timeRange?: { startSec: number; endSec: number };
  fileIds?: string[];
}

export interface StepRecord {
  stepId: string;
  toolId: string;
  options: unknown;
  selection: Selection;
  status: 'queued' | 'running' | 'ok' | 'error';
  outputRef?: string;
  verification?: VerificationReport;
  error?: string;
}

export interface SessionFileState {
  id: string;
  name: string;
  mime: string;
  size: number;
  family: WorkspaceFamily;
  opfsPath: string;
  revisions: StepRecord[];
  head: number; // index in revisions; -1 = original
  findings: Finding[];
}

export interface WorkspaceState {
  sessionId: string;
  name: string;
  files: SessionFileState[];
  activeFileId: string | null;
  selectedFileIds: string[];
  selection: Selection;
  pendingToolId: string | null;
  pendingOptions: Record<string, unknown>;
  jobs: Array<{ id: string; label: string; ratio: number }>;
  exportOpen: boolean;
  paletteOpen: boolean;
}

export const workspace = signal<WorkspaceState>(emptyWorkspace());

export const activeFile = computed(() =>
  workspace.value.files.find((f) => f.id === workspace.value.activeFileId) ?? null,
);

export const currentBytesPath = computed(() => {
  const f = activeFile.value;
  if (!f) return null;
  if (f.head < 0) return f.opfsPath;
  return f.revisions[f.head]?.outputRef ?? f.opfsPath;
});

export function enqueueStep(toolId: string, options: unknown, selection: Selection) {
  batch(() => {
    /* append queued step, kick workerPool */
  });
}

export function undo() { /* head-- , canvas binds currentBytesPath */ }
export function redo() { /* head++ */ }
```

Jobs never in canvas component state. The worker posts progress → `jobs` signal.

### 6.3 Worker pool (UI side)

```ts
// lib/worker-pool.ts
export function getWorkerPool(): {
  run(toolId: string, files: WorkerFileRef[], options: unknown, onProg: ProgressCb): Promise<ToolResult>;
  preview(req: PreviewRequest): Promise<PreviewFrame[]>;
  analyze(file: WorkerFileRef): Promise<Finding[]>;
  cancel(jobId: string): void;
};
```

`WorkerFileRef` = `{ name, mime, opfsPath }` preferred, not always `Uint8Array`. `createToolWorker()` reused internally. Pack warm-up: after MIME detection.

### 6.4 Persistence

```
OPFS
  /sessions/{sessionId}/src/{fileId}
  /sessions/{sessionId}/rev/{fileId}/{stepId}
  /history/…          (existing, jobs/exports)
IndexedDB
  neotools-sessions     { id, name, filesMeta, steps, updatedAt }
  neotools-history      (existing)
  neotools-handoff      (wave 1 still, then deprecated)
```

Quota: existing history settings + session sum. Warning in the trust bar, not only on failure.

### 6.5 Routing / deep links

Query (all optional, composable):

| Param | Meaning |
|---|---|
| `session` | open an existing session |
| `tool` | OptionsPanel + action highlight |
| `preset` | tool preset |
| `o` | base64url options (existing) |
| `pages` | `1-3,7` → selection |
| `t` | `12.0-40.0` time |
| `mode` | `pipeline` \| `read` \| `batch` |
| `#p=` | pipeline hash (existing) |

Tauri: `neotools://app?tool=pdf-redact` → `DesktopEvents` already maps to paths; adjust the target. Menu "Open" no longer `/reader`.

### 6.6 Tauri

- File association and `readOpenedFile` → session, canvas immediately.
- Native save in the export drawer (`pickSavePath` / `saveFile`) — the reader can already do that.
- Deep link and team preset event (`load-team-presets`) stay; replace the reload with a store re-apply once the registry is reloadable in the worker.
- PDF double-click = wow 7. No second WebView.

### 6.7 Tests

| Layer | New |
|---|---|
| Vitest | SessionStore, selection parse, undo head, query router, contrast helper |
| Playwright | W2: drop PDF on `/app` → page visible → compress → stack+1 → undo → export |
| Playwright | W2: landing `/pdf-redact` drop → `/app?tool=pdf-redact` → mark → verify seal |
| Playwright | W3: `#p=` pipeline in app mode |
| Playwright | existing merge/sanitize/redact smokes must **not** break in W1 |
| a11y | axe on `/app` empty + PDF loaded in CI (wave W3) |

Goldens remain a pack matter.

### 6.8 Bundle discipline

- The `/app` entry does **not** import `@neotools/tools-media` on the main thread.
- Canvas adapters: `import()` by `family`.
- pdf.js worker unchanged, same-origin.
- Signals + shell target: **< 80 kB gz** without packs. Packs stay worker-only.
- No new UI framework, no chart kit, waveform by hand (peaks array, canvas).

---

## 7. Implementation plan in waves

Effort = person-days of one person, parallelizable where marked. Order by user value: **PDF first**.

### Wave W0 — design system and app scaffolding (in parallel with engine fields)

| Package | Days | Content | Parallel |
|---|---|---|---|
| DS-01 | 2 | tokens in `global.css`, UI sans self-hosted, motion/reduced | yes |
| DS-02 | 2 | TrustBadge, theme, focus, skip link | yes |
| APP-01 | 2 | route `/app` + `/en/app`, `noindex`, empty AppShell | after DS-01 start |
| ENG-01 | 2 | `workspace` meta, `pages/region/timeRange` Zod, `outputs` lint | yes, other agent |

**DoD W0:** `/app` loads in < 1 s idle, dark mode, badge "Local · Net 0 B", no regression of the tool pages. Tokens documented in this file (above).

**Risk:** branding contrast; mitigation: check script.

### Wave W1 — FileTray, persistence, drop physics

| Package | Days | Content | Parallel |
|---|---|---|---|
| SES-01 | 3 | SessionStore OPFS+IDB, quota, reopen | yes |
| TRAY-01 | 3 | FileTray, multi-file, paste/drop global on `/app` | after SES-01 API |
| POOL-01 | 3 | worker pool + OPFS refs instead of always bytes | yes (engine+web) |
| LAND-01 | 2 | `ToolApp` drop writes session and links `/app?tool=` (feature flag) | after SES-01 |

**DoD W1:** drop two PDFs, reload, both there; landing `pdf-merge` flag on → tray has both; history untouched.

**Risk:** Safari OPFS quirks; fallback IDB (already in the history stack).

### Wave W2 — PDF workspace (highest value)

| Package | Days | Content | Parallel |
|---|---|---|---|
| PDF-01 | 4 | PdfCanvas from reader+redact: thumbs, zoom, text search | yes, with PDF-02 |
| PDF-02 | 3 | StepStack undo/redo snapshots | yes |
| PDF-03 | 4 | ActionBar PDF core: compress, rotate, reorder, split, merge | after PDF-01 |
| PDF-04 | 5 | redact inline + FindingBar + VerifySeal | after PDF-01, ENG preview |
| PDF-05 | 3 | sanitize + share-safe report structured | after PDF-03 |
| PDF-06 | 2 | wipe diff compress; make-it-fit slider v1 (estimator ok) | after PDF-03 |
| DESK-01 | 2 | Tauri open → `/app`; PWA handler alias | yes |

**DoD W2:** user scenario: open a PDF → compress → swap pages → redact two IBANs → sanitize → export with seal. No second open. ⌘Z undoes sanitize. Playwright flow green. `/reader` may still exist.

**Risk:** RAM with a 200-page PDF + snapshots; mitigation: virtualize the thumb viewport, keep snapshots only for head and head-1, older ones on OPFS without decode.

### Wave W3 — palette, export, SEO bridge, reader/pipeline

| Package | Days | Content | Parallel |
|---|---|---|---|
| PAL-01 | 3 | ⌘K actions + existing nav fallback | yes |
| EXP-01 | 3 | ExportDrawer, provenance toggle, traffic light | yes |
| SEO-01 | 3 | all tool landings flag default on; header "Open" | after W2 stable |
| MIG-01 | 2 | `/reader` → `/app`, `/open` redirect | after SEO-01 |
| MIG-02 | 2 | `#p=` in `/app`, pipeline page embed/redirect | yes, with MIG-01 |
| A11Y-01 | 3 | axe CI, keyboard pass, contrast fix | yes |

**DoD W3:** ⌘K "sanitize" without navigation. Compare copy updated. Old reader URLs land in the workspace. Smokes moved or dual.

### Wave W4 — image and media workspace

| Package | Days | Content | Parallel |
|---|---|---|---|
| IMG-01 | 4 | ImageCanvas, boxes, wipe, EXIF findings | yes, with MED-01 |
| IMG-02 | 2 | ActionBar image-* + doc-repair | after IMG-01 |
| MED-01 | 5 | waveform/timeline, in/out drag, crop rect | yes |
| MED-02 | 3 | media-fit live size, trim commit | after MED-01 |
| ANA-01 | 2 | `analyze()` image-metadata GPS, video duration | yes |

**DoD W4:** drop a photo → GPS chip → strip → crop → export. Trim a clip without number fields as the only UI. Mobile warning unchanged and honest.

**Risk:** ffmpeg cold start (10–30 s, GPL core size). Mitigation: trust bar "FFmpeg is loading (locally, x MB)", prefetch on MIME `video/*`.

### Wave W5 — office, batch, onboarding, polish

| Package | Days | Content | Parallel |
|---|---|---|---|
| OFF-01 | 4 | office preview (HTML/grid), to-pdf in the stack | yes |
| BAT-01 | 4 | N files, one stack, protocol, ZIP | yes |
| ONB-01 | 3 | EmptyState, 3 coach marks, landing hero "drop a file = work" | yes |
| VER-01 | 2 | `/verlauf` session list | after BAT-01 |
| POL-01 | 3 | slimmer marketing header, watch link in overflow | yes |

**DoD W5:** 50 PDFs sanitize+compress with visible progress. Office DOCX → PDF → sanitize in one tab. Onboarding once, `localStorage`, skippable. Reader/pipeline nav removed from the marketing header.

### Wave plan table (overview)

| Wave | Focus | Calendar (1 person) | Parallel max. | User value |
|---|---|---|---|---|
| W0 | tokens, `/app` empty, engine meta | ~4–5 d | 3 | foundation |
| W1 | session, tray, pool, landing flag | ~8 d | 3 | file survives reload |
| W2 | PDF workspace complete | ~16–18 d | 3 | **core promise** |
| W3 | palette, export, migration reader/pipeline | ~12 d | 3 | one-tab feeling everywhere |
| W4 | image + media | ~12 d | 2 | parity of the families |
| W5 | office, batch, onboarding | ~12 d | 3 | law-firm stacks, creator fit |

Total roughly **8–10 weeks** for one person; with 2–3 parallel tracks (DS/engine/PDF) **5–6 weeks** to the W2 DoD.

### Cross-cutting risks

| Risk | Wave | Mitigation |
|---|---|---|
| another agent changes ToolApp/reader under the document | all | share only interfaces; feature flags; this file is not a silent rewrite of the islands |
| WASM OOM in the pool | W1–W4 | max 2 heavy packs at once (ffmpeg ⊕ onnx) |
| SEO unrest from the header change | W3 | tool URLs untouched; measure internal clicks |
| snapshot quota | W2 | head/head-1; user dialog |
| BITV acceptance by law firms | W3 | axe + manual checklist in the DoD |
| FFmpeg license note | W4 | repeat the existing `/lizenzen` text in the JobTicker |
| duplicate handoff paths | W1–W3 | one SessionStore, handoff only as adapter |

---

## 8. ASCII states (supplementary)

### Empty `/app` desktop

```
+--------------------------------------------------------------+
| ● LOCAL  ○ Net 0 B                               [DE] [☽] ⌘K |
+--------------------------------------------------------------+
|                                                              |
|           Drag a file here                                   |
|           PDF, image, audio, video, office                   |
|           stays on this device                               |
|                                                              |
|           [ Choose files ]       [ Open session ]            |
|                                                              |
|           Recent: Case-Müller (today, 6 steps)               |
+--------------------------------------------------------------+
```

### Export drawer

```
+---------------- Export --------------------------------+
| Antrag-redacted.pdf                                    |
| File name [ Antrag-2026-09-14-safe.pdf         ]       |
| ( ) Current file only    ( ) Tray as ZIP               |
| [x] Attach provenance                                  |
|                                                        |
| Share-safe  [ GREEN · 12 checks ]                      |
|             JS removed · IBANs not in extract          |
|                                                        |
| [ Cancel ]                                [ Save ]     |
+--------------------------------------------------------+
```

---

## 9. Example: landing → workspace (sequence)

```
User on /pdf-redact
  DropZone.addFiles
    → sessionStore.create()
    → write OPFS src/
    → analyze() async
    → location /app?tool=pdf-redact&session=…
Workspace.mount
  → load session
  → PdfCanvas first page
  → FindingBar chips
  → pendingToolId = pdf-redact
  → OptionsPanel patterns
User clicks chip IBAN
  → selection.regions = …
  → ⌘Enter / "Apply"
  → enqueueStep → workerPool.run('pdf-redact')
  → snapshot OPFS rev/
  → verify → seal
  → head++
```

---

## 10. Summary for handover

### Core decisions

1. **Document-centric SPA on `/app`** (alias `/workspace`), `noindex`. SEO tool pages stay on `/{id}`.
2. **Preact + `@preact/signals`**, one store module boundary; no React, no patchwork of islands for the work.
3. **Step stack = `PipelineSpec` + OPFS snapshots**; undo is head movement, not inverse ops.
4. **Extend the engine, do not fork it:** `workspace` meta, standard selection, DocumentHandle, `preview`/`analyze`, a real worker pool, OPFS paths in `Platform`.
5. **PDF wave first** (W2). Reader and pipeline are folded into the workspace, URLs redirected, not deleted without redirect.
6. **Brand:** keep mint/paper/local badge; the workspace becomes UI sans, denser, more checkable — no iLovePDF tile board.
7. **Verify fail-closed** remains law; seal and export traffic light are its visible form.

### Wave plan

| Wave | Result |
|---|---|
| W0 | tokens + empty AppShell + engine fields |
| W1 | session bin survives reload; landing can hand over |
| W2 | PDF: one tab, stack, redact, sanitize, seal, desktop open |
| W3 | ⌘K actions, export drawer, reader/pipeline/open rewired |
| W4 | image and media canvas |
| W5 | office, batch 50, onboarding, history=sessions |

### Required engine changes (checklist)

- [ ] lint `ToolDefinition.workspace` + `outputs` as mandatory  
- [ ] Zod building blocks `pages` / `regions` / `timeRange` / `fileIds`  
- [ ] migrate tools step by step to the building blocks (pdf-redact, image-crop, media-trim first)  
- [ ] `DocumentHandle` + optional `parsed` on `ToolContext`  
- [ ] `preview?` on the tool; map `previewRedact` onto it  
- [ ] `analyze?` per pack or `forensics-analyze`  
- [ ] `Platform.readOpfs` / `writeOpfs` in the browser adapter (architecture target)  
- [ ] worker pool (2–4), job queue, warm-up, cancel+respawn  
- [ ] `PipelineStep.selection?` (or options-only, if the building blocks suffice)  
- [ ] `runPipeline` intermediates as handles, not only full `NeoFile` copies  
- [ ] preset visibility: `getAppliedPresets` for the policy bar (already readable)  

### Open questions

1. **Default after desktop PDF open:** analysis always on, or only with a `privacySensitive` team policy? (Proposal: always, timeout 2 s, fail silently.)  
2. **Snapshot depth:** only head±1 or the full history up to quota? (Proposal: full history up to a 200 MB session cap, then drop the oldest revisions, keep the original.)  
3. **Merge UX:** tray multi-select vs. its own "order" overlay. (Proposal: overlay, because outline/Bates need options.)  
4. **Create signature** stays CLI/Tauri — does the ActionBar show "Desktop only" or hide it on the web? (Proposal: visible, disabled, reason line.)  
5. **`/app` PWA scope:** own service worker scope or one? (Proposal: one, precache shell+`/app`; engines on demand — as today.)  
6. **White-label:** may tenants keep the serif of the landing if the workspace uses Plex? (Proposal: yes, two font tokens.)  
7. **Parallel agent:** who owns `ToolApp.tsx` / `Reader.tsx` in W1–W2? Flag interface in this file §3.1, ownership to be clarified in the sprint.  
8. **Analysis telemetry:** none. Not even anonymous counts in the workspace without the existing self-hosted Plausible event without PII — and never for findings (findings are content).  

---

*End of the concept. Implementation starts with W0/DS-01 and ENG-01; no cosmetics pass on the catalog replaces the workspace.*
