import type { Platform, ToolContext } from '@neotools/engine';
import { throwIfAborted } from '@neotools/engine';
import { pathToFileURL } from 'node:url';
import { canUseMultiThreadCore } from './capabilities.js';
import { lgplVendorFiles, setFfmpegCoreFlavor, type FfmpegCoreFlavor } from './core-flavor.js';
import { refreshMediaLicenses } from '../licenses.js';
import { createProgressSink } from './progress.js';
import type { FfmpegRunRequest, FfmpegRunResult } from './types.js';

type FfmpegInstance = {
  loaded: boolean;
  load: (opts: { coreURL: string; wasmURL: string; workerURL?: string; classWorkerURL?: string }) => Promise<void>;
  writeFile: (name: string, data: Uint8Array) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  exec: (args: string[]) => Promise<number>;
  terminate: () => Promise<void> | void;
  on: (ev: 'log' | 'progress', fn: (data: { message?: string; progress?: number; time?: number }) => void) => void;
};

type FfmpegCore = {
  FS: {
    writeFile: (name: string, data: Uint8Array) => void;
    readFile: (name: string, opts?: { encoding?: string }) => Uint8Array | string;
  };
  exec: (...args: string[]) => void;
  ret: number;
  reset: () => void;
  setLogger: (fn: (data: { message?: string }) => void) => void;
  setProgress: (fn: (data: { progress?: number; time?: number }) => void) => void;
  setTimeout: (ms: number) => void;
};

type CreateFfmpegCore = (opts: {
  wasmBinary?: ArrayBuffer | Uint8Array;
  mainScriptUrlOrBlob?: string;
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<FfmpegCore>;

const CACHE = 'neotools-ffmpeg-v1';
let instance: FfmpegInstance | null = null;
let loading: Promise<FfmpegInstance> | null = null;
let coreBlobUrl: string | null = null;

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node) &&
    typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'undefined'
  );
}

function ffmpegBase(platform?: Platform): string {
  const raw = platform?.assets?.ffmpegBase ?? '/assets/ffmpeg';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function markFlavor(flavor: FfmpegCoreFlavor): void {
  setFfmpegCoreFlavor(flavor);
  refreshMediaLicenses();
}

async function fetchWithProgress(url: string, ctx?: ToolContext, label = 'FFmpeg-Core'): Promise<Uint8Array> {
  // Skip Cache API for FFmpeg cores: cloning a 30 MB body under memory pressure
  // surfaces as TypeError: Failed to fetch in dedicated workers.
  const useCache = typeof caches !== 'undefined' && !url.includes('/ffmpeg');
  if (useCache) {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
      const bytes = await download(url, ctx, label);
      await cache.put(url, new Response(bytes.slice().buffer));
      return bytes;
    } catch {
      // fall through
    }
  }
  if (isNodeRuntime() && url.startsWith('file:')) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    return new Uint8Array(await readFile(fileURLToPath(url)));
  }
  return download(url, ctx, label);
}

async function download(url: string, ctx?: ToolContext, label = 'FFmpeg-Core'): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} nicht geladen (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      ctx?.progress(Math.min(0.2, (received / total) * 0.2), `${label} ${Math.round((received / total) * 100)}%`);
    }
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function urlOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

function resolveLgplVendor(): { coreURL: string; wasmURL: string } | null {
  if (!isNodeRuntime()) return null;
  const files = lgplVendorFiles();
  if (!files) return null;
  return { coreURL: pathToFileURL(files.js).href, wasmURL: pathToFileURL(files.wasm).href };
}

async function resolveNodeCore(mt: boolean): Promise<{ coreURL: string; wasmURL: string; workerURL?: string; flavor: FfmpegCoreFlavor } | null> {
  if (!isNodeRuntime()) return null;
  const lgpl = resolveLgplVendor();
  if (lgpl) return { ...lgpl, flavor: 'lgpl' };
  try {
    const { createRequire } = await import('node:module');
    const { pathToFileURL } = await import('node:url');
    const req = createRequire(import.meta.url);
    const spec = mt ? '@ffmpeg/core-mt' : '@ffmpeg/core';
    const core = req.resolve(spec);
    const wasm = core.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.wasm');
    const out: { coreURL: string; wasmURL: string; workerURL?: string; flavor: FfmpegCoreFlavor } = {
      coreURL: pathToFileURL(core).href,
      wasmURL: pathToFileURL(wasm).href,
      flavor: 'gpl',
    };
    if (mt) {
      out.workerURL = pathToFileURL(core.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.worker.js')).href;
    }
    return out;
  } catch {
    return null;
  }
}

function wrapInProcessCore(core: FfmpegCore): FfmpegInstance {
  const logCbs: Array<(data: { message?: string; progress?: number; time?: number }) => void> = [];
  const progCbs: Array<(data: { message?: string; progress?: number; time?: number }) => void> = [];
  core.setLogger((data) => {
    for (const fn of logCbs) fn(data);
  });
  core.setProgress((data) => {
    for (const fn of progCbs) fn(data);
  });
  return {
    loaded: true,
    load: async () => undefined,
    writeFile: async (name, data) => {
      core.FS.writeFile(name, data);
    },
    readFile: async (name) => core.FS.readFile(name),
    exec: async (args) => {
      core.setTimeout(-1);
      core.exec(...args);
      const code = core.ret;
      core.reset();
      return code;
    },
    terminate: () => {
      if (coreBlobUrl) {
        URL.revokeObjectURL(coreBlobUrl);
        coreBlobUrl = null;
      }
    },
    on: (ev, fn) => {
      if (ev === 'log') logCbs.push(fn);
      else progCbs.push(fn);
    },
  };
}

async function createInProcess(coreURL: string, wasmURL: string, locatePrefix: string, ctx?: ToolContext): Promise<FfmpegInstance> {
  ctx?.progress(0.04, 'FFmpeg-Core laden');
  const wasmBytes = await fetchWithProgress(wasmURL, ctx, 'ffmpeg-core.wasm');
  let create: CreateFfmpegCore | undefined;
  let scriptUrl = coreURL;
  if (coreURL.startsWith('file:') || isNodeRuntime()) {
    const imported = (await import(/* @vite-ignore */ coreURL)) as { default: CreateFfmpegCore };
    create = imported.default;
  } else {
    const jsBytes = await fetchWithProgress(coreURL, ctx, 'ffmpeg-core.js');
    const jsCopy = Uint8Array.from(jsBytes);
    const blob = new Blob([jsCopy], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    coreBlobUrl = blobUrl;
    scriptUrl = blobUrl;
    const imported = (await import(/* @vite-ignore */ blobUrl)) as { default: CreateFfmpegCore };
    create = imported.default;
  }
  if (typeof create !== 'function') {
    throw new Error('ffmpeg-core.js: default export fehlt (ESM-Core erwartet).');
  }
  const wasmCopy = Uint8Array.from(wasmBytes);
  const wasmBinary = wasmCopy.buffer.slice(wasmCopy.byteOffset, wasmCopy.byteOffset + wasmCopy.byteLength);
  const spec = `${scriptUrl}#${btoa(JSON.stringify({ wasmURL, workerURL: '' }))}`;
  const core = await create({
    wasmBinary,
    mainScriptUrlOrBlob: spec,
    locateFile: (path) => (path.endsWith('.wasm') ? wasmURL : `${locatePrefix.replace(/\/$/, '')}/${path}`),
  });
  return wrapInProcessCore(core);
}

async function resolveBrowserCore(origin: string, base: string): Promise<{ coreAbs: string; wasmAbs: string; flavor: FfmpegCoreFlavor; prefix: string }> {
  const lgplPrefix = `${origin}${base}/lgpl`;
  if (await urlOk(`${lgplPrefix}/BUILD-INFO.json`) || await urlOk(`${lgplPrefix}/ffmpeg-core.js`)) {
    return {
      coreAbs: `${lgplPrefix}/ffmpeg-core.js`,
      wasmAbs: `${lgplPrefix}/ffmpeg-core.wasm`,
      flavor: 'lgpl',
      prefix: lgplPrefix,
    };
  }
  for (const flavorUrl of [`${origin}${base}/core-flavor.json`, `${origin}${base}/BUILD-INFO.json`]) {
    try {
      const res = await fetch(flavorUrl);
      if (!res.ok) continue;
      const text = await res.text();
      const json = JSON.parse(text) as { flavor?: string; license?: string };
      if (json.flavor === 'lgpl' || /LGPL/i.test(json.license ?? '')) {
        return {
          coreAbs: `${origin}${base}/ffmpeg-core.js`,
          wasmAbs: `${origin}${base}/ffmpeg-core.wasm`,
          flavor: 'lgpl',
          prefix: `${origin}${base}`,
        };
      }
    } catch {
      // try next marker
    }
  }
  return {
    coreAbs: `${origin}${base}/ffmpeg-core.js`,
    wasmAbs: `${origin}${base}/ffmpeg-core.wasm`,
    flavor: 'gpl',
    prefix: `${origin}${base}`,
  };
}

async function loadBrowserCore(ctx?: ToolContext, platform?: Platform): Promise<FfmpegInstance> {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const base = ffmpegBase(platform);
  const resolved = await resolveBrowserCore(origin, base);
  markFlavor(resolved.flavor);
  return createInProcess(resolved.coreAbs, resolved.wasmAbs, resolved.prefix, ctx);
}

export async function loadWasmFfmpeg(ctx?: ToolContext, platform?: Platform): Promise<FfmpegInstance> {
  if (instance?.loaded) return instance;
  if (loading) return loading;
  loading = (async () => {
    if (!isNodeRuntime()) {
      const ffmpeg = await loadBrowserCore(ctx, platform);
      instance = ffmpeg;
      return ffmpeg;
    }
    const mt = canUseMultiThreadCore();
    const urls = await resolveNodeCore(mt);
    if (!urls) {
      throw new Error('Kein FFmpeg-WASM-Core (Node): @ffmpeg/core oder vendor/ffmpeg-lgpl.');
    }
    markFlavor(urls.flavor);
    try {
      const ffmpeg = await createInProcess(urls.coreURL, urls.wasmURL, urls.coreURL.replace(/\/[^/]+$/, ''), ctx);
      instance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ffmpeg = new FFmpeg() as unknown as FfmpegInstance;
      await ffmpeg.load(urls);
      instance = ffmpeg;
      if (err instanceof Error) {
        ctx?.log('warn', `in-process WASM-Core fehlgeschlagen, Worker: ${err.message}`);
      }
      return ffmpeg;
    }
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export async function terminateWasm(): Promise<void> {
  if (!instance) return;
  try {
    await instance.terminate();
  } catch {
    // ignore
  }
  instance = null;
}

export async function runWasmFfmpeg(ctx: ToolContext | undefined, req: FfmpegRunRequest): Promise<FfmpegRunResult> {
  const ffmpeg = await loadWasmFfmpeg(ctx, ctx?.platform);
  const logs: string[] = [];
  const onProgress = createProgressSink(ctx, req.durationHint);
  const logFn = (ev: { message?: string }) => {
    if (ev.message) {
      logs.push(ev.message);
      onProgress(ev.message);
    }
  };
  const progFn = (ev: { progress?: number }) => {
    if (typeof ev.progress === 'number') ctx?.progress(Math.min(0.99, ev.progress), 'ffmpeg.wasm');
  };
  ffmpeg.on('log', logFn);
  ffmpeg.on('progress', progFn);
  const abort = () => {
    void terminateWasm();
  };
  ctx?.signal.addEventListener('abort', abort, { once: true });
  try {
    for (const input of req.inputs) {
      await ffmpeg.writeFile(input.name, input.data);
    }
    if (req.cwdExtra) {
      for (const [name, data] of Object.entries(req.cwdExtra)) {
        await ffmpeg.writeFile(name, data);
      }
    }
    throwIfAborted(ctx?.signal ?? new AbortController().signal);
    const code = await ffmpeg.exec(['-y', '-hide_banner', ...req.args]);
    if (code !== 0 && req.outputs.length) {
      throw new Error(`FFmpeg-WASM Code ${code}.\n${logs.join('\n').slice(-4000)}`);
    }
    const files: Record<string, Uint8Array> = {};
    for (const name of req.outputs) {
      try {
        const data = await ffmpeg.readFile(name);
        files[name] = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      } catch {
        // missing
      }
    }
    return { files, log: logs.join('\n'), backend: 'wasm' };
  } finally {
    ctx?.signal.removeEventListener('abort', abort);
  }
}
