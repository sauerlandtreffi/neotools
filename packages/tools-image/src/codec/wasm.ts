/** Load a same-origin or package WASM file. Never uses a CDN. */

export function asBufferSource(bytes: Uint8Array | Uint8ClampedArray): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

export function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

export function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' || typeof OffscreenCanvas !== 'undefined';
}

export async function readPackageFile(specifier: string): Promise<Uint8Array | null> {
  if (!isNodeRuntime()) return null;
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { createRequire } = await import('node:module');
  const { dirname, join } = await import('node:path');
  const req = createRequire(import.meta.url);
  const candidates: string[] = [];
  try {
    const resolved = import.meta.resolve(specifier);
    candidates.push(resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved);
  } catch {
    // vitest / missing exports
  }
  try {
    candidates.push(req.resolve(specifier));
  } catch {
    // next
  }
  const slash = specifier.indexOf('/');
  if (slash > 0 && specifier.startsWith('@')) {
    const rest = specifier.indexOf('/', slash + 1);
    if (rest > 0) {
      const pkg = specifier.slice(0, rest);
      const rel = specifier.slice(rest + 1);
      try {
        candidates.push(join(dirname(req.resolve(`${pkg}/package.json`)), rel));
      } catch {
        // next
      }
    }
  }
  for (const path of candidates) {
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      // next
    }
  }
  return null;
}

export async function fetchSameOrigin(path: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(path)) {
    throw new Error(`Remote-/CDN-URL verboten: ${path}`);
  }
  const url = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Asset nicht gefunden (${res.status}): ${url}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadWasmBytes(opts: { specifier: string; publicPath: string }): Promise<Uint8Array> {
  const fromPkg = await readPackageFile(opts.specifier);
  if (fromPkg) return fromPkg;
  if (isNodeRuntime()) {
    throw new Error(`WASM nicht im Paket gefunden: ${opts.specifier}`);
  }
  return fetchSameOrigin(opts.publicPath);
}

export async function compileWasm(specifier: string, publicPath: string): Promise<WebAssembly.Module> {
  const bytes = await loadWasmBytes({ specifier, publicPath });
  return WebAssembly.compile(asBufferSource(bytes));
}

const ready = new Map<string, Promise<void>>();

export function once(key: string, fn: () => Promise<void>): Promise<void> {
  let p = ready.get(key);
  if (!p) {
    p = fn();
    ready.set(key, p);
  }
  return p;
}
