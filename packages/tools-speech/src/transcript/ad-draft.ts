import type { Cue } from '../captions/types.js';
import type { Transcript } from '../captions/types.js';

export interface SceneHit {
  index: number;
  start: number;
  end: number;
  label?: string;
}

export interface SceneReport {
  scenes?: SceneHit[];
  cuts?: Array<{ start: number; end?: number; index?: number }>;
}

export function parseSceneReport(json: unknown): SceneHit[] {
  const rec = json as SceneReport;
  if (Array.isArray(rec.scenes)) {
    return rec.scenes.map((s, i) => ({
      index: s.index ?? i + 1,
      start: Number(s.start),
      end: Number(s.end ?? s.start),
      label: s.label,
    }));
  }
  if (Array.isArray(rec.cuts)) {
    return rec.cuts.map((c, i) => ({
      index: c.index ?? i + 1,
      start: Number(c.start),
      end: Number(c.end ?? c.start),
    }));
  }
  if (Array.isArray(json)) {
    return (json as SceneHit[]).map((s, i) => ({
      index: s.index ?? i + 1,
      start: Number(s.start),
      end: Number(s.end ?? s.start),
      label: s.label,
    }));
  }
  return [];
}

export function transcriptGaps(t: Transcript, minGap = 1.5): Array<{ start: number; end: number }> {
  const segs = [...t.segments].sort((a, b) => a.start - b.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of segs) {
    if (s.start - cursor >= minGap) gaps.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  return gaps;
}

export function draftAudioDescription(
  scenes: SceneHit[],
  transcript: Transcript,
  minGap = 1.2,
): Cue[] {
  const gaps = transcriptGaps(transcript, minGap);
  const cues: Cue[] = [];
  for (const scene of scenes) {
    const gap = gaps.find((g) => overlap(g.start, g.end, scene.start, scene.end) > 0.2);
    const start = gap ? Math.max(gap.start, scene.start) : scene.start;
    const end = gap ? Math.min(gap.end, scene.end || scene.start + 2) : scene.start + 2;
    const label = scene.label ? ` ${scene.label}` : '';
    cues.push({
      start,
      end: Math.max(start + 0.8, end),
      text: `[Beschreibung Szene ${scene.index}${label}]`,
      index: cues.length + 1,
    });
  }
  if (!cues.length) {
    for (const [i, g] of gaps.entries()) {
      cues.push({
        start: g.start,
        end: g.end,
        text: `[Beschreibung Lücke ${i + 1}]`,
        index: i + 1,
      });
    }
  }
  return cues;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
