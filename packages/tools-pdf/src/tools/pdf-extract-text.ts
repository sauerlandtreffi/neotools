import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { stem } from '../pdf-io.js';
import { openPdfjsDocument } from '../pdfjs.js';

const options = z.object({
  pageBreaks: z.boolean().default(true),
});

function itemsToLine(items: Array<{ str?: string; hasEOL?: boolean }>): string {
  let out = '';
  for (const item of items) {
    out += item.str ?? '';
    if (item.hasEOL) out += '\n';
    else out += ' ';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export const pdfExtractText = defineTool({
  id: 'pdf-extract-text',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Text extrahieren', en: 'Extract text' },
  description: {
    de: 'Text mit PDF.js (getTextContent) nach .txt, optional mit Seitenumbrüchen.',
    en: 'Extract text with PDF.js (getTextContent) to .txt, optional page breaks.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.txt] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf text', 'ocr-frei', 'extract'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, fi) => {
      ctx.progress(fi / Math.max(files.length, 1), file.name);
      const pdf = await openPdfjsDocument(await file.bytes());
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = itemsToLine(content.items as Array<{ str?: string; hasEOL?: boolean }>);
        if (parsed.pageBreaks) {
          parts.push(`--- Seite ${i} / ${pdf.numPages} ---\n${text}`);
        } else {
          parts.push(text);
        }
      }
      await pdf.destroy();
      const body = parts.join(parsed.pageBreaks ? '\n\n' : '\n') + '\n';
      return neoFileFromBytes(`${stem(file.name)}.txt`, new TextEncoder().encode(body), MIME.txt);
    });
    const provenance = await createProvenance('pdf-extract-text', parsed, files);
    return {
      outputs: loaded.ok.map((r) => r.value),
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol }, provenance),
    };
  },
});
