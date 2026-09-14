import { collectLicenses } from '@neotools/engine';
import { createPdfRegistry } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';
import { registerImageAiTools } from '@neotools/tools-image-ai';
import { registerImageTools } from '@neotools/tools-image';
import { registerDachTools } from '@neotools/tools-dach';
import { registerSpeechTools } from '@neotools/tools-speech';
import { branding } from './branding';

export const registry = registerSpeechTools(registerDachTools(registerImageTools(registerImageAiTools(registerForensicsTools(createPdfRegistry())))));

/** Snapshot of tools registered at import time. Prefer `registry.list()` so later pack appends are visible. */
export const tools = registry.list();

export const licenses = collectLicenses(registry);

export function toolPaths() {
  const hidden = new Set(branding.hiddenTools);
  return registry.list()
    .filter((tool) => !hidden.has(tool.id))
    .map((tool) => ({ params: { toolId: tool.id } }));
}
