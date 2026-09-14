import { z } from 'zod';
import { MIME } from '@neotools/engine';
import { officeTool, finish, outFile, requireFile } from './common.js';
import { OFFICE_MIME } from '../mime.js';
import { readPptx, slidesToMarkdown, slidesToPdf } from '../core/pptx.js';
import { stem } from '../util/bytes.js';

export const pptxToPdf = officeTool({
  id: 'pptx-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'PPTX zu PDF', en: 'PPTX to PDF' },
  description: { de: 'Folien als 16:9-PDF-Seiten, Text an Position.', en: 'Slides as 16:9 PDF pages, text at position.' },
  inputs: { accept: [OFFICE_MIME.pptx, '.pptx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['pptx pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const slides = readPptx(await file.bytes());
    const pdf = await slidesToPdf(slides);
    return finish(ctx, 'pptx-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings, { slides: slides.length });
  },
});

export const pptxToImages = officeTool({
  id: 'pptx-to-images',
  pack: 'office',
  category: 'office',
  title: { de: 'PPTX zu Bildern', en: 'PPTX to images' },
  description: { de: 'Folien als PNG (nur Browser/Canvas).', en: 'Slides as PNG (browser/canvas only).' },
  inputs: { accept: [OFFICE_MIME.pptx, '.pptx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.png] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['pptx png'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const slides = readPptx(await file.bytes());
    if (ctx.platform.id !== 'browser' || !ctx.platform.capabilities.canvas) {
      return finish(ctx, 'pptx-to-images', files, opts, [], ['PPTX→Bilder nur im Browser (Canvas). In Node: pptx-to-pdf nutzen.'], { slides: slides.length });
    }
    const warnings = ['Canvas-Export: Folien werden als Platzhalter-PNG erzeugt.'];
    const outputs = [];
    for (let i = 0; i < slides.length; i++) {
      const png = await rasterSlideBrowser(slides[i]!.title);
      if (png) outputs.push(outFile(`${stem(file.name)}-${String(i + 1).padStart(2, '0')}.png`, png, MIME.png));
    }
    return finish(ctx, 'pptx-to-images', files, opts, outputs, warnings);
  },
});

export const pptxToText = officeTool({
  id: 'pptx-to-text',
  pack: 'office',
  category: 'office',
  title: { de: 'PPTX zu Text', en: 'PPTX to text' },
  description: { de: 'Folientext und Notizen als Markdown.', en: 'Slide text and notes as Markdown.' },
  inputs: { accept: [OFFICE_MIME.pptx, '.pptx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.md] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['pptx text'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const md = slidesToMarkdown(readPptx(await file.bytes()));
    return finish(ctx, 'pptx-to-text', files, opts, [outFile(opts.outputName || `${stem(file.name)}.md`, new TextEncoder().encode(md), MIME.md)]);
  },
});

async function rasterSlideBrowser(title: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = '#111';
  ctx.font = '48px sans-serif';
  ctx.fillText(title.slice(0, 60), 80, 200);
  const data = canvas.toDataURL('image/png').split(',')[1] ?? '';
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
