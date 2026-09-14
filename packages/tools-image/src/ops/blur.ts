export function boxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  passes = 3,
): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  let src = new Uint8ClampedArray(data);
  let dest = new Uint8ClampedArray(data.length);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const x = k < 0 ? 0 : k >= width ? width - 1 : k;
          sum += src[(y * width + x) * 4 + c] ?? 0;
        }
        const n = r * 2 + 1;
        for (let x = 0; x < width; x++) {
          dest[(y * width + x) * 4 + c] = Math.round(sum / n);
          const x0 = x - r < 0 ? 0 : x - r;
          const x1 = x + r + 1 >= width ? width - 1 : x + r + 1;
          sum += (src[(y * width + x1) * 4 + c] ?? 0) - (src[(y * width + x0) * 4 + c] ?? 0);
        }
      }
    }
    const tmp = src;
    src = dest;
    dest = tmp;
    // vertical
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const y = k < 0 ? 0 : k >= height ? height - 1 : k;
          sum += src[(y * width + x) * 4 + c] ?? 0;
        }
        const n = r * 2 + 1;
        for (let y = 0; y < height; y++) {
          dest[(y * width + x) * 4 + c] = Math.round(sum / n);
          const y0 = y - r < 0 ? 0 : y - r;
          const y1 = y + r + 1 >= height ? height - 1 : y + r + 1;
          sum += (src[(y1 * width + x) * 4 + c] ?? 0) - (src[(y0 * width + x) * 4 + c] ?? 0);
        }
      }
    }
    const t2 = src;
    src = dest;
    dest = t2;
  }
  return src;
}

export function pixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  block: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const bs = Math.max(2, block);
  for (let y = y0; y < y1; y += bs) {
    for (let x = x0; x < x1; x += bs) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const ye = Math.min(y1, y + bs);
      const xe = Math.min(x1, x + bs);
      for (let yy = y; yy < ye; yy++) {
        for (let xx = x; xx < xe; xx++) {
          const i = (yy * width + xx) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n += 1;
        }
      }
      if (!n) continue;
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      for (let yy = y; yy < ye; yy++) {
        for (let xx = x; xx < xe; xx++) {
          const i = (yy * width + xx) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }
}
