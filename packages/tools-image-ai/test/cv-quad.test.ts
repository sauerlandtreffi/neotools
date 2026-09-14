import { describe, expect, it } from 'vitest';
import { findDocumentQuad } from '../src/cv/quad.js';
import { fillPoly, solid } from './helpers.js';

describe('document quad', () => {
  it('finds synthetic quadrilateral corners within ±2 px', () => {
    const img = solid(120, 90, 250, 250, 250);
    const quad = [
      { x: 18, y: 14 },
      { x: 104, y: 16 },
      { x: 98, y: 78 },
      { x: 22, y: 76 },
    ];
    fillPoly(img, quad, [12, 12, 12]);
    const found = findDocumentQuad(img).quad;
    const expected = [
      { x: 18, y: 14 },
      { x: 104, y: 16 },
      { x: 98, y: 78 },
      { x: 22, y: 76 },
    ];
    for (const e of expected) {
      const d = Math.min(...found.map((p) => Math.hypot(p.x - e.x, p.y - e.y)));
      expect(d).toBeLessThanOrEqual(2.5);
    }
  });
});
