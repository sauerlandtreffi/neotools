import { throwIfAborted, type ToolContext } from '@neotools/engine';
import { hasNativeFfmpeg } from './capabilities.js';
import { runNativeFfmpeg } from './native.js';
import type { FfmpegRunRequest, FfmpegRunResult } from './types.js';
import { runWasmFfmpeg, terminateWasm } from './wasm.js';

export async function ffmpegAvailable(ctx?: ToolContext): Promise<boolean> {
  if (ctx?.platform.capabilities.ffmpegNative) return true;
  if (await hasNativeFfmpeg()) return true;
  try {
    const { loadWasmFfmpeg } = await import('./wasm.js');
    await loadWasmFfmpeg(ctx, ctx?.platform);
    return true;
  } catch {
    return false;
  }
}

export async function runFfmpeg(ctx: ToolContext | undefined, req: FfmpegRunRequest): Promise<FfmpegRunResult> {
  throwIfAborted(ctx?.signal ?? new AbortController().signal);
  ctx?.progress(0.05, 'FFmpeg');
  const preferNative = ctx?.platform.capabilities.ffmpegNative !== false && (await hasNativeFfmpeg());
  if (preferNative) {
    const result = await runNativeFfmpeg(ctx, req);
    ctx?.progress(1, 'FFmpeg fertig');
    return result;
  }
  try {
    const result = await runWasmFfmpeg(ctx, req);
    ctx?.progress(1, 'FFmpeg fertig');
    return result;
  } catch (err) {
    if (await hasNativeFfmpeg()) {
      ctx?.log('warn', 'WASM-FFmpeg fehlgeschlagen, nutze System-ffmpeg.');
      const result = await runNativeFfmpeg(ctx, req);
      ctx?.progress(1, 'FFmpeg fertig');
      return result;
    }
    throw err;
  }
}

export { terminateWasm };

export function requireOutput(result: FfmpegRunResult, name: string): Uint8Array {
  const bytes = result.files[name];
  if (!bytes || !bytes.byteLength) {
    throw new Error(`FFmpeg lieferte keine Ausgabe ${name}.\n${result.log.slice(-2000)}`);
  }
  return bytes;
}
