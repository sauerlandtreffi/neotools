import { wrap, proxy } from 'comlink';
import type { WorkerApi, WorkerFile } from '../worker/tool-worker';
import { bytesToBlob } from './bytes-blob';

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

export function safeDownloadName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'download';
  return base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'download.bin';
}

export function downloadBytes(name: string, data: Uint8Array, mime: string) {
  const blob = bytesToBlob(data, mime);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeDownloadName(name);
  a.click();
  URL.revokeObjectURL(url);
}

export async function zipDownload(files: WorkerFile[], zipName = 'neotools.zip') {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const name = safeDownloadName(file.name);
    if (!name.includes('..')) entries[name] = file.data;
  }
  const zipped = zipSync(entries);
  downloadBytes(safeDownloadName(zipName), zipped, 'application/zip');
}
