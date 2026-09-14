import type { Cue, CueLayout } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';

const SENTENCE = /(?<=[.!?…])\s+/;

export function wrapLines(text: string, layout: CueLayout = DEFAULT_LAYOUT): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (!layout.preferSentenceBoundaries) return wrapWords(cleaned, layout.maxLineLength, layout.maxLines).join('\n');
  const sentences = cleaned.split(SENTENCE).filter(Boolean);
  const parts: string[] = [];
  let buf = '';
  for (const sent of sentences) {
    const next = buf ? `${buf} ${sent}` : sent;
    if (next.length <= layout.maxLineLength) buf = next;
    else {
      if (buf) parts.push(buf);
      buf = sent;
    }
  }
  if (buf) parts.push(buf);
  const lines = parts.flatMap((p) => wrapWords(p, layout.maxLineLength, 99));
  return lines.slice(0, layout.maxLines).join('\n');
}

function wrapWords(text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

export function reflowCue(cue: Cue, layout: CueLayout = DEFAULT_LAYOUT): Cue {
  const text = wrapLines(cue.text.replace(/\n+/g, ' '), layout);
  let end = cue.end;
  if (layout.maxCueDuration > 0 && end - cue.start > layout.maxCueDuration) {
    end = cue.start + layout.maxCueDuration;
  }
  return { ...cue, text, end };
}

export function reflowCues(cues: Cue[], layout: CueLayout = DEFAULT_LAYOUT): Cue[] {
  return cues.map((c) => reflowCue(c, layout));
}
