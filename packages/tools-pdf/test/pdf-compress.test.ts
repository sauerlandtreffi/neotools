import { describe, expect, it } from 'vitest';
import { MIME } from '@neotools/engine';
import { pdfCompress } from '../src/tools/pdf-compress.js';
import { pdfExtractText } from '../src/tools/pdf-extract-text.js';
import { ctx, pageCount } from './helpers.js';
import { makePdfWithImage } from './helpers-images.js';

describe('pdf-compress', () => {
  it('shrinks a PDF with an embedded PNG, keeps page count and text', { timeout: 90_000 }, async () => {
    const src = await makePdfWithImage({ name: 'big.pdf', text: 'KeepThisText', width: 360, height: 280 });
    const before = (await src.bytes()).byteLength;
    const result = await pdfCompress.run(ctx(), [src], {
      preset: 'heavy',
      linearize: false,
      stripMetadata: true,
    });
    const pdf = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const after = (await pdf.bytes()).byteLength;
    expect(await pageCount(pdf)).toBe(1);
    expect(after).toBeLessThan(before);
    const extracted = await pdfExtractText.run(ctx(), [pdf], { pageBreaks: false });
    const text = new TextDecoder().decode(await extracted.outputs[0]!.bytes());
    expect(text).toContain('KeepThisText');
    const json = result.outputs.find((f) => f.mime === MIME.json)!;
    const report = JSON.parse(new TextDecoder().decode(await json.bytes())) as {
      beforeBytes: number;
      afterBytes: number;
      images: Array<{ action: string }>;
    };
    expect(report.afterBytes).toBeLessThanOrEqual(report.beforeBytes);
  });
});
