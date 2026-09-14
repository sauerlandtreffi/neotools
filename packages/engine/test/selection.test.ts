import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  applySelectionToOptions,
  formatPages,
  isSelectionKey,
  pagesSchema,
  parsePagesParam,
  parseTimeRangeParam,
  regionSchema,
  selectionIsEmpty,
  timeRangeSchema,
} from '../src/selection.js';

describe('selection schemas', () => {
  it('pagesSchema accepts 1-based positive ints and is optional', () => {
    expect(pagesSchema.parse({})).toEqual({});
    expect(pagesSchema.parse({ pages: [1, 3] })).toEqual({ pages: [1, 3] });
    expect(pagesSchema.safeParse({ pages: [0] }).success).toBe(false);
  });

  it('regionSchema defaults unit to norm and allows extend', () => {
    const extended = regionSchema.extend({ fillColor: z.string().default('#000') });
    const parsed = extended.parse({ regions: [{ page: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] });
    expect(parsed.regions?.[0]?.unit).toBe('norm');
    expect(parsed.fillColor).toBe('#000');
  });

  it('timeRangeSchema rejects negative seconds', () => {
    expect(timeRangeSchema.safeParse({ startSec: -1 }).success).toBe(false);
    expect(timeRangeSchema.parse({ startSec: 1, endSec: 2 })).toEqual({ startSec: 1, endSec: 2 });
  });
});

describe('parsePagesParam / formatPages', () => {
  it('parses ranges, singles, open ends and dedupes', () => {
    expect(parsePagesParam('1-3,7')).toEqual([1, 2, 3, 7]);
    expect(parsePagesParam('3,1,2,2')).toEqual([1, 2, 3]);
    expect(parsePagesParam('8-', 10)).toEqual([8, 9, 10]);
    expect(parsePagesParam('-2', 10)).toEqual([1, 2]);
    expect(parsePagesParam('x,,4')).toEqual([4]);
    expect(parsePagesParam(null)).toEqual([]);
  });

  it('round-trips through formatPages', () => {
    expect(formatPages([1, 2, 3, 7, 9, 10])).toBe('1-3,7,9-10');
    expect(parsePagesParam(formatPages([5, 4, 2]))).toEqual([2, 4, 5]);
    expect(formatPages([])).toBe('');
  });

  it('parses time ranges', () => {
    expect(parseTimeRangeParam('12.0-40.5')).toEqual({ startSec: 12, endSec: 40.5 });
    expect(parseTimeRangeParam('40-12')).toBeUndefined();
    expect(parseTimeRangeParam('abc')).toBeUndefined();
  });
});

describe('applySelectionToOptions', () => {
  const schema = z.object({ pages: z.array(z.number()).optional(), quality: z.number().default(80) });

  it('writes only keys the schema declares', () => {
    const out = applySelectionToOptions(schema, { quality: 60 }, { pages: [2, 3], regions: [{ x: 0, y: 0, w: 1, h: 1, unit: 'norm' }] });
    expect(out).toEqual({ quality: 60, pages: [2, 3] });
  });

  it('leaves options untouched when selection is empty', () => {
    expect(applySelectionToOptions(schema, { quality: 1 }, {})).toEqual({ quality: 1 });
    expect(selectionIsEmpty({})).toBe(true);
    expect(selectionIsEmpty({ pages: [1] })).toBe(false);
  });

  it('knows selection-owned keys', () => {
    expect(isSelectionKey('regions')).toBe(true);
    expect(isSelectionKey('quality')).toBe(false);
  });
});
