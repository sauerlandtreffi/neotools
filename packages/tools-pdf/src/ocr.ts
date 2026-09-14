import type { ToolContext } from '@neotools/engine';
import type { PDFPageProxy } from 'pdfjs-dist';
import {
  PDFPage,
  StandardFonts,
  TextRenderingMode,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib';
import { isNodeRuntime } from './wasm-bytes.js';
import { encodePngRgba } from './codecs/png-bytes.js';

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface RecognizePageResult {
  words: OcrWord[];
  meanConfidence: number;
}

export interface InvisibleWord {
  text: string;
  x: number;
  y: number;
  size: number;
}

let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
let workerLangs = '';

export function tessdataBrowserPath(): string {
  return '/tessdata';
}

export function tesseractBrowserPaths() {
  return {
    workerPath: '/assets/tesseract/worker.min.js',
    corePath: '/assets/tesseract',
    langPath: tessdataBrowserPath(),
    gzip: true,
    workerBlobURL: false,
  };
}

export async function resolveNodeTessdata(): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  const { access } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const env = process.env.NEOTOOLS_TESSDATA;
  const candidates = [
    env,
    join(process.cwd(), 'apps/web/public/tessdata'),
    join(process.cwd(), 'public/tessdata'),
    fileURLToPath(new URL('../../../apps/web/public/tessdata', import.meta.url)),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    try {
      await access(join(dir, 'eng.traineddata.gz'));
      return dir;
    } catch {
      try {
        await access(join(dir, 'eng.traineddata'));
        return dir;
      } catch {
        // next
      }
    }
  }
  return null;
}

async function getWorker(langs: string[], ctx: ToolContext) {
  const key = langs.slice().sort().join('+');
  if (worker && workerLangs === key) return worker;
  if (worker) {
    await worker.terminate();
    worker = null;
  }
  const tessMod = await import('tesseract.js');
  const createWorker =
    tessMod.createWorker ??
    (tessMod as unknown as { default: { createWorker: typeof tessMod.createWorker } }).default
      .createWorker;
  const options: Record<string, unknown> = {
    logger: (m: { progress?: number; status?: string }) => {
      if (typeof m.progress === 'number') {
        ctx.progress(Math.min(0.99, m.progress), m.status);
      }
    },
  };
  if (ctx.platform.id === 'browser' || !isNodeRuntime()) {
    Object.assign(options, tesseractBrowserPaths());
  } else {
    const langPath = ctx.platform.assets?.ocrLangPath ?? (await resolveNodeTessdata());
    if (!langPath) {
      throw new Error(
        'OCR-Sprachdaten fehlen. scripts/fetch-tessdata.mjs ausführen (deu+eng nach apps/web/public/tessdata/).',
      );
    }
    options.langPath = langPath;
    options.gzip = true;
    options.cacheMethod = 'readOnly';
  }
  worker = await createWorker(langs, 1, options);
  workerLangs = key;
  return worker;
}

/**
 * OCR one page raster. Agent A (redact) may reuse this for scanned pages.
 * `imageData` is RGBA. Tesseract gets a PNG buffer (ImageData is not in ImageLike).
 */
export async function recognizePage(
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  langs: string[],
  ctx: ToolContext,
): Promise<RecognizePageResult> {
  const png = encodePngRgba(imageData.data, imageData.width, imageData.height);
  const tess = await getWorker(langs.length ? langs : ['deu', 'eng'], ctx);
  const payload =
    typeof Buffer !== 'undefined'
      ? Buffer.from(png)
      : new Blob([png.slice()], { type: 'image/png' });
  const result = await tess.recognize(payload);
  const page = result.data;
  const words: OcrWord[] = [];
  const lines = page.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines)) ?? [];
  for (const line of lines) {
    for (const word of line.words) {
      const text = word.text.trim();
      if (!text) continue;
      words.push({
        text,
        bbox: word.bbox,
        confidence: word.confidence,
      });
    }
  }
  return { words, meanConfidence: page.confidence ?? 0 };
}

export async function pageHasTextLayer(page: PDFPageProxy): Promise<boolean> {
  const content = await page.getTextContent();
  const text = (content.items as Array<{ str?: string }>)
    .map((i) => i.str ?? '')
    .join('')
    .replace(/\s+/g, '');
  return text.length > 0;
}

export function wordsToPdfPositions(
  words: OcrWord[],
  pageWidth: number,
  pageHeight: number,
  imageWidth: number,
  imageHeight: number,
): InvisibleWord[] {
  const sx = pageWidth / Math.max(imageWidth, 1);
  const sy = pageHeight / Math.max(imageHeight, 1);
  return words.map((w) => {
    const h = Math.max(4, (w.bbox.y1 - w.bbox.y0) * sy * 0.9);
    return {
      text: w.text,
      x: w.bbox.x0 * sx,
      y: pageHeight - w.bbox.y1 * sy,
      size: h,
    };
  });
}

/** Invisible text (PDF text rendering mode 3) at image-bbox positions. */
export async function writeInvisibleWords(
  page: PDFPage,
  words: InvisibleWord[],
  fontName = StandardFonts.Helvetica,
): Promise<number> {
  const doc = page.doc;
  const font = await doc.embedFont(fontName);
  // Register the font in page resources (drawText does that).
  page.drawText(' ', { x: -20, y: -20, size: 1, font, opacity: 0 });
  let written = 0;
  for (const word of words) {
    if (!word.text.trim()) continue;
    const encoded = font.encodeText(word.text);
    page.pushOperators(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(font.name, word.size),
      setTextMatrix(1, 0, 0, 1, word.x, word.y),
      showText(encoded),
      endText(),
    );
    written += 1;
  }
  return written;
}

export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerLangs = '';
  }
}
