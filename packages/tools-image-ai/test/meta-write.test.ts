import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../src/raster.js';
import { writeImageDescription } from '../src/meta-write.js';
import { solid } from './helpers.js';

describe('writeImageDescription', () => {
  it('embeds XMP/EXIF description into a PNG', () => {
    const img = solid(8, 6, 12, 34, 56);
    const png = encodePng(img);
    const written = writeImageDescription(png, 'shot.png', img, 'A red square');
    expect(written).toBeTruthy();
    expect(written!.mime).toBe('image/png');
    const text = new TextDecoder('latin1').decode(written!.bytes);
    expect(text).toContain('A red square');
    expect(text).toContain('NeoTools');
    const back = decodePng(written!.bytes);
    expect(back.width).toBe(8);
    expect(back.height).toBe(6);
  });
});
