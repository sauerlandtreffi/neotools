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
import type { Platform } from '@neotools/engine';
import { inspectPdf } from '../inspect.js';
import { qpdfAvailable, qpdfCheck } from '../qpdf/index.js';
import { parsePdfaid, xmpTextField } from './xmp.js';
import { finding, type PdfaFinding, type PdfaProfile, type PdfaReport } from './types.js';

const STANDARD14 = new Set([
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
  'Symbol',
  'ZapfDingbats',
]);

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

function headerVersion(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 16));
  const m = /%PDF-(\d\.\d)/.exec(head);
  return m?.[1];
}

function hasEof(bytes: Uint8Array): boolean {
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 32)));
  return /%%EOF/.test(tail);
}

function rawHasEncrypt(bytes: Uint8Array): boolean {
  const sample = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
  return /\/Encrypt[\s/]/.test(sample);
}

function walkFonts(
  dict: PDFDict | undefined,
  seen: Set<PDFDict>,
  visit: (font: PDFDict, base: string) => void,
): void {
  if (!dict || seen.has(dict)) return;
  seen.add(dict);
  const fonts = dict.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (fonts) {
    for (const key of fonts.keys()) {
      const font = asDict(fonts.lookup(key)) ?? asStream(fonts.lookup(key))?.dict;
      if (!font) continue;
      const base = textOf(font.get(PDFName.of('BaseFont'))) || nameOf(key);
      const kids = font.lookup(PDFName.of('DescendantFonts'));
      if (kids instanceof PDFArray && kids.size() > 0) {
        for (let i = 0; i < kids.size(); i++) {
          const kid = asDict(kids.lookup(i));
          if (kid) visit(kid, textOf(kid.get(PDFName.of('BaseFont'))) || base);
        }
      } else {
        visit(font, base);
      }
    }
  }
  const xobj = dict.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (xobj) {
    for (const key of xobj.keys()) {
      const child = asStream(xobj.lookup(key))?.dict ?? asDict(xobj.lookup(key));
      if (child) walkFonts(child.lookupMaybe(PDFName.of('Resources'), PDFDict), seen, visit);
    }
  }
}

function fontEmbedded(font: PDFDict): boolean {
  if (font.has(PDFName.of('FontFile')) || font.has(PDFName.of('FontFile2')) || font.has(PDFName.of('FontFile3'))) {
    return true;
  }
  const desc = asDict(font.lookup(PDFName.of('FontDescriptor')));
  if (!desc) return false;
  return desc.has(PDFName.of('FontFile')) || desc.has(PDFName.of('FontFile2')) || desc.has(PDFName.of('FontFile3'));
}

function walkFilters(obj: unknown, acc: Set<string>, seen: Set<unknown>): void {
  if (!obj || seen.has(obj)) return;
  seen.add(obj);
  if (obj instanceof PDFName) {
    acc.add(nameOf(obj));
    return;
  }
  if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) walkFilters(obj.lookup(i), acc, seen);
  }
}

function collectFilters(doc: PDFDocument): Set<string> {
  const acc = new Set<string>();
  const seen = new Set<unknown>();
  for (const page of doc.getPages()) {
    const contents = page.node.lookup(PDFName.of('Contents'));
    const streams = contents instanceof PDFArray ? [...Array.from({ length: contents.size() }, (_, i) => contents.lookup(i))] : [contents];
    for (const s of streams) {
      const st = asStream(s);
      if (st) walkFilters(st.dict.get(PDFName.of('Filter')), acc, seen);
    }
  }
  return acc;
}

function hasTransparencyGroup(doc: PDFDocument): boolean {
  for (const page of doc.getPages()) {
    const group = asDict(page.node.lookup(PDFName.of('Group')));
    if (group) {
      const s = group.get(PDFName.of('S'));
      if (s instanceof PDFName && nameOf(s) === 'Transparency') return true;
    }
  }
  return false;
}

function hasOutputIntent(doc: PDFDocument): boolean {
  const arr = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
  return Boolean(arr && arr.size() > 0);
}

function outputIntentHasIcc(doc: PDFDocument): boolean {
  const arr = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
  if (!arr) return false;
  for (let i = 0; i < arr.size(); i++) {
    const oi = asDict(arr.lookup(i));
    if (oi?.has(PDFName.of('DestOutputProfile'))) return true;
  }
  return false;
}

function attachmentAfOk(doc: PDFDocument, profile: PdfaProfile): { present: boolean; missingRel: boolean } {
  const af = doc.catalog.lookup(PDFName.of('AF'));
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embedded = Boolean(names?.has(PDFName.of('EmbeddedFiles')) || af);
  if (!embedded) return { present: false, missingRel: false };
  if (profile === '2b') return { present: true, missingRel: false };
  let missingRel = false;
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = asDict(af.lookup(i));
      if (spec && !spec.has(PDFName.of('AFRelationship'))) missingRel = true;
    }
  }
  return { present: true, missingRel };
}

function readXmp(doc: PDFDocument): string {
  const meta = doc.catalog.lookup(PDFName.of('Metadata'));
  const stream = asStream(meta);
  if (!stream) return '';
  try {
    const bytes = stream.getContents();
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function hasExternalActions(doc: PDFDocument): boolean {
  const inspect = inspectPdf(doc);
  if (inspect.hasLaunchActions) return true;
  const sample: string[] = [];
  const catalog = doc.catalog;
  for (const key of ['OpenAction', 'AA', 'URI'] as const) {
    if (catalog.has(PDFName.of(key))) sample.push(key);
  }
  return sample.includes('URI') || inspect.hasLaunchActions;
}

export async function validatePdfa(
  bytes: Uint8Array,
  profile: PdfaProfile,
  platform: Platform,
): Promise<PdfaReport> {
  const errors: PdfaFinding[] = [];
  const warnings: PdfaFinding[] = [];
  const hints: PdfaFinding[] = [];
  const push = (f: PdfaFinding) => {
    if (f.severity === 'error') errors.push(f);
    else if (f.severity === 'warning') warnings.push(f);
    else hints.push(f);
  };

  const ver = headerVersion(bytes);
  if (!ver || !['1.4', '1.5', '1.6', '1.7'].includes(ver)) {
    push(
      finding(
        'header',
        'error',
        'ISO 19005-2 6.1.2',
        `Dateikopf muss %PDF-1.4 bis 1.7 sein (gefunden: ${ver ?? 'keiner'}).`,
        `File header must be %PDF-1.4..1.7 (found: ${ver ?? 'none'}).`,
      ),
    );
  }
  if (!hasEof(bytes)) {
    push(
      finding(
        'eof',
        'error',
        'ISO 19005-2 6.1.3',
        'Dateiende %%EOF fehlt.',
        'File must end with %%EOF.',
      ),
    );
  }
  if (rawHasEncrypt(bytes)) {
    push(
      finding(
        'encrypt',
        'error',
        'ISO 19005-2 6.1.3',
        'Verschlüsselung (/Encrypt) ist in PDF/A verboten.',
        'Encryption (/Encrypt) is forbidden in PDF/A.',
      ),
    );
  }

  let doc: PDFDocument | undefined;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err) {
    push(
      finding(
        'parse',
        'error',
        'ISO 19005-2 6.1',
        `PDF nicht lesbar: ${err instanceof Error ? err.message : String(err)}`,
        `PDF unreadable: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return {
      profile,
      subset: 'NeoTools PDF/A-2b/3b subset (no veraPDF). ISO 19005-2 clauses listed per finding.',
      passed: false,
      errors,
      warnings,
      hints,
    };
  }

  if (!doc.catalog) {
    push(
      finding(
        'parse',
        'error',
        'ISO 19005-2 6.1',
        'PDF-Catalog fehlt oder ist unlesbar.',
        'PDF catalog is missing or unreadable.',
      ),
    );
    return {
      profile,
      subset: 'NeoTools PDF/A-2b/3b subset (no veraPDF). ISO 19005-2 clauses listed per finding.',
      passed: false,
      errors,
      warnings,
      hints,
    };
  }

  const xmp = readXmp(doc);
  const aid = parsePdfaid(xmp);
  const wantPart = profile === '3b' ? '3' : '2';
  if (!xmp || aid.part !== wantPart || (aid.conformance ?? '').toUpperCase() !== 'B') {
    push(
      finding(
        'pdfaid',
        'error',
        'ISO 19005-2 6.6.2',
        `XMP braucht pdfaid:part=${wantPart} und pdfaid:conformance=B.`,
        `XMP must declare pdfaid:part=${wantPart} and pdfaid:conformance=B.`,
      ),
    );
  }

  const infoTitle = doc.getTitle() ?? '';
  const xmpTitle = xmpTextField(xmp, 'title');
  if (infoTitle && xmpTitle && infoTitle !== xmpTitle) {
    push(
      finding(
        'info-xmp',
        'error',
        'ISO 19005-2 6.6.2',
        'Info-Dict Title und XMP dc:title stimmen nicht überein.',
        'Info dictionary Title and XMP dc:title are inconsistent.',
      ),
    );
  }

  const inspect = inspectPdf(doc);
  if (inspect.hasJavaScript) {
    push(
      finding(
        'js',
        'error',
        'ISO 19005-2 6.3.3',
        'JavaScript-Aktionen sind in PDF/A verboten.',
        'JavaScript actions are forbidden in PDF/A.',
      ),
    );
  }
  if (inspect.hasLaunchActions || hasExternalActions(doc)) {
    push(
      finding(
        'launch',
        'error',
        'ISO 19005-2 6.3.3',
        'Launch-/externe Aktionen sind verboten.',
        'Launch/external actions are forbidden.',
      ),
    );
  }

  const seenFonts = new Set<PDFDict>();
  const missing: string[] = [];
  for (const page of doc.getPages()) {
    walkFonts(page.node.lookupMaybe(PDFName.of('Resources'), PDFDict), seenFonts, (font, base) => {
      const short = base.replace(/^[A-Z]{6}\+/, '');
      if (!fontEmbedded(font)) {
        if (STANDARD14.has(short) || STANDARD14.has(base)) missing.push(`${base} (Standard-14, nicht eingebettet)`);
        else missing.push(base);
      }
    });
  }
  if (missing.length) {
    push(
      finding(
        'fonts',
        'error',
        'ISO 19005-2 6.2.11.4',
        `Nicht eingebettete Schriften: ${missing.join(', ')}. Standard-14 ohne Einbettung ist in PDF/A ein Fehler.`,
        `Fonts not embedded: ${missing.join(', ')}. Standard 14 without embedding is an error in PDF/A.`,
      ),
    );
  }

  const filters = collectFilters(doc);
  if (filters.has('LZWDecode')) {
    push(
      finding(
        'lzw',
        'error',
        'ISO 19005-2 6.1.10',
        'LZWDecode ist in PDF/A nicht erlaubt.',
        'LZWDecode is not allowed in PDF/A.',
      ),
    );
  }

  const hasOi = hasOutputIntent(doc);
  if (!hasOi) {
    push(
      finding(
        'outputintent',
        'error',
        'ISO 19005-2 6.2.3',
        'OutputIntent mit ICC-Profil fehlt (sRGB erwartet).',
        'OutputIntent with ICC profile is missing (sRGB expected).',
      ),
    );
  } else if (!outputIntentHasIcc(doc)) {
    push(
      finding(
        'outputintent-icc',
        'error',
        'ISO 19005-2 6.2.3',
        'OutputIntent ohne DestOutputProfile (ICC).',
        'OutputIntent lacks DestOutputProfile (ICC).',
      ),
    );
  }
  if (hasTransparencyGroup(doc) && !hasOi) {
    push(
      finding(
        'transparency',
        'error',
        'ISO 19005-2 6.2.3 / 6.4',
        'Transparente Gruppe ohne OutputIntent (light check).',
        'Transparent group without OutputIntent (light check).',
      ),
    );
  }

  const af = attachmentAfOk(doc, profile);
  if (af.present && profile === '2b') {
    push(
      finding(
        'embedded-2b',
        'error',
        'ISO 19005-2 6.8',
        'Eingebettete Dateien sind in PDF/A-2b nicht erlaubt (nur 3b).',
        'Embedded files are not allowed in PDF/A-2b (only 3b).',
      ),
    );
  }
  if (af.present && profile === '3b' && af.missingRel) {
    push(
      finding(
        'afrelationship',
        'error',
        'ISO 19005-3 6.8',
        'Anhänge brauchen AFRelationship (PDF/A-3).',
        'Attachments need AFRelationship (PDF/A-3).',
      ),
    );
  }

  if (!doc.catalog.has(PDFName.of('MarkInfo'))) {
    push(
      finding(
        'markinfo',
        'hint',
        'ISO 19005-2 6.7',
        'MarkInfo fehlt (nur Hinweis — Ziel ist 2b/3b, nicht 2a/3a).',
        'MarkInfo missing (hint only — 2a/3a is out of scope).',
      ),
    );
  }

  if (platform.capabilities.qpdf && (await qpdfAvailable())) {
    const check = await qpdfCheck(bytes);
    if (!check.ok) {
      push(
        finding(
          'xref',
          'error',
          'ISO 19005-2 6.1.4',
          `XRef/Struktur (qpdf --check) fehlgeschlagen: ${check.stderr.slice(0, 240)}`,
          `XRef/structure (qpdf --check) failed: ${check.stderr.slice(0, 240)}`,
        ),
      );
    }
  } else {
    push(
      finding(
        'xref-skip',
        'hint',
        'ISO 19005-2 6.1.4',
        'qpdf --check nicht verfügbar — XRef nicht geprüft.',
        'qpdf --check unavailable — XRef not verified.',
      ),
    );
  }

  return {
    profile,
    subset: 'NeoTools PDF/A-2b/3b subset (no veraPDF). ISO 19005-2 clauses listed per finding.',
    passed: errors.length === 0,
    errors,
    warnings,
    hints,
  };
}
