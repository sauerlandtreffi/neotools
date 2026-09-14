import { clampByte } from '../codec/pixels.js';
import { boxBlur } from './blur.js';

export function unsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.45,
  radius = 1,
): Uint8ClampedArray {
  const blur = boxBlur(data, width, height, radius, 2);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const src = data[i + c] ?? 0;
      const b = blur[i + c] ?? 0;
      out[i + c] = clampByte(Math.round(src + amount * (src - b)));
    }
  }
  return out;
}
