import { describe, expect, it } from 'vitest';
import { applyHomography, findHomography, invertHomography } from '../src/cv/homography.js';

describe('homography', () => {
  it('roundtrips four points', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ];
    const dst = [
      { x: 10, y: 12 },
      { x: 120, y: 8 },
      { x: 110, y: 90 },
      { x: 6, y: 88 },
    ];
    const h = findHomography(src, dst);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(h, src[i]!);
      expect(p.x).toBeCloseTo(dst[i]!.x, 5);
      expect(p.y).toBeCloseTo(dst[i]!.y, 5);
    }
    const inv = invertHomography(h);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(inv, dst[i]!);
      expect(p.x).toBeCloseTo(src[i]!.x, 4);
      expect(p.y).toBeCloseTo(src[i]!.y, 4);
    }
  });
});
