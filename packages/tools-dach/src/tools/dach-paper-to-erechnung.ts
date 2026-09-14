import { z } from 'zod';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { extractInvoiceFields } from '../erechnung/paper.js';
import { generateCii } from '../erechnung/generate-cii.js';
import { generateUbl } from '../erechnung/generate-ubl.js';
import { pdfPageTexts, isPdfName, isImageName } from '../pdf/text.js';
import { utf8 } from '../util/money.js';

const options = z.object({
  repairScans: z.boolean().default(false),
  autoGenerate: z.boolean().default(false),
  minConfidence: z.coerce.number().min(0).max(1).default(0.85),
  ocr: z.boolean().default(true),
});

export const dachPaperToErechnung = defineTool({
  id: 'dach-paper-to-erechnung',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Papierrechnung → E-Rechnung', en: 'Paper invoice → e-invoice' },
  description: {
    de: 'OCR/Textlayer, Feldextraktion, vorbefülltes JSON plus Prüfliste. Generate nur bei autoGenerate + Mindestkonfidenz.',
    en: 'OCR/text layer, field extraction, prefilled JSON plus checklist. Generate only with autoGenerate + min confidence.',
  },
  inputs: { accept: [MIME.pdf, MIME.png, MIME.jpeg, 'image/jpg'], multiple: true, min: 1 },
  outputs: { mime: [MIME.json, MIME.md, MIME.xml] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['papierrechnung', 'ocr', 'xrechnung'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const warnings: string[] = [];
    if (parsed.repairScans) {
      warnings.push('image-doc-repair ist eine Pipeline-Stufe (Pack image-ai), nicht automatisch verdrahtet.');
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / files.length, file.name);
      let text = '';
      const bytes = await file.bytes();
      if (isPdfName(file.name, file.mime)) {
        const pages = await pdfPageTexts(bytes);
        text = pages.join('\n');
        if (parsed.ocr && text.replace(/\s/g, '').length < 20 && ctx.platform.capabilities.ocr) {
          warnings.push(`${file.name}: wenig Textlayer — OCR-Hinweis (recognizePage), Raster braucht Canvas.`);
        }
      } else if (isImageName(file.name, file.mime) && parsed.ocr && ctx.platform.capabilities.ocr) {
        warnings.push(`${file.name}: Bild-OCR über pdf-ocr / recognizePage — hier Regex auf Dateiname/kein Raster.`);
        text = file.name;
      }
      const extracted = extractInvoiceFields(text || file.name);
      const stem = file.name.replace(/\.[^.]+$/, '');
      outputs.push(neoFileFromBytes(`${stem}-draft.json`, utf8(JSON.stringify({ data: extracted.data, confidence: extracted.confidence }, null, 2)), MIME.json));
      const md = [
        `# Bitte bestätigen: ${file.name}`,
        '',
        `Mittlere Konfidenz: ${(extracted.meanConfidence * 100).toFixed(0)} %`,
        '',
        ...extracted.checklist.map((c) => `- [ ] ${c}`),
        '',
        '```json',
        JSON.stringify(extracted.data, null, 2),
        '```',
        '',
      ].join('\n');
      outputs.push(neoFileFromBytes(`${stem}-check.md`, utf8(md), MIME.md));
      if (parsed.autoGenerate && extracted.meanConfidence >= parsed.minConfidence) {
        outputs.push(neoFileFromBytes(`${stem}-cii.xml`, utf8(generateCii(extracted.data)), MIME.xml));
        outputs.push(neoFileFromBytes(`${stem}-ubl.xml`, utf8(generateUbl(extracted.data)), MIME.xml));
      }
    }
    return {
      outputs,
      warnings,
      report: attachProvenance({ auto: parsed.autoGenerate }, await createProvenance('dach-paper-to-erechnung', parsed, files)),
    };
  },
});
