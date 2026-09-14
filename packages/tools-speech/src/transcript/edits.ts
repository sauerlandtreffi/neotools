import type { Transcript } from '../captions/types.js';
import {
  DEFAULT_FILLERS,
  detectFillers,
  detectPauses,
  detectRepeats,
  type FillerHit,
  type FillerOptions,
  type TimedToken,
} from './fillers.js';

export interface Cutlist {
  keep: Array<[number, number]>;
  remove: FillerHit[];
}

export function tokensFromTranscript(t: Transcript): TimedToken[] {
  const out: TimedToken[] = [];
  for (const seg of t.segments) {
    if (seg.words?.length) {
      for (const w of seg.words) out.push({ start: w.start, end: w.end, text: w.text });
    } else {
      const parts = seg.text.split(/\s+/).filter(Boolean);
      const dur = Math.max(0.01, seg.end - seg.start);
      const step = dur / parts.length;
      parts.forEach((p, i) => {
        out.push({ start: seg.start + i * step, end: seg.start + (i + 1) * step, text: p });
      });
    }
  }
  return out;
}

export function buildCutlist(t: Transcript, opts: Partial<FillerOptions> = {}): Cutlist {
  const o = { ...DEFAULT_FILLERS, ...opts };
  const tokens = tokensFromTranscript(t);
  const remove = [
    ...detectFillers(tokens, o),
    ...detectPauses(tokens, o.pauseSec),
    ...detectRepeats(tokens),
  ].sort((a, b) => a.start - b.start);
  const merged = mergeHits(remove);
  const duration = t.segments.reduce((m, s) => Math.max(m, s.end), 0);
  return { keep: invertCuts(merged, duration), remove: merged };
}

function mergeHits(hits: FillerHit[]): FillerHit[] {
  const out: FillerHit[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && last.kind === h.kind && h.start <= last.end + 0.02) {
      last.end = Math.max(last.end, h.end);
      last.text = [last.text, h.text].filter(Boolean).join(' ');
    } else out.push({ ...h });
  }
  return out;
}

export function invertCuts(remove: Array<{ start: number; end: number }>, duration: number): Array<[number, number]> {
  const keep: Array<[number, number]> = [];
  let cursor = 0;
  for (const r of remove) {
    if (r.start > cursor) keep.push([cursor, r.start]);
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < duration) keep.push([cursor, duration]);
  return keep.filter(([a, b]) => b - a > 0.01);
}

export function writeEdl(cut: Cutlist, title = 'NeoTools Cutlist'): string {
  const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME'];
  let rec = 0;
  cut.keep.forEach((span, i) => {
    const [a, b] = span;
    const srcIn = frames(a);
    const srcOut = frames(b);
    const recOut = frames(rec + (b - a));
    const recIn = frames(rec);
    lines.push(`${pad(i + 1, 3)}  AX       V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    rec += b - a;
  });
  return `${lines.join('\n')}\n`;
}

export function writeMarkerCsv(hits: FillerHit[]): string {
  const rows = ['Name,Start,Duration,Time Format,Type,Description'];
  for (const h of hits) {
    rows.push(
      `"${h.kind}","${h.start.toFixed(3)}","${(h.end - h.start).toFixed(3)}",decimal,Comment,"${(h.text ?? '').replace(/"/g, '""')}"`,
    );
  }
  return `${rows.join('\n')}\n`;
}

export function writeFcpxml(cut: Cutlist, name = 'cutlist'): string {
  const clips = cut.keep
    .map(([a, b], i) => `      <asset-clip name="keep-${i + 1}" start="${a}s" duration="${b - a}s" offset="${a}s"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
  <resources>
    <format id="r1" name="FFVideoFormat1080p25" frameDuration="1/25s"/>
  </resources>
  <library>
    <event name="${escapeXml(name)}">
      <project name="${escapeXml(name)}">
        <sequence format="r1">
          <spine>
${clips}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

function frames(sec: number): string {
  const fps = 25;
  const total = Math.max(0, Math.round(sec * fps));
  const h = Math.floor(total / (3600 * fps));
  const m = Math.floor((total % (3600 * fps)) / (60 * fps));
  const s = Math.floor((total % (60 * fps)) / fps);
  const f = total % fps;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}:${pad(f, 2)}`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
