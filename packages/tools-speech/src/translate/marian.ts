import type { ToolContext } from '@neotools/engine';
import { openPipeline } from '../whisper/transformers.js';

export type MarianPair =
  | 'de-en'
  | 'en-de'
  | 'en-fr'
  | 'fr-en'
  | 'en-es'
  | 'es-en'
  | 'en-it'
  | 'it-en';

export const MARIAN_MODELS: Record<MarianPair, string> = {
  'de-en': 'opus-mt-de-en',
  'en-de': 'opus-mt-en-de',
  'en-fr': 'opus-mt-en-fr',
  'fr-en': 'opus-mt-fr-en',
  'en-es': 'opus-mt-en-es',
  'es-en': 'opus-mt-es-en',
  'en-it': 'opus-mt-en-it',
  'it-en': 'opus-mt-it-en',
};

export function applyTerminology(text: string, map: Map<string, string>): string {
  let out = text;
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = map.get(k);
    if (!v) continue;
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, v);
  }
  return out;
}

export function parseTerminologyCsv(csv: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of csv.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [a, b] = t.split(/[,;\t]/);
    if (a && b) map.set(a.trim(), b.trim());
  }
  return map;
}

export async function translateTexts(
  texts: string[],
  pair: MarianPair,
  ctx: ToolContext,
  confirmed: boolean,
  terminology?: Map<string, string>,
): Promise<string[]> {
  const model = MARIAN_MODELS[pair];
  const { pipe } = await openPipeline(model, 'translation', ctx.platform, ctx, confirmed);
  const out: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    ctx.signal.throwIfAborted();
    ctx.progress(0.2 + (i / Math.max(1, texts.length)) * 0.7, `Übersetze ${i + 1}/${texts.length}`);
    const src = terminology ? applyTerminology(texts[i] ?? '', terminology) : (texts[i] ?? '');
    if (!src.trim()) {
      out.push('');
      continue;
    }
    const raw = await pipe(src);
    const list = Array.isArray(raw) ? raw : [raw];
    const first = list[0] as { translation_text?: string } | undefined;
    const translated = String(first?.translation_text ?? src).trim();
    out.push(terminology ? applyTerminology(translated, terminology) : translated);
  }
  return out;
}
