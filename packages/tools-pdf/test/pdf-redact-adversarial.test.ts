import { PDFDict, PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { MIME, createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import { pdfRedact } from '../src/tools/pdf-redact.js';
import { extractAllText } from '../src/redact/text-map.js';
import { findNeedlesInPdfBytes } from '../src/redact/byte-scan.js';
import { findPatternMatches, isValidIban, stripInvisible } from '../src/redact/patterns.js';
import { hasIncrementalEof } from '../src/pdf-io.js';
import { verifyRedactedPdf } from '../src/redact/verify.js';
import { blankNeedlesInBytes, tokenizeContent } from '../src/redact/content-stream.js';

const IBAN = 'DE89370400440532013000';

async function runAuto(bytes: Uint8Array, name = 'attack.pdf') {
  return runTool(
    pdfRedact,
    createToolContext(),
    [neoFileFromBytes(name, bytes, MIME.pdf)],
    { mode: 'auto', patterns: ['iban', 'email'], ner: false, rasterizeFallback: true },
  );
}

function pdfOut(result: Awaited<ReturnType<typeof runAuto>>) {
  return result.outputs.find((f) => f.mime === MIME.pdf)!;
}

/** Append a PDF incremental update section holding one orphan (unreferenced) uncompressed stream. */
function appendIncrementalUpdate(base: Uint8Array, streamBody: string): Uint8Array {
  const latin1 = new TextDecoder('latin1');
  const text = latin1.decode(base);
  const size = Number(/\/Size (\d+)/.exec(text)?.[1] ?? '0');
  const root = /\/Root (\d+ \d+ R)/.exec(text)?.[1] ?? '1 0 R';
  const prevMatches = [...text.matchAll(/startxref\s+(\d+)/g)];
  const prev = prevMatches.at(-1)?.[1] ?? '0';
  const objNum = size;
  const offset = base.length + 1;
  const obj = `\n${objNum} 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`;
  const xrefPos = base.length + obj.length;
  const tail =
    `xref\n${objNum} 1\n${String(offset).padStart(10, '0')} 00000 n \n` +
    `trailer\n<< /Size ${objNum + 1} /Root ${root} /Prev ${prev} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  const extra = new TextEncoder().encode(obj + tail);
  const out = new Uint8Array(base.length + extra.length);
  out.set(base);
  out.set(extra, base.length);
  return out;
}

describe('pdf-redact adversarial', () => {
  it('blanks TJ kerning arrays that split an IBAN across strings', async () => {
    const hexParts = ['DE89', '3704', '0044', '0532', '0130', '00'].map((p) =>
      Buffer.from(p, 'latin1').toString('hex'),
    );
    const tj = `[ ${hexParts.map((h) => `<${h}> -20`).join(' ')} ] TJ`;
    const src = `BT /F1 12 Tf 1 0 0 1 40 200 Tm ${tj} ET`;
    const tokens = tokenizeContent(new TextEncoder().encode(src));
    expect(tokens.filter((t) => t.kind === 'hex').length).toBe(6);
    const blanked = blankNeedlesInBytes(new TextEncoder().encode(src), [IBAN]);
    const out = new TextDecoder('latin1').decode(blanked.bytes);
    expect(out.replace(/\s+/g, '')).not.toContain(Buffer.from(IBAN, 'latin1').toString('hex'));
    expect(blanked.count).toBeGreaterThan(0);
  });

  it('redacts text inside a nested Form XObject', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    const formBytes = new TextEncoder().encode(`BT /F1 12 Tf 1 0 0 1 10 20 Tm (${IBAN}) Tj ET`);
    const form = doc.context.flateStream(formBytes, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 300, 80],
      Resources: { Font: { F1: font.ref } },
    });
    const formRef = doc.context.register(form);
    const resources = page.node.lookup(PDFName.of('Resources'));
    const xobj = doc.context.obj({}) as PDFDict;
    xobj.set(PDFName.of('Fm1'), formRef);
    if (resources instanceof PDFDict) resources.set(PDFName.of('XObject'), xobj);
    const contents = new TextEncoder().encode('q 1 0 0 1 40 180 cm /Fm1 Do Q');
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(contents)));
    const result = await runAuto(await doc.save(), 'form-xobject.pdf');
    const bytes = await pdfOut(result).bytes();
    const text = (await extractAllText(bytes)).joined;
    expect(text).not.toContain(IBAN);
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
    expect(hasIncrementalEof(bytes)).toBe(false);
  });

  it('redacts text two levels deep (Form XObject inside Form XObject) and keeps the form dict keys', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    const inner = doc.context.flateStream(new TextEncoder().encode(`BT /F1 12 Tf 1 0 0 1 5 5 Tm (${IBAN}) Tj ET`), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 300, 80],
      Matrix: [1, 0, 0, 1, 0, 0],
      Resources: { Font: { F1: font.ref } },
    });
    const outer = doc.context.flateStream(new TextEncoder().encode('q 1 0 0 1 10 10 cm /Inner Do Q'), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 300, 80],
      Resources: { XObject: { Inner: doc.context.register(inner) } },
    });
    const resources = page.node.lookup(PDFName.of('Resources')) as PDFDict;
    const xobj = doc.context.obj({}) as PDFDict;
    xobj.set(PDFName.of('Outer'), doc.context.register(outer));
    resources.set(PDFName.of('XObject'), xobj);
    page.node.set(
      PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream(new TextEncoder().encode('q 1 0 0 1 40 180 cm /Outer Do Q'))),
    );
    const result = await runAuto(await doc.save(), 'nested-form.pdf');
    const bytes = await pdfOut(result).bytes();
    expect((await extractAllText(bytes)).joined).not.toContain(IBAN);
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
    const reloaded = await PDFDocument.load(bytes);
    const res = reloaded.getPage(0).node.lookup(PDFName.of('Resources')) as PDFDict;
    const xo = res.lookup(PDFName.of('XObject')) as PDFDict;
    const outerStream = xo.lookup(PDFName.of('Outer')) as { dict: PDFDict };
    expect(outerStream.dict.has(PDFName.of('BBox'))).toBe(true);
    expect(outerStream.dict.lookup(PDFName.of('Subtype'))?.toString()).toBe('/Form');
    const report = await verifyRedactedPdf(createToolContext(), [pdfOut(result)], { mode: 'auto', patterns: ['iban'], strings: [IBAN] });
    expect(report.passed).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it('flags Type3 fonts in verify (glyph procedures, no reliable text)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const glyph = doc.context.register(doc.context.stream('0 0 750 750 re f'));
    const t3 = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type3',
      FontBBox: [0, 0, 750, 750],
      FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      CharProcs: { square: glyph },
      Encoding: { Type: 'Encoding', Differences: [65, PDFName.of('square')] },
      FirstChar: 65,
      LastChar: 65,
      Widths: [1000],
    });
    const resources = page.node.lookup(PDFName.of('Resources')) as PDFDict;
    const fonts = doc.context.obj({}) as PDFDict;
    fonts.set(PDFName.of('T3'), doc.context.register(t3));
    resources.set(PDFName.of('Font'), fonts);
    page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream('BT /T3 20 Tf 20 100 Td (AAAA) Tj ET')));
    const file = neoFileFromBytes('type3.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], { mode: 'auto', patterns: ['iban'], strings: [IBAN] });
    expect(report.passed).toBe(false);
    expect(report.checks.some((c) => c.id.endsWith(':tounicode') && !c.passed)).toBe(true);
    expect(report.warnings?.length ?? 0).toBeGreaterThan(0);
    const run = await runAuto(await doc.save(), 'type3.pdf');
    expect(run.warnings.some((w) => /gerastert|Rasterisierung/.test(w))).toBe(true);
  });

  it('scrubs FreeText annotation Contents and appearance stream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const ap = doc.context.flateStream(new TextEncoder().encode(`BT /F1 10 Tf (${IBAN}) Tj ET`), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 200, 20],
    });
    const annot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      Rect: [40, 120, 260, 150],
      Contents: PDFString.of(`Konto ${IBAN}`),
      AP: { N: doc.context.register(ap) },
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
    const result = await runAuto(await doc.save(), 'freetext.pdf');
    const bytes = await pdfOut(result).bytes();
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
  });

  it('scrubs outline titles that contain the IBAN', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    const outlines = doc.context.obj({
      Type: 'Outlines',
      Count: 1,
    });
    const item = doc.context.obj({
      Title: PDFString.of(IBAN),
      Parent: outlines,
    });
    const itemRef = doc.context.register(item);
    (outlines as PDFDict).set(PDFName.of('First'), itemRef);
    (outlines as PDFDict).set(PDFName.of('Last'), itemRef);
    doc.catalog.set(PDFName.of('Outlines'), doc.context.register(outlines as PDFDict));
    const result = await runAuto(await doc.save(), 'outline.pdf');
    const bytes = await pdfOut(result).bytes();
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
  });

  it('verify() survives document-level (page 0) metadata hits and ignores technical Info values', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    doc.setTitle(`Konto ${IBAN}`);
    doc.setCreationDate(new Date('2026-09-14T10:00:00Z'));
    doc.setProducer('pdf-lib 1.17.1');
    const result = await runAuto(await doc.save(), 'info-title.pdf');
    const json = result.outputs.find((f) => f.mime === MIME.json)!;
    const parsed = JSON.parse(new TextDecoder().decode(await json.bytes())) as { hits: Array<{ page: number; pattern: string }> };
    expect(parsed.hits.some((h) => h.page === 0 && h.pattern === 'iban')).toBe(true);
    // CreationDate / Producer must not be reported as telefon/steuer-id hits
    expect(parsed.hits.filter((h) => h.page === 0)).toHaveLength(1);
    // canvas=true forces the pixel-sample path (browser); without a canvas backend it must degrade to advisory, not throw
    const canvasCtx = createToolContext({
      platform: { id: 'node', capabilities: { canvas: true, opfs: false, workers: false, qpdf: false, ocr: false } },
    });
    const report = await pdfRedact.verify!(canvasCtx, result.outputs, {
      mode: 'auto',
      patterns: ['iban', 'email', 'telefon', 'datum'],
      ner: false,
      rasterizeFallback: true,
    });
    expect(typeof report.passed).toBe('boolean');
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
    expect(findNeedlesInPdfBytes(await pdfOut(result).bytes(), [IBAN])).toEqual([]);
  });

  it('drops XMP that still holds the IBAN', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    const xmp = `<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?><x:xmpmeta>${IBAN}</x:xmpmeta>`;
    const meta = doc.context.flateStream(new TextEncoder().encode(xmp), {
      Type: 'Metadata',
      Subtype: 'XML',
    });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(meta));
    const result = await runAuto(await doc.save(), 'xmp.pdf');
    const bytes = await pdfOut(result).bytes();
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
  });

  it('scrubs StructTree ActualText', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    const el = doc.context.obj({
      Type: 'StructElem',
      S: PDFName.of('P'),
      ActualText: PDFString.of(IBAN),
      Alt: PDFString.of(`alt ${IBAN}`),
    });
    const root = doc.context.obj({
      Type: 'StructTreeRoot',
      K: [doc.context.register(el)],
    });
    doc.catalog.set(PDFName.of('StructTreeRoot'), doc.context.register(root));
    const result = await runAuto(await doc.save(), 'struct.pdf');
    const bytes = await pdfOut(result).bytes();
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
  });

  it('rewrites incrementally updated PDFs so orphan streams do not keep the IBAN', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    const first = await doc.save({ useObjectStreams: false });
    // Real incremental update: append an unreferenced, uncompressed stream + xref/trailer with /Prev.
    const dirty = appendIncrementalUpdate(first, `BT /F1 12 Tf (${IBAN}) Tj ET`);
    expect(hasIncrementalEof(dirty)).toBe(true);
    expect(new TextDecoder('latin1').decode(dirty).includes(IBAN)).toBe(true);
    const result = await runAuto(dirty, 'orphan.pdf');
    const bytes = await pdfOut(result).bytes();
    expect(hasIncrementalEof(bytes)).toBe(false);
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
    expect((await extractAllText(bytes)).joined).not.toContain(IBAN);
    const report = await verifyRedactedPdf(createToolContext(), [pdfOut(result)], {
      mode: 'auto',
      patterns: ['iban'],
      strings: [IBAN],
    });
    expect(report.checks.find((c) => c.id.endsWith(':incremental'))?.passed).toBe(true);
    expect(report.checks.find((c) => c.id.endsWith(':bytes'))?.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('verify flags an incrementally updated file with orphan plaintext as failed', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([400, 300]).drawText('clean', { x: 40, y: 200, size: 14, font });
    const dirty = appendIncrementalUpdate(await doc.save({ useObjectStreams: false }), `BT (${IBAN}) Tj ET`);
    const report = await verifyRedactedPdf(createToolContext(), [neoFileFromBytes('dirty.pdf', dirty, MIME.pdf)], {
      mode: 'auto',
      patterns: ['iban'],
      strings: [IBAN],
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id.endsWith(':incremental'))?.passed).toBe(false);
    expect(report.checks.find((c) => c.id.endsWith(':bytes'))?.passed).toBe(false);
  });

  it('scrubs Text/Popup/Link annotations: Contents, RC rich text, Subj, T and AP', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const ap = doc.context.flateStream(new TextEncoder().encode(`BT /F1 10 Tf [(DE89) -10 (3704) -10 (00440532013000)] TJ ET`), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 200, 20],
    });
    const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [0, 0, 10, 10], Open: false });
    const popupRef = doc.context.register(popup);
    const text = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [40, 120, 60, 140],
      T: PDFString.of(`Autor ${IBAN}`),
      Subj: PDFString.of(`Betreff ${IBAN}`),
      RC: PDFString.of(`<body><p>${IBAN}</p></body>`),
      Contents: PDFString.of(`Konto ${IBAN}`),
      Popup: popupRef,
      AP: { N: doc.context.register(ap) },
    });
    const textRef = doc.context.register(text);
    (popup as PDFDict).set(PDFName.of('Parent'), textRef);
    (popup as PDFDict).set(PDFName.of('Contents'), PDFString.of(`Popup ${IBAN}`));
    const link = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [40, 40, 100, 60],
      Contents: PDFString.of(IBAN),
    });
    page.node.set(PDFName.of('Annots'), doc.context.obj([textRef, popupRef, doc.context.register(link)]));
    const result = await runAuto(await doc.save(), 'annots.pdf');
    const out = pdfOut(result);
    const bytes = await out.bytes();
    expect(findNeedlesInPdfBytes(bytes, [IBAN])).toEqual([]);
    const report = await verifyRedactedPdf(createToolContext(), [out], { mode: 'auto', patterns: ['iban'], strings: [IBAN] });
    expect(report.checks.find((c) => c.id.endsWith(':meta'))?.passed).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('verify sees IBAN inside an annotation appearance stream (not false-green)', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const ap = doc.context.flateStream(new TextEncoder().encode(`BT /F1 10 Tf (${IBAN}) Tj ET`), {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 200, 20],
    });
    const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [40, 120, 260, 150], AP: { N: doc.context.register(ap) } });
    page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annot)]));
    const file = neoFileFromBytes('ap.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], { mode: 'auto', patterns: ['iban'], strings: [] });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id.endsWith(':meta'))?.passed).toBe(false);
  });

  it('replaces overlapping image XObjects instead of painting over them', async () => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    );
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const img = await doc.embedPng(png);
    const page = doc.addPage([400, 300]);
    page.drawImage(img, { x: 40, y: 180, width: 200, height: 40 });
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 190, size: 14, font, color: rgb(0, 0, 0) });
    const result = await runAuto(await doc.save(), 'image-under.pdf');
    const bytes = await pdfOut(result).bytes();
    expect((await extractAllText(bytes)).joined).not.toContain(IBAN);
  });

  it('treats Tr=7 clip text as hard (raster fallback) and removes the IBAN', async () => {
    const src = `BT /F1 12 Tf 7 Tr 1 0 0 1 40 200 Tm (${IBAN}) Tj ET`;
    const blanked = blankNeedlesInBytes(new TextEncoder().encode(src), [IBAN]);
    expect(new TextDecoder('latin1').decode(blanked.bytes)).not.toContain(IBAN);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    const stream = doc.context.flateStream(
      new TextEncoder().encode(`BT /F1 12 Tf 7 Tr 1 0 0 1 40 200 Tm (${IBAN}) Tj ET`),
      {},
    );
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));
    const resources = page.node.lookup(PDFName.of('Resources'));
    if (resources instanceof PDFDict) {
      const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) ?? doc.context.obj({});
      (fonts as PDFDict).set(PDFName.of('F1'), font.ref);
      resources.set(PDFName.of('Font'), fonts);
    }
    const result = await runAuto(await doc.save(), 'clip.pdf');
    expect((await extractAllText(await pdfOut(result).bytes())).joined).not.toContain(IBAN);
  });

  it('handles Tc/Tw/Tz operators when blanking', () => {
    const src = `BT /F1 12 Tf 0.5 Tc 2 Tw 80 Tz 1 0 0 1 40 200 Tm (${IBAN}) Tj ET`;
    const blanked = blankNeedlesInBytes(new TextEncoder().encode(src), [IBAN]);
    expect(new TextDecoder('latin1').decode(blanked.bytes)).not.toContain(IBAN);
  });

  it('finds IBANs split by newlines, NBSP, ZWSP and unusual spaces', () => {
    expect(isValidIban(IBAN)).toBe(true);
    const weird = `DE89\u200B3704\u00A00044\n0532 0130 00`;
    const hits = findPatternMatches(weird, ['iban']);
    expect(hits.some((h) => stripInvisible(h.text).replace(/\s+/g, '') === IBAN)).toBe(true);
    const softHyphen = `DE89\u00AD3704\u202F0044\u20600532\r\n0130\u200D00`;
    expect(findPatternMatches(softHyphen, ['iban']).length).toBe(1);
    const bytes = new TextEncoder().encode(`BT /F1 12 Tf (DE89 3704 0044 0532 0130 00) Tj ET`);
    const blanked = blankNeedlesInBytes(bytes, [IBAN]);
    expect(new TextDecoder('latin1').decode(blanked.bytes).replace(/\s+/g, '')).not.toContain(IBAN);
  });

  it('fails verification (not false-green) when ToUnicode is missing on a non-standard font', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const fontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: PDFName.of('EvilCID'),
      Encoding: PDFName.of('Identity-H'),
    });
    const page = doc.getPage(0);
    const resources = page.node.lookup(PDFName.of('Resources'));
    if (resources instanceof PDFDict) {
      const fonts = doc.context.obj({});
      (fonts as PDFDict).set(PDFName.of('FEvil'), doc.context.register(fontDict));
      resources.set(PDFName.of('Font'), fonts);
    }
    const file = neoFileFromBytes('noglyph.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], {
      mode: 'auto',
      patterns: ['iban'],
      strings: [IBAN],
    });
    expect(report.checks.some((c) => c.id.endsWith(':tounicode') && !c.passed)).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.warnings?.length ?? 0).toBeGreaterThan(0);
  });

  it('fails verification when overlay-only leftover remains in raw bytes', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 300]);
    page.drawText(`IBAN ${IBAN}`, { x: 40, y: 200, size: 14, font });
    page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(0, 0, 0) });
    const file = neoFileFromBytes('overlay.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], {
      mode: 'auto',
      patterns: ['iban'],
      strings: [IBAN],
    });
    expect(report.passed).toBe(false);
    expect(report.checks.some((c) => !c.passed && (c.id.endsWith(':text') || c.id.endsWith(':bytes')))).toBe(true);
  });

  it('does not treat pixel-skip as a silent pass (advisory + warning)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const file = neoFileFromBytes('empty.pdf', await doc.save(), MIME.pdf);
    const report = await verifyRedactedPdf(createToolContext(), [file], {
      mode: 'manual',
      patterns: [],
      strings: ['SECRETVALUE'],
      hits: [{ page: 1, pattern: 'region', text: 'SECRETVALUE', masked: '****', x: 10, y: 10, w: 40, h: 12 }],
    });
    const pixel = report.checks.find((c) => c.id.includes('pixel'));
    expect(pixel?.advisory).toBe(true);
    expect(pixel?.passed).toBe(false);
    expect(report.warnings?.some((w) => /Pixel/i.test(w))).toBe(true);
  });
});
