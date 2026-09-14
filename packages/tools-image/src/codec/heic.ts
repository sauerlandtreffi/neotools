import type { DecodedImage } from './types.js';
import { emptyMeta } from './types.js';
import { asBufferSource } from './wasm.js';

/**
 * HEIC/HEIF decode via dynamically imported `heic-decode` (wraps libheif-js, LGPL-3.0).
 * The module is never statically bundled; license is listed on the licenses page.
 */
export async function decodeHeic(bytes: Uint8Array): Promise<DecodedImage> {
  let decode: typeof import('heic-decode').default;
  try {
    decode = (await import('heic-decode')).default;
  } catch {
    throw new Error('HEIC/HEIF: heic-decode/libheif-js nicht geladen (LGPL, dynamisch).');
  }
  const result = await decode({ buffer: asBufferSource(bytes) });
  const first = Array.isArray(result) ? result[0] : result;
  if (!first) throw new Error('HEIC ohne Bilddaten.');
  const data = new Uint8ClampedArray(first.data);
  const extra = Array.isArray(result)
    ? result.slice(1).map((p) => ({
        width: p.width,
        height: p.height,
        data: new Uint8ClampedArray(p.data),
        meta: emptyMeta('heic'),
      }))
    : undefined;
  const meta = emptyMeta('heic');
  meta.pages = 1 + (extra?.length ?? 0);
  return { width: first.width, height: first.height, data, meta, extraPages: extra };
}

export function encodeHeic(_data: Uint8ClampedArray, _w: number, _h: number): never {
  throw new Error('HEIC-Encode ist nicht verfügbar (nur Decode via libheif-js LGPL).');
}
