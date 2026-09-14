export type Gravity = 'center' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  unit?: 'px' | 'percent';
}

export const ASPECT_PRESETS: Record<string, number> = {
  free: 0,
  '1:1': 1,
  '4:5': 4 / 5,
  '5:4': 5 / 4,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  a4: 1 / Math.SQRT2,
};

export function resolveBox(box: Box, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const unit = box.unit ?? 'px';
  let x = box.x;
  let y = box.y;
  let w = box.w;
  let h = box.h;
  if (unit === 'percent') {
    x = (box.x / 100) * width;
    y = (box.y / 100) * height;
    w = (box.w / 100) * width;
    h = (box.h / 100) * height;
  }
  x = Math.max(0, Math.min(width - 1, Math.round(x)));
  y = Math.max(0, Math.min(height - 1, Math.round(y)));
  w = Math.max(1, Math.min(width - x, Math.round(w)));
  h = Math.max(1, Math.min(height - y, Math.round(h)));
  return { x, y, w, h };
}

export function boxFromAspect(width: number, height: number, aspect: number, gravity: Gravity): Box {
  if (!aspect) return { x: 0, y: 0, w: width, h: height, unit: 'px' };
  let w = width;
  let h = Math.round(w / aspect);
  if (h > height) {
    h = height;
    w = Math.round(h * aspect);
  }
  let x = 0;
  let y = 0;
  const hx = width - w;
  const hy = height - h;
  if (gravity.includes('e')) x = hx;
  else if (gravity === 'center' || gravity === 'n' || gravity === 's') x = Math.round(hx / 2);
  if (gravity.includes('s')) y = hy;
  else if (gravity === 'center' || gravity === 'e' || gravity === 'w') y = Math.round(hy / 2);
  if (gravity === 'ne' || gravity === 'se') x = hx;
  if (gravity === 'nw' || gravity === 'sw') x = 0;
  return { x, y, w, h, unit: 'px' };
}

export function cropRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Box,
): { data: Uint8ClampedArray; width: number; height: number } {
  const r = resolveBox(box, width, height);
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const src = ((r.y + y) * width + r.x) * 4;
    out.set(data.subarray(src, src + r.w * 4), y * r.w * 4);
  }
  return { data: out, width: r.w, height: r.h };
}

export function cropCircle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box?: Box,
): { data: Uint8ClampedArray; width: number; height: number } {
  const r = box ? resolveBox(box, width, height) : { x: 0, y: 0, w: width, h: height };
  const size = Math.min(r.w, r.h);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = size / 2;
  const ox = Math.round(cx - rad);
  const oy = Math.round(cy - rad);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = ox + x;
      const sy = oy + y;
      const di = (y * size + x) * 4;
      const dx = x + 0.5 - size / 2;
      const dy = y + 0.5 - size / 2;
      if (dx * dx + dy * dy > rad * rad) {
        out[di + 3] = 0;
        continue;
      }
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const si = (sy * width + sx) * 4;
      out[di] = data[si]!;
      out[di + 1] = data[si + 1]!;
      out[di + 2] = data[si + 2]!;
      out[di + 3] = data[si + 3]!;
    }
  }
  return { data: out, width: size, height: size };
}
