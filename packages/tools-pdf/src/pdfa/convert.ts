import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
} from 'pdf-lib';
import type { Platform } from '@neotools/engine';
import { inspectPdf, stripNamesAndActions, stripXmp } from '../inspect.js';
import { stripFileAttachmentAnnots } from '../inspect-extra.js';
import { qpdfAvailable, qpdfRewrite } from '../qpdf/index.js';
import { openPdfjsDocument } from '../pdfjs.js';
import { renderPdfjsPage } from '../render-page.js';
import { encodePngRgba } from '../codecs/png-bytes.js';
import { SRGB_ICC_BYTES } from './srgb-icc.js';
import { buildPdfaXmp } from './xmp.js';
import { validatePdfa } from './validate.js';
import type { PdfaProfile, PdfaReport } from './types.js';

export interface ConvertOptions {
  profile: PdfaProfile;
  rasterizeFallback: boolean;
}

export interface ConvertResult {
  bytes: Uint8Array;
  report: PdfaReport;
  warnings: string[];
}

function embedXmp(doc: PDFDocument, xml: string): void {
  stripXmp(doc);
  const bytes = new TextEncoder().encode(xml);
  const stream = doc.context.stream(bytes, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
}

function embedSrgbOutputIntent(doc: PDFDocument): void {
  const icc = doc.context.flateStream(SRGB_ICC_BYTES, {
    N: 3,
    Alternate: 'DeviceRGB',
  });
  const iccRef = doc.context.register(icc);
  const intent = doc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([doc.context.register(intent)]));
}

function ensureAfRelationship(doc: PDFDocument): void {
  const af = doc.catalog.lookup(PDFName.of('AF'));
  if (af instanceof PDFArray) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookup(i);
      if (spec instanceof PDFDict && !spec.has(PDFName.of('AFRelationship'))) {
        spec.set(PDFName.of('AFRelationship'), PDFName.of('Unspecified'));
      }
    }
  }
}

function stripForbiddenActions(doc: PDFDocument): void {
  stripNamesAndActions(doc);
  for (const page of doc.getPages()) {
    page.node.delete(PDFName.of('AA'));
  }
}

async function rasterizeAllPages(bytes: Uint8Array, platform: Platform): Promise<Uint8Array | undefined> {
  try {
    const src = await openPdfjsDocument(bytes);
    const out = await PDFDocument.create();
    for (let i = 1; i <= src.numPages; i++) {
      const page = await src.getPage(i);
      const raster = await renderPdfjsPage(page, 120, platform);
      const png = encodePngRgba(raster.data, raster.width, raster.height);
      const img = await out.embedPng(png);
      const p = out.addPage([img.width, img.height]);
      p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    await src.destroy();
    return new Uint8Array(await out.save({ updateFieldAppearances: false }));
  } catch {
    return undefined;
  }
}

function patchHeader(bytes: Uint8Array, version = '1.7'): Uint8Array {
  const latin = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (!latin.startsWith('%PDF-')) return bytes;
  const out = new Uint8Array(bytes);
  const tag = `%PDF-${version}`;
  const enc = new TextEncoder().encode(tag);
  out.set(enc, 0);
  return out;
}

export async function convertToPdfa(
  input: Uint8Array,
  opts: ConvertOptions,
  platform: Platform,
): Promise<ConvertResult> {
  const warnings: string[] = [];
  let bytes = input;

  if (platform.capabilities.qpdf && (await qpdfAvailable())) {
    try {
      bytes = await qpdfRewrite(bytes, ['--recompress-flate', '--object-streams=generate']);
    } catch (err) {
      warnings.push(`qpdf recompress: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const inspect = inspectPdf(doc);
  if (inspect.hasJavaScript || inspect.hasLaunchActions || inspect.hasOpenAction) {
    stripForbiddenActions(doc);
  }

  if (opts.profile === '2b') {
    const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    names?.delete(PDFName.of('EmbeddedFiles'));
    doc.catalog.delete(PDFName.of('AF'));
    stripFileAttachmentAnnots(doc);
  } else {
    ensureAfRelationship(doc);
  }

  const title = doc.getTitle() ?? '';
  const author = doc.getAuthor() ?? '';
  const subject = doc.getSubject() ?? '';
  const keywords = doc.getKeywords() ?? '';
  doc.setTitle(title);
  doc.setAuthor(author);
  doc.setSubject(subject);
  if (keywords) doc.setKeywords(keywords.split(/[,;]/).map((s) => s.trim()).filter(Boolean));
  doc.setCreator(doc.getCreator() || 'NeoTools');
  doc.setProducer('NeoTools pdf-a');
  embedXmp(
    doc,
    buildPdfaXmp({
      part: opts.profile === '3b' ? '3' : '2',
      conformance: 'B',
      title,
      author,
      subject,
      keywords,
      creator: doc.getCreator() ?? 'NeoTools',
      producer: 'NeoTools pdf-a',
    }),
  );
  embedSrgbOutputIntent(doc);
  doc.catalog.set(PDFName.of('Version'), PDFName.of('1.7'));

  bytes = new Uint8Array(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
  bytes = patchHeader(bytes, '1.7');

  let report = await validatePdfa(bytes, opts.profile, platform);
  const fontErr = report.errors.find((e) => e.id === 'fonts');
  if (fontErr) {
    warnings.push(
      'Standard-14-Schriften können nicht nachträglich eingebettet werden. Optional Rasterisierungs-Fallback der betroffenen Seiten.',
    );
    if (opts.rasterizeFallback) {
      const raster = await rasterizeAllPages(bytes, platform);
      if (raster) {
        const again = await PDFDocument.load(raster, { ignoreEncryption: true, updateMetadata: false });
        const font = await again.embedFont(StandardFonts.Helvetica);
        void font;
        again.setTitle(title);
        again.setAuthor(author);
        again.setProducer('NeoTools pdf-a');
        embedXmp(
          again,
          buildPdfaXmp({
            part: opts.profile === '3b' ? '3' : '2',
            conformance: 'B',
            title,
            author,
            subject,
            keywords,
            producer: 'NeoTools pdf-a',
          }),
        );
        embedSrgbOutputIntent(again);
        bytes = patchHeader(
          new Uint8Array(await again.save({ useObjectStreams: false, updateFieldAppearances: false })),
          '1.7',
        );
        warnings.push('Seiten wurden gerastert, damit keine uneingebetteten Standard-14-Fonts verbleiben.');
        report = await validatePdfa(bytes, opts.profile, platform);
      } else {
        warnings.push('Rasterisierungs-Fallback nicht möglich (kein Canvas).');
      }
    }
  }

  report = await validatePdfa(bytes, opts.profile, platform);
  return { bytes, report, warnings };
}
