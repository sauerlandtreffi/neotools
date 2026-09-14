import type { Platform } from '@neotools/engine';
import { getModel, modelsForTool, modelConfirmMessage } from './catalog.js';
import { ModelMissingError } from './errors.js';
import { cacheGet, cachePut, fetchSameOriginModel, type ProgressFn } from './cache.js';
import { assertSha256 } from './hash.js';
import { findLocalOnnx, findLocalTransformersDir, runtimeModelUrl } from './paths.js';
import type { ModelEntry } from './schema.js';
import { isNodeRuntime } from '../wasm-bytes.js';

export interface EnsureModelOptions {
  /** User confirmed the one-time download dialog. */
  confirmed?: boolean;
  onProgress?: ProgressFn;
}

export interface ModelStatus {
  id: string;
  ready: boolean;
  sizeBytes: number;
  license: string;
  confirmMessageDe: string;
  confirmMessageEn: string;
  localPath?: string;
}

export async function modelStatus(toolId: string, platform: Platform): Promise<ModelStatus[]> {
  const rows: ModelStatus[] = [];
  for (const entry of modelsForTool(toolId)) {
    const ready = await isModelReady(entry, platform);
    rows.push({
      id: entry.id,
      ready,
      sizeBytes: entry.sizeBytes,
      license: entry.license,
      confirmMessageDe: modelConfirmMessage(entry, 'de'),
      confirmMessageEn: modelConfirmMessage(entry, 'en'),
    });
  }
  return rows;
}

export async function isModelReady(entry: ModelEntry, platform: Platform): Promise<boolean> {
  if (entry.kind === 'transformers') {
    if (isNodeRuntime()) return Boolean(await findLocalTransformersDir(entry, platform));
    const cached = await cacheGet(entry);
    return Boolean(cached);
  }
  if (isNodeRuntime()) return Boolean(await findLocalOnnx(entry, platform));
  if (await cacheGet(entry)) return true;
  try {
    const url = runtimeModelUrl(entry, platform);
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadOnnxBytes(
  id: string,
  platform: Platform,
  opts: EnsureModelOptions = {},
): Promise<{ entry: ModelEntry; bytes: Uint8Array }> {
  const entry = getModel(id);
  if (!entry) throw new Error(`Unbekanntes Modell: ${id}`);
  if (entry.kind !== 'onnx') throw new Error(`Modell ${id} ist kein ONNX-Blob.`);

  if (isNodeRuntime()) {
    const bytes = await findLocalOnnx(entry, platform);
    if (!bytes) {
      throw new ModelMissingError(
        entry,
        false,
        `Lokal fehlt. CLI: neotools models fetch ${entry.tools[0] ?? entry.id}`,
      );
    }
    await assertSha256(bytes, entry.sha256);
    return { entry, bytes };
  }

  const cached = await cacheGet(entry);
  if (cached) {
    await assertSha256(cached, entry.sha256);
    return { entry, bytes: cached };
  }

  if (!opts.confirmed) {
    throw new ModelMissingError(entry, true);
  }

  const url = runtimeModelUrl(entry, platform);
  try {
    const bytes = await fetchSameOriginModel(entry, url, opts.onProgress);
    await cachePut(entry, bytes);
    return { entry, bytes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ModelMissingError(entry, false, msg);
  }
}

export async function resolveTransformersPath(
  id: string,
  platform: Platform,
  opts: EnsureModelOptions = {},
): Promise<{ entry: ModelEntry; localPath: string }> {
  const entry = getModel(id);
  if (!entry) throw new Error(`Unbekanntes Modell: ${id}`);
  if (isNodeRuntime()) {
    const dir = await findLocalTransformersDir(entry, platform);
    if (!dir) {
      throw new ModelMissingError(
        entry,
        false,
        `Lokal fehlt. CLI: neotools models fetch ${entry.tools[0] ?? entry.id}`,
      );
    }
    return { entry, localPath: dir };
  }
  if (!opts.confirmed && !(await cacheGet(entry))) {
    throw new ModelMissingError(entry, true);
  }
  return { entry, localPath: runtimeModelUrl(entry, platform) };
}
