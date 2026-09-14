import { describe, expect, it } from 'vitest';
import { convertCueFramerate, shiftCues, stretchCues } from '../src/captions/shift.js';
import { convertFramerate, stretchTime } from '../src/captions/time.js';

const cues = [{ start: 1, end: 2, text: 'a', index: 1 }];

describe('shift / stretch / fps', () => {
  it('applies offset and clamps to 0', () => {
    expect(shiftCues(cues, 0.5)[0]?.start).toBeCloseTo(1.5);
    expect(shiftCues(cues, -5)[0]?.start).toBe(0);
  });

  it('linear stretch through two anchors', () => {
    expect(stretchTime(5, 0, 0, 10, 20)).toBe(10);
    expect(stretchCues([{ start: 5, end: 6, text: 'x' }], 0, 0, 10, 20)[0]?.start).toBe(10);
  });

  it('converts 23.976 ↔ 25 ↔ 29.97', () => {
    const t = 100;
    const to25 = convertFramerate(t, '23.976', '25');
    expect(to25).toBeCloseTo(100 * (25 / (24000 / 1001)), 6);
    const back = convertFramerate(to25, '25', '23.976');
    expect(back).toBeCloseTo(100, 6);
    const to2997 = convertFramerate(t, '25', '29.97');
    expect(to2997).toBeCloseTo(100 * ((30000 / 1001) / 25), 6);
    const shifted = convertCueFramerate(cues, '23.976', '25');
    expect(shifted[0]!.start).toBeGreaterThan(cues[0]!.start);
  });
});
