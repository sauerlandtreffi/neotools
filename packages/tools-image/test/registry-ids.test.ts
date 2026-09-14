import { describe, expect, it } from 'vitest';
import { createImageRegistry } from '../src/index.js';

const EXPECTED = [
  'image-convert',
  'image-compress',
  'image-resize',
  'image-crop',
  'image-rotate-flip',
  'image-adjust',
  'image-watermark',
  'image-metadata',
  'image-redact',
  'image-compare',
  'creator-export-pack',
  'image-to-animation',
  'image-palette',
  'image-colorblind',
  'image-exif-batch',
  'image-duplicates',
  'image-ascii',
];

const WAVE5 = [
  'image-passport',
  'image-live-photo',
  'image-red-eye',
  'image-line-art',
  'image-pixel-art',
  'image-to-svg',
  'image-lut',
  'image-scopes',
  'image-seamless-texture',
  'image-normal-map',
  'image-hdr-tonemap',
  'image-icc',
  'image-geotag-export',
  'image-sort-by-date',
  'image-burst-best',
  'image-color-transfer',
  'image-hidden-layer-check',
  'image-film-scan',
];

describe('image registry', () => {
  it('registers Phase-2 core tool ids plus wave-5 backlog tools', () => {
    const ids = createImageRegistry().ids();
    for (const id of EXPECTED) expect(ids).toContain(id);
    for (const id of WAVE5) expect(ids).toContain(id);
    expect(ids).not.toContain('image-bg-remove');
    expect(ids).not.toContain('image-auto-blur');
    expect(ids).not.toContain('image-doc-repair');
    expect(ids).not.toContain('image-screenshot-studio');
  });
});
