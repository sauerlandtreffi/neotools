import type { ToolContext } from '@neotools/engine';
import { webcodecsH264Supported } from './capabilities.js';

export async function canEncodeAvc(): Promise<boolean> {
  if (!webcodecsH264Supported()) return false;
  try {
    const support = await globalThis.VideoEncoder.isConfigSupported({
      codec: 'avc1.42001E',
      width: 320,
      height: 240,
      bitrate: 500_000,
      avc: { format: 'avc' },
    });
    return Boolean(support.supported);
  } catch {
    return false;
  }
}

/** Fast-Path: RGBA-Frames → H.264 (avc1) + mp4-muxer. Decode bleibt FFmpeg/WebCodecs. */
export async function encodeAvcMp4(
  frames: Array<{ data: Uint8Array; width: number; height: number }>,
  opts: { fps?: number; bitrate?: number },
  ctx?: ToolContext,
): Promise<Uint8Array> {
  if (!frames[0]) throw new Error('Keine Frames für WebCodecs-H.264.');
  if (!(await canEncodeAvc())) {
    throw new Error('WebCodecs VideoEncoder avc1.* ist hier nicht verfügbar.');
  }
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const fps = opts.fps ?? 25;
  const width = frames[0].width;
  const height = frames[0].height;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let err: unknown;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      err = e;
    },
  });
  encoder.configure({
    codec: 'avc1.42001E',
    width,
    height,
    bitrate: opts.bitrate ?? 1_000_000,
    framerate: fps,
    avc: { format: 'avc' },
    latencyMode: 'quality',
  });
  const n = frames.length;
  for (let i = 0; i < n; i++) {
    ctx?.progress(0.2 + (i / n) * 0.7, `WebCodecs ${i + 1}/${n}`);
    const frame = frames[i]!;
    const copy = new Uint8Array(frame.data);
    const vf = new VideoFrame(copy, {
      format: 'RGBA',
      codedWidth: frame.width,
      codedHeight: frame.height,
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
  }
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  if (err) throw err;
  return new Uint8Array(target.buffer);
}

export async function tryMp4boxProbe(data: Uint8Array): Promise<{ width?: number; height?: number; codec?: string; duration?: number } | null> {
  try {
    const MP4Box = await import('mp4box');
    return await new Promise((resolve) => {
      const file = MP4Box.createFile();
      file.onError = () => resolve(null);
      file.onReady = (info) => {
        const v = info.tracks.find((t) => t.type === 'video');
        resolve({
          width: v?.track_width,
          height: v?.track_height,
          codec: v?.codec,
          duration: info.timescale ? info.duration / info.timescale : undefined,
        });
      };
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const mp4 = buf as import('mp4box').MP4ArrayBuffer;
      mp4.fileStart = 0;
      file.appendBuffer(mp4);
      file.flush();
    });
  } catch {
    return null;
  }
}
