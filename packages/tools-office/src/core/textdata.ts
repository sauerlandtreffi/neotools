import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { fromUtf8, utf8 } from '../util/bytes.js';

export type DataKind = 'csv' | 'json' | 'yaml' | 'xml';

export interface SchemaColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'empty';
  empty: number;
  samples: string[];
}

export interface CleanReport {
  kind: DataKind;
  encoding: string;
  delimiter?: string;
  rows?: number;
  columns?: SchemaColumn[];
  droppedEmptyColumns: string[];
  droppedDuplicateRows: number;
  warnings: string[];
}

export function detectEncoding(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: fromUtf8(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: iconv.decode(Buffer.from(bytes), 'utf16-le'), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: iconv.decode(Buffer.from(bytes), 'utf16-be'), encoding: 'utf-16be' };
  }
  const utf8Text = fromUtf8(bytes);
  const replacement = (utf8Text.match(/\uFFFD/g) ?? []).length;
  const high = [...bytes].filter((b) => b >= 0x80).length;
  if (replacement > 0 && high > 0) {
    const win = iconv.decode(Buffer.from(bytes), 'win1252');
    const lat = iconv.decode(Buffer.from(bytes), 'latin1');
    const winBad = (win.match(/\uFFFD/g) ?? []).length;
    return winBad <= (lat.match(/\uFFFD/g) ?? []).length
      ? { text: win, encoding: 'windows-1252' }
      : { text: lat, encoding: 'iso-8859-1' };
  }
  return { text: utf8Text, encoding: 'utf-8' };
}

export function sniffKind(name: string, mime: string, text: string): DataKind {
  const n = name.toLowerCase();
  if (n.endsWith('.csv') || mime.includes('csv')) return 'csv';
  if (n.endsWith('.yaml') || n.endsWith('.yml') || mime.includes('yaml')) return 'yaml';
  if (n.endsWith('.xml') || mime.includes('xml')) return 'xml';
  if (n.endsWith('.json') || mime.includes('json')) return 'json';
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (t.startsWith('<')) return 'xml';
  if (t.includes(':\n') || t.startsWith('---')) return 'yaml';
  return 'csv';
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = {
    ',': (first.match(/,/g) ?? []).length,
    ';': (first.match(/;/g) ?? []).length,
    '\t': (first.match(/\t/g) ?? []).length,
    '|': (first.match(/\|/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
}

function guessType(values: string[]): SchemaColumn['type'] {
  const nonempty = values.filter((v) => v.trim() !== '');
  if (!nonempty.length) return 'empty';
  if (nonempty.every((v) => /^(true|false|yes|no|ja|nein|1|0)$/i.test(v))) return 'boolean';
  if (nonempty.every((v) => /^-?\d+([.,]\d+)?$/.test(v))) return 'number';
  if (nonempty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(v))) return 'date';
  return 'string';
}

function normalizeDate(value: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(value.trim());
  if (de) {
    const y = de[3]!.length === 2 ? `20${de[3]}` : de[3]!;
    return `${y}-${de[2]!.padStart(2, '0')}-${de[1]!.padStart(2, '0')}`;
  }
  return value;
}

export function parseCsv(text: string, delimiter?: string): { fields: string[]; rows: string[][] } {
  const delim = delimiter ?? detectDelimiter(text);
  const parsed = Papa.parse<string[]>(text, { delimiter: delim, skipEmptyLines: 'greedy' });
  const rows = (parsed.data ?? []).map((r) => r.map((c) => String(c ?? '')));
  const fields = rows[0] ?? [];
  return { fields, rows };
}

export function cleanRecords(
  kind: DataKind,
  text: string,
  options: { dropEmptyColumns?: boolean; dropDuplicates?: boolean; trim?: boolean; normalizeDates?: boolean } = {},
): { text: string; report: CleanReport; data: unknown } {
  const dropEmpty = options.dropEmptyColumns !== false;
  const dropDup = options.dropDuplicates !== false;
  const trim = options.trim !== false;
  const normDates = options.normalizeDates !== false;
  const warnings: string[] = [];
  if (kind === 'csv') {
    const { fields, rows } = parseCsv(text);
    if (rows.length < 1) {
      return {
        text,
        data: [],
        report: { kind, encoding: 'utf-8', droppedEmptyColumns: [], droppedDuplicateRows: 0, warnings: ['leere CSV'] },
      };
    }
    const header = fields.map((h, i) => (trim ? h.trim() : h) || `col${i + 1}`);
    let body = rows.slice(1).map((r) => header.map((_, i) => (trim ? (r[i] ?? '').trim() : (r[i] ?? ''))));
    if (normDates) body = body.map((r) => r.map((c, i) => (guessType(body.map((x) => x[i] ?? '')) === 'date' ? normalizeDate(c) : c)));
    const keep: number[] = [];
    const dropped: string[] = [];
    header.forEach((h, i) => {
      const empty = body.every((r) => !(r[i] ?? '').trim());
      if (empty && dropEmpty) dropped.push(h);
      else keep.push(i);
    });
    const slimHeader = keep.map((i) => header[i]!);
    let slim = body.map((r) => keep.map((i) => r[i] ?? ''));
    let dup = 0;
    if (dropDup) {
      const seen = new Set<string>();
      slim = slim.filter((r) => {
        const k = r.join('\u0001');
        if (seen.has(k)) {
          dup += 1;
          return false;
        }
        seen.add(k);
        return true;
      });
    }
    const columns: SchemaColumn[] = slimHeader.map((name, i) => {
      const values = slim.map((r) => r[i] ?? '');
      return { name, type: guessType(values), empty: values.filter((v) => !v.trim()).length, samples: values.filter(Boolean).slice(0, 3) };
    });
    const out = Papa.unparse([slimHeader, ...slim], { delimiter: detectDelimiter(text) });
    return {
      text: out.endsWith('\n') ? out : `${out}\n`,
      data: slim.map((r) => Object.fromEntries(slimHeader.map((h, i) => [h, r[i] ?? '']))),
      report: {
        kind,
        encoding: 'utf-8',
        delimiter: detectDelimiter(text),
        rows: slim.length,
        columns,
        droppedEmptyColumns: dropped,
        droppedDuplicateRows: dup,
        warnings,
      },
    };
  }
  if (kind === 'json') {
    const data = JSON.parse(text) as unknown;
    return { text: `${JSON.stringify(data, null, 2)}\n`, data, report: baseReport(kind, warnings) };
  }
  if (kind === 'yaml') {
    const data = parseYaml(text);
    return { text: stringifyYaml(data), data, report: baseReport(kind, warnings) };
  }
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: trim });
  const data = parser.parse(text);
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  return { text: `${builder.build(data)}\n`, data, report: baseReport(kind, warnings) };
}

function baseReport(kind: DataKind, warnings: string[]): CleanReport {
  return { kind, encoding: 'utf-8', droppedEmptyColumns: [], droppedDuplicateRows: 0, warnings };
}

export function convertData(data: unknown, to: DataKind): string {
  if (to === 'json') return `${JSON.stringify(data, null, 2)}\n`;
  if (to === 'yaml') return stringifyYaml(data);
  if (to === 'xml') {
    const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
    return `${builder.build({ root: data })}\n`;
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const keys = Array.from(new Set(data.flatMap((r) => Object.keys(r as object))));
    return Papa.unparse({ fields: keys, data: data.map((r) => keys.map((k) => String((r as Record<string, unknown>)[k] ?? ''))) }) + '\n';
  }
  return Papa.unparse(data as never) + '\n';
}

export function utf8Bytes(text: string): Uint8Array {
  return utf8(text);
}
