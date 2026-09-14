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
  hasUriActions: boolean;
  hasSubmitForm: boolean;
  hasImportData: boolean;
  hasGoToR: boolean;
  hasXfa: boolean;
  hasEncrypt: boolean;
  hasTrailerId: boolean;
  embeddedFileNames: string[];
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function walkDictForJs(
  dict: PDFDict,
  seen: Set<PDFDict>,
  acc: { js: boolean; launch: boolean; uri: boolean; submit: boolean; importData: boolean; gotoR: boolean },
): void {
  if (seen.has(dict)) return;
  seen.add(dict);
  const s = dict.get(PDFName.of('S'));
  if (s instanceof PDFName) {
    const n = nameOf(s);
    if (n === 'JavaScript' || n === 'JS') acc.js = true;
    if (n === 'Launch') acc.launch = true;
    if (n === 'URI') acc.uri = true;
    if (n === 'SubmitForm') acc.submit = true;
    if (n === 'ImportData') acc.importData = true;
    if (n === 'GoToR') acc.gotoR = true;
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

  const flags = { js: hasNamedJs, launch: false, uri: false, submit: false, importData: false, gotoR: false };
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

  // Outline items and AcroForm fields carry /A and /AA actions too (JavaScript, Launch, URI …).
  const outlines = catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) walkDictForJs(outlines, seen, flags);

  let hasXfa = false;
  const acro = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (acro?.has(PDFName.of('XFA'))) hasXfa = true;
  if (acro) walkDictForJs(acro, seen, flags);

  const embeddedFileNames: string[] = [];
  const ef = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const namesArr = ef?.lookupMaybe(PDFName.of('Names'), PDFArray);
  if (namesArr) {
    for (let i = 0; i < namesArr.size(); i += 2) {
      const label = namesArr.lookup(i);
      if (label && 'decodeText' in label) {
        try {
          embeddedFileNames.push((label as { decodeText(): string }).decodeText());
        } catch {
          embeddedFileNames.push('embedded');
        }
      }
    }
  }

  const encrypt = Boolean(
    (doc.context.trailerInfo as { Encrypt?: unknown }).Encrypt || catalog.has(PDFName.of('Encrypt')),
  );
  const hasTrailerId = Boolean((doc.context.trailerInfo as { ID?: unknown }).ID);

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
    hasUriActions: flags.uri,
    hasSubmitForm: flags.submit,
    hasImportData: flags.importData,
    hasGoToR: flags.gotoR,
    hasXfa,
    hasEncrypt: encrypt,
    hasTrailerId,
    embeddedFileNames,
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
    names.delete(PDFName.of('EmbeddedFiles'));
    if (names.keys().length === 0) catalog.delete(PDFName.of('Names'));
  }
  catalog.delete(PDFName.of('AF'));
  catalog.delete(PDFName.of('OpenAction'));
  catalog.delete(PDFName.of('AA'));
  catalog.delete(PDFName.of('URI'));
  try {
    delete (doc.context.trailerInfo as { Encrypt?: unknown; ID?: unknown }).Encrypt;
    delete (doc.context.trailerInfo as { Encrypt?: unknown; ID?: unknown }).ID;
  } catch {
    // ignore
  }
  const acro = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  acro?.delete(PDFName.of('XFA'));
  acro?.delete(PDFName.of('CO'));
  if (acro) stripActionsDeep(acro, new Set());
  const outlines = catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (outlines) stripActionsDeep(outlines, new Set());
  // Page-level additional actions (open/close) exist independently of annotations.
  for (const page of doc.getPages()) page.node.delete(PDFName.of('AA'));
}

const SAFE_ACTIONS = new Set(['GoTo', 'Named']);

/**
 * Remove `/AA` everywhere and `/A` unless it is a plain in-document GoTo/Named action.
 * Walks dict/array children (outline tree, field tree with Kids).
 */
export function stripActionsDeep(dict: PDFDict, seen: Set<PDFDict>): number {
  if (seen.has(dict)) return 0;
  seen.add(dict);
  let removed = 0;
  if (dict.has(PDFName.of('AA'))) {
    dict.delete(PDFName.of('AA'));
    removed += 1;
  }
  const action = dict.lookupMaybe(PDFName.of('A'), PDFDict);
  if (action) {
    const s = action.get(PDFName.of('S'));
    const safe = s instanceof PDFName && SAFE_ACTIONS.has(nameOf(s)) && !action.has(PDFName.of('Next')) && !action.has(PDFName.of('JS'));
    if (!safe) {
      dict.delete(PDFName.of('A'));
      removed += 1;
    }
  }
  for (const key of dict.keys()) {
    const child = dict.lookup(key);
    if (child instanceof PDFDict) removed += stripActionsDeep(child, seen);
    else if (child instanceof PDFArray) {
      for (let i = 0; i < child.size(); i++) {
        const item = child.lookup(i);
        if (item instanceof PDFDict) removed += stripActionsDeep(item, seen);
      }
    }
  }
  return removed;
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
