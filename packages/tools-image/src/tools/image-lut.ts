import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyLutCube, parseCubeLut } from '../ops/lut.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  cubeText: z.string().default(''),
  strength: z.coerce.number().min(0).max(1).default(1),
  preset: z.enum(['custom', 'log-rec709']).default('custom'),
});

const LOG_REC709 = `LUT_3D_SIZE 2
0.0 0.0 0.0
0.18 0.16 0.14
0.16 0.18 0.16
0.55 0.52 0.48
0.14 0.16 0.20
0.52 0.50 0.58
0.50 0.56 0.54
1.0 1.0 1.0
`;

export const imageLut = defineTool({
  id: 'image-lut',
  pack: 'image',
  category: 'images',
  title: { de: '3D-LUT / Film-Look', en: '3D LUT / film look' },
  description: {
    de: '.cube auf Bilder anwenden. Preset log-rec709. Video: video-lut3d (lut3d-Filter) im Media-Pack.',
    en: 'Apply .cube to images. Preset log-rec709. Video: video-lut3d (lut3d filter) in the media pack.',
  },
  inputs: { accept: [...IMAGE_ACCEPT, 'text/plain', '.cube'], multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg'] },
  options,
  presets: [{ id: 'log-rec709', title: { de: 'Log→Rec.709', en: 'Log→Rec.709' }, options: { preset: 'log-rec709' } }],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['lut', 'cube', 'film look'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const cubeFile = files.find((f) => /\.cube$/i.test(f.name) || f.mime === 'text/plain');
    const cubeSrc = cubeFile ? new TextDecoder().decode(await cubeFile.bytes()) : parsed.cubeText || (parsed.preset === 'log-rec709' ? LOG_REC709 : '');
    if (!cubeSrc.trim()) throw new Error('Keine .cube-LUT übergeben.');
    const lut = parseCubeLut(cubeSrc);
    const outputs = [];
    for (const file of files.filter((f) => f !== cubeFile)) {
      ctx.progress(0.5, file.name);
      const img = await decodeFile(file);
      const data = applyLutCube(img.data, lut, parsed.strength);
      outputs.push(await encodeImage({ ...img, data }, 'png', { keepMetadata: false }, `${stem(file.name)}-lut.png`));
    }
    outputs.push(neoFileFromBytes('applied.cube', new TextEncoder().encode(cubeSrc), 'text/plain'));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ size: lut.size, title: lut.title }, await createProvenance('image-lut', parsed, files)),
    };
  },
});
