import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import {
  createToolContext,
  neoFileFromBytes,
  runPipeline,
  runTool,
  type Registry,
  type ToolResult,
} from '@neotools/engine';
import { nodePlatformReady } from '@neotools/engine/platform/node';

export type JobKind = 'run' | 'pipeline';

export interface JobFile {
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface JobRequest {
  kind: JobKind;
  toolId?: string;
  spec?: { steps: Array<{ toolId: string; options: unknown; whenMime?: string[] }> };
  options?: unknown;
  files: JobFile[];
}

export interface JobRecord {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  result?: {
    outputs: JobFile[];
    warnings: string[];
    report?: Record<string, unknown>;
  };
}

export class JobQueue {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly waiters = new Map<string, Array<(job: JobRecord) => void>>();
  private running = 0;
  private seq = 0;

  constructor(
    private readonly registry: Registry,
    private readonly maxParallel: number,
    private readonly timeoutMs: number,
    private readonly inline: boolean,
  ) {}

  enqueue(req: JobRequest): JobRecord {
    const id = `job_${Date.now().toString(36)}_${(this.seq += 1).toString(36)}`;
    const job: JobRecord = { id, status: 'queued', createdAt: Date.now() };
    this.jobs.set(id, job);
    void this.pump(id, req);
    return job;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  wait(id: string, timeoutMs = this.timeoutMs): Promise<JobRecord> {
    const current = this.jobs.get(id);
    if (!current) return Promise.reject(new Error('Unbekannter Job.'));
    if (current.status === 'done' || current.status === 'error' || current.status === 'cancelled') {
      return Promise.resolve(current);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel(id, 'timeout');
        reject(new Error('Job-Timeout'));
      }, timeoutMs);
      const list = this.waiters.get(id) ?? [];
      list.push((job) => {
        clearTimeout(timer);
        resolve(job);
      });
      this.waiters.set(id, list);
    });
  }

  cancel(id: string, reason = 'cancelled'): void {
    const job = this.jobs.get(id);
    if (!job || job.status === 'done' || job.status === 'error') return;
    job.status = 'cancelled';
    job.error = reason;
    job.finishedAt = Date.now();
    this.finishNotify(job);
  }

  private finishNotify(job: JobRecord): void {
    const list = this.waiters.get(job.id) ?? [];
    this.waiters.delete(job.id);
    for (const fn of list) fn(job);
  }

  private async pump(id: string, req: JobRequest): Promise<void> {
    while (this.running >= this.maxParallel) {
      await new Promise((r) => setTimeout(r, 25));
      const job = this.jobs.get(id);
      if (!job || job.status === 'cancelled') return;
    }
    const job = this.jobs.get(id);
    if (!job || job.status === 'cancelled') return;
    this.running += 1;
    job.status = 'running';
    job.startedAt = Date.now();
    try {
      const result = this.inline ? await this.runInline(req) : await this.runWorker(req);
      job.status = 'done';
      job.result = result;
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      job.finishedAt = Date.now();
      this.running -= 1;
      this.finishNotify(job);
    }
  }

  private async runInline(req: JobRequest): Promise<NonNullable<JobRecord['result']>> {
    const platform = await nodePlatformReady();
    const files = req.files.map((f) => neoFileFromBytes(f.name, f.data, f.mime));
    const ctx = createToolContext({ platform });
    let result: ToolResult;
    if (req.kind === 'pipeline') {
      if (!req.spec) throw new Error('Pipeline-Spec fehlt.');
      result = await runPipeline(this.registry, req.spec, files, ctx);
    } else {
      if (!req.toolId) throw new Error('toolId fehlt.');
      const tool = this.registry.require(req.toolId);
      result = await runTool(tool, ctx, files, req.options ?? {});
    }
    const outputs: JobFile[] = [];
    for (const file of result.outputs) {
      outputs.push({ name: file.name, mime: file.mime, data: await file.bytes() });
    }
    return { outputs, warnings: result.warnings, report: result.report };
  }

  private runWorker(req: JobRequest): Promise<NonNullable<JobRecord['result']>> {
    const url = new URL('./job-worker.js', import.meta.url);
    return new Promise((resolve, reject) => {
      const worker = new Worker(fileURLToPath(url), {
        workerData: {
          kind: req.kind,
          toolId: req.toolId,
          spec: req.spec,
          options: req.options,
          files: req.files,
        },
      });
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error('Worker-Timeout'));
      }, this.timeoutMs);
      worker.once('message', (msg: { ok: boolean; result?: NonNullable<JobRecord['result']>; error?: string }) => {
        clearTimeout(timer);
        void worker.terminate();
        if (msg.ok && msg.result) resolve(msg.result);
        else reject(new Error(msg.error ?? 'Worker-Fehler'));
      });
      worker.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
