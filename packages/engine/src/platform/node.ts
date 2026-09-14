import type { Platform, RenderPageRequest } from '../types.js';

async function tryNapiEncode(req: RenderPageRequest): Promise<Uint8Array> {
  const canvasMod = await import('@napi-rs/canvas').catch(() => null);
  if (!canvasMod) {
    throw new Error(
      'pdf-to-images ist in Node nur mit @napi-rs/canvas verfügbar. Im Browser nutzen oder das optionale Native-Paket installieren.',
    );
  }
  const { createCanvas } = canvasMod;
  const canvas = createCanvas(req.width, req.height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(req.width, req.height);
  imageData.data.set(req.data);
  ctx.putImageData(imageData, 0, 0);
  if (req.mime === 'image/jpeg') {
    return new Uint8Array(canvas.toBuffer('image/jpeg', req.quality ?? 0.92));
  }
  return new Uint8Array(canvas.toBuffer('image/png'));
}

let napiAvailable: boolean | null = null;

async function detectNapi(): Promise<boolean> {
  if (napiAvailable !== null) return napiAvailable;
  try {
    await import('@napi-rs/canvas');
    napiAvailable = true;
  } catch {
    napiAvailable = false;
  }
  return napiAvailable;
}

export function nodePlatform(): Platform {
  return {
    id: 'node',
    capabilities: {
      canvas: false,
      opfs: false,
      workers: typeof process !== 'undefined',
      qpdf: true,
      ocr: true,
      webgpu: false,
      onnx: true,
      ffmpegNative: false,
      webcodecs: false,
      directoryPicker: false,
    },
    async encodeRaster(req: RenderPageRequest) {
      return tryNapiEncode(req);
    },
    assets: {
      ...(process.env.NEOTOOLS_MODELS ? { modelBase: process.env.NEOTOOLS_MODELS } : {}),
    },
  };
}

async function detectFfmpegNative(): Promise<boolean> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('ffmpeg', ['-version'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export async function nodePlatformReady(): Promise<Platform> {
  const canvas = await detectNapi();
  const ffmpegNative = await detectFfmpegNative();
  const base = nodePlatform();
  return {
    ...base,
    capabilities: { ...base.capabilities, canvas, ffmpegNative },
  };
}

export async function readLocalFile(path: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  return new Uint8Array(await readFile(path));
}

export async function writeLocalFile(path: string, data: Uint8Array): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}
