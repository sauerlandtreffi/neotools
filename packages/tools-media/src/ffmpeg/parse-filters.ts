export function parseCropdetect(log: string): string | undefined {
  const matches = [...log.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
  return matches.at(-1)?.[1];
}

export function parseLoudnorm(log: string): Record<string, number> | undefined {
  const start = log.lastIndexOf('{');
  const end = log.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const raw = JSON.parse(log.slice(start, end + 1)) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return undefined;
  }
}

export interface DetectReport {
  scenes: number[];
  black: Array<{ start: number; end?: number }>;
  freeze: Array<{ start: number; end?: number }>;
  clipping: boolean;
  epilepsy: { flashesPerSecond: number; risk: 'low' | 'medium' | 'high' };
}

export function parseDetectLog(log: string, duration: number): DetectReport {
  const scenes = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const black: Array<{ start: number; end?: number }> = [];
  for (const m of log.matchAll(/black_start:([\d.]+)(?:\s+black_end:([\d.]+))?/g)) {
    black.push({ start: Number(m[1]), end: m[2] ? Number(m[2]) : undefined });
  }
  const freeze: Array<{ start: number; end?: number }> = [];
  for (const m of log.matchAll(/freeze_start:\s*([\d.]+)/g)) freeze.push({ start: Number(m[1]) });
  for (const m of log.matchAll(/freeze_end:\s*([\d.]+)/g)) {
    const last = freeze[freeze.length - 1];
    if (last && last.end === undefined) last.end = Number(m[1]);
  }
  const peak = /Peak_level:\s*([-\d.]+)/.exec(log);
  const clipping = peak ? Number(peak[1]) >= -0.1 : /clipping|clip/i.test(log);
  const window = Math.max(duration, 0.5);
  const fpsFlash = scenes.length / window;
  const risk: DetectReport['epilepsy']['risk'] = fpsFlash >= 3 ? 'high' : fpsFlash >= 1.5 ? 'medium' : 'low';
  return { scenes, black, freeze, clipping, epilepsy: { flashesPerSecond: Number(fpsFlash.toFixed(2)), risk } };
}

export function parseCueSheet(text: string): Array<{ title: string; start: number }> {
  const tracks: Array<{ title: string; start: number }> = [];
  let title = '';
  for (const line of text.split(/\r?\n/)) {
    const t = /TITLE\s+"([^"]+)"/.exec(line);
    if (t && !/FILE /i.test(line)) title = t[1] ?? '';
    const idx = /INDEX\s+01\s+(\d+):(\d+):(\d+)/.exec(line);
    if (idx) {
      const min = Number(idx[1]);
      const sec = Number(idx[2]);
      const frames = Number(idx[3]);
      tracks.push({ title: title || `track-${tracks.length + 1}`, start: min * 60 + sec + frames / 75 });
    }
  }
  return tracks;
}

export function parseSrtWindows(text: string): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];
  const re = /(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const toSec = (h: string, mi: string, s: string, ms: string) =>
      Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
    windows.push({
      start: toSec(m[1]!, m[2]!, m[3]!, m[4]!),
      end: toSec(m[5]!, m[6]!, m[7]!, m[8]!),
    });
  }
  return windows;
}

export function parseChapterText(text: string): Array<{ start: number; title: string }> {
  const rows: Array<{ start: number; title: string }> = [];
  try {
    const json = JSON.parse(text) as unknown;
    if (Array.isArray(json)) {
      for (const row of json) {
        const o = row as Record<string, unknown>;
        rows.push({ start: Number(o.start ?? o.time ?? 0), title: String(o.title ?? o.name ?? 'Kapitel') });
      }
      return rows;
    }
  } catch {
    // text
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+(?:\.\d+)?|\d+:\d+(?::\d+(?:\.\d+)?)?)\s+(.+)$/.exec(line);
    if (!m) continue;
    const clock = m[1]!;
    let start = 0;
    if (clock.includes(':')) {
      const p = clock.split(':').map(Number);
      if (p.length === 3) start = (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0);
      else start = (p[0] ?? 0) * 60 + (p[1] ?? 0);
    } else start = Number(clock);
    rows.push({ start, title: m[2]!.trim() });
  }
  return rows;
}

export function ffmetadata(chapters: Array<{ start: number; title: string }>, duration: number): string {
  const lines = [';FFMETADATA1'];
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i]!;
    const end = chapters[i + 1]?.start ?? duration;
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${c.title}`);
  }
  return `${lines.join('\n')}\n`;
}
