import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, StandardFonts, rgb } from 'pdf-lib';
import { concatRanges } from './engine.js';
import { createPadesCms } from './cms.js';
import type { LoadedP12 } from './p12.js';

const CONTENTS_HEX_LEN = 16384;

function indexOf(bytes: Uint8Array, needle: string, from = 0): number {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = from; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}

function replaceSlice(src: Uint8Array, start: number, end: number, insert: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length - (end - start) + insert.length);
  out.set(src.subarray(0, start), 0);
  out.set(insert, start);
  out.set(src.subarray(end), start + insert.length);
  return out;
}

function padNum(n: number, width = 10): string {
  return String(n).padStart(width, '0');
}

export interface SignAppearance {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  text: string;
}

export async function signPdfBytes(
  input: Uint8Array,
  p12: LoadedP12,
  appearance: SignAppearance,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input, { ignoreEncryption: false, updateMetadata: false });
  const pages = doc.getPages();
  const page = pages[Math.max(0, Math.min(appearance.page - 1, pages.length - 1))]!;
  if (appearance.visible) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({
      x: appearance.x,
      y: appearance.y,
      width: appearance.width,
      height: appearance.height,
      borderColor: rgb(0.1, 0.2, 0.5),
      borderWidth: 1,
      color: rgb(0.95, 0.96, 1),
    });
    page.drawText(appearance.text.slice(0, 80), {
      x: appearance.x + 6,
      y: appearance.y + appearance.height / 2 - 4,
      size: 8,
      font,
      color: rgb(0.1, 0.15, 0.3),
    });
  }
  const placeholder = '0'.repeat(CONTENTS_HEX_LEN);
  const sigDict = doc.context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'ETSI.CAdES.detached',
    ByteRange: [0, 0, 0, 0],
    Contents: PDFHexString.of(placeholder),
    M: PDFString.fromDate(new Date()),
    Name: PDFString.of(p12.subject || 'Signed'),
  });
  const sigRef = doc.context.register(sigDict);
  const rect = appearance.visible
    ? [appearance.x, appearance.y, appearance.x + appearance.width, appearance.y + appearance.height]
    : [0, 0, 0, 0];
  const widget = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of(`Signature${Date.now() % 100000}`),
    F: 132,
    P: page.ref,
    Rect: rect,
    V: sigRef,
  });
  const widgetRef = doc.context.register(widget);
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots && 'push' in annots) (annots as { push: (r: typeof widgetRef) => void }).push(widgetRef);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([widgetRef]));

  let acro = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (!acro) {
    acro = doc.context.obj({ Fields: [widgetRef], SigFlags: 3 });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(acro));
  } else if (acro && typeof acro === 'object' && 'lookup' in acro) {
    const dict = acro as import('pdf-lib').PDFDict;
    dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
    const fields = dict.lookup(PDFName.of('Fields'));
    if (fields && 'push' in fields) (fields as { push: (r: typeof widgetRef) => void }).push(widgetRef);
    else dict.set(PDFName.of('Fields'), doc.context.obj([widgetRef]));
  }

  let pdf: Uint8Array = new Uint8Array(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));

  const brAt = indexOf(pdf, '/ByteRange');
  if (brAt < 0) throw new Error('ByteRange-Platzhalter fehlt.');
  const brOpen = pdf.indexOf(0x5b, brAt);
  const brClose = pdf.indexOf(0x5d, brOpen);
  const paddedRange = new TextEncoder().encode(`[${padNum(0)} ${padNum(0)} ${padNum(0)} ${padNum(0)}]`);
  pdf = replaceSlice(pdf, brOpen, brClose + 1, paddedRange);

  const contents = findSignatureContents(pdf, brAt);
  if (contents.lt < 0 || contents.gt < 0) throw new Error('Contents-Platzhalter fehlt.');
  const lt = contents.lt;
  const gt = contents.gt;

  const brAt2 = indexOf(pdf, '/ByteRange');
  const brOpen2 = pdf.indexOf(0x5b, brAt2);
  const brClose2 = pdf.indexOf(0x5d, brOpen2);
  const start2 = lt;
  const end2 = gt + 1;
  const byteRange: [number, number, number, number] = [0, start2, end2, pdf.length - end2];
  const rangeStr = `[${padNum(byteRange[0])} ${padNum(byteRange[1])} ${padNum(byteRange[2])} ${padNum(byteRange[3])}]`;
  pdf = replaceSlice(pdf, brOpen2, brClose2 + 1, new TextEncoder().encode(rangeStr));

  const signed = concatRanges(pdf, byteRange);
  const cms = await createPadesCms(signed, p12.cert, p12.privateKey);
  let hex = [...cms].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hex.length > CONTENTS_HEX_LEN) throw new Error('CMS größer als Platzhalter.');
  hex = hex.padEnd(CONTENTS_HEX_LEN, '0');
  const contents2 = findSignatureContents(pdf, indexOf(pdf, '/ByteRange'));
  if (contents2.lt < 0 || contents2.gt < 0) throw new Error('Contents-Platzhalter fehlt.');
  pdf = replaceSlice(pdf, contents2.lt + 1, contents2.gt, new TextEncoder().encode(hex));
  return pdf;
}

function findSignatureContents(pdf: Uint8Array, byteRangeAt: number): { lt: number; gt: number } {
  const cAt = indexOf(pdf, '/Contents', byteRangeAt);
  if (cAt < 0) return { lt: -1, gt: -1 };
  let i = cAt + '/Contents'.length;
  while (i < pdf.length && (pdf[i] === 0x20 || pdf[i] === 0x09 || pdf[i] === 0x0a || pdf[i] === 0x0d)) i += 1;
  if (pdf[i] !== 0x3c) return { lt: -1, gt: -1 };
  const lt = i;
  const gt = pdf.indexOf(0x3e, lt + 1);
  return { lt, gt };
}

export async function requestTimestamp(
  imprint: Uint8Array,
  tsaUrl: string,
): Promise<{ tsq: Uint8Array; tsr: Uint8Array }> {
  const pkijs = await import('pkijs');
  const asn1js = await import('asn1js');
  const { ensurePkiEngine } = await import('./engine.js');
  ensurePkiEngine();
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: '2.16.840.1.101.3.4.2.1' }),
      hashedMessage: new asn1js.OctetString({ valueHex: imprint }),
    }),
    certReq: true,
    nonce: new asn1js.Integer({ valueHex: globalThis.crypto.getRandomValues(new Uint8Array(8)) }),
  });
  const tsq = new Uint8Array(req.toSchema().toBER());
  const res = await fetch(tsaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: tsq,
  });
  if (!res.ok) throw new Error(`TSA HTTP ${res.status}`);
  const tsr = new Uint8Array(await res.arrayBuffer());
  return { tsq, tsr };
}
