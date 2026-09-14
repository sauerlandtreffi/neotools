import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

export interface PdfInspection {
  hasInfo: boolean;
  infoKeys: string[];
  hasXmp: boolean;
  hasEmbeddedFiles: boolean;
  hasJavaScript: boolean;
  hasOpenAction: boolean;
  hasAA: boolean;
  annotationCount: number;
  fileAttachmentAnnots: number;
  hasAcroForm: boolean;
  hasLaunchActions: boolean;
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function walkDictForJs(dict: PDFDict, seen: Set<PDFDict>, acc: { js: boolean; launch: boolean }): void {
  if (seen.has(dict)) return;
  seen.add(dict);
  const s = dict.get(PDFName.of('S'));
  if (s instanceof PDFName) {
    const n = nameOf(s);
    if (n === 'JavaScript' || n === 'JS') acc.js = true;
    if (n === 'Launch') acc.launch = true;
  }
  if (dict.has(PDFName.of('JS'))) acc.js = true;
  for (const key of dict.keys()) {
    const child = dict.lookup(key);
    if (child instanceof PDFDict) walkDictForJs(child, seen, acc);
    if (child instanceof PDFArray) {
      for (let i = 0; i < child.size(); i++) {
        const item = child.lookup(i);
        if (item instanceof PDFDict) walkDictForJs(item, seen, acc);
      }
    }
  }
}

export function inspectPdf(doc: PDFDocument): PdfInspection {
  const catalog = doc.catalog;
  const infoRef = doc.context.trailerInfo.Info;
  let infoKeys: string[] = [];
  const userKeys = new Set(['Title', 'Author', 'Subject', 'Keywords']);
  let hasInfo = false;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    if (info instanceof PDFDict) {
      infoKeys = info.keys().map((k) => nameOf(k));
      hasInfo = infoKeys.some((k) => userKeys.has(k));
    }
  }
  if (
    doc.getTitle() ||
    doc.getAuthor() ||
    doc.getSubject() ||
    (doc.getKeywords() ?? '').length
  ) {
    hasInfo = true;
  }

  const hasXmp = catalog.has(PDFName.of('Metadata'));
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const hasEmbeddedFiles = Boolean(
    names?.has(PDFName.of('EmbeddedFiles')) || catalog.has(PDFName.of('AF')),
  );
  const hasNamedJs = Boolean(names?.has(PDFName.of('JavaScript')));

  const flags = { js: hasNamedJs, launch: false };
  const seen = new Set<PDFDict>();
  if (catalog.has(PDFName.of('OpenAction'))) {
    const oa = catalog.lookup(PDFName.of('OpenAction'));
    if (oa instanceof PDFDict) walkDictForJs(oa, seen, flags);
  }
  if (catalog.has(PDFName.of('AA'))) {
    const aa = catalog.lookup(PDFName.of('AA'));
    if (aa instanceof PDFDict) walkDictForJs(aa, seen, flags);
  }

  let annotationCount = 0;
  let fileAttachmentAnnots = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    annotationCount += annots.size();
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookup(i);
      if (!(annot instanceof PDFDict)) continue;
      const subtype = annot.get(PDFName.of('Subtype'));
      if (subtype instanceof PDFName && nameOf(subtype) === 'FileAttachment') {
        fileAttachmentAnnots += 1;
      }
      walkDictForJs(annot, seen, flags);
    }
    const pageAA = page.node.lookupMaybe(PDFName.of('AA'), PDFDict);
    if (pageAA) walkDictForJs(pageAA, seen, flags);
  }

  return {
    hasInfo,
    infoKeys,
    hasXmp,
    hasEmbeddedFiles: hasEmbeddedFiles || fileAttachmentAnnots > 0,
    hasJavaScript: flags.js,
    hasOpenAction: catalog.has(PDFName.of('OpenAction')),
    hasAA: catalog.has(PDFName.of('AA')),
    annotationCount,
    fileAttachmentAnnots,
    hasAcroForm: catalog.has(PDFName.of('AcroForm')),
    hasLaunchActions: flags.launch,
  };
}

export function stripXmp(doc: PDFDocument): boolean {
  if (!doc.catalog.has(PDFName.of('Metadata'))) return false;
  const meta = doc.catalog.lookup(PDFName.of('Metadata'));
  if (meta instanceof PDFRawStream || meta instanceof PDFDict) {
    // drop reference
  }
  doc.catalog.delete(PDFName.of('Metadata'));
  return true;
}

export function clearInfoDict(doc: PDFDocument): string[] {
  try {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  } catch {
    // ignore
  }
  const infoRef = doc.context.trailerInfo.Info;
  if (!infoRef) return [];
  const info = doc.context.lookup(infoRef);
  if (!(info instanceof PDFDict)) return [];
  const keys = info.keys().map((k) => nameOf(k));
  for (const key of [...info.keys()]) info.delete(key);
  try {
    delete (doc.context.trailerInfo as { Info?: unknown }).Info;
  } catch {
    // ignore
  }
  return keys;
}

export function stripNamesAndActions(doc: PDFDocument): void {
  const catalog = doc.catalog;
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  if (names) {
    names.delete(PDFName.of('EmbeddedFiles'));
    names.delete(PDFName.of('JavaScript'));
    if (names.keys().length === 0) catalog.delete(PDFName.of('Names'));
  }
  catalog.delete(PDFName.of('AF'));
  catalog.delete(PDFName.of('OpenAction'));
  catalog.delete(PDFName.of('AA'));
}

export function stripAnnotations(doc: PDFDocument): number {
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      removed += annots.size();
      page.node.delete(PDFName.of('Annots'));
    }
    page.node.delete(PDFName.of('AA'));
  }
  return removed;
}
