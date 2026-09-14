import { createToolContext, neoFileFromBytes, runTool, type ToolDefinition } from '@neotools/engine';
import { encodePngRgba, encodeBmp, encodeRgba } from '../src/codec/index.js';

export function checker(width: number, height: number, a: [number, number, number, number] = [220, 40, 40, 255], b: [number, number, number, number] = [40, 80, 200, 255]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = (x >> 3) + (y >> 3) & 1 ? a : b;
      const i = (y * width + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = c[3];
    }
  }
  return data;
}

export function pngFile(name: string, w = 32, h = 24): ReturnType<typeof neoFileFromBytes> {
  return neoFileFromBytes(name, encodePngRgba(checker(w, h), w, h), 'image/png');
}

export function bmpFile(name: string, w = 32, h = 24): ReturnType<typeof neoFileFromBytes> {
  return neoFileFromBytes(name, encodeBmp(checker(w, h), w, h), 'image/bmp');
}

export async function jpegFile(name: string, w = 32, h = 24): Promise<ReturnType<typeof neoFileFromBytes>> {
  const bytes = await encodeRgba(checker(w, h), w, h, 'jpeg', { quality: 85, keepMetadata: false });
  return neoFileFromBytes(name, bytes, 'image/jpeg');
}

export function ctx() {
  return createToolContext();
}

export async function run(tool: ToolDefinition, files: Parameters<typeof runTool>[2], options: unknown = {}) {
  return runTool(tool, ctx(), files, options);
}

export async function tryJpeg(): Promise<boolean> {
  try {
    await jpegFile('t.jpg', 16, 16);
    return true;
  } catch {
    return false;
  }
}
