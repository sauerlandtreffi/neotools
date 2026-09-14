import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { MIME, neoFileFromBytes } from '@neotools/engine';
import { checkErvFiles } from '../src/erv/check.js';
import { dachBeaErv } from '../src/tools/dach-bea-erv.js';
import { createToolContext } from '@neotools/engine';

async function blank(
  name: string,
  extra?: (doc: PDFDocument) => void | Promise<void>,
): Promise<{ name: string; size: number; bytes: Uint8Array }> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  await extra?.(doc);
  const bytes = new Uint8Array(await doc.save());
  return { name, size: bytes.byteLength, bytes };
}

describe('dach-bea-erv rules', () => {
  it('fails each configured rule at least once', async () => {
    const umlaut = await blank('gültig.pdf');
    const js = await blank('okname.pdf', (doc) => {
      doc.catalog.set(
        PDFName.of('OpenAction'),
        doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: 'app.alert(1)' }),
      );
    });
    const form = await blank('form.pdf', (doc) => {
      doc.addPage();
      const field = doc.getForm().createTextField('x');
      field.setText('a');
    });
    const attach = await blank('attach.pdf', async (doc) => {
      await doc.attach(new Uint8Array([1, 2, 3]), 'a.txt', { mimeType: 'text/plain' });
    });
    const encBytes = new TextEncoder().encode('%PDF-1.4\n<< /Encrypt 1 0 R >>\n%%EOF\n');
    const enc = { name: 'enc.pdf', size: encBytes.byteLength, bytes: encBytes };
    const huge = { name: 'huge.pdf', size: 209715200 + 10, bytes: (await blank('huge.pdf')).bytes };
    const many = await Promise.all(Array.from({ length: 3 }, (_, i) => blank(`f${i}.pdf`)));
    const report = await checkErvFiles([
      umlaut,
      js,
      form,
      attach,
      enc,
      huge,
      ...many,
    ]);
    const ids = new Set(report.files.flatMap((f) => f.results.filter((r) => r.light !== 'green').map((r) => r.id)));
    expect(ids.has('filename')).toBe(true);
    expect(ids.has('no-js')).toBe(true);
    expect(ids.has('no-forms')).toBe(true);
    expect(ids.has('no-embedded') || ids.has('no-encrypt')).toBe(true);
    expect(ids.has('no-encrypt')).toBe(true);
    expect(ids.has('filesize')).toBe(true);
    expect(ids.has('page-a4') || ids.has('pdfa-recommended') || ids.has('text-layer')).toBe(true);

    const one = await blank('n0.pdf');
    const countReport = await checkErvFiles(Array.from({ length: 1001 }, (_, i) => ({ ...one, name: `n${i}.pdf` })));
    expect(countReport.files[0]!.results.some((r) => r.id === 'file-count' && r.light === 'red')).toBe(true);

    const msg = await blank('msg.pdf');
    const msgReport = await checkErvFiles([{ ...msg, size: 1048576000 + 1 }]);
    expect(msgReport.files[0]!.results.some((r) => r.id === 'message-size' && r.light !== 'green')).toBe(true);
  }, 120_000);

  it('tool writes json + markdown', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    page.drawText('Hello ERV');
    const file = neoFileFromBytes('Hello_ERV.pdf', await doc.save(), MIME.pdf);
    const result = await dachBeaErv.run(createToolContext(), [file], { autoFix: false, locale: 'de' });
    expect(result.outputs.some((o) => o.name.endsWith('.json'))).toBe(true);
    expect(result.outputs.some((o) => o.name.endsWith('.md'))).toBe(true);
  });
});
