import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import type { VerificationReport } from '@neotools/engine';
import { PDFDocument } from 'pdf-lib';
import { PDF_LICENSES } from '../licenses.js';
import {
  clearInfoDict,
  inspectPdf,
  stripAnnotations,
  stripNamesAndActions,
  stripXmp,
  type PdfInspection,
} from '../inspect.js';
import {
  inspectExtra,
  stripFileAttachmentAnnots,
  stripOcProperties,
  stripPageAndXObjectMetadata,
  stripPieceInfo,
  stripRichMediaAnnots,
  stripStructTree,
  clearStructPlaintext,
  stripThumbnails,
} from '../inspect-extra.js';
import { findSanitizeKeywordsOutsideStreams } from '../redact/byte-scan.js';
import { hasIncrementalEof, loadPdf, savePdfRewritten, stem } from '../pdf-io.js';

const options = z.object({
  removeAnnotations: z.boolean().default(true),
  flattenForms: z.boolean().default(true),
  stripStructTree: z.boolean().default(false),
});

function diffInspect(before: PdfInspection, after: PdfInspection) {
  const found: string[] = [];
  const removed: string[] = [];
  const remaining: string[] = [];
  const flags: Array<keyof PdfInspection> = [
    'hasInfo',
    'hasXmp',
    'hasEmbeddedFiles',
    'hasJavaScript',
    'hasOpenAction',
    'hasAA',
    'hasAcroForm',
    'hasLaunchActions',
    'hasUriActions',
    'hasSubmitForm',
    'hasImportData',
    'hasGoToR',
    'hasXfa',
    'hasEncrypt',
  ];
  for (const key of flags) {
    if (before[key]) found.push(key);
    if (before[key] && !after[key]) removed.push(key);
    if (after[key]) remaining.push(key);
  }
  if (before.annotationCount > 0) found.push(`annotations:${before.annotationCount}`);
  if (after.annotationCount > 0) remaining.push(`annotations:${after.annotationCount}`);
  else if (before.annotationCount > 0) removed.push('annotations');
  return { found, removed, remaining, before, after };
}

export const pdfSanitize = defineTool({
  id: 'pdf-sanitize',
  pack: 'pdf',
  category: 'privacy',
  title: { de: 'PDF bereinigen', en: 'Sanitize PDF' },
  description: {
    de: 'Entfernt Metadaten, XMP, Anhänge, JavaScript/OpenAction; optional Annotationen und Formulare flatten. Danach Verifikation.',
    en: 'Removes metadata, XMP, attachments, JavaScript/OpenAction; optionally annotations and flatten forms. Then verifies.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  presets: [
    {
      id: 'strict',
      title: { de: 'Strikt', en: 'Strict' },
      options: { removeAnnotations: true, flattenForms: true },
    },
    {
      id: 'keep-annots',
      title: { de: 'Kommentare behalten', en: 'Keep comments' },
      options: { removeAnnotations: false, flattenForms: true },
    },
  ],
  privacySensitive: true,
  licenses: PDF_LICENSES,
  seo: {
    keywords: ['pdf sanitize', 'javascript entfernen', 'metadaten löschen'],
    faq: [
      {
        q: {
          de: 'Ist das eine forensische Löschung?',
          en: 'Is this forensic erasure?',
        },
        a: {
          de: 'Es entfernt bekannte Katalog- und Info-Einträge und prüft danach erneut. Eingebettete Objekte in Content-Streams können verbleiben — Welle 2 vertieft die Forensik.',
          en: 'It removes known catalog and info entries and re-scans. Embedded objects in content streams may remain — wave 2 deepens forensics.',
        },
      },
    ],
  },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const before = inspectPdf(doc);
      const infoKeys = clearInfoDict(doc);
      const xmp = stripXmp(doc);
      stripNamesAndActions(doc);
      const extraMeta = stripPageAndXObjectMetadata(doc);
      const piece = stripPieceInfo(doc);
      const thumbs = stripThumbnails(doc);
      const hiddenOcgs = stripOcProperties(doc);
      const rich = stripRichMediaAnnots(doc);
      let struct = false;
      const structText = clearStructPlaintext(doc);
      if (parsed.stripStructTree) struct = stripStructTree(doc);
      let annots = 0;
      if (parsed.removeAnnotations) annots = stripAnnotations(doc);
      else annots = stripFileAttachmentAnnots(doc);
      if (parsed.flattenForms) {
        try {
          const form = doc.getForm();
          form.flatten();
        } catch {
          // no form / already flat
        }
        doc.catalog.delete((await import('pdf-lib')).PDFName.of('AcroForm'));
      }
      const after = inspectPdf(doc);
      const verification = {
        ...diffInspect(before, after),
        extra: { extraMeta, piece, thumbs, hiddenOcgs, struct, structText, rich },
      };
      const pdf = await savePdfRewritten(doc, `${stem(file.name)}-sanitized.pdf`);
      const json = neoFileFromBytes(
        `${stem(file.name)}-sanitize-report.json`,
        new TextEncoder().encode(
          JSON.stringify({ file: file.name, infoKeysRemoved: infoKeys, xmpRemoved: xmp, annotsRemoved: annots, verification }, null, 2),
        ),
        MIME.json,
      );
      outputs.push(pdf, json);
      reports.push({ file: file.name, verification });
      return pdf;
    });
    const provenance = await createProvenance('pdf-sanitize', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
  async verify(_ctx, outputs, raw): Promise<VerificationReport> {
    const parsed = options.parse(raw);
    const checks: VerificationReport['checks'] = [];
    for (const file of outputs) {
      if (file.mime !== MIME.pdf) continue;
      const doc = await PDFDocument.load(await file.bytes(), {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      const bytes = await file.bytes();
      const after = inspectPdf(doc);
      const extra = inspectExtra(doc);
      const flag = (id: string, passed: boolean, detail?: string) => {
        checks.push(detail ? { id: `${file.name}:${id}`, passed, detail } : { id: `${file.name}:${id}`, passed });
      };
      flag('openAction', !after.hasOpenAction);
      flag('javascript', !after.hasJavaScript);
      flag('info', !after.hasInfo);
      flag('xmp', !after.hasXmp && extra.pageMetadataStreams === 0 && extra.xobjectMetadataStreams === 0);
      flag('embedded', !after.hasEmbeddedFiles);
      flag('fileAttachment', extra.fileAttachmentAnnots === 0);
      flag('pieceInfo', !extra.pieceInfo);
      flag('thumbnails', extra.thumbnailCount === 0);
      flag('launch', !after.hasLaunchActions);
      flag('uriAction', !after.hasUriActions);
      flag('submitForm', !after.hasSubmitForm);
      flag('importData', !after.hasImportData);
      flag('gotoR', !after.hasGoToR);
      flag('xfa', !after.hasXfa);
      flag('encrypt', !after.hasEncrypt);
      flag('trailerId', !after.hasTrailerId, after.hasTrailerId ? 'Trailer /ID (Dokument-Fingerabdruck) vorhanden' : undefined);
      flag('richMedia', extra.richMediaAnnots === 0);
      flag('pageAA', extra.pageAA === 0);
      flag(
        'hiddenOcg',
        extra.hiddenOcgCount === 0,
        extra.hiddenOcgNames.length ? extra.hiddenOcgNames.join(', ') : undefined,
      );
      if (parsed.removeAnnotations) flag('annotations', after.annotationCount === 0);
      if (parsed.flattenForms) flag('acroForm', !after.hasAcroForm);
      if (parsed.stripStructTree) flag('structTree', !extra.hasStructTree);
      const rawHits = findSanitizeKeywordsOutsideStreams(bytes);
      flag(
        'rawKeywords',
        rawHits.length === 0,
        rawHits.length ? `Rohbytes außerhalb Streams: ${rawHits.join(', ')}` : 'Keine gefährlichen Namen außerhalb von Streams.',
      );
      flag('incremental', !hasIncrementalEof(bytes), hasIncrementalEof(bytes) ? 'Mehrere %%EOF' : undefined);
    }
    if (!checks.length) checks.push({ id: 'no-pdf', passed: true });
    return { passed: checks.every((c) => c.passed), checks };
  },
});
