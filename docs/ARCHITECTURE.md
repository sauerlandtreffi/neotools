# NeoTools Architektur

Verwandt: [BACKLOG.md](./BACKLOG.md) · [ROADMAP.md](./ROADMAP.md)

Verbindliche Entscheidungen. Abweichung nur mit Changelog in diesem Dokument.

## 1. Monorepo-Layout

```
Neotools/
  pnpm-workspace.yaml
  package.json                 # private root, scripts: build, test, lint
  tsconfig.base.json           # strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes
  packages/
    engine/                    # Tool-Schema, Registry, Worker-Runtime, Pipeline, Fehlerprotokoll, platform-Adapter
    format-kb/                 # Format-Wissensbasis (JSON), keine Runtime
    tools-pdf/
    tools-image/
    tools-media/               # ffmpeg.wasm LGPL, WebCodecs
    tools-speech/
    tools-forensics/
    tools-office/
    tools-archive/
    tools-dach/
  apps/
    web/                       # Astro + TypeScript, Preact-Inseln, i18n de/en
    cli/                       # Node, gleiche Registry
    desktop/                   # Tauri 2 (Rust-Shell + web-UI)
  deploy/
    docker/                    # nginx-Image + optionaler API-Sidecar
  docs/
```

Workspace-Protokoll: `pnpm`. Kein npm/yarn-Lockfile. Jedes Paket hat `name: @neotools/<id>`, eigene `tsconfig` mit `extends`.

**Import-Richtung:** `apps/*` → `packages/engine` + Packs. Packs → nur `engine` + erlaubte Libs. Packs importieren einander nicht; Orchestrierung läuft über Pipeline-IDs.

**Isomorphie:** `packages/engine` und alle `run()`-Funktionen dürfen kein `window`/`fs` direkt anfassen. Zugriff nur über `Platform` (Abschnitt 3).

---

## 2. Tool-Schema

Ein Tool ist eine deklariative Einheit. UI, CLI-Subcommands, Pipelines, SEO-Seiten und Docs werden daraus generiert. Keine Tool-Seite ohne `defineTool`.

### 2.1 Typen

```ts
import { z } from "zod";

export type LocaleText = { de: string; en: string };

export type MimeOrExt = string; // "application/pdf" | ".pdf"

export interface ToolInputs {
  accept: readonly MimeOrExt[];
  multiple: boolean;
  min?: number;
  max?: number;
  /** Semantischer Port-Name für Pipeline-Verdrahtung */
  port?: string;
}

export interface ToolOutput {
  name: string;
  mime: string;
  filename: string;
  bytes: Uint8Array | Blob;
  /** Optional: OPFS-Handle statt voller Bytes (große Dateien) */
  opfsPath?: string;
}

export interface ToolError {
  code: string;          // z. B. "PDF_ENCRYPTED", "INPUT_TYPE"
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
  /** Nach Privacy-Ops Pflicht */
  verify?: VerifyFn;
  provenance: ProvenanceBuilder;
}

export interface ToolSeo {
  path: string;                 // "/tools/pdf-merge"
  title: LocaleText;
  description: LocaleText;
  keywords: readonly string[];
  /** Zusätzliche statische Seiten, z. B. Convert-Paare */
  aliases?: readonly string[];
}

export interface ToolPreset<TOptions> {
  id: string;
  title: LocaleText;
  options: TOptions;
}

export interface ToolDefinition<TOptions extends z.ZodTypeAny> {
  id: string;                   // kebab-case, stabil
  category: string;
  pack: string;                 // "pdf" | "image" | …
  title: LocaleText;
  description: LocaleText;
  inputs: ToolInputs;
  options: TOptions;
  presets?: readonly ToolPreset<z.infer<TOptions>>[];
  seo: ToolSeo;
  /** Wenn true: Engine ruft verify() nach run() auf */
  privacySensitive?: boolean;
  licenses: readonly string[];  // SPDX, für Lizenzseite
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

### 2.2 Beispiel: `pdf-merge` vollständig

```ts
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { defineTool } from "@neotools/engine";

const optionsSchema = z.object({
  /** Reihenfolge der Input-IDs. Fehlt sie, gilt Upload-Reihenfolge. */
  order: z.array(z.string()).optional(),
  /** Erste Seite jeder Datei als Outline-Eintrag */
  outline: z.boolean().default(true),
  /** Leere Seiten am Ende jeder Quelle verwerfen */
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

`addOutline` ist eine Engine-Hilfe um pdf-lib-Outline; falls die Library-API abweicht, kapseln in `packages/tools-pdf/src/lib/outline.ts`.

---

## 3. Engine-Runtime

### 3.1 Worker-Pool (Browser)

- Ein **Pool** von Web Workern, Größe `navigator.hardwareConcurrency` begrenzt auf 2–4 (WASM-Speicher).
- RPC via **Comlink**. Jeder Worker lädt Packs lazy (`import()`), nicht das ganze Monorepo.
- **Ein Job = ein Tool-Lauf** (oder ein Pipeline-Schritt). Kein Shared-Mutable zwischen Jobs.
- **Progress:** Worker postet `ProgressEvent`; UI bindet an Job-ID.
- **Cancel:** `AbortController` → Worker `cancel.throwIfAborted()` in Schleifen; bei hartem Abbruch `worker.terminate()` + Worker neu spawnen.
- **Transfer:** `ArrayBuffer` per Transferable. Dateien > Schwelle (64 MiB) liegen in **OPFS**; Worker bekommt Pfad, nicht Bytes.

### 3.2 Fehlerprotokoll

Jeder Lauf schreibt nach `ErrorJournal`:

| Feld | Inhalt |
|---|---|
| jobId | UUID |
| toolId | kebab-id |
| fileId / name | ohne Inhalt |
| inputHash | SHA-256 |
| code | stabiler Fehlercode |
| message | i18n |
| recoverable | bool |
| ts | ISO |

Export als JSON. Keine Dateiinhalte, keine PII aus dem Dokument im Log.

### 3.3 Isomorphie: `Platform`

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
  fetchAsset(url: string): Promise<ArrayBuffer>; // nur same-origin / file
}
```

| Adapter | FS | Worker |
|---|---|---|
| Browser | OPFS + Blob + File System Access | `new Worker(new URL(...), { type: "module" })` |
| Node (CLI, API) | `node:fs/promises` | `worker_threads` + Comlink-Node |
| Tauri | `fs` Plugin + OPFS in WebView | wie Browser; Native-Dialoge über invoke |

WASM-Module und Modelle kommen aus `/assets/…` (self-hosted), nie von einem CDN.

### 3.4 Registry

```ts
registerTool(def);
registerPack(manifest);
getTool(id): ToolDefinition;
listTools(filter?: { pack?: string; phase?: number }): ToolDefinition[];
```

CLI, Astro-`getStaticPaths`, Pipeline-Resolver und Docs lesen dieselbe Registry.

---

## 4. Pipeline-Modell

```ts
export interface PipelineStep {
  id: string;              // lokal in der Pipeline
  tool: string;            // Tool-ID
  options: unknown;        // nach Zod des Tools validiert
  /** stepId.port → dieser Input-Port */
  bind: Record<string, string>;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
  /** Optionale Team-Richtlinie */
  policyId?: string;
}
```

**Typkompatibilität:** Jedes Tool deklariert `inputs.accept` und implizite Output-MIMEs (aus `run` + `seo`/Manifest `emits: string[]`). Der Resolver verbindet nur, wenn der Output-MIME im nächsten `accept` liegt oder ein registrierter **Adapter-Schritt** existiert (`pdf-to-images` zwischen PDF und Bild-Tool).

**Serialisierung:** `PipelineConfig` ist reines JSON, keine Dateien. Teilen über **URL-Hash**:

```
https://neotools.example/#pipeline=<base64url(json)>
```

Hash bleibt clientseitig. Kein Server speichert die Config. Obergrenze ~8 KB; darüber Download einer `.neopipeline.json`.

**Ausführung:** Sequentiell in Phase 1. Parallel nur bei unabhängigen Zweigen (Phase 2+, gleicher Cancel-Scope). Zwischenstände in OPFS, Undo = vorherigen Snapshot wiederherstellen.

---

## 5. Pack- / Plugin-Mechanik

### 5.1 Manifest

```ts
export interface PackManifest {
  id: string;                  // "pdf"
  version: string;             // semver
  title: LocaleText;
  tools: readonly string[];
  licenses: readonly PackLicense[];
  assets: readonly string[];   // WASM, Modelle, relative URLs
  lazy: boolean;
  /** Docker-Build: Pack weglassbar */
  optional: boolean;
}

export interface PackLicense {
  spdx: string;
  component: string;
  url: string;
  note?: string;               // z. B. "FFmpeg LGPL-Build, kein x264"
}
```

Community-Plugins: gleiches Manifest, geladen aus `/plugins/<id>/` (Self-Host) oder `node_modules/@neotools-plugin/*`. Kein remote Code zur Laufzeit von Dritt-Hosts.

### 5.2 Lazy-Loading

Web: `import("@neotools/tools-pdf")` erst auf der Tool-Seite oder wenn die Pipeline das Pack braucht. ffmpeg.wasm, Tesseract, ONNX, OpenCV **nie** im Initial-Bundle.

### 5.3 Docker ohne Packs

```dockerfile
# build-arg PACKS=pdf,forensics,dach
ARG PACKS=pdf,image,media,speech,forensics,office,archive,dach
```

Der Bundler (`apps/web`) erhält `import.meta.env.NEOTOOLS_PACKS`. Nicht gelistete Packs: kein JS, keine Modelle im Image. Lizenzseite listet nur enthaltene Packs.

---

## 6. Storage-Schichten

| Schicht | Inhalt | Lebensdauer |
|---|---|---|
| OPFS | Große Dateien, Pipeline-Zwischenstände, Verlauf, Undo-Snapshots | Nutzer-gesteuert; Quota-Warnung |
| IndexedDB | Metadaten: Job, Hashes, Provenance-Kopf, Audit-Log, Presets | dauerhaft lokal |
| Cache Storage | WASM-Engines, ONNX/Whisper/WebLLM-Modelle | Cache, versioniert über Asset-Hash im Dateinamen |
| Memory | Aktueller Job < 64 MiB | Job-Ende |

Keine Cookies für Tracking. Optional: self-hosted Plausible, ohne personenbezogene Event-Props.

**Verlauf:** IndexedDB zeigt Liste; Bytes liegen in OPFS unter `/history/<jobId>/`. Undo stellt den letzten Output wieder her, nicht den Input (Input bleibt unangetastet).

---

## 7. Privacy-Verifikation

Gilt nach jedem Lauf mit `privacySensitive: true` (`pdf-redact`, `pdf-sanitize`, `image-redact`, `image-auto-blur`, `image-metadata` Preset `strip-*`, Screenshot-Wash).

Ablauf:

1. Tool schreibt Output + maschinenlesbare **Fundstellen** (Seite, BBox, Muster-ID).
2. Engine startet `forensics-verify`: erneuter Text-Extract, Regex der gleichen Muster, Stichproben-OCR auf geschwärzten Boxen (Pixel müssen unter Schwelle liegen, kein lesbarer Text).
3. UI: Checkliste Fundstelle × Status (`entfernt` / `noch sichtbar` / `unsicher`). Nutzer bestätigt oder korrigiert.
4. Erst nach Bestätigung gilt der Job als `shared-safe`. Download davor ist möglich, aber mit Banner.

Verifikation läuft lokal, gleiches Worker-Modell. Fehlschlag ≠ stilles OK.

---

## 8. Provenance-Manifest

Optionales JSON, mit Output oder daneben:

```ts
interface ProvenanceManifest {
  version: 1;
  createdAt: string;
  tool: string;
  pipeline?: PipelineConfig;
  options: unknown;            // keine Dateiinhalte
  inputHashes: string[];
  outputHash: string;
  engineVersion: string;
  packVersions: Record<string, string>;
}
```

Kein PII, keine extrahierten Klarnamen. Nutzer kann Provenance abschalten (Team-Preset darf sie erzwingen).

---

## 9. SEO-Generierung

**Quellen:** `defineTool.seo` + `packages/format-kb`.

Astro `getStaticPaths` erzeugt:

| Muster | Quelle |
|---|---|
| `/tools/<id>` | jedes Tool, de + en |
| `/formats/<format>` | KB-Eintrag (Container, Codec, Limits) |
| `/convert/<a>-to-<b>` | KB-Kante, nur wenn ein Tool die Kante bedient |
| `/spec/<platform>` | KB-Spec (WhatsApp, beA, …) |
| `/guides/<slug>` | manuelle MDX, verlinkt Tool-IDs |

Keine Doorway-Pages ohne hinterlegtes Tool. `hreflang` de/en. Canonical pro Locale.

Format-KB-Felder (Minimum): `id`, `mimes`, `extensions`, `tools[]`, `limits[]` (Größe, Codec, fps), `notes` i18n. Spec-Check und Export-Pack-Presets **lesen** die KB, sie duplizieren keine Magic Numbers.

---

## 10. i18n

- Locales: `de` (Default), `en`.
- UI-Strings: JSON unter `apps/web/src/i18n/{de,en}/*.json`.
- Tool-`title`/`description`/`seo` leben **in der Tool-Definition**, nicht in den UI-JSON-Dateien.
- CLI: `--lang de|en`, Default `LANG`.
- Routing: `/de/...`, `/en/...` oder Prefix-frei de + `/en` — eine Variante im Web-App-Gerüst festnageln, nicht mischen.

---

## 11. Desktop (Tauri 2)

| Thema | Festlegung |
|---|---|
| Shell | Tauri 2, WebView = dieselbe `apps/web`-Build (oder `dist` eingebettet) |
| Dateizuordnung | `.pdf` → App; Windows-Registry / macOS `CFBundleDocumentTypes` / Linux `.desktop` |
| Deep-Link | `neotools://tool/<id>?pipeline=…` |
| Updater | Tauri updater, Ed25519-signierte Bundles, eigener Endpoint (Self-Host oder Projekt-CDN, kein Telemetriezwang) |
| Signierung Windows | Authenticode (OV/EV), MSI + NSIS `.exe` |
| Signierung macOS | Developer ID + Notarization; später |
| PDF-Reader-Modus | Phase 1: Anzeige (pdfjs-dist), Suche, Speichern, Schwärzung. Formulare/Signatur/Kommentare: Folge-WPs |
| Native FS | große PDFs nicht durch die WebView-Kopie jagen; `fs.read` + OPFS-Spiegel |

Kein Electron.

---

## 12. PWA-Manifest (Pflichtfelder)

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

Service Worker: Precache App-Shell + aktive Locale; Engines on demand in Cache Storage. Offline: alle bereits geladenen Packs.

---

## 13. CLI

Paket: `@neotools/cli`, Binary `neotools`.

```
neotools run <tool> [options] <files…>
neotools pipeline <file.json>
neotools watch <dir> --tool <id> [--out <dir>] [--debounce ms]
neotools list [--pack pdf]
neotools inspect <file>          # forensics-identify
```

Optionen: 1:1 die Zod-Felder als `--kebab-case`. `--json` für Maschinenausgabe. Exit-Codes: `0` OK, `2` Validierung, `3` Tool-Fehler, `4` Verify fehlgeschlagen, `130` Cancel.

`watch` = Node-`fs.watch` / chokidar, gleiche `run()`-Funktion. Team-Presets: `--policy ./richtlinie.json`.

---

## 14. Docker / White-Label

Zwei Images:

1. **`neotools-web`:** nginx, statische Astro-Ausgabe, `/assets` Modelle + WASM. Kein Node im Request-Pfad.
2. **`neotools-api` (optional):** Node-Sidecar, gleiche Engine, REST:

   `POST /v1/run/:tool` multipart; `POST /v1/pipeline`; synchron oder Job-Queue lokal.

`branding.json` (Mount):

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

nginx liefert Branding-Dateien; die Web-App liest `/branding.json` zur Boot-Zeit.

**Lizenzschlüssel (Self-Host White-Label):** Offline-Prüfung. Payload (Org, Packs, Ablauf) + **Ed25519-Signatur** mit Projekt-Public-Key im Binary. Kein Phone-Home. Fehlt der Key: Build läuft als Community (Branding-Platzhalter, alle freien Packs).

---

## 15. Lizenz-Compliance

| Regel | Umsetzung |
|---|---|
| Lizenzseite | `/licenses` generiert aus allen geladenen `PackManifest.licenses` + Root-NOTICE |
| FFmpeg | **Nur LGPL-Build**, kein x264/x265, kein GPL-Enable. H.264-Encode über **WebCodecs** (Browser) oder verweigern mit klarer Meldung |
| AGPL | Ghostscript, MuPDF, iText **verboten** — auch nicht optional |
| SheetJS | Community only, kein Pro |
| Modelle | Selbst hosten; Lizenz je Modell in Manifest (z. B. Whisper Apache-2.0, Kokoro) |
| Tesseract traineddata | deu+eng im Image, weitere Sprachen optionaler Download same-origin |
| Community-Plugins | müssen Manifest + SPDX mitbringen, sonst kein Load |

CI-Job: `pnpm licenses:check` scheitert bei AGPL/unbekannter SPDX im Graph.

---

## 16. Sicherheits-Header

Multi-Thread-WASM (ffmpeg, ONNX, wasm-bindgen) braucht Isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

CSP (Skizze):

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

Kein `unsafe-eval` außer WASM. Keine Dritt-Pixel. File-Picker und Clipboard nur über User-Geste.

Tauri: `dangerousRemoteDomainIpcAccess` aus; IPC-Whitelist.

---

## 17. Teststrategie

| Lage | Werkzeug | Was |
|---|---|---|
| Engine, Schema, Pipeline-Resolver, Platform-Mocks | **Vitest** | Zod-Rejects, Cancel, Progress-Reihenfolge, MIME-Bindung, Journal ohne PII |
| Pack `run()` | Vitest + **Golden-Files** | Pro Tool: `tests/goldens/<id>/in.*` → Hash oder strukturierter Compare des Outputs. Keine Binär-Goldens für lossy Codecs: SSIM/Größe-Band |
| Privacy-Pfad | Vitest | Redact: String darf in Extract nicht mehr vorkommen; Verify muss `fail` wenn Box zu hell |
| Web | **Playwright** | Smoke je Welle: Upload → Option → Download; i18n-Switch; PWA-Manifest vorhanden |
| CLI | Vitest spawn | `neotools run pdf-merge a.pdf b.pdf` Exit 0, Datei nicht leer |
| Docker | smoke-compose | `/` 200, COOP/COEP gesetzt, `/licenses` enthält pdf-lib und nicht Ghostscript |

Golden-Update nur mit explizitem `GOLDEN_UPDATE=1` und Review. Testdateien: synthetisch, keine echten Ausweise/Rechnungen mit Klardaten.

---

## 18. Abhängigkeiten (Runtime, self-hosted)

| Bereich | Lib | Verbot / Auflage |
|---|---|---|
| PDF | pdf-lib, pdfjs-dist v4/5, qpdf-WASM, optional PDFium-WASM | kein MuPDF, kein iText, kein Ghostscript |
| OCR | Tesseract.js deu+eng | Modelle lokal |
| Bild | jSquash, heic-decode, UTIF | OpenCV.js nur lazy (Dokument-Foto) |
| Video | ffmpeg.wasm **LGPL**, mp4box.js, mp4-muxer, WebCodecs | kein x264/x265 |
| ML | ONNX Runtime Web (WebGPU), Transformers.js v3, kokoro-js, WebLLM | kein CDN |
| Office | SheetJS Community, mammoth/docx | kein SheetJS Pro |
| Archiv | JSZip/fflate, libarchive.js oder 7z-wasm | |
| Codes | zxing-wasm | |

Alles aus `/assets` oder Bundle. Keine Laufzeit-CDN-Abhängigkeit.
