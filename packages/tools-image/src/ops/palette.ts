import { luma, rgbToHex } from '../codec/pixels.js';

export interface PaletteColor {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
  count: number;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h / 6) * 360, s, l];
}

function sample(data: Uint8ClampedArray, max = 4000): Array<[number, number, number]> {
  const pixels = data.length / 4;
  const step = Math.max(1, Math.floor(pixels / max));
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < pixels; i += step) {
    const o = i * 4;
    if ((data[o + 3] ?? 255) < 16) continue;
    out.push([data[o]!, data[o + 1]!, data[o + 2]!]);
  }
  return out;
}

function medianCut(pixels: Array<[number, number, number]>, k: number): Array<[number, number, number]> {
  if (!pixels.length) return [];
  type Bucket = { pts: Array<[number, number, number]> };
  const buckets: Bucket[] = [{ pts: pixels }];
  while (buckets.length < k) {
    buckets.sort((a, b) => {
      const range = (pts: Array<[number, number, number]>, c: number) => {
        let mn = 255;
        let mx = 0;
        for (const p of pts) {
          mn = Math.min(mn, p[c]!);
          mx = Math.max(mx, p[c]!);
        }
        return mx - mn;
      };
      const score = (bkt: Bucket) => Math.max(range(bkt.pts, 0), range(bkt.pts, 1), range(bkt.pts, 2)) * bkt.pts.length;
      return score(b) - score(a);
    });
    const big = buckets.shift();
    if (!big || big.pts.length < 2) {
      if (big) buckets.push(big);
      break;
    }
    let ch = 0;
    let best = -1;
    for (let c = 0; c < 3; c++) {
      let mn = 255;
      let mx = 0;
      for (const p of big.pts) {
        mn = Math.min(mn, p[c]!);
        mx = Math.max(mx, p[c]!);
      }
      if (mx - mn > best) {
        best = mx - mn;
        ch = c;
      }
    }
    big.pts.sort((a, b) => a[ch]! - b[ch]!);
    const mid = Math.floor(big.pts.length / 2);
    buckets.push({ pts: big.pts.slice(0, mid) }, { pts: big.pts.slice(mid) });
  }
  return buckets.map((b) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    for (const p of b.pts) {
      r += p[0]!;
      g += p[1]!;
      bl += p[2]!;
    }
    const n = b.pts.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

function kmeans(pixels: Array<[number, number, number]>, k: number, iters = 8): Array<[number, number, number]> {
  if (!pixels.length) return [];
  const centers: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(pixels.length / k));
  for (let i = 0; i < k; i++) centers.push([...(pixels[Math.min(pixels.length - 1, i * step)]!)] as [number, number, number]);
  const assign = new Int32Array(pixels.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bd = Infinity;
      const p = pixels[i]!;
      for (let c = 0; c < centers.length; c++) {
        const d =
          (p[0]! - centers[c]![0]!) ** 2 + (p[1]! - centers[c]![1]!) ** 2 + (p[2]! - centers[c]![2]!) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sums = centers.map(() => [0, 0, 0, 0] as [number, number, number, number]);
    for (let i = 0; i < pixels.length; i++) {
      const c = assign[i]!;
      const p = pixels[i]!;
      sums[c]![0] += p[0]!;
      sums[c]![1] += p[1]!;
      sums[c]![2] += p[2]!;
      sums[c]![3] += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      const n = sums[c]![3] || 1;
      centers[c] = [Math.round(sums[c]![0] / n), Math.round(sums[c]![1] / n), Math.round(sums[c]![2] / n)];
    }
  }
  return centers;
}

export function extractPalette(
  data: Uint8ClampedArray,
  method: 'kmeans' | 'median-cut' = 'kmeans',
  count = 6,
): PaletteColor[] {
  const pts = sample(data);
  const cols = method === 'median-cut' ? medianCut(pts, count) : kmeans(pts, count);
  return cols.map((rgb) => {
    let n = 0;
    for (const p of pts) {
      const d = (p[0]! - rgb[0]) ** 2 + (p[1]! - rgb[1]) ** 2 + (p[2]! - rgb[2]) ** 2;
      if (d < 40 * 40) n += 1;
    }
    return { hex: rgbToHex(rgb[0], rgb[1], rgb[2]), rgb, hsl: rgbToHsl(rgb[0], rgb[1], rgb[2]), count: n };
  });
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const L = (c: [number, number, number]) => {
    const lin = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  };
  const l1 = L(a);
  const l2 = L(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagPairs(colors: PaletteColor[]): Array<{ a: string; b: string; ratio: number; aa: boolean; aaa: boolean }> {
  const out: Array<{ a: string; b: string; ratio: number; aa: boolean; aaa: boolean }> = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const ratio = contrastRatio(colors[i]!.rgb, colors[j]!.rgb);
      out.push({
        a: colors[i]!.hex,
        b: colors[j]!.hex,
        ratio: Math.round(ratio * 100) / 100,
        aa: ratio >= 4.5,
        aaa: ratio >= 7,
      });
    }
  }
  return out.sort((x, y) => y.ratio - x.ratio);
}

export function cssSnippet(colors: PaletteColor[]): string {
  const vars = colors.map((c, i) => `  --brand-${i + 1}: ${c.hex};`).join('\n');
  return `:root {\n${vars}\n}\n`;
}

export function tailwindSnippet(colors: PaletteColor[]): string {
  const entries = colors.map((c, i) => `      ${i + 1}: '${c.hex}'`).join(',\n');
  return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        brand: {\n${entries}\n        },\n      },\n    },\n  },\n};\n`;
}

void luma;
