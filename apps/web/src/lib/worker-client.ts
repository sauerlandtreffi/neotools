import { wrap, proxy } from 'comlink';
import type { WorkerApi, WorkerFile } from '../worker/tool-worker';

export type { WorkerFile };

export function createToolWorker() {
  const worker = new Worker(new URL('../worker/tool-worker.ts', import.meta.url), { type: 'module' });
  const api = wrap<WorkerApi>(worker);
  return {
    api,
    terminate() {
      worker.terminate();
    },
    proxy,
  };
}

export function downloadBytes(name: string, data: Uint8Array, mime: string) {
  const blob = new Blob([data.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function zipDownload(files: WorkerFile[], zipName = 'neotools.zip') {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) entries[file.name] = file.data;
  const zipped = zipSync(entries);
  downloadBytes(zipName, zipped, 'application/zip');
}
