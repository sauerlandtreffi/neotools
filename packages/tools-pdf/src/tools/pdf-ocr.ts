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
import { loadPdf, savePdf, stem } from '../pdf-io.js';
import { openPdfjsDocument } from '../pdfjs.js';
import { renderPdfjsPage } from '../render-page.js';
import {
  pageHasTextLayer,
  recognizePage,
  wordsToPdfPositions,
  writeInvisibleWords,
} from '../ocr.js';

const options = z.object({
  languages: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(/[+,]/).map((s) => s.trim()).filter(Boolean)))
    .default(['deu', 'eng']),
  dpi: z.coerce.number().min(72).max(400).default(300),
  forceAll: z.boolean().default(false),
  outputTxt: z.boolean().default(false),
});

export const pdfOcr = defineTool({
  id: 'pdf-ocr',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'OCR → durchsuchbares PDF', en: 'OCR → searchable PDF' },
  description: {
    de: 'Seiten ohne Textlayer erkennen, mit Tesseract.js (deu+eng, selbst gehostet) OCR und unsichtbaren Textlayer (Render-Mode 3) schreiben.',
    en: 'Detect pages without a text layer, OCR with Tesseract.js (deu+eng, self-hosted), write an invisible text layer (render mode 3).',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.txt, MIME.json] },
  options,
  presets: [
    { id: 'deu-eng', title: { de: 'Deutsch + Englisch', en: 'German + English' }, options: { languages: ['deu', 'eng'] } },
    { id: 'force', title: { de: 'Alle Seiten', en: 'All pages' }, options: { forceAll: true } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf ocr', 'texterkennung', 'tesseract'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const langs = parsed.languages.length ? parsed.languages : ['deu', 'eng'];
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, fi) => {
      const data = await file.bytes();
      const src = await loadPdf(file);
      const pdfjs = await openPdfjsDocument(data);
      const pageReports: unknown[] = [];
      const txtParts: string[] = [];
      let wordsTotal = 0;
      let confSum = 0;
      let confN = 0;
      let processed = 0;
      let skipped = 0;

      for (let i = 1; i <= pdfjs.numPages; i++) {
        ctx.progress((fi + i / pdfjs.numPages) / Math.max(files.length, 1), `OCR Seite ${i}/${pdfjs.numPages}`);
        const jsPage = await pdfjs.getPage(i);
        const hasText = await pageHasTextLayer(jsPage);
        if (hasText && !parsed.forceAll) {
          skipped += 1;
          pageReports.push({ page: i, skipped: true, reason: 'textlayer' });
          continue;
        }
        const raster = await renderPdfjsPage(jsPage, parsed.dpi, ctx.platform);
        const ocr = await recognizePage(raster, langs, ctx);
        const pdfPage = src.getPage(i - 1);
        const { width, height } = pdfPage.getSize();
        const placed = wordsToPdfPositions(ocr.words, width, height, raster.width, raster.height);
        const written = await writeInvisibleWords(pdfPage, placed);
        processed += 1;
        wordsTotal += ocr.words.length;
        if (ocr.meanConfidence) {
          confSum += ocr.meanConfidence;
          confN += 1;
        }
        if (parsed.outputTxt) {
          txtParts.push(`--- Seite ${i} ---\n${ocr.words.map((w) => w.text).join(' ')}`);
        }
        pageReports.push({ page: i, words: ocr.words.length, written, confidence: ocr.meanConfidence });
      }
      await pdfjs.destroy();
      const pdf = await savePdf(src, `${stem(file.name)}-ocr.pdf`);
      outputs.push(pdf);
      if (parsed.outputTxt) {
        outputs.push(
          neoFileFromBytes(
            `${stem(file.name)}-ocr.txt`,
            new TextEncoder().encode(txtParts.join('\n\n') + '\n'),
            MIME.txt,
          ),
        );
      }
      const fileReport = {
        file: file.name,
        pages: pdfjs.numPages,
        processed,
        skipped,
        words: wordsTotal,
        meanConfidence: confN ? confSum / confN : 0,
        pagesDetail: pageReports,
      };
      outputs.push(
        neoFileFromBytes(
          `${stem(file.name)}-ocr-report.json`,
          new TextEncoder().encode(JSON.stringify(fileReport, null, 2)),
          MIME.json,
        ),
      );
      reports.push(fileReport);
      return pdf;
    });
    const provenance = await createProvenance('pdf-ocr', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
});
