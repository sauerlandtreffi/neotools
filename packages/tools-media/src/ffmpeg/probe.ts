import { extOf } from '../names.js';
import { hasNativeFfmpeg } from './capabilities.js';
import { runNativeFfmpeg, runNativeFfprobe } from './native.js';
import { parseFfprobeJson, parseFfmpegLog } from './parse-probe.js';
import { runFfmpeg } from './run.js';
import type { ProbeResult } from './types.js';
import type { NeoFile, ToolContext } from '@neotools/engine';

export async function probe(file: NeoFile, ctx?: ToolContext): Promise<ProbeResult> {
  const data = await file.bytes();
  const name = `probe${extOf(file.name, '.bin')}`;
  if (ctx?.platform.capabilities.ffmpegNative !== false && (await hasNativeFfmpeg())) {
    const json = await runNativeFfprobe(data, name);
    if (json) {
      try {
        return parseFfprobeJson(json);
      } catch {
        // fall through
      }
    }
    try {
      const result = await runNativeFfmpeg(ctx, {
        args: ['-i', name],
        inputs: [{ name, data }],
        outputs: [],
      });
      return parseFfmpegLog(result.log);
    } catch (err) {
      const log = err instanceof Error ? err.message : String(err);
      if (/Input #|Duration:|Stream #/.test(log)) return parseFfmpegLog(log);
    }
  }
  try {
    const result = await runFfmpeg(ctx, {
      args: ['-i', name],
      inputs: [{ name, data }],
      outputs: [],
    });
    return parseFfmpegLog(result.log);
  } catch (err) {
    const log = err instanceof Error ? err.message : String(err);
    if (/Input #|Duration:|Stream #/.test(log)) return parseFfmpegLog(log);
    throw new Error(`probe() fehlgeschlagen: ${log.slice(-1500)}`);
  }
}

export async function probeBytes(data: Uint8Array, name: string, ctx?: ToolContext): Promise<ProbeResult> {
  const { neoFileFromBytes } = await import('@neotools/engine');
  return probe(neoFileFromBytes(name, data), ctx);
}
