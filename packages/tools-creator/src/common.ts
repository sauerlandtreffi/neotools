import {
  attachProvenance,
  createProvenance,
  type NeoFile,
  type ToolResult,
} from '@neotools/engine';
import { CREATOR_LICENSES } from './licenses.js';

export { CREATOR_LICENSES };

export async function wrap(
  id: string,
  files: readonly NeoFile[],
  outputs: NeoFile[],
  opts: unknown,
  report: Record<string, unknown> = {},
  warnings: string[] = [],
): Promise<ToolResult> {
  const provenance = await createProvenance(id, opts, [...files]);
  return { outputs, warnings, report: attachProvenance(report, provenance) };
}

export const IMAGE_VIDEO_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
];

export const IMAGE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
];

export const AUDIO_ACCEPT = [
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.flac',
];
