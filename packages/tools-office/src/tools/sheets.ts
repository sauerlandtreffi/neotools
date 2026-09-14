import { z } from 'zod';
import { MIME } from '@neotools/engine';
import { officeTool, finish, outFile, pageOpt, requireFile, firstText } from './common.js';
import { OFFICE_MIME } from '../mime.js';
import {
  csvFilesToZip,
  jsonToSheets,
  readWorkbook,
  sheetsToCsvFiles,
  sheetsToJson,
  sheetsToPdf,
  writeWorkbook,
} from '../core/xlsx.js';
import { detectEncoding, parseCsv } from '../core/textdata.js';
import { stem } from '../util/bytes.js';

export const xlsxToCsv = officeTool({
  id: 'xlsx-to-csv',
  pack: 'office',
  category: 'data',
  title: { de: 'XLSX zu CSV', en: 'XLSX to CSV' },
  description: { de: 'Alle Blätter als CSV, bei mehreren als ZIP.', en: 'All sheets as CSV, ZIP if more than one.' },
  inputs: { accept: [OFFICE_MIME.xlsx, '.xlsx', '.xls'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.csv, OFFICE_MIME.zip] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['xlsx csv'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const sheets = readWorkbook(await file.bytes());
    const csvs = sheetsToCsvFiles(sheets);
    if (csvs.length <= 1) {
      const one = csvs[0] ?? { name: `${stem(file.name)}.csv`, text: '' };
      return finish(ctx, 'xlsx-to-csv', files, opts, [outFile(opts.outputName || one.name, new TextEncoder().encode(one.text), OFFICE_MIME.csv)], [], { sheets: sheets.length });
    }
    return finish(ctx, 'xlsx-to-csv', files, opts, [outFile(opts.outputName || `${stem(file.name)}.zip`, csvFilesToZip(csvs), OFFICE_MIME.zip)], [], { sheets: sheets.length });
  },
});

export const csvToXlsx = officeTool({
  id: 'csv-to-xlsx',
  pack: 'office',
  category: 'data',
  title: { de: 'CSV zu XLSX', en: 'CSV to XLSX' },
  description: { de: 'CSV nach Excel (Encoding-Erkennung).', en: 'CSV to Excel (encoding detection).' },
  inputs: { accept: [OFFICE_MIME.csv, '.csv', MIME.txt], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.xlsx] },
  options: z.object({ sheetName: z.string().default('Sheet1'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['csv xlsx'] },
  async run(ctx, files, opts) {
    const sheets = [];
    for (const file of files) {
      const { text } = detectEncoding(await file.bytes());
      const { rows } = parseCsv(text);
      sheets.push({ name: stem(file.name) || opts.sheetName, header: true, rows });
    }
    return finish(ctx, 'csv-to-xlsx', files, opts, [outFile(opts.outputName || `${stem(files[0]!.name)}.xlsx`, writeWorkbook(sheets), OFFICE_MIME.xlsx)]);
  },
});

export const xlsxToJson = officeTool({
  id: 'xlsx-to-json',
  pack: 'office',
  category: 'data',
  title: { de: 'XLSX zu JSON', en: 'XLSX to JSON' },
  description: { de: 'Tabellen als JSON (ein Objekt je Blatt).', en: 'Sheets as JSON (one object per sheet).' },
  inputs: { accept: [OFFICE_MIME.xlsx, '.xlsx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.json] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['xlsx json'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const json = JSON.stringify(sheetsToJson(readWorkbook(await file.bytes())), null, 2) + '\n';
    return finish(ctx, 'xlsx-to-json', files, opts, [outFile(opts.outputName || `${stem(file.name)}.json`, new TextEncoder().encode(json), MIME.json)]);
  },
});

export const jsonToXlsx = officeTool({
  id: 'json-to-xlsx',
  pack: 'office',
  category: 'data',
  title: { de: 'JSON zu XLSX', en: 'JSON to XLSX' },
  description: { de: 'JSON-Array oder Objekt nach Excel.', en: 'JSON array or object to Excel.' },
  inputs: { accept: [MIME.json, '.json'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.xlsx] },
  options: z.object({ sheetName: z.string().default('Sheet1'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['json xlsx'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const data = JSON.parse(await firstText(file)) as unknown;
    const bytes = writeWorkbook(jsonToSheets(data, opts.sheetName));
    return finish(ctx, 'json-to-xlsx', files, opts, [outFile(opts.outputName || `${stem(file.name)}.xlsx`, bytes, OFFICE_MIME.xlsx)]);
  },
});

export const xlsxToPdf = officeTool({
  id: 'xlsx-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'XLSX zu PDF', en: 'XLSX to PDF' },
  description: { de: 'Tabelle als PDF (Spalten, Header, Querformat automatisch).', en: 'Sheet as PDF (columns, header, auto landscape).' },
  inputs: { accept: [OFFICE_MIME.xlsx, '.xlsx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: z.object({ page: pageOpt, outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['xlsx pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const pdf = await sheetsToPdf(readWorkbook(await file.bytes()), { page: opts.page, header: stem(file.name) });
    return finish(ctx, 'xlsx-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings, { pages: pdf.pageCount });
  },
});

export const csvToPdf = officeTool({
  id: 'csv-to-pdf',
  pack: 'office',
  category: 'data',
  title: { de: 'CSV zu PDF', en: 'CSV to PDF' },
  description: { de: 'CSV als Tabellen-PDF.', en: 'CSV as table PDF.' },
  inputs: { accept: [OFFICE_MIME.csv, '.csv', MIME.txt], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: z.object({ page: pageOpt, outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['csv pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { text } = detectEncoding(await file.bytes());
    const { rows } = parseCsv(text);
    const pdf = await sheetsToPdf([{ name: stem(file.name), header: true, rows }], { page: opts.page });
    return finish(ctx, 'csv-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings);
  },
});
