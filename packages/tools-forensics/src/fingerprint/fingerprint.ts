import type { Platform } from '@neotools/engine';
import { hashBytes } from '../util/hashes.js';
import { identifyBytes } from '../identify/identify.js';
import { inspectPdfHigh } from '../parsers/pdf-high.js';
import { decodePngRgba } from '../parsers/png.js';

export interface PerceptualHashes {
  aHash?: string;
  dHash?: string;
  pHash?: string;
  skipped?: string;
}

export interface Fingerprint {
  file: string;
  sha256: string;
  size: number;
  identifyId?: string;
  fonts: string[];
  producer?: string;
  creator?: string;
  textSimHash?: string;
  perceptual: PerceptualHashes;
}

export interface FingerprintCompare {
  a: Fingerprint;
  b: Fingerprint;
  byteEqual: boolean;
  sha256Equal: boolean;
  textSimilarity?: number;
  perceptualHamming?: { dHash?: number; pHash?: number; aHash?: number };
  fontOverlap: number;
  producerMatch: boolean;
}

function simhash64(text: string): bigint {
  const tokens = text.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  const acc = new Array<number>(64).fill(0);
  for (const tok of tokens) {
    let h = 1469598103934665603n;
    for (let i = 0; i < tok.length; i++) {
      h ^= BigInt(tok.charCodeAt(i));
      h *= 1099511628211n;
    }
    for (let b = 0; b < 64; b++) {
      acc[b]! += (h >> BigInt(b)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let b = 0; b < 64; b++) if ((acc[b] ?? 0) >= 0) out |= 1n << BigInt(b);
  return out;
}

function hex64(n: bigint): string {
  return n.toString(16).padStart(16, '0');
}

function hamming64(a: string, b: string): number {
  const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1n;
    c += 1;
  }
  return c;
}

function resizeGray(data: Uint8ClampedArray, w: number, h: number, tw: number, th: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / tw));
      const sy = Math.min(h - 1, Math.floor((y * h) / th));
      const i = (sy * w + sx) * 4;
      out.push((data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000);
    }
  }
  return out;
}

function bitsToHex(bits: number[]): string {
  let n = 0n;
  for (let i = 0; i < bits.length; i++) if (bits[i]) n |= 1n << BigInt(i);
  const nibbles = Math.ceil(bits.length / 4);
  return n.toString(16).padStart(nibbles, '0');
}

export function hashesFromRgba(data: Uint8ClampedArray, w: number, h: number): PerceptualHashes {
  const gray8 = resizeGray(data, w, h, 8, 8);
  const avg = gray8.reduce((a, b) => a + b, 0) / gray8.length;
  const aHash = bitsToHex(gray8.map((v) => (v >= avg ? 1 : 0)));

  const gray9 = resizeGray(data, w, h, 9, 8);
  const dBits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      dBits.push(gray9[y * 9 + x]! < gray9[y * 9 + x + 1]! ? 1 : 0);
    }
  }
  const dHash = bitsToHex(dBits);

  const g32 = resizeGray(data, w, h, 32, 32);
  const dct: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          s +=
            g32[y * 32 + x]! *
            Math.cos(((2 * x + 1) * u * Math.PI) / 64) *
            Math.cos(((2 * y + 1) * v * Math.PI) / 64);
        }
      }
      dct.push(s);
    }
  }
  const ac = dct.slice(1);
  const med = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)] ?? 0;
  const pHash = bitsToHex(dct.map((v, i) => (i === 0 ? 0 : v > med ? 1 : 0)));
  return { aHash, dHash, pHash };
}

export async function fingerprintBytes(
  bytes: Uint8Array,
  name: string,
  platform?: Platform,
  mime?: string,
): Promise<Fingerprint> {
  const identify = identifyBytes(bytes, name, mime);
  const sha256 = hashBytes('sha256', bytes);
  const fonts: string[] = [];
  let producer: string | undefined;
  let creator: string | undefined;
  let textSimHash: string | undefined;
  const perceptual: PerceptualHashes = {};

  if (identify.primary?.id === 'pdf') {
    const high = await inspectPdfHigh(bytes);
    if (high) {
      fonts.push(...high.fonts);
      producer = high.producer;
      creator = high.creator;
      const text = high.content.runs.map((r) => r.text).join(' ');
      if (text.trim()) textSimHash = hex64(simhash64(text));
    }
    if (!platform?.capabilities.canvas) {
      perceptual.skipped = 'no-canvas';
    } else {
      perceptual.skipped = 'no-pdf-rasterizer';
    }
  } else if (identify.encoding.likelyText) {
    textSimHash = hex64(simhash64(new TextDecoder('utf-8', { fatal: false }).decode(bytes)));
  }

  if (identify.primary?.id === 'png') {
    if (!platform?.capabilities.canvas) {
      perceptual.skipped = 'no-canvas';
    } else {
      const img = decodePngRgba(bytes);
      if (img) Object.assign(perceptual, hashesFromRgba(img.data, img.width, img.height));
      else perceptual.skipped = 'png-decode-failed';
    }
  } else if (identify.primary?.group === 'image' && identify.primary.id !== 'png') {
    perceptual.skipped = platform?.capabilities.canvas ? 'no-image-decoder' : 'no-canvas';
  }

  return {
    file: name,
    sha256,
    size: bytes.length,
    identifyId: identify.primary?.id,
    fonts,
    producer,
    creator,
    textSimHash,
    perceptual,
  };
}

export function compareFingerprints(a: Fingerprint, b: Fingerprint): FingerprintCompare {
  const fontOverlap =
    a.fonts.length || b.fonts.length
      ? a.fonts.filter((f) => b.fonts.includes(f)).length / new Set([...a.fonts, ...b.fonts]).size
      : 1;
  let textSimilarity: number | undefined;
  if (a.textSimHash && b.textSimHash) {
    textSimilarity = 1 - hamming64(a.textSimHash, b.textSimHash) / 64;
  }
  const perceptualHamming: FingerprintCompare['perceptualHamming'] = {};
  if (a.perceptual.dHash && b.perceptual.dHash) perceptualHamming.dHash = hamming64(a.perceptual.dHash, b.perceptual.dHash);
  if (a.perceptual.pHash && b.perceptual.pHash) perceptualHamming.pHash = hamming64(a.perceptual.pHash, b.perceptual.pHash);
  if (a.perceptual.aHash && b.perceptual.aHash) perceptualHamming.aHash = hamming64(a.perceptual.aHash, b.perceptual.aHash);

  return {
    a,
    b,
    byteEqual: a.sha256 === b.sha256 && a.size === b.size,
    sha256Equal: a.sha256 === b.sha256,
    textSimilarity,
    perceptualHamming,
    fontOverlap,
    producerMatch: Boolean(a.producer && a.producer === b.producer),
  };
}

export function fingerprintMarkdown(
  fps: Fingerprint[],
  locale: 'de' | 'en',
  compare?: FingerprintCompare,
): string {
  const lines = [locale === 'de' ? '# Dokument-Fingerabdruck\n' : '# Document fingerprint\n'];
  for (const f of fps) {
    lines.push(`## ${f.file}\n`);
    lines.push(`- **SHA-256:** \`${f.sha256}\``);
    lines.push(`- **Format:** ${f.identifyId ?? '?'}`);
    if (f.textSimHash) lines.push(`- **SimHash:** \`${f.textSimHash}\``);
    if (f.fonts.length) lines.push(`- **Fonts:** ${f.fonts.join(', ')}`);
    if (f.producer) lines.push(`- **Producer:** ${f.producer}`);
    if (f.perceptual.skipped) {
      lines.push(
        locale === 'de'
          ? `- **pHash/dHash:** übersprungen (${f.perceptual.skipped})`
          : `- **pHash/dHash:** skipped (${f.perceptual.skipped})`,
      );
    } else if (f.perceptual.dHash) {
      lines.push(`- **dHash:** \`${f.perceptual.dHash}\``);
      lines.push(`- **pHash:** \`${f.perceptual.pHash}\``);
    }
    lines.push('');
  }
  if (compare) {
    lines.push(locale === 'de' ? '## Vergleich\n' : '## Compare\n');
    lines.push(`- SHA-256 equal: ${compare.sha256Equal}`);
    if (compare.textSimilarity !== undefined) lines.push(`- text similarity: ${compare.textSimilarity.toFixed(3)}`);
    lines.push(`- font overlap: ${compare.fontOverlap.toFixed(3)}`);
  }
  return lines.join('\n');
}
