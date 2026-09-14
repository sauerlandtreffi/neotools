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

describe('image registry', () => {
  it('registers Phase-2 core tool ids', () => {
    const ids = createImageRegistry().ids();
    expect(ids).toEqual(EXPECTED);
    expect(ids).not.toContain('image-bg-remove');
    expect(ids).not.toContain('image-auto-blur');
    expect(ids).not.toContain('image-doc-repair');
    expect(ids).not.toContain('image-screenshot-studio');
  });
});
