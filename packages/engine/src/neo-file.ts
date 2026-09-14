import { MIME } from './types.js';
import type { NeoFile } from './types.js';

const EXT_MIME: Record<string, string> = {
  '.pdf': MIME.pdf,
  '.png': MIME.png,
  '.jpg': MIME.jpeg,
  '.jpeg': MIME.jpeg,
  '.txt': MIME.txt,
  '.json': MIME.json,
  '.webp': 'image/webp',
};

export function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return EXT_MIME[lower.slice(dot)] ?? 'application/octet-stream';
}

export function neoFileFromBytes(
  name: string,
  data: Uint8Array,
  mime = mimeFromName(name),
): NeoFile {
  const copy = data;
  return {
    name,
    mime,
    size: copy.byteLength,
    async bytes() {
      return copy;
    },
  };
}

export async function neoFileFromPath(path: string): Promise<NeoFile> {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const buf = await readFile(path);
  return neoFileFromBytes(basename(path), new Uint8Array(buf));
}

export async function writeNeoFile(file: NeoFile, destPath: string): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, await file.bytes());
}

export function transferFiles(
  files: Array<{ name: string; mime: string; data: Uint8Array }>,
): NeoFile[] {
  return files.map((f) => neoFileFromBytes(f.name, f.data, f.mime));
}
