import type { PipelineSpec, Selection } from '@neotools/engine';
import { SNAPSHOT_DEPTH, type SessionFileMeta, type StepRecord } from './types';

/**
 * Pure step-stack reducer (FRONTEND-REDESIGN §2.9). Undo/redo move `head`,
 * bytes come from snapshots, never from inverted operations.
 */
export interface StackState {
  revisions: StepRecord[];
  head: number;
}

export function emptyStack(): StackState {
  return { revisions: [], head: -1 };
}

export function canUndo(s: StackState): boolean {
  return s.head >= 0;
}

export function canRedo(s: StackState): boolean {
  return s.head < s.revisions.length - 1;
}

/** Append after `head`, dropping any redo tail. Returns the dropped records (their snapshots can be deleted). */
export function pushStep(s: StackState, record: StepRecord): { state: StackState; dropped: StepRecord[] } {
  const keep = s.revisions.slice(0, s.head + 1);
  const dropped = s.revisions.slice(s.head + 1);
  const revisions = [...keep, record];
  return { state: { revisions, head: revisions.length - 1 }, dropped };
}

export function replaceStep(s: StackState, stepId: string, patch: Partial<StepRecord>): StackState {
  return { ...s, revisions: s.revisions.map((r) => (r.stepId === stepId ? { ...r, ...patch } : r)) };
}

export function removeStep(s: StackState, stepId: string): StackState {
  const idx = s.revisions.findIndex((r) => r.stepId === stepId);
  if (idx < 0) return s;
  const revisions = s.revisions.filter((r) => r.stepId !== stepId);
  const head = idx <= s.head ? s.head - 1 : s.head;
  return { revisions, head: Math.max(-1, Math.min(head, revisions.length - 1)) };
}

export function undo(s: StackState): StackState {
  return canUndo(s) ? { ...s, head: s.head - 1 } : s;
}

export function redo(s: StackState): StackState {
  return canRedo(s) ? { ...s, head: s.head + 1 } : s;
}

export function jumpTo(s: StackState, index: number): StackState {
  const head = Math.max(-1, Math.min(index, s.revisions.length - 1));
  return { ...s, head };
}

/** The record whose output is currently shown, or null for the original. */
export function headRecord(s: StackState): StepRecord | null {
  return s.head >= 0 ? (s.revisions[s.head] ?? null) : null;
}

/** OPFS ref of the bytes to show: original or the head snapshot. */
export function currentRef(file: Pick<SessionFileMeta, 'srcRef' | 'revisions' | 'head'>): string {
  if (file.head < 0) return file.srcRef;
  const rec = file.revisions[file.head];
  return rec?.outputRef ?? file.srcRef;
}

export function currentName(file: Pick<SessionFileMeta, 'name' | 'revisions' | 'head'>): string {
  if (file.head < 0) return file.name;
  return file.revisions[file.head]?.outputName ?? file.name;
}

/**
 * Snapshot policy: keep OPFS snapshots for the last `depth` *successful* steps;
 * return the records whose snapshots should be dropped (spec-only replay).
 */
export function snapshotsToTrim(revisions: readonly StepRecord[], depth = SNAPSHOT_DEPTH): StepRecord[] {
  const ok = revisions.filter((r) => r.status === 'ok' && r.snapshot && r.outputRef);
  if (ok.length <= depth) return [];
  return ok.slice(0, ok.length - depth);
}

/** Successful steps up to and including `index` as a replayable pipeline (no bytes). */
export function toPipelineSpec(revisions: readonly StepRecord[], upToIndex = revisions.length - 1): PipelineSpec {
  return {
    steps: revisions
      .slice(0, upToIndex + 1)
      .filter((r) => r.status === 'ok')
      .map((r) => ({
        toolId: r.toolId,
        options: r.options,
        ...(hasSelection(r.selection) ? { selection: r.selection } : {}),
      })),
  };
}

function hasSelection(sel: Selection | undefined): boolean {
  if (!sel) return false;
  return Boolean(
    (sel.pages && sel.pages.length) ||
      (sel.regions && sel.regions.length) ||
      sel.timeRange ||
      (sel.fileIds && sel.fileIds.length),
  );
}

let stepSeq = 0;
export function newStepId(): string {
  stepSeq += 1;
  const rnd = Math.random().toString(36).slice(2, 7);
  return `s${Date.now().toString(36)}${rnd}${stepSeq}`;
}

export function newStepRecord(
  toolId: string,
  options: Record<string, unknown>,
  selection: Selection,
  now = Date.now(),
): StepRecord {
  return {
    stepId: newStepId(),
    toolId,
    options,
    selection,
    status: 'queued',
    createdAt: now,
    snapshot: false,
    warnings: [],
  };
}

/** Provenance manifest for the export drawer: steps without bytes, hashes when known. */
export function provenanceManifest(file: SessionFileMeta, upToIndex = file.head): Record<string, unknown> {
  const steps = file.revisions.slice(0, upToIndex + 1).filter((r) => r.status === 'ok');
  return {
    format: 'neotools-provenance/1',
    source: { name: file.name, mime: file.mime, size: file.size },
    steps: steps.map((r) => ({
      toolId: r.toolId,
      options: r.options,
      selection: r.selection,
      at: new Date(r.createdAt).toISOString(),
      inputHash: r.inputHash,
      outputHash: r.outputHash,
      verification: r.verification
        ? { passed: r.verification.passed, checks: r.verification.checks.length, warnings: r.verification.warnings ?? [] }
        : undefined,
      provenance: r.provenance,
    })),
    generatedAt: new Date().toISOString(),
    local: true,
  };
}
