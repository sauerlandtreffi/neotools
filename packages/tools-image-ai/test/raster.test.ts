import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, resizeBilinear } from '../src/raster.js';
import { solid } from './helpers.js';

describe('raster png', () => {
  it('roundtrips RGBA PNG', () => {
    const img = solid(12, 8, 10, 20, 30, 255);
    img.data[4] = 200;
    const bytes = encodePng(img);
    const back = decodePng(bytes);
    expect(back.width).toBe(12);
    expect(back.height).toBe(8);
    expect(back.data[0]).toBe(10);
    expect(back.data[4]).toBe(200);
    expect(back.data[3]).toBe(255);
  });

  it('resizes bilinear without changing corners much', () => {
    const img = solid(4, 4, 0, 0, 0);
    img.data[0] = 255;
    const out = resizeBilinear(img, 8, 8);
    expect(out.width).toBe(8);
    expect(out.data[0]).toBeGreaterThan(200);
  });
});
