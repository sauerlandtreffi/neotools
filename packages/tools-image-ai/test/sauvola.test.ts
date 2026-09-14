import { describe, expect, it } from 'vitest';
import { sauvola } from '../src/cv/sauvola.js';

describe('sauvola', () => {
  it('keeps synthetic dark text on light paper as ink', () => {
    const w = 80;
    const h = 40;
    const gray = new Float32Array(w * h);
    gray.fill(230);
    for (let y = 16; y < 20; y++) {
      for (let x = 8; x < 72; x++) gray[y * w + x] = 18;
    }
    const bin = sauvola(gray, w, h, 21, 0.2);
    expect(bin[18 * w + 30]).toBe(0);
    expect(bin[2 * w + 2]).toBe(255);
  });
});
