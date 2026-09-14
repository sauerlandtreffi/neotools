import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { docxToPdf, docxToMarkdown, docxToHtml, docxToTxt, markdownToDocx, htmlToDocx, markdownToPdf, markdownToHtml, htmlToPdf, textToPdf } from './tools/docs.js';
import { xlsxToCsv, csvToXlsx, xlsxToJson, jsonToXlsx, xlsxToPdf, csvToPdf } from './tools/sheets.js';
import { pptxToPdf, pptxToImages, pptxToText } from './tools/slides.js';
import { epubToPdfTool, epubToHtmlTool, epubUnpack, epubExtractImages, epubFixFonts, epubFromMarkdown, pdfToEpub } from './tools/ebooks.js';
import { dataClean, vcardTools, icsMerge, fontSubsetTool, qrBatch, ankiFromImages } from './tools/data.js';

export const officeTools: ToolDefinition[] = [
  docxToPdf,
  docxToMarkdown,
  docxToHtml,
  docxToTxt,
  markdownToDocx,
  htmlToDocx,
  markdownToPdf,
  markdownToHtml,
  htmlToPdf,
  textToPdf,
  xlsxToCsv,
  csvToXlsx,
  xlsxToJson,
  jsonToXlsx,
  xlsxToPdf,
  csvToPdf,
  pptxToPdf,
  pptxToImages,
  pptxToText,
  epubToPdfTool,
  epubToHtmlTool,
  epubUnpack,
  epubExtractImages,
  epubFixFonts,
  epubFromMarkdown,
  pdfToEpub,
  dataClean,
  vcardTools,
  icsMerge,
  fontSubsetTool,
  qrBatch,
  ankiFromImages,
];

export function registerOfficeTools(registry: Registry): Registry {
  for (const tool of officeTools) registry.register(tool);
  return registry;
}

export function createOfficeRegistry(): Registry {
  return registerOfficeTools(new Registry());
}

export { OFFICE_LICENSES } from './licenses.js';
export { OFFICE_MIME } from './mime.js';
export { readDocx, writeDocx, readDocxWithFallback } from './core/docx.js';
export { markdownToDoc, docToMarkdown } from './core/markdown.js';
export { htmlToDoc, docToHtml } from './core/html.js';
export { renderDocToPdf } from './core/pdf-render.js';
export { readWorkbook, writeWorkbook } from './core/xlsx.js';
export { readPptx } from './core/pptx.js';
export { readEpub, writeEpub } from './core/epub.js';
export { mergeVCards, parseVCards } from './core/vcard.js';
export { mergeIcs } from './core/ics.js';
export { subsetFont } from './core/font-subset.js';
