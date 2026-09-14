import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME, attachProvenance, createProvenance } from '@neotools/engine';
import { cssSnippet, extractPalette, tailwindSnippet, wcagPairs } from '../ops/palette.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  count: z.coerce.number().min(2).max(16).default(6),
  method: z.enum(['kmeans', 'median-cut']).default('kmeans'),
});

export const imagePalette = defineTool({
  id: 'image-palette',
  pack: 'image',
  category: 'images',
  title: { de: 'Farbpalette + Brand-Farben', en: 'Color palette + brand colors' },
  description: {
    de: 'k-means oder Median-Cut. HEX/RGB/HSL, WCAG-Paare, CSS-Variablen und Tailwind-Snippet.',
    en: 'k-means or median-cut. HEX/RGB/HSL, WCAG pairs, CSS variables and Tailwind snippet.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: [MIME.json, 'text/plain', 'text/css'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['farbpalette', 'wcag', 'tailwind'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    ctx.progress(0.3, files[0]!.name);
    const img = await decodeFile(files[0]!);
    const colors = extractPalette(img.data, parsed.method, parsed.count);
    const pairs = wcagPairs(colors);
    const css = cssSnippet(colors);
    const tw = tailwindSnippet(colors);
    const report = { colors, pairs };
    const provenance = await createProvenance('image-palette', parsed, files);
    return {
      outputs: [
        neoFileFromBytes('palette.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
        neoFileFromBytes('palette.css', new TextEncoder().encode(css), 'text/css'),
        neoFileFromBytes('tailwind.config.js.txt', new TextEncoder().encode(tw), 'text/plain'),
      ],
      warnings: [],
      report: attachProvenance(report, provenance),
    };
  },
});
