import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { pdfAktenbundler } from '../src/tools/pdf-aktenbundler.js';
import { pdfExtractText } from '../src/tools/pdf-extract-text.js';
import { ctx, makePdf, pageCount } from './helpers.js';

describe('pdf-aktenbundler', () => {
  it('adds cover + TOC, outlines, links and Bates text', async () => {
    const a = await makePdf({ name: 'one.pdf', pages: 1, text: 'ONE' });
    const b = await makePdf({ name: 'two.pdf', pages: 2, text: 'TWO' });
    const c = await makePdf({ name: 'three.pdf', pages: 1, text: 'THREE' });
    const result = await pdfAktenbundler.run(
      ctx(),
      [a, b, c],
      {
        title: 'Testakte',
        aktenzeichen: 'AZ-1',
        parteien: 'A ./ B',
        datum: '2026-01-01',
        cover: true,
        toc: true,
        separators: false,
        inheritOutlines: true,
        batesPrefix: 'B',
        batesStart: 1,
        batesDigits: 4,
        batesPosition: 'footer-right',
        headerAktenzeichen: true,
        anlagenPrefix: '',
        outputName: 'akte.pdf',
      },
    );
    const pdf = result.outputs.find((o) => o.name === 'akte.pdf');
    expect(pdf).toBeTruthy();
    const total = await pageCount(pdf!);
    expect(total).toBe(1 + 1 + 1 + 2 + 1);
    const doc = await PDFDocument.load(await pdf!.bytes());
    expect(doc.catalog.has(PDFName.of('Outlines'))).toBe(true);
    let links = 0;
    for (const page of doc.getPages()) {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (!annots) continue;
      for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i);
        if (annot instanceof PDFDict) {
          const sub = annot.get(PDFName.of('Subtype'));
          if (sub instanceof PDFName && sub.toString() === '/Link') links += 1;
        }
      }
    }
    expect(links).toBeGreaterThanOrEqual(3);
    const extracted = await pdfExtractText.run(ctx(), [pdf!], { pageBreaks: true });
    const text = new TextDecoder().decode(await extracted.outputs[0]!.bytes());
    expect(text).toMatch(/B0001/);
    expect(text).toMatch(/B0002/);
    expect(text).toMatch(/AZ-1/);
    const index = JSON.parse(
      new TextDecoder().decode(await result.outputs.find((o) => o.name.endsWith('.json'))!.bytes()),
    ) as { totalPages: number; documents: unknown[] };
    expect(index.totalPages).toBe(total);
    expect(index.documents).toHaveLength(3);
  });
});
