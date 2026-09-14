import { PDFDocument } from 'pdf-lib';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import type { NeoFile } from '@neotools/engine';

export async function loadPdf(file: NeoFile): Promise<PDFDocument> {
  const bytes = await file.bytes();
  return PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
}

export async function savePdf(doc: PDFDocument, name: string): Promise<NeoFile> {
  const bytes = await doc.save({ updateFieldAppearances: false });
  return neoFileFromBytes(name, bytes, MIME.pdf);
}

export async function copyPagesToNew(src: PDFDocument, indices: number[]): Promise<PDFDocument> {
  const out = await PDFDocument.create();
  if (!indices.length) return out;
  const pages = await out.copyPages(src, indices);
  for (const page of pages) out.addPage(page);
  return out;
}

export function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'output';
}

export function padPage(n: number, width = 3): string {
  return String(n).padStart(width, '0');
}

/**
 * Write a brand-new PDF (no incremental xref, no leftover unused objects).
 * Copies only live pages from `doc` into a fresh document.
 */
export async function savePdfRewritten(doc: PDFDocument, name: string): Promise<NeoFile> {
  const out = await PDFDocument.create();
  const count = doc.getPageCount();
  if (count > 0) {
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  const bytes = await out.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  return neoFileFromBytes(name, bytes, MIME.pdf);
}

/** True when the file has more than one `%%EOF` (incremental update leftover). */
export function hasIncrementalEof(bytes: Uint8Array): boolean {
  const needle = new TextEncoder().encode('%%EOF');
  let count = 0;
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) count += 1;
    if (count > 1) return true;
  }
  return false;
}
