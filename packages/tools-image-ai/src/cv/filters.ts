import type { RasterImage } from '../raster.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeBox(box: Box, width: number, height: number, padding = 0): Box {
  const x = Math.max(0, Math.floor(box.x - padding));
  const y = Math.max(0, Math.floor(box.y - padding));
  const w = Math.min(width - x, Math.ceil(box.w + padding * 2));
  const h = Math.min(height - y, Math.ceil(box.h + padding * 2));
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

export function boxVariance(img: RasterImage, box: Box): number {
  const b = normalizeBox(box, img.width, img.height);
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const o = (y * img.width + x) * 4;
      const g = 0.299 * img.data[o]! + 0.587 * img.data[o + 1]! + 0.114 * img.data[o + 2]!;
      sum += g;
      sq += g * g;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

export function applyBoxBar(img: RasterImage, box: Box, color: [number, number, number] = [0, 0, 0]): void {
  const b = normalizeBox(box, img.width, img.height);
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = color[0];
      img.data[o + 1] = color[1];
      img.data[o + 2] = color[2];
      img.data[o + 3] = 255;
    }
  }
}

export function applyBoxPixelate(img: RasterImage, box: Box, block = 12): void {
  const b = normalizeBox(box, img.width, img.height);
  const s = Math.max(4, block);
  for (let y = b.y; y < b.y + b.h; y += s) {
    for (let x = b.x; x < b.x + b.w; x += s) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      const y2 = Math.min(b.y + b.h, y + s);
      const x2 = Math.min(b.x + b.w, x + s);
      for (let yy = y; yy < y2; yy++) {
        for (let xx = x; xx < x2; xx++) {
          const o = (yy * img.width + xx) * 4;
          r += img.data[o]!;
          g += img.data[o + 1]!;
          bl += img.data[o + 2]!;
          n++;
        }
      }
      if (!n) continue;
      r = Math.round(r / n);
      g = Math.round(g / n);
      bl = Math.round(bl / n);
      for (let yy = y; yy < y2; yy++) {
        for (let xx = x; xx < x2; xx++) {
          const o = (yy * img.width + xx) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = bl;
        }
      }
    }
  }
}

export function applyBoxBlur(img: RasterImage, box: Box, radius = 12): void {
  const b = normalizeBox(box, img.width, img.height);
  const copy = new Uint8ClampedArray(img.data);
  const r = Math.max(2, radius);
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = Math.max(b.y, Math.min(b.y + b.h - 1, y + dy));
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = Math.max(b.x, Math.min(b.x + b.w - 1, x + dx));
          const o = (yy * img.width + xx) * 4;
          rs += copy[o]!;
          gs += copy[o + 1]!;
          bs += copy[o + 2]!;
          n++;
        }
      }
      const o = (y * img.width + x) * 4;
      img.data[o] = rs / n;
      img.data[o + 1] = gs / n;
      img.data[o + 2] = bs / n;
    }
  }
}

export function applyStyle(img: RasterImage, box: Box, style: 'blur' | 'pixelate' | 'bar', padding = 0): void {
  const b = normalizeBox(box, img.width, img.height, padding);
  if (style === 'bar') applyBoxBar(img, b);
  else if (style === 'pixelate') applyBoxPixelate(img, b);
  else applyBoxBlur(img, b);
}

export function featherMask(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return mask;
  const out = new Float32Array(mask);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          acc += mask[yy * width + xx]!;
          n++;
        }
      }
      out[y * width + x] = acc / n;
    }
  }
  return out;
}

export function compositeAlpha(
  img: RasterImage,
  mask: Float32Array,
  threshold = 0.5,
  bg?: { color?: [number, number, number]; image?: RasterImage },
): RasterImage {
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let a = mask[p] ?? 0;
    if (threshold > 0) a = a >= threshold ? 1 : a <= threshold * 0.4 ? 0 : (a - threshold * 0.4) / (threshold * 0.6);
    if (bg?.image) {
      const o = Math.min(bg.image.data.length - 4, i);
      data[i] = img.data[i]! * a + bg.image.data[o]! * (1 - a);
      data[i + 1] = img.data[i + 1]! * a + bg.image.data[o + 1]! * (1 - a);
      data[i + 2] = img.data[i + 2]! * a + bg.image.data[o + 2]! * (1 - a);
      data[i + 3] = 255;
    } else if (bg?.color) {
      data[i] = img.data[i]! * a + bg.color[0] * (1 - a);
      data[i + 1] = img.data[i + 1]! * a + bg.color[1] * (1 - a);
      data[i + 2] = img.data[i + 2]! * a + bg.color[2] * (1 - a);
      data[i + 3] = 255;
    } else {
      data[i + 3] = Math.round(a * 255);
    }
  }
  return { width: img.width, height: img.height, data };
}

/** Bilateral filter (always-available denoise). */
export function bilateral(img: RasterImage, spatial = 3, range = 28): RasterImage {
  const data = new Uint8ClampedArray(img.data.length);
  const s = Math.max(1, Math.round(spatial));
  const r2 = 2 * range * range;
  const s2 = 2 * s * s;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      const cr = img.data[o]!;
      const cg = img.data[o + 1]!;
      const cb = img.data[o + 2]!;
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wsum = 0;
      for (let dy = -s; dy <= s; dy++) {
        const yy = Math.max(0, Math.min(img.height - 1, y + dy));
        for (let dx = -s; dx <= s; dx++) {
          const xx = Math.max(0, Math.min(img.width - 1, x + dx));
          const p = (yy * img.width + xx) * 4;
          const dr = img.data[p]! - cr;
          const dg = img.data[p + 1]! - cg;
          const db = img.data[p + 2]! - cb;
          const w =
            Math.exp(-(dx * dx + dy * dy) / s2) * Math.exp(-(dr * dr + dg * dg + db * db) / r2);
          wr += img.data[p]! * w;
          wg += img.data[p + 1]! * w;
          wb += img.data[p + 2]! * w;
          wsum += w;
        }
      }
      data[o] = wr / wsum;
      data[o + 1] = wg / wsum;
      data[o + 2] = wb / wsum;
      data[o + 3] = img.data[o + 3]!;
    }
  }
  return { width: img.width, height: img.height, data };
}

/** Non-local-means light (tiny search window). */
export function nlmLight(img: RasterImage, search = 5, patch = 1, h = 18): RasterImage {
  const data = new Uint8ClampedArray(img.data.length);
  const h2 = h * h;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wsum = 0;
      for (let dy = -search; dy <= search; dy++) {
        const yy = Math.max(0, Math.min(img.height - 1, y + dy));
        for (let dx = -search; dx <= search; dx++) {
          const xx = Math.max(0, Math.min(img.width - 1, x + dx));
          let dist = 0;
          let n = 0;
          for (let py = -patch; py <= patch; py++) {
            const y1 = Math.max(0, Math.min(img.height - 1, y + py));
            const y2 = Math.max(0, Math.min(img.height - 1, yy + py));
            for (let px = -patch; px <= patch; px++) {
              const x1 = Math.max(0, Math.min(img.width - 1, x + px));
              const x2 = Math.max(0, Math.min(img.width - 1, xx + px));
              const a = (y1 * img.width + x1) * 4;
              const b = (y2 * img.width + x2) * 4;
              const dr = img.data[a]! - img.data[b]!;
              const dg = img.data[a + 1]! - img.data[b + 1]!;
              const db = img.data[a + 2]! - img.data[b + 2]!;
              dist += dr * dr + dg * dg + db * db;
              n++;
            }
          }
          const w = Math.exp(-dist / n / h2);
          const p = (yy * img.width + xx) * 4;
          wr += img.data[p]! * w;
          wg += img.data[p + 1]! * w;
          wb += img.data[p + 2]! * w;
          wsum += w;
        }
      }
      data[o] = wr / wsum;
      data[o + 1] = wg / wsum;
      data[o + 2] = wb / wsum;
      data[o + 3] = img.data[o + 3]!;
    }
  }
  return { width: img.width, height: img.height, data };
}

export function hasJpegExif(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!;
    if (marker === 0xda) break;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker === 0xe1) return true;
    i += 2 + len;
  }
  return false;
}

export function hasPngTextChunk(bytes: Uint8Array, key: string): boolean {
  let off = 8;
  const needle = key.toLowerCase();
  while (off + 8 <= bytes.length) {
    const len = ((bytes[off]! << 24) | (bytes[off + 1]! << 16) | (bytes[off + 2]! << 8) | bytes[off + 3]!) >>> 0;
    const type = String.fromCharCode(bytes[off + 4]!, bytes[off + 5]!, bytes[off + 6]!, bytes[off + 7]!);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt' || type === 'eXIf') {
      const data = new TextDecoder().decode(bytes.subarray(off + 8, off + 8 + Math.min(len, 64)));
      if (type === 'eXIf' || data.toLowerCase().includes(needle)) return true;
    }
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return false;
}
