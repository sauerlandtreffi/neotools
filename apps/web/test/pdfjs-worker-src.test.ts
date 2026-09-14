import { describe, expect, it } from 'vitest';
import { configurePdfjsWorker, loadPdfjs, resolvePdfjsWorkerSrc } from '@neotools/tools-pdf';

describe('pdfjs worker src (web alias)', () => {
  it('points at the bundled pdf.worker for main thread and tool-worker', () => {
    expect(resolvePdfjsWorkerSrc('modern')).toMatch(/pdf\.worker\.min\.mjs/);
    expect(resolvePdfjsWorkerSrc('legacy')).toMatch(/pdf\.worker\.min\.mjs/);
  });

  it('configurePdfjsWorker writes GlobalWorkerOptions.workerSrc in browser mode', async () => {
    const pdfjs = await loadPdfjs();
    const prev = pdfjs.GlobalWorkerOptions.workerSrc;
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = '';
      const src = await configurePdfjsWorker(pdfjs, { forceBrowser: true, kind: 'legacy' });
      expect(src).toMatch(/pdf\.worker/);
    } finally {
      pdfjs.GlobalWorkerOptions.workerSrc = prev;
    }
  });
});
