import { neoFileFromBytes, type NeoFile, type ToolContext } from '@neotools/engine';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg, requireOutput } from '../ffmpeg/run.js';
import { primaryAudio, primaryVideo } from '../ffmpeg/parse-probe.js';
import { inputAlias, outName } from '../names.js';

export type KeepWindow = [number, number];

export function parseKeepDocument(raw: unknown): KeepWindow[] {
  if (!raw || typeof raw !== 'object') return [];
  const keep = (raw as { keep?: unknown }).keep;
  if (!Array.isArray(keep)) return [];
  const out: KeepWindow[] = [];
  for (const item of keep) {
    if (Array.isArray(item) && item.length >= 2) {
      const a = Number(item[0]);
      const b = Number(item[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
      continue;
    }
    if (item && typeof item === 'object' && 'start' in item && 'end' in item) {
      const a = Number((item as { start: unknown }).start);
      const b = Number((item as { end: unknown }).end);
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
    }
  }
  return mergeWindows(out);
}

export function parseKeepJson(text: string): KeepWindow[] {
  try {
    return parseKeepDocument(JSON.parse(text) as unknown);
  } catch {
    return [];
  }
}

export function parseKeepOption(text: string): KeepWindow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseKeepJson(trimmed);
  const out: KeepWindow[] = [];
  for (const part of trimmed.split(/[,;\s]+/)) {
    const [a, b] = part.split('-').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && (b as number) > (a as number)) out.push([a as number, b as number]);
  }
  return mergeWindows(out);
}

function mergeWindows(windows: KeepWindow[]): KeepWindow[] {
  const sorted = [...windows].sort((x, y) => x[0] - y[0]);
  const out: KeepWindow[] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1] + 0.01) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

export function expectedKeepDuration(keep: KeepWindow[]): number {
  return keep.reduce((n, [a, b]) => n + Math.max(0, b - a), 0);
}

function selectExpr(keep: KeepWindow[]): string {
  return keep.map(([a, b]) => `between(t,${a},${b})`).join('+') || '0';
}

async function tryCopyConcat(
  ctx: ToolContext,
  alias: string,
  data: Uint8Array,
  keep: KeepWindow[],
): Promise<Uint8Array | null> {
  const extra: Record<string, Uint8Array> = {};
  const names: string[] = [];
  for (let i = 0; i < keep.length; i++) {
    const [start, end] = keep[i]!;
    const name = `part${i}.mp4`;
    try {
      const result = await runFfmpeg(ctx, {
        args: [
          '-ss',
          String(start),
          '-to',
          String(end),
          '-i',
          alias,
          '-c',
          'copy',
          '-avoid_negative_ts',
          'make_zero',
          name,
        ],
        inputs: [{ name: alias, data }],
        outputs: [name],
        durationHint: end - start,
      });
      const bytes = result.files[name];
      if (!bytes?.byteLength) return null;
      extra[name] = bytes;
      names.push(name);
    } catch {
      return null;
    }
  }
  if (!names.length) return null;
  extra['concat.txt'] = new TextEncoder().encode(names.map((n) => `file '${n}'`).join('\n') + '\n');
  try {
    const result = await runFfmpeg(ctx, {
      args: ['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'cut-copy.mp4'],
      inputs: [],
      cwdExtra: extra,
      outputs: ['cut-copy.mp4'],
      durationHint: expectedKeepDuration(keep),
    });
    return result.files['cut-copy.mp4'] ?? null;
  } catch {
    return null;
  }
}

async function reencodeCut(
  ctx: ToolContext,
  alias: string,
  data: Uint8Array,
  keep: KeepWindow[],
  hasAudio: boolean,
): Promise<Uint8Array> {
  const expr = selectExpr(keep);
  const filter = hasAudio
    ? `[0:v]select='${expr}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${expr}',asetpts=N/SR/TB[a]`
    : `[0:v]select='${expr}',setpts=N/FRAME_RATE/TB[v]`;
  const args = ['-i', alias, '-filter_complex', filter, '-map', '[v]'];
  if (hasAudio) args.push('-map', '[a]');
  args.push('-c:v', 'mpeg4', '-q:v', '5');
  if (hasAudio) args.push('-c:a', 'aac');
  args.push('cut.mp4');
  const result = await runFfmpeg(ctx, {
    args,
    inputs: [{ name: alias, data }],
    outputs: ['cut.mp4'],
    durationHint: expectedKeepDuration(keep),
  });
  return requireOutput(result, 'cut.mp4');
}

export async function applyVideoCutlist(
  ctx: ToolContext,
  video: NeoFile,
  keep: KeepWindow[],
  preferCopy: boolean,
): Promise<{ bytes: Uint8Array; mode: 'copy' | 'reencode'; warnings: string[] }> {
  if (!keep.length) throw new Error('Cutlist enthält keine keep-Fenster.');
  const data = await video.bytes();
  const alias = inputAlias(0, video.name);
  const info = await probe(neoFileFromBytes(alias, data, video.mime || 'video/mp4'), ctx);
  if (!primaryVideo(info)) throw new Error('Keine Videospur in der Cutlist-Eingabe.');
  const hasAudio = Boolean(primaryAudio(info));
  const expected = expectedKeepDuration(keep);
  const warnings: string[] = [];

  if (preferCopy) {
    const copied = await tryCopyConcat(ctx, alias, data, keep);
    if (copied?.byteLength) {
      const outProbe = await probe(neoFileFromBytes('cut-copy.mp4', copied, 'video/mp4'), ctx);
      if (outProbe.duration >= expected * 0.45 && outProbe.duration > 0.05) {
        if (Math.abs(outProbe.duration - expected) > 0.35) {
          warnings.push('Stream-Copy folgte Keyframes; Dauer weicht von der Cutlist ab.');
        }
        return { bytes: copied, mode: 'copy', warnings };
      }
      warnings.push('Stream-Copy lieferte zu kurze Ausgabe, Re-Encode.');
    } else {
      warnings.push('Stream-Copy nicht möglich (Keyframes/Codec), Re-Encode.');
    }
  }

  const bytes = await reencodeCut(ctx, alias, data, keep, hasAudio);
  return { bytes, mode: 'reencode', warnings };
}

export function cutlistOutputName(videoName: string): string {
  return outName(videoName, 'mp4');
}
