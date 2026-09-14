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
