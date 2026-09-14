/** Parse SRT/VTT timestamps. Accepts comma or dot milliseconds. */
export function parseTimestamp(raw: string): number {
  const s = raw.trim().replace(',', '.');
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.](\d{1,3}))?$/);
  if (!m) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    throw new Error(`Ungültiger Zeitstempel: ${raw}`);
  }
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const frac = m[4] ? Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
  return hours * 3600 + minutes * 60 + seconds + frac;
}

/** ASS/SSA uses h:mm:ss.cs (centiseconds). */
export function parseAssTime(raw: string): number {
  const s = raw.trim();
  const m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})[.](\d{1,2})$/);
  if (!m) return parseTimestamp(s);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? '0').padEnd(2, '0')) / 100;
}

export function formatSrtTime(sec: number): string {
  const { h, m, s, ms } = split(sec);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

export function formatVttTime(sec: number): string {
  const { h, m, s, ms } = split(sec);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

export function formatAssTime(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t - Math.floor(t)) * 100);
  const carry = cs >= 100 ? 1 : 0;
  return `${h}:${pad(m, 2)}:${pad(s + carry, 2)}.${pad(cs % 100, 2)}`;
}

function split(sec: number): { h: number; m: number; s: number; ms: number } {
  const t = Math.max(0, sec);
  const msTotal = Math.round(t * 1000);
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return { h, m, s, ms };
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

export const FPS = {
  '23.976': 24000 / 1001,
  '24': 24,
  '25': 25,
  '29.97': 30000 / 1001,
  '30': 30,
} as const;

export type FpsKey = keyof typeof FPS;

export function convertFramerate(time: number, from: FpsKey, to: FpsKey): number {
  if (from === to) return time;
  return time * (FPS[to] / FPS[from]);
}

export function applyOffset(time: number, offsetSec: number): number {
  return Math.max(0, time + offsetSec);
}

/** Linear map through two anchors (t → t'). */
export function stretchTime(time: number, a: number, aPrime: number, b: number, bPrime: number): number {
  if (b === a) return applyOffset(time, aPrime - a);
  return aPrime + ((time - a) * (bPrime - aPrime)) / (b - a);
}

export function mapCueTimes(
  start: number,
  end: number,
  map: (t: number) => number,
): { start: number; end: number } {
  const s = Math.max(0, map(start));
  const e = Math.max(s + 0.001, map(end));
  return { start: s, end: e };
}
