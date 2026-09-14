import { z } from 'zod';
import { defineTool, neoFileFromBytes, MIME } from '@neotools/engine';
import { luma } from '../codec/pixels.js';
import { IMAGE_ACCEPT, IMAGE_LICENSES, decodeFile } from './common.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({});

export const imageBurstBest = defineTool({
  id: 'image-burst-best',
  pack: 'image',
  category: 'images',
  title: { de: 'Burst → bestes Bild', en: 'Burst → best frame' },
  description: { de: 'Schärfe- (Laplace) und Belichtungs-Score, bestes Bild plus Ranking.', en: 'Sharpness (Laplace) and exposure score, best image plus ranking.' },
  inputs: { accept: IMAGE_ACCEPT, multiple: true, min: 2 },
  outputs: { mime: ['image/png', 'image/jpeg', MIME.json] },
  options,
  licenses: IMAGE_LICENSES,
  seo: { keywords: ['burst', 'best photo'] },
  async run(ctx, files) {
    const scored = [];
    for (const file of files) {
      ctx.progress(0.3, file.name);
      const img = await decodeFile(file);
      scored.push({ file, score: scoreImage(img.data, img.width, img.height), bytes: await file.bytes(), mime: file.mime });
    }
    scored.sort((a, b) => b.score.total - a.score.total);
    const best = scored[0]!;
    const json = scored.map((s) => ({ file: s.file.name, ...s.score }));
    return {
      outputs: [
        neoFileFromBytes(`best-${best.file.name}`, best.bytes, best.mime),
        neoFileFromBytes('burst-scores.json', new TextEncoder().encode(JSON.stringify({ ranking: json }, null, 2)), MIME.json),
      ],
      warnings: [],
      report: attachProvenance({ best: best.file.name, ranking: json }, await createProvenance('image-burst-best', {}, files)),
    };
  },
});

function scoreImage(data: Uint8ClampedArray, w: number, h: number) {
  let lap = 0;
  let clip = 0;
  let n = 0;
  const y = (x: number, yy: number) => luma(data[(yy * w + x) * 4] ?? 0, data[(yy * w + x) * 4 + 1] ?? 0, data[(yy * w + x) * 4 + 2] ?? 0);
  for (let yy = 1; yy < h - 1; yy += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const v = y(x, yy);
      const L = -y(x - 1, yy) - y(x + 1, yy) - y(x, yy - 1) - y(x, yy + 1) + 4 * v;
      lap += L * L;
      if (v < 8 || v > 247) clip++;
      n++;
    }
  }
  const sharpness = lap / Math.max(n, 1);
  const exposure = 1 - clip / Math.max(n, 1);
  return { sharpness, exposure, total: sharpness * 0.7 + exposure * 4000 };
}
