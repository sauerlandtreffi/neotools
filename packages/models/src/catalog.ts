import { modelRegistrySchema, type ModelEntry, type ModelRegistry } from './schema.js';

const registered: ModelRegistry[] = [];

export function parseRegistry(json: unknown): ModelRegistry {
  return modelRegistrySchema.parse(json);
}

export function registerCatalog(registry: ModelRegistry): ModelRegistry {
  if (!registered.includes(registry)) registered.push(registry);
  return registry;
}

export function registeredCatalogs(): readonly ModelRegistry[] {
  return registered;
}

export function allRegisteredModels(): ModelEntry[] {
  const seen = new Set<string>();
  const out: ModelEntry[] = [];
  for (const catalog of registered) {
    for (const model of catalog.models) {
      if (seen.has(model.id)) continue;
      seen.add(model.id);
      out.push(model);
    }
  }
  return out;
}

export function getRegisteredModel(id: string): ModelEntry | undefined {
  return allRegisteredModels().find((m) => m.id === id);
}

export function registeredModelsForTool(toolId: string): ModelEntry[] {
  return allRegisteredModels().filter((m) => m.tools.includes(toolId) || m.id === toolId);
}

export function modelConfirmMessage(entry: ModelEntry, locale: 'de' | 'en' = 'de'): string {
  const mb = Math.max(1, Math.round(entry.sizeBytes / 1_000_000));
  const warn = entry.sizeWarning || entry.webgpuOnly;
  if (locale === 'en') {
    const extra = warn
      ? entry.webgpuOnly
        ? ' WebGPU only. Large download.'
        : ' Large download.'
      : '';
    return `Load model ${entry.id} (${mb} MB, ${entry.license})? One-time cache.${extra}`;
  }
  const extra = warn
    ? entry.webgpuOnly
      ? ' Nur WebGPU. Großer Download.'
      : ' Großer Download.'
    : '';
  return `Modell ${entry.id} ${mb} MB laden? (${entry.license}) — einmalige Bestätigung, dann Cache.${extra}`;
}

export function forbiddenLicense(license: string): boolean {
  const u = license.toUpperCase();
  return (
    u.includes('AGPL') ||
    u.includes('CC-BY-NC') ||
    u.includes('NON-COMMERCIAL') ||
    u.includes('NC-SA') ||
    /\bNC\b/.test(u)
  );
}

export function createCatalog(json: unknown): {
  MODEL_REGISTRY: ModelRegistry;
  listModels: () => readonly ModelEntry[];
  getModel: (id: string) => ModelEntry | undefined;
  modelsForTool: (toolId: string) => ModelEntry[];
  modelConfirmMessage: typeof modelConfirmMessage;
  forbiddenLicense: typeof forbiddenLicense;
} {
  const MODEL_REGISTRY = registerCatalog(parseRegistry(json));
  return {
    MODEL_REGISTRY,
    listModels: () => MODEL_REGISTRY.models,
    getModel: (id) => MODEL_REGISTRY.models.find((m) => m.id === id),
    modelsForTool: (toolId) => MODEL_REGISTRY.models.filter((m) => m.tools.includes(toolId) || m.id === toolId),
    modelConfirmMessage,
    forbiddenLicense,
  };
}
