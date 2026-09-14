import * as Comlink from 'comlink';
import type { Platform, RenderPageRequest } from '../types.js';

export function hasOpfs(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
  } catch {
    return false;
  }
}

async function encodeRaster(req: RenderPageRequest): Promise<Uint8Array> {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(req.width, req.height)
      : null;
  if (!canvas) {
    throw new Error('Kein Canvas verfügbar (OffscreenCanvas fehlt).');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-Kontext nicht verfügbar.');
  const imageData = new ImageData(req.data as ImageDataArray, req.width, req.height);
  ctx.putImageData(imageData, 0, 0);
  const type = req.mime;
  const blob = await canvas.convertToBlob({
    type,
    quality: type === 'image/jpeg' ? (req.quality ?? 0.92) : undefined,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function browserPlatform(): Platform {
  return {
    id: 'browser',
    capabilities: {
      canvas: typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined',
      opfs: hasOpfs(),
      workers: typeof Worker !== 'undefined',
      qpdf: true,
      ocr: true,
      webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
      onnx: true,
      ffmpegNative: false,
      webcodecs: typeof globalThis.VideoEncoder === 'function',
      directoryPicker: true,
    },
    encodeRaster,
    assets: {
      modelBase: '/assets/models',
      onnxWasmBase: '/assets/onnx',
      ffmpegBase: '/assets/ffmpeg',
    },
  };
}

export function wrapWorker<T>(worker: Worker): Comlink.Remote<T> {
  return Comlink.wrap<T>(worker);
}

export function exposeWorker(api: object): void {
  Comlink.expose(api);
}

export { Comlink };
