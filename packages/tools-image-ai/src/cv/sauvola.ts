export function integral(src: Float32Array, width: number, height: number): { sum: Float64Array; sq: Float64Array } {
  const sum = new Float64Array((width + 1) * (height + 1));
  const sq = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y++) {
    let row = 0;
    let rowSq = 0;
    for (let x = 1; x <= width; x++) {
      const v = src[(y - 1) * width + (x - 1)]!;
      row += v;
      rowSq += v * v;
      sum[y * stride + x] = sum[(y - 1) * stride + x]! + row;
      sq[y * stride + x] = sq[(y - 1) * stride + x]! + rowSq;
    }
  }
  return { sum, sq };
}

function rectSum(int: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
  const stride = width + 1;
  return (
    int[y1 * stride + x1]! -
    int[y0 * stride + x1]! -
    int[y1 * stride + x0]! +
    int[y0 * stride + x0]!
  );
}

/** Sauvola adaptive threshold. Returns 0/255. */
export function sauvola(
  gray: Float32Array,
  width: number,height: number,
  window = 21,
  k = 0.34,
  r = 128,
): Uint8Array {
  const { sum, sq } = integral(gray, width, height);
  const out = new Uint8Array(gray.length);
  const half = Math.max(1, Math.floor(window / 2));
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const n = (x1 - x0) * (y1 - y0);
      const s = rectSum(sum, width, x0, y0, x1, y1);
      const q = rectSum(sq, width, x0, y0, x1, y1);
      const mean = s / n;
      const std = Math.sqrt(Math.max(0, q / n - mean * mean));
      const t = mean * (1 + k * (std / r - 1));
      out[y * width + x] = gray[y * width + x]! > t ? 255 : 0;
    }
  }
  return out;
}

export function adaptiveMean(
  gray: Float32Array,
  width: number,
  height: number,
  window = 31,
  c = 10,
): Uint8Array {
  const { sum } = integral(gray, width, height);
  const out = new Uint8Array(gray.length);
  const half = Math.max(1, Math.floor(window / 2));
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height, y + half + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width, x + half + 1);
      const n = (x1 - x0) * (y1 - y0);
      const mean = rectSum(sum, width, x0, y0, x1, y1) / n;
      out[y * width + x] = gray[y * width + x]! > mean - c ? 255 : 0;
    }
  }
  return out;
}
