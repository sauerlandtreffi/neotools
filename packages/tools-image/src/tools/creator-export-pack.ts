import { z } from 'zod';
import { zipSync, strToU8 } from 'fflate';
import { defineTool, neoFileFromBytes, MIME, attachProvenance, createProvenance } from '@neotools/engine';
import { resample } from '../codec/resample.js';
import { fillBackground } from '../codec/pixels.js';
import { encode } from '../codec/encode.js';
import { applyTextWatermark } from '../ops/watermark.js';
import { cropCircle, cropRect, boxFromAspect } from '../ops/crop.js';
import { EXPORT_PRESETS } from '../presets/export-library.js';
import type { ImageFormat } from '../codec/types.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  pack: z
    .enum(['favicon', 'appicon', 'og', 'web-1x2x', 'print-300', 'platform', 'produktfoto', 'sticker'])
    .default('favicon'),
  title: z.string().default(''),
  drawSafeZone: z.boolean().default(false),
});

function cover(data: Uint8ClampedArray, sw: number, sh: number, tw: number, th: number) {
  const scale = Math.max(tw / sw, th / sh);
  const cw = Math.round(sw * scale);
  const ch = Math.round(sh * scale);
  const scaled = resample(data, sw, sh, cw, ch, scale < 1 ? 'lanczos3' : 'bilinear');
  return cropRect(scaled.data, scaled.width, scaled.height, boxFromAspect(scaled.width, scaled.height, tw / th, 'center'));
}

export const creatorExportPack = defineTool({
  id: 'creator-export-pack',
  pack: 'creator',
  category: 'images',
  title: { de: 'Export-Pack', en: 'Export pack' },
  description: {
    de: 'Favicon, App-Icons, OG-Card, Web 1×/2×, Print 300 dpi, Platform-Größen, Produktfoto, Sticker. ZIP + Snippets.',
    en: 'Favicon, app icons, OG card, web 1×/2×, print 300 dpi, platform sizes, product photo, sticker. ZIP + snippets.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/zip', 'image/png', 'text/plain', 'text/html'] },
  options,
  presets: EXPORT_PRESETS.map((p) => ({ id: p.id, title: p.title, options: { pack: p.id as z.infer<typeof options>['pack'] } })),
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['favicon', 'og image', 'app icon', 'sticker'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const img = await decodeFile(file);
    const spec = EXPORT_PRESETS.find((p) => p.id === parsed.pack) ?? EXPORT_PRESETS[0]!;
    const zip: Record<string, Uint8Array> = {};
    const outputs = [];
    const names: string[] = [];
    for (let i = 0; i < spec.items.length; i++) {
      const item = spec.items[i]!;
      ctx.progress((i + 1) / spec.items.length, item.filename);
      let work = cover(img.data, img.width, img.height, item.width, item.height);
      if (item.width !== work.width || item.height !== work.height) {
        const r = resample(work.data, work.width, work.height, item.width, item.height, 'lanczos3');
        work = { data: r.data, width: r.width, height: r.height };
      }
      let pixels = work.data;
      if (item.background) pixels = fillBackground(pixels, item.background);
      if (parsed.pack === 'sticker') {
        const c = cropCircle(pixels, work.width, work.height);
        const r = resample(c.data, c.width, c.height, 512, 512, 'lanczos3');
        work = r;
        pixels = r.data;
      }
      if (item.overlayTitle && parsed.title) {
        pixels = new Uint8ClampedArray(pixels);
        await applyTextWatermark(pixels, work.width, work.height, parsed.title, {
          position: 's',
          opacity: 0.9,
          scale: 1.4,
          color: '#ffffff',
        });
      }
      if ((item.safeZone || parsed.drawSafeZone) && parsed.pack === 'platform') {
        pixels = new Uint8ClampedArray(pixels);
        const inset = Math.round(Math.min(work.width, work.height) * 0.07);
        for (let x = inset; x < work.width - inset; x++) {
          for (const y of [inset, work.height - inset]) {
            const i4 = (y * work.width + x) * 4;
            pixels[i4] = 0;
            pixels[i4 + 1] = 255;
            pixels[i4 + 2] = 80;
            pixels[i4 + 3] = 200;
          }
        }
      }
      const format = item.format as ImageFormat;
      let bytes = await encode(
        { width: work.width, height: work.height, data: pixels, meta: img.meta },
        format,
        { quality: item.quality ?? 85, keepMetadata: false, icoSizes: format === 'ico' ? [16, 32, 48] : undefined },
      );
      if (parsed.pack === 'sticker') {
        let lo = 30;
        let hi = 80;
        let best = bytes;
        for (let k = 0; k < 6; k++) {
          const mid = Math.round((lo + hi) / 2);
          const cand = await encode(
            { width: work.width, height: work.height, data: pixels, meta: img.meta },
            'webp',
            { quality: mid, keepMetadata: false },
          );
          if (cand.length <= 100 * 1024) {
            best = cand;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        bytes = best.length <= 100 * 1024 ? best : bytes;
      }
      zip[item.filename] = bytes;
      outputs.push(neoFileFromBytes(item.filename, bytes, format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : format === 'avif' ? 'image/avif' : format === 'ico' ? 'image/x-icon' : 'image/png'));
      names.push(item.filename);
    }
    for (const sn of spec.snippets ?? []) {
      const body = strToU8(sn.body);
      zip[sn.name] = body;
      const mime = sn.name.endsWith('.html') ? 'text/html' : sn.name.endsWith('.json') || sn.name.endsWith('.webmanifest') ? MIME.json : 'text/plain';
      outputs.push(neoFileFromBytes(sn.name, body, mime));
      names.push(sn.name);
    }
    const zipped = zipSync(zip, { level: 6 });
    outputs.unshift(neoFileFromBytes(`${spec.id}.zip`, zipped, 'application/zip'));
    const provenance = await createProvenance('creator-export-pack', parsed, files);
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ files: names, pack: spec.id }, provenance),
    };
  },
});
