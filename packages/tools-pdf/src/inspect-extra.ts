import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  PDFHexString,
} from 'pdf-lib';

const RICH_SUBTYPES = new Set(['RichMedia', '3D', 'Sound', 'Movie', 'Screen']);

export interface PdfExtraInspection {
  pageMetadataStreams: number;
  xobjectMetadataStreams: number;
  pieceInfo: boolean;
  thumbnailCount: number;
  hasStructTree: boolean;
  ocgCount: number;
  hiddenOcgCount: number;
  hiddenOcgNames: string[];
  fileAttachmentAnnots: number;
  richMediaAnnots: number;
  pageAA: number;
}

function nameOf(n: PDFName): string {
  return n.toString().replace(/^\//, '');
}

function asDict(obj: unknown): PDFDict | undefined {
  return obj instanceof PDFDict ? obj : undefined;
}

function asStream(obj: unknown): PDFRawStream | PDFStream | undefined {
  if (obj instanceof PDFRawStream || obj instanceof PDFStream) return obj;
  return undefined;
}

function textOf(obj: unknown): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText();
  if (obj instanceof PDFName) return nameOf(obj);
  return '';
}

function walkXObjects(
  dict: PDFDict | undefined,
  seen: Set<PDFDict>,
  visit: (streamDict: PDFDict) => void,
): void {
  if (!dict || seen.has(dict)) return;
  seen.add(dict);
  const xobj = dict.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobj) return;
  for (const key of xobj.keys()) {
    const child = xobj.lookup(key);
    const stream = asStream(child);
    const childDict = stream?.dict ?? asDict(child);
    if (!childDict) continue;
    visit(childDict);
    const resources = childDict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    walkXObjects(resources, seen, visit);
  }
}

export function inspectExtra(doc: PDFDocument): PdfExtraInspection {
  const catalog = doc.catalog;
  let pageMetadataStreams = 0;
  let xobjectMetadataStreams = 0;
  let pieceInfo = catalog.has(PDFName.of('PieceInfo'));
  let thumbnailCount = 0;
  let fileAttachmentAnnots = 0;
  let richMediaAnnots = 0;
  let pageAA = 0;
  const seen = new Set<PDFDict>();

  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('Metadata'))) pageMetadataStreams += 1;
    if (page.node.has(PDFName.of('PieceInfo'))) pieceInfo = true;
    if (page.node.has(PDFName.of('Thumb'))) thumbnailCount += 1;
    if (page.node.has(PDFName.of('AA'))) pageAA += 1;
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      for (let i = 0; i < annots.size(); i++) {
        const annot = annots.lookup(i);
        if (!(annot instanceof PDFDict)) continue;
        const subtype = annot.get(PDFName.of('Subtype'));
        if (subtype instanceof PDFName && nameOf(subtype) === 'FileAttachment') {
          fileAttachmentAnnots += 1;
        }
        if (subtype instanceof PDFName && RICH_SUBTYPES.has(nameOf(subtype))) {
          richMediaAnnots += 1;
        }
      }
    }
    walkXObjects(page.node.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, (d) => {
      if (d.has(PDFName.of('Metadata'))) xobjectMetadataStreams += 1;
      if (d.has(PDFName.of('PieceInfo'))) pieceInfo = true;
    });
  }

  const oc = catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
  const hiddenOcgNames: string[] = [];
  let ocgCount = 0;
  if (oc) {
    const ocgs = oc.lookupMaybe(PDFName.of('OCGs'), PDFArray);
    ocgCount = ocgs?.size() ?? 0;
    const d = oc.lookupMaybe(PDFName.of('D'), PDFDict);
    const off = d?.lookupMaybe(PDFName.of('OFF'), PDFArray);
    if (off) {
      for (let i = 0; i < off.size(); i++) {
        const layer = off.lookup(i);
        const layerDict = asDict(layer);
        const name = layerDict ? textOf(layerDict.get(PDFName.of('Name'))) : '';
        hiddenOcgNames.push(name || `ocg-${i}`);
      }
    }
  }

  return {
    pageMetadataStreams,
    xobjectMetadataStreams,
    pieceInfo,
    thumbnailCount,
    hasStructTree: catalog.has(PDFName.of('StructTreeRoot')),
    ocgCount,
    hiddenOcgCount: hiddenOcgNames.length,
    hiddenOcgNames,
    fileAttachmentAnnots,
    richMediaAnnots,
    pageAA,
  };
}

export function stripPageAndXObjectMetadata(doc: PDFDocument): number {
  let removed = 0;
  const seen = new Set<PDFDict>();
  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('Metadata'))) {
      page.node.delete(PDFName.of('Metadata'));
      removed += 1;
    }
    walkXObjects(page.node.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, (d) => {
      if (d.has(PDFName.of('Metadata'))) {
        d.delete(PDFName.of('Metadata'));
        removed += 1;
      }
    });
  }
  return removed;
}

export function stripPieceInfo(doc: PDFDocument): boolean {
  let found = doc.catalog.has(PDFName.of('PieceInfo'));
  doc.catalog.delete(PDFName.of('PieceInfo'));
  const seen = new Set<PDFDict>();
  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('PieceInfo'))) {
      page.node.delete(PDFName.of('PieceInfo'));
      found = true;
    }
    walkXObjects(page.node.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, (d) => {
      if (d.has(PDFName.of('PieceInfo'))) {
        d.delete(PDFName.of('PieceInfo'));
        found = true;
      }
    });
  }
  return found;
}

export function stripThumbnails(doc: PDFDocument): number {
  let removed = 0;
  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('Thumb'))) {
      page.node.delete(PDFName.of('Thumb'));
      removed += 1;
    }
  }
  return removed;
}

export function stripStructTree(doc: PDFDocument): boolean {
  if (!doc.catalog.has(PDFName.of('StructTreeRoot'))) return false;
  doc.catalog.delete(PDFName.of('StructTreeRoot'));
  doc.catalog.delete(PDFName.of('MarkInfo'));
  return true;
}

const STRUCT_TEXT_KEYS = new Set(['ActualText', 'Alt', 'E']);

export function clearStructPlaintext(doc: PDFDocument): number {
  const root = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict);
  if (!root) return 0;
  const seen = new Set<PDFDict>();
  let cleared = 0;
  const walk = (dict: PDFDict) => {
    if (seen.has(dict)) return;
    seen.add(dict);
    for (const key of dict.keys()) {
      const name = nameOf(key);
      const value = dict.lookup(key);
      if (STRUCT_TEXT_KEYS.has(name) && (value instanceof PDFString || value instanceof PDFHexString)) {
        dict.set(key, PDFString.of(''));
        cleared += 1;
      }
      if (value instanceof PDFDict) walk(value);
      else if (value instanceof PDFArray) {
        for (let i = 0; i < value.size(); i++) {
          const item = value.lookup(i);
          if (item instanceof PDFDict) walk(item);
        }
      }
    }
  };
  walk(root);
  return cleared;
}

export function stripOcProperties(doc: PDFDocument): string[] {
  const extra = inspectExtra(doc);
  if (doc.catalog.has(PDFName.of('OCProperties'))) {
    doc.catalog.delete(PDFName.of('OCProperties'));
  }
  return extra.hiddenOcgNames;
}

export function stripRichMediaAnnots(doc: PDFDocument): number {
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    const keep: ReturnType<PDFArray['get']>[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict) {
        const subtype = annot.get(PDFName.of('Subtype'));
        if (subtype instanceof PDFName && RICH_SUBTYPES.has(nameOf(subtype))) {
          removed += 1;
          continue;
        }
        annot.delete(PDFName.of('A'));
        annot.delete(PDFName.of('AA'));
      }
      keep.push(ref);
    }
    if (removed > 0) {
      if (keep.length === 0) page.node.delete(PDFName.of('Annots'));
      else page.node.set(PDFName.of('Annots'), doc.context.obj(keep));
    }
  }
  return removed;
}

export function stripFileAttachmentAnnots(doc: PDFDocument): number {
  let removed = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (!annots) continue;
    const keep: ReturnType<PDFArray['get']>[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const annot = annots.lookup(i);
      if (annot instanceof PDFDict) {
        const subtype = annot.get(PDFName.of('Subtype'));
        if (subtype instanceof PDFName && nameOf(subtype) === 'FileAttachment') {
          removed += 1;
          continue;
        }
      }
      keep.push(ref);
    }
    if (removed > 0) {
      if (keep.length === 0) page.node.delete(PDFName.of('Annots'));
      else page.node.set(PDFName.of('Annots'), doc.context.obj(keep));
    }
  }
  return removed;
}
