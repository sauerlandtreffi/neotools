import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_REGISTRY, forbiddenLicense, listModels } from '../src/models/catalog.js';
import { modelRegistrySchema } from '../src/models/schema.js';

describe('model registry schema', () => {
  it('parses models.json and rejects AGPL / NC entries', () => {
    const raw = readFileSync(fileURLToPath(new URL('../src/models/models.json', import.meta.url)), 'utf8');
    const parsed = modelRegistrySchema.parse(JSON.parse(raw));
    expect(parsed.version).toBe(1);
    expect(parsed.models.length).toBeGreaterThan(3);
    expect(MODEL_REGISTRY.models.length).toBe(parsed.models.length);
    for (const m of listModels()) {
      expect(forbiddenLicense(m.license)).toBe(false);
      expect(m.url.startsWith('https://')).toBe(true);
      expect(m.localName.length).toBeGreaterThan(0);
      if (m.sha256) expect(m.sha256).toMatch(/^[a-f0-9]{64}$/i);
    }
    expect(listModels().some((m) => m.id === 'u2netp')).toBe(true);
    expect(listModels().some((m) => /rmbg|yolov8n-face|yolov8n-license/i.test(m.id + m.origin))).toBe(false);
  });
});
