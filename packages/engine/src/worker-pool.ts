/**
 * Generic job pool (FRONTEND-REDESIGN §2.15 E / §6.3). Platform-neutral: the
 * caller supplies a slot factory (browser: `new Worker(...)` + Comlink; tests:
 * fake slots). The pool owns queueing, cancellation, warm-up and respawn.
 */

export interface PoolSlot {
  /** Called once after spawn; e.g. `ensurePack('pdf')`, `loadPdfjs()`. */
  warmup?(kind: string): Promise<void>;
  /** Hard kill — the pool respawns a replacement slot afterwards. */
  terminate(): void;
}

export interface PoolJobContext {
  signal: AbortSignal;
  progress(value: number, message?: string): void;
}

export type PoolJob<S extends PoolSlot, T> = (slot: S, ctx: PoolJobContext) => Promise<T>;

export interface PoolJobHandle<T> {
  id: string;
  promise: Promise<T>;
  cancel(): void;
}

export interface WorkerPoolOptions<S extends PoolSlot> {
  createSlot(): S;
  /** Default `min(4, max(2, hardwareConcurrency))`, hard cap 4 (WASM memory). */
  size?: number;
  /** Kill + respawn a slot when a job's `terminate()` is requested while running. */
  respawnOnCancel?: boolean;
  /** Called when a job throws; useful for telemetry-free logging. */
  onError?(err: unknown): void;
}

export type PoolJobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface PoolJobInfo {
  id: string;
  label: string;
  status: PoolJobStatus;
  ratio: number;
  message?: string;
}

interface Queued<S extends PoolSlot> {
  id: string;
  label: string;
  run: PoolJob<S, unknown>;
  resolve(value: unknown): void;
  reject(reason: unknown): void;
  controller: AbortController;
  heavy: boolean;
}

interface SlotState<S extends PoolSlot> {
  slot: S;
  busy: Queued<S> | null;
  warmed: Set<string>;
}

export function defaultPoolSize(hardwareConcurrency?: number): number {
  const hc = hardwareConcurrency ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined) ?? 2;
  return Math.max(1, Math.min(4, Math.max(2, Math.floor(hc))));
}

let jobSeq = 0;

export class WorkerPool<S extends PoolSlot> {
  private readonly slots: SlotState<S>[] = [];
  private readonly queue: Queued<S>[] = [];
  private readonly jobs = new Map<string, PoolJobInfo>();
  private readonly listeners = new Set<(jobs: PoolJobInfo[]) => void>();
  private readonly warmKinds = new Set<string>();
  private disposed = false;
  /** Max simultaneously running jobs flagged `heavy` (ffmpeg ⊕ onnx). */
  maxHeavy = 2;

  constructor(private readonly opts: WorkerPoolOptions<S>) {
    const size = opts.size ?? defaultPoolSize();
    for (let i = 0; i < size; i++) this.slots.push({ slot: opts.createSlot(), busy: null, warmed: new Set() });
  }

  get size(): number {
    return this.slots.length;
  }

  get pending(): number {
    return this.queue.length;
  }

  get running(): number {
    return this.slots.filter((s) => s.busy).length;
  }

  /** Warm every idle slot for `kind` (pack id / 'pdfjs'). Fire-and-forget safe. */
  async warm(kind: string): Promise<void> {
    this.warmKinds.add(kind);
    await Promise.all(
      this.slots
        .filter((s) => !s.busy && !s.warmed.has(kind))
        .map((s) => this.warmSlot(s, kind)),
    );
  }

  private async warmSlot(state: SlotState<S>, kind: string): Promise<void> {
    if (state.warmed.has(kind)) return;
    state.warmed.add(kind);
    try {
      await state.slot.warmup?.(kind);
    } catch (err) {
      state.warmed.delete(kind);
      this.opts.onError?.(err);
    }
  }

  submit<T>(label: string, run: PoolJob<S, T>, options: { heavy?: boolean } = {}): PoolJobHandle<T> {
    if (this.disposed) throw new Error('Pool ist geschlossen.');
    jobSeq += 1;
    const id = `job-${jobSeq}`;
    const controller = new AbortController();
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const queued: Queued<S> = {
      id,
      label,
      run: run as PoolJob<S, unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
      controller,
      heavy: Boolean(options.heavy),
    };
    this.jobs.set(id, { id, label, status: 'queued', ratio: 0 });
    this.queue.push(queued);
    this.emit();
    this.pump();
    return {
      id,
      promise,
      cancel: () => this.cancel(id),
    };
  }

  cancel(id: string): void {
    const qi = this.queue.findIndex((q) => q.id === id);
    if (qi >= 0) {
      const [q] = this.queue.splice(qi, 1);
      q!.controller.abort();
      this.finish(q!, 'cancelled');
      q!.reject(abortError());
      return;
    }
    const state = this.slots.find((s) => s.busy?.id === id);
    if (!state?.busy) return;
    const job = state.busy;
    job.controller.abort();
    if (this.opts.respawnOnCancel !== false) {
      // hard stop: kill the worker and respawn one slot
      try {
        state.slot.terminate();
      } catch {
        // ignore
      }
      state.slot = this.opts.createSlot();
      state.warmed = new Set();
      state.busy = null;
      this.finish(job, 'cancelled');
      job.reject(abortError());
      for (const kind of this.warmKinds) void this.warmSlot(state, kind);
      this.pump();
    }
  }

  cancelAll(): void {
    for (const q of [...this.queue]) this.cancel(q.id);
    for (const s of this.slots) if (s.busy) this.cancel(s.busy.id);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll();
    for (const s of this.slots) {
      try {
        s.slot.terminate();
      } catch {
        // ignore
      }
    }
    this.slots.length = 0;
    this.listeners.clear();
  }

  snapshot(): PoolJobInfo[] {
    return [...this.jobs.values()];
  }

  subscribe(fn: (jobs: PoolJobInfo[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Remove finished jobs from the snapshot list. */
  prune(): void {
    for (const [id, info] of this.jobs) {
      if (info.status === 'done' || info.status === 'error' || info.status === 'cancelled') this.jobs.delete(id);
    }
    this.emit();
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private finish(job: Queued<S>, status: PoolJobStatus): void {
    const info = this.jobs.get(job.id);
    if (info) {
      info.status = status;
      if (status === 'done') info.ratio = 1;
    }
    this.emit();
  }

  private heavyRunning(): number {
    return this.slots.filter((s) => s.busy?.heavy).length;
  }

  private pump(): void {
    if (this.disposed) return;
    for (const state of this.slots) {
      if (state.busy) continue;
      const idx = this.queue.findIndex((q) => !q.heavy || this.heavyRunning() < this.maxHeavy);
      if (idx < 0) return;
      const job = this.queue.splice(idx, 1)[0]!;
      state.busy = job;
      const info = this.jobs.get(job.id);
      if (info) info.status = 'running';
      this.emit();
      const ctx: PoolJobContext = {
        signal: job.controller.signal,
        progress: (value, message) => {
          const i = this.jobs.get(job.id);
          if (!i) return;
          i.ratio = Math.max(0, Math.min(1, value));
          if (message !== undefined) i.message = message;
          this.emit();
        },
      };
      void job
        .run(state.slot, ctx)
        .then((value) => {
          if (state.busy !== job) return; // cancelled + respawned meanwhile
          state.busy = null;
          this.finish(job, 'done');
          job.resolve(value);
        })
        .catch((err) => {
          if (state.busy !== job) return;
          state.busy = null;
          this.finish(job, job.controller.signal.aborted ? 'cancelled' : 'error');
          this.opts.onError?.(err);
          job.reject(err);
        })
        .finally(() => this.pump());
    }
  }
}

function abortError(): Error {
  const err = new Error('Abgebrochen');
  err.name = 'AbortError';
  return err;
}
