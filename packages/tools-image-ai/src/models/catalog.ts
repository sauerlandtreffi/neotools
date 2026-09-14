import catalogJson from './models.json' with { type: 'json' };
import { modelRegistrySchema, type ModelEntry, type ModelRegistry } from './schema.js';

export const MODEL_REGISTRY: ModelRegistry = modelRegistrySchema.parse(catalogJson);

export function listModels(): readonly ModelEntry[] {
  return MODEL_REGISTRY.models;
}

export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.models.find((m) => m.id === id);
}

export function modelsForTool(toolId: string): ModelEntry[] {
  return MODEL_REGISTRY.models.filter((m) => m.tools.includes(toolId));
}

export function modelConfirmMessage(entry: ModelEntry, locale: 'de' | 'en' = 'de'): string {
  const mb = Math.max(1, Math.round(entry.sizeBytes / 1_000_000));
  if (locale === 'en') {
    return `Load model ${entry.id} (${mb} MB, ${entry.license})? One-time cache.`;
  }
  return `Modell ${entry.id} ${mb} MB laden? (${entry.license}) — einmalige Bestätigung, dann Cache.`;
}

export function forbiddenLicense(license: string): boolean {
  const u = license.toUpperCase();
  return u.includes('AGPL') || u.includes('CC-BY-NC') || u.includes('NON-COMMERCIAL') || u.includes('NC-SA');
}
