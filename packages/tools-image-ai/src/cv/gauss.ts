export function gaussianKernel(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const size = radius * 2 + 1;
  const k = new Float32Array(size);
  let sum = 0;
  const s2 = 2 * sigma * sigma;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const v = Math.exp(-(x * x) / s2);
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) k[i] = k[i]! / sum;
  return k;
}

export function convolveSeparable(src: Float32Array, width: number, height: number, kernel: Float32Array): Float32Array {
  const r = (kernel.length - 1) >> 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.max(0, Math.min(width - 1, x + k));
        acc += src[y * width + xx]! * kernel[k + r]!;
      }
      tmp[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.max(0, Math.min(height - 1, y + k));
        acc += tmp[yy * width + x]! * kernel[k + r]!;
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

export function gaussianBlurGray(src: Float32Array, width: number, height: number, sigma = 1.2): Float32Array {
  return convolveSeparable(src, width, height, gaussianKernel(sigma));
}
