import { describe, expect, it } from 'vitest';
import { applyStyle, boxVariance } from '../src/cv/filters.js';
import { solid } from './helpers.js';

describe('blur verify', () => {
  it('is green after bar/blur and red on sharp text-like box', () => {
    const sharp = solid(60, 40, 255, 255, 255);
    for (let x = 8; x < 50; x++) {
      const on = x % 2 === 0;
      for (let y = 10; y < 30; y++) {
        const o = (y * 60 + x) * 4;
        sharp.data[o] = on ? 0 : 255;
        sharp.data[o + 1] = on ? 0 : 255;
        sharp.data[o + 2] = on ? 0 : 255;
      }
    }
    const box = { x: 8, y: 10, w: 42, h: 20 };
    const high = boxVariance(sharp, box);
    expect(high).toBeGreaterThan(400);
    const barred = { width: sharp.width, height: sharp.height, data: new Uint8ClampedArray(sharp.data) };
    applyStyle(barred, box, 'bar');
    expect(boxVariance(barred, box)).toBeLessThan(5);
    const blurred = { width: sharp.width, height: sharp.height, data: new Uint8ClampedArray(sharp.data) };
    applyStyle(blurred, box, 'blur', 0);
    expect(boxVariance(blurred, box)).toBeLessThan(high * 0.35);
  });
});
