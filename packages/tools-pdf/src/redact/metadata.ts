import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';
import { normalizeWs } from './patterns.js';
import type { RedactHit } from './types.js';

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

  return cleared;
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
      if (annot instanceof PDFDict) scoop(annot);
    }
  }
  const outlines = doc.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) scoop(outlines);
  return out;
}
