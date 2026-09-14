import { expose } from 'comlink';
import {
  applyTeamPresets,
  createToolContext,
  neoFileFromBytes,
  runTool,
  type Finding,
  type NeoFile,
  type PreviewFrame,
  type PreviewRequest,
  type Registry,
} from '@neotools/engine';
import { browserPlatform } from '@neotools/engine/platform/browser';
import { analyzePdf, createPdfRegistry, previewRedactHits, loadPdfjs } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';

let registry: Registry = registerForensicsTools(createPdfRegistry());
const loadedPacks = new Set<string>(['pdf', 'forensics']);
let presetsDoc: unknown;

function applyPresets(): void {
  if (!presetsDoc || typeof presetsDoc !== 'object') return;
  try {
    registry = applyTeamPresets(registry, presetsDoc);
  } catch {
    // invalid team presets
  }
}

function packForTool(toolId: string): string {
  if (toolId.startsWith('forensics-')) return 'forensics';
  if (toolId.startsWith('dach-')) return 'dach';
  if (
    toolId.startsWith('speech-') ||
    toolId.startsWith('subtitles-') ||
    toolId.startsWith('transcript-') ||
    toolId === 'audio-profanity-bleep-list' ||
    toolId === 'a11y-audio-description-draft'
  ) {
    return 'speech';
  }
  if (toolId.startsWith('creator-') && toolId !== 'creator-export-pack') return 'creator';
  if (toolId.startsWith('a11y-')) return 'image-ai';
  if (toolId.startsWith('video-') || toolId.startsWith('audio-') || toolId === 'gif-to-video') return 'media';
  if (toolId.startsWith('archive-') || toolId.startsWith('files-')) return 'archive';
  if (
    toolId.startsWith('docx-') ||
    toolId.startsWith('xlsx-') ||
    toolId.startsWith('csv-') ||
    toolId.startsWith('pptx-') ||
    toolId.startsWith('epub-') ||
    toolId.startsWith('markdown-') ||
    toolId.startsWith('html-') ||
    toolId.startsWith('text-') ||
    toolId.startsWith('json-') ||
    toolId === 'data-clean' ||
    toolId === 'vcard-tools' ||
    toolId === 'ics-merge' ||
    toolId === 'font-subset' ||
    toolId === 'qr-batch' ||
    toolId === 'anki-from-images' ||
    toolId === 'pdf-to-epub'
  ) {
    return 'office';
  }
  if (
    toolId === 'image-remove-background' ||
    toolId === 'image-auto-blur' ||
    toolId === 'image-doc-repair' ||
    toolId === 'image-screenshot-workshop' ||
    toolId === 'image-upscale' ||
    toolId === 'image-denoise' ||
    toolId === 'image-alt-text'
  ) {
    return 'image-ai';
  }
  if (toolId.startsWith('image-') || toolId === 'creator-export-pack') return 'image';
  return 'pdf';
}

async function ensurePack(pack: string): Promise<void> {
  if (loadedPacks.has(pack)) return;
  loadedPacks.add(pack);
  switch (pack) {
    case 'image': {
      const { registerImageTools } = await import('@neotools/tools-image');
      registry = registerImageTools(registry);
      break;
    }
    case 'image-ai': {
      const { registerImageAiTools } = await import('@neotools/tools-image-ai');
      registry = registerImageAiTools(registry);
      break;
    }
    case 'dach': {
      const { registerDachTools } = await import('@neotools/tools-dach');
      registry = registerDachTools(registry);
      break;
    }
    case 'speech': {
      const { registerSpeechTools } = await import('@neotools/tools-speech');
      registry = registerSpeechTools(registry);
      break;
    }
    case 'office': {
      const { registerOfficeTools } = await import('@neotools/tools-office');
      registry = registerOfficeTools(registry);
      break;
    }
    case 'media': {
      const { registerMediaTools } = await import('@neotools/tools-media');
      registry = registerMediaTools(registry);
      break;
    }
    case 'archive': {
      const { registerArchiveTools } = await import('@neotools/tools-archive');
      registry = registerArchiveTools(registry);
      break;
    }
    case 'creator': {
      const { registerCreatorTools } = await import('@neotools/tools-creator');
      registry = registerCreatorTools(registry);
      break;
    }
    default:
      break;
  }
  applyPresets();
}

async function ensureTool(toolId: string): Promise<void> {
  await ensurePack(packForTool(toolId));
}

const presetsReady = (async () => {
  try {
    const { loadTeamPresetsJson } = await import('../lib/presets-store');
    const local = await loadTeamPresetsJson();
    if (local) {
      presetsDoc = JSON.parse(local) as unknown;
      applyPresets();
      return;
    }
  } catch {
    // IndexedDB unavailable or invalid desktop presets
  }
  try {
    const res = await fetch('/presets.json');
    if (!res.ok) return;
    presetsDoc = await res.json();
    applyPresets();
  } catch {
    // invalid bundled team presets
  }
})();
void loadPdfjs();

export interface WorkerFile {
  name: string;
  mime: string;
  data: Uint8Array;
}

/**
 * Input reference for the worker pool: bytes inline (< 64 MiB) or an OPFS
 * path the worker reads itself (large files, no double copy in the page).
 */
export interface WorkerFileRef {
  name: string;
  mime: string;
  data?: Uint8Array;
  opfsPath?: string;
}

async function readOpfsPath(path: string): Promise<Uint8Array> {
  const root = await navigator.storage.getDirectory();
  const parts = path.split('/').filter(Boolean);
  let dir: FileSystemDirectoryHandle = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
  const handle = await dir.getFileHandle(parts[parts.length - 1]!);
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

async function toNeoFile(ref: WorkerFileRef): Promise<NeoFile> {
  if (ref.data) return neoFileFromBytes(ref.name, ref.data, ref.mime);
  if (ref.opfsPath) return neoFileFromBytes(ref.name, await readOpfsPath(ref.opfsPath), ref.mime);
  throw new Error(`Datei ohne Inhalt: ${ref.name}`);
}

const ANALYZE_TIMEOUT_MS = 2000;

export interface WorkerApi {
  run(
    toolId: string,
    files: WorkerFileRef[],
    options: unknown,
    onProgress?: (value: number, message?: string) => void,
  ): Promise<{
    outputs: WorkerFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  }>;
  runPipeline(
    spec: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> },
    files: WorkerFileRef[],
    onProgress?: (value: number, message?: string) => void,
  ): Promise<{
    outputs: WorkerFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  }>;
  previewRedact(
    file: WorkerFileRef,
    options: unknown,
  ): Promise<{ hits: unknown[]; warnings: string[]; pages: number }>;
  /** Warm a pack (and pdf.js) in this worker so the first run does not pay the import. */
  warm(kind: string): Promise<void>;
  /** Fast findings for the FindingBar; times out after 2 s and returns what it has. */
  analyze(file: WorkerFileRef): Promise<Finding[]>;
  /** Optional tool preview (`tool.preview`); empty array when the tool has none. */
  preview(toolId: string, files: WorkerFileRef[], req: PreviewRequest): Promise<PreviewFrame[]>;
  modelStatus(toolId: string): Promise<
    Array<{
      id: string;
      ready: boolean;
      sizeBytes: number;
      license: string;
      confirmMessageDe: string;
      confirmMessageEn: string;
    }>
  >;
}

const api: WorkerApi = {
  async run(toolId, files, options, onProgress) {
    await presetsReady;
    await ensureTool(toolId);
    const tool = registry.require(toolId);
    const ctx = createToolContext({
      platform: browserPlatform(),
      progress: (v, m) => onProgress?.(v, m),
    });
    const result = await runTool(tool, ctx, await Promise.all(files.map(toNeoFile)), options ?? {});
    const outputs: WorkerFile[] = [];
    for (const file of result.outputs) {
      outputs.push({ name: file.name, mime: file.mime, data: await file.bytes() });
    }
    return { outputs, warnings: result.warnings, report: result.report };
  },
  async runPipeline(spec, files, onProgress) {
    await presetsReady;
    for (const step of spec.steps) await ensureTool(step.toolId);
    const { runPipeline } = await import('@neotools/engine');
    const ctx = createToolContext({
      platform: browserPlatform(),
      progress: (v, m) => onProgress?.(v, m),
    });
    const result = await runPipeline(registry, spec, await Promise.all(files.map(toNeoFile)), ctx);
    const outputs: WorkerFile[] = [];
    for (const file of result.outputs) {
      outputs.push({ name: file.name, mime: file.mime, data: await file.bytes() });
    }
    return { outputs, warnings: result.warnings, report: result.report };
  },
  async previewRedact(file, options) {
    const parsed = options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
    const patterns = Array.isArray(parsed.patterns)
      ? (parsed.patterns as Array<
          | 'iban'
          | 'steuer-id'
          | 'sv-nummer'
          | 'ausweisnummer'
          | 'kennzeichen'
          | 'email'
          | 'telefon'
          | 'datum'
          | 'betrag'
          | 'custom'
        >)
      : (['iban', 'steuer-id', 'sv-nummer', 'ausweisnummer', 'kennzeichen', 'email', 'telefon'] as const);
    const data = await (await toNeoFile(file)).bytes();
    return previewRedactHits(data, {
      mode: (parsed.mode as 'auto' | 'manual' | 'both') ?? 'auto',
      patterns: [...patterns],
      customRegex: Array.isArray(parsed.customRegex) ? (parsed.customRegex as string[]) : undefined,
      ner: Boolean(parsed.ner),
      regions: Array.isArray(parsed.regions)
        ? (parsed.regions as Array<{ page: number; x: number; y: number; w: number; h: number }>)
        : [],
      ocrScanned: Boolean(parsed.ocrScanned),
    });
  },
  async warm(kind) {
    await presetsReady;
    if (kind === 'pdfjs') {
      await loadPdfjs();
      return;
    }
    await ensurePack(kind);
  },
  async analyze(file) {
    await presetsReady;
    const bytes = await (await toNeoFile(file)).bytes();
    const timeout = new Promise<Finding[]>((resolve) => setTimeout(() => resolve([]), ANALYZE_TIMEOUT_MS));
    if (file.mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return Promise.race([analyzePdf(bytes).catch(() => [] as Finding[]), timeout]);
    }
    // Generic path: every loaded tool that accepts the mime and has an analyze hook.
    const ctx = createToolContext({ platform: browserPlatform() });
    const neo = neoFileFromBytes(file.name, bytes, file.mime);
    const runs = registry
      .list()
      .filter((t) => t.analyze && t.inputs.accept.some((a) => a === '*/*' || a === file.mime || (a.endsWith('/*') && file.mime.startsWith(a.slice(0, -1)))))
      .map((t) => t.analyze!(ctx, neo).catch(() => [] as Finding[]));
    if (!runs.length) return [];
    return Promise.race([Promise.all(runs).then((all) => all.flat()), timeout]);
  },
  async preview(toolId, files, req) {
    await presetsReady;
    await ensureTool(toolId);
    const tool = registry.require(toolId);
    if (!tool.preview) return [];
    const ctx = createToolContext({ platform: browserPlatform() });
    return tool.preview(ctx, await Promise.all(files.map(toNeoFile)), req);
  },
  async modelStatus(toolId) {
    await ensureTool(toolId);
    const { modelStatus } = await import('@neotools/tools-image-ai');
    return modelStatus(toolId, browserPlatform());
  },
};

expose(api);
