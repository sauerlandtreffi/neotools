import type { Localized, NeoFile } from '@neotools/engine';
import { detectEncoding, type EncodingInfo } from '../util/text.js';
import { extensionOf } from '../util/bytes.js';
import { detectAt, EXT_MIME, FORMAT_CATALOG, type FormatHit } from './signatures.js';
import { findEocd } from '../parsers/zip.js';
import { findBytes } from '../util/bytes.js';

export interface Identification {
  name: string;
  size: number;
  extension: string;
  claimedMime: string;
  extensionMime?: string;
  primary?: FormatHit;
  additional: FormatHit[];
  encoding: EncodingInfo;
  extensionMatch: boolean;
  mimeMatch: boolean;
  mismatches: string[];
  polyglot: boolean;
}

const JPEG_EOI = [0xff, 0xd9] as const;
const PNG_IEND = [0x49, 0x45, 0x4e, 0x44] as const;
const PDF_EOF = [0x25, 0x25, 0x45, 0x4f, 0x46] as const;

function trailerOffsets(bytes: Uint8Array, primary?: FormatHit): number[] {
  const offs: number[] = [];
  if (!primary) return offs;
  if (primary.id === 'jpeg') {
    const eoi = findLast(bytes, JPEG_EOI);
    if (eoi >= 0 && eoi + 2 < bytes.length) offs.push(eoi + 2);
  } else if (primary.id === 'png') {
    const iend = findLast(bytes, PNG_IEND);
    if (iend >= 0 && iend + 8 < bytes.length) offs.push(iend + 8);
  } else if (primary.id === 'pdf') {
    const eof = findLast(bytes, PDF_EOF);
    if (eof >= 0) {
      let end = eof + 5;
      while (end < bytes.length && (bytes[end] === 0x0d || bytes[end] === 0x0a || bytes[end] === 0x20)) end += 1;
      if (end < bytes.length) offs.push(end);
    }
  } else if (
    primary.group === 'archive' ||
    primary.id === 'docx' ||
    primary.id === 'xlsx' ||
    primary.id === 'pptx' ||
    primary.id === 'odt' ||
    primary.id === 'ods' ||
    primary.id === 'odp' ||
    primary.id === 'epub' ||
    primary.id === 'jar' ||
    primary.id === 'apk' ||
    primary.id === 'ooxml'
  ) {
    const eocd = findEocd(bytes);
    if (eocd >= 0) {
      const commentLen = bytes[eocd + 20]! | (bytes[eocd + 21]! << 8);
      const end = eocd + 22 + commentLen;
      if (end < bytes.length) offs.push(end);
    }
  }
  return offs;
}

function findLast(haystack: Uint8Array, needle: readonly number[]): number {
  const n = needle.length;
  outer: for (let i = haystack.length - n; i >= 0; i--) {
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function scanEmbedded(bytes: Uint8Array, primary?: FormatHit): FormatHit[] {
  const extra: FormatHit[] = [];
  const seen = new Set<string>();
  const add = (h?: FormatHit) => {
    if (!h) return;
    const key = `${h.id}@${h.offset}`;
    if (seen.has(key)) return;
    if (primary && h.id === primary.id && h.offset === primary.offset) return;
    seen.add(key);
    extra.push(h);
  };

  for (const off of trailerOffsets(bytes, primary)) {
    for (const h of detectAt(bytes, off)) add({ ...h, note: h.note ? `${h.note}; after-EOF` : 'after-EOF' });
  }

  const needles: Array<{ sig: readonly number[]; id: string }> = [
    { sig: [0x50, 0x4b, 0x03, 0x04], id: 'zip' },
    { sig: [0x25, 0x50, 0x44, 0x46, 0x2d], id: 'pdf' },
    { sig: [0xff, 0xd8, 0xff], id: 'jpeg' },
    { sig: [0x89, 0x50, 0x4e, 0x47], id: 'png' },
    { sig: [0x1a, 0x45, 0xdf, 0xa3], id: 'matroska' },
  ];
  for (const n of needles) {
    if (primary?.id === n.id) continue;
    const pos = findBytes(bytes, n.sig, primary ? 8 : 1, Math.min(bytes.length, 1_000_000));
    if (pos > 0) {
      for (const h of detectAt(bytes, pos)) add({ ...h, note: h.note ? `${h.note}; embedded` : 'embedded' });
    }
  }
  return extra;
}

export function identifyBytes(bytes: Uint8Array, name: string, claimedMime = 'application/octet-stream'): Identification {
  const extension = extensionOf(name);
  const extensionMime = extension ? EXT_MIME[extension] : undefined;
  const at0 = detectAt(bytes, 0);
  const primary = at0[0];
  const additional = [...at0.slice(1), ...scanEmbedded(bytes, primary)];
  const encoding = detectEncoding(bytes);
  const mismatches: string[] = [];

  const extensionMatch = !extension
    ? true
    : Boolean(primary && (primary.extensions.includes(extension) || (extensionMime && mimeFamily(extensionMime, primary.mime))));
  const mimeMatch = !claimedMime || claimedMime === 'application/octet-stream'
    ? true
    : Boolean(primary && mimeFamily(claimedMime, primary.mime));

  if (extension && primary && !extensionMatch) {
    mismatches.push(`extension ${extension} vs content ${primary.id} (${primary.mime})`);
  }
  if (claimedMime && claimedMime !== 'application/octet-stream' && primary && !mimeMatch) {
    mismatches.push(`claimed MIME ${claimedMime} vs content ${primary.mime}`);
  }
  if (extensionMime && claimedMime && claimedMime !== 'application/octet-stream' && !mimeFamily(claimedMime, extensionMime)) {
    mismatches.push(`claimed MIME ${claimedMime} vs extension MIME ${extensionMime}`);
  }

  const polyglot =
    additional.some((h) => h.offset > 0 && (h.note?.includes('after-EOF') || h.note?.includes('embedded'))) ||
    additional.some((h) => h.group !== primary?.group && h.confidence >= 0.8);

  return {
    name,
    size: bytes.length,
    extension,
    claimedMime,
    extensionMime,
    primary,
    additional,
    encoding,
    extensionMatch,
    mimeMatch,
    mismatches,
    polyglot,
  };
}

function mimeFamily(a: string, b: string): boolean {
  if (a === b) return true;
  const norm = (m: string) => m.split(';')[0]!.trim().toLowerCase();
  a = norm(a);
  b = norm(b);
  if (a === b) return true;
  const aliases: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'application/x-zip-compressed': 'application/zip',
    'application/x-pdf': 'application/pdf',
  };
  a = aliases[a] ?? a;
  b = aliases[b] ?? b;
  if (a === b) return true;
  if (a.endsWith('+zip') && b === 'application/zip') return true;
  if (b.endsWith('+zip') && a === 'application/zip') return true;
  if (a.includes('openxmlformats') && b.includes('openxmlformats')) return true;
  if ((a === 'image/heic' || a === 'image/heif') && (b === 'image/heic' || b === 'image/heif')) return true;
  return false;
}

export async function identifyFile(file: NeoFile): Promise<Identification> {
  return identifyBytes(await file.bytes(), file.name, file.mime);
}

export function identificationMarkdown(items: Identification[], locale: 'de' | 'en'): string {
  const lines: string[] = [
    locale === 'de' ? '# Datei-Identifikation\n' : '# File identification\n',
  ];
  for (const it of items) {
    lines.push(`## ${it.name}\n`);
    const prim = it.primary;
    lines.push(
      locale === 'de'
        ? `- **Erkannt:** ${prim ? `${prim.label.de} (\`${prim.id}\`, ${prim.mime})` : 'unbekannt'}`
        : `- **Detected:** ${prim ? `${prim.label.en} (\`${prim.id}\`, ${prim.mime})` : 'unknown'}`,
    );
    lines.push(`- **MIME (claimed):** ${it.claimedMime}`);
    lines.push(`- **Extension:** ${it.extension || '—'} (${it.extensionMime ?? '—'})`);
    lines.push(`- **Size:** ${it.size} B`);
    lines.push(
      locale === 'de'
        ? `- **Encoding:** ${it.encoding.encoding} (Text: ${it.encoding.likelyText ? 'ja' : 'nein'})`
        : `- **Encoding:** ${it.encoding.encoding} (text: ${it.encoding.likelyText ? 'yes' : 'no'})`,
    );
    lines.push(
      locale === 'de'
        ? `- **Extension passt:** ${it.extensionMatch ? 'ja' : 'nein'}`
        : `- **Extension matches:** ${it.extensionMatch ? 'yes' : 'no'}`,
    );
    lines.push(
      locale === 'de'
        ? `- **MIME passt:** ${it.mimeMatch ? 'ja' : 'nein'}`
        : `- **MIME matches:** ${it.mimeMatch ? 'yes' : 'no'}`,
    );
    if (it.mismatches.length) {
      lines.push(locale === 'de' ? `- **Abweichungen:**` : `- **Mismatches:**`);
      for (const m of it.mismatches) lines.push(`  - ${m}`);
    }
    if (it.additional.length) {
      lines.push(locale === 'de' ? `- **Weitere Signaturen:**` : `- **Additional signatures:**`);
      for (const h of it.additional) {
        lines.push(`  - ${h.id} @ ${h.offset}${h.note ? ` (${h.note})` : ''}`);
      }
    }
    if (it.polyglot) lines.push(locale === 'de' ? `- **Polyglot:** ja` : `- **Polyglot:** yes`);
    lines.push('');
  }
  return lines.join('\n');
}

export function formatUnknown(): FormatHit {
  return {
    id: 'unknown',
    mime: 'application/octet-stream',
    extensions: [],
    group: 'other',
    label: { de: 'Unbekannt', en: 'Unknown' } satisfies Localized,
    offset: 0,
    confidence: 0,
  };
}

export { FORMAT_CATALOG };
