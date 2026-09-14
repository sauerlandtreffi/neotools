import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import { pdfSign } from '../src/tools/pdf-sign.js';
import { makeSelfSignedP12 } from '../src/sign/p12.js';
import { verifyPdfSignatures } from '../src/sign/verify.js';
import { ctx, makePdf } from './helpers.js';

describe('pdf-sign', () => {
  it('signs with a generated P12 and verifies as valid', async () => {
    const { p12 } = await makeSelfSignedP12('test-pw');
    const pdf = await makePdf({ name: 'doc.pdf', pages: 1, text: 'Sign me' });
    const p12file = neoFileFromBytes('cert.p12', p12, 'application/x-pkcs12');
    const result = await runTool(pdfSign, createToolContext(), [pdf, p12file], {
      mode: 'sign',
      password: 'test-pw',
      page: 1,
      visible: true,
      x: 40,
      y: 40,
      width: 200,
      height: 40,
      tsaUrl: '',
      locale: 'de',
    });
    const signed = result.outputs.find((o) => o.mime === MIME.pdf);
    expect(signed).toBeTruthy();
    const verification = result.report?.verification as { passed?: boolean } | undefined;
    expect(verification?.passed).toBe(true);
    const check = await verifyPdfSignatures(await signed!.bytes());
    expect(check.valid).toBe(true);
    expect(check.signatures[0]?.pades).toMatch(/B-B|B-T/);
  }, 120_000);

  it('detects incremental change after signing', async () => {
    const { p12 } = await makeSelfSignedP12('test-pw');
    const pdf = await makePdf({ name: 'doc.pdf', pages: 1, text: 'Sign me' });
    const signed = await runTool(pdfSign, ctx(), [pdf, neoFileFromBytes('c.p12', p12, 'application/x-pkcs12')], {
      mode: 'sign',
      password: 'test-pw',
      visible: false,
      page: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      tsaUrl: '',
      locale: 'en',
    });
    const bytes = await signed.outputs.find((o) => o.mime === MIME.pdf)!.bytes();
    const tampered = new Uint8Array(bytes.length + 8);
    tampered.set(bytes);
    tampered.set(new TextEncoder().encode('\n%%EOF\n'), bytes.length);
    const report = await verifyPdfSignatures(tampered);
    expect(report.signatures[0]?.modifiedAfter).toBe(true);
    expect(report.valid).toBe(false);
  }, 120_000);

  it('marks a garbage signature as invalid', async () => {
    const raw = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\ntrailer<< /Root 1 0 R /ByteRange [0 10 20 10] /Contents <00> >>\n%%EOF\n',
    );
    const report = await verifyPdfSignatures(raw);
    if (report.signatures.length) {
      expect(report.signatures.some((s) => !s.valid || !s.cms.valid)).toBe(true);
    } else {
      expect(report.valid).toBe(false);
    }
  });
});
