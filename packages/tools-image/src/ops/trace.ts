/**
 * Independent MIT bitmap→SVG contour tracer (not a Potrace source port; Potrace is GPLv2).
 * Edge walk + Ramer–Douglas–Peucker + optional hatch fills for plotters.
 */

import { luma } from '../codec/pixels.js';

export interface TraceOptions {
  threshold?: number;
  invert?: boolean;
  simplify?: number;
  hatch?: boolean;
  hatchGap?: number;
}

function binary(data: Uint8ClampedArray, w: number, h: number, threshold: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    const ink = invert ? y > threshold : y < threshold;
    out[p] = ink ? 1 : 0;
  }
  return out;
}

type Pt = { x: number; y: number };

function walkContours(mask: Uint8Array, w: number, h: number): Pt[][] {
  const seen = new Uint8Array(w * h);
  const contours: Pt[][] = [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || seen[i]) continue;
      if (inside(x - 1, y)) continue;
      const path: Pt[] = [];
      let cx = x;
      let cy = y;
      let dir = 0;
      const dirs = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const;
      for (let step = 0; step < w * h; step++) {
        path.push({ x: cx, y: cy });
        seen[cy * w + cx] = 1;
        let found = false;
        for (let k = 0; k < 4; k++) {
          const nd = (dir + 3 + k) % 4;
          const nx = cx + dirs[nd]![0];
          const ny = cy + dirs[nd]![1];
          if (inside(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = nd;
            found = true;
            break;
          }
        }
        if (!found || (cx === x && cy === y && path.length > 3)) break;
      }
      if (path.length >= 4) contours.push(path);
    }
  }
  return contours;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdp(points: Pt[], eps: number): Pt[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let idx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i]!, first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function pathD(points: Pt[]): string {
  if (!points.length) return '';
  const [p0, ...rest] = points;
  return `M${p0!.x} ${p0!.y}` + rest.map((p) => `L${p.x} ${p.y}`).join('') + 'Z';
}

export function imageToSvg(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: TraceOptions = {},
): string {
  const threshold = opts.threshold ?? 128;
  const invert = opts.invert ?? false;
  const simplify = opts.simplify ?? 1.4;
  const mask = binary(data, width, height, threshold, invert);
  const contours = walkContours(mask, width, height).map((c) => rdp(c, simplify));
  const fills = contours.map((c) => `<path d="${pathD(c)}" fill="#000" fill-rule="evenodd"/>`).join('');
  const hatch = opts.hatch ? hatchSvg(mask, width, height, opts.hatchGap ?? 6) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fills}${hatch}</svg>`;
}

export function hatchSvg(mask: Uint8Array | Uint8ClampedArray, width: number, height: number, gap = 6): string {
  const bits = mask instanceof Uint8Array && mask.length === width * height ? mask : binary(mask as Uint8ClampedArray, width, height, 128, false);
  const lines: string[] = [];
  for (let y = 0; y < height; y += gap) {
    let run: number | null = null;
    for (let x = 0; x <= width; x++) {
      const on = x < width && bits[y * width + x] === 1;
      if (on && run == null) run = x;
      if (!on && run != null) {
        lines.push(`<line x1="${run}" y1="${y}" x2="${x}" y2="${y}" stroke="#000" stroke-width="1"/>`);
        run = null;
      }
    }
  }
  return `<g class="hatch">${lines.join('')}</g>`;
}
