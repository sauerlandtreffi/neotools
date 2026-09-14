import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { DACH_LICENSES } from '../licenses.js';
import { pdfPageTexts, isPdfName } from '../pdf/text.js';
import { extractReceiptFields, receiptFilename } from '../receipts/extract.js';
import { decodeGiroFromImage } from '../girocode/read.js';

const options = z.object({
  mode: z.enum(['blank', 'qr', 'marker', 'fixed-n', 'auto']).default('auto'),
  pagesPerReceipt: z.coerce.number().int().min(1).default(1),
  marker: z.string().default('Rechnung|Beleg'),
});

function isBlankText(t: string): boolean {
  return t.replace(/\s/g, '').length < 8;
}

export const dachReceiptSplit = defineTool({
  id: 'dach-receipt-split',
  pack: 'dach',
  category: 'dach',
  title: { de: 'Beleg-Stapel teilen', en: 'Split receipt stack' },
  description: {
    de: 'Stapel-PDF anhand Leerseiten, QR/Barcode, Textmarkern oder fester Seitenzahl in Einzelbelege teilen.',
    en: 'Split a stacked PDF by blank pages, QR/barcode, text markers, or a fixed page count.',
  },
  inputs: { accept: [MIME.pdf, MIME.png, MIME.jpeg], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  licenses: DACH_LICENSES,
  seo: { keywords: ['beleg split', 'receipt split'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const index: unknown[] = [];
    for (const file of files) {
      if (!isPdfName(file.name, file.mime)) {
        outputs.push(neoFileFromBytes(file.name, await file.bytes(), file.mime));
        continue;
      }
      const bytes = await file.bytes();
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const texts = await pdfPageTexts(bytes);
      const cuts: number[] = [0];
      if (parsed.mode === 'fixed-n') {
        for (let i = parsed.pagesPerReceipt; i < src.getPageCount(); i += parsed.pagesPerReceipt) cuts.push(i);
      } else {
        const marker = new RegExp(parsed.marker, 'i');
        let lastInv = '';
        for (let i = 0; i < texts.length; i++) {
          const t = texts[i] ?? '';
          const blank = isBlankText(t);
          const marked = marker.test(t) && i > 0;
          const fields = extractReceiptFields(t, i + 1);
          const invChange = Boolean(fields.invoiceNumber && lastInv && fields.invoiceNumber !== lastInv);
          if (fields.invoiceNumber) lastInv = fields.invoiceNumber;
          let qr = false;
          if (parsed.mode === 'qr' || parsed.mode === 'auto') {
            try {
              qr = Boolean(await decodeGiroFromImage(bytes));
            } catch {
              qr = false;
            }
          }
          if (i > 0 && (parsed.mode === 'blank' || parsed.mode === 'auto') && blank) cuts.push(i);
          else if (i > 0 && (parsed.mode === 'marker' || parsed.mode === 'auto') && (marked || invChange)) cuts.push(i);
          else if (i > 0 && qr && parsed.mode === 'qr') cuts.push(i);
        }
      }
      const uniq = [...new Set(cuts)].sort((a, b) => a - b);
      for (let c = 0; c < uniq.length; c++) {
        const from = uniq[c]!;
        const to = uniq[c + 1] ?? src.getPageCount();
        if (to <= from) continue;
        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, Array.from({ length: to - from }, (_, k) => from + k));
        copied.forEach((p) => out.addPage(p));
        const chunk = new Uint8Array(await out.save({ updateFieldAppearances: false }));
        const fields = extractReceiptFields(texts.slice(from, to).join('\n'), from + 1);
        const name = receiptFilename(fields, c);
        outputs.push(neoFileFromBytes(name, chunk, MIME.pdf));
        index.push({ file: name, pages: [from + 1, to], fields });
      }
    }
    outputs.push(neoFileFromBytes('receipt-split.json', new TextEncoder().encode(JSON.stringify(index, null, 2)), MIME.json));
    ctx.progress(1, 'fertig');
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ count: index.length }, await createProvenance('dach-receipt-split', parsed, files)),
    };
  },
});
