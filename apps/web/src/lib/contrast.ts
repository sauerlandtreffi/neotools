/** WCAG 2.x relative luminance / contrast helpers (BITV 2.0 / WCAG 2.2 AA). */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA: 4.5 for normal text, 3 for large text and UI components. */
export function meetsAA(fg: string, bg: string, kind: 'text' | 'large' | 'ui' = 'text'): boolean {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return false;
  return ratio >= (kind === 'text' ? 4.5 : 3);
}

/** Return `candidate` when it has enough contrast against `bg`, otherwise `fallback`. */
export function ensureContrast(candidate: string, bg: string, fallback: string, min = 3): string {
  const ratio = contrastRatio(candidate, bg);
  return ratio !== null && ratio >= min ? candidate : fallback;
}
