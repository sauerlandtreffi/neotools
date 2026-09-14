import { loadFace } from './fonts.js';
import { renderDocToPdf } from './pdf-render.js';

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

export interface SubsetResult {
  bytes: Uint8Array;
  format: FontFormat;
  glyphs: number;
  warnings: string[];
}

function sniffFormat(bytes: Uint8Array, name?: string): FontFormat {
  const n = (name ?? '').toLowerCase();
  if (n.endsWith('.woff2')) return 'woff2';
  if (n.endsWith('.woff')) return 'woff';
  if (n.endsWith('.otf')) return 'otf';
  if (n.endsWith('.ttf')) return 'ttf';
  if (bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32) return 'woff2';
  if (bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46) return 'woff';
  if (bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f) return 'otf';
  return 'ttf';
}

function codepointsFrom(text: string, unicodeRange?: string): number[] {
  const set = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) set.add(cp);
  }
  if (unicodeRange) {
    for (const part of unicodeRange.split(',')) {
      const m = /U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?/.exec(part.trim());
      if (!m) continue;
      const a = parseInt(m[1]!, 16);
      const b = m[2] ? parseInt(m[2], 16) : a;
      for (let i = a; i <= b && i - a < 4000; i++) set.add(i);
    }
  }
  set.add(0x20);
  return [...set].sort((a, b) => a - b);
}

async function viaFonteditor(bytes: Uint8Array, cps: number[], format: FontFormat): Promise<Uint8Array | null> {
  try {
    const mod = await import('fonteditor-core');
    const Font = mod.Font;
    if (format === 'woff2' && mod.woff2?.init) {
      try {
        await mod.woff2.init();
      } catch {
        // optional
      }
    }
    const font = Font.create(bytes, { type: format, subset: cps, hinting: true });
    const out = font.write({ type: format === 'otf' ? 'otf' : format === 'woff' ? 'woff' : format === 'woff2' ? 'woff2' : 'ttf', toBuffer: true });
    if (out instanceof Uint8Array) return out;
    if (out instanceof ArrayBuffer) return new Uint8Array(out);
    return null;
  } catch {
    return null;
  }
}

async function viaWawoff2(bytes: Uint8Array, innerFormat: 'ttf' | 'otf', cps: number[], toWoff2: boolean): Promise<Uint8Array | null> {
  try {
    const wawoff2 = await import('wawoff2');
    let raw = bytes;
    if (sniffFormat(bytes) === 'woff2') raw = new Uint8Array(await wawoff2.decompress(bytes));
    const subset = await viaFonteditor(raw, cps, innerFormat);
    if (!subset) return null;
    if (!toWoff2) return subset;
    return new Uint8Array(await wawoff2.compress(subset));
  } catch {
    return null;
  }
}

export async function subsetFont(
  bytes: Uint8Array,
  text: string,
  options: { format?: FontFormat; name?: string; unicodeRange?: string } = {},
): Promise<SubsetResult> {
  const warnings: string[] = [];
  const format = options.format ?? sniffFormat(bytes, options.name);
  const cps = codepointsFrom(text, options.unicodeRange);
  let out = await viaFonteditor(bytes, cps, format);
  if (!out && (format === 'woff2' || sniffFormat(bytes) === 'woff2')) {
    out = await viaWawoff2(bytes, 'ttf', cps, format === 'woff2');
  }
  if (!out) {
    warnings.push('Subset nicht möglich, Originalschrift zurückgegeben.');
    out = bytes;
  }
  if (out.byteLength > bytes.byteLength) {
    warnings.push('Subset größer als Original, Original behalten.');
    out = bytes;
  }
  const glyphs = await countGlyphs(out, cps);
  return { bytes: out, format, glyphs, warnings };
}

async function countGlyphs(bytes: Uint8Array, cps: number[]): Promise<number> {
  try {
    const ot = await import('opentype.js');
    const parse = ot.parse ?? ot.default?.parse;
    if (!parse) return cps.length;
    const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    let n = 0;
    for (const cp of cps) {
      const g = font.charToGlyph?.(String.fromCodePoint(cp));
      if (g && g.unicode !== undefined) n += 1;
    }
    return n || cps.length;
  } catch {
    return cps.length;
  }
}

export async function specimenPdf(text: string, fontBytes?: Uint8Array): Promise<Uint8Array> {
  const sample = text.slice(0, 400) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';
  const result = await renderDocToPdf(
    {
      title: 'Font specimen',
      blocks: [
        { type: 'heading', level: 1, runs: [{ text: 'Specimen', bold: true }] },
        { type: 'paragraph', runs: [{ text: sample }] },
        { type: 'code', text: sample, language: 'text' },
      ],
    },
    { theme: 'default' },
  );
  void fontBytes;
  return result.bytes;
}

export async function defaultOfficeFontBytes(): Promise<Uint8Array | null> {
  const face = await loadFace('sans', 'regular');
  return face?.bytes ?? null;
}
