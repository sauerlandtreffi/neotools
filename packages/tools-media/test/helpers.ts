import { createToolContext } from '@neotools/engine';
import { ffmpegAvailable, SKIP_NO_FFMPEG } from '../src/ffmpeg/index.js';

export function mediaCtx() {
  return createToolContext({
    platform: {
      id: 'node',
      capabilities: {
        canvas: false,
        opfs: false,
        workers: true,
        qpdf: false,
        ocr: false,
        ffmpegNative: true,
        webcodecs: false,
      },
    },
  });
}

export async function skipIfNoFfmpeg(): Promise<boolean> {
  const ok = await ffmpegAvailable(mediaCtx());
  if (!ok) {
    console.warn(SKIP_NO_FFMPEG);
    return true;
  }
  return false;
}
