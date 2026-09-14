import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  currentName,
  currentRef,
  emptyStack,
  jumpTo,
  newStepRecord,
  provenanceManifest,
  pushStep,
  redo,
  removeStep,
  snapshotsToTrim,
  toPipelineSpec,
  undo,
} from '../src/lib/workspace/step-stack';
import type { SessionFileMeta, StepRecord } from '../src/lib/workspace/types';

function ok(toolId: string, i: number, extra: Partial<StepRecord> = {}): StepRecord {
  return {
    ...newStepRecord(toolId, { i }, {}, 1000 + i),
    status: 'ok',
    outputRef: `s/rev/f/${toolId}-${i}`,
    outputName: `${toolId}-${i}.pdf`,
    snapshot: true,
    ...extra,
  };
}

describe('step stack reducer', () => {
  it('starts at the original and pushes/undoes/redoes by moving head', () => {
    let s = emptyStack();
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
    s = pushStep(s, ok('pdf-compress', 1)).state;
    s = pushStep(s, ok('pdf-redact', 2)).state;
    expect(s.head).toBe(1);
    s = undo(s);
    expect(s.head).toBe(0);
    expect(canRedo(s)).toBe(true);
    s = undo(s);
    expect(s.head).toBe(-1);
    s = undo(s);
    expect(s.head).toBe(-1);
    s = redo(s);
    s = redo(s);
    s = redo(s);
    expect(s.head).toBe(1);
  });

  it('pushing after undo drops the redo tail and reports dropped records', () => {
    let s = emptyStack();
    s = pushStep(s, ok('a', 1)).state;
    s = pushStep(s, ok('b', 2)).state;
    s = pushStep(s, ok('c', 3)).state;
    s = undo(undo(s));
    const { state, dropped } = pushStep(s, ok('d', 4));
    expect(dropped.map((r) => r.toolId)).toEqual(['b', 'c']);
    expect(state.revisions.map((r) => r.toolId)).toEqual(['a', 'd']);
    expect(state.head).toBe(1);
  });

  it('jumpTo clamps and removeStep keeps head consistent', () => {
    let s = emptyStack();
    s = pushStep(s, ok('a', 1)).state;
    s = pushStep(s, ok('b', 2)).state;
    expect(jumpTo(s, 99).head).toBe(1);
    expect(jumpTo(s, -5).head).toBe(-1);
    const removed = removeStep(s, s.revisions[0]!.stepId);
    expect(removed.revisions).toHaveLength(1);
    expect(removed.head).toBe(0);
  });

  it('currentRef/currentName follow head', () => {
    const file: Pick<SessionFileMeta, 'srcRef' | 'revisions' | 'head' | 'name'> = {
      name: 'akte.pdf',
      srcRef: 's/src/f',
      revisions: [ok('pdf-compress', 1)],
      head: -1,
    };
    expect(currentRef(file)).toBe('s/src/f');
    expect(currentName(file)).toBe('akte.pdf');
    expect(currentRef({ ...file, head: 0 })).toBe('s/rev/f/pdf-compress-1');
    expect(currentName({ ...file, head: 0 })).toBe('pdf-compress-1.pdf');
  });

  it('keeps snapshots for the last 20 successful steps only', () => {
    const revisions = Array.from({ length: 25 }, (_, i) => ok('pdf-rotate', i));
    revisions.push({ ...ok('pdf-x', 99), status: 'error', snapshot: false });
    const trim = snapshotsToTrim(revisions, 20);
    expect(trim).toHaveLength(5);
    expect(trim.map((r) => r.options)).toEqual([{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }]);
    expect(snapshotsToTrim(revisions.slice(0, 20), 20)).toEqual([]);
  });

  it('serializes to a PipelineSpec without bytes, skipping failed steps and keeping selections', () => {
    const revisions = [
      ok('pdf-compress', 1),
      { ...ok('pdf-ocr', 2), status: 'error' as const },
      ok('pdf-redact', 3, { selection: { regions: [{ page: 1, x: 1, y: 2, w: 3, h: 4, unit: 'pdf' }] } }),
      ok('pdf-sanitize', 4),
    ];
    const spec = toPipelineSpec(revisions, 2);
    expect(spec.steps.map((s) => s.toolId)).toEqual(['pdf-compress', 'pdf-redact']);
    expect(spec.steps[1]?.selection?.regions).toHaveLength(1);
    expect(spec.steps[0]).not.toHaveProperty('selection');
    expect(JSON.stringify(spec)).not.toContain('outputRef');
  });

  it('builds a provenance manifest without bytes', () => {
    const file: SessionFileMeta = {
      id: 'f1',
      name: 'akte.pdf',
      mime: 'application/pdf',
      size: 10,
      family: 'pdf',
      addedAt: 0,
      srcRef: 's/src/f1',
      revisions: [ok('pdf-sanitize', 1, { verification: { passed: true, checks: [{ id: 'x', passed: true }] }, outputHash: 'abc' })],
      head: 0,
      findings: [],
    };
    const manifest = provenanceManifest(file);
    expect(manifest.format).toBe('neotools-provenance/1');
    expect((manifest.steps as unknown[]).length).toBe(1);
    expect(JSON.stringify(manifest)).toContain('"outputHash":"abc"');
    expect(manifest.local).toBe(true);
  });
});
