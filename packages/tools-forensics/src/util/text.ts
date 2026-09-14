import { eqAt } from './bytes.js';

export type TextEncoding =
  | 'utf-8'
  | 'utf-8-bom'
  | 'utf-16le'
  | 'utf-16be'
  | 'utf-32le'
  | 'utf-32be'
  | 'ascii'
  | 'windows-1252'
  | 'binary'
  | 'unknown';

export interface EncodingInfo {
  encoding: TextEncoding;
  bom: boolean;
  confidence: number;
  printableRatio: number;
  likelyText: boolean;
}

export function skipBom(bytes: Uint8Array): { encoding?: TextEncoding; rest: Uint8Array } {
  if (eqAt(bytes, 0, [0xef, 0xbb, 0xbf])) return { encoding: 'utf-8-bom', rest: bytes.subarray(3) };
  if (eqAt(bytes, 0, [0xff, 0xfe, 0x00, 0x00])) return { encoding: 'utf-32le', rest: bytes.subarray(4) };
  if (eqAt(bytes, 0, [0x00, 0x00, 0xfe, 0xff])) return { encoding: 'utf-32be', rest: bytes.subarray(4) };
  if (eqAt(bytes, 0, [0xff, 0xfe])) return { encoding: 'utf-16le', rest: bytes.subarray(2) };
  if (eqAt(bytes, 0, [0xfe, 0xff])) return { encoding: 'utf-16be', rest: bytes.subarray(2) };
  return { rest: bytes };
}

function utf8ValidRatio(bytes: Uint8Array, sample: number): { ok: number; high: number } {
  const n = Math.min(bytes.length, sample);
  let i = 0;
  let ok = 0;
  let high = 0;
  while (i < n) {
    const b = bytes[i]!;
    if (b < 0x80) {
      ok += 1;
      i += 1;
      continue;
    }
    high += 1;
    let need = 0;
    if ((b & 0xe0) === 0xc0) need = 1;
    else if ((b & 0xf0) === 0xe0) need = 2;
    else if ((b & 0xf8) === 0xf0) need = 3;
    else return { ok: 0, high };
    if (i + need >= n) break;
    let good = true;
    for (let k = 1; k <= need; k++) {
      if ((bytes[i + k]! & 0xc0) !== 0x80) {
        good = false;
        break;
      }
    }
    if (!good) return { ok: 0, high };
    ok += 1 + need;
    i += 1 + need;
  }
  return { ok, high };
}

export function detectEncoding(bytes: Uint8Array): EncodingInfo {
  const bom = skipBom(bytes);
  if (bom.encoding === 'utf-8-bom') {
    return { encoding: 'utf-8-bom', bom: true, confidence: 1, printableRatio: 1, likelyText: true };
  }
  if (bom.encoding === 'utf-16le' || bom.encoding === 'utf-16be' || bom.encoding === 'utf-32le' || bom.encoding === 'utf-32be') {
    return { encoding: bom.encoding, bom: true, confidence: 1, printableRatio: 1, likelyText: true };
  }

  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (!sample.length) {
    return { encoding: 'unknown', bom: false, confidence: 0, printableRatio: 0, likelyText: false };
  }

  let nul = 0;
  let printable = 0;
  let ctrl = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]!;
    if (b === 0) nul += 1;
    else if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable += 1;
    else if (b < 32) ctrl += 1;
  }
  const printableRatio = printable / sample.length;
  if (nul / sample.length > 0.05) {
    return { encoding: 'binary', bom: false, confidence: 0.9, printableRatio, likelyText: false };
  }

  const utf = utf8ValidRatio(sample, sample.length);
  if (utf.ok / sample.length > 0.98) {
    const enc: TextEncoding = utf.high === 0 && ctrl < 4 ? 'ascii' : 'utf-8';
    return {
      encoding: enc,
      bom: false,
      confidence: 0.85 + Math.min(0.14, printableRatio / 2),
      printableRatio,
      likelyText: printableRatio > 0.7,
    };
  }

  if (printableRatio > 0.85) {
    return {
      encoding: 'windows-1252',
      bom: false,
      confidence: 0.55,
      printableRatio,
      likelyText: true,
    };
  }

  return {
    encoding: 'binary',
    bom: false,
    confidence: 0.7,
    printableRatio,
    likelyText: false,
  };
}

export function looksLikeHtml(bytes: Uint8Array): boolean {
  const { rest } = skipBom(bytes);
  let i = 0;
  while (i < rest.length && (rest[i] === 0x20 || rest[i] === 0x09 || rest[i] === 0x0a || rest[i] === 0x0d)) i += 1;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(rest.subarray(i, i + 128)).toLowerCase();
  return (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<head') ||
    head.startsWith('<body') ||
    head.startsWith('<!--')
  );
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const { rest } = skipBom(bytes);
  const head = new TextDecoder('utf-8', { fatal: false }).decode(rest.subarray(0, 512)).toLowerCase();
  return /<svg[\s>]/.test(head);
}

export function looksLikeXml(bytes: Uint8Array): boolean {
  const { rest } = skipBom(bytes);
  let i = 0;
  while (i < rest.length && (rest[i] === 0x20 || rest[i] === 0x09 || rest[i] === 0x0a || rest[i] === 0x0d)) i += 1;
  return rest[i] === 0x3c && rest[i + 1] === 0x3f && rest[i + 2] === 0x78;
}

export function looksLikeJson(bytes: Uint8Array): boolean {
  const { rest } = skipBom(bytes);
  let i = 0;
  while (i < rest.length && (rest[i] === 0x20 || rest[i] === 0x09 || rest[i] === 0x0a || rest[i] === 0x0d)) i += 1;
  const c = rest[i];
  return c === 0x7b || c === 0x5b;
}

export function containsScript(bytes: Uint8Array): boolean {
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 64_000)));
  return /<script[\s>]/i.test(sample) || /\bon\w+\s*=/i.test(sample) || /javascript:/i.test(sample);
}

export function shebang(bytes: Uint8Array): string | undefined {
  if (bytes[0] !== 0x23 || bytes[1] !== 0x21) return undefined;
  let end = 2;
  while (end < bytes.length && bytes[end] !== 0x0a && end < 256) end += 1;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, end)).trim();
}
