import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import type { VerificationReport } from '@neotools/engine';
import { pdfSanitize } from '../src/tools/pdf-sanitize.js';
import { inspectPdf } from '../src/inspect.js';
import { inspectExtra } from '../src/inspect-extra.js';
import { findSanitizeKeywordsOutsideStreams } from '../src/redact/byte-scan.js';
import { hasIncrementalEof } from '../src/pdf-io.js';

async function dirtyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.setTitle('Secret Title');
  doc.setAuthor('Hidden Author');
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: 'app.alert(1)' }),
  );
  doc.catalog.set(
    PDFName.of('AA'),
    doc.context.obj({ WC: { Type: 'Action', S: 'JavaScript', JS: 'app.alert(2)' } }),
  );
  const names = doc.context.obj({
    JavaScript: { Names: [PDFString.of('boot'), doc.context.obj({ S: 'JavaScript', JS: 'evil()' })] },
    EmbeddedFiles: { Names: [PDFString.of('secret.bin'), doc.context.obj({ F: 'secret.bin' })] },
  });
  doc.catalog.set(PDFName.of('Names'), names);
  doc.catalog.set(
    PDFName.of('AcroForm'),
    doc.context.obj({ Fields: [], XFA: [PDFString.of('<xdp/>')] }),
  );
  const page = doc.getPage(0);
  page.node.set(
    PDFName.of('AA'),
    doc.context.obj({ O: { Type: 'Action', S: 'Launch', F: 'cmd.exe' } }),
  );
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'RichMedia',
    Rect: [0, 0, 10, 10],
    A: { S: 'URI', URI: PDFString.of('https://evil.example/') },
  });
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
  doc.catalog.set(PDFName.of('PieceInfo'), doc.context.obj({ App: { LastModified: PDFString.of('now') } }));
  page.node.set(PDFName.of('Thumb'), doc.context.obj({}));
  const el = doc.context.obj({ Type: 'StructElem', S: PDFName.of('P'), ActualText: PDFString.of('Klartext') });
  doc.catalog.set(
    PDFName.of('StructTreeRoot'),
    doc.context.register(doc.context.obj({ Type: 'StructTreeRoot', K: [doc.context.register(el)] })),
  );
  return doc.save();
}

describe('pdf-sanitize adversarial', () => {
  it('strips catalog JS/AA/OpenAction, XFA, rich media, pieceInfo, thumbs and rewrites bytes', async () => {
    const src = neoFileFromBytes('dirty.pdf', await dirtyPdf(), MIME.pdf);
    const result = await runTool(
      pdfSanitize,
      createToolContext(),
      [src],
      { removeAnnotations: true, flattenForms: true, stripStructTree: true },
    );
    const pdf = result.outputs.find((f) => f.mime === MIME.pdf)!;
    const bytes = await pdf.bytes();
    const after = await PDFDocument.load(bytes);
    const inspect = inspectPdf(after);
    const extra = inspectExtra(after);
    expect(inspect.hasOpenAction).toBe(false);
    expect(inspect.hasJavaScript).toBe(false);
    expect(inspect.hasAA).toBe(false);
    expect(inspect.hasXfa).toBe(false);
    expect(inspect.hasEmbeddedFiles).toBe(false);
    expect(extra.richMediaAnnots).toBe(0);
    expect(extra.pieceInfo).toBe(false);
    expect(extra.thumbnailCount).toBe(0);
    expect(extra.hasStructTree).toBe(false);
    expect(extra.pageAA).toBe(0);
    expect(hasIncrementalEof(bytes)).toBe(false);
    expect(findSanitizeKeywordsOutsideStreams(bytes)).toEqual([]);
    const verification = result.report?.verification as VerificationReport;
    expect(verification.passed).toBe(true);
  });

  it('keep-annots preset still strips page /AA, annotation /A, outline JS and field /AA', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    page.node.set(PDFName.of('AA'), doc.context.obj({ O: { S: 'JavaScript', JS: 'app.alert(3)' } }));
    const link = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 0, 50, 20],
      A: { S: 'URI', URI: PDFString.of('https://evil.example/') },
      AA: { E: { S: 'JavaScript', JS: 'x()' } },
    });
    const widget = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: PDFName.of('Tx'),
      T: PDFString.of('f1'),
      Rect: [0, 30, 50, 50],
      AA: { K: { S: 'JavaScript', JS: 'steal()' }, F: { S: 'SubmitForm', F: PDFString.of('https://evil.example/post') } },
    });
    const widgetRef = doc.context.register(widget);
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(link), widgetRef]));
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [widgetRef], CO: [widgetRef] }));
    const item = doc.context.obj({ Title: PDFString.of('boom'), A: { S: 'Launch', F: PDFString.of('calc.exe') } });
    const itemRef = doc.context.register(item);
    doc.catalog.set(PDFName.of('Outlines'), doc.context.register(doc.context.obj({ Type: 'Outlines', First: itemRef, Last: itemRef, Count: 1 })));
    const before = inspectPdf(doc);
    expect(before.hasLaunchActions).toBe(true);
    expect(before.hasJavaScript).toBe(true);
    const result = await runTool(
      pdfSanitize,
      createToolContext(),
      [neoFileFromBytes('keep.pdf', await doc.save(), MIME.pdf)],
      { removeAnnotations: false, flattenForms: false },
    );
    const bytes = await result.outputs.find((f) => f.mime === MIME.pdf)!.bytes();
    const after = inspectPdf(await PDFDocument.load(bytes));
    expect(after.hasJavaScript).toBe(false);
    expect(after.hasLaunchActions).toBe(false);
    expect(after.hasUriActions).toBe(false);
    expect(after.hasSubmitForm).toBe(false);
    expect(after.annotationCount).toBe(2);
    expect(inspectExtra(await PDFDocument.load(bytes)).pageAA).toBe(0);
    expect(findSanitizeKeywordsOutsideStreams(bytes)).toEqual([]);
    const verification = result.report?.verification as VerificationReport;
    expect(verification.passed).toBe(true);
    expect(verification.checks.length).toBeGreaterThan(10);
  });

  it('byte-scan matches whole name tokens only and covers the sanitize keyword list', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(findSanitizeKeywordsOutsideStreams(enc('<< /AAPL 1 /JSON 2 >>'))).toEqual([]);
    expect(findSanitizeKeywordsOutsideStreams(enc('<< /AA<< >> /JS(x) >>'))).toEqual(['/JS', '/AA']);
    for (const k of ['/JavaScript', '/Launch', '/OpenAction', '/XFA', '/RichMedia', '/EmbeddedFile', '/SubmitForm', '/URI']) {
      expect(findSanitizeKeywordsOutsideStreams(enc(`1 0 obj << ${k} 5 >> endobj`))).toContain(k);
    }
    // inside a stream body the keyword is ignored by design (inflate needed) — documented limit
    expect(findSanitizeKeywordsOutsideStreams(enc('stream\n/JavaScript\nendstream'))).toEqual([]);
  });

  it('fails verify when raw /JavaScript remains outside streams', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const clean = await doc.save();
    const extra = new TextEncoder().encode('\n/JavaScript /Launch\n');
    const injected = new Uint8Array(clean.length + extra.length);
    injected.set(clean);
    injected.set(extra, clean.length);
    const file = neoFileFromBytes('inject.pdf', injected, MIME.pdf);
    const report = await pdfSanitize.verify!(createToolContext(), [file], {
      removeAnnotations: true,
      flattenForms: true,
    });
    expect(report.checks.some((c) => c.id.endsWith(':rawKeywords') && !c.passed)).toBe(true);
    expect(report.passed).toBe(false);
  });
});
