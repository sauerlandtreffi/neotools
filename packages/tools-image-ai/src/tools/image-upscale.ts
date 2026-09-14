import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { IMAGE_ACCEPT, IMAGE_AI_LICENSES } from '../licenses.js';
import { batchImages, encodeOut, extFor, outMime, stem } from './common.js';
import { resizeBilinear, type RasterImage } from '../raster.js';
import { getSession, rasterToNchw, type OrtTensor } from '../models/runtime.js';
import { ModelMissingError } from '../models/errors.js';
import { activeOrtBackend } from '../models/runtime.js';

const options = z.object({
  scale: z.enum(['2', '4']).default('2'),
  tile: z.coerce.number().int().min(32).max(256).default(64),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
  fallbackBilinear: z.boolean().default(false),
  confirmModelDownload: z.boolean().default(false),
});

function tileImage(img: RasterImage, tile: number): Array<{ x: number; y: number; patch: RasterImage }> {
  const out: Array<{ x: number; y: number; patch: RasterImage }> = [];
  for (let y = 0; y < img.height; y += tile) {
    for (let x = 0; x < img.width; x += tile) {
      const w = Math.min(tile, img.width - x);
      const h = Math.min(tile, img.height - y);
      const data = new Uint8ClampedArray(tile * tile * 4);
      for (let yy = 0; yy < h; yy++) {
        data.set(img.data.subarray(((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x) * 4 + w * 4), yy * tile * 4);
      }
      out.push({ x, y, patch: { width: tile, height: tile, data } });
    }
  }
  return out;
}

function nchwToRaster(t: OrtTensor, width: number, height: number): RasterImage {
  const data = t.data instanceof Float32Array ? t.data : new Float32Array(t.data);
  const out = new Uint8ClampedArray(width * height * 4);
  const n = width * height;
  const planes = data.length >= n * 3 ? 3 : 1;
  for (let i = 0; i < n; i++) {
    if (planes === 3) {
      out[i * 4] = Math.max(0, Math.min(255, data[i]! * 255));
      out[i * 4 + 1] = Math.max(0, Math.min(255, data[n + i]! * 255));
      out[i * 4 + 2] = Math.max(0, Math.min(255, data[2 * n + i]! * 255));
    } else {
      const v = Math.max(0, Math.min(255, data[i]! * 255));
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
    }
    out[i * 4 + 3] = 255;
  }
  return { width, height, data: out };
}

export const imageUpscale = defineTool({
  id: 'image-upscale',
  pack: 'image',
  category: 'ai',
  title: { de: 'Super-Resolution (Showcase)', en: 'Super-resolution (showcase)' },
  description: {
    de: 'Showcase: Swin2SR-x2 lokal (Apache-2.0). Kein Produktversprechen. Ohne WebGPU langsam.',
    en: 'Showcase: local Swin2SR-x2 (Apache-2.0). Not a product claim. Slow without WebGPU.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png', 'image/jpeg', 'image/webp'] },
  options,
  presets: [{ id: 'x2', title: { de: '×2', en: '×2' }, options: { scale: '2' } }],
  licenses: IMAGE_AI_LICENSES,
  seo: { keywords: ['super resolution', 'upscale', 'swin2sr'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    if (!ctx.platform.capabilities.webgpu) {
      ctx.log('warn', 'Kein WebGPU — Super-Resolution läuft langsam auf WASM/CPU.');
    }
    return batchImages(ctx, files, parsed, async (file, img) => {
      const scale = Number(parsed.scale);
      try {
        const { session, entry, Tensor } = await getSession('swin2sr-x2', ctx.platform, ctx, parsed.confirmModelDownload);
        const spec = entry.input ?? {
          layout: 'NCHW' as const,
          width: parsed.tile,
          height: parsed.tile,
          color: 'RGB' as const,
          normalize: 'zero_one' as const,
        };
        const outW = img.width * 2;
        const outH = img.height * 2;
        const dest: RasterImage = { width: outW, height: outH, data: new Uint8ClampedArray(outW * outH * 4) };
        const tiles = tileImage(img, spec.width);
        for (const t of tiles) {
          const nchw = rasterToNchw(t.patch, spec);
          const inputName = session.inputNames[0] ?? 'input';
          const out = await session.run({
            [inputName]: new Tensor('float32', nchw, [1, 3, spec.height, spec.width]),
          });
          const first = out[session.outputNames[0] ?? ''] as OrtTensor | undefined;
          if (!first) throw new Error('Swin2SR ohne Ausgabe.');
          const up = nchwToRaster(first, spec.width * 2, spec.height * 2);
          const dw = Math.min(spec.width * 2, outW - t.x * 2);
          const dh = Math.min(spec.height * 2, outH - t.y * 2);
          for (let yy = 0; yy < dh; yy++) {
            dest.data.set(
              up.data.subarray(yy * up.width * 4, yy * up.width * 4 + dw * 4),
              ((t.y * 2 + yy) * outW + t.x * 2) * 4,
            );
          }
        }
        if (scale === 4) {
          const twice = resizeBilinear(dest, dest.width * 2, dest.height * 2);
          dest.width = twice.width;
          dest.height = twice.height;
          dest.data = twice.data;
        }
        const mime = outMime(parsed.format);
        return {
          files: [await encodeOut(dest, mime, `${stem(file.name)}-sr.${extFor(mime)}`, parsed.quality)],
          extra: { backend: activeOrtBackend(), model: 'swin2sr-x2', warning: 'Showcase, kein Studio-Versprechen.' },
        };
      } catch (err) {
        if (parsed.fallbackBilinear) {
          const up = resizeBilinear(img, img.width * scale, img.height * scale);
          const mime = outMime(parsed.format);
          return {
            files: [await encodeOut(up, mime, `${stem(file.name)}-bilinear.${extFor(mime)}`, parsed.quality)],
            extra: { fallback: 'bilinear', error: err instanceof Error ? err.message : String(err) },
          };
        }
        if (err instanceof ModelMissingError) {
          throw new Error(`${err.message} Showcase ohne Modell nicht gestartet.`);
        }
        throw err;
      }
    });
  },
});
