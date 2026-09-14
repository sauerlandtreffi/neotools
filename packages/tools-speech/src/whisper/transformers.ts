import type { Platform, ToolContext } from '@neotools/engine';
import { resolveTransformersPath, type ModelEntry } from '@neotools/models';
import { isNodeRuntime } from '@neotools/models';

type PipelineFn = (
  task: string,
  model: string,
  opts?: Record<string, unknown>,
) => Promise<(input: unknown, opts?: Record<string, unknown>) => Promise<unknown>>;

export interface TfMod {
  pipeline: PipelineFn;
  env: {
    allowRemoteModels?: boolean;
    localModelPath?: string;
    useBrowserCache?: boolean;
    backends?: { onnx?: { wasm?: { wasmPaths?: string } } };
  };
}

export async function loadTransformers(): Promise<TfMod | null> {
  try {
    return (await import('@huggingface/transformers')) as unknown as TfMod;
  } catch {
    return null;
  }
}

export function configureLocal(
  env: TfMod['env'],
  localPath: string,
  platform: Platform,
): void {
  env.allowRemoteModels = false;
  env.useBrowserCache = true;
  const parent = localPath.replace(/\/?$/, '/').replace(/[^/]+\/$/, '');
  env.localModelPath = parent.endsWith('/') ? parent : `${parent}/`;
  const wasm = platform.assets?.onnxWasmBase ?? '/assets/onnx/';
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = wasm.endsWith('/') ? wasm : `${wasm}/`;
  }
}

export async function openPipeline(
  modelId: string,
  task: string,
  platform: Platform,
  ctx: ToolContext,
  confirmed: boolean,
  extra: Record<string, unknown> = {},
): Promise<{ pipe: (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>; entry: ModelEntry }> {
  const { entry, localPath } = await resolveTransformersPath(modelId, platform, { confirmed });
  const tf = await loadTransformers();
  if (!tf) throw new Error('Transformers.js (@huggingface/transformers) fehlt.');
  configureLocal(tf.env, localPath, platform);
  ctx.progress(0.08, `Lade ${entry.id}`);
  const device = pickDevice(entry, platform);
  const dtype = entry.dtype ?? (device === 'webgpu' ? 'fp16' : 'q4');
  const pipe = await tf.pipeline(task, entry.localName, {
    device,
    dtype,
    local_files_only: true,
    ...extra,
  });
  return { pipe, entry };
}

export function pickDevice(entry: ModelEntry, platform: Platform): 'webgpu' | 'wasm' | 'cpu' {
  if (isNodeRuntime()) return 'cpu';
  if (entry.webgpuOnly && !platform.capabilities.webgpu) {
    throw new Error(`Modell ${entry.id} braucht WebGPU.`);
  }
  if (platform.capabilities.webgpu && entry.device !== 'wasm') return 'webgpu';
  return 'wasm';
}
