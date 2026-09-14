import { clampByte } from '../codec/pixels.js';

export function rotate90(data: Uint8ClampedArray, width: number, height: number, turns: 1 | 2 | 3): { data: Uint8ClampedArray; width: number; height: number } {
  if (turns === 2) {
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        const di = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        out[di] = data[si]!;
        out[di + 1] = data[si + 1]!;
        out[di + 2] = data[si + 2]!;
        out[di + 3] = data[si + 3]!;
      }
    }
    return { data: out, width, height };
  }
  const dw = height;
  const dh = width;
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const dx = turns === 1 ? height - 1 - y : y;
      const dy = turns === 1 ? x : width - 1 - x;
      const di = (dy * dw + dx) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return { data: out, width: dw, height: dh };
}

export function flip(data: Uint8ClampedArray, width: number, height: number, horizontal: boolean, vertical: boolean): Uint8ClampedArray {
  if (!horizontal && !vertical) return new Uint8ClampedArray(data);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = horizontal ? width - 1 - x : x;
      const ny = vertical ? height - 1 - y : y;
      const si = (y * width + x) * 4;
      const di = (ny * width + nx) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return out;
}

export function rotateAngle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  degrees: number,
  bg: readonly [number, number, number, number] = [255, 255, 255, 255],
  autocrop = false,
): { data: Uint8ClampedArray; width: number; height: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const rx = (x! - width / 2) * cos - (y! - height / 2) * sin + width / 2;
    const ry = (x! - width / 2) * sin + (y! - height / 2) * cos + height / 2;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  const dw = Math.max(1, Math.round(maxX - minX));
  const dh = Math.max(1, Math.round(maxY - minY));
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = bg[0];
    out[i + 1] = bg[1];
    out[i + 2] = bg[2];
    out[i + 3] = bg[3];
  }
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const dx = x + minX - width / 2;
      const dy = y + minY - height / 2;
      const sx = dx * invCos - dy * invSin + width / 2;
      const sy = dx * invSin + dy * invCos + height / 2;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < -1 || y0 < -1 || x0 >= width || y0 >= height) continue;
      const tx = sx - x0;
      const ty = sy - y0;
      const sample = (ix: number, iy: number, c: number): number => {
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) return bg[c] ?? 0;
        return data[(iy * width + ix) * 4 + c] ?? 0;
      };
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v =
          sample(x0, y0, c) * (1 - tx) * (1 - ty) +
          sample(x0 + 1, y0, c) * tx * (1 - ty) +
          sample(x0, y0 + 1, c) * (1 - tx) * ty +
          sample(x0 + 1, y0 + 1, c) * tx * ty;
        out[di + c] = clampByte(Math.round(v));
      }
    }
  }
  if (!autocrop) return { data: out, width: dw, height: dh };
  let top = 0;
  let bottom = dh - 1;
  let left = 0;
  let right = dw - 1;
  const same = (i: number) =>
    out[i] === bg[0] && out[i + 1] === bg[1] && out[i + 2] === bg[2] && out[i + 3] === bg[3];
  scan: for (; top < dh; top++) {
    for (let x = 0; x < dw; x++) if (!same((top * dw + x) * 4)) break scan;
  }
  scan2: for (; bottom >= top; bottom--) {
    for (let x = 0; x < dw; x++) if (!same((bottom * dw + x) * 4)) break scan2;
  }
  scan3: for (; left < dw; left++) {
    for (let y = top; y <= bottom; y++) if (!same((y * dw + left) * 4)) break scan3;
  }
  scan4: for (; right >= left; right--) {
    for (let y = top; y <= bottom; y++) if (!same((y * dw + right) * 4)) break scan4;
  }
  const cw = Math.max(1, right - left + 1);
  const ch = Math.max(1, bottom - top + 1);
  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    cropped.set(out.subarray(((top + y) * dw + left) * 4, ((top + y) * dw + left + cw) * 4), y * cw * 4);
  }
  return { data: cropped, width: cw, height: ch };
}
