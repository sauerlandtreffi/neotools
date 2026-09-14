import type { RasterImage } from '../raster.js';
import type { Box } from './filters.js';
import { toGray } from './color.js';

export function rowVariance(gray: Float32Array, width: number, y: number): number {
  let sum = 0;
  let sq = 0;
  for (let x = 0; x < width; x++) {
    const v = gray[y * width + x]!;
    sum += v;
    sq += v * v;
  }
  const mean = sum / width;
  return sq / width - mean * mean;
}

export function detectChromeBand(img: RasterImage): { y0: number; y1: number } | null {
  const gray = toGray(img);
  const limit = Math.min(img.height, Math.round(img.height * 0.22));
  let bandEnd = 0;
  for (let y = 0; y < limit; y++) {
    const v = rowVariance(gray, img.width, y);
    if (v < 90) bandEnd = y + 1;
    else if (y > 8 && v > 400) break;
  }
  if (bandEnd < 10) return null;
  return { y0: 0, y1: bandEnd };
}

export function detectSidebar(img: RasterImage): { x0: number; x1: number } | null {
  const gray = toGray(img);
  const limit = Math.min(img.width, Math.round(img.width * 0.28));
  let end = 0;
  for (let x = 0; x < limit; x++) {
    let sum = 0;
    let sq = 0;
    for (let y = 0; y < img.height; y++) {
      const v = gray[y * img.width + x]!;
      sum += v;
      sq += v * v;
    }
    const mean = sum / img.height;
    const v = sq / img.height - mean * mean;
    if (v < 120) end = x + 1;
    else if (x > 12 && v > 500) break;
  }
  if (end < 16) return null;
  return { x0: 0, x1: end };
}

export function cropRaster(img: RasterImage, x: number, y: number, w: number, h: number): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let yy = 0; yy < h; yy++) {
    const src = ((y + yy) * img.width + x) * 4;
    data.set(img.data.subarray(src, src + w * 4), yy * w * 4);
  }
  return { width: w, height: h, data };
}

function isSkin(r: number, g: number, b: number): boolean {
  return r > 90 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && Math.abs(r - g) > 8;
}

/** Best-effort circular avatars (small round skin/gray blobs). */
export function detectAvatars(img: RasterImage): Box[] {
  const boxes: Box[] = [];
  const visited = new Uint8Array(img.width * img.height);
  const minR = 8;
  const maxR = Math.min(48, Math.round(Math.min(img.width, img.height) * 0.12));
  for (let y = 2; y < img.height - 2; y += 2) {
    for (let x = 2; x < img.width - 2; x += 2) {
      const i = y * img.width + x;
      if (visited[i]) continue;
      const o = i * 4;
      const r = img.data[o]!;
      const g = img.data[o + 1]!;
      const b = img.data[o + 2]!;
      const roundish = isSkin(r, g, b) || (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 40 && r < 230);
      if (!roundish) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      visited[i] = 1;
      let n = 0;
      while (stack.length && n < 4000) {
        const p = stack.pop()!;
        n++;
        const px = p % img.width;
        const py = (p / img.width) | 0;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
          const j = yy * img.width + xx;
          if (visited[j]) continue;
          const q = j * 4;
          const rr = img.data[q]!;
          const gg = img.data[q + 1]!;
          const bb = img.data[q + 2]!;
          if (Math.abs(rr - r) + Math.abs(gg - g) + Math.abs(bb - b) > 70) continue;
          visited[j] = 1;
          stack.push(j);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const aspect = w / h;
      if (w < minR * 2 || h < minR * 2 || w > maxR * 2 || h > maxR * 2) continue;
      if (aspect < 0.75 || aspect > 1.3) continue;
      boxes.push({ x: minX, y: minY, w, h });
    }
  }
  return boxes.slice(0, 24);
}

/** Small saturated red circles (unread badges). */
export function detectRedBadges(img: RasterImage): Box[] {
  const boxes: Box[] = [];
  const visited = new Uint8Array(img.width * img.height);
  for (let y = 1; y < img.height - 1; y++) {
    for (let x = 1; x < img.width - 1; x++) {
      const i = y * img.width + x;
      if (visited[i]) continue;
      const o = i * 4;
      const r = img.data[o]!;
      const g = img.data[o + 1]!;
      const b = img.data[o + 2]!;
      if (r < 170 || r < g + 40 || r < b + 40 || g > 120) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      visited[i] = 1;
      let n = 0;
      while (stack.length && n < 800) {
        const p = stack.pop()!;
        n++;
        const px = p % img.width;
        const py = (p / img.width) | 0;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
          const j = yy * img.width + xx;
          if (visited[j]) continue;
          const q = j * 4;
          if (img.data[q]! < 160 || img.data[q]! < img.data[q + 1]! + 30) continue;
          visited[j] = 1;
          stack.push(j);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w < 5 || h < 5 || w > 28 || h > 28) continue;
      if (w / h < 0.7 || w / h > 1.4) continue;
      boxes.push({ x: minX, y: minY, w, h });
    }
  }
  return boxes.slice(0, 32);
}
