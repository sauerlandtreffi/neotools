import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type FontRole = 'sans' | 'serif' | 'mono';
export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

export interface LoadedFace {
  role: FontRole;
  style: FontStyle;
  bytes: Uint8Array;
  name: string;
}

const STYLE_FILES: Record<FontStyle, string> = {
  regular: '400-normal',
  bold: '700-normal',
  italic: '400-italic',
  boldItalic: '700-italic',
};

const FAMILY: Record<FontRole, { pkg: string; file: string }> = {
  sans: { pkg: '@fontsource/source-sans-3', file: 'source-sans-3-latin' },
  serif: { pkg: '@fontsource/source-serif-4', file: 'source-serif-4-latin' },
  mono: { pkg: '@fontsource/source-code-pro', file: 'source-code-pro-latin' },
};

const cache = new Map<string, LoadedFace | null>();

function isNode(): boolean {
  return Boolean(typeof process === 'object' && process?.versions?.node);
}

async function tryRead(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

function localAssetDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return join(here, '../../assets/fonts');
}

async function fromFontsource(role: FontRole, style: FontStyle): Promise<Uint8Array | null> {
  const spec = FAMILY[role];
  const base = `${spec.file}-${STYLE_FILES[style]}`;
  const names = [`${base}.woff`, `${base}.woff2`];
  if (isNode()) {
    try {
      const req = createRequire(import.meta.url);
      const pkgJson = req.resolve(`${spec.pkg}/package.json`);
      const filesDir = join(dirname(pkgJson), 'files');
      for (const name of names) {
        const bytes = await tryRead(join(filesDir, name));
        if (bytes) return bytes;
      }
    } catch {
      // not installed
    }
  }
  const asset = localAssetDir();
  for (const name of names) {
    const bytes = await tryRead(join(asset, name));
    if (bytes) return bytes;
  }
  if (typeof fetch === 'function' && !isNode()) {
    for (const name of names) {
      try {
        const res = await fetch(`/assets/fonts/${name}`);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      } catch {
        // next
      }
    }
  }
  return null;
}

async function fromToolsImage(): Promise<Uint8Array | null> {
  if (!isNode()) {
    try {
      const res = await fetch('/assets/fonts/SourceSans3-Regular.otf');
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
    return null;
  }
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    join(here, '../../../tools-image/assets/fonts/SourceSans3-Regular.otf'),
    join(process.cwd(), 'packages/tools-image/assets/fonts/SourceSans3-Regular.otf'),
  ];
  for (const p of candidates) {
    const bytes = await tryRead(p);
    if (bytes) return bytes;
  }
  return null;
}

export async function loadFace(role: FontRole, style: FontStyle = 'regular'): Promise<LoadedFace | null> {
  const key = `${role}:${style}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let bytes = await fromFontsource(role, style);
  if (!bytes && role === 'sans' && style === 'regular') bytes = await fromToolsImage();
  if (!bytes && style !== 'regular') {
    const fallback = await loadFace(role, 'regular');
    cache.set(key, fallback);
    return fallback;
  }
  if (!bytes) {
    cache.set(key, null);
    return null;
  }
  const face: LoadedFace = { role, style, bytes, name: `${role}-${style}` };
  cache.set(key, face);
  return face;
}

export async function loadOfficeFonts(): Promise<{
  sans?: LoadedFace;
  serif?: LoadedFace;
  mono?: LoadedFace;
  faces: LoadedFace[];
}> {
  const roles: FontRole[] = ['sans', 'serif', 'mono'];
  const styles: FontStyle[] = ['regular', 'bold', 'italic', 'boldItalic'];
  const faces: LoadedFace[] = [];
  for (const role of roles) {
    for (const style of styles) {
      const face = await loadFace(role, style);
      if (face && !faces.some((f) => f.role === role && f.style === style)) faces.push(face);
    }
  }
  return {
    sans: faces.find((f) => f.role === 'sans' && f.style === 'regular'),
    serif: faces.find((f) => f.role === 'serif' && f.style === 'regular'),
    mono: faces.find((f) => f.role === 'mono' && f.style === 'regular'),
    faces,
  };
}

export function pickStyle(bold?: boolean, italic?: boolean): FontStyle {
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}
