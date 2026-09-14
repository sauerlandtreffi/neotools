import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { luma } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, encodeImage, mapImages, stem } from './common.js';

const options = z.object({
  invert: z.boolean().default(true),
  orange: z.boolean().default(true),
  dust: z.boolean().default(true),
});

export const imageFilmScan = defineTool({
  id: 'image-film-scan',
  pack: 'image',
  category: 'images',
  title: { de: 'Filmscan-Kit', en: 'Film-scan kit' },
  description: {
    de: 'Orange-Mask entfernen, Invert, Median-Staub, Sprocket-Crop (dunkle Ränder).',
    en: 'Remove orange mask, invert, median dust, sprocket crop (dark edges).',
  },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 1 },
  outputs: { mime: ['image/png'] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['film scan', 'orange mask'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    return mapImages(ctx, files, async (file, img) => {
      let { data, width, height } = img;
      data = new Uint8ClampedArray(data);
      if (parsed.invert) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - (data[i] ?? 0);
          data[i + 1] = 255 - (data[i + 1] ?? 0);
          data[i + 2] = 255 - (data[i + 2] ?? 0);
        }
      }
      if (parsed.orange) {
        let or = 0;
        let og = 0;
        let ob = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          or += data[i] ?? 0;
          og += data[i + 1] ?? 0;
          ob += data[i + 2] ?? 0;
        }
        or /= n;
        og /= n;
        ob /= n;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, ((data[i] ?? 0) / (or || 1)) * 128);
          data[i + 1] = Math.min(255, ((data[i + 1] ?? 0) / (og || 1)) * 128);
          data[i + 2] = Math.min(255, ((data[i + 2] ?? 0) / (ob || 1)) * 128);
        }
      }
      if (parsed.dust) data = median3(data, width, height);
      const crop = sprocketCrop(data, width, height);
      return [await encodeImage({ ...img, ...crop }, 'png', { keepMetadata: false }, `${stem(file.name)}-film.png`)];
    });
  },
});

function median3(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const vals = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) vals.push(data[((y + dy) * w + (x + dx)) * 4 + c] ?? 0);
        }
        vals.sort((a, b) => a - b);
        out[(y * w + x) * 4 + c] = vals[4] ?? 0;
      }
    }
  }
  return out;
}

function sprocketCrop(data: Uint8ClampedArray, w: number, h: number) {
  const dark = (x: number, y: number) => luma(data[(y * w + x) * 4] ?? 0, data[(y * w + x) * 4 + 1] ?? 0, data[(y * w + x) * 4 + 2] ?? 0) < 28;
  let x0 = 0;
  let x1 = w;
  let y0 = 0;
  let y1 = h;
  while (x0 < w / 4 && colDark(x0)) x0++;
  while (x1 > (w * 3) / 4 && colDark(x1 - 1)) x1--;
  while (y0 < h / 4 && rowDark(y0)) y0++;
  while (y1 > (h * 3) / 4 && rowDark(y1 - 1)) y1--;
  function colDark(x: number) {
    let n = 0;
    for (let y = 0; y < h; y += 4) if (dark(x, y)) n++;
    return n > h / 8;
  }
  function rowDark(y: number) {
    let n = 0;
    for (let x = 0; x < w; x += 4) if (dark(x, y)) n++;
    return n > w / 8;
  }
  const nw = Math.max(8, x1 - x0);
  const nh = Math.max(8, y1 - y0);
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0) * 4 + nw * 4), y * nw * 4);
  return { data: out, width: nw, height: nh };
}
