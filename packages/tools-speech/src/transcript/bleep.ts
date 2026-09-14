import type { Transcript } from '../captions/types.js';
import { tokensFromTranscript } from './edits.js';
import { normalizeToken } from './fillers.js';

export const PROFANITY_DE = [
  'scheiße',
  'scheisse',
  'verdammt',
  'arschloch',
  'arsch',
  'idiot',
  'fick',
  'wichser',
  'mist',
];

export const PROFANITY_EN = ['fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard', 'crap', 'hell'];

export const KIDS_SKIP_DE = [...PROFANITY_DE, 'nackt', 'gewalt', 'töten', 'sex'];
export const KIDS_SKIP_EN = [...PROFANITY_EN, 'kill', 'naked', 'sex', 'drugs'];

export interface BleepHit {
  start: number;
  end: number;
  word: string;
}

export interface BleepList {
  kind: 'bleep' | 'skip';
  hits: BleepHit[];
}

export function buildBleepList(
  t: Transcript,
  extra: string[] = [],
  languages: Array<'de' | 'en'> = ['de', 'en'],
  kind: 'bleep' | 'skip' = 'bleep',
): BleepList {
  const list = new Set(
    [
      ...(languages.includes('de') ? (kind === 'skip' ? KIDS_SKIP_DE : PROFANITY_DE) : []),
      ...(languages.includes('en') ? (kind === 'skip' ? KIDS_SKIP_EN : PROFANITY_EN) : []),
      ...extra,
    ].map((w) => w.toLowerCase()),
  );
  const hits: BleepHit[] = [];
  for (const tok of tokensFromTranscript(t)) {
    const n = normalizeToken(tok.text);
    if (list.has(n)) hits.push({ start: tok.start, end: tok.end, word: tok.text });
  }
  return { kind, hits };
}
