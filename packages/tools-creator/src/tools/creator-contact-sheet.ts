import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyTextWatermark, encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { blit, coverFit, decodeAny, fillSolid, isVideoFile, stem } from '../raster.js';
import { aliasOf, encodeVideo, requireFfmpeg } from '../media.js';

const options = z.object({
  columns: z.coerce.number().min(1).max(8).default(3),
  cell: z.coerce.number().min(80).max(480).default(240),
  frames: z.coerce.number().min(1).max(24).default(9),
});

export const creatorContactSheet = defineTool({
  id: 'creator-contact-sheet',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Kontaktbogen', en: 'Contact sheet' },
  description: {
    de: 'Bilder oder Video-Frames als Preview-Raster mit Dateinamen.',
    en: 'Images or video frames as a preview grid with filenames.',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['contact sheet', 'kontaktbogen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const thumbs: Array<{ data: Uint8ClampedArray; width: number; height: number; label: string }> = [];
    for (const file of files) {
      if (isVideoFile(file)) {
        await requireFfmpeg(ctx);
        const alias = aliasOf(file, 0);
        const raw = 'sheet.rgba';
        const bytes = await encodeVideo(
          ctx,
          ['-i', alias, '-vf', `fps=1,scale=${parsed.cell}:${parsed.cell}:force_original_aspect_ratio=increase,crop=${parsed.cell}:${parsed.cell},format=rgba`, '-frames:v', String(parsed.frames), '-f', 'rawvideo', raw],
          [{ name: alias, data: await file.bytes() }],
          raw,
        );
        const stride = parsed.cell * parsed.cell * 4;
        let n = 0;
        for (let i = 0; i + stride <= bytes.byteLength; i += stride) {
          thumbs.push({
            data: new Uint8ClampedArray(bytes.subarray(i, i + stride)),
            width: parsed.cell,
            height: parsed.cell,
            label: `${stem(file.name)}#${++n}`,
          });
        }
      } else {
        const img = await decodeAny(file);
        const c = coverFit(img.data, img.width, img.height, parsed.cell, parsed.cell);
        thumbs.push({ ...c, label: file.name });
      }
    }
    const cols = parsed.columns;
    const rows = Math.max(1, Math.ceil(thumbs.length / cols));
    const pad = 8;
    const labelH = 18;
    const W = cols * (parsed.cell + pad) + pad;
    const H = rows * (parsed.cell + pad + labelH) + pad;
    const canvas = fillSolid(W, H, '#111111');
    for (let i = 0; i < thumbs.length; i++) {
      ctx.progress((i + 1) / Math.max(thumbs.length, 1), thumbs[i]!.label);
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = pad + c * (parsed.cell + pad);
      const y = pad + r * (parsed.cell + pad + labelH);
      blit(canvas.data, W, H, thumbs[i]!.data, thumbs[i]!.width, thumbs[i]!.height, x, y);
      await applyTextWatermark(canvas.data, W, H, thumbs[i]!.label.slice(0, 28), {
        position: 'sw',
        opacity: 0.9,
        scale: 0.45,
        color: '#f2f2f2',
      });
    }
    const png = encodePngRgba(canvas.data, W, H);
    return wrap('creator-contact-sheet', files, [neoFileFromBytes('contact-sheet.png', png, 'image/png')], parsed, {
      cells: thumbs.length,
    });
  },
});
