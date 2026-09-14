import type { ToolContext } from '@neotools/engine';

export function parseProgressLine(line: string): { outTimeSec?: number; ratio?: number; done?: boolean } {
  const trimmed = line.trim();
  if (trimmed === 'progress=end') return { done: true };
  const ms = /out_time_ms=(\d+)/.exec(trimmed);
  if (ms?.[1]) return { outTimeSec: Number(ms[1]) / 1_000_000 };
  const us = /out_time_us=(\d+)/.exec(trimmed);
  if (us?.[1]) return { outTimeSec: Number(us[1]) / 1_000_000 };
  const clock = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(trimmed);
  if (clock) {
    return { outTimeSec: Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) };
  }
  const time = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(trimmed);
  if (time) {
    return { outTimeSec: Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) };
  }
  return {};
}

export function ratioFromTime(outTimeSec: number, durationHint?: number): number {
  if (!durationHint || durationHint <= 0) return Math.min(0.95, outTimeSec / 30);
  return Math.max(0, Math.min(0.99, outTimeSec / durationHint));
}

export function createProgressSink(ctx: ToolContext | undefined, durationHint?: number): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = parseProgressLine(line);
      if (parsed.outTimeSec !== undefined) {
        ctx?.progress(ratioFromTime(parsed.outTimeSec, durationHint), `${parsed.outTimeSec.toFixed(1)}s`);
      }
    }
  };
}
