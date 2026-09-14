import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import type { NeoFile, Platform } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { padPage, stem } from '../pdf-io.js';
import { openPdfjsDocument } from '../pdfjs.js';

const options = z.object({
  format: z.enum(['png', 'jpg']).default('png'),
  dpi: z.coerce.number().min(36).max(600).default(144),
  quality: z.coerce.number().min(0.1).max(1).default(0.92),
});

const PNG_MIME = MIME.png;
const JPG_MIME = MIME.jpeg;

async function encodeFromCanvas(
  canvas: { convertToBlob?: (o: { type: string; quality?: number }) => Promise<Blob>; toBuffer?: (mime: string, q?: number) => Buffer },
  mime: string,
  quality: number,
): Promise<Uint8Array> {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({
      type: mime,
      quality: mime === JPG_MIME ? quality : undefined,
    });
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof canvas.toBuffer === 'function') {
    return new Uint8Array(canvas.toBuffer(mime, mime === JPG_MIME ? quality : undefined));
  }
  throw new Error('Canvas unterstützt weder convertToBlob noch toBuffer.');
}

async function createCanvas(
  width: number,
  height: number,
  platform: Platform,
): Promise<{ canvas: any; context: any }> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('OffscreenCanvas: kein 2D-Kontext.');
    return { canvas, context };
  }
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext('2d') };
  } catch {
    void platform;
    throw new Error(
      'pdf-to-images ist nur im Browser verfügbar (OffscreenCanvas) oder in Node mit @napi-rs/canvas.',
    );
  }
}

export const pdfToImages = defineTool({
  id: 'pdf-to-images',
  pack: 'pdf',
  category: 'convert',
  title: { de: 'PDF zu Bildern', en: 'PDF to images' },
  description: {
    de: 'Seiten mit PDF.js rendern (PNG/JPG, DPI). Browser: OffscreenCanvas im Worker; Node: @napi-rs/canvas.',
    en: 'Render pages with PDF.js (PNG/JPG, DPI). Browser: OffscreenCanvas in a worker; Node: @napi-rs/canvas.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [PNG_MIME, JPG_MIME] },
  options,
  presets: [
    { id: 'png-144', title: { de: 'PNG 144 DPI', en: 'PNG 144 DPI' }, options: { format: 'png', dpi: 144 } },
    { id: 'jpg-72', title: { de: 'JPG 72 DPI', en: 'JPG 72 DPI' }, options: { format: 'jpg', dpi: 72 } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf to png', 'pdf zu bild'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const mime = parsed.format === 'jpg' ? JPG_MIME : PNG_MIME;
    const ext = parsed.format === 'jpg' ? 'jpg' : 'png';
    const outputs: NeoFile[] = [];
    const loaded = await mapFiles(files, async (file, fi) => {
      ctx.progress(fi / Math.max(files.length, 1), file.name);
      const data = await file.bytes();
      const pdf = await openPdfjsDocument(data);
      const made: NeoFile[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        ctx.signal.throwIfAborted?.();
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: parsed.dpi / 72 });
        const { canvas, context } = await createCanvas(viewport.width, viewport.height, ctx.platform);
        await page.render({ canvasContext: context, viewport }).promise;
        const bytes = await encodeFromCanvas(canvas, mime, parsed.quality);
        made.push(neoFileFromBytes(`${stem(file.name)}-p${padPage(i)}.${ext}`, bytes, mime));
      }
      await pdf.destroy();
      return made;
    });
    for (const row of loaded.ok) outputs.push(...row.value);
    const provenance = await createProvenance('pdf-to-images', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, images: outputs.length }, provenance),
    };
  },
});
