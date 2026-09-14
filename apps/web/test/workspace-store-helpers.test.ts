// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { humanizeFieldName } from '../src/components/ZodForm';
import { newStepRecord } from '../src/lib/workspace/step-stack';
import { applySelectionByFields, pickPrimaryOutput, shareSafeChecklist, shareSafeState } from '../src/lib/workspace/store';
import type { SessionFileMeta, StepRecord } from '../src/lib/workspace/types';

function file(revisions: StepRecord[], head = revisions.length - 1): SessionFileMeta {
  return {
    id: 'f1',
    name: 'akte.pdf',
    mime: 'application/pdf',
    size: 10,
    family: 'pdf',
    addedAt: 0,
    srcRef: 's/src/f1',
    revisions,
    head,
    findings: [],
  };
}

function step(toolId: string, extra: Partial<StepRecord> = {}): StepRecord {
  return { ...newStepRecord(toolId, {}, {}), status: 'ok', snapshot: true, outputRef: `s/rev/f1/${toolId}`, ...extra };
}

describe('pickPrimaryOutput', () => {
  const pdf = { name: 'a.pdf', mime: 'application/pdf' };
  it('prefers the document mime', () => {
    expect(pickPrimaryOutput([{ name: 'r.json', mime: 'application/json' }, pdf], { mime: 'application/pdf' })).toBe(pdf);
  });
  it('never lets a report (json/markdown) replace the document', () => {
    const out = pickPrimaryOutput(
      [
        { name: 'r.json', mime: 'application/json' },
        { name: 'r.md', mime: 'text/markdown' },
      ],
      { mime: 'application/pdf' },
    );
    expect(out).toBeUndefined();
  });
  it('inspect tools are always report-only', () => {
    const png = { name: 'p.png', mime: 'image/png' };
    expect(pickPrimaryOutput([png], { mime: 'application/pdf' }, { verb: 'inspect' })).toBeUndefined();
    expect(pickPrimaryOutput([png], { mime: 'application/pdf' }, { verb: 'export' })).toBe(png);
  });
});

describe('shareSafeState (fail-closed)', () => {
  it('is unknown without verification', () => {
    expect(shareSafeState(null)).toBe('unknown');
    expect(shareSafeState(file([]))).toBe('unknown');
    expect(shareSafeState(file([step('pdf-compress')]))).toBe('unknown');
  });
  it('is yes only when passed without warnings', () => {
    expect(shareSafeState(file([step('pdf-redact', { verification: { passed: true, checks: [], warnings: [] } })]))).toBe('yes');
    expect(shareSafeState(file([step('pdf-redact', { verification: { passed: true, checks: [], warnings: ['x'] } })]))).toBe('no');
    expect(shareSafeState(file([step('pdf-redact', { verification: { passed: false, checks: [], warnings: [] } })]))).toBe('no');
  });
  it('a later byte-changing step resets to unknown; a report-only share-safe step sets the light', () => {
    const verified = step('pdf-redact', { verification: { passed: true, checks: [], warnings: [] } });
    expect(shareSafeState(file([verified, step('pdf-compress')]))).toBe('unknown');
    const check = (light: string) =>
      step('forensics-share-safe', {
        snapshot: false,
        report: { files: [{ light, checklist: [{ id: 'js', label: { de: 'JavaScript', en: 'JavaScript' }, present: light !== 'green', severity: 'block' }] }] },
      });
    expect(shareSafeState(file([verified, step('pdf-compress'), check('green')]))).toBe('yes');
    expect(shareSafeState(file([verified, step('pdf-compress'), check('red')]))).toBe('no');
    expect(shareSafeChecklist(file([step('pdf-compress'), check('red')]))).toHaveLength(1);
    expect(shareSafeChecklist(file([check('red'), step('pdf-compress')]))).toHaveLength(0);
  });
  it('respects head (undo moves the light back)', () => {
    const revs = [step('pdf-redact', { verification: { passed: true, checks: [], warnings: [] } }), step('pdf-compress')];
    expect(shareSafeState(file(revs, 1))).toBe('unknown');
    expect(shareSafeState(file(revs, 0))).toBe('yes');
    expect(shareSafeState(file(revs, -1))).toBe('unknown');
  });
});

describe('applySelectionByFields', () => {
  it('writes pages as string or array depending on the declared field', () => {
    const asString = applySelectionByFields('pdf-rotate', [{ name: 'pages', kind: 'string' } as never], {}, { pages: [1, 2, 3, 7] });
    expect(asString.pages).toBe('1-3,7');
    const asArray = applySelectionByFields('x', [{ name: 'pages', kind: 'array' } as never], {}, { pages: [2, 4] });
    expect(asArray.pages).toEqual([2, 4]);
  });
  it('maps regions and switches redact auto→both', () => {
    const out = applySelectionByFields(
      'pdf-redact',
      [{ name: 'regions', kind: 'array' } as never, { name: 'mode', kind: 'enum' } as never],
      { mode: 'auto' },
      { regions: [{ page: 2, x: 1, y: 2, w: 3, h: 4, unit: 'pdf' }] },
    );
    expect(out.mode).toBe('both');
    expect(out.regions).toEqual([{ page: 2, x: 1, y: 2, w: 3, h: 4 }]);
  });
});

describe('humanizeFieldName', () => {
  it('splits camelCase and keeps acronyms', () => {
    expect(humanizeFieldName('targetSizeMb')).toBe('Target size MB');
    expect(humanizeFieldName('stripMetadata')).toBe('Strip metadata');
    expect(humanizeFieldName('ocrScanned')).toBe('OCR scanned');
    expect(humanizeFieldName('dpi')).toBe('DPI');
    expect(humanizeFieldName('custom_regex')).toBe('Custom regex');
    expect(humanizeFieldName('preset')).toBe('Preset');
  });
});
