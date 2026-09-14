import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { inspectPdfUa } from '../src/ua/inspect.js';
import { repairPdfUa } from '../src/ua/repair.js';

async function untaggedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Hallo Barrierefreiheit', { x: 40, y: 200, size: 14, font });
  return new Uint8Array(await doc.save());
}

describe('pdf-ua', () => {
  it('untagged PDF has findings; repair reduces them', async () => {
    const bytes = await untaggedPdf();
    const before = await inspectPdfUa(bytes);
    const failedBefore = before.filter((f) => !f.passed);
    expect(failedBefore.map((f) => f.id)).toEqual(
      expect.arrayContaining(['marked', 'struct', 'lang', 'title', 'display-title', 'tabs', 'pdfuaid']),
    );
    const repaired = await repairPdfUa(bytes, { lang: 'de-DE', title: 'Test', tag: false });
    const after = await inspectPdfUa(repaired.bytes);
    const failedAfter = after.filter((f) => !f.passed);
    expect(failedAfter.length).toBeLessThan(failedBefore.length);
    expect(after.find((f) => f.id === 'lang')?.passed).toBe(true);
    expect(after.find((f) => f.id === 'title')?.passed).toBe(true);
    expect(after.find((f) => f.id === 'marked')?.passed).toBe(true);
    expect(after.find((f) => f.id === 'display-title')?.passed).toBe(true);
    expect(after.find((f) => f.id === 'tabs')?.passed).toBe(true);
    expect(after.find((f) => f.id === 'struct')?.passed).toBe(false);
  });
});
