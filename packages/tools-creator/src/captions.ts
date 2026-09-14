export interface TimedWord {
  start: number;
  end: number;
  text: string;
}

export interface TimedCue {
  start: number;
  end: number;
  text: string;
  words?: TimedWord[];
}

function hms(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const whole = Math.floor(rest);
  const ms = Math.round((rest - whole) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(whole)},${pad(ms, 3)}`;
}

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s - h * 3600 - m * 60;
  const cs = Math.round(rest * 100);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(Math.floor(cs / 100))}.${pad(cs % 100)}`;
}

export function parseSrt(text: string): TimedCue[] {
  const cues: TimedCue[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const time = lines.find((l) => l.includes('-->'));
    if (!time) continue;
    const m = /(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/.exec(time);
    if (!m) continue;
    const to = (h: string, mi: string, s: string, ms: string) =>
      Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
    const body = lines
      .filter((l) => !/^\d+$/.test(l.trim()) && !l.includes('-->'))
      .join(' ')
      .trim();
    if (!body) continue;
    cues.push({ start: to(m[1]!, m[2]!, m[3]!, m[4]!), end: to(m[5]!, m[6]!, m[7]!, m[8]!), text: body });
  }
  return cues;
}

export function parseLrc(text: string): TimedCue[] {
  const cues: TimedCue[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/.exec(line);
    if (!m) continue;
    const start = Number(m[1]) * 60 + Number(m[2]) + Number((m[3] ?? '0').padEnd(3, '0')) / 1000;
    cues.push({ start, end: start + 3, text: (m[4] ?? '').trim() });
  }
  for (let i = 0; i < cues.length - 1; i++) cues[i]!.end = cues[i + 1]!.start;
  return cues.filter((c) => c.text);
}

export function parseTranscriptJson(text: string): TimedCue[] {
  const raw = JSON.parse(text) as unknown;
  const segs =
    raw && typeof raw === 'object' && 'segments' in raw
      ? (raw as { segments: unknown }).segments
      : Array.isArray(raw)
        ? raw
        : [];
  if (!Array.isArray(segs)) return [];
  return segs.flatMap((s) => {
    if (!s || typeof s !== 'object') return [];
    const o = s as { start?: number; end?: number; text?: string; words?: unknown };
    const words = Array.isArray(o.words)
      ? o.words.flatMap((w) => {
          if (!w || typeof w !== 'object') return [];
          const ww = w as { start?: number; end?: number; text?: string };
          if (ww.text == null) return [];
          return [{ start: Number(ww.start ?? 0), end: Number(ww.end ?? 0), text: String(ww.text) }];
        })
      : undefined;
    return [
      {
        start: Number(o.start ?? words?.[0]?.start ?? 0),
        end: Number(o.end ?? words?.at(-1)?.end ?? 0),
        text: String(o.text ?? words?.map((w) => w.text).join(' ') ?? ''),
        words,
      },
    ];
  });
}

export function parseCaptionsAuto(text: string, name = ''): TimedCue[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (name.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseTranscriptJson(trimmed);
    } catch {
      /* fall through */
    }
  }
  if (name.endsWith('.lrc') || /^\s*\[\d+:\d+/.test(trimmed)) return parseLrc(trimmed);
  return parseSrt(trimmed);
}

export function toSrt(cues: TimedCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${hms(c.start)} --> ${hms(c.end)}\n${c.text}\n`)
    .join('\n');
}

export function toAssKaraoke(cues: TimedCue[], style = 'Default'): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${style},Source Sans 3,64,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,1,3,0,2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = cues.map((c) => {
    let text = c.text;
    if (c.words?.length) {
      text = c.words
        .map((w) => {
          const durCs = Math.max(1, Math.round((w.end - w.start) * 100));
          return `{\\k${durCs}}${w.text}`;
        })
        .join(' ');
    }
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${style},,0,0,0,,${text}`;
  });
  return header + lines.join('\n') + '\n';
}

export function wordsFromCues(cues: TimedCue[]): TimedWord[] {
  const words: TimedWord[] = [];
  for (const c of cues) {
    if (c.words?.length) {
      words.push(...c.words);
      continue;
    }
    const parts = c.text.split(/\s+/).filter(Boolean);
    const span = Math.max(0.05, (c.end - c.start) / Math.max(parts.length, 1));
    parts.forEach((text, i) => {
      words.push({ start: c.start + i * span, end: c.start + (i + 1) * span, text });
    });
  }
  return words;
}
