import { proxy, wrap, type Remote } from 'comlink';
import { WorkerPool, type PoolJobInfo, type PoolSlot, type PreviewFrame, type PreviewRequest, type Finding } from '@neotools/engine';
import type { WorkerApi, WorkerFileRef } from '../../worker/tool-worker';

/**
 * UI-side worker pool (FRONTEND-REDESIGN §6.3): 2–4 warm tool workers,
 * job queue, cancel = terminate + respawn one slot. `createToolWorker()` stays
 * for the legacy ToolApp; the workspace only talks to this pool.
 */
class ToolSlot implements PoolSlot {
  readonly worker: Worker;
  readonly api: Remote<WorkerApi>;
  constructor() {
    this.worker = new Worker(new URL('../../worker/tool-worker.ts', import.meta.url), { type: 'module' });
    this.api = wrap<WorkerApi>(this.worker);
  }
  async warmup(kind: string): Promise<void> {
    await this.api.warm(kind);
  }
  terminate(): void {
    this.worker.terminate();
  }
}

export type ProgressCb = (value: number, message?: string) => void;

export interface RunResult {
  outputs: Array<{ name: string; mime: string; data: Uint8Array }>;
  warnings: string[];
  report?: Record<string, unknown>;
}

let pool: WorkerPool<ToolSlot> | null = null;

export function getWorkerPool(): WorkerPool<ToolSlot> {
  if (!pool) {
    pool = new WorkerPool<ToolSlot>({ createSlot: () => new ToolSlot() });
  }
  return pool;
}

/** Warm pdf pack + pdf.js in every idle slot (after the first PDF lands in the tray). */
export function warmFamily(family: string | null): void {
  if (!family) return;
  const p = getWorkerPool();
  void p.warm(family).catch(() => undefined);
  if (family === 'pdf') void p.warm('pdfjs').catch(() => undefined);
}

export function runToolJob(
  toolId: string,
  files: WorkerFileRef[],
  options: unknown,
  onProgress?: ProgressCb,
  label = toolId,
) {
  return getWorkerPool().submit<RunResult>(label, async (slot, ctx) => {
    const cb = proxy((v: number, m?: string) => {
      ctx.progress(v, m);
      onProgress?.(v, m);
    });
    return slot.api.run(toolId, files, options, cb) as Promise<RunResult>;
  }, { heavy: isHeavy(toolId) });
}

export function runPipelineJob(
  spec: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> },
  files: WorkerFileRef[],
  onProgress?: ProgressCb,
  label = 'pipeline',
) {
  return getWorkerPool().submit<RunResult>(label, async (slot, ctx) => {
    const cb = proxy((v: number, m?: string) => {
      ctx.progress(v, m);
      onProgress?.(v, m);
    });
    return slot.api.runPipeline(spec, files, cb) as Promise<RunResult>;
  });
}

export function analyzeJob(file: WorkerFileRef) {
  return getWorkerPool().submit<Finding[]>('analyze', async (slot) => slot.api.analyze(file));
}

export function previewRedactJob(file: WorkerFileRef, options: unknown) {
  return getWorkerPool().submit<{ hits: unknown[]; warnings: string[]; pages: number }>('preview-redact', async (slot) =>
    slot.api.previewRedact(file, options),
  );
}

export function previewJob(toolId: string, files: WorkerFileRef[], req: PreviewRequest) {
  return getWorkerPool().submit<PreviewFrame[]>('preview', async (slot) => slot.api.preview(toolId, files, req));
}

export function subscribeJobs(fn: (jobs: PoolJobInfo[]) => void): () => void {
  return getWorkerPool().subscribe(fn);
}

function isHeavy(toolId: string): boolean {
  return toolId === 'pdf-ocr' || toolId.startsWith('video-') || toolId.startsWith('audio-') || toolId.startsWith('speech-');
}

/** Test hook. */
export function resetWorkerPoolForTests(): void {
  pool?.dispose();
  pool = null;
}
