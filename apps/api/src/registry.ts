import { applyTeamPresets, type Registry } from '@neotools/engine';
import { createPdfRegistry } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';
import { registerImageAiTools } from '@neotools/tools-image-ai';
import { registerImageTools } from '@neotools/tools-image';
import { registerDachTools } from '@neotools/tools-dach';
import { registerOptionalPacks } from './optional-packs.js';

export function createBaseRegistry(): Registry {
  return registerDachTools(
    registerImageTools(registerImageAiTools(registerForensicsTools(createPdfRegistry()))),
  );
}

export async function createApiRegistry(presets?: unknown): Promise<Registry> {
  let registry = await registerOptionalPacks(createBaseRegistry());
  if (presets && typeof presets === 'object') {
    try {
      registry = applyTeamPresets(registry, presets);
    } catch {
      // Invalid team presets — serve unlocked registry.
    }
  }
  return registry;
}
