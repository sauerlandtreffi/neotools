import { createToolContext } from '@neotools/engine';
import { ffmpegAvailable, SKIP_NO_FFMPEG } from '../src/ffmpeg/index.js';
import { detectLgplVendor } from '../src/ffmpeg/core-flavor.js';

export function forceWasmFromEnv(): boolean {
  return process.env.NEOTOOLS_FFMPEG_NATIVE === '0' || process.env.NEOTOOLS_FFMPEG_NATIVE === 'false';
}

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
        ffmpegNative: !forceWasmFromEnv(),
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

export async function skipIfNoLgplCore(): Promise<boolean> {
  if (!detectLgplVendor()) {
    console.warn('Kein vendor/ffmpeg-lgpl — LGPL-WASM-Tests übersprungen.');
    return true;
  }
  return skipIfNoFfmpeg();
}
