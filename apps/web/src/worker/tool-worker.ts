import { expose } from 'comlink';
import { applyTeamPresets, createToolContext, neoFileFromBytes, runTool, type Registry } from '@neotools/engine';
import { browserPlatform } from '@neotools/engine/platform/browser';
import { createPdfRegistry, previewRedactHits, loadPdfjs } from '@neotools/tools-pdf';
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

export interface WorkerApi {
  run(
    toolId: string,
    files: WorkerFile[],
    options: unknown,
    onProgress?: (value: number, message?: string) => void,
  ): Promise<{
    outputs: WorkerFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  }>;
  runPipeline(
    spec: { steps: Array<{ toolId: string; options: unknown }> },
    files: WorkerFile[],
    onProgress?: (value: number, message?: string) => void,
  ): Promise<{
    outputs: WorkerFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  }>;
  previewRedact(
    file: WorkerFile,
    options: unknown,
  ): Promise<{ hits: unknown[]; warnings: string[]; pages: number }>;
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
    const result = await runTool(
      tool,
      ctx,
      files.map((f) => neoFileFromBytes(f.name, f.data, f.mime)),
      options ?? {},
    );
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
    const result = await runPipeline(
      registry,
      spec,
      files.map((f) => neoFileFromBytes(f.name, f.data, f.mime)),
      ctx,
    );
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
    return previewRedactHits(file.data, {
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
  async modelStatus(toolId) {
    await ensureTool(toolId);
    const { modelStatus } = await import('@neotools/tools-image-ai');
    return modelStatus(toolId, browserPlatform());
  },
};

expose(api);
