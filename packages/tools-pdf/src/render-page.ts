import type { Platform } from '@neotools/engine';
import type { PDFPageProxy } from 'pdfjs-dist';

export interface PageRaster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function createDrawCanvas(
  width: number,
  height: number,
  platform: Platform,
): Promise<{ canvas: { getContext: (t: '2d') => unknown; convertToBlob?: unknown; toBuffer?: unknown }; context: CanvasRenderingContext2D }> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas: kein 2D-Kontext.');
    return { canvas, context: context as unknown as CanvasRenderingContext2D };
  }
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') as unknown as CanvasRenderingContext2D };
  } catch {
    void platform;
    throw new Error(
      'Seitenraster braucht OffscreenCanvas (Browser) oder @napi-rs/canvas (Node).',
    );
  }
}

export async function renderPdfjsPage(
  page: PDFPageProxy,
  dpi: number,
  platform: Platform,
): Promise<PageRaster> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const { canvas, context } = await createDrawCanvas(viewport.width, viewport.height, platform);
  await page.render({ canvasContext: context, viewport }).promise;
  const image = context.getImageData(0, 0, Math.ceil(viewport.width), Math.ceil(viewport.height));
  void canvas;
  return { data: image.data, width: image.width, height: image.height };
}
