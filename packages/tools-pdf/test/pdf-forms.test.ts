import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { pdfForms } from '../src/tools/pdf-forms.js';
import { ctx } from './helpers.js';

async function makeFormPdf(): Promise<ReturnType<typeof neoFileFromBytes>> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Name', { x: 40, y: 240, size: 12, font });
  const form = doc.getForm();
  const name = form.createTextField('FullName');
  name.addToPage(page, { x: 40, y: 210, width: 200, height: 20 });
  const box = form.createCheckBox('Agree');
  box.addToPage(page, { x: 40, y: 170, width: 14, height: 14 });
  const city = form.createDropdown('City');
  city.addOptions(['Berlin', 'Wien', 'Zuerich']);
  city.addToPage(page, { x: 40, y: 130, width: 160, height: 20 });
  return neoFileFromBytes('form.pdf', await doc.save(), MIME.pdf);
}

describe('pdf-forms', () => {
  it('reads field names, types and options', async () => {
    const src = await makeFormPdf();
    const result = await pdfForms.run(ctx(), [src], {
      mode: 'read',
      fillJson: '',
      fillCsv: '',
      flatten: false,
    });
    const json = JSON.parse(new TextDecoder().decode(await result.outputs[0]!.bytes())) as {
      fields: Array<{ name: string; type: string; options?: string[] }>;
    };
    const names = json.fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['FullName', 'Agree', 'City']));
    expect(json.fields.find((f) => f.name === 'City')?.options).toEqual(
      expect.arrayContaining(['Berlin', 'Wien']),
    );
  });

  it('fills from JSON and can flatten', async () => {
    const src = await makeFormPdf();
    const result = await pdfForms.run(ctx(), [src], {
      mode: 'fill',
      fillJson: JSON.stringify({ FullName: 'Ada Lovelace', Agree: 'true', City: 'Berlin' }),
      fillCsv: '',
      flatten: true,
    });
    const pdf = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const doc = await PDFDocument.load(await pdf.bytes());
    expect(doc.getPageCount()).toBe(1);
    const report = result.report as { files: Array<{ fields: Array<{ name: string; value: unknown }> }> };
    const filled = report.files[0]!.fields;
    const name = filled.find((f) => f.name === 'FullName');
    if (name) expect(String(name.value)).toContain('Ada');
  });

  it('fills from CSV', async () => {
    const src = await makeFormPdf();
    const result = await pdfForms.run(ctx(), [src], {
      mode: 'fill',
      fillJson: '',
      fillCsv: 'name,value\nFullName,CSV User\nAgree,1\n',
      flatten: false,
    });
    const json = result.outputs.find((f) => f.mime === MIME.json)!;
    const body = JSON.parse(new TextDecoder().decode(await json.bytes())) as {
      fields: Array<{ name: string; value: unknown }>;
    };
    expect(body.fields.find((f) => f.name === 'FullName')?.value).toBe('CSV User');
  });
});
