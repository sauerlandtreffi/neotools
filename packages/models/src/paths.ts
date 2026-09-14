import type { Platform } from '@neotools/engine';
import { isNodeRuntime } from './env.js';
import type { ModelEntry } from './schema.js';

export function runtimeModelUrl(entry: ModelEntry, platform: Platform): string {
  const base = platform.assets?.modelBase ?? '/assets/models';
  const file = entry.kind === 'transformers' ? `${entry.localName}/` : entry.localName;
  if (base.endsWith('/')) return `${base}${file}`;
  return `${base}/${file}`;
}

export async function nodeModelDirs(platform: Platform): Promise<string[]> {
  if (!isNodeRuntime()) return [];
  const { homedir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dirs: string[] = [];
  if (platform.assets?.modelBase) dirs.push(platform.assets.modelBase);
  if (process.env.NEOTOOLS_MODELS) dirs.push(process.env.NEOTOOLS_MODELS);
  dirs.push(join(homedir(), '.cache', 'neotools', 'models'));
  dirs.push(join(process.cwd(), '.models'));
  dirs.push(join(process.cwd(), 'packages/models/.models'));
  dirs.push(join(process.cwd(), 'packages/tools-image-ai/.models'));
  dirs.push(join(process.cwd(), 'packages/tools-speech/.models'));
  dirs.push(join(process.cwd(), 'apps/web/public/assets/models'));
  try {
    dirs.push(fileURLToPath(new URL('../.models', import.meta.url)));
  } catch {
    // ignore
  }
  return dirs;
}

export async function findLocalOnnx(entry: ModelEntry, platform: Platform): Promise<Uint8Array | null> {
  if (!isNodeRuntime()) return null;
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  for (const dir of await nodeModelDirs(platform)) {
    const candidates = [join(dir, entry.localName), join(dir, `${entry.id}.onnx`)];
    for (const path of candidates) {
      try {
        return new Uint8Array(await readFile(path));
      } catch {
        // next
      }
    }
  }
  return null;
}

export async function findLocalTransformersDir(entry: ModelEntry, platform: Platform): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  const { access } = await import('node:fs/promises');
  const { join } = await import('node:path');
  for (const dir of await nodeModelDirs(platform)) {
    const path = join(dir, entry.localName);
    try {
      await access(join(path, 'config.json'));
      return path;
    } catch {
      // next
    }
  }
  return null;
}
