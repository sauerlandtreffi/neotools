import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { NeoFile } from '@neotools/engine';
import { addOutlineTree, extractOutlines, offsetOutlines, type OutlineNode } from '../outlines.js';
import { drawPageStamp, padBates } from '../page-stamps.js';

export const A4 = { width: 595.28, height: 841.89 };

export interface BundleDoc {
  title: string;
  startPage: number;
  endPage: number;
  pageCount: number;
}

export interface BundleIndex {
  cover: boolean;
  tocPages: number;
  documents: BundleDoc[];
  totalPages: number;
}

export interface BundleOptions {
  title: string;
  aktenzeichen: string;
  parteien: string;
  datum: string;
  cover: boolean;
  toc: boolean;
  separators: boolean;
  batesPrefix: string;
  batesStart: number;
  batesDigits: number;
  batesPosition: 'footer-right' | 'footer-center' | 'footer-left';
  headerAktenzeichen: boolean;
  anlagenPrefix: string;
  inheritOutlines: boolean;
}

export async function embedImageFile(doc: PDFDocument, file: NeoFile): Promise<void> {
  const bytes = await file.bytes();
  const isPng = file.mime === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([A4.width, A4.height]);
  const margin = 36;
  const scale = Math.min((A4.width - margin * 2) / image.width, (A4.height - margin * 2) / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: (A4.width - w) / 2,
    y: (A4.height - h) / 2,
    width: w,
    height: h,
  });
}

function drawCover(page: PDFPage, font: PDFFont, bold: PDFFont, opts: BundleOptions): void {
  const { width, height } = page.getSize();
  page.drawText(opts.title || 'Akte', { x: 72, y: height - 160, size: 26, font: bold, color: rgb(0.1, 0.15, 0.25) });
  const lines = [
    opts.aktenzeichen ? `Aktenzeichen: ${opts.aktenzeichen}` : '',
    opts.parteien ? `Parteien: ${opts.parteien}` : '',
    opts.datum ? `Datum: ${opts.datum}` : '',
  ].filter(Boolean);
  let y = height - 220;
  for (const line of lines) {
    page.drawText(line, { x: 72, y, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 28;
  }
}

function addLink(doc: PDFDocument, page: PDFPage, dest: PDFPage, rect: { x: number; y: number; w: number; h: number }): void {
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'GoTo', D: [dest.ref, 'Fit'] },
  });
  const ref = doc.context.register(annot);
  const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (existing) existing.push(ref);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

export async function assembleAkte(
  sources: Array<{ file: NeoFile; doc: PDFDocument; kind: 'pdf' | 'image' }>,
  opts: BundleOptions,
): Promise<{ bytes: Uint8Array; index: BundleIndex }> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  if (opts.cover) {
    const cover = out.addPage([A4.width, A4.height]);
    drawCover(cover, font, bold, opts);
  }

  const tocStart = out.getPageCount();
  let tocPage: PDFPage | undefined;
  if (opts.toc) {
    tocPage = out.addPage([A4.width, A4.height]);
    tocPage.drawText('Inhaltsverzeichnis', { x: 72, y: A4.height - 72, size: 18, font: bold });
  }

  const outlines: OutlineNode[] = [];
  const documents: BundleDoc[] = [];
  const destPages: PDFPage[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]!;
    if (opts.separators) {
      const sep = out.addPage([A4.width, A4.height]);
      sep.drawText(src.file.name, { x: 72, y: A4.height / 2, size: 16, font: bold });
    }
    const start = out.getPageCount();
    if (src.kind === 'image') {
      await embedImageFile(out, src.file);
    } else {
      const copied = await out.copyPages(src.doc, src.doc.getPageIndices());
      for (const p of copied) out.addPage(p);
      if (opts.inheritOutlines) {
        const inherited = offsetOutlines(extractOutlines(src.doc), start);
        outlines.push({
          title: src.file.name.replace(/\.pdf$/i, ''),
          pageIndex: start,
          children: inherited,
        });
      } else {
        outlines.push({ title: src.file.name.replace(/\.pdf$/i, ''), pageIndex: start, children: [] });
      }
    }
    if (src.kind === 'image') {
      outlines.push({ title: src.file.name, pageIndex: start, children: [] });
    }
    const end = out.getPageCount() - 1;
    destPages.push(out.getPage(start));
    documents.push({
      title: src.file.name,
      startPage: start + 1,
      endPage: end + 1,
      pageCount: end - start + 1,
    });
    if (opts.anlagenPrefix) {
      const stamp = `${opts.anlagenPrefix}${i + 1}`;
      for (let p = start; p <= end; p++) {
        drawPageStamp(out.getPage(p), bold, stamp, {
          position: 'header-right',
          fontSize: 9,
          color: { r: 0.35, g: 0.15, b: 0.1 },
        });
      }
    }
  }

  if (tocPage) {
    let y = A4.height - 110;
    documents.forEach((d, i) => {
      const line = `${d.title}  ·  ${d.startPage}`;
      tocPage!.drawText(line, { x: 72, y, size: 12, font, color: rgb(0.1, 0.2, 0.45) });
      const dest = destPages[i];
      if (dest) {
        addLink(out, tocPage!, dest, { x: 68, y: y - 2, w: 420, h: 16 });
      }
      y -= 22;
    });
    void tocStart;
  }

  addOutlineTree(out, outlines);

  const total = out.getPageCount();
  out.getPages().forEach((page, idx) => {
    if (opts.headerAktenzeichen && opts.aktenzeichen) {
      drawPageStamp(page, font, opts.aktenzeichen, { position: 'header-left', fontSize: 8 });
    }
    const bates = `${opts.batesPrefix}${padBates(opts.batesStart + idx, opts.batesDigits)}`;
    drawPageStamp(page, font, bates, { position: opts.batesPosition, fontSize: 9 });
  });

  const bytes = new Uint8Array(await out.save({ updateFieldAppearances: false }));
  return {
    bytes,
    index: {
      cover: opts.cover,
      tocPages: opts.toc ? 1 : 0,
      documents,
      totalPages: total,
    },
  };
}
