import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyImageWatermark, applyTextWatermark, hexToRgb } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { decodeAny, drawRect, encodeNamed, isVideoFile, stem } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, fontExtra, fontFileName, mp4Tail, requireFfmpeg } from '../media.js';

const options = z.object({
  palette: z.string().default('#0f172a,#38bdf8,#f8fafc'),
  position: z.enum(['nw', 'ne', 'sw', 'se', 's']).default('se'),
  border: z.coerce.number().min(0).max(80).default(16),
  lowerThird: z.string().default(''),
  opacity: z.coerce.number().min(0.1).max(1).default(0.85),
});

export const creatorBrandKit = defineTool({
  id: 'creator-brand-kit',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Brand-Kit auf Ordner', en: 'Brand kit on folder' },
  description: {
    de: 'Logo + Palette + Font auf Bilder/Video: Wasserzeichen-Position, Farbrahmen, Lower-Third.',
    en: 'Logo + palette + font on images/video: watermark position, color frame, lower-third.',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', 'video/mp4'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['brand kit', 'watermark', 'lower third'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const logo = files.find((f) => /logo|mark/i.test(f.name) && !isVideoFile(f));
    const work = files.filter((f) => f !== logo);
    const colors = parsed.palette.split(/[\s,]+/).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c));
    const accent = hexToRgb(colors[0] ?? '#0f172a');
    const outputs = [];
    for (let i = 0; i < work.length; i++) {
      const file = work[i]!;
      ctx.progress((i + 1) / work.length, file.name);
      if (isVideoFile(file)) {
        await requireFfmpeg(ctx);
        const alias = aliasOf(file, 0);
        const extra = await fontExtra();
        const name = `${stem(file.name)}-brand.mp4`;
        const box = `drawbox=x=0:y=ih-${Math.max(parsed.border, 64)}:w=iw:h=${Math.max(parsed.border, 64)}:color=${(colors[0] ?? '#0f172a').replace('#', '0x')}@0.75:t=fill`;
        const text = parsed.lowerThird
          ? `,drawtext=fontfile=${fontFileName()}:text='${parsed.lowerThird.replace(/[:\\']/g, '\\$&')}':x=40:y=h-50:fontsize=36:fontcolor=white`
          : '';
        const args = ['-i', alias];
        if (logo) {
          args.push('-i', 'logo.png', '-filter_complex', `[0:v]${box}${text}[v];[1:v]scale=iw*0.18:-1[lg];[v][lg]overlay=W-w-24:H-h-24`, ...mp4Tail(), name);
          extra['logo.png'] = await logo.bytes();
        } else {
          args.push('-vf', `${box}${text}`, ...mp4Tail(), name);
        }
        const bytes = await encodeVideo(ctx, args, [{ name: alias, data: await file.bytes() }], name, extra);
        outputs.push(fileFromOutput(name, bytes));
        continue;
      }
      const img = await decodeAny(file);
      const pixels = new Uint8ClampedArray(img.data);
      if (parsed.border > 0) {
        const frame: [number, number, number, number] = [accent[0], accent[1], accent[2], 255];
        drawRect(pixels, img.width, img.height, 0, 0, img.width, parsed.border, frame);
        drawRect(pixels, img.width, img.height, 0, img.height - parsed.border, img.width, parsed.border, frame);
        drawRect(pixels, img.width, img.height, 0, 0, parsed.border, img.height, frame);
        drawRect(pixels, img.width, img.height, img.width - parsed.border, 0, parsed.border, img.height, frame);
      }
      if (logo) {
        const mark = await decodeAny(logo);
        applyImageWatermark(pixels, img.width, img.height, mark.data, mark.width, mark.height, {
          position: parsed.position === 's' ? 'se' : parsed.position,
          opacity: parsed.opacity,
          scale: 0.18,
        });
      }
      if (parsed.lowerThird) {
        await applyTextWatermark(pixels, img.width, img.height, parsed.lowerThird, {
          position: 's',
          opacity: 0.95,
          scale: 1.1,
          color: colors[2] ?? '#f8fafc',
        });
      }
      outputs.push(await encodeNamed({ ...img, data: pixels }, 'png', `${stem(file.name)}-brand.png`));
    }
    outputs.push(
      neoFileFromBytes(
        'brand-kit.json',
        new TextEncoder().encode(JSON.stringify({ palette: colors, position: parsed.position }, null, 2)),
        'application/json',
      ),
    );
    return wrap('creator-brand-kit', files, outputs, parsed, { files: work.length });
  },
});
