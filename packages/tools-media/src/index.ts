import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { audioTools } from './audio/tools.js';
import { videoTools } from './video/tools.js';

export const mediaTools: ToolDefinition[] = [...videoTools, ...audioTools];

export function registerMediaTools(registry: Registry): Registry {
  for (const tool of mediaTools) registry.register(tool);
  return registry;
}

export function createMediaRegistry(): Registry {
  return registerMediaTools(new Registry());
}

export {
  MEDIA_LICENSES,
  FFMPEG_CORE_LICENSE,
  FFMPEG_CORE_LICENSE_LGPL,
  FFMPEG_CORE_LICENSE_GPL,
  getFfmpegCoreFlavor,
  getFfmpegCoreLicense,
  refreshMediaLicenses,
} from './licenses.js';
export { definePresetTool } from './presets/define-preset-tool.js';
export type { DefinePresetToolSpec, PresetIo } from './presets/define-preset-tool.js';
export { BACKLOG_PRESET_IDS } from './presets/args.js';
export * as mediaPresetArgs from './presets/args.js';
export { extractAudio, probe, runFfmpeg, requireOutput, ffmpegAvailable, lavfiAudio, lavfiVideo, SKIP_NO_FFMPEG, loadSubtitleFont } from './ffmpeg/index.js';
export type { ExtractAudioOptions, ProbeResult, ProbeStream } from './ffmpeg/index.js';
export { analyzeKeyBpm, syntheticClickWav } from './analysis/key-bpm.js';
export { VIDEO_ACCEPT, AUDIO_ACCEPT, MEDIA_ACCEPT, SUBTITLE_ACCEPT, IMAGE_OVERLAY_ACCEPT } from './accept.js';
export { inputAlias, mimeForExt, extOf, outName, atempoChain } from './names.js';
export { applyVideoCutlist, parseKeepJson, parseKeepOption, expectedKeepDuration } from './video/cutlist.js';
export { parseDetectLog, parseCueSheet, parseSrtWindows } from './ffmpeg/parse-filters.js';

