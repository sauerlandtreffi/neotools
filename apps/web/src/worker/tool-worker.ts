import { expose } from 'comlink';
import { createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import { browserPlatform } from '@neotools/engine/platform/browser';
import { createPdfRegistry, previewRedactHits } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';

const registry = registerForensicsTools(createPdfRegistry());

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
}

const api: WorkerApi = {
  async run(toolId, files, options, onProgress) {
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
};

expose(api);
