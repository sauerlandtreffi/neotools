import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  configurePdfjsWorker,
  loadPdfjs,
  openPdfjsDocument,
  resolvePdfjsWorkerSrc,
} from '../src/pdfjs.js';

describe('pdfjs worker bootstrap', () => {
  it('resolves a bundled pdf.worker URL for browser/worker contexts', () => {
    expect(resolvePdfjsWorkerSrc('modern')).toMatch(/pdf\.worker\.min\.mjs/);
    expect(resolvePdfjsWorkerSrc('legacy')).toMatch(/pdf\.worker\.min\.mjs/);
  });

  it('sets GlobalWorkerOptions.workerSrc when forced into browser mode', async () => {
    const pdfjs = await loadPdfjs();
    const prev = pdfjs.GlobalWorkerOptions.workerSrc;
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = '';
      const src = await configurePdfjsWorker(pdfjs, { forceBrowser: true, kind: 'legacy' });
      expect(src).toBeTruthy();
      expect(src).toMatch(/pdf\.worker/);
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(src);
    } finally {
      pdfjs.GlobalWorkerOptions.workerSrc = prev;
    }
  });

  it('sets workerSrc in a WorkerGlobalScope-like context (tool-worker)', async () => {
    const pdfjs = await loadPdfjs();
    const prev = pdfjs.GlobalWorkerOptions.workerSrc;
    const g = globalThis as typeof globalThis & { WorkerGlobalScope?: unknown };
    const hadScope = 'WorkerGlobalScope' in globalThis;
    const prevScope = g.WorkerGlobalScope;
    try {
      g.WorkerGlobalScope = function WorkerGlobalScope() {} as unknown;
      pdfjs.GlobalWorkerOptions.workerSrc = '';
      const src = await configurePdfjsWorker(pdfjs, { kind: 'legacy' });
      expect(src, 'missing workerSrc would throw in pdf.js').toMatch(/pdf\.worker/);
      expect(pdfjs.GlobalWorkerOptions.workerSrc).toBeTruthy();
    } finally {
      pdfjs.GlobalWorkerOptions.workerSrc = prev;
      if (hadScope) g.WorkerGlobalScope = prevScope;
      else delete g.WorkerGlobalScope;
    }
  });

  it('opens a document in Node without requiring a Vite asset workerSrc', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 120]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('WorkerProbe', { x: 20, y: 70, size: 12, font });
    const pdf = await openPdfjsDocument(await doc.save());
    expect(pdf.numPages).toBe(1);
    const text = await (await pdf.getPage(1)).getTextContent();
    const joined = text.items.map((it) => ('str' in it ? it.str : '')).join('');
    expect(joined).toContain('WorkerProbe');
    await pdf.destroy();
  });
});
