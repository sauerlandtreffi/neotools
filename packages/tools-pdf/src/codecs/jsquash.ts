import { asBufferSource, loadWasmBytes } from '../wasm-bytes.js';

export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let jpegEncReady = false;
let jpegDecReady = false;
let pngEncReady = false;
let pngDecReady = false;

async function compilePublicOrPkg(specifier: string, publicPath: string): Promise<WebAssembly.Module> {
  const bytes = await loadWasmBytes({ specifier, publicPath });
  return WebAssembly.compile(asBufferSource(bytes));
}

export async function encodeJpeg(image: RasterImage, quality: number): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/jpeg/encode.js');
  if (!jpegEncReady) {
    const wasm = await compilePublicOrPkg(
      '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
      '/assets/jsquash/mozjpeg_enc.wasm',
    );
    await init(wasm);
    jpegEncReady = true;
  }
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData, {
    quality: q,
  });
  return new Uint8Array(buf);
}

export async function decodeJpeg(bytes: Uint8Array): Promise<RasterImage> {
  const { default: decode, init } = await import('@jsquash/jpeg/decode.js');
  if (!jpegDecReady) {
    const wasm = await compilePublicOrPkg(
      '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
      '/assets/jsquash/mozjpeg_dec.wasm',
    );
    await init(wasm);
    jpegDecReady = true;
  }
  const copy = bytes.slice();
  const img = await decode(copy.buffer);
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export async function encodePngOxipng(image: RasterImage): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/png/encode.js');
  if (!pngEncReady) {
    const wasm = await compilePublicOrPkg(
      '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
      '/assets/jsquash/squoosh_png_bg.wasm',
    );
    await init(wasm);
    pngEncReady = true;
  }
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData);
  return new Uint8Array(buf);
}

export async function decodePngOxipng(bytes: Uint8Array): Promise<RasterImage> {
  const { default: decode, init } = await import('@jsquash/png/decode.js');
  if (!pngDecReady) {
    const wasm = await compilePublicOrPkg(
      '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
      '/assets/jsquash/squoosh_png_bg.wasm',
    );
    await init(wasm);
    pngDecReady = true;
  }
  const copy = bytes.slice();
  const img = await decode(copy.buffer);
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export function downsample(image: RasterImage, maxW: number, maxH: number): RasterImage {
  const scale = Math.min(1, maxW / image.width, maxH / image.height);
  if (scale >= 0.999) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x + 0.5) / scale));
      const si = (sy * image.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = image.data[si]!;
      data[di + 1] = image.data[si + 1]!;
      data[di + 2] = image.data[si + 2]!;
      data[di + 3] = image.data[si + 3]!;
    }
  }
  return { data, width, height };
}

export function toGrayscale(image: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const g = Math.round(0.299 * image.data[i]! + 0.587 * image.data[i + 1]! + 0.114 * image.data[i + 2]!);
    data[i] = g;
    data[i + 1] = g;
    data[i + 2] = g;
    data[i + 3] = image.data[i + 3]!;
  }
  return { data, width: image.width, height: image.height };
}
