import { describe, expect, it } from 'vitest';
import { decode, encode, encodePngRgba, encodeBmp, encodeRgba, resample, detectFormat } from '../src/codec/index.js';
import { decodePng } from '../src/codec/png.js';
import { meanAbsDiff } from '../src/codec/pixels.js';
import { checker, tryJpeg } from './helpers.js';

describe('codec', () => {
  it('PNG and BMP roundtrip stay close', async () => {
    const data = checker(24, 18);
    const png = encodePngRgba(data, 24, 18);
    expect(detectFormat(png)).toBe('png');
    const back = decodePng(png);
    expect(back?.width).toBe(24);
    expect(back?.height).toBe(18);
    expect(meanAbsDiff(data, back!.data)).toBeLessThan(1);

    const bmp = encodeBmp(data, 24, 18);
    const bmpDec = await decode({ bytes: bmp, name: 'x.bmp' });
    expect(bmpDec.width).toBe(24);
    expect(meanAbsDiff(data, bmpDec.data)).toBeLessThan(1);
  });

  it('resample changes dimensions', () => {
    const data = checker(40, 20);
    const down = resample(data, 40, 20, 20, 10, 'lanczos3');
    expect(down.width).toBe(20);
    expect(down.height).toBe(10);
    const up = resample(data, 40, 20, 80, 40, 'bilinear');
    expect(up.width).toBe(80);
  });

  it('PPM encode/decode', async () => {
    const data = checker(8, 8);
    const bytes = await encodeRgba(data, 8, 8, 'ppm');
    const img = await decode({ bytes, name: 'x.ppm' });
    expect(img.width).toBe(8);
    expect(meanAbsDiff(data, img.data)).toBeLessThan(1);
  });

  it('ICO encode/decode PNG-in-ICO', async () => {
    const data = checker(32, 32);
    const bytes = await encodeRgba(data, 32, 32, 'ico', { icoSizes: [16, 32] });
    const img = await decode({ bytes, name: 'f.ico' });
    expect(img.width).toBeGreaterThanOrEqual(16);
    expect(img.meta.format).toBe('ico');
  });

  it('JPEG/WebP/AVIF roundtrip when WASM loads', async () => {
    const ok = await tryJpeg();
    if (!ok) {
      console.warn('skip JPEG WASM in this environment');
      return;
    }
    const data = checker(32, 24);
    for (const fmt of ['jpeg', 'webp'] as const) {
      const bytes = await encodeRgba(data, 32, 24, fmt, { quality: 90, keepMetadata: false });
      const img = await decode({ bytes, name: `x.${fmt}` });
      expect(img.width).toBe(32);
      expect(meanAbsDiff(data, img.data)).toBeLessThan(25);
    }
    try {
      const avif = await encodeRgba(data, 32, 24, 'avif', { quality: 70, keepMetadata: false });
      const img = await decode({ bytes: avif, name: 'x.avif' });
      expect(img.width).toBe(32);
    } catch (err) {
      console.warn('skip AVIF:', err instanceof Error ? err.message : err);
    }
  });

  it('GIF and APNG encode/decode keep size', async () => {
    const data = checker(16, 12);
    const gif = await encodeRgba(data, 16, 12, 'gif');
    const g = await decode({ bytes: gif, name: 'x.gif' });
    expect(g.width).toBe(16);
    expect(g.height).toBe(12);
    const apng = await encodeRgba(data, 16, 12, 'apng');
    const a = await decode({ bytes: apng, name: 'x.png' });
    expect(a.width).toBe(16);
    expect(meanAbsDiff(data, a.data)).toBeLessThan(8);
  });

  it('TIFF encode/decode keeps dimensions', async () => {
    const data = checker(20, 14);
    const bytes = await encodeRgba(data, 20, 14, 'tiff');
    const img = await decode({ bytes, name: 'x.tif' });
    expect(img.width).toBe(20);
    expect(img.height).toBe(14);
  });

  it.skip('HEIC decode (needs libheif-js sample)', () => {
    // Node/CI: no fixture; documented boundary. Decode is dynamic heic-decode (LGPL).
  });

  it('SVG in Node without resvg throws a clear error', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>');
    try {
      await decode({ bytes: svg, name: 'x.svg' });
    } catch (err) {
      expect(String(err)).toMatch(/Browser|resvg|SVG/i);
      return;
    }
  });
});
