import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { readImageMetadata } from '../meta/read.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  mode: z.enum(['inspect', 'strip', 'srgb']).default('inspect'),
});

export const imageIcc = defineTool({
  id: 'image-icc',
  pack: 'image',
  category: 'images',
  title: { de: 'Farbmanagement / ICC', en: 'Color management / ICC' },
  description: {
    de: 'ICC-Tag lesen, entfernen oder als sRGB taggen. Light-Parsing, kein LittleCMS.',
    en: 'Read, strip, or tag ICC as sRGB. Light parsing, no LittleCMS.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', 'application/json'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['icc', 'srgb'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs = [];
    const rows = [];
    for (const file of files) {
      ctx.progress(0.4, file.name);
      const bytes = await file.bytes();
      const meta = readImageMetadata(bytes, file.name);
      rows.push({ file: file.name, icc: meta.icc, colorSpace: meta.raw });
      if (parsed.mode === 'inspect') continue;
      const img = await decodeFile(file);
      outputs.push(
        await encodeImage(
          { ...img },
          file.mime.includes('jpeg') ? 'jpeg' : 'png',
          { keepMetadata: false, iccMode: parsed.mode === 'strip' ? 'strip' : 'srgb' },
          `${stem(file.name)}-${parsed.mode}.png`,
        ),
      );
    }
    outputs.push(neoFileFromBytes('icc-report.json', new TextEncoder().encode(JSON.stringify({ files: rows }, null, 2)), 'application/json'));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ files: rows }, await createProvenance('image-icc', parsed, files)),
    };
  },
});
