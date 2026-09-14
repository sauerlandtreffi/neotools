import { clampByte, luma } from '../codec/pixels.js';

export interface AdjustOptions {
  brightness?: number; // -1..1
  contrast?: number; // -1..1
  saturation?: number; // -1..1
  warmth?: number; // -1..1
  gamma?: number; // 0.2..3
  sharpness?: number; // 0..2
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
}

function applySharp(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  if (amount <= 0) return;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const c0 = src[i + c] ?? 0;
        const lap =
          4 * c0 -
          (src[i - 4 + c] ?? 0) -
          (src[i + 4 + c] ?? 0) -
          (src[i - w * 4 + c] ?? 0) -
          (src[i + w * 4 + c] ?? 0);
        data[i + c] = clampByte(Math.round(c0 + amount * 0.35 * lap));
      }
    }
  }
}

export function adjust(data: Uint8ClampedArray, width: number, height: number, opts: AdjustOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const brightness = opts.brightness ?? 0;
  const contrast = opts.contrast ?? 0;
  const sat = opts.saturation ?? 0;
  const warmth = opts.warmth ?? 0;
  const gamma = opts.gamma ?? 1;
  const invGamma = gamma > 0 ? 1 / gamma : 1;
  for (let i = 0; i < out.length; i += 4) {
    let r = (out[i] ?? 0) / 255;
    let g = (out[i + 1] ?? 0) / 255;
    let b = (out[i + 2] ?? 0) / 255;
    r = Math.pow(Math.min(1, Math.max(0, r)), invGamma);
    g = Math.pow(Math.min(1, Math.max(0, g)), invGamma);
    b = Math.pow(Math.min(1, Math.max(0, b)), invGamma);
    r += brightness;
    g += brightness;
    b += brightness;
    r = (r - 0.5) * (1 + contrast) + 0.5;
    g = (g - 0.5) * (1 + contrast) + 0.5;
    b = (b - 0.5) * (1 + contrast) + 0.5;
    r += warmth * 0.12;
    b -= warmth * 0.12;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * (1 + sat);
    g = y + (g - y) * (1 + sat);
    b = y + (b - y) * (1 + sat);
    if (opts.grayscale) {
      const l = luma(r * 255, g * 255, b * 255) / 255;
      r = g = b = l;
    }
    if (opts.sepia) {
      const nr = 0.393 * r + 0.769 * g + 0.189 * b;
      const ng = 0.349 * r + 0.686 * g + 0.168 * b;
      const nb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = nr;
      g = ng;
      b = nb;
    }
    if (opts.invert) {
      r = 1 - r;
      g = 1 - g;
      b = 1 - b;
    }
    out[i] = clampByte(Math.round(r * 255));
    out[i + 1] = clampByte(Math.round(g * 255));
    out[i + 2] = clampByte(Math.round(b * 255));
  }
  applySharp(out, width, height, opts.sharpness ?? 0);
  return out;
}

export const ADJUST_PRESETS = {
  none: {},
  vivid: { saturation: 0.25, contrast: 0.1 },
  fade: { saturation: -0.25, contrast: -0.1, brightness: 0.05 },
  mono: { grayscale: true, contrast: 0.15 },
  sepia: { sepia: true, warmth: 0.2 },
  cool: { warmth: -0.35, saturation: 0.05 },
  warm: { warmth: 0.4, saturation: 0.08 },
  invert: { invert: true },
} as const satisfies Record<string, AdjustOptions>;

export type AdjustPresetId = keyof typeof ADJUST_PRESETS;
