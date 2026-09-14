import { neoFileFromBytes, type NeoFile, type ToolContext } from '@neotools/engine';
import { extOf, outName } from '../names.js';
import { runFfmpeg, requireOutput } from './run.js';
import type { ExtractAudioOptions } from './types.js';

/** Öffentliche API für Pack `speech` (Whisper): 16 kHz Mono WAV oder PCM-f32. */
export async function extractAudio(
  file: NeoFile,
  opts: ExtractAudioOptions = {},
  ctx?: ToolContext,
): Promise<NeoFile> {
  const sampleRate = opts.sampleRate ?? 16000;
  const mono = opts.mono ?? true;
  const format = opts.format ?? 'wav';
  const input = `in${extOf(file.name, '.bin')}`;
  const output = format === 'pcm_f32' ? 'speech.f32' : 'speech.wav';
  const args = ['-i', input, '-vn'];
  if (mono) args.push('-ac', '1');
  args.push('-ar', String(sampleRate));
  if (format === 'pcm_f32') args.push('-f', 'f32le', output);
  else args.push('-c:a', 'pcm_s16le', '-f', 'wav', output);
  const result = await runFfmpeg(ctx, {
    args,
    inputs: [{ name: input, data: await file.bytes() }],
    outputs: [output],
  });
  const bytes = requireOutput(result, output);
  const name = format === 'pcm_f32' ? outName(file.name, 'f32') : outName(file.name, 'wav');
  return neoFileFromBytes(name, bytes, format === 'pcm_f32' ? 'application/octet-stream' : 'audio/wav');
}
