import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJsModule = typeof import('pdfjs-dist');

let cached: PdfJsModule | null = null;

export async function loadPdfjs(): Promise<PdfJsModule> {
  if (cached) return cached;
  try {
    cached = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;
  } catch {
    cached = await import('pdfjs-dist');
  }
  return cached;
}

export async function openPdfjsDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: data.slice(),
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  });
  return loadingTask.promise;
}
