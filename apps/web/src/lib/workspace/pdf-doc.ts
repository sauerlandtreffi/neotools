import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface TextItem {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfDoc {
  ref: string;
  doc: PDFDocumentProxy;
  numPages: number;
  textByPage: Map<number, TextItem[]>;
  thumbs: Map<number, string>;
  pageSizes: Map<number, { width: number; height: number }>;
  destroy(): Promise<void>;
}

const cache = new Map<string, Promise<PdfDoc>>();
const MAX_DOCS = 3;
const inflight = new WeakMap<HTMLCanvasElement, { cancel(): void }>();

/** Open (and memoize) a pdf.js document for an OPFS ref. */
export function openPdf(ref: string, bytes: Uint8Array): Promise<PdfDoc> {
  const hit = cache.get(ref);
  if (hit) return hit;
  const pending = (async () => {
    const { openPdfjsDocument } = await import('@neotools/tools-pdf');
    const doc = await openPdfjsDocument(bytes);
    const pd: PdfDoc = {
      ref,
      doc,
      numPages: doc.numPages,
      textByPage: new Map(),
      thumbs: new Map(),
      pageSizes: new Map(),
      async destroy() {
        cache.delete(ref);
        await doc.destroy().catch(() => undefined);
      },
    };
    return pd;
  })();
  cache.set(ref, pending);
  pending.catch(() => cache.delete(ref));
  if (cache.size > MAX_DOCS) {
    const oldest = cache.keys().next().value;
    if (oldest && oldest !== ref) {
      const p = cache.get(oldest);
      cache.delete(oldest);
      void p?.then((d) => d.doc.destroy()).catch(() => undefined);
    }
  }
  return pending;
}

export function closePdf(ref: string): void {
  const p = cache.get(ref);
  cache.delete(ref);
  void p?.then((d) => d.doc.destroy()).catch(() => undefined);
}

export async function pageText(pd: PdfDoc, pageNo: number): Promise<TextItem[]> {
  const cached = pd.textByPage.get(pageNo);
  if (cached) return cached;
  const p = await pd.doc.getPage(pageNo);
  const content = await p.getTextContent();
  const out: TextItem[] = [];
  for (const raw of content.items) {
    const it = raw as { str?: string; width?: number; height?: number; transform?: number[] };
    if (!it.str) continue;
    const tr = it.transform ?? [1, 0, 0, 1, 0, 0];
    out.push({ page: pageNo, str: it.str, x: tr[4] ?? 0, y: tr[5] ?? 0, w: it.width ?? 8, h: it.height ?? 10 });
  }
  pd.textByPage.set(pageNo, out);
  return out;
}

export async function allText(pd: PdfDoc, signal?: { cancelled: boolean }): Promise<TextItem[]> {
  const all: TextItem[] = [];
  for (let i = 1; i <= pd.numPages; i++) {
    if (signal?.cancelled) break;
    all.push(...(await pageText(pd, i)));
  }
  return all;
}

export async function renderPage(
  pd: PdfDoc,
  pageNo: number,
  canvas: HTMLCanvasElement,
  scale: number,
  dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
): Promise<{ viewport: ReturnType<PDFPageProxy['getViewport']>; page: PDFPageProxy }> {
  const page = await pd.doc.getPage(pageNo);
  const viewport = page.getViewport({ scale });
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  // One render per canvas at a time: cancel an in-flight task before starting the next
  // (overlapping renders leave pdf.js' save/transform stack in a flipped state).
  inflight.get(canvas)?.cancel();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
  inflight.set(canvas, task);
  try {
    await task.promise;
  } catch (err) {
    if ((err as { name?: string })?.name === 'RenderingCancelledException') return { viewport, page };
    throw err;
  } finally {
    if (inflight.get(canvas) === task) inflight.delete(canvas);
  }
  pd.pageSizes.set(pageNo, { width: viewport.width / scale, height: viewport.height / scale });
  return { viewport, page };
}

export async function thumbnail(pd: PdfDoc, pageNo: number, width = 96): Promise<string> {
  const cached = pd.thumbs.get(pageNo);
  if (cached) return cached;
  const page = await pd.doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const viewport = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(viewport.width);
  c.height = Math.ceil(viewport.height);
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = c.toDataURL('image/png');
  pd.thumbs.set(pageNo, url);
  return url;
}

/** Find `query` (plain or regex) in text items; returns one mark per match. */
export function findInText(
  items: TextItem[],
  query: string,
): Array<{ page: number; x: number; y: number; w: number; h: number; text: string }> {
  if (!query.trim()) return [];
  let re: RegExp;
  try {
    re = new RegExp(query, 'gi');
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }
  const byPage = new Map<number, TextItem[]>();
  for (const it of items) {
    const list = byPage.get(it.page) ?? [];
    list.push(it);
    byPage.set(it.page, list);
  }
  const out: Array<{ page: number; x: number; y: number; w: number; h: number; text: string }> = [];
  for (const [p, list] of byPage) {
    const text = list.map((i) => i.str).join('');
    const offsets: number[] = [];
    let n = 0;
    for (const it of list) {
      offsets.push(n);
      n += it.str.length;
    }
    for (const m of text.matchAll(re)) {
      if (m.index === undefined || !m[0]) continue;
      const start = m.index;
      const end = start + m[0].length;
      const covered = list.filter((it, i) => offsets[i]! < end && offsets[i]! + it.str.length > start);
      if (!covered.length) continue;
      const x = Math.min(...covered.map((i) => i.x));
      const y = Math.min(...covered.map((i) => i.y));
      out.push({
        page: p,
        x,
        y,
        w: Math.max(...covered.map((i) => i.x + i.w)) - x,
        h: Math.max(...covered.map((i) => i.y + i.h)) - y,
        text: m[0],
      });
    }
  }
  return out;
}
