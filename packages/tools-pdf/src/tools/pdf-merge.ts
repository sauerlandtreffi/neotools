import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { addBookmarks } from '../outlines.js';
import { loadPdf, savePdf } from '../pdf-io.js';

const options = z.object({
  bookmarkPerFile: z.boolean().default(true),
  outputName: z.string().default('merged.pdf'),
});

export const pdfMerge = defineTool({
  id: 'pdf-merge',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'PDFs zusammenführen', en: 'Merge PDFs' },
  description: {
    de: 'Mehrere PDFs in der gewählten Reihenfolge zu einer Datei verbinden. Optional ein Lesezeichen pro Quelle.',
    en: 'Combine PDFs in order into one file. Optional bookmark per source file.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options,
  presets: [
    {
      id: 'bookmarks',
      title: { de: 'Mit Lesezeichen', en: 'With bookmarks' },
      options: { bookmarkPerFile: true },
    },
    {
      id: 'plain',
      title: { de: 'Ohne Lesezeichen', en: 'No bookmarks' },
      options: { bookmarkPerFile: false },
    },
  ],
  licenses: PDF_LICENSES,
  seo: {
    keywords: ['pdf merge', 'pdf zusammenführen', 'lokal'],
    faq: [
      {
        q: {
          de: 'Werden Dateien hochgeladen?',
          en: 'Are files uploaded?',
        },
        a: {
          de: 'Nein. Die Zusammenführung läuft lokal (Browser, CLI oder Desktop).',
          en: 'No. Merging runs locally in the browser, CLI, or desktop app.',
        },
      },
    ],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress((i + 0.5) / Math.max(files.length, 1), file.name);
      return loadPdf(file);
    });
    if (!loaded.ok.length) {
      return {
        outputs: [],
        warnings: ['Keine gültige PDF-Datei.'],
        report: { batch: loaded.protocol },
      };
    }
    const out = await (await import('pdf-lib')).PDFDocument.create();
    const bookmarks: Array<{ title: string; pageIndex: number }> = [];
    for (const { file, value: src } of loaded.ok) {
      const start = out.getPageCount();
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
      bookmarks.push({ title: file.name, pageIndex: start });
    }
    if (parsed.bookmarkPerFile) addBookmarks(out, bookmarks);
    const result = await savePdf(out, parsed.outputName);
    const provenance = await createProvenance('pdf-merge', parsed, files);
    ctx.progress(1, 'Fertig');
    return {
      outputs: [result],
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, filesMerged: loaded.ok.length }, provenance),
    };
  },
});
