import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyTeamPresets, getAppliedPresets, type Registry } from '@neotools/engine';
import { branding } from './branding';

export function loadTeamPresetsJson(): unknown | undefined {
  const candidates = [
    branding.presetsPath,
    process.env.NEOTOOLS_PRESETS,
    resolve(process.cwd(), '../../presets.json'),
    resolve(process.cwd(), 'public/presets.json'),
    resolve(process.cwd(), 'presets.json'),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      if (!existsSync(file) && !file.endsWith('.json')) continue;
      return JSON.parse(readFileSync(file, 'utf8')) as unknown;
    } catch {
      // next
    }
  }
  return undefined;
}

export function applyBrandingPresets(registry: Registry): Registry {
  const doc = loadTeamPresetsJson();
  if (!doc) return registry;
  try {
    const body =
      doc && typeof doc === 'object' && 'signature' in doc
        ? (() => {
            const { signature: _s, sig: _s2, ...rest } = doc as Record<string, unknown>;
            return rest;
          })()
        : doc;
    return applyTeamPresets(registry, body);
  } catch {
    return registry;
  }
}

export { getAppliedPresets };
