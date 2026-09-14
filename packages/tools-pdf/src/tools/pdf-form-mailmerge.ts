import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import { MIME, attachProvenance, createProvenance, defineTool, neoFileFromBytes } from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { fillAcroForm, parseMapping } from '../forms/fill.js';
import { filenameFromPattern } from '../mailmerge/rows.js';
import { parseTable } from '../mailmerge/csv.js';

const options = z.object({
  mappingJson: z.string().default(''),
  filenamePattern: z.string().default('{n}'),
  merge: z.boolean().default(false),
  flatten: z.boolean().default(false),
});

export const pdfFormMailmerge = defineTool({
  id: 'pdf-form-mailmerge',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'Formular-Mailmerge', en: 'Form mail merge' },
  description: {
    de: 'CSV/XLSX-Zeilen in ein AcroForm füllen (Spalte = Feld). Ein PDF pro Zeile oder zusammengeführt, optional flatten.',
    en: 'Fill an AcroForm from CSV/XLSX rows (column = field). One PDF per row or merged, optional flatten.',
  },
  inputs: { accept: [MIME.pdf, MIME.csv, 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['mailmerge', 'acroform', 'csv'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const pdfFile = files.find((f) => f.mime === MIME.pdf || /\.pdf$/i.test(f.name));
    if (!pdfFile) return { outputs: [], warnings: ['Kein Formular-PDF.'], report: {} };
    const template = await pdfFile.bytes();
    const mapping = parseMapping(parsed.mappingJson);
    const rows: Record<string, string>[] = [];
    for (const file of files) {
      if (file === pdfFile) continue;
      rows.push(...(await parseTable(file.name, await file.bytes())));
    }
    if (!rows.length) return { outputs: [], warnings: ['Keine CSV/XLSX-Zeilen.'], report: {} };
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const merged = parsed.merge ? await PDFDocument.create() : null;
    const made: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      ctx.progress(i / rows.length, `Zeile ${i + 1}`);
      const doc = await PDFDocument.load(template, { ignoreEncryption: true, updateMetadata: false });
      fillAcroForm(doc, rows[i]!, mapping);
      if (parsed.flatten) {
        try {
          doc.getForm().flatten();
        } catch {
          // already flat
        }
      }
      const bytes = new Uint8Array(await doc.save({ updateFieldAppearances: true }));
      const name = filenameFromPattern(parsed.filenamePattern, rows[i]!, i + 1);
      if (merged) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      } else {
        outputs.push(neoFileFromBytes(name, bytes, MIME.pdf));
      }
      made.push(name);
    }
    if (merged) {
      outputs.push(neoFileFromBytes('mailmerge.pdf', new Uint8Array(await merged.save({ updateFieldAppearances: false })), MIME.pdf));
    }
    outputs.push(neoFileFromBytes('mailmerge.json', new TextEncoder().encode(JSON.stringify({ files: made, rows: rows.length }, null, 2)), MIME.json));
    return {
      outputs,
      warnings: [],
      report: attachProvenance({ rows: rows.length, files: made }, await createProvenance('pdf-form-mailmerge', parsed, files)),
    };
  },
});
