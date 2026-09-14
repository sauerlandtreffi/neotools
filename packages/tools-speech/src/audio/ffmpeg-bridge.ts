import type { NeoFile, ToolContext } from '@neotools/engine';
import { parseWav } from './wav.js';
import { normalizeAudio, type AudioSource, type DecodeOptions } from './types.js';

export const FFMPEG_HINT =
  'Video-Dateien in Node brauchen den FFmpeg-Kern (@neotools/tools-media extractAudio). Media-Pack noch nicht verfügbar oder nicht geladen.';

export function isVideoName(name: string, mime: string): boolean {
  const n = name.toLowerCase();
  if (mime.startsWith('video/')) return true;
  return /\.(mp4|m4v|mov|mkv|webm|avi|mpeg|mpg)$/i.test(n);
}

export async function tryExtractAudio(
  file: NeoFile,
  opts: DecodeOptions,
  ctx?: ToolContext,
): Promise<AudioSource | null> {
  try {
    const spec = '@neotools/' + 'tools-media';
    const media = (await import(/* @vite-ignore */ spec)) as {
      extractAudio?: (
        file: NeoFile,
        opts?: { sampleRate?: number; mono?: boolean; format?: string },
        ctx?: ToolContext,
      ) => Promise<{ bytes: () => Promise<Uint8Array> }>;
    };
    if (typeof media.extractAudio !== 'function') return null;
    const result = await media.extractAudio(
      file,
      {
        sampleRate: opts.sampleRate ?? 16000,
        mono: opts.mono !== false,
        format: 'wav',
      },
      ctx,
    );
    const bytes = await result.bytes();
    return normalizeAudio(parseWav(bytes), opts);
  } catch {
    return null;
  }
}
