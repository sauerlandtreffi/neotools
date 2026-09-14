import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyTextWatermark, encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { blit, coverFit, decodeAny, drawRect, fillSolid } from '../raster.js';

const options = z.object({
  layout: z.enum(['grid', 'masonry', 'polaroid', 'filmstrip']).default('grid'),
  columns: z.coerce.number().min(1).max(6).default(2),
  cell: z.coerce.number().min(80).max(640).default(280),
  gap: z.coerce.number().min(0).max(48).default(12),
  frame: z.string().default('#f8fafc'),
});

export const creatorCollage = defineTool({
  id: 'creator-collage',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Collage', en: 'Collage' },
  description: {
    de: 'Ordner/Bilder → Raster oder Masonry mit Rahmen. Presets Polaroid und Filmstreifen.',
    en: 'Folder/images → grid or masonry with frames. Polaroid and filmstrip presets.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1, directory: true },
  outputs: { mime: ['image/png'] },
  options,
  presets: [
    { id: 'polaroid', title: { de: 'Polaroid', en: 'Polaroid' }, options: { layout: 'polaroid' } },
    { id: 'film', title: { de: 'Filmstreifen', en: 'Filmstrip' }, options: { layout: 'filmstrip' } },
  ],
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['collage', 'polaroid', 'filmstrip'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const images = [];
    for (const f of files) images.push(await decodeAny(f));
    const n = images.length;
    const polaroid = parsed.layout === 'polaroid';
    const film = parsed.layout === 'filmstrip';
    const cols = film ? n : parsed.columns;
    const rows = film ? 1 : Math.ceil(n / cols);
    const extraB = polaroid ? 48 : film ? 20 : 0;
    const cell = parsed.cell;
    const gap = parsed.gap;
    const W = cols * (cell + gap) + gap + (film ? 40 : 0);
    const H = rows * (cell + gap + extraB) + gap + (film ? 40 : 0);
    const bg = fillSolid(W, H, film ? '#111111' : polaroid ? '#e7e5e4' : parsed.frame);
    for (let i = 0; i < n; i++) {
      ctx.progress((i + 1) / n, files[i]!.name);
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = gap + (film ? 20 : 0) + c * (cell + gap);
      const y = gap + (film ? 20 : 0) + r * (cell + gap + extraB);
      const fitted = coverFit(images[i]!.data, images[i]!.width, images[i]!.height, cell, cell);
      if (polaroid) {
        drawRect(bg.data, W, H, x - 8, y - 8, cell + 16, cell + extraB, [250, 250, 249, 255], true);
        blit(bg.data, W, H, fitted.data, cell, cell, x, y);
        await applyTextWatermark(bg.data, W, H, files[i]!.name.slice(0, 18), {
          position: 's',
          opacity: 0.8,
          scale: 0.4,
          color: '#44403c',
        });
      } else {
        blit(bg.data, W, H, fitted.data, cell, cell, x, y);
      }
    }
    if (film) {
      for (let x = 8; x < W; x += 18) {
        drawRect(bg.data, W, H, x, 6, 10, 10, [250, 250, 250, 255], true);
        drawRect(bg.data, W, H, x, H - 16, 10, 10, [250, 250, 250, 255], true);
      }
    }
    return wrap('creator-collage', files, [neoFileFromBytes('collage.png', encodePngRgba(bg.data, W, H), 'image/png')], parsed, {
      cells: n,
    });
  },
});
