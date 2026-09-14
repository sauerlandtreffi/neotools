import { neoFileFromBytes, type NeoFile, type ToolContext } from '@neotools/engine';
import { runFfmpeg, requireOutput } from './run.js';

export async function lavfiVideo(
  ctx: ToolContext | undefined,
  seconds = 2,
  size = '320x240',
  rate = 25,
): Promise<NeoFile> {
  const name = 'lavfi.mp4';
  const result = await runFfmpeg(ctx, {
    args: [
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
      '-c:v',
      'mpeg4',
      '-q:v',
      '5',
      '-c:a',
      'aac',
      '-shortest',
      name,
    ],
    inputs: [],
    outputs: [name],
    durationHint: seconds,
  });
  return neoFileFromBytes(name, requireOutput(result, name), 'video/mp4');
}

export async function lavfiAudio(ctx: ToolContext | undefined, seconds = 2, freq = 440): Promise<NeoFile> {
  const name = 'lavfi.wav';
  const result = await runFfmpeg(ctx, {
    args: ['-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`, '-c:a', 'pcm_s16le', name],
    inputs: [],
    outputs: [name],
    durationHint: seconds,
  });
  return neoFileFromBytes(name, requireOutput(result, name), 'audio/wav');
}
