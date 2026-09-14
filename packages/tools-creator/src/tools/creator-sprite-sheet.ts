import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encodePngRgba } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_ACCEPT } from '../common.js';
import { blit, coverFit, decodeAny, encodeNamed, stem } from '../raster.js';

const options = z.object({
  mode: z.enum(['pack', 'unpack']).default('pack'),
  columns: z.coerce.number().min(0).max(32).default(0),
  cell: z.coerce.number().min(0).max(1024).default(0),
});

export const creatorSpriteSheet = defineTool({
  id: 'creator-sprite-sheet',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Sprite-Sheet / Atlas', en: 'Sprite sheet / atlas' },
  description: {
    de: 'Frames ↔ Sprite-Sheet/Texture-Atlas packen und entpacken, inkl. JSON-Metadaten.',
    en: 'Pack and unpack frames ↔ sprite sheet/texture atlas, including JSON metadata.',
  },
  inputs: { accept: [...IMAGE_ACCEPT, 'application/json', '.json'], multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'application/json'] },
  options,
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['sprite sheet', 'texture atlas'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const jsonFile = files.find((f) => f.mime === 'application/json' || f.name.endsWith('.json'));
    const images = files.filter((f) => f !== jsonFile);
    if (parsed.mode === 'unpack') {
      const sheet = await decodeAny(images[0]!);
      const meta = jsonFile
        ? (JSON.parse(new TextDecoder().decode(await jsonFile.bytes())) as {
            frames?: Array<{ x: number; y: number; w: number; h: number; name?: string }>;
            columns?: number;
            cell?: number;
          })
        : {};
      const frames = meta.frames?.length
        ? meta.frames
        : gridFrames(sheet.width, sheet.height, meta.columns ?? (parsed.columns || 4), meta.cell ?? (parsed.cell || sheet.height));
      const outputs = [];
      for (let i = 0; i < frames.length; i++) {
        const fr = frames[i]!;
        const data = new Uint8ClampedArray(fr.w * fr.h * 4);
        for (let y = 0; y < fr.h; y++) {
          const src = ((fr.y + y) * sheet.width + fr.x) * 4;
          data.set(sheet.data.subarray(src, src + fr.w * 4), y * fr.w * 4);
        }
        outputs.push(
          await encodeNamed({ ...sheet, width: fr.w, height: fr.h, data }, 'png', fr.name ?? `frame-${i + 1}.png`),
        );
      }
      return wrap('creator-sprite-sheet', files, outputs, parsed, { frames: frames.length, mode: 'unpack' });
    }
    const decoded = [];
    for (const f of images) decoded.push({ file: f, img: await decodeAny(f) });
    const cell = parsed.cell || Math.max(...decoded.map((d) => Math.max(d.img.width, d.img.height)));
    const cols = parsed.columns || Math.ceil(Math.sqrt(decoded.length));
    const rows = Math.ceil(decoded.length / cols);
    const W = cols * cell;
    const H = rows * cell;
    const sheet = new Uint8ClampedArray(W * H * 4);
    const frames = [];
    for (let i = 0; i < decoded.length; i++) {
      ctx.progress((i + 1) / decoded.length, decoded[i]!.file.name);
      const c = i % cols;
      const r = Math.floor(i / cols);
      const fitted = coverFit(decoded[i]!.img.data, decoded[i]!.img.width, decoded[i]!.img.height, cell, cell);
      blit(sheet, W, H, fitted.data, cell, cell, c * cell, r * cell);
      frames.push({ name: `${stem(decoded[i]!.file.name)}.png`, x: c * cell, y: r * cell, w: cell, h: cell });
    }
    const png = encodePngRgba(sheet, W, H);
    const json = new TextEncoder().encode(JSON.stringify({ columns: cols, cell, frames }, null, 2));
    return wrap(
      'creator-sprite-sheet',
      files,
      [neoFileFromBytes('sprite-sheet.png', png, 'image/png'), neoFileFromBytes('sprite-sheet.json', json, 'application/json')],
      parsed,
      { frames: frames.length, width: W, height: H, mode: 'pack' },
    );
  },
});

function gridFrames(width: number, height: number, columns: number, cell: number) {
  const frames = [];
  const cols = columns || Math.max(1, Math.floor(width / cell));
  const cw = cell || Math.floor(width / cols);
  const ch = cell || cw;
  let i = 0;
  for (let y = 0; y + ch <= height; y += ch) {
    for (let x = 0; x + cw <= width; x += cw) {
      frames.push({ x, y, w: cw, h: ch, name: `frame-${++i}.png` });
    }
  }
  return frames;
}
