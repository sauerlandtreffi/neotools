import * as XLSX from 'xlsx';
import { zipBytes, type ZipMap } from '../util/zip.js';
import { utf8 } from '../util/bytes.js';
import { renderDocToPdf, type PdfRenderOptions, type PdfRenderResult } from './pdf-render.js';
import type { Doc, TableBlock } from './model.js';

export interface SheetTable {
  name: string;
  header: boolean;
  rows: string[][];
}

function bookFromBytes(bytes: Uint8Array): XLSX.WorkBook {
  return XLSX.read(bytes, { type: 'array', cellDates: true, raw: false });
}

export function readWorkbook(bytes: Uint8Array): SheetTable[] {
  const wb = bookFromBytes(bytes);
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return { name, header: true, rows: [] };
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });
    return {
      name,
      header: true,
      rows: rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [])),
    };
  });
}

export function sheetsToCsvFiles(sheets: SheetTable[]): Array<{ name: string; text: string }> {
  return sheets.map((s) => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    return { name: `${safeName(s.name)}.csv`, text: XLSX.utils.sheet_to_csv(ws) };
  });
}

export function csvFilesToZip(files: Array<{ name: string; text: string }>): Uint8Array {
  const zip: ZipMap = {};
  for (const f of files) zip[f.name] = utf8(f.text);
  return zipBytes(zip);
}

export function sheetsToJson(sheets: SheetTable[]): unknown {
  return Object.fromEntries(
    sheets.map((s) => {
      const [header, ...rest] = s.rows;
      if (!header?.length) return [s.name, s.rows];
      const records = rest.map((row) => {
        const obj: Record<string, string> = {};
        header.forEach((h, i) => {
          obj[h || `col${i + 1}`] = row[i] ?? '';
        });
        return obj;
      });
      return [s.name, records];
    }),
  );
}

export function writeWorkbook(sheets: SheetTable[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || 'Sheet1');
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

export function jsonToSheets(data: unknown, sheetName = 'Sheet1'): SheetTable[] {
  if (Array.isArray(data)) {
    if (!data.length) return [{ name: sheetName, header: true, rows: [] }];
    if (Array.isArray(data[0])) {
      return [{ name: sheetName, header: true, rows: data.map((r) => (r as unknown[]).map((c) => String(c ?? ''))) }];
    }
    const keys = Array.from(new Set(data.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : []))));
    const rows = [keys, ...data.map((row) => keys.map((k) => (row && typeof row === 'object' ? String((row as Record<string, unknown>)[k] ?? '') : '')))];
    return [{ name: sheetName, header: true, rows }];
  }
  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>).flatMap(([k, v]) => jsonToSheets(v, k));
  }
  return [{ name: sheetName, header: true, rows: [[String(data ?? '')]] }];
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'sheet';
}

export function sheetsToDoc(sheets: SheetTable[]): Doc {
  const blocks: Doc['blocks'] = [];
  for (const sheet of sheets) {
    blocks.push({ type: 'heading', level: 2, runs: [{ text: sheet.name, bold: true }] });
    const table: TableBlock = {
      type: 'table',
      header: sheet.header,
      rows: sheet.rows.map((r) => ({
        cells: r.map((c) => ({ blocks: [{ type: 'paragraph', runs: [{ text: c }] }] })),
      })),
    };
    blocks.push(table);
  }
  return { title: sheets[0]?.name, blocks };
}

export async function sheetsToPdf(sheets: SheetTable[], options: PdfRenderOptions = {}): Promise<PdfRenderResult> {
  const wide = sheets.some((s) => (s.rows[0]?.length ?? 0) > 6);
  return renderDocToPdf(sheetsToDoc(sheets), { ...options, landscape: options.landscape ?? wide });
}
