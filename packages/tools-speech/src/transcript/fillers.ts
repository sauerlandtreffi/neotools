export const FILLERS_DE = [
  'äh',
  'ähm',
  'hmm',
  'also',
  'halt',
  'irgendwie',
  'quasi',
  'sozusagen',
  'naja',
  'ne',
  'oder so',
];

export const FILLERS_EN = ['um', 'uh', 'uh-huh', 'erm', 'like', 'you know', 'i mean', 'sort of', 'kind of'];

export interface FillerHit {
  start: number;
  end: number;
  text: string;
  kind: 'filler' | 'pause' | 'repeat';
}

export interface FillerOptions {
  extra: string[];
  languages: Array<'de' | 'en'>;
  pauseSec: number;
  clusterSec: number;
}

export const DEFAULT_FILLERS: FillerOptions = {
  extra: [],
  languages: ['de', 'en'],
  pauseSec: 1.6,
  clusterSec: 0.9,
};

function listFor(opts: FillerOptions): string[] {
  const base = [
    ...(opts.languages.includes('de') ? FILLERS_DE : []),
    ...(opts.languages.includes('en') ? FILLERS_EN : []),
    ...opts.extra,
  ];
  return [...new Set(base.map((s) => s.toLowerCase().trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
}

export function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

export function isFillerToken(token: string, fillers: string[]): boolean {
  const n = normalizeToken(token);
  return fillers.includes(n);
}

export interface TimedToken {
  start: number;
  end: number;
  text: string;
}

export function detectFillers(tokens: TimedToken[], opts: Partial<FillerOptions> = {}): FillerHit[] {
  const o = { ...DEFAULT_FILLERS, ...opts };
  const fillers = listFor(o);
  const hits: FillerHit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (!isFillerToken(tok.text, fillers)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    let end = tok.end;
    const parts = [tok.text];
    while (j < tokens.length) {
      const next = tokens[j]!;
      if (next.start - end > o.clusterSec) break;
      if (!isFillerToken(next.text, fillers)) break;
      parts.push(next.text);
      end = next.end;
      j += 1;
    }
    hits.push({ start: tok.start, end, text: parts.join(' '), kind: 'filler' });
    i = j;
  }
  return hits;
}

export function detectPauses(tokens: TimedToken[], pauseSec: number): FillerHit[] {
  const hits: FillerHit[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const gap = tokens[i]!.start - tokens[i - 1]!.end;
    if (gap >= pauseSec) {
      hits.push({
        start: tokens[i - 1]!.end,
        end: tokens[i]!.start,
        text: '',
        kind: 'pause',
      });
    }
  }
  return hits;
}

export function detectRepeats(tokens: TimedToken[]): FillerHit[] {
  const hits: FillerHit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const n = normalizeToken(tokens[i]!.text);
    if (!n) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < tokens.length && normalizeToken(tokens[j]!.text) === n) j += 1;
    if (j - i >= 3) {
      hits.push({
        start: tokens[i]!.start,
        end: tokens[j - 1]!.end,
        text: tokens.slice(i, j).map((t) => t.text).join(' '),
        kind: 'repeat',
      });
    }
    i = j > i + 1 ? j : i + 1;
  }
  return hits;
}
