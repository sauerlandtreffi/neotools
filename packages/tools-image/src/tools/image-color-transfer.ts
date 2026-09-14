import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { reinhardTransfer } from '../ops/color-transfer.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({});

export const imageColorTransfer = defineTool({
  id: 'image-color-transfer',
  pack: 'image',
  category: 'images',
  title: { de: 'Farblook kopieren', en: 'Copy color look' },
  description: { de: 'Reinhard-Statistik-Transfer: Look von Bild A auf Serie B.', en: 'Reinhard statistic transfer: look from image A onto series B.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['color transfer', 'reinhard'] },
  async run(ctx, files) {
    const src = await decodeFile(files[0]!);
    const outputs = [];
    for (let i = 1; i < files.length; i++) {
      ctx.progress(i / files.length, files[i]!.name);
      const dst = await decodeFile(files[i]!);
      const data = reinhardTransfer(src.data, src.width, src.height, dst.data, dst.width, dst.height);
      outputs.push(await encodeImage({ ...dst, data }, 'png', { keepMetadata: false }, `${stem(files[i]!.name)}-look.png`));
    }
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ source: files[0]!.name, count: outputs.length }, await createProvenance('image-color-transfer', {}, files)),
    };
  },
});
