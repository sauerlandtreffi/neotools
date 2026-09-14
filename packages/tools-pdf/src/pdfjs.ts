import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJsModule = typeof import('pdfjs-dist');
type WorkerKind = 'legacy' | 'modern';

let cached: PdfJsModule | null = null;
let cachedKind: WorkerKind = 'modern';
let configured = false;

/**
 * Vite rewrites these `new URL(..., import.meta.url)` literals to hashed
 * same-origin assets. Keep the specifiers as string literals so the bundler
 * (main thread and tool-worker) emit the same worker file.
 */
function modernWorkerUrl(): string {
  return new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

function legacyWorkerUrl(): string {
  return new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
}

export function resolvePdfjsWorkerSrc(kind: WorkerKind = 'modern'): string {
  return kind === 'legacy' ? legacyWorkerUrl() : modernWorkerUrl();
}

function isBrowserLike(): boolean {
  const g = globalThis as typeof globalThis & { WorkerGlobalScope?: unknown };
  return typeof document !== 'undefined' || typeof g.WorkerGlobalScope !== 'undefined';
}

function isNodeRuntime(): boolean {
  if (isBrowserLike()) return false;
  return Boolean(typeof process === 'object' && process?.versions?.node);
}

function canSpawnPdfWorker(): boolean {
  return typeof Worker === 'function' && typeof window !== 'undefined';
}

async function attachFakeWorker(src: string, kind: WorkerKind): Promise<void> {
  const g = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown };
  };
  if (g.pdfjsWorker?.WorkerMessageHandler) return;
  try {
    const mod =
      kind === 'legacy'
        ? await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
        : await import('pdfjs-dist/build/pdf.worker.min.mjs');
    if (mod.WorkerMessageHandler) {
      g.pdfjsWorker = mod;
      return;
    }
  } catch {
    // fall through to dynamic import of the resolved URL
  }
  try {
    const dyn = (await import(/* @vite-ignore */ src)) as { WorkerMessageHandler?: unknown };
    if (dyn.WorkerMessageHandler) g.pdfjsWorker = dyn;
  } catch {
    // pdf.js will retry via GlobalWorkerOptions.workerSrc
  }
}

/**
 * Ensures `GlobalWorkerOptions.workerSrc` is set in every browser context
 * (window and dedicated Worker). Node keeps pdf.js' own `./pdf.worker.mjs`.
 */
export async function configurePdfjsWorker(
  pdfjs: PdfJsModule,
  options?: { forceBrowser?: boolean; kind?: WorkerKind },
): Promise<string | null> {
  const kind = options?.kind ?? cachedKind;
  const browser = options?.forceBrowser || isBrowserLike();
  if (!browser && isNodeRuntime()) return null;
  if (!browser && !options?.forceBrowser) return null;

  const src = resolvePdfjsWorkerSrc(kind);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = src;
  }
  // Fake worker only when we are actually in a browser/worker runtime
  // (pdf.js 4.x reads `window` when spawning a real Worker).
  if (isBrowserLike() && !canSpawnPdfWorker()) {
    await attachFakeWorker(pdfjs.GlobalWorkerOptions.workerSrc, kind);
  }
  configured = true;
  return pdfjs.GlobalWorkerOptions.workerSrc;
}

export async function loadPdfjs(): Promise<PdfJsModule> {
  if (cached) {
    if (!configured) await configurePdfjsWorker(cached, { kind: cachedKind });
    return cached;
  }
  try {
    cached = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;
    cachedKind = 'legacy';
  } catch {
    cached = await import('pdfjs-dist');
    cachedKind = 'modern';
  }
  await configurePdfjsWorker(cached, { kind: cachedKind });
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
