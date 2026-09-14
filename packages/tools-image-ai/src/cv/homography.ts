import type { RasterImage } from '../raster.js';
import type { Point } from './quad.js';

export type Mat3 = [number, number, number, number, number, number, number, number, number];

function solve8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    const tmp = M[col]!;
    M[col] = M[pivot]!;
    M[pivot] = tmp;
    const div = M[col]![col]!;
    if (Math.abs(div) < 1e-12) throw new Error('Homographie singulär.');
    for (let c = col; c <= n; c++) M[col]![c] = M[col]![c]! / div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - f * M[col]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

/** DLT homography mapping src[i] → dst[i] (4 points). h33 = 1. */
export function findHomography(src: Point[], dst: Point[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Homographie braucht 4 Punkte.');
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const u = dst[i]!.x;
    const v = dst[i]!.y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve8(A, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function invertHomography(h: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = c * i - b * j;
  const C = b * f - c * e;
  const D = f * g - d * j;
  const E = a * j - c * g;
  const F = c * d - a * f;
  const G = d * i - e * g;
  const H = b * g - a * i;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-12) throw new Error('Homographie nicht invertierbar.');
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

export function applyHomography(h: Mat3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

function sampleBilinear(img: RasterImage, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= img.width - 1 || y >= img.height - 1) {
    const xi = Math.max(0, Math.min(img.width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(img.height - 1, Math.round(y)));
    const o = (yi * img.width + xi) * 4;
    return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!, img.data[o + 3]!];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p00 = img.data[(y0 * img.width + x0) * 4 + c]!;
    const p10 = img.data[(y0 * img.width + x1) * 4 + c]!;
    const p01 = img.data[(y1 * img.width + x0) * 4 + c]!;
    const p11 = img.data[(y1 * img.width + x1) * 4 + c]!;
    out[c] = p00 * (1 - tx) * (1 - ty) + p10 * tx * (1 - ty) + p01 * (1 - tx) * ty + p11 * tx * ty;
  }
  return out;
}

export function warpPerspective(
  img: RasterImage,
  srcQuad: [Point, Point, Point, Point],
  destW: number,
  destH: number,
): RasterImage {
  const dst: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: destW - 1, y: 0 },
    { x: destW - 1, y: destH - 1 },
    { x: 0, y: destH - 1 },
  ];
  const h = findHomography(dst, srcQuad);
  const data = new Uint8ClampedArray(destW * destH * 4);
  for (let y = 0; y < destH; y++) {
    for (let x = 0; x < destW; x++) {
      const p = applyHomography(h, { x, y });
      const [r, g, b, a] = sampleBilinear(img, p.x, p.y);
      const o = (y * destW + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return { width: destW, height: destH, data };
}

export function destSizeFromQuad(quad: [Point, Point, Point, Point]): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const w = Math.round((Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2);
  const h = Math.round((Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2);
  return { width: Math.max(32, w), height: Math.max(32, h) };
}
