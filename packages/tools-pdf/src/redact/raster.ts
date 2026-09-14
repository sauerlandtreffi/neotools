import type { ToolContext } from '@neotools/engine';
import { PDFDocument, rgb } from 'pdf-lib';
import { openPdfjsDocument } from '../pdfjs.js';
import type { RedactHit } from './types.js';

type RasterContext = {
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillStyle: string;
  getImageData?: (x: number, y: number, w: number, h: number) => ImageData;
};

async function makeCanvas(
  width: number,
  height: number,
): Promise<{ canvas: { convertToBlob?: (o: { type: string }) => Promise<Blob>; toBuffer?: (mime: string) => Buffer }; context: RasterContext } | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    return { canvas, context: context as unknown as RasterContext };
  }
  try {
    const spec = '@napi-rs/canvas';
    const mod = (await import(spec)) as { createCanvas: (w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (m: string) => Buffer } };
    const canvas = mod.createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') as unknown as RasterContext };
  } catch {
    return null;
  }
}

export async function renderPagePng(
  data: Uint8Array,
  pageNumber: number,
  _ctx?: ToolContext,
  scale = 1.5,
): Promise<Uint8Array | null> {
  const pdf = await openPdfjsDocument(data);
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const surface = await makeCanvas(viewport.width, viewport.height);
    if (!surface) return null;
    await page.render({ canvasContext: surface.context as never, viewport }).promise;
    if (typeof surface.canvas.convertToBlob === 'function') {
      const blob = await surface.canvas.convertToBlob({ type: 'image/png' });
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (typeof surface.canvas.toBuffer === 'function') {
      return new Uint8Array(surface.canvas.toBuffer('image/png'));
    }
    return null;
  } finally {
    await pdf.destroy();
  }
}

export async function rasterizePage(
  data: Uint8Array,
  pageNumber: number,
  hits: RedactHit[],
  fill: { r: number; g: number; b: number },
): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  const pdf = await openPdfjsDocument(data);
  try {
    const page = await pdf.getPage(pageNumber);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const surface = await makeCanvas(viewport.width, viewport.height);
    if (!surface) return null;
    await page.render({ canvasContext: surface.context as never, viewport }).promise;
    const ctx = surface.context as CanvasRenderingContext2D;
    ctx.fillStyle = `rgb(${Math.round(fill.r * 255)},${Math.round(fill.g * 255)},${Math.round(fill.b * 255)})`;
    for (const h of hits.filter((x) => x.page === pageNumber)) {
      const [vx, vy] = viewport.convertToViewportPoint(h.x, h.y + h.h);
      const [vx2, vy2] = viewport.convertToViewportPoint(h.x + h.w, h.y);
      const x = Math.min(vx, vx2);
      const y = Math.min(vy, vy2);
      ctx.fillRect(x, y, Math.abs(vx2 - vx), Math.abs(vy2 - vy));
    }
    let png: Uint8Array | null = null;
    if (typeof surface.canvas.convertToBlob === 'function') {
      const blob = await surface.canvas.convertToBlob({ type: 'image/png' });
      png = new Uint8Array(await blob.arrayBuffer());
    } else if (typeof surface.canvas.toBuffer === 'function') {
      png = new Uint8Array(surface.canvas.toBuffer('image/png'));
    }
    if (!png) return null;
    return { png, width: viewport.width, height: viewport.height };
  } finally {
    await pdf.destroy();
  }
}

export async function replacePagesWithRaster(
  doc: PDFDocument,
  data: Uint8Array,
  pages: number[],
  hits: RedactHit[],
  fill: { r: number; g: number; b: number },
): Promise<{ doc: PDFDocument; rasterized: number[]; skipped: number[] }> {
  const rasterized: number[] = [];
  const skipped: number[] = [];
  if (!pages.length) return { doc, rasterized, skipped };

  const out = await PDFDocument.create();
  for (let i = 0; i < doc.getPageCount(); i++) {
    const pageNo = i + 1;
    if (!pages.includes(pageNo)) {
      const [copied] = await out.copyPages(doc, [i]);
      out.addPage(copied);
      continue;
    }
    const raster = await rasterizePage(data, pageNo, hits, fill);
    if (!raster) {
      const [copied] = await out.copyPages(doc, [i]);
      out.addPage(copied);
      skipped.push(pageNo);
      continue;
    }
    const img = await out.embedPng(raster.png);
    const src = doc.getPage(i);
    const { width, height } = src.getSize();
    const page = out.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
    rasterized.push(pageNo);
  }
  return { doc: out, rasterized, skipped };
}

export async function sampleBoxMeans(
  data: Uint8Array,
  hits: RedactHit[],
): Promise<Array<{ page: number; mean: number }> | null> {
  const pdf = await openPdfjsDocument(data);
  const out: Array<{ page: number; mean: number }> = [];
  try {
    const pages = [...new Set(hits.map((h) => h.page))].filter((p) => p >= 1 && p <= pdf.numPages);
    for (const pageNo of pages) {
      const page = await pdf.getPage(pageNo);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const surface = await makeCanvas(viewport.width, viewport.height);
      if (!surface) return null;
      await page.render({ canvasContext: surface.context as never, viewport }).promise;
      const ctx = surface.context;
      if (typeof ctx.getImageData !== 'function') return null;
      const pageHits = hits.filter((h) => h.page === pageNo);
      let sum = 0;
      let n = 0;
      for (const h of pageHits) {
        const [vx, vy] = viewport.convertToViewportPoint(h.x, h.y + h.h);
        const [vx2, vy2] = viewport.convertToViewportPoint(h.x + h.w, h.y);
        const x = Math.max(0, Math.floor(Math.min(vx, vx2)));
        const y = Math.max(0, Math.floor(Math.min(vy, vy2)));
        const w = Math.max(1, Math.floor(Math.abs(vx2 - vx)));
        const hgt = Math.max(1, Math.floor(Math.abs(vy2 - vy)));
        const img = ctx.getImageData(x, y, Math.min(w, Math.floor(viewport.width) - x), Math.min(hgt, Math.floor(viewport.height) - y));
        for (let i = 0; i < img.data.length; i += 16) {
          sum += (img.data[i]! + img.data[i + 1]! + img.data[i + 2]!) / 3;
          n += 1;
        }
      }
      out.push({ page: pageNo, mean: n ? sum / n : 255 });
    }
  } finally {
    await pdf.destroy();
  }
  return out;
}

export function fillRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0]! + h[0]!, 16) / 255,
      g: parseInt(h[1]! + h[1]!, 16) / 255,
      b: parseInt(h[2]! + h[2]!, 16) / 255,
    };
  }
  return {
    r: parseInt(h.slice(0, 2) || '00', 16) / 255,
    g: parseInt(h.slice(2, 4) || '00', 16) / 255,
    b: parseInt(h.slice(4, 6) || '00', 16) / 255,
  };
}

export { rgb };
