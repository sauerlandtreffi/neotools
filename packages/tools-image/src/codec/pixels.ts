export function fillBackground(
  data: Uint8ClampedArray,
  bg: readonly [number, number, number] | readonly [number, number, number, number],
): Uint8ClampedArray {
  const r = bg[0] ?? 255;
  const g = bg[1] ?? 255;
  const b = bg[2] ?? 255;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const a = (out[i + 3] ?? 255) / 255;
    if (a >= 0.999) continue;
    out[i] = Math.round((out[i] ?? 0) * a + r * (1 - a));
    out[i + 1] = Math.round((out[i + 1] ?? 0) * a + g * (1 - a));
    out[i + 2] = Math.round((out[i + 2] ?? 0) * a + b * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

export function copyRgba(src: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(src);
}

export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '');
  if (s.length === 3) {
    return [parseInt(s[0]! + s[0], 16), parseInt(s[1]! + s[1], 16), parseInt(s[2]! + s[2], 16)];
  }
  if (s.length >= 6) {
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  return [0, 0, 0];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(Math.round(n)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function meanAbsDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / n;
}
