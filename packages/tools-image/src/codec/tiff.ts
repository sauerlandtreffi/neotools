import UTIF from 'utif';
import type { DecodedImage } from './types.js';
import { emptyMeta } from './types.js';

export function decodeTiff(bytes: Uint8Array): DecodedImage {
  const copy = bytes.slice();
  const ifds = UTIF.decode(copy.buffer);
  if (!ifds.length) throw new Error('TIFF ohne IFDs.');
  const pages: DecodedImage[] = [];
  for (const ifd of ifds) {
    UTIF.decodeImage(copy.buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const width = ifd.width ?? (ifd.t256?.[0] as number | undefined) ?? 0;
    const height = ifd.height ?? (ifd.t257?.[0] as number | undefined) ?? 0;
    if (!width || !height) continue;
    pages.push({
      width,
      height,
      data: new Uint8ClampedArray(rgba),
      meta: emptyMeta('tiff'),
    });
  }
  if (!pages.length) throw new Error('TIFF ohne dekodierbare Seiten.');
  const first = pages[0]!;
  first.meta.pages = pages.length;
  first.extraPages = pages.slice(1);
  return first;
}

export function encodeTiff(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const buf = UTIF.encodeImage(data, width, height);
  return new Uint8Array(buf);
}
