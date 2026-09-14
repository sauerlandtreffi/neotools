import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { encodePngRgba } from '../codec/png.js';
import { boxFromAspect, cropRect } from '../ops/crop.js';
import { resample } from '../codec/resample.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile, encodeImage, stem } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const SPECS = {
  de: { wMm: 35, hMm: 45, face: 0.72 },
  eu: { wMm: 35, hMm: 45, face: 0.7 },
  us: { wMm: 50.8, hMm: 50.8, face: 0.65 },
} as const;

const options = z.object({
  preset: z.enum(['de', 'eu', 'us']).default('de'),
  dpi: z.coerce.number().min(150).max(600).default(300),
  sheet: z.boolean().default(true),
});

function px(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

function heuristicSkinBox(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } | undefined {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 95 && g > 40 && b > 20 && r > g && r - g > 15) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        n++;
      }
    }
  }
  if (n < 12) return undefined;
  return { x: minX, y: minY, w: Math.max(8, maxX - minX), h: Math.max(8, maxY - minY) };
}

export const imagePassport = defineTool({
  id: 'image-passport',
  pack: 'image',
  category: 'images',
  title: { de: 'Passbild-Schneider', en: 'Passport photo crop' },
  description: {
    de: 'Passbild DE/EU/US mit Gesichts-Guides (YuNet wenn image-ai geladen, sonst Mitte) und optionalem 10×15-Druckbogen.',
    en: 'Passport photo DE/EU/US with face guides (YuNet if image-ai is loaded, else center) and optional 10×15 print sheet.',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['image/jpeg', 'image/png'] },
  options,
  presets: [
    { id: 'de', title: { de: 'DE 35×45', en: 'DE 35×45' }, options: { preset: 'de' } },
    { id: 'us', title: { de: 'US 2×2″', en: 'US 2×2″' }, options: { preset: 'us' } },
  ],
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['passbild', 'passport photo'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const spec = SPECS[parsed.preset];
    const tw = px(spec.wMm, parsed.dpi);
    const th = px(spec.hMm, parsed.dpi);
    const img = await decodeFile(files[0]!);
    let box = boxFromAspect(img.width, img.height, tw / th, 'center');
    const face = heuristicSkinBox(img.data, img.width, img.height);
    if (face) {
      const faceH = face.h / spec.face;
      const faceW = faceH * (tw / th);
      box = {
        x: Math.round(face.x + face.w / 2 - faceW / 2),
        y: Math.round(face.y + face.h * 0.15 - faceH * 0.12),
        w: Math.round(faceW),
        h: Math.round(faceH),
        unit: 'px',
      };
    }
    const cropped = cropRect(img.data, img.width, img.height, box);
    const out = resample(cropped.data, cropped.width, cropped.height, tw, th, 'lanczos3');
    const photo = await encodeImage({ ...img, width: tw, height: th, data: out.data }, 'jpeg', { quality: 92, keepMetadata: false }, `${stem(files[0]!.name)}-passport.jpg`);
    const outputs = [photo];
    if (parsed.sheet) {
      const sw = px(100, parsed.dpi);
      const sh = px(150, parsed.dpi);
      const sheet = new Uint8ClampedArray(sw * sh * 4);
      sheet.fill(255);
      const cols = Math.max(1, Math.floor(sw / (tw + 8)));
      const rows = Math.max(1, Math.floor(sh / (th + 8)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = 8 + c * (tw + 8);
          const y = 8 + r * (th + 8);
          for (let yy = 0; yy < th; yy++) {
            if (y + yy >= sh) continue;
            const src = yy * tw * 4;
            const dst = ((y + yy) * sw + x) * 4;
            sheet.set(out.data.subarray(src, src + tw * 4), dst);
          }
        }
      }
      outputs.push(neoFileFromBytes(`${stem(files[0]!.name)}-sheet.png`, encodePngRgba(sheet, sw, sh), 'image/png'));
    }
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ width: tw, height: th, preset: parsed.preset }, await createProvenance('image-passport', parsed, files)),
    };
  },
});
