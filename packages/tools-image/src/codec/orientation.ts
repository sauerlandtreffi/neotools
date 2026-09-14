/** Apply EXIF orientation (1–8) to RGBA pixels. */

export function applyOrientation(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  orientation: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const o = orientation | 0;
  if (o <= 1 || o > 8) return { data, width, height };
  const swap = o >= 5;
  const dw = swap ? height : width;
  const dh = swap ? width : height;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const src = (x: number, y: number): number => (y * width + x) * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x;
      let dy = y;
      switch (o) {
        case 2:
          dx = width - 1 - x;
          dy = y;
          break;
        case 3:
          dx = width - 1 - x;
          dy = height - 1 - y;
          break;
        case 4:
          dx = x;
          dy = height - 1 - y;
          break;
        case 5:
          dx = y;
          dy = x;
          break;
        case 6:
          dx = height - 1 - y;
          dy = x;
          break;
        case 7:
          dx = height - 1 - y;
          dy = width - 1 - x;
          break;
        case 8:
          dx = y;
          dy = width - 1 - x;
          break;
        default:
          break;
      }
      const si = src(x, y);
      const di = (dy * dw + dx) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return { data: out, width: dw, height: dh };
}
