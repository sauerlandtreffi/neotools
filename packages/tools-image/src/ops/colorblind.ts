import { clampByte } from '../codec/pixels.js';

export type ColorblindMode = 'protan' | 'deutan' | 'tritan';

/** Brettel-ish 3×3 matrices (linear-ish sRGB approximation). */
const SIM: Record<ColorblindMode, number[][]> = {
  protan: [
    [0.152, 1.053, -0.205],
    [0.115, 0.786, 0.099],
    [-0.004, -0.048, 1.052],
  ],
  deutan: [
    [0.367, 0.861, -0.228],
    [0.28, 0.673, 0.047],
    [-0.012, 0.043, 0.969],
  ],
  tritan: [
    [1.256, -0.077, -0.179],
    [-0.078, 0.931, 0.148],
    [0.005, 0.048, 0.948],
  ],
};

function mul(m: number[][], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0]![0]! * r + m[0]![1]! * g + m[0]![2]! * b,
    m[1]![0]! * r + m[1]![1]! * g + m[1]![2]! * b,
    m[2]![0]! * r + m[2]![1]! * g + m[2]![2]! * b,
  ];
}

export function simulateColorblind(data: Uint8ClampedArray, mode: ColorblindMode): Uint8ClampedArray {
  const m = SIM[mode];
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const [r, g, b] = mul(m, out[i]!, out[i + 1]!, out[i + 2]!);
    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
  }
  return out;
}

/** Daltonize: add residual error back onto remaining channels. */
export function daltonize(data: Uint8ClampedArray, mode: ColorblindMode): Uint8ClampedArray {
  const sim = simulateColorblind(data, mode);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const er = (data[i]! - sim[i]!) * 0.7;
    const eg = (data[i + 1]! - sim[i + 1]!) * 0.7;
    const eb = (data[i + 2]! - sim[i + 2]!) * 0.7;
    if (mode === 'protan') {
      out[i + 1] = clampByte(data[i + 1]! + 0.7 * er);
      out[i + 2] = clampByte(data[i + 2]! + 0.7 * er);
    } else if (mode === 'deutan') {
      out[i] = clampByte(data[i]! + 0.7 * eg);
      out[i + 2] = clampByte(data[i + 2]! + 0.7 * eg);
    } else {
      out[i] = clampByte(data[i]! + 0.5 * eb);
      out[i + 1] = clampByte(data[i + 1]! + 0.5 * eb);
    }
    void eb;
    void er;
  }
  return out;
}
