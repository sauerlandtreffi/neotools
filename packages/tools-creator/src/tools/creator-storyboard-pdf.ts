import { z } from 'zod';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encode } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { coverFit, decodeAny, isTextish, isVideoFile } from '../raster.js';
import { aliasOf, encodeVideo, requireFfmpeg } from '../media.js';

const options = z.object({
  notes: z.string().default(''),
  frames: z.coerce.number().min(1).max(24).default(8),
});

export const creatorStoryboardPdf = defineTool({
  id: 'creator-storyboard-pdf',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Storyboard-PDF', en: 'Storyboard PDF' },
  description: {
    de: 'Frames/Bilder + Notizen → PDF-Storyboard (pdf-lib).',
    en: 'Frames/images + notes → PDF storyboard (pdf-lib).',
  },
  inputs: { accept: [...IMAGE_VIDEO_ACCEPT, 'text/plain', 'text/csv', '.txt', '.csv'], multiple: true, min: 1 },
  outputs: { mime: ['application/pdf'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['storyboard', 'pdf'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const noteFile = files.find(isTextish);
    const notes = noteFile ? new TextDecoder().decode(await noteFile.bytes()) : parsed.notes;
    const noteLines = notes.split(/\r?\n/).filter(Boolean);
    const thumbs: Uint8Array[] = [];
    for (const file of files.filter((f) => f !== noteFile)) {
      if (isVideoFile(file)) {
        await requireFfmpeg(ctx);
        const alias = aliasOf(file, 0);
        const raw = await encodeVideo(
          ctx,
          ['-i', alias, '-vf', 'fps=1,scale=320:180:force_original_aspect_ratio=increase,crop=320:180,format=rgba', '-frames:v', String(parsed.frames), '-f', 'rawvideo', 'sb.rgba'],
          [{ name: alias, data: await file.bytes() }],
          'sb.rgba',
        );
        const stride = 320 * 180 * 4;
        for (let i = 0; i + stride <= raw.byteLength; i += stride) {
          const data = new Uint8ClampedArray(raw.subarray(i, i + stride));
          thumbs.push(await encode({ width: 320, height: 180, data, meta: emptyPngMeta() }, 'jpeg', { quality: 80, keepMetadata: false }));
        }
      } else {
        const img = await decodeAny(file);
        const c = coverFit(img.data, img.width, img.height, 320, 180);
        thumbs.push(await encode({ ...img, width: 320, height: 180, data: c.data }, 'jpeg', { quality: 80, keepMetadata: false }));
      }
    }
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < thumbs.length; i += 2) {
      ctx.progress((i + 1) / thumbs.length, `page-${i}`);
      const page = pdf.addPage([595, 842]);
      const pair = thumbs.slice(i, i + 2);
      for (let k = 0; k < pair.length; k++) {
        const jpg = await pdf.embedJpg(pair[k]!);
        const y = 720 - k * 340;
        page.drawImage(jpg, { x: 40, y, width: 320, height: 180 });
        page.drawText(noteLines[i + k] ?? `Shot ${i + k + 1}`, {
          x: 380,
          y: y + 140,
          size: 11,
          font,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: 170,
        });
      }
    }
    const bytes = await pdf.save();
    return wrap('creator-storyboard-pdf', files, [neoFileFromBytes('storyboard.pdf', bytes, 'application/pdf')], parsed, {
      frames: thumbs.length,
    });
  },
});

function emptyPngMeta(): import('@neotools/tools-image').DecodedImage['meta'] {
  return {
    format: 'png',
    mime: 'image/png',
    orientation: 1,
    pages: 1,
    colorSpace: 'srgb',
    iccTagged: false,
    comments: [],
  };
}
