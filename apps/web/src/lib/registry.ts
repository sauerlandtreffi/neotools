import { collectLicenses } from '@neotools/engine';
import { createPdfRegistry } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';
import { registerImageAiTools } from '@neotools/tools-image-ai';
import { registerImageTools } from '@neotools/tools-image';
import { registerDachTools } from '@neotools/tools-dach';
import { registerSpeechTools } from '@neotools/tools-speech';
import { registerOfficeTools } from '@neotools/tools-office';
import { registerMediaTools } from '@neotools/tools-media';
import { registerArchiveTools } from '@neotools/tools-archive';
import { branding } from './branding';
import { applyBrandingPresets } from './team-presets';

const baseRegistry = registerArchiveTools(registerMediaTools(registerOfficeTools(registerSpeechTools(registerDachTools(registerImageTools(registerImageAiTools(registerForensicsTools(createPdfRegistry()))))))));
export const registry = applyBrandingPresets(baseRegistry);

/** Snapshot of tools registered at import time. Prefer `registry.list()` so later pack appends are visible. */
export const tools = registry.list();

export const licenses = collectLicenses(registry);

export function toolPaths() {
  const hidden = new Set(branding.hiddenTools);
  return registry
    .list()
    .filter((tool) => !hidden.has(tool.id) && tool.id !== 'audio-stems')
    .map((tool) => ({ params: { toolId: tool.id } }));
}
