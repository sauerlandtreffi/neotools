import { describe, expect, it } from 'vitest';
import { Registry } from '@neotools/engine';
import { z } from 'zod';
import {
  buildConversionMatrix,
  catalogFormatCount,
  seoConversionEdges,
  validateFormatCatalog,
} from '../src/data/formats';
import { validatePlatformSpecs } from '../src/data/specs';
import { registry } from '../src/lib/registry';

describe('format catalog', () => {
  it('validates every entry and unique ids', () => {
    const parsed = validateFormatCatalog();
    expect(parsed.length).toBeGreaterThanOrEqual(45);
    expect(catalogFormatCount()).toBe(parsed.length);
    const ids = parsed.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['jpg', 'heic', 'pdf', 'pdfa', 'mp4', 'mp3', 'zip']));
  });

  it('validates platform specs', () => {
    const specs = validatePlatformSpecs();
    expect(specs.map((s) => s.id)).toEqual(
      expect.arrayContaining(['whatsapp', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'discord', 'email-25mb', 'bea-erv']),
    );
  });
});

describe('conversion matrix', () => {
  it('keeps heic→jpg even without the image pack, and marks it available when image-convert exists', () => {
    const empty = new Registry();
    const planned = buildConversionMatrix(empty).find((e) => e.from === 'heic' && e.to === 'jpg');
    expect(planned?.status).toBe('planned');

    const edges = buildConversionMatrix(registry);
    const hit = edges.find((e) => e.from === 'heic' && e.to === 'jpg');
    expect(hit).toBeTruthy();
    if (registry.get('image-convert')) {
      expect(hit?.status).toBe('available');
      expect(hit?.toolId).toBe('image-convert');
      expect(hit?.options).toMatchObject({ format: 'jpeg' });
    } else {
      expect(hit?.status).toBe('planned');
    }
  });

  it('stays within a buildable pair count', () => {
    const edges = buildConversionMatrix(registry);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.length).toBeLessThan(1500);
    const seo = seoConversionEdges(edges);
    expect(seo.length).toBeGreaterThan(0);
    expect(seo.length).toBeLessThanOrEqual(edges.length);
    expect(seo.length).toBeLessThan(400);
    expect(seo.some((e) => e.from === 'png' && e.to === 'jpg')).toBe(true);
  });

  it('maps pdf-to-images onto pdf→jpg when the tool is registered', () => {
    const edges = buildConversionMatrix(registry);
    const hit = edges.find((e) => e.from === 'pdf' && e.to === 'jpg');
    expect(hit).toBeTruthy();
    if (registry.get('pdf-to-images')) {
      expect(hit?.status).toBe('available');
      expect(hit?.toolId).toBe('pdf-to-images');
    }
  });

  it('does not treat a same-mime utility as a converter', () => {
    const fake = new Registry();
    fake.register({
      id: 'pdf-merge',
      pack: 'pdf',
      category: 'pdf',
      title: { de: 'x', en: 'x' },
      description: { de: 'x', en: 'x' },
      inputs: { accept: ['application/pdf'], multiple: true },
      outputs: { mime: ['application/pdf'] },
      options: z.object({}),
      licenses: [],
      async run() {
        return { outputs: [], warnings: [] };
      },
    });
    const edges = buildConversionMatrix(fake);
    expect(edges.some((e) => e.toolId === 'pdf-merge')).toBe(false);
  });
});
