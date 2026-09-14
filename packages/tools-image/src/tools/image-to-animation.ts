import { z } from 'zod';
import { defineTool, neoFileFromBytes, attachProvenance, createProvenance } from '@neotools/engine';
import { resample } from '../codec/resample.js';
import { encodeGif } from '../codec/gif.js';
import { encodeApng } from '../codec/apng.js';
import { encode } from '../codec/encode.js';
import type { DecodedFrame } from '../codec/types.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';

const options = z.object({
  format: z.enum(['gif', 'apng', 'webp']).default('gif'),
  durationMs: z.coerce.number().min(40).max(10000).default(800),
  width: z.coerce.number().min(16).max(2048).default(480),
  crossfade: z.boolean().default(false),
  fadeFrames: z.coerce.number().min(1).max(12).default(4),
});

function mix(a: Uint8ClampedArray, b: Uint8ClampedArray, t: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(a.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round((a[i] ?? 0) * (1 - t) + (b[i] ?? 0) * t);
  return out;
}

export const imageToAnimation = defineTool({
  id: 'image-to-animation',
  pack: 'image',
  category: 'images',
  title: { de: 'Bilder → GIF / Slideshow', en: 'Images → GIF / slideshow' },
  description: {
    de: 'Mehrere Bilder zu animiertem GIF, APNG oder WebP. Dauer pro Bild, optional Crossfade. Video-Ausgabe erst mit ffmpeg (Phase 3) — hier ausgeblendet.',
    en: 'Several images to animated GIF, APNG or WebP. Per-slide duration, optional crossfade. Video output waits for ffmpeg (phase 3) and is hidden here.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/gif', 'image/png', 'image/webp'] },
  options,
  presets: [
    { id: 'gif', title: { de: 'GIF', en: 'GIF' }, options: { format: 'gif' } },
    { id: 'apng', title: { de: 'APNG', en: 'APNG' }, options: { format: 'apng' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['slideshow', 'gif', 'apng'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const frames: DecodedFrame[] = [];
    let w = parsed.width;
    let h = parsed.width;
    for (let i = 0; i < files.length; i++) {
      ctx.progress(i / files.length, files[i]!.name);
      const img = await decodeFile(files[i]!);
      h = Math.max(1, Math.round((img.height / img.width) * w));
      const r = resample(img.data, img.width, img.height, w, h, 'lanczos3');
      frames.push({ data: r.data, width: w, height: h, delayMs: parsed.durationMs });
    }
    if (parsed.crossfade && frames.length > 1) {
      const faded: DecodedFrame[] = [];
      for (let i = 0; i < frames.length; i++) {
        faded.push({ ...frames[i]!, delayMs: Math.max(40, parsed.durationMs - parsed.fadeFrames * 40) });
        const next = frames[(i + 1) % frames.length]!;
        for (let f = 1; f <= parsed.fadeFrames; f++) {
          faded.push({
            data: mix(frames[i]!.data, next.data, f / (parsed.fadeFrames + 1)),
            width: w,
            height: h,
            delayMs: 40,
          });
        }
      }
      frames.length = 0;
      frames.push(...faded);
    }
    let bytes: Uint8Array;
    let name: string;
    let mime: string;
    if (parsed.format === 'gif') {
      bytes = await encodeGif(frames);
      name = 'slideshow.gif';
      mime = 'image/gif';
    } else if (parsed.format === 'apng') {
      bytes = encodeApng(frames);
      name = 'slideshow.png';
      mime = 'image/png';
    } else {
      bytes = await encode(
        { width: w, height: h, data: frames[0]!.data, meta: { format: 'webp', mime: 'image/webp', orientation: 1, pages: 1, colorSpace: 'srgb', iccTagged: false, comments: [], frames } },
        'webp',
        { quality: 80, frames },
      );
      name = 'slideshow.webp';
      mime = 'image/webp';
    }
    const provenance = await createProvenance('image-to-animation', parsed, files);
    return {
      outputs: [neoFileFromBytes(name, bytes, mime)],
      warnings: parsed.format === 'webp' ? ['Animiertes WebP: erster Frame + Metadaten; volle Animation über GIF/APNG zuverlässiger.'] : [],
      report: attachProvenance({ frames: frames.length, video: 'Phase 3 (ffmpeg) — Option ausgeblendet' }, provenance),
    };
  },
});
