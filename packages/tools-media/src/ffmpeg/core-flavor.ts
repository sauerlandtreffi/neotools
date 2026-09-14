import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FFMPEG_CORE_LICENSE_LGPL = 'LGPL-2.1-or-later (eigener Build)' as const;
export const FFMPEG_CORE_LICENSE_GPL = 'GPL-2.0-or-later (temporär)' as const;

export type FfmpegCoreFlavor = 'lgpl' | 'gpl';

let override: FfmpegCoreFlavor | null = null;

export function setFfmpegCoreFlavor(flavor: FfmpegCoreFlavor): void {
  override = flavor;
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node) &&
    typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'undefined'
  );
}

/** Package root of @neotools/tools-media (src/ or dist/). */
export function toolsMediaRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function lgplVendorFiles(): { dir: string; js: string; wasm: string; buildInfo: string } | null {
  if (!isNodeRuntime()) return null;
  const dir = join(toolsMediaRoot(), 'vendor/ffmpeg-lgpl');
  const js = join(dir, 'ffmpeg-core.js');
  const wasm = join(dir, 'ffmpeg-core.wasm');
  if (!existsSync(js) || !existsSync(wasm)) return null;
  return { dir, js, wasm, buildInfo: join(dir, 'BUILD-INFO.json') };
}

export function detectLgplVendor(): boolean {
  return lgplVendorFiles() !== null;
}

export function getFfmpegCoreFlavor(): FfmpegCoreFlavor {
  if (override) return override;
  if (typeof process !== 'undefined') {
    const forced = process.env.NEOTOOLS_FFMPEG_CORE;
    if (forced === 'lgpl') return 'lgpl';
    if (forced === 'gpl') return 'gpl';
  }
  if (detectLgplVendor()) return 'lgpl';
  return 'gpl';
}

export function getFfmpegCoreLicense(): typeof FFMPEG_CORE_LICENSE_LGPL | typeof FFMPEG_CORE_LICENSE_GPL {
  return getFfmpegCoreFlavor() === 'lgpl' ? FFMPEG_CORE_LICENSE_LGPL : FFMPEG_CORE_LICENSE_GPL;
}
