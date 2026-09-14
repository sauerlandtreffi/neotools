import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { pdfCompare } from '../src/tools/pdf-compare.js';
import { ctx } from './helpers.js';

async function textPdf(name: string, pages: string[]): Promise<ReturnType<typeof neoFileFromBytes>> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([400, 300]);
    page.drawText(text, { x: 40, y: 200, size: 16, font, color: rgb(0, 0, 0) });
  }
  return neoFileFromBytes(name, await doc.save(), MIME.pdf);
}

describe('pdf-compare', () => {
  it('reports word change, inserted sentence and added page', async () => {
    const left = await textPdf('old.pdf', ['The party agrees.', 'Second page stays.']);
    const right = await textPdf('new.pdf', [
      'The party accepts. Extra sentence added.',
      'Second page stays.',
      'Annex page is new.',
    ]);
    const result = await pdfCompare.run(ctx(), [left, right], {
      mode: 'text',
      layout: 'redline',
      locale: 'en',
      dpi: 72,
    });
    expect(result.outputs.some((o) => o.mime === MIME.pdf)).toBe(true);
    const json = result.outputs.find((o) => o.name.endsWith('.json'));
    expect(json).toBeTruthy();
    const report = JSON.parse(new TextDecoder().decode(await json!.bytes())) as {
      summary: { changes: number; pagesAdded: number[]; inserts: number; replaces: number };
      changes: Array<{ kind: string; excerpt: string; before?: string; after?: string }>;
    };
    expect(report.summary.pagesAdded).toEqual([3]);
    expect(report.changes.some((c) => c.kind === 'replace' && /agrees|accepts/i.test(c.excerpt))).toBe(true);
    expect(
      report.changes.some(
        (c) => c.kind === 'insert' && /Extra sentence|sentence added/i.test(c.excerpt + (c.after ?? '')),
      ),
    ).toBe(true);
    expect(report.changes.some((c) => /Annex page is new/i.test(c.excerpt + (c.after ?? '')))).toBe(true);
    expect(report.summary.changes).toBeGreaterThanOrEqual(3);
  });
});
