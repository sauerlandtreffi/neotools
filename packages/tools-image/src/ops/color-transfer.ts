/** Reinhard et al. color transfer in lαβ (log-LMS) space. */

type Vec3 = [number, number, number];

export function reinhardTransfer(
  source: Uint8ClampedArray,
  sw: number,
  sh: number,
  target: Uint8ClampedArray,
  tw: number,
  th: number,
): Uint8ClampedArray {
  void sw;
  void sh;
  void tw;
  void th;
  const srcStats = statsLab(source);
  const dstStats = statsLab(target);
  const out = new Uint8ClampedArray(target);
  for (let i = 0; i < out.length; i += 4) {
    const lab = rgbToLab(out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0);
    const L = ((lab[0] - dstStats.mean[0]) * (srcStats.std[0] / (dstStats.std[0] || 1e-6))) + srcStats.mean[0];
    const A = ((lab[1] - dstStats.mean[1]) * (srcStats.std[1] / (dstStats.std[1] || 1e-6))) + srcStats.mean[1];
    const B = ((lab[2] - dstStats.mean[2]) * (srcStats.std[2] / (dstStats.std[2] || 1e-6))) + srcStats.mean[2];
    const rgb = labToRgb(L, A, B);
    out[i] = rgb[0];
    out[i + 1] = rgb[1];
    out[i + 2] = rgb[2];
  }
  return out;
}

function statsLab(data: Uint8ClampedArray): { mean: Vec3; std: Vec3 } {
  const mean: Vec3 = [0, 0, 0];
  const pixels = Math.max(1, data.length / 4);
  const labs: Vec3[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const lab = rgbToLab(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    labs.push(lab);
    mean[0] += lab[0];
    mean[1] += lab[1];
    mean[2] += lab[2];
  }
  mean[0] /= pixels;
  mean[1] /= pixels;
  mean[2] /= pixels;
  const v: Vec3 = [0, 0, 0];
  for (const lab of labs) {
    v[0] += (lab[0] - mean[0]) ** 2;
    v[1] += (lab[1] - mean[1]) ** 2;
    v[2] += (lab[2] - mean[2]) ** 2;
  }
  return {
    mean,
    std: [Math.sqrt(v[0] / pixels), Math.sqrt(v[1] / pixels), Math.sqrt(v[2] / pixels)],
  };
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let R = r / 255;
  let G = g / 255;
  let B = b / 255;
  R = R > 0.04045 ? ((R + 0.055) / 1.055) ** 2.4 : R / 12.92;
  G = G > 0.04045 ? ((G + 0.055) / 1.055) ** 2.4 : G / 12.92;
  B = B > 0.04045 ? ((B + 0.055) / 1.055) ** 2.4 : B / 12.92;
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047;
  const y = inv(fy);
  const z = inv(fz) * 1.08883;
  let R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let B = x * 0.0557 + y * -0.204 + z * 1.057;
  const gamma = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [gamma(R), gamma(G), gamma(B)];
}
