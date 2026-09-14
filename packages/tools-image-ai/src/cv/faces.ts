import type { RasterImage } from '../raster.js';
import type { Box } from './filters.js';
import type { OrtTensor } from '../models/runtime.js';

function isSkin(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && r > g && r - g > 15 && r > b && Math.abs(r - g) > 15;
}

/** Skin-cluster heuristic when YuNet / BlazeFace is missing. */
export function heuristicFaceBoxes(img: RasterImage): Box[] {
  const visited = new Uint8Array(img.width * img.height);
  const boxes: Box[] = [];
  for (let y = 2; y < img.height - 2; y += 3) {
    for (let x = 2; x < img.width - 2; x += 3) {
      const i = y * img.width + x;
      if (visited[i]) continue;
      const o = i * 4;
      if (!isSkin(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!)) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      visited[i] = 1;
      let n = 0;
      while (stack.length && n < 12000) {
        const p = stack.pop()!;
        n++;
        const px = p % img.width;
        const py = (p / img.width) | 0;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        for (const [dx, dy] of [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ] as const) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
          const j = yy * img.width + xx;
          if (visited[j]) continue;
          const q = j * 4;
          if (!isSkin(img.data[q]!, img.data[q + 1]!, img.data[q + 2]!)) continue;
          visited[j] = 1;
          stack.push(j);
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      if (w < 18 || h < 22) continue;
      if (h / w < 1.05 || h / w > 1.9) continue;
      if (w * h < 500) continue;
      boxes.push({ x: minX, y: minY, w, h });
    }
  }
  return boxes.slice(0, 20);
}

/** Parse YuNet-like [n, 15] or flattened detections. */
export function boxesFromYunet(
  outputs: Record<string, OrtTensor>,
  imgW: number,
  imgH: number,
  inputW: number,
  inputH: number,
  minScore: number,
): Box[] {
  const boxes: Box[] = [];
  const sx = imgW / inputW;
  const sy = imgH / inputH;
  for (const tensor of Object.values(outputs)) {
    const data = tensor.data instanceof Float32Array ? tensor.data : new Float32Array(tensor.data);
    const dims = tensor.dims;
    const last = dims[dims.length - 1] ?? 0;
    if (last >= 5 && last <= 16) {
      const stride = last;
      const n = data.length / stride;
      for (let i = 0; i < n; i++) {
        const o = i * stride;
        const score = data[o + 4]!;
        if (score < minScore) continue;
        let x = data[o]!;
        let y = data[o + 1]!;
        let w = data[o + 2]!;
        let h = data[o + 3]!;
        if (x <= 1 && y <= 1 && w <= 1 && h <= 1) {
          x *= inputW;
          y *= inputH;
          w *= inputW;
          h *= inputH;
        }
        boxes.push({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
      }
    }
  }
  return boxes;
}
