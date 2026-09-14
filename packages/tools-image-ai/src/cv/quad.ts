import { toGray } from './color.js';
import { cannyLight, houghLines, lineIntersect, type Line } from './edges.js';
import type { RasterImage } from '../raster.js';

export interface Point {
  x: number;
  y: number;
}

export function orderQuad(pts: Point[]): [Point, Point, Point, Point] {
  const sum = pts.map((p) => ({ p, s: p.x + p.y, d: p.x - p.y }));
  const tl = sum.reduce((a, b) => (a.s < b.s ? a : b)).p;
  const br = sum.reduce((a, b) => (a.s > b.s ? a : b)).p;
  const tr = sum.reduce((a, b) => (a.d > b.d ? a : b)).p;
  const bl = sum.reduce((a, b) => (a.d < b.d ? a : b)).p;
  return [tl, tr, br, bl];
}

function otsuThreshold(gray: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[Math.max(0, Math.min(255, Math.round(v)))]! += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let thresh = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      thresh = i;
    }
  }
  return thresh;
}

function largestComponent(bin: Uint8Array, width: number, height: number): { mask: Uint8Array; count: number } {
  const labels = new Int32Array(bin.length);
  labels.fill(-1);
  let bestCount = 0;
  let bestId = -1;
  let next = 0;
  const qx = new Int32Array(bin.length);
  const qy = new Int32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || labels[i] !== -1) continue;
    const id = next++;
    let head = 0;
    let tail = 0;
    qx[tail] = i % width;
    qy[tail] = (i / width) | 0;
    tail++;
    labels[i] = id;
    let count = 0;
    while (head < tail) {
      const x = qx[head]!;
      const y = qy[head]!;
      head++;
      count++;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (!bin[j] || labels[j] !== -1) continue;
        labels[j] = id;
        qx[tail] = xx;
        qy[tail] = yy;
        tail++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  const mask = new Uint8Array(bin.length);
  if (bestId >= 0) {
    for (let i = 0; i < labels.length; i++) if (labels[i] === bestId) mask[i] = 255;
  }
  return { mask, count: bestCount };
}

function extremaQuad(mask: Uint8Array, width: number, height: number): Point[] | null {
  let minS = Infinity;
  let maxS = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  let tl: Point | null = null;
  let br: Point | null = null;
  let tr: Point | null = null;
  let bl: Point | null = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const s = x + y;
      const d = x - y;
      if (s < minS) {
        minS = s;
        tl = { x, y };
      }
      if (s > maxS) {
        maxS = s;
        br = { x, y };
      }
      if (d > maxD) {
        maxD = d;
        tr = { x, y };
      }
      if (d < minD) {
        minD = d;
        bl = { x, y };
      }
    }
  }
  if (!tl || !tr || !br || !bl) return null;
  return [tl, tr, br, bl];
}

function houghQuad(edges: Uint8Array, width: number, height: number): Point[] | null {
  const lines = houghLines(edges, width, height);
  if (lines.length < 4) return null;
  const horiz: Line[] = [];
  const vert: Line[] = [];
  for (const l of lines) {
    const deg = ((l.theta * 180) / Math.PI) % 180;
    if (deg < 35 || deg > 145) vert.push(l);
    else if (deg > 55 && deg < 125) horiz.push(l);
  }
  if (horiz.length < 2 || vert.length < 2) return null;
  const h = horiz.slice(0, 2);
  const v = vert.slice(0, 2);
  const pts: Point[] = [];
  for (const a of h) {
    for (const b of v) {
      const p = lineIntersect(a, b);
      if (!p) continue;
      if (p.x < -8 || p.y < -8 || p.x > width + 8 || p.y > height + 8) continue;
      pts.push({ x: clamp(p.x, 0, width - 1), y: clamp(p.y, 0, height - 1) });
    }
  }
  if (pts.length < 4) return null;
  return orderQuad(pts.slice(0, 4));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function findDocumentQuad(img: RasterImage): { quad: [Point, Point, Point, Point]; method: string } {
  const gray = toGray(img);
  const t = otsuThreshold(gray);
  const bin = new Uint8Array(gray.length);
  // document is usually darker than desk OR inverted — pick majority-background
  let dark = 0;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i]! < t) {
      bin[i] = 255;
      dark++;
    }
  }
  if (dark > gray.length * 0.55) {
    for (let i = 0; i < bin.length; i++) bin[i] = bin[i] ? 0 : 255;
  }
  const { mask } = largestComponent(bin, img.width, img.height);
  const fromMask = extremaQuad(mask, img.width, img.height);
  const edges = cannyLight(gray, img.width, img.height);
  const fromHough = houghQuad(edges, img.width, img.height);
  const pick = scoreQuad(fromHough, img) >= scoreQuad(fromMask, img) ? fromHough : fromMask;
  if (pick && pick.length === 4) {
    return { quad: orderQuad(pick), method: pick === fromHough ? 'hough' : 'extrema' };
  }
  return {
    quad: [
      { x: 0, y: 0 },
      { x: img.width - 1, y: 0 },
      { x: img.width - 1, y: img.height - 1 },
      { x: 0, y: img.height - 1 },
    ],
    method: 'full-frame',
  };
}

function scoreQuad(pts: Point[] | null, img: RasterImage): number {
  if (!pts || pts.length !== 4) return -1;
  const [tl, tr, br, bl] = orderQuad(pts);
  const w = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const h = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  if (w < img.width * 0.2 || h < img.height * 0.2) return 0;
  const area = Math.abs((tr.x - tl.x) * (br.y - tl.y) - (br.x - tl.x) * (tr.y - tl.y));
  return area;
}

export async function findDocumentQuadOpenCvFallback(img: RasterImage): Promise<[Point, Point, Point, Point] | null> {
  try {
    const cv = (globalThis as { cv?: { Mat?: unknown } }).cv;
    if (!cv) return null;
    void img;
    return null;
  } catch {
    return null;
  }
}
