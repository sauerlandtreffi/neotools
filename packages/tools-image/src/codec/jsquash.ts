import { compileWasm, once, asBufferSource } from './wasm.js';

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function initCodec(
  key: string,
  specifier: string,
  publicPath: string,
  init: (wasm: WebAssembly.Module) => Promise<unknown> | unknown,
): Promise<void> {
  await once(key, async () => {
    const wasm = await compileWasm(specifier, publicPath);
    await init(wasm);
  });
}

export async function encodeJpegJsquash(image: Raster, quality: number): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/jpeg/encode.js');
  await initCodec('jpeg-enc', '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', '/assets/jsquash/mozjpeg_enc.wasm', init);
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData, { quality: q });
  return new Uint8Array(buf);
}

export async function decodeJpegJsquash(bytes: Uint8Array): Promise<Raster> {
  const { default: decode, init } = await import('@jsquash/jpeg/decode.js');
  await initCodec('jpeg-dec', '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', '/assets/jsquash/mozjpeg_dec.wasm', init);
  const img = await decode(asBufferSource(bytes));
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export async function encodePngJsquash(image: Raster): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/png/encode.js');
  await initCodec('png-enc', '@jsquash/png/codec/pkg/squoosh_png_bg.wasm', '/assets/jsquash/squoosh_png_bg.wasm', init);
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData);
  return new Uint8Array(buf);
}

export async function decodePngJsquash(bytes: Uint8Array): Promise<Raster> {
  const { default: decode, init } = await import('@jsquash/png/decode.js');
  await initCodec('png-dec', '@jsquash/png/codec/pkg/squoosh_png_bg.wasm', '/assets/jsquash/squoosh_png_bg.wasm', init);
  const img = await decode(asBufferSource(bytes));
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export async function optimizePngOxipng(png: Uint8Array): Promise<Uint8Array> {
  const mod = (await import('@jsquash/oxipng')) as unknown as {
    init?: (w: WebAssembly.Module) => Promise<unknown> | unknown;
    optimise?: (data: ArrayBuffer, opts?: { level?: number }) => Promise<ArrayBuffer>;
    default?: (data: ArrayBuffer, opts?: { level?: number }) => Promise<ArrayBuffer>;
  };
  if (mod.init) {
    await initCodec(
      'oxipng',
      '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
      '/assets/jsquash/squoosh_oxipng_bg.wasm',
      mod.init,
    );
  }
  const optimise = mod.optimise ?? mod.default;
  if (!optimise) return png;
  try {
    const buf = await optimise(asBufferSource(png), { level: 3 });
    return new Uint8Array(buf);
  } catch {
    return png;
  }
}

export async function encodeWebpJsquash(image: Raster, quality: number, lossless = false): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/webp/encode.js');
  await initCodec('webp-enc', '@jsquash/webp/codec/enc/webp_enc.wasm', '/assets/jsquash/webp_enc.wasm', init);
  const q = Math.max(0, Math.min(100, Math.round(quality)));
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData, {
    quality: q,
    lossless: lossless ? 1 : 0,
  });
  return new Uint8Array(buf);
}

export async function decodeWebpJsquash(bytes: Uint8Array): Promise<Raster> {
  const { default: decode, init } = await import('@jsquash/webp/decode.js');
  await initCodec('webp-dec', '@jsquash/webp/codec/dec/webp_dec.wasm', '/assets/jsquash/webp_dec.wasm', init);
  const img = await decode(asBufferSource(bytes));
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export async function encodeAvifJsquash(image: Raster, quality: number, lossless = false): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/avif/encode.js');
  await initCodec('avif-enc', '@jsquash/avif/codec/enc/avif_enc.wasm', '/assets/jsquash/avif_enc.wasm', init);
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData, {
    quality: q,
    lossless,
  });
  return new Uint8Array(buf);
}

export async function decodeAvifJsquash(bytes: Uint8Array): Promise<Raster> {
  const { default: decode, init } = await import('@jsquash/avif/decode.js');
  await initCodec('avif-dec', '@jsquash/avif/codec/dec/avif_dec.wasm', '/assets/jsquash/avif_dec.wasm', init);
  const img = await decode(asBufferSource(bytes));
  if (!img) throw new Error('AVIF-Decode fehlgeschlagen.');
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

export async function encodeJxlJsquash(image: Raster, quality: number, lossless = false): Promise<Uint8Array> {
  const { default: encode, init } = await import('@jsquash/jxl/encode.js');
  await initCodec('jxl-enc', '@jsquash/jxl/codec/enc/jxl_enc.wasm', '/assets/jsquash/jxl_enc.wasm', init);
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const buf = await encode({ data: image.data, width: image.width, height: image.height } as ImageData, {
    quality: q,
    lossless,
  });
  return new Uint8Array(buf);
}

export async function decodeJxlJsquash(bytes: Uint8Array): Promise<Raster> {
  const { default: decode, init } = await import('@jsquash/jxl/decode.js');
  await initCodec('jxl-dec', '@jsquash/jxl/codec/dec/jxl_dec.wasm', '/assets/jsquash/jxl_dec.wasm', init);
  const img = await decode(asBufferSource(bytes));
  if (!img) throw new Error('JXL-Decode fehlgeschlagen.');
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}
