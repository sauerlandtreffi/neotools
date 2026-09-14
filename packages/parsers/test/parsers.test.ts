import { describe, expect, it } from 'vitest';
import { parsePng, decodePngRgba, parseJpeg, parseTiff, buildExifApp1, injectJpegSegment } from '../src/index.js';

function tinyPng(): Uint8Array {
  return Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
}

describe('@neotools/parsers', () => {
  it('parses and decodes a 1×1 PNG', () => {
    const bytes = tinyPng();
    const png = parsePng(bytes);
    expect(png?.width).toBe(1);
    expect(png?.height).toBe(1);
    const rgba = decodePngRgba(bytes);
    expect(rgba?.data.length).toBe(4);
  });

  it('builds EXIF APP1 that parseTiff can read', () => {
    const seg = buildExifApp1({ software: 'NeoCam', gps: { lat: 52.5, lon: 13.4 } });
    expect(seg[0]).toBe(0xff);
    expect(seg[1]).toBe(0xe1);
    const payload = seg.subarray(4);
    expect(new TextDecoder().decode(payload.subarray(0, 4))).toBe('Exif');
    const tiff = parseTiff(payload.subarray(6));
    expect(tiff?.software).toMatch(/NeoCam/);
    expect(tiff?.gps?.lat).toBeDefined();
  });

  it('injects a JPEG segment after SOI', () => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
    const injected = injectJpegSegment(jpeg, Uint8Array.of(0xff, 0xfe, 0x00, 0x02));
    expect(injected[0]).toBe(0xff);
    expect(injected[1]).toBe(0xd8);
    expect(parseJpeg(injected)).toBeDefined();
  });
});
