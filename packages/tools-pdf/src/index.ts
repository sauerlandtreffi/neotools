import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { pdfMerge } from './tools/pdf-merge.js';
import { pdfSplit } from './tools/pdf-split.js';
import { pdfRotate } from './tools/pdf-rotate.js';
import { pdfReorder } from './tools/pdf-reorder.js';
import { pdfWatermark } from './tools/pdf-watermark.js';
import { pdfPageNumbers } from './tools/pdf-page-numbers.js';
import { pdfMetadata } from './tools/pdf-metadata.js';
import { pdfToImages } from './tools/pdf-to-images.js';
import { imagesToPdf } from './tools/images-to-pdf.js';
import { pdfExtractText } from './tools/pdf-extract-text.js';
import { pdfSanitize } from './tools/pdf-sanitize.js';
import { pdfRedact } from './tools/pdf-redact.js';
import { pdfLock } from './tools/pdf-lock.js';
import { pdfRepair } from './tools/pdf-repair.js';
import { pdfCompress } from './tools/pdf-compress.js';
import { pdfOcr } from './tools/pdf-ocr.js';
import { pdfForms } from './tools/pdf-forms.js';
import { pdfCompare } from './tools/pdf-compare.js';
import { pdfA } from './tools/pdf-a.js';
import { pdfAktenbundler } from './tools/pdf-aktenbundler.js';
import { pdfSign } from './tools/pdf-sign.js';

export const pdfTools: ToolDefinition[] = [
  pdfMerge,
  pdfSplit,
  pdfRotate,
  pdfReorder,
  pdfWatermark,
  pdfPageNumbers,
  pdfMetadata,
  pdfToImages,
  imagesToPdf,
  pdfExtractText,
  pdfSanitize,
  pdfRedact,
  pdfLock,
  pdfRepair,
  pdfCompress,
  pdfOcr,
  pdfForms,
  pdfCompare,
  pdfA,
  pdfAktenbundler,
  pdfSign,
];

export function registerPdfTools(registry: Registry): Registry {
  for (const tool of pdfTools) registry.register(tool);
  return registry;
}

export function createPdfRegistry(): Registry {
  return registerPdfTools(new Registry());
}

export {
  pdfMerge,
  pdfSplit,
  pdfRotate,
  pdfReorder,
  pdfWatermark,
  pdfPageNumbers,
  pdfMetadata,
  pdfToImages,
  imagesToPdf,
  pdfExtractText,
  pdfSanitize,
  pdfRedact,
  pdfLock,
  pdfRepair,
  pdfCompress,
  pdfOcr,
  pdfForms,
  pdfCompare,
  pdfA,
  pdfAktenbundler,
  pdfSign,
};

export { inspectPdf } from './inspect.js';
export type { PdfInspection } from './inspect.js';
export { inspectExtra } from './inspect-extra.js';
export { previewRedactHits, collectHits } from './redact/find.js';
export { isValidIban, isValidSteuerId, isValidSvNummer, isValidKennzeichen, generateSteuerId } from './redact/patterns.js';
export { verifyRedactedPdf } from './redact/verify.js';
export { setNerOverride } from './redact/ner.js';
export { recognizePage, pageHasTextLayer, writeInvisibleWords, wordsToPdfPositions } from './ocr.js';
export type { OcrWord, RecognizePageResult, InvisibleWord } from './ocr.js';
export { qpdfAvailable, encryptPdf, decryptPdf, qpdfCheck } from './qpdf/index.js';
export { validatePdfa } from './pdfa/validate.js';
export { convertToPdfa } from './pdfa/convert.js';
export { comparePdfText } from './compare/text.js';
export { verifyPdfSignatures } from './sign/verify.js';
export { makeSelfSignedP12, loadPkcs12 } from './sign/p12.js';
export { signPdfBytes } from './sign/create.js';
export { openPdfjsDocument, loadPdfjs } from './pdfjs.js';
export { resolvePdfjsWorkerSrc, configurePdfjsWorker } from './pdfjs.js';
