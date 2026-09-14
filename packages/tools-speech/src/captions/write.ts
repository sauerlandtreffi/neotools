import { formatAssTime, formatSrtTime, formatVttTime } from './time.js';
import { reflowCues } from './reflow.js';
import type { CaptionFormat, Cue, CueLayout, Transcript } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';

export interface WriteOptions {
  layout?: CueLayout;
  bilingualSecond?: Cue[];
}

export function writeCaptions(
  cues: Cue[],
  format: CaptionFormat,
  opts: WriteOptions = {},
): string {
  const laid = opts.layout ? reflowCues(cues, opts.layout) : cues;
  const merged = opts.bilingualSecond ? mergeBilingualLines(laid, opts.bilingualSecond) : laid;
  switch (format) {
    case 'vtt':
      return writeVtt(merged);
    case 'ass':
      return writeAss(merged);
    case 'sbv':
      return writeSbv(merged);
    case 'ttml':
      return writeTtml(merged);
    case 'lrc':
      return writeLrc(merged);
    case 'json':
      return writeJson(merged);
    case 'tsv':
      return writeTsv(merged);
    case 'txt':
      return writeTxt(merged);
    default:
      return writeSrt(merged);
  }
}

export function writeSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => {
      const n = c.index ?? i + 1;
      const speaker = c.speaker ? `${c.speaker}: ` : '';
      return `${n}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${speaker}${c.text}`.trim();
    })
    .join('\n\n')
    .concat(cues.length ? '\n' : '');
}

export function writeVtt(cues: Cue[]): string {
  const body = cues
    .map((c) => {
      const speaker = c.speaker ? `<v ${c.speaker}>` : '';
      return `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${speaker}${c.text}`.trim();
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}${cues.length ? '\n' : ''}`;
}

export function writeAss(cues: Cue[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .map((c) => {
      const text = c.text.replace(/\n/g, '\\N').replace(/,/g, '，');
      const name = c.speaker ?? '';
      return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,${name},0,0,0,,${text}`;
    })
    .join('\n');
  return header + events + (cues.length ? '\n' : '');
}

export function writeSbv(cues: Cue[]): string {
  return cues
    .map((c) => `${formatSrtTime(c.start).replace(',', '.')},${formatSrtTime(c.end).replace(',', '.')}\n${c.text}`)
    .join('\n\n')
    .concat(cues.length ? '\n' : '');
}

export function writeTtml(cues: Cue[]): string {
  const ps = cues
    .map((c) => {
      const xml = escapeXml(c.text).replace(/\n/g, '<br/>');
      return `    <p begin="${formatVttTime(c.start)}" end="${formatVttTime(c.end)}">${xml}</p>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
${ps}
    </div>
  </body>
</tt>
`;
}

export function writeLrc(cues: Cue[]): string {
  return cues
    .map((c) => {
      const m = Math.floor(c.start / 60);
      const s = c.start - m * 60;
      const cs = Math.round((s % 1) * 100)
        .toString()
        .padStart(2, '0');
      return `[${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${cs}]${c.text.replace(/\n/g, ' ')}`;
    })
    .join('\n')
    .concat(cues.length ? '\n' : '');
}

export function writeJson(cues: Cue[], language?: string): string {
  const doc: Transcript = {
    language: language ?? 'und',
    segments: cues.map((c) => ({
      start: c.start,
      end: c.end,
      text: c.text,
      words: c.words,
      speaker: c.speaker,
    })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function writeTsv(cues: Cue[]): string {
  const rows = ['start\tend\ttext\tspeaker'];
  for (const c of cues) rows.push(`${c.start}\t${c.end}\t${c.text.replace(/\t/g, ' ')}\t${c.speaker ?? ''}`);
  return `${rows.join('\n')}\n`;
}

export function writeTxt(cues: Cue[]): string {
  return cues
    .map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text))
    .join('\n')
    .concat(cues.length ? '\n' : '');
}

export function writeTranscriptFormats(
  transcript: Transcript,
  formats: CaptionFormat[],
  layout: CueLayout = DEFAULT_LAYOUT,
): Record<CaptionFormat, string> {
  const cues = transcript.segments.map((s, i) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    words: s.words,
    speaker: s.speaker,
    index: i + 1,
  }));
  const out = {} as Record<CaptionFormat, string>;
  for (const f of formats) {
    out[f] = f === 'json' ? writeJson(cues, transcript.language) : writeCaptions(cues, f, { layout });
  }
  return out;
}

function mergeBilingualLines(a: Cue[], b: Cue[]): Cue[] {
  return a.map((cue, i) => {
    const other = b[i] ?? nearestCue(b, (cue.start + cue.end) / 2);
    const second = other?.text ?? '';
    return { ...cue, text: second ? `${cue.text}\n${second}` : cue.text };
  });
}

function nearestCue(cues: Cue[], t: number): Cue | undefined {
  let best: Cue | undefined;
  let bestD = Infinity;
  for (const c of cues) {
    const mid = (c.start + c.end) / 2;
    const d = Math.abs(mid - t);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const MIME_FOR: Record<CaptionFormat, string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  ass: 'text/plain',
  sbv: 'text/plain',
  ttml: 'application/ttml+xml',
  lrc: 'text/plain',
  json: 'application/json',
  txt: 'text/plain',
  tsv: 'text/tab-separated-values',
};

export const EXT_FOR: Record<CaptionFormat, string> = {
  srt: 'srt',
  vtt: 'vtt',
  ass: 'ass',
  sbv: 'sbv',
  ttml: 'ttml',
  lrc: 'lrc',
  json: 'json',
  txt: 'txt',
  tsv: 'tsv',
};
