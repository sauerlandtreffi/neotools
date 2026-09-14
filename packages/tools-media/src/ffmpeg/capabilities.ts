import type { NeoFile, Platform, ToolContext } from '@neotools/engine';
import type { MediaCapabilities } from './types.js';

const MOBILE_WARN_BYTES = 500 * 1024 * 1024;
const WASM_WARN_BYTES = 256 * 1024 * 1024;

let nativeCached: boolean | null = null;

function nativeDisabledByEnv(): boolean {
  if (typeof process === 'undefined') return false;
  const raw = process.env.NEOTOOLS_FFMPEG_NATIVE;
  return raw === '0' || raw === 'false';
}

export function resetNativeFfmpegCache(): void {
  nativeCached = null;
}

export async function hasNativeFfmpeg(): Promise<boolean> {
  if (nativeDisabledByEnv()) return false;
  if (nativeCached !== null) return nativeCached;
  if (typeof process === 'undefined' || !process.versions?.node) {
    nativeCached = false;
    return false;
  }
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('ffmpeg', ['-version'], { timeout: 8000 });
    nativeCached = true;
  } catch {
    nativeCached = false;
  }
  return nativeCached;
}

export function canUseMultiThreadCore(): boolean {
  // COEP is credentialless in Web/nginx; Chrome may still report
  // crossOriginIsolated, but the MT pthread worker then fails to fetch.
  // Single-thread core is the supported browser path.
  return false;
}

export function webcodecsH264Supported(): boolean {
  return typeof globalThis.VideoEncoder === 'function' && typeof globalThis.VideoFrame === 'function';
}

export async function mediaCapabilities(platform?: Platform): Promise<MediaCapabilities> {
  const native = platform?.capabilities.ffmpegNative ?? (await hasNativeFfmpeg());
  return {
    native,
    wasm: true,
    webcodecsH264: platform?.capabilities.webcodecs ?? webcodecsH264Supported(),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: typeof globalThis.crossOriginIsolated === 'boolean' && globalThis.crossOriginIsolated,
    ffmpegNative: native,
  };
}

export function largeFileWarnings(files: readonly NeoFile[], ctx?: ToolContext, wasm = false): string[] {
  const warnings: string[] = [];
  for (const file of files) {
    if (file.size > MOBILE_WARN_BYTES) {
      const msg = `${file.name}: ${Math.round(file.size / 1024 / 1024)} MB — auf Mobilgeräten vor Verarbeitung > 500 MB prüfen (Speicher/Akku).`;
      warnings.push(msg);
      ctx?.log('warn', msg);
    }
    if (wasm && file.size > WASM_WARN_BYTES) {
      const msg = `${file.name}: WASM-FS/Memory begrenzt; OPFS/WORKERFS nur wo der Core es erlaubt, sonst Limit.`;
      warnings.push(msg);
      ctx?.log('warn', msg);
    }
  }
  return warnings;
}

export const SKIP_NO_FFMPEG =
  'Kein FFmpeg lauffähig (weder System-Binary im PATH noch WASM-Core). apt-get install -y ffmpeg oder scripts/copy-wasm-assets.mjs.';
