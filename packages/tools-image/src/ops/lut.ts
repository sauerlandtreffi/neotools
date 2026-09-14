/** Minimal .cube 3D LUT parser + trilinear apply (MIT). */

export interface CubeLut {
  title?: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  table: Float32Array;
}

export function parseCubeLut(text: string): CubeLut {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let title: string | undefined;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) {
      title = /TITLE\s+"?([^"]+)"?/.exec(line)?.[1];
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMin[0] = p[0] ?? 0;
      domainMin[1] = p[1] ?? 0;
      domainMin[2] = p[2] ?? 0;
      continue;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMax[0] = p[0] ?? 1;
      domainMax[1] = p[1] ?? 1;
      domainMax[2] = p[2] ?? 1;
      continue;
    }
    if (line.startsWith('LUT_1D') || line.startsWith('LUT_3D_INPUT')) continue;
    const nums = line.split(/\s+/).map(Number);
    if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) {
      values.push(nums[0]!, nums[1]!, nums[2]!);
    }
  }
  if (size < 2) {
    const n = Math.round(Math.cbrt(values.length / 3));
    size = n >= 2 ? n : 2;
  }
  return { title, size, domainMin, domainMax, table: new Float32Array(values) };
}

function sample(lut: CubeLut, r: number, g: number, b: number): [number, number, number] {
  const n = lut.size;
  const max = n - 1;
  const x = Math.min(max, Math.max(0, r * max));
  const y = Math.min(max, Math.max(0, g * max));
  const z = Math.min(max, Math.max(0, b * max));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(max, x0 + 1);
  const y1 = Math.min(max, y0 + 1);
  const z1 = Math.min(max, z0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const idx = (xi: number, yi: number, zi: number) => (zi * n * n + yi * n + xi) * 3;
  const c000 = lut.table.subarray(idx(x0, y0, z0), idx(x0, y0, z0) + 3);
  const c100 = lut.table.subarray(idx(x1, y0, z0), idx(x1, y0, z0) + 3);
  const c010 = lut.table.subarray(idx(x0, y1, z0), idx(x0, y1, z0) + 3);
  const c110 = lut.table.subarray(idx(x1, y1, z0), idx(x1, y1, z0) + 3);
  const c001 = lut.table.subarray(idx(x0, y0, z1), idx(x0, y0, z1) + 3);
  const c101 = lut.table.subarray(idx(x1, y0, z1), idx(x1, y0, z1) + 3);
  const c011 = lut.table.subarray(idx(x0, y1, z1), idx(x0, y1, z1) + 3);
  const c111 = lut.table.subarray(idx(x1, y1, z1), idx(x1, y1, z1) + 3);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c00 = lerp(c000[i] ?? 0, c100[i] ?? 0, fx);
    const c10 = lerp(c010[i] ?? 0, c110[i] ?? 0, fx);
    const c01 = lerp(c001[i] ?? 0, c101[i] ?? 0, fx);
    const c11 = lerp(c011[i] ?? 0, c111[i] ?? 0, fx);
    const c0 = lerp(c00, c10, fy);
    const c1 = lerp(c01, c11, fy);
    out[i] = lerp(c0, c1, fz);
  }
  return out;
}

export function applyLutCube(data: Uint8ClampedArray, lut: CubeLut, strength = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const s = Math.min(1, Math.max(0, strength));
  for (let i = 0; i < out.length; i += 4) {
    const r = (out[i] ?? 0) / 255;
    const g = (out[i + 1] ?? 0) / 255;
    const b = (out[i + 2] ?? 0) / 255;
    const mapped = sample(lut, r, g, b);
    out[i] = Math.round(((1 - s) * r + s * mapped[0]) * 255);
    out[i + 1] = Math.round(((1 - s) * g + s * mapped[1]) * 255);
    out[i + 2] = Math.round(((1 - s) * b + s * mapped[2]) * 255);
  }
  return out;
}

/** Identity 2³ cube for tests / fallback. */
export function identityCube(size = 2): CubeLut {
  const table = new Float32Array(size * size * size * 3);
  let o = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        table[o++] = x / (size - 1);
        table[o++] = y / (size - 1);
        table[o++] = z / (size - 1);
      }
    }
  }
  return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], table };
}

export function cubeText(lut: CubeLut): string {
  const lines = [`LUT_3D_SIZE ${lut.size}`];
  for (let i = 0; i < lut.table.length; i += 3) {
    lines.push(`${lut.table[i]!.toFixed(6)} ${lut.table[i + 1]!.toFixed(6)} ${lut.table[i + 2]!.toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}
