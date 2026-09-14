import { createToolContext, neoFileFromBytes } from '@neotools/engine';
import type { RasterImage } from '../src/raster.js';
import { encodePng } from '../src/raster.js';

export function solid(width: number, height: number, r = 255, g = 255, b = 255, a = 255): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

export function fillPoly(img: RasterImage, pts: Array<{ x: number; y: number }>, color: [number, number, number]): void {
  const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const maxX = Math.min(img.width - 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const maxY = Math.min(img.height - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPoly(x + 0.5, y + 0.5, pts)) continue;
      const o = (y * img.width + x) * 4;
      img.data[o] = color[0];
      img.data[o + 1] = color[1];
      img.data[o + 2] = color[2];
      img.data[o + 3] = 255;
    }
  }
}

function pointInPoly(x: number, y: number, pts: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x;
    const yi = pts[i]!.y;
    const xj = pts[j]!.x;
    const yj = pts[j]!.y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pngFile(name: string, img: RasterImage) {
  return neoFileFromBytes(name, encodePng(img), 'image/png');
}

export function ctx() {
  return createToolContext({
    platform: {
      id: 'node',
      capabilities: { canvas: false, opfs: false, workers: true, qpdf: false, ocr: false, webgpu: false, onnx: true },
    },
  });
}
