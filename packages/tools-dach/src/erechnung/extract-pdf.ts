import { decodePDFRawStream, PDFArray, PDFDict, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import { PDFDocument } from 'pdf-lib';
import { decompressSync, inflateSync } from 'fflate';

const EMBED_NAMES = /^(factur-x\.xml|zugferd-invoice\.xml|xrechnung\.xml)$/i;
const INVOICE_MARK = /CrossIndustryInvoice|CustomizationID|<\s*Invoice[\s>]/;

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function pdfText(v: unknown): string {
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  if (v instanceof PDFName) return nameOf(v);
  return '';
}

function inflateGuess(raw: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [raw];
  try {
    out.push(decompressSync(raw));
  } catch {
    /* not zlib/gzip */
  }
  try {
    out.push(inflateSync(raw));
  } catch {
    /* not raw deflate */
  }
  if (raw.length > 2 && raw[0] === 0x78) {
    try {
      out.push(inflateSync(raw.subarray(2)));
    } catch {
      /* skip */
    }
  }
  return out;
}

function streamCandidates(obj: unknown): Uint8Array[] {
  const raws: Uint8Array[] = [];
  if (obj && typeof obj === 'object' && 'getUnencodedContents' in obj) {
    try {
      raws.push((obj as { getUnencodedContents(): Uint8Array }).getUnencodedContents());
    } catch {
      /* skip */
    }
  }
  if (obj instanceof PDFRawStream) {
    try {
      raws.push(decodePDFRawStream(obj).decode());
    } catch {
      raws.push(obj.getContents());
    }
  }
  return raws.flatMap(inflateGuess);
}

function xmlFromBytes(bytes: Uint8Array): string | undefined {
  const xml = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const start = xml.search(/<\?xml|<rsm:CrossIndustryInvoice|<Invoice[\s>]/);
  if (start < 0 || !INVOICE_MARK.test(xml)) return undefined;
  return xml.slice(start).replace(/\0+$/g, '').trim();
}

export interface EmbeddedXml {
  name: string;
  xml: string;
  afRelationship: string;
}

function fileSpec(dict: PDFDict): EmbeddedXml | undefined {
  const fname =
    pdfText(dict.lookup(PDFName.of('F'))) ||
    pdfText(dict.lookup(PDFName.of('UF'))) ||
    pdfText(dict.get(PDFName.of('F')));
  const rel = dict.lookup(PDFName.of('AFRelationship'));
  const afRelationship = rel instanceof PDFName ? nameOf(rel) : pdfText(rel);
  const ef = dict.lookup(PDFName.of('EF'));
  if (!(ef instanceof PDFDict)) return undefined;
  const file = ef.lookup(PDFName.of('F')) ?? ef.lookup(PDFName.of('UF'));
  if (!file) return undefined;
  for (const bytes of streamCandidates(file)) {
    const xml = xmlFromBytes(bytes);
    if (xml) return { name: fname || 'embedded.xml', xml, afRelationship };
  }
  return undefined;
}

function walkNamesArray(arr: PDFArray, out: EmbeddedXml[]): void {
  for (let i = 0; i < arr.size(); i++) {
    const item = arr.lookup(i);
    if (item instanceof PDFDict) {
      const got = fileSpec(item);
      if (got) out.push(got);
    } else if (item instanceof PDFArray) {
      walkNamesArray(item, out);
    }
  }
}

function walkEmbeddedTree(dict: PDFDict, out: EmbeddedXml[], seen: Set<PDFDict>): void {
  if (seen.has(dict)) return;
  seen.add(dict);
  const names = dict.lookup(PDFName.of('Names'));
  if (names instanceof PDFArray) walkNamesArray(names, out);
  const kids = dict.lookup(PDFName.of('Kids'));
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) walkEmbeddedTree(kid, out, seen);
    }
  }
}

function scanAllStreams(doc: PDFDocument): EmbeddedXml[] {
  const out: EmbeddedXml[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    for (const bytes of streamCandidates(obj)) {
      const xml = xmlFromBytes(bytes);
      if (xml) out.push({ name: 'factur-x.xml', xml, afRelationship: '' });
    }
  }
  return out;
}

function scanRawPdf(bytes: Uint8Array): EmbeddedXml | undefined {
  const latin = new TextDecoder('latin1').decode(bytes);
  const idx = latin.search(/<\?xml[\s\S]{0,80}CrossIndustryInvoice|<\?xml[\s\S]{0,80}Invoice xmlns/);
  if (idx < 0) {
    const cii = latin.indexOf('<rsm:CrossIndustryInvoice');
    if (cii < 0) return undefined;
    const end = latin.indexOf('</rsm:CrossIndustryInvoice>', cii);
    if (end < 0) return undefined;
    return { name: 'factur-x.xml', xml: latin.slice(cii, end + '</rsm:CrossIndustryInvoice>'.length), afRelationship: '' };
  }
  const endCii = latin.indexOf('</rsm:CrossIndustryInvoice>', idx);
  const endUbl = latin.indexOf('</Invoice>', idx);
  const end = endCii >= 0 ? endCii + '</rsm:CrossIndustryInvoice>'.length : endUbl >= 0 ? endUbl + '</Invoice>'.length : -1;
  if (end < 0) return undefined;
  return { name: 'factur-x.xml', xml: latin.slice(idx, end), afRelationship: '' };
}

export async function extractInvoiceXmlFromPdf(bytes: Uint8Array): Promise<EmbeddedXml | undefined> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const found: EmbeddedXml[] = [];
  const af = doc.catalog.lookup(PDFName.of('AF'));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookup(i);
      if (spec instanceof PDFDict) {
        const got = fileSpec(spec);
        if (got) found.push(got);
      }
    }
  }
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  if (ef) walkEmbeddedTree(ef, found, new Set());
  const neo = doc.catalog.lookup(PDFName.of('NeoFacturX'));
  if (neo) {
    for (const bytes of streamCandidates(neo)) {
      const xml = xmlFromBytes(bytes);
      if (xml) found.push({ name: 'factur-x.xml', xml, afRelationship: 'Alternative' });
    }
  }
  found.push(...scanAllStreams(doc));
  const raw = scanRawPdf(bytes);
  if (raw) found.push(raw);

  const preferred = found.find((f) => EMBED_NAMES.test(f.name) && INVOICE_MARK.test(f.xml));
  return preferred ?? found.find((f) => INVOICE_MARK.test(f.xml));
}

export async function setAfRelationship(bytes: Uint8Array, rel: 'Data' | 'Alternative'): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const af = doc.catalog.lookup(PDFName.of('AF'));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookup(i);
      if (spec instanceof PDFDict) spec.set(PDFName.of('AFRelationship'), PDFName.of(rel));
    }
  }
  return new Uint8Array(await doc.save({ updateFieldAppearances: false, useObjectStreams: false }));
}
