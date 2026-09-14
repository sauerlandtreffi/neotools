export { parseJpeg, injectJpegSegment } from '@neotools/parsers';
export type { JpegSegment, JpegAutopsy } from '@neotools/parsers';

import type { JpegAutopsy } from '@neotools/parsers';
import { hashBytes } from '../util/hashes.js';

export function jpegThumbnailInfo(
  bytes: Uint8Array,
  jpeg: JpegAutopsy,
): { present: boolean; size?: number; hash?: string; differs?: boolean } {
  const thumb = jpeg.exif?.thumbnail;
  if (!thumb || thumb.length <= 0) return { present: false };
  const slice = bytes.subarray(thumb.offset, Math.min(bytes.length, thumb.offset + thumb.length));
  const hash = hashBytes('sha256', slice);
  const main = hashBytes('sha256', bytes.subarray(0, jpeg.eoiOffset >= 0 ? jpeg.eoiOffset + 2 : bytes.length));
  return { present: true, size: slice.length, hash, differs: hash !== main };
}
