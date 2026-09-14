import { stripBom } from './encoding.js';
import { parseAssTime, parseTimestamp } from './time.js';
import type { CaptionDoc, CaptionFormat, Cue } from './types.js';

export function detectFormat(name: string, text: string): CaptionFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.srt')) return 'srt';
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass';
  if (lower.endsWith('.sbv')) return 'sbv';
  if (lower.endsWith('.ttml') || lower.endsWith('.xml')) return 'ttml';
  if (lower.endsWith('.lrc')) return 'lrc';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.tsv')) return 'tsv';
  const t = text.trim();
  if (t.startsWith('WEBVTT')) return 'vtt';
  if (/\[Script Info\]/i.test(t)) return 'ass';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (/<tt[\s>]/.test(t)) return 'ttml';
  if (/^\[\d+:\d+/.test(t)) return 'lrc';
  if (/^\d+\s*\n\d{1,2}:\d{2}:\d{2}/.test(t)) return 'srt';
  if (/^\d+:\d{2}:\d{2}[.,]\d+,\d+:\d{2}:\d{2}/.test(t)) return 'sbv';
  return 'srt';
}

export function parseCaptions(text: string, name = 'in.srt'): CaptionDoc {
  const body = stripBom(text);
  const format = detectFormat(name, body);
  const cues = parseAs(format, body);
  return { format, cues, header: format === 'vtt' ? extractVttHeader(body) : undefined };
}

export function parseAs(format: CaptionFormat, text: string): Cue[] {
  const body = stripBom(text);
  switch (format) {
    case 'vtt':
      return parseVtt(body);
    case 'ass':
      return parseAss(body);
    case 'sbv':
      return parseSbv(body);
    case 'ttml':
      return parseTtml(body);
    case 'lrc':
      return parseLrc(body);
    case 'json':
      return parseJson(body);
    case 'tsv':
      return parseTsv(body);
    case 'txt':
      return parseTxt(body);
    default:
      return parseSrt(body);
  }
}

export function parseSrt(text: string): Cue[] {
  const blocks = stripBom(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    let i = 0;
    if (/^\d+$/.test(lines[0] ?? '')) i = 1;
    const time = lines[i] ?? '';
    const m = time.match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/,
    );
    if (!m) continue;
    const textLines = lines.slice(i + 1).join('\n').trim();
    cues.push({
      start: parseTimestamp(m[1]!),
      end: parseTimestamp(m[2]!),
      text: textLines,
      index: cues.length + 1,
    });
  }
  return cues;
}

export function parseVtt(text: string): Cue[] {
  const body = stripBom(text).replace(/^WEBVTT[^\n]*\n/, '');
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('NOTE') && !b.startsWith('STYLE') && !b.startsWith('REGION'));
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    let i = 0;
    if (lines[0] && !lines[0].includes('-->')) i = 1;
    const time = lines[i] ?? '';
    const m = time.match(
      /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/,
    );
    if (!m) continue;
    cues.push({
      start: parseVttStamp(m[1]!),
      end: parseVttStamp(m[2]!),
      text: lines.slice(i + 1).join('\n').trim(),
      index: cues.length + 1,
    });
  }
  return cues;
}

function parseVttStamp(raw: string): number {
  const parts = raw.trim().replace(',', '.').split(':');
  if (parts.length === 2) return parseTimestamp(`00:${parts[0]}:${parts[1]}`);
  return parseTimestamp(raw);
}

function extractVttHeader(text: string): string {
  const m = stripBom(text).match(/^WEBVTT[^\n]*/);
  return m?.[0] ?? 'WEBVTT';
}

export function parseAss(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const line of stripBom(text).split('\n')) {
    if (!/^Dialogue:/i.test(line)) continue;
    const payload = line.replace(/^Dialogue:\s*/i, '');
    const cols = splitAss(payload);
    if (cols.length < 10) continue;
    const start = parseAssTime(cols[1] ?? '0:00:00.00');
    const end = parseAssTime(cols[2] ?? '0:00:00.00');
    const speaker = cols[4]?.trim() || undefined;
    const body = cols.slice(9).join(',').replace(/\\N/g, '\n').replace(/\{[^}]*\}/g, '');
    cues.push({ start, end, text: body.trim(), speaker, index: cues.length + 1 });
  }
  return cues;
}

function splitAss(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let commas = 0;
  for (const ch of line) {
    if (ch === ',' && commas < 9) {
      out.push(cur);
      cur = '';
      commas += 1;
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseSbv(text: string): Cue[] {
  const blocks = stripBom(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const m = (lines[0] ?? '').match(
      /(\d+:\d{2}:\d{2}[.,]\d+)\s*,\s*(\d+:\d{2}:\d{2}[.,]\d+)/,
    );
    if (!m) continue;
    cues.push({
      start: parseTimestamp(normalizeSbv(m[1]!)),
      end: parseTimestamp(normalizeSbv(m[2]!)),
      text: lines.slice(1).join('\n').trim(),
      index: cues.length + 1,
    });
  }
  return cues;
}

function normalizeSbv(t: string): string {
  const parts = t.replace(',', '.').split(':');
  if (parts.length === 3 && (parts[0]?.length ?? 0) <= 2) return t.replace(',', '.');
  return t;
}

export function parseTtml(text: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1] ?? '';
    const begin = attr(attrs, 'begin');
    const end = attr(attrs, 'end');
    if (!begin || !end) continue;
    const inner = (m[2] ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    cues.push({
      start: parseTtmlTime(begin),
      end: parseTtmlTime(end),
      text: inner,
      index: cues.length + 1,
    });
  }
  return cues;
}

function attr(src: string, name: string): string | undefined {
  const m = src.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m?.[1];
}

function parseTtmlTime(raw: string): number {
  if (/^\d+(\.\d+)?s$/.test(raw)) return Number(raw.slice(0, -1));
  return parseTimestamp(raw.replace(',', '.'));
}

export function parseLrc(text: string): Cue[] {
  const rows: Array<{ start: number; text: string }> = [];
  for (const line of stripBom(text).split('\n')) {
    const m = line.match(/^\[(\d+):(\d{2})(?:[.](\d{1,3}))?\](.*)$/);
    if (!m) continue;
    const start = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0);
    rows.push({ start, text: (m[4] ?? '').trim() });
  }
  const cues: Cue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const next = rows[i + 1]?.start ?? rows[i]!.start + 3;
    cues.push({ start: rows[i]!.start, end: next, text: rows[i]!.text, index: i + 1 });
  }
  return cues;
}

export function parseJson(text: string): Cue[] {
  const data = JSON.parse(text) as {
    cues?: Cue[];
    segments?: Cue[];
    language?: string;
  };
  const list = data.cues ?? data.segments ?? (Array.isArray(data) ? (data as Cue[]) : []);
  return list.map((c, i) => ({
    start: Number(c.start),
    end: Number(c.end),
    text: String(c.text ?? ''),
    words: c.words,
    speaker: c.speaker,
    index: i + 1,
  }));
}

export function parseTsv(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const line of stripBom(text).split('\n')) {
    if (!line.trim() || line.startsWith('start')) continue;
    const [a, b, ...rest] = line.split('\t');
    if (a === undefined || b === undefined) continue;
    cues.push({
      start: Number(a),
      end: Number(b),
      text: rest.join('\t').trim(),
      index: cues.length + 1,
    });
  }
  return cues;
}

export function parseTxt(text: string): Cue[] {
  const t = stripBom(text).trim();
  if (!t) return [];
  return [{ start: 0, end: 1, text: t, index: 1 }];
}
