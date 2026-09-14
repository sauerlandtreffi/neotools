import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
];

export async function loadSubtitleFont(): Promise<{ name: string; data: Uint8Array } | null> {
  if (typeof process !== 'undefined' && process.versions?.node) {
    for (const path of CANDIDATES) {
      try {
        const data = new Uint8Array(await readFile(path));
        return { name: path.split('/').pop() ?? 'font.ttf', data };
      } catch {
        // try next
      }
    }
    try {
      const here = fileURLToPath(new URL('.', import.meta.url));
      const otf = join(here, '../../../tools-image/assets/fonts/SourceSans3-Regular.otf');
      const data = new Uint8Array(await readFile(otf));
      return { name: 'SourceSans3-Regular.otf', data };
    } catch {
      // browser / missing
    }
  }
  try {
    if (typeof fetch === 'function') {
      const res = await fetch('/assets/fonts/SourceSans3-Regular.otf');
      if (res.ok) {
        return { name: 'SourceSans3-Regular.otf', data: new Uint8Array(await res.arrayBuffer()) };
      }
    }
  } catch {
    // offline
  }
  return null;
}
