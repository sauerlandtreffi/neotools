import { describe, expect, it } from 'vitest';
import { findVerticalOverlap, stitchVertical } from '../src/cv/stitch.js';
import { solid } from './helpers.js';

describe('long-screenshot stitch', () => {
  it('finds overlap of two synthetic strips', () => {
    const a = solid(24, 30, 0, 0, 0);
    const b = solid(24, 30, 0, 0, 0);
    for (let y = 0; y < 30; y++) {
      const v = (y * 13 + 20) % 220;
      for (let x = 0; x < 24; x++) {
        const o = (y * 24 + x) * 4;
        a.data[o] = v;
        a.data[o + 1] = (x * 3 + y) % 180;
        a.data[o + 2] = 90;
      }
    }
    const overlap = 12;
    for (let y = 0; y < 30; y++) {
      if (y < overlap) {
        const srcY = 30 - overlap + y;
        b.data.set(a.data.subarray(srcY * 24 * 4, (srcY + 1) * 24 * 4), y * 24 * 4);
      } else {
        const v = (y * 41 + 9) % 200;
        for (let x = 0; x < 24; x++) {
          const o = (y * 24 + x) * 4;
          b.data[o] = v;
          b.data[o + 1] = 10;
          b.data[o + 2] = 200;
        }
      }
    }
    const ov = findVerticalOverlap(a, b, 6);
    expect(Math.abs(ov - overlap)).toBeLessThanOrEqual(2);
    const stitched = stitchVertical([a, b]);
    expect(stitched.height).toBe(a.height + b.height - ov);
    expect(stitched.width).toBe(24);
  });
});
