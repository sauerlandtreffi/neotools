import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from 'pdf-lib';

const STANDARD = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Symbol',
  'ZapfDingbats',
]);

function asDict(obj: unknown): PDFDict | undefined {
  return obj instanceof PDFDict ? obj : undefined;
}

function walkFonts(
  resources: PDFDict | undefined,
  seen: Set<PDFDict>,
  visit: (font: PDFDict) => void,
): void {
  if (!resources || seen.has(resources)) return;
  seen.add(resources);
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (fonts) {
    for (const key of fonts.keys()) {
      const font = asDict(fonts.lookup(key));
      if (font) visit(font);
    }
  }
  const xobj = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobj) return;
  for (const key of xobj.keys()) {
    const child = xobj.lookup(key);
    const dict = child instanceof PDFRawStream || child instanceof PDFStream ? child.dict : asDict(child);
    if (!dict) continue;
    walkFonts(dict.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, visit);
  }
}

/** Fonts referenced from annotation appearance streams (/AP N|R|D, incl. state sub-dicts). */
function walkAppearanceFonts(page: PDFDict, seen: Set<PDFDict>, visit: (font: PDFDict) => void): void {
  const annots = page.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return;
  const walkDict = (dict: PDFDict, depth: number) => {
    if (depth > 4 || seen.has(dict)) return;
    seen.add(dict);
    for (const key of dict.keys()) {
      const child = dict.lookup(key);
      if (child instanceof PDFRawStream || child instanceof PDFStream) {
        walkFonts(child.dict.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, visit);
      } else if (child instanceof PDFDict) walkDict(child, depth + 1);
    }
  };
  for (let i = 0; i < annots.size(); i++) {
    const annot = annots.lookup(i);
    if (!(annot instanceof PDFDict)) continue;
    const ap = annot.lookupMaybe(PDFName.of('AP'), PDFDict);
    if (ap) walkDict(ap, 0);
  }
}

const NEEDS_TOUNICODE = new Set(['/Type0', '/Type1', '/MMType1', '/TrueType', '/Type3', '/CIDFontType0', '/CIDFontType2']);

/**
 * Pages whose fonts (page, nested XObjects, annotation appearances) map glyph
 * codes without a ToUnicode CMap. Standard-14 fonts are exempt. Type3 fonts are
 * always reported: their glyphs are arbitrary procedures, text extraction is unreliable.
 */
export function pagesMissingToUnicode(doc: PDFDocument): number[] {
  const pages: number[] = [];
  const seen = new Set<PDFDict>();
  doc.getPages().forEach((page, i) => {
    let missing = false;
    const visit = (font: PDFDict) => {
      const subtype = font.lookup(PDFName.of('Subtype'));
      const typeName = subtype instanceof PDFName ? subtype.toString() : '';
      if (typeName === '/Type3') {
        missing = true;
        return;
      }
      const name = font.lookup(PDFName.of('BaseFont'));
      const base = name instanceof PDFName ? name.toString().replace(/^\//, '').replace(/^[A-Z]{6}\+/, '') : '';
      if (STANDARD.has(base)) return;
      if (NEEDS_TOUNICODE.has(typeName) && !font.has(PDFName.of('ToUnicode'))) missing = true;
    };
    walkFonts(page.node.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, visit);
    walkAppearanceFonts(page.node, seen, visit);
    if (missing) pages.push(i + 1);
  });
  return pages;
}
