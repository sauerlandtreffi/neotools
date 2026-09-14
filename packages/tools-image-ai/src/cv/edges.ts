import { gaussianBlurGray } from './gauss.js';

export interface GradField {
  mag: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
}

export function sobel(gray: Float32Array, width: number, height: number): GradField {
  const mag = new Float32Array(gray.length);
  const gx = new Float32Array(gray.length);
  const gy = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const a = gray[(y - 1) * width + (x - 1)]!;
      const b = gray[(y - 1) * width + x]!;
      const c = gray[(y - 1) * width + (x + 1)]!;
      const d = gray[y * width + (x - 1)]!;
      const f = gray[y * width + (x + 1)]!;
      const g = gray[(y + 1) * width + (x - 1)]!;
      const h = gray[(y + 1) * width + x]!;
      const j = gray[(y + 1) * width + (x + 1)]!;
      const sx = -a + c - 2 * d + 2 * f - g + j;
      const sy = -a - 2 * b - c + g + 2 * h + j;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  }
  return { mag, gx, gy };
}

/** Canny-light: Gauss → Sobel → NMS → double threshold + hysteresis. */
export function cannyLight(
  gray: Float32Array,
  width: number,
  height: number,
  opts: { sigma?: number; low?: number; high?: number } = {},
): Uint8Array {
  const blurred = gaussianBlurGray(gray, width, height, opts.sigma ?? 1.2);
  const { mag, gx, gy } = sobel(blurred, width, height);
  const nms = new Float32Array(mag.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const angle = (Math.atan2(gy[i]!, gx[i]!) * 180) / Math.PI;
      const a = (angle + 180) % 180;
      let n1 = 0;
      let n2 = 0;
      if ((a >= 0 && a < 22.5) || a >= 157.5) {
        n1 = mag[i - 1]!;
        n2 = mag[i + 1]!;
      } else if (a < 67.5) {
        n1 = mag[(y - 1) * width + (x + 1)]!;
        n2 = mag[(y + 1) * width + (x - 1)]!;
      } else if (a < 112.5) {
        n1 = mag[(y - 1) * width + x]!;
        n2 = mag[(y + 1) * width + x]!;
      } else {
        n1 = mag[(y - 1) * width + (x - 1)]!;
        n2 = mag[(y + 1) * width + (x + 1)]!;
      }
      nms[i] = mag[i]! >= n1 && mag[i]! >= n2 ? mag[i]! : 0;
    }
  }
  let max = 0;
  for (const v of nms) if (v > max) max = v;
  const high = opts.high ?? max * 0.2;
  const low = opts.low ?? high * 0.4;
  const out = new Uint8Array(nms.length);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i]! >= high) {
      out[i] = 2;
      stack.push(i);
    } else if (nms[i]! >= low) out[i] = 1;
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (out[j] === 1) {
          out[j] = 2;
          stack.push(j);
        }
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i] === 2 ? 255 : 0;
  return out;
}

export interface Line {
  rho: number;
  theta: number;
  votes: number;
}

/** Coarse Hough for a handful of dominant lines. */
export function houghLines(
  edges: Uint8Array,
  width: number,
  height: number,
  threshold?: number,
): Line[] {
  const maxRho = Math.hypot(width, height);
  const rhoBins = 180;
  const thetaBins = 180;
  const acc = new Uint32Array(rhoBins * thetaBins);
  const dRho = (2 * maxRho) / rhoBins;
  const dTheta = Math.PI / thetaBins;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!edges[y * width + x]) continue;
      for (let t = 0; t < thetaBins; t++) {
        const theta = t * dTheta;
        const rho = x * Math.cos(theta) + y * Math.sin(theta);
        const r = Math.round((rho + maxRho) / dRho);
        if (r >= 0 && r < rhoBins) acc[r * thetaBins + t]! += 1;
      }
    }
  }
  const minVotes = threshold ?? Math.max(20, Math.round(Math.min(width, height) * 0.15));
  const lines: Line[] = [];
  for (let r = 1; r < rhoBins - 1; r++) {
    for (let t = 1; t < thetaBins - 1; t++) {
      const v = acc[r * thetaBins + t]!;
      if (v < minVotes) continue;
      if (
        v >= acc[(r - 1) * thetaBins + t]! &&
        v >= acc[(r + 1) * thetaBins + t]! &&
        v >= acc[r * thetaBins + t - 1]! &&
        v >= acc[r * thetaBins + t + 1]!
      ) {
        lines.push({ rho: r * dRho - maxRho, theta: t * dTheta, votes: v });
      }
    }
  }
  return lines.sort((a, b) => b.votes - a.votes).slice(0, 12);
}

export function lineIntersect(a: Line, b: Line): { x: number; y: number } | null {
  const ct1 = Math.cos(a.theta);
  const st1 = Math.sin(a.theta);
  const ct2 = Math.cos(b.theta);
  const st2 = Math.sin(b.theta);
  const det = ct1 * st2 - st1 * ct2;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (st2 * a.rho - st1 * b.rho) / det, y: (ct1 * b.rho - ct2 * a.rho) / det };
}
