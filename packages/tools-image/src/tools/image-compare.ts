import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME, attachProvenance, createProvenance } from '@neotools/engine';
import { resample } from '../codec/resample.js';
import { heatmap, psnr, changedPixelRatio } from '../ops/metrics.js';
import { ssim } from '../ops/ssim.js';
import { readImageMetadata } from '../meta/read.js';
import { encodePngRgba } from '../codec/png.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  scaleMatch: z.boolean().default(true),
});

export const imageCompare = defineTool({
  id: 'image-compare',
  pack: 'image',
  category: 'images',
  title: { de: 'Zwei Bilder vergleichen', en: 'Compare two images' },
  description: {
    de: 'Pixel-Diff-Heatmap, Anteil geänderter Pixel, SSIM, PSNR, Größen- und Metadaten-Unterschiede. Optional gleich skalieren.',
    en: 'Pixel-diff heatmap, changed-pixel ratio, SSIM, PSNR, size and metadata diffs. Optional scale-to-match.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2, max: 2 },
  outputs: { mime: ['image/png', MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['bild vergleich', 'ssim', 'psnr'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (files.length < 2) throw new Error('Zwei Bilder nötig.');
    ctx.progress(0.2, files[0]!.name);
    const a = await decodeFile(files[0]!);
    const b = await decodeFile(files[1]!);
    let bd = b.data;
    let bw = b.width;
    let bh = b.height;
    if (parsed.scaleMatch && (a.width !== b.width || a.height !== b.height)) {
      const s = resample(b.data, b.width, b.height, a.width, a.height, 'bilinear');
      bd = s.data;
      bw = s.width;
      bh = s.height;
    }
    const heat = heatmap(a.data, a.width, a.height, bd, bw, bh);
    const report = {
      ssim: ssim(a.data, a.width, a.height, bd, bw, bh),
      psnr: psnr(a.data, bd),
      changedRatio: changedPixelRatio(a.data, bd),
      size: { a: { w: a.width, h: a.height }, b: { w: b.width, h: b.height } },
      metaA: readImageMetadata(await files[0]!.bytes(), files[0]!.name),
      metaB: readImageMetadata(await files[1]!.bytes(), files[1]!.name),
    };
    const png = encodePngRgba(heat.data, heat.width, heat.height);
    const provenance = await createProvenance('image-compare', parsed, files);
    return {
      outputs: [
        neoFileFromBytes('diff.png', png, 'image/png'),
        neoFileFromBytes('compare.json', new TextEncoder().encode(JSON.stringify(report, null, 2)), MIME.json),
      ],
      warnings: [],
      report: attachProvenance(report, provenance),
    };
  },
});
