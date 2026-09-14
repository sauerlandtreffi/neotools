import { describe, expect, it } from 'vitest';
import { createImageAiRegistry, imageAiTools } from '../src/index.js';

describe('image-ai registry', () => {
  it('registers the seven pack tools', () => {
    const ids = imageAiTools.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'image-alt-text',
        'image-auto-blur',
        'image-denoise',
        'image-doc-repair',
        'image-remove-background',
        'image-screenshot-workshop',
        'image-upscale',
      ].sort(),
    );
    const reg = createImageAiRegistry();
    expect(reg.size).toBe(7);
    expect(reg.get('image-auto-blur')?.privacySensitive).toBe(true);
    expect(reg.get('image-alt-text')?.pack).toBe('a11y');
    for (const t of imageAiTools) {
      expect(t.category).toBe('ai');
      expect(t.licenses.length).toBeGreaterThan(0);
      expect(t.licenses.some((l) => /AGPL/i.test(l.license))).toBe(false);
    }
  });
});
