import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { pdfFormMailmerge } from '../src/tools/pdf-form-mailmerge.js';
import { ctx } from './helpers.js';

async function makeFormPdf(): Promise<ReturnType<typeof neoFileFromBytes>> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Name', { x: 40, y: 240, size: 12, font });
  const form = doc.getForm();
  const name = form.createTextField('FullName');
  name.addToPage(page, { x: 40, y: 210, width: 200, height: 20 });
  return neoFileFromBytes('form.pdf', await doc.save(), MIME.pdf);
}

describe('pdf-form-mailmerge', () => {
  it('n CSV rows → n PDFs with field values', async () => {
    const form = await makeFormPdf();
    const csv = neoFileFromBytes('rows.csv', new TextEncoder().encode('FullName\nAda Lovelace\nGrace Hopper\n'), MIME.csv);
    const result = await pdfFormMailmerge.run(ctx(), [form, csv], {
      mappingJson: '',
      filenamePattern: '{n}-{FullName}',
      merge: false,
      flatten: false,
    });
    const pdfs = result.outputs.filter((o) => o.mime === MIME.pdf);
    expect(pdfs).toHaveLength(2);
    const texts: string[] = [];
    for (const pdf of pdfs) {
      const doc = await PDFDocument.load(await pdf.bytes());
      texts.push(doc.getForm().getTextField('FullName').getText() ?? '');
    }
    expect(texts).toEqual(expect.arrayContaining(['Ada Lovelace', 'Grace Hopper']));
  });
});
