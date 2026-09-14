import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME } from '@neotools/engine';
import { pdfLock } from '../src/tools/pdf-lock.js';
import { pdfRepair } from '../src/tools/pdf-repair.js';
import { pdfExtractText } from '../src/tools/pdf-extract-text.js';
import { QPDF_WRONG_PASSWORD } from '../src/qpdf/index.js';
import { ctx, makePdf, pageCount } from './helpers.js';

describe('pdf-lock', () => {
  it('encrypts then decrypts a roundtrip and keeps text', { timeout: 90_000 }, async () => {
    const src = await makePdf({ name: 'lock.pdf', pages: 2, text: 'LockSecret' });
    const locked = await pdfLock.run(ctx(), [src], {
      mode: 'encrypt',
      userPassword: 'user-pw',
      ownerPassword: 'owner-pw',
      password: '',
      allowPrint: true,
      allowCopy: false,
      allowModify: false,
      allowAnnotate: true,
      linearize: false,
    });
    expect(locked.outputs, locked.warnings.join(' | ')).toHaveLength(1);
    const enc = await locked.outputs[0]!.bytes();
    await expect(PDFDocument.load(enc)).rejects.toThrow(/encrypted/i);

    const opened = await pdfLock.run(ctx(), locked.outputs, {
      mode: 'decrypt',
      userPassword: '',
      ownerPassword: '',
      password: 'user-pw',
      allowPrint: true,
      allowCopy: true,
      allowModify: false,
      allowAnnotate: true,
      linearize: false,
    });
    expect(await pageCount(opened.outputs[0]!)).toBe(2);
    const text = await pdfExtractText.run(ctx(), opened.outputs, { pageBreaks: false });
    const body = new TextDecoder().decode(await text.outputs[0]!.bytes());
    expect(body).toContain('LockSecret');
  });

  it('rejects a wrong password with a clear message', async () => {
    const src = await makePdf({ name: 'badpw.pdf', pages: 1, text: 'X' });
    const locked = await pdfLock.run(ctx(), [src], {
      mode: 'encrypt',
      userPassword: 'right',
      ownerPassword: 'right',
      password: '',
      allowPrint: true,
      allowCopy: true,
      allowModify: true,
      allowAnnotate: true,
      linearize: false,
    });
    const result = await pdfLock.run(ctx(), locked.outputs, {
      mode: 'decrypt',
      userPassword: '',
      ownerPassword: '',
      password: 'wrong',
      allowPrint: true,
      allowCopy: true,
      allowModify: true,
      allowAnnotate: true,
      linearize: false,
    });
    expect(result.outputs).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(new RegExp(QPDF_WRONG_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

describe('pdf-repair', () => {
  it('rebuilds a valid PDF and reports the method', async () => {
    const src = await makePdf({ name: 'ok.pdf', pages: 2, text: 'RepairMe' });
    const result = await pdfRepair.run(ctx(), [src], { linearize: false });
    const pdf = result.outputs.find((f) => f.mime === MIME.pdf)!;
    expect(await pageCount(pdf)).toBe(2);
    const json = result.outputs.find((f) => f.mime === MIME.json)!;
    const report = JSON.parse(new TextDecoder().decode(await json.bytes())) as {
      method: string;
      repaired: string[];
    };
    expect(['qpdf', 'pdflib-rebuild', 'pdfjs-raster']).toContain(report.method);
    expect(report.repaired.length).toBeGreaterThan(0);
  });
});
