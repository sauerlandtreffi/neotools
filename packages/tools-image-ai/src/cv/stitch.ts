import type { RasterImage } from '../raster.js';
import { toGray } from './color.js';

function rowHash(gray: Float32Array, width: number, y: number): number {
  let hash = 0;
  const row = y * width;
  const step = Math.max(1, Math.floor(width / 64));
  let prev = gray[row]!;
  for (let x = step; x < width; x += step) {
    const v = gray[row + x]!;
    hash = (hash << 1) | (v > prev ? 1 : 0);
    prev = v;
    hash >>>= 0;
  }
  return hash;
}

function rowMean(gray: Float32Array, width: number, y: number): number {
  let s = 0;
  const row = y * width;
  for (let x = 0; x < width; x++) s += gray[row + x]!;
  return s / width;
}

function hamming(a: number, b: number): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += x & 1;
    x >>>= 1;
  }
  return n;
}

/** Find vertical overlap (rows of `next` that match the bottom of `prev`). */
export function findVerticalOverlap(prev: RasterImage, next: RasterImage, minOverlap = 8): number {
  const ga = toGray(prev);
  const gb = toGray(next);
  const ha: number[] = [];
  const hb: number[] = [];
  const ma: number[] = [];
  const mb: number[] = [];
  for (let y = 0; y < prev.height; y++) {
    ha.push(rowHash(ga, prev.width, y));
    ma.push(rowMean(ga, prev.width, y));
  }
  for (let y = 0; y < next.height; y++) {
    hb.push(rowHash(gb, next.width, y));
    mb.push(rowMean(gb, next.width, y));
  }
  const maxOverlap = Math.min(prev.height, next.height) - 2;
  let best = minOverlap;
  let bestScore = Infinity;
  for (let ov = minOverlap; ov < maxOverlap; ov++) {
    let dist = 0;
    let l1 = 0;
    for (let i = 0; i < ov; i++) {
      dist += hamming(ha[prev.height - ov + i]!, hb[i]!);
      l1 += Math.abs(ma[prev.height - ov + i]! - mb[i]!);
    }
    const score = dist / ov + l1 / ov / 8;
    if (score < bestScore) {
      bestScore = score;
      best = ov;
    }
  }
  return best;
}

export function stitchVertical(images: RasterImage[]): RasterImage {
  if (!images.length) throw new Error('Keine Bilder zum Zusammenfügen.');
  if (images.length === 1) return images[0]!;
  let acc = images[0]!;
  for (let i = 1; i < images.length; i++) {
    const next = images[i]!;
    const width = Math.min(acc.width, next.width);
    const overlap = findVerticalOverlap(
      { width, height: acc.height, data: acc.data },
      { width, height: next.height, data: next.data },
    );
    const addH = next.height - overlap;
    const height = acc.height + addH;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < acc.height; y++) {
      data.set(acc.data.subarray(y * acc.width * 4, y * acc.width * 4 + width * 4), y * width * 4);
    }
    for (let y = 0; y < addH; y++) {
      const sy = y + overlap;
      data.set(next.data.subarray(sy * next.width * 4, sy * next.width * 4 + width * 4), (acc.height + y) * width * 4);
    }
    acc = { width, height, data };
  }
  return acc;
}
