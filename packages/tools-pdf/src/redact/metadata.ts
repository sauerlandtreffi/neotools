import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { findPatternMatches, maskSecret, normalizeWs } from './patterns.js';
import { decodeStreamBytes, tokenizeContent } from './content-stream.js';
import type { RedactHit, RedactPatternId } from './types.js';

const STRUCT_TEXT_KEYS = new Set(['ActualText', 'Alt', 'E', 'Title', 'T']);

/** Plain strings painted by appearance streams (/AP N|R|D, nested state dicts). pdf.js text extraction never sees them. */
export function collectAppearanceText(annot: PDFDict): string[] {
  const out: string[] = [];
  const seenStreams = new Set<unknown>();
  const seenDicts = new Set<PDFDict>();
  const scoopStream = (stream: PDFStream) => {
    if (seenStreams.has(stream)) return;
    seenStreams.add(stream);
    try {
      const tokens = tokenizeContent(decodeStreamBytes(stream));
      let buf = '';
      for (const t of tokens) {
        if (t.kind === 'str' || t.kind === 'hex') buf += t.value;
        else if (t.kind === 'op' && (t.value === 'Tj' || t.value === 'TJ' || t.value === "'" || t.value === '"')) {
          if (buf.trim()) out.push(buf);
          buf = '';
        }
      }
      if (buf.trim()) out.push(buf);
    } catch {
      // malformed stream: nothing extractable, byte-scan still applies
    }
    const res = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    const xobj = res?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xobj) walk(xobj);
  };
  const walk = (dict: PDFDict) => {
    if (seenDicts.has(dict)) return;
    seenDicts.add(dict);
    for (const key of dict.keys()) {
      const child = dict.lookup(key);
      if (child instanceof PDFRawStream || child instanceof PDFStream) scoopStream(child);
      else if (child instanceof PDFDict) walk(child);
    }
  };
  const ap = annot.lookupMaybe(PDFName.of('AP'), PDFDict);
  if (ap) walk(ap);
  return out;
}

function dictStrings(dict: PDFDict, seen: Set<PDFDict>, out: string[]): void {
  if (seen.has(dict)) return;
  seen.add(dict);
  for (const key of dict.keys()) {
    const value = dict.lookup(key);
    if (value instanceof PDFString || value instanceof PDFHexString) out.push(value.decodeText());
    else if (value instanceof PDFDict) dictStrings(value, seen, out);
    else if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) {
        const item = value.lookup(i);
        if (item instanceof PDFDict) dictStrings(item, seen, out);
        if (item instanceof PDFString || item instanceof PDFHexString) out.push(item.decodeText());
      }
    }
  }
}

/** pdf-lib Info dates / producer strings look like phone numbers or Steuer-IDs if scanned raw. */
export function isTechnicalPdfMeta(value: string): boolean {
  const s = value.trim();
  if (/^D:\d{8,}/.test(s)) return true;
  if (/^pdf-lib/i.test(s)) return true;
  if (/^Adobe/i.test(s) && /PDF/.test(s)) return true;
  return false;
}

function metaHit(page: number, pattern: RedactPatternId, text: string): RedactHit {
  return { page, pattern, text, masked: maskSecret(text, pattern), x: 0, y: 0, w: 0, h: 0, selected: true };
}

/**
 * Pattern hits outside page content: Info dict, outline titles, StructTree
 * ActualText/Alt/E, XMP, annotation strings (Contents/RC/Subj/T/Popup …) and
 * appearance-stream text. Page 0 = document level; annotations carry their page.
 * These hits have zero-size boxes and only drive string blanking.
 */
export function collectMetaHits(doc: PDFDocument, patterns: RedactPatternId[], customRegex: string[] = []): RedactHit[] {
  const hits: RedactHit[] = [];
  const dedupe = new Set<string>();
  const add = (page: number, text: string) => {
    if (isTechnicalPdfMeta(text)) return;
    for (const m of findPatternMatches(text, patterns, customRegex)) {
      const key = `${page}:${m.pattern}:${normalizeWs(m.text)}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      hits.push(metaHit(page, m.pattern, m.text));
    }
  };
  const seen = new Set<PDFDict>();
  const docLevel: string[] = [];
  try {
    docLevel.push(doc.getTitle() ?? '', doc.getAuthor() ?? '', doc.getSubject() ?? '', doc.getKeywords() ?? '');
  } catch {
    // ignore
  }
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    if (info instanceof PDFDict) dictStrings(info, seen, docLevel);
  }
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) dictStrings(outlines, seen, docLevel);
  const struct = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  if (struct) dictStrings(struct, seen, docLevel);
  if (doc.catalog.has(PDFName.of('Metadata'))) docLevel.push(decodeMaybeStream(doc.catalog.lookup(PDFName.of('Metadata'))));
  for (const s of docLevel) if (s.trim()) add(0, s);

  doc.getPages().forEach((page, i) => {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) return;
    for (let a = 0; a < annots.size(); a++) {
      const annot = annots.lookup(a);
      if (!(annot instanceof PDFDict)) continue;
      const strings: string[] = [];
      dictStrings(annot, seen, strings);
      strings.push(...collectAppearanceText(annot));
      for (const s of strings) if (s.trim()) add(i + 1, s);
    }
  });
  return hits;
}

function matchesNeedles(text: string, needles: string[]): boolean {
  if (!text) return false;
  const n = normalizeWs(text);
  return needles.some((s) => s && n.includes(normalizeWs(s)));
}

function walkDictStrings(dict: PDFDict, needles: string[], seen: Set<PDFDict>): number {
  if (seen.has(dict)) return 0;
  seen.add(dict);
  let cleared = 0;
  for (const key of dict.keys()) {
    const value = dict.lookup(key);
    if (value instanceof PDFString || value instanceof PDFHexString) {
      if (matchesNeedles(value.decodeText(), needles)) {
        dict.set(key, PDFString.of(''));
        cleared += 1;
      }
    } else if (value instanceof PDFDict) {
      cleared += walkDictStrings(value, needles, seen);
    } else if (value instanceof PDFArray) {
      for (let i = 0; i < value.size(); i++) {
        const item = value.lookup(i);
        if (item instanceof PDFDict) cleared += walkDictStrings(item, needles, seen);
        if (item instanceof PDFString || item instanceof PDFHexString) {
          if (matchesNeedles(item.decodeText(), needles)) {
            value.set(i, PDFString.of(''));
            cleared += 1;
          }
        }
      }
    }
  }
  return cleared;
}

export function scrubMetadata(doc: PDFDocument, hits: RedactHit[]): number {
  const needles = hits.map((h) => h.text).filter((t) => t.trim().length >= 2);
  let cleared = 0;
  try {
    if (matchesNeedles(doc.getTitle() ?? '', needles)) {
      doc.setTitle('');
      cleared += 1;
    }
    if (matchesNeedles(doc.getAuthor() ?? '', needles)) {
      doc.setAuthor('');
      cleared += 1;
    }
    if (matchesNeedles(doc.getSubject() ?? '', needles)) {
      doc.setSubject('');
      cleared += 1;
    }
    if (matchesNeedles(doc.getKeywords() ?? '', needles)) {
      doc.setKeywords([]);
      cleared += 1;
    }
  } catch {
    // ignore
  }

  const seen = new Set<PDFDict>();
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    if (info instanceof PDFDict) cleared += walkDictStrings(info, needles, seen);
  }

  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict) cleared += walkDictStrings(annot, needles, seen);
    }
  }

  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) cleared += walkDictStrings(outlines, needles, seen);

  const struct = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  if (struct) cleared += walkDictStrings(struct, needles, seen);

  cleared += scrubXmpIfNeeded(doc, needles);
  return cleared;
}

function decodeMaybeStream(obj: unknown): string {
  if (obj instanceof PDFRawStream) {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(decodePDFRawStream(obj).decode());
    } catch {
      return new TextDecoder('latin1').decode(obj.getContents());
    }
  }
  if (obj instanceof PDFStream) return new TextDecoder('latin1').decode(obj.getContents());
  return '';
}

function scrubXmpIfNeeded(doc: PDFDocument, needles: string[]): number {
  if (!doc.catalog.has(PDFName.of('Metadata'))) return 0;
  const meta = doc.catalog.lookup(PDFName.of('Metadata'));
  const text = decodeMaybeStream(meta);
  if (!text) {
    doc.catalog.delete(PDFName.of('Metadata'));
    return 1;
  }
  if (needles.some((n) => n && normalizeWs(text).includes(normalizeWs(n)))) {
    doc.catalog.delete(PDFName.of('Metadata'));
    return 1;
  }
  return 0;
}

export function collectMetaStrings(doc: PDFDocument): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s.trim()) out.push(s);
  };
  push(doc.getTitle() ?? '');
  push(doc.getAuthor() ?? '');
  push(doc.getSubject() ?? '');
  push(doc.getKeywords() ?? '');
  const seen = new Set<PDFDict>();
  const scoop = (dict: PDFDict) => {
    if (seen.has(dict)) return;
    seen.add(dict);
    for (const key of dict.keys()) {
      const value = dict.lookup(key);
      if (value instanceof PDFString || value instanceof PDFHexString) push(value.decodeText());
      else if (value instanceof PDFDict) scoop(value);
      else if (value instanceof PDFArray) {
        for (let i = 0; i < value.size(); i++) {
          const item = value.lookup(i);
          if (item instanceof PDFDict) scoop(item);
          if (item instanceof PDFString || item instanceof PDFHexString) push(item.decodeText());
        }
      }
    }
  };
  const infoRef = doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    if (info instanceof PDFDict) scoop(info);
  }
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict) {
        scoop(annot);
        for (const s of collectAppearanceText(annot)) push(s);
      }
    }
  }
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) scoop(outlines);
  const struct = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  if (struct) scoop(struct);
  if (doc.catalog.has(PDFName.of('Metadata'))) {
    const xmp = decodeMaybeStream(doc.catalog.lookup(PDFName.of('Metadata')));
    if (xmp.trim()) out.push(xmp);
  }
  return out;
}

export function collectStructPlaintext(doc: PDFDocument): string[] {
  const out: string[] = [];
  const seen = new Set<PDFDict>();
  const walk = (dict: PDFDict) => {
    if (seen.has(dict)) return;
    seen.add(dict);
    for (const key of dict.keys()) {
      const name = key.toString().replace(/^\//, '');
      const value = dict.lookup(key);
      if (STRUCT_TEXT_KEYS.has(name) && (value instanceof PDFString || value instanceof PDFHexString)) {
        const t = value.decodeText();
        if (t.trim()) out.push(t);
      }
      if (value instanceof PDFDict) walk(value);
      else if (value instanceof PDFArray) {
        for (let i = 0; i < value.size(); i++) {
          const item = value.lookup(i);
          if (item instanceof PDFDict) walk(item);
        }
      }
    }
  };
  const root = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  if (root) walk(root);
  return out;
}
