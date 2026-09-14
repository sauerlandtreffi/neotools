import type { HistoryBlobStore } from './types';

async function rootDir(name = 'history'): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(name, { create: true });
}

async function walkWrite(
  dir: FileSystemDirectoryHandle,
  parts: string[],
  data: Uint8Array,
): Promise<void> {
  if (parts.length === 1) {
    const file = await dir.getFileHandle(parts[0]!, { create: true });
    const writable = await file.createWritable();
    await writable.write(data.slice());
    await writable.close();
    return;
  }
  const next = await dir.getDirectoryHandle(parts[0]!, { create: true });
  await walkWrite(next, parts.slice(1), data);
}

async function walkRead(dir: FileSystemDirectoryHandle, parts: string[]): Promise<Uint8Array | undefined> {
  try {
    if (parts.length === 1) {
      const file = await dir.getFileHandle(parts[0]!);
      const blob = await file.getFile();
      return new Uint8Array(await blob.arrayBuffer());
    }
    const next = await dir.getDirectoryHandle(parts[0]!);
    return walkRead(next, parts.slice(1));
  } catch {
    return undefined;
  }
}

async function walkDelete(dir: FileSystemDirectoryHandle, parts: string[]): Promise<void> {
  try {
    if (parts.length === 1) {
      await dir.removeEntry(parts[0]!);
      return;
    }
    const next = await dir.getDirectoryHandle(parts[0]!);
    await walkDelete(next, parts.slice(1));
  } catch {
    // missing is fine
  }
}

async function collectKeys(dir: FileSystemDirectoryHandle, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  const walker = async (current: FileSystemDirectoryHandle, base: string) => {
    for await (const [name, handle] of current.entries()) {
      const path = base ? `${base}/${name}` : name;
      if (handle.kind === 'file') keys.push(path);
      else if (handle.kind === 'directory') await walker(handle as FileSystemDirectoryHandle, path);
    }
  };
  await walker(dir, '');
  return keys.filter((key) => key.startsWith(prefix));
}

export function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
}

/** OPFS-backed blob store rooted at `/<root>/` (history: `history`, workspace: `sessions`). */
export function opfsBlobStore(root = 'history'): HistoryBlobStore {
  return {
    async write(key, data) {
      await walkWrite(await rootDir(root), key.split('/'), data);
    },
    async read(key) {
      return walkRead(await rootDir(root), key.split('/'));
    },
    async delete(key) {
      await walkDelete(await rootDir(root), key.split('/'));
    },
    async list(prefix = '') {
      return collectKeys(await rootDir(root), prefix);
    },
    async clear() {
      const top = await navigator.storage.getDirectory();
      try {
        await top.removeEntry(root, { recursive: true });
      } catch {
        // ignore
      }
    },
  };
}

/** Remove a whole subtree (`sessions/<id>`) — cheaper than deleting keys one by one. */
export async function opfsRemoveTree(root: string, sub: string): Promise<void> {
  try {
    const dir = await rootDir(root);
    await dir.removeEntry(sub, { recursive: true });
  } catch {
    // missing is fine
  }
}
