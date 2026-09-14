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

export { MEDIA_LICENSES, FFMPEG_CORE_LICENSE } from './licenses.js';
export { definePresetTool } from './presets/define-preset-tool.js';
export type { DefinePresetToolSpec, PresetIo } from './presets/define-preset-tool.js';
export { BACKLOG_PRESET_IDS } from './presets/args.js';
export * as mediaPresetArgs from './presets/args.js';
export { extractAudio, probe, runFfmpeg, ffmpegAvailable, lavfiAudio, lavfiVideo, SKIP_NO_FFMPEG } from './ffmpeg/index.js';
export type { ExtractAudioOptions, ProbeResult, ProbeStream } from './ffmpeg/index.js';
export { analyzeKeyBpm, syntheticClickWav } from './analysis/key-bpm.js';
export { VIDEO_ACCEPT, AUDIO_ACCEPT, MEDIA_ACCEPT } from './accept.js';
