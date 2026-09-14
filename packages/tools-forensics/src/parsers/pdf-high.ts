import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { scanPdfContent, type PdfContentScan, type PdfTextRun } from './pdf-content.js';

export interface PdfHighInspect {
  pageCount: number;
  info: Record<string, string>;
  hasXmp: boolean;
  hasEmbeddedFiles: boolean;
  hasJavaScript: boolean;
  hasOpenAction: boolean;
  hasAA: boolean;
  hasLaunch: boolean;
  hasUri: boolean;
  hasOcg: boolean;
  hasEncrypt: boolean;
  annotationCount: number;
  watermarkAnnots: number;
  fileAttachmentAnnots: number;
  fonts: string[];
  xobjects: string[];
  producer?: string;
  creator?: string;
  content: PdfContentScan;
  catalogKeys: string[];
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function walk(dict: PDFDict, seen: Set<PDFDict>, acc: { js: boolean; launch: boolean; uri: boolean }): void {
  if (seen.has(dict)) return;
  seen.add(dict);
  const s = dict.get(PDFName.of('S'));
  if (s instanceof PDFName) {
    const n = nameOf(s);
    if (n === 'JavaScript' || n === 'JS') acc.js = true;
    if (n === 'Launch') acc.launch = true;
    if (n === 'URI') acc.uri = true;
  }
  if (dict.has(PDFName.of('JS'))) acc.js = true;
  if (dict.has(PDFName.of('URI'))) acc.uri = true;
  for (const key of dict.keys()) {
    const child = dict.lookup(key);
    if (child instanceof PDFDict) walk(child, seen, acc);
    if (child instanceof PDFArray) {
      for (let i = 0; i < child.size(); i++) {
        const item = child.lookup(i);
        if (item instanceof PDFDict) walk(item, seen, acc);
      }
    }
  }
}

function decodeStream(stream: unknown): string {
  try {
    if (stream instanceof PDFRawStream) {
      const decoded = decodePDFRawStream(stream).decode();
      return new TextDecoder('latin1').decode(decoded);
    }
  } catch {
    // ignore
  }
  return '';
}

function pageContents(page: ReturnType<PDFDocument['getPages']>[number]): string {
  const node = page.node;
  const contents = node.lookup(PDFName.of('Contents'));
  if (contents instanceof PDFRawStream) return decodeStream(contents);
  if (contents instanceof PDFArray) {
    let all = '';
    for (let i = 0; i < contents.size(); i++) all += decodeStream(contents.lookup(i));
    return all;
  }
  return '';
}

function collectExtGState(page: ReturnType<PDFDocument['getPages']>[number]): Record<string, { ca?: number; CA?: number }> {
  const out: Record<string, { ca?: number; CA?: number }> = {};
  const res = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
  const gs = res?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  if (!gs) return out;
  for (const key of gs.keys()) {
    const dict = gs.lookup(key);
    if (!(dict instanceof PDFDict)) continue;
    const rec: { ca?: number; CA?: number } = {};
    const ca = dict.get(PDFName.of('ca'));
    const CA = dict.get(PDFName.of('CA'));
    if (ca && 'asNumber' in ca && typeof (ca as { asNumber: () => number }).asNumber === 'function') {
      rec.ca = (ca as { asNumber: () => number }).asNumber();
    }
    if (CA && 'asNumber' in CA && typeof (CA as { asNumber: () => number }).asNumber === 'function') {
      rec.CA = (CA as { asNumber: () => number }).asNumber();
    }
    out[nameOf(key)] = rec;
  }
  return out;
}

function collectNames(res: PDFDict | undefined, key: string): string[] {
  if (!res) return [];
  const dict = res.lookupMaybe(PDFName.of(key), PDFDict);
  if (!dict) return [];
  return dict.keys().map((k) => nameOf(k));
}

export async function inspectPdfHigh(bytes: Uint8Array): Promise<PdfHighInspect | undefined> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return undefined;
  }
  const catalog = doc.catalog;
  const info: Record<string, string> = {};
  const put = (k: string, getter: () => string | undefined) => {
    try {
      const v = getter();
      if (v) info[k] = v;
    } catch {
      // ignore
    }
  };
  put('Title', () => doc.getTitle());
  put('Author', () => doc.getAuthor());
  put('Subject', () => doc.getSubject());
  put('Keywords', () => doc.getKeywords());
  put('Creator', () => doc.getCreator());
  put('Producer', () => doc.getProducer());

  const flags = { js: false, launch: false, uri: false };
  const seen = new Set<PDFDict>();
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (names?.has(PDFName.of('JavaScript'))) flags.js = true;
  if (catalog.has(PDFName.of('OpenAction'))) {
    const oa = catalog.lookup(PDFName.of('OpenAction'));
    if (oa instanceof PDFDict) walk(oa, seen, flags);
  }
  if (catalog.has(PDFName.of('AA'))) {
    const aa = catalog.lookup(PDFName.of('AA'));
    if (aa instanceof PDFDict) walk(aa, seen, flags);
  }

  let annotationCount = 0;
  let watermarkAnnots = 0;
  let fileAttachmentAnnots = 0;
  const fonts = new Set<string>();
  const xobjects = new Set<string>();
  const runs: PdfTextRun[] = [];
  const hiddenRuns: PdfTextRun[] = [];
  const watermarkRuns: PdfTextRun[] = [];
  const gsOpacities: Record<string, number> = {};

  let pages: ReturnType<PDFDocument['getPages']> = [];
  try {
    pages = doc.getPages();
  } catch {
    pages = [];
  }
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]!;
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      annotationCount += annots.size();
      for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i);
        if (!(annot instanceof PDFDict)) continue;
        walk(annot, seen, flags);
        const subtype = annot.get(PDFName.of('Subtype'));
        if (subtype instanceof PDFName) {
          const n = nameOf(subtype);
          if (n === 'Watermark') watermarkAnnots += 1;
          if (n === 'FileAttachment') fileAttachmentAnnots += 1;
        }
      }
    }
    const res = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
    for (const f of collectNames(res, 'Font')) fonts.add(f);
    for (const x of collectNames(res, 'XObject')) xobjects.add(x);
    const gs = collectExtGState(page);
    const scan = scanPdfContent(pageContents(page), pi + 1, gs);
    runs.push(...scan.runs);
    hiddenRuns.push(...scan.hiddenRuns);
    watermarkRuns.push(...scan.watermarkRuns);
    Object.assign(gsOpacities, scan.gsOpacities);
  }

  const hasEmbeddedFiles = Boolean(
    names?.has(PDFName.of('EmbeddedFiles')) || catalog.has(PDFName.of('AF')) || fileAttachmentAnnots > 0,
  );

  return {
    pageCount: pages.length,
    info,
    hasXmp: catalog.has(PDFName.of('Metadata')),
    hasEmbeddedFiles,
    hasJavaScript: flags.js,
    hasOpenAction: catalog.has(PDFName.of('OpenAction')),
    hasAA: catalog.has(PDFName.of('AA')),
    hasLaunch: flags.launch,
    hasUri: flags.uri,
    hasOcg: catalog.has(PDFName.of('OCProperties')),
    hasEncrypt: doc.isEncrypted,
    annotationCount,
    watermarkAnnots,
    fileAttachmentAnnots,
    fonts: [...fonts],
    xobjects: [...xobjects],
    producer: (() => {
      try {
        return doc.getProducer();
      } catch {
        return undefined;
      }
    })(),
    creator: (() => {
      try {
        return doc.getCreator();
      } catch {
        return undefined;
      }
    })(),
    content: { runs, hiddenRuns, watermarkRuns, gsOpacities },
    catalogKeys: catalog.keys().map((k) => nameOf(k)),
  };
}

/** Light duplicate of tools-pdf inspect — packs must not import each other. */
export type PdfInspectionLite = Pick<
  PdfHighInspect,
  'hasXmp' | 'hasEmbeddedFiles' | 'hasJavaScript' | 'hasOpenAction' | 'hasAA' | 'hasLaunch' | 'annotationCount'
>;
