import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import { forensicsIdentify } from './tools/forensics-identify.js';
import { forensicsFakeExt } from './tools/forensics-fake-ext.js';
import { forensicsHash } from './tools/forensics-hash.js';
import { forensicsBytesCompare } from './tools/forensics-bytes-compare.js';
import { forensicsAutopsy } from './tools/forensics-autopsy.js';
import { forensicsHiddenData } from './tools/forensics-hidden-data.js';
import { forensicsShareSafe } from './tools/forensics-share-safe.js';
import { forensicsFingerprint } from './tools/forensics-fingerprint.js';
import { forensicsWatermarkFind } from './tools/forensics-watermark-find.js';
import { forensicsProvenance } from './tools/forensics-provenance.js';

export const forensicsTools: ToolDefinition[] = [
  forensicsIdentify,
  forensicsAutopsy,
  forensicsBytesCompare,
  forensicsHash,
  forensicsHiddenData,
  forensicsFakeExt,
  forensicsShareSafe,
  forensicsFingerprint,
  forensicsWatermarkFind,
  forensicsProvenance,
];

/**
 * Workspace hints (FRONTEND-REDESIGN §2.15 A): all forensics tools are
 * report-only inspections and never replace the document bytes.
 */
const FORENSICS_WORKSPACE_PRIORITY: Record<string, number> = {
  'forensics-share-safe': 75,
  'forensics-hidden-data': 400,
  'forensics-identify': 410,
  'forensics-autopsy': 420,
  'forensics-hash': 430,
  'forensics-fake-ext': 440,
  'forensics-fingerprint': 450,
  'forensics-watermark-find': 460,
  'forensics-provenance': 470,
  'forensics-bytes-compare': 480,
};

for (const tool of forensicsTools) {
  if (tool.workspace) continue;
  tool.workspace = {
    family: ['pdf', 'image', 'media', 'office', 'archive', 'data'],
    verb: tool.id === 'forensics-bytes-compare' ? 'compare' : 'inspect',
    priority: FORENSICS_WORKSPACE_PRIORITY[tool.id] ?? 1000,
    ...(tool.id === 'forensics-bytes-compare' ? { multiFile: true, requires: ['fileIds'] as const } : {}),
  };
}

export function registerForensicsTools(registry: Registry): Registry {
  for (const tool of forensicsTools) registry.register(tool);
  return registry;
}

export function createForensicsRegistry(): Registry {
  return registerForensicsTools(new Registry());
}

export {
  forensicsIdentify,
  forensicsAutopsy,
  forensicsBytesCompare,
  forensicsHash,
  forensicsHiddenData,
  forensicsFakeExt,
  forensicsShareSafe,
  forensicsFingerprint,
  forensicsWatermarkFind,
  forensicsProvenance,
};

export { assessExtension } from './identify/fake-ext.js';
export type { ExtensionAssessment, Severity } from './identify/fake-ext.js';
export { identifyBytes, identifyFile } from './identify/identify.js';
export type { Identification } from './identify/identify.js';
export { FORMAT_CATALOG, formatCatalogCount } from './identify/signatures.js';
export { scanHiddenData } from './hidden/hidden.js';
export { autopsyBytes } from './autopsy/autopsy.js';
export { parseJpeg } from './parsers/jpeg.js';
export { parsePng, decodePngRgba } from './parsers/png.js';
export { parseTiff } from './parsers/tiff.js';
export { parseIsoBmff } from './parsers/isobmff.js';
export { parseOffice } from './parsers/office.js';
export { FORENSICS_LICENSES } from './licenses.js';
