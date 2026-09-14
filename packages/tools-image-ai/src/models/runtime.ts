import type { Platform, ToolContext } from '@neotools/engine';
import { isNodeRuntime } from '../wasm-bytes.js';
import type { RasterImage } from '../raster.js';
import { letterbox, resizeBilinear } from '../raster.js';
import type { ModelEntry, ModelInputSpec } from './schema.js';
import { loadOnnxBytes } from './load.js';

export type OrtTensor = {
  dims: readonly number[];
  data: Float32Array | Uint8Array;
};

type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};

type OrtNs = {
  env: { wasm: { wasmPaths?: string; numThreads?: number; simd?: boolean; proxy?: boolean } };
  InferenceSession: { create(buf: Uint8Array | ArrayBuffer, opts?: Record<string, unknown>): Promise<OrtSession> };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
};

const sessions = new Map<string, OrtSession>();
let ortMod: OrtNs | null = null;
let ortBackend: 'webgpu' | 'wasm' | 'cpu' | null = null;

function hasCoopCoep(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

async function loadOrt(platform: Platform): Promise<OrtNs> {
  if (ortMod) return ortMod;
  if (isNodeRuntime()) {
    try {
      ortMod = (await import('onnxruntime-node')) as unknown as OrtNs;
      ortBackend = 'cpu';
      return ortMod;
    } catch {
      // fall through to web
    }
  }
  const web = (await import('onnxruntime-web')) as unknown as OrtNs;
  const wasmBase = platform.assets?.onnxWasmBase ?? '/assets/onnx/';
  web.env.wasm.wasmPaths = wasmBase.endsWith('/') ? wasmBase : `${wasmBase}/`;
  web.env.wasm.simd = true;
  web.env.wasm.numThreads = hasCoopCoep() ? 4 : 1;
  ortMod = web;
  return web;
}

export function activeOrtBackend(): 'webgpu' | 'wasm' | 'cpu' | null {
  return ortBackend;
}

export async function getSession(
  modelId: string,
  platform: Platform,
  ctx?: ToolContext,
  confirmed = false,
): Promise<{ session: OrtSession; entry: ModelEntry; Tensor: OrtNs['Tensor'] }> {
  const cached = sessions.get(modelId);
  const ort = await loadOrt(platform);
  if (cached) return { session: cached, entry: (await loadOnnxBytes(modelId, platform, { confirmed: true })).entry, Tensor: ort.Tensor };

  const { entry, bytes } = await loadOnnxBytes(modelId, platform, {
    confirmed,
    onProgress: (ev) => ctx?.progress(0.05 + ev.ratio * 0.2, `Modell ${ev.modelId} ${Math.round(ev.ratio * 100)}%`),
  });

  const providers: string[] = [];
  if (platform.capabilities.webgpu && !isNodeRuntime()) providers.push('webgpu');
  if (!isNodeRuntime()) providers.push('wasm');
  else providers.push('cpu');

  let session: OrtSession | null = null;
  let lastErr: unknown;
  for (const ep of providers) {
    try {
      session = await ort.InferenceSession.create(bytes.slice().buffer, {
        executionProviders: [ep],
      });
      ortBackend = ep === 'webgpu' ? 'webgpu' : ep === 'wasm' ? 'wasm' : 'cpu';
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!session) {
    throw new Error(
      `ONNX-Session ${modelId} fehlgeschlagen: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }
  sessions.set(modelId, session);
  return { session, entry, Tensor: ort.Tensor };
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

export function rasterToNchw(img: RasterImage, spec: ModelInputSpec): Float32Array {
  const { width, height, data } = img;
  const out = new Float32Array(3 * width * height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    let r = data[i * 4]! / 255;
    let g = data[i * 4 + 1]! / 255;
    let b = data[i * 4 + 2]! / 255;
    if (spec.color === 'BGR') {
      const t = r;
      r = b;
      b = t;
    }
    if (spec.normalize === 'imagenet') {
      r = (r - IMAGENET_MEAN[0]!) / IMAGENET_STD[0]!;
      g = (g - IMAGENET_MEAN[1]!) / IMAGENET_STD[1]!;
      b = (b - IMAGENET_MEAN[2]!) / IMAGENET_STD[2]!;
    } else if (spec.normalize === 'minus_one_one') {
      r = (r - 0.5) / 0.5;
      g = (g - 0.5) / 0.5;
      b = (b - 0.5) / 0.5;
    } else if (spec.normalize === 'uint8') {
      r = data[i * 4]!;
      g = data[i * 4 + 1]!;
      b = data[i * 4 + 2]!;
    }
    out[i] = r;
    out[n + i] = g;
    out[2 * n + i] = b;
  }
  return out;
}

export function maskFromOutput(tensor: OrtTensor, width: number, height: number): Float32Array {
  const data = tensor.data instanceof Float32Array ? tensor.data : new Float32Array(tensor.data);
  const mask = new Float32Array(width * height);
  if (data.length === width * height) {
    mask.set(data);
    return mask;
  }
  // take last channel / last plane
  const plane = data.subarray(data.length - width * height);
  mask.set(plane);
  return mask;
}

export function applySigmoid(mask: Float32Array): Float32Array {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]!;
    out[i] = 1 / (1 + Math.exp(-v));
  }
  return out;
}

export async function runSegmentation(
  modelId: string,
  image: RasterImage,
  platform: Platform,
  ctx?: ToolContext,
  confirmed = false,
): Promise<{ mask: Float32Array; width: number; height: number; backend: string | null }> {
  const { session, entry, Tensor } = await getSession(modelId, platform, ctx, confirmed);
  const spec = entry.input ?? {
    layout: 'NCHW' as const,
    width: 320,
    height: 320,
    color: 'RGB' as const,
    normalize: 'imagenet' as const,
  };
  const boxed = letterbox(image, Math.max(spec.width, spec.height), 0);
  const square = boxed.image.width === spec.width && boxed.image.height === spec.height
    ? boxed.image
    : resizeBilinear(boxed.image, spec.width, spec.height);
  const nchw = rasterToNchw(square, spec);
  const inputName = session.inputNames[0] ?? 'input';
  const tensor = new Tensor('float32', nchw, [1, 3, spec.height, spec.width]);
  const out = await session.run({ [inputName]: tensor });
  const first = out[session.outputNames[0] ?? Object.keys(out)[0] ?? ''];
  if (!first) throw new Error(`Modell ${modelId}: keine Ausgabe.`);
  let mask = maskFromOutput(first, spec.width, spec.height);
  const min = mask.reduce((a, b) => Math.min(a, b), Infinity);
  const max = mask.reduce((a, b) => Math.max(a, b), -Infinity);
  if (min < 0 || max > 1.05) mask = applySigmoid(mask);
  // undo letterbox
  const full = resizeBilinear(
    {
      width: spec.width,
      height: spec.height,
      data: maskToGray(mask, spec.width, spec.height),
    },
    image.width,
    image.height,
  );
  const raw = new Float32Array(image.width * image.height);
  for (let i = 0; i < raw.length; i++) raw[i] = full.data[i * 4]! / 255;
  return { mask: raw, width: image.width, height: image.height, backend: ortBackend };
}

function maskToGray(mask: Float32Array, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(mask[i]! * 255)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

export async function runOnnxRaw(
  modelId: string,
  image: RasterImage,
  platform: Platform,
  ctx?: ToolContext,
  confirmed = false,
): Promise<{ outputs: Record<string, OrtTensor>; entry: ModelEntry; inputW: number; inputH: number }> {
  const { session, entry, Tensor } = await getSession(modelId, platform, ctx, confirmed);
  const spec = entry.input ?? {
    layout: 'NCHW' as const,
    width: 160,
    height: 120,
    color: 'RGB' as const,
    normalize: 'zero_one' as const,
  };
  const resized = resizeBilinear(image, spec.width, spec.height);
  const nchw = rasterToNchw(resized, spec);
  const inputName = session.inputNames[0] ?? 'input';
  const tensor = new Tensor('float32', nchw, [1, 3, spec.height, spec.width]);
  const outputs = (await session.run({ [inputName]: tensor })) as Record<string, OrtTensor>;
  return { outputs, entry, inputW: spec.width, inputH: spec.height };
}
