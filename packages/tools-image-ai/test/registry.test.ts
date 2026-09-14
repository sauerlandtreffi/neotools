import { describe, expect, it } from 'vitest';
import { createImageAiRegistry, imageAiTools } from '../src/index.js';

describe('image-ai registry', () => {
  it('registers pack tools including a11y wave-5', () => {
    const ids = imageAiTools.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'a11y-easy-read',
        'a11y-sign-friendly',
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
    expect(reg.size).toBe(9);
    expect(reg.get('image-auto-blur')?.privacySensitive).toBe(true);
    expect(reg.get('image-alt-text')?.pack).toBe('a11y');
    expect(reg.get('a11y-easy-read')?.pack).toBe('a11y');
    for (const t of imageAiTools) {
      expect(['ai', 'a11y']).toContain(t.category);
      expect(t.licenses.length).toBeGreaterThan(0);
      expect(t.licenses.some((l) => /AGPL/i.test(l.license))).toBe(false);
    }
  });
});
