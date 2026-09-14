import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { boxesOverlap } from './text-map.js';
import type { RedactHit } from './types.js';

const BLACK_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

export interface ImageDo {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function blackoutOverlappingImages(
  doc: PDFDocument,
  page: PDFPage,
  dos: ImageDo[],
  hits: RedactHit[],
): Promise<string[]> {
  const warnings: string[] = [];
  const resources = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
  const xobj = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobj) return warnings;

  const touched = new Set<string>();
  for (const d of dos) {
    const overlaps = hits.some((h) => boxesOverlap(d, h, 1));
    if (!overlaps) continue;
    if (touched.has(d.name)) continue;
    const child = xobj.lookup(PDFName.of(d.name));
    if (!(child instanceof PDFRawStream) && !(child && typeof child === 'object' && 'dict' in (child as object))) {
      continue;
    }
    const dict = (child as { dict?: PDFDict }).dict;
    const subtype = dict?.lookup(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.toString() !== '/Image') continue;
    touched.add(d.name);
    try {
      const embedded = await doc.embedPng(BLACK_PNG);
      xobj.set(PDFName.of(d.name), embedded.ref);
    } catch (err) {
      warnings.push(`Bild ${d.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return warnings;
}
