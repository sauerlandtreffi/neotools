import type { Finding, PipelineSpec, Selection, VerificationReport, WorkspaceFamily } from '@neotools/engine';

export type StepStatus = 'queued' | 'running' | 'ok' | 'error';

/** One applied (or attempted) step on a session file — FRONTEND-REDESIGN §2.9. */
export interface StepRecord {
  stepId: string;
  toolId: string;
  options: Record<string, unknown>;
  selection: Selection;
  status: StepStatus;
  createdAt: number;
  /** OPFS key of the primary output snapshot (`sessions/<sid>/rev/<fid>/<stepId>`). */
  outputRef?: string;
  outputName?: string;
  outputMime?: string;
  outputSize?: number;
  /** false ⇒ snapshot was trimmed (older than the last 20 steps); replay via pipeline spec. */
  snapshot: boolean;
  inputHash?: string;
  outputHash?: string;
  verification?: VerificationReport;
  /** Structured report summary (no bytes). */
  report?: Record<string, unknown>;
  provenance?: unknown;
  warnings: string[];
  error?: string;
  /** Sidecar outputs (reports, JSON) kept for export. */
  sidecars?: Array<{ name: string; mime: string; ref: string; size: number }>;
}

export interface SessionFileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  family: WorkspaceFamily | null;
  addedAt: number;
  /** OPFS key of the original bytes. */
  srcRef: string;
  revisions: StepRecord[];
  /** Index into `revisions`; -1 = original. */
  head: number;
  findings: Finding[];
  analyzedAt?: number;
  /** Page count (PDF) once known. */
  pages?: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: SessionFileMeta[];
  activeFileId: string | null;
  /** Bytes stored for this session (src + snapshots). */
  bytes: number;
}

export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
  fileCount: number;
  stepCount: number;
  bytes: number;
  fileNames: string[];
}

export interface SessionMetaStore {
  put(meta: SessionMeta): Promise<void>;
  get(id: string): Promise<SessionMeta | undefined>;
  all(): Promise<SessionMeta[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface BlobStore {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export interface Toast {
  id: string;
  kind: 'ok' | 'warn' | 'err' | 'info';
  text: string;
  timeoutMs?: number;
}

export interface JobView {
  id: string;
  label: string;
  ratio: number;
  message?: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
}

export type ExportTarget = 'download' | 'picker' | 'session';

export interface ExportSpec {
  what: 'head' | 'selected' | 'all';
  format: 'original' | 'zip';
  name: string;
  includeProvenance: boolean;
  target: ExportTarget;
}

export interface StoredPipeline {
  spec: PipelineSpec;
  name: string;
}

/** Max number of OPFS snapshots kept per file (older steps keep only the spec). */
export const SNAPSHOT_DEPTH = 20;

/** Inline transfer limit; larger files go to the worker as OPFS paths. */
export const INLINE_TRANSFER_LIMIT = 64 * 1024 * 1024;
