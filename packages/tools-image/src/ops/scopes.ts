import { luma } from '../codec/pixels.js';

export type ScopeKind = 'histogram' | 'waveform' | 'vectorscope' | 'zebras' | 'falsecolor';

export function renderScopes(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  kinds: readonly ScopeKind[],
  zebra = 0.92,
): { data: Uint8ClampedArray; width: number; height: number; kind: ScopeKind }[] {
  return kinds.map((kind) => {
    if (kind === 'histogram') return { ...drawHistogram(data, width, height), kind };
    if (kind === 'waveform') return { ...drawWaveform(data, width, height), kind };
    if (kind === 'vectorscope') return { ...drawVectorscope(data, width, height), kind };
    if (kind === 'zebras') return { data: drawZebras(data, width, height, zebra), width, height, kind };
    return { data: drawFalseColor(data, width, height), width, height, kind };
  });
}

function blank(w: number, h: number, bg = 16): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = bg;
    d[i + 1] = bg;
    d[i + 2] = bg;
    d[i + 3] = 255;
  }
  return d;
}

function drawHistogram(data: Uint8ClampedArray, _w: number, _h: number) {
  const bins = 256;
  const hr = new Uint32Array(bins);
  const hg = new Uint32Array(bins);
  const hb = new Uint32Array(bins);
  const hy = new Uint32Array(bins);
  for (let i = 0; i < data.length; i += 4) {
    hr[data[i] ?? 0]!++;
    hg[data[i + 1] ?? 0]!++;
    hb[data[i + 2] ?? 0]!++;
    hy[Math.round(luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0))]!++;
  }
  const max = Math.max(1, ...hr, ...hg, ...hb, ...hy);
  const W = 512;
  const H = 256;
  const out = blank(W, H);
  const paint = (hist: Uint32Array, r: number, g: number, b: number) => {
    for (let x = 0; x < W; x++) {
      const v = hist[Math.floor((x / W) * bins)] ?? 0;
      const hh = Math.round((v / max) * (H - 2));
      for (let y = H - 1; y > H - 1 - hh; y--) {
        const i = (y * W + x) * 4;
        out[i] = Math.min(255, (out[i] ?? 0) + r);
        out[i + 1] = Math.min(255, (out[i + 1] ?? 0) + g);
        out[i + 2] = Math.min(255, (out[i + 2] ?? 0) + b);
      }
    }
  };
  paint(hy, 80, 80, 80);
  paint(hr, 180, 0, 0);
  paint(hg, 0, 160, 0);
  paint(hb, 0, 0, 180);
  return { data: out, width: W, height: H };
}

function drawWaveform(data: Uint8ClampedArray, width: number, height: number) {
  const W = Math.min(640, width);
  const H = 256;
  const out = blank(W, H);
  for (let x = 0; x < W; x++) {
    const sx = Math.floor((x / W) * width);
    for (let y = 0; y < height; y++) {
      const i = (y * width + sx) * 4;
      const yy = Math.round(luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0));
      const oy = H - 1 - Math.min(H - 1, yy);
      const o = (oy * W + x) * 4;
      out[o] = Math.min(255, (out[o] ?? 0) + 12);
      out[o + 1] = Math.min(255, (out[o + 1] ?? 0) + 18);
      out[o + 2] = Math.min(255, (out[o + 2] ?? 0) + 10);
    }
  }
  return { data: out, width: W, height: H };
}

function drawVectorscope(data: Uint8ClampedArray, width: number, height: number) {
  const S = 256;
  const out = blank(S, S);
  const cx = S / 2;
  const cy = S / 2;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = (data[i] ?? 0) / 255;
      const g = (data[i + 1] ?? 0) / 255;
      const b = (data[i + 2] ?? 0) / 255;
      const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
      const px = Math.round(cx + cr * (S - 4));
      const py = Math.round(cy - cb * (S - 4));
      if (px < 0 || py < 0 || px >= S || py >= S) continue;
      const o = (py * S + px) * 4;
      out[o] = Math.min(255, (out[o] ?? 0) + 20);
      out[o + 1] = Math.min(255, (out[o + 1] ?? 0) + 20);
      out[o + 2] = Math.min(255, (out[o + 2] ?? 0) + 20);
    }
  }
  return { data: out, width: S, height: S };
}

function drawZebras(data: Uint8ClampedArray, width: number, height: number, thr: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  for (let i = 0, p = 0; i < out.length; i += 4, p++) {
    const y = luma(out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0) / 255;
    if (y >= thr && ((p + Math.floor(p / width)) & 1)) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
    }
  }
  return out;
}

function drawFalseColor(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) / 255;
    let r = 0;
    let g = 0;
    let b = 0;
    if (y < 0.1) {
      b = 180;
    } else if (y < 0.3) {
      b = 200;
      g = 80;
    } else if (y < 0.5) {
      g = 200;
    } else if (y < 0.7) {
      r = 200;
      g = 180;
    } else if (y < 0.9) {
      r = 220;
      g = 80;
    } else {
      r = 255;
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
  void width;
  void height;
  return out;
}
