import type { RasterImage } from '../raster.js';
import type { Box } from './filters.js';
import { toGray } from './color.js';
import { isValidKennzeichen } from '../secrets/patterns.js';

export interface WordBox {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

/** High-contrast rectangles with plate-like aspect (fallback when no plate model). */
export function heuristicPlateBoxes(img: RasterImage): Box[] {
  const gray = toGray(img);
  const boxes: Box[] = [];
  const w = img.width;
  const h = img.height;
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const x = i % w;
    const left = x > 0 ? gray[i - 1]! : gray[i]!;
    bin[i] = Math.abs(gray[i]! - left) > 28 ? 255 : 0;
  }
  const visited = new Uint8Array(bin.length);
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = y * w + x;
      if (!bin[i] || visited[i]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      visited[i] = 1;
      let n = 0;
      while (stack.length && n < 8000) {
        const p = stack.pop()!;
        n++;
        const px = p % w;
        const py = (p / w) | 0;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ] as const) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!bin[j] || visited[j]) continue;
          visited[j] = 1;
          stack.push(j);
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const aspect = bw / Math.max(1, bh);
      if (aspect < 2.2 || aspect > 6.2) continue;
      if (bw < 40 || bh < 10 || bw > w * 0.8) continue;
      if (bh > h * 0.25) continue;
      boxes.push({ x: minX, y: minY, w: bw, h: bh });
    }
  }
  return boxes.slice(0, 16);
}

export function platesFromOcrWords(words: WordBox[]): Box[] {
  const boxes: Box[] = [];
  for (const w of words) {
    const t = w.text.trim().toUpperCase();
    if (!t) continue;
    const compact = t.replace(/\s+/g, '');
    const looks = /^[A-ZÄÖÜ]{1,3}-?[A-Z]{1,2}\d{1,4}[EH]?$/.test(compact);
    if (looks || isValidKennzeichen(t) || isValidKennzeichen(compact.replace(/([A-ZÄÖÜ]{1,3})([A-Z]{1,2})/, '$1-$2'))) {
      boxes.push({
        x: w.bbox.x0,
        y: w.bbox.y0,
        w: w.bbox.x1 - w.bbox.x0,
        h: w.bbox.y1 - w.bbox.y0,
      });
    }
  }
  return boxes;
}
