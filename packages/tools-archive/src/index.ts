import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { archiveCreate } from './tools/archive-create.js';
import { archiveExtract } from './tools/archive-extract.js';
import { archiveInspect } from './tools/archive-inspect.js';
import { archiveExtractSelected } from './tools/archive-extract-selected.js';
import { archiveTest } from './tools/archive-test.js';
import { archiveConvert } from './tools/archive-convert.js';
import { filesCameraDump } from './tools/files-camera-dump.js';
import { filesDuplicates } from './tools/files-duplicates.js';
import { filesSpaceRadar } from './tools/files-space-radar.js';
import { filesCompareFolders } from './tools/files-compare-folders.js';
import { filesChecksum } from './tools/files-checksum.js';

export const archiveTools: ToolDefinition[] = [
  archiveCreate,
  archiveExtract,
  archiveInspect,
  archiveExtractSelected,
  archiveTest,
  archiveConvert,
  filesCameraDump,
  filesDuplicates,
  filesSpaceRadar,
  filesCompareFolders,
  filesChecksum,
];

export function registerArchiveTools(registry: Registry): Registry {
  for (const tool of archiveTools) registry.register(tool);
  return registry;
}

export function createArchiveRegistry(): Registry {
  return registerArchiveTools(new Registry());
}

export { ARCHIVE_LICENSES, ARCHIVE_CATEGORY } from './licenses.js';
export { createZip, readZip, createTar, readTar } from './zip-tar.js';
export { safeRelPath } from './path-safe.js';
export { sidecarGroups } from './camera.js';
