import { neoFileFromBytes, type NeoFile, type ToolContext } from '@neotools/engine';
import {
  ffmpegAvailable,
  inputAlias,
  loadSubtitleFont,
  mimeForExt,
  extOf,
  outName,
  probe,
  runFfmpeg,
  requireOutput,
  SKIP_NO_FFMPEG,
} from '@neotools/tools-media';

export { SKIP_NO_FFMPEG, probe, runFfmpeg, requireOutput, ffmpegAvailable, inputAlias, mimeForExt, extOf, outName };

/** Stable input alias for FFmpeg (`in0.ext`). */
export function aliasOf(file: NeoFile, index = 0): string {
  return inputAlias(index, file.name);
}

export async function requireFfmpeg(ctx: ToolContext): Promise<void> {
  if (!(await ffmpegAvailable(ctx))) throw new Error(SKIP_NO_FFMPEG);
}

export async function encodeVideo(
  ctx: ToolContext,
  args: string[],
  inputs: Array<{ name: string; data: Uint8Array }>,
  output: string,
  extra?: Record<string, Uint8Array>,
  durationHint?: number,
): Promise<Uint8Array> {
  await requireFfmpeg(ctx);
  const result = await runFfmpeg(ctx, {
    args,
    inputs,
    outputs: [output],
    cwdExtra: extra,
    durationHint,
  });
  return requireOutput(result, output);
}

export function mp4Tail(): string[] {
  return ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
}

export function scaleCropVf(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

export async function fontExtra(): Promise<Record<string, Uint8Array>> {
  const font = await loadSubtitleFont();
  if (!font) return {};
  return { [font.name]: font.data };
}

export function fontFileName(): string {
  return 'SourceSans3-Regular.otf';
}

export function fileFromOutput(name: string, bytes: Uint8Array): NeoFile {
  return neoFileFromBytes(name, bytes, mimeForExt(extOf(name, '.bin')));
}
