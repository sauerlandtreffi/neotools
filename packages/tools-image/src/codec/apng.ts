import UPNG from 'upng-js';
import type { DecodedFrame, DecodedImage } from './types.js';
import { emptyMeta } from './types.js';
import { asBufferSource } from './wasm.js';

export function decodeApng(bytes: Uint8Array): DecodedImage {
  const img = UPNG.decode(asBufferSource(bytes));
  const frames = UPNG.toRGBA8(img);
  if (!frames.length) throw new Error('APNG/PNG ohne Pixel.');
  const decoded: DecodedFrame[] = frames.map((buf, i) => ({
    data: new Uint8ClampedArray(buf),
    width: img.width,
    height: img.height,
    delayMs: img.frames?.[i]?.delay ?? 100,
  }));
  const first = decoded[0]!;
  const meta = emptyMeta(decoded.length > 1 ? 'apng' : 'png');
  if (decoded.length > 1) meta.frames = decoded;
  return { width: img.width, height: img.height, data: first.data, meta };
}

export function encodeApng(frames: DecodedFrame[]): Uint8Array {
  if (!frames.length) throw new Error('APNG braucht Frames.');
  const w = frames[0]!.width;
  const h = frames[0]!.height;
  const bufs = frames.map((f) => asBufferSource(f.data));
  const dels = frames.map((f) => f.delayMs);
  const encoded = UPNG.encode(bufs, w, h, 0, dels);
  return new Uint8Array(encoded);
}
