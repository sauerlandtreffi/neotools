import { parseGIF, decompressFrames } from 'gifuct-js';
import type { DecodedFrame, DecodedImage } from './types.js';
import { emptyMeta } from './types.js';
import { asBufferSource } from './wasm.js';

type GifencApi = {
  GIFEncoder: (opts?: { auto?: boolean }) => {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: number; dispose?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  quantize: (rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string }) => number[][];
  applyPalette: (rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string) => Uint8Array;
};

function asGifenc(value: unknown): GifencApi | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Record<string, unknown>;
  if (
    typeof rec.GIFEncoder === 'function' &&
    typeof rec.quantize === 'function' &&
    typeof rec.applyPalette === 'function'
  ) {
    return rec as unknown as GifencApi;
  }
  return undefined;
}

async function loadGifenc(): Promise<GifencApi> {
  const mod = (await import('gifenc')) as { default?: unknown };
  const fromNamed = asGifenc(mod);
  if (fromNamed) return fromNamed;
  const fromDefault = asGifenc(mod.default);
  if (fromDefault) return fromDefault;
  const { createRequire } = await import('node:module');
  const required = asGifenc(createRequire(import.meta.url)('gifenc'));
  if (required) return required;
  throw new Error('gifenc konnte nicht geladen werden (CJS/ESM).');
}

export function decodeGif(bytes: Uint8Array): DecodedImage {
  const parsed = parseGIF(asBufferSource(bytes));
  const frames = decompressFrames(parsed, true);
  if (!frames.length) throw new Error('GIF ohne Frames.');
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  const canvas = new Uint8ClampedArray(width * height * 4);
  const decoded: DecodedFrame[] = [];
  for (const f of frames) {
    if (f.disposalType === 2) canvas.fill(0);
    const { left, top, width: fw, height: fh } = f.dims;
    const patch = f.patch;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y * fw + x) * 4;
        if ((patch[si + 3] ?? 0) === 0) continue;
        const di = ((top + y) * width + (left + x)) * 4;
        canvas[di] = patch[si]!;
        canvas[di + 1] = patch[si + 1]!;
        canvas[di + 2] = patch[si + 2]!;
        canvas[di + 3] = patch[si + 3]!;
      }
    }
    decoded.push({
      data: new Uint8ClampedArray(canvas),
      width,
      height,
      delayMs: Math.max(20, (f.delay || 10) * 10),
    });
  }
  const first = decoded[0]!;
  const meta = emptyMeta('gif');
  meta.frames = decoded;
  return { width: first.width, height: first.height, data: first.data, meta };
}

export async function encodeGif(frames: DecodedFrame[], repeat = 0): Promise<Uint8Array> {
  if (!frames.length) throw new Error('GIF braucht Frames.');
  const { GIFEncoder, quantize, applyPalette } = await loadGifenc();
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, frame.width, frame.height, {
      palette,
      delay: Math.max(2, Math.round(frame.delayMs / 10)),
      repeat: i === 0 ? repeat : undefined,
    });
  });
  gif.finish();
  return gif.bytes();
}
