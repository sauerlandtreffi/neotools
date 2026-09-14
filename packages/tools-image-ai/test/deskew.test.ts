import { describe, expect, it } from 'vitest';
import { estimateSkewDegrees, rotateRaster } from '../src/cv/deskew.js';
import { solid } from './helpers.js';

describe('deskew', () => {
  it('estimates angle of a rotated bar pattern', () => {
    const img = solid(160, 100, 255, 255, 255);
    for (let y = 0; y < img.height; y++) {
      if (y % 10 < 4) {
        for (let x = 0; x < img.width; x++) {
          const o = (y * img.width + x) * 4;
          img.data[o] = 10;
          img.data[o + 1] = 10;
          img.data[o + 2] = 10;
        }
      }
    }
    const rotated = rotateRaster(img, 8, 255);
    const angle = estimateSkewDegrees(rotated);
    expect(Math.abs(Math.abs(angle) - 8)).toBeLessThanOrEqual(2.5);
  });
});
