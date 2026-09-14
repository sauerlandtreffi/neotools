import { describe, expect, it } from 'vitest';
import { createCatalog, forbiddenLicense, parseRegistry } from '../src/catalog.js';

const sample = {
  version: 1 as const,
  models: [
    {
      id: 'demo',
      tools: ['speech-transcribe'],
      kind: 'transformers' as const,
      backend: 'transformers' as const,
      url: 'https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json',
      sizeBytes: 1000,
      license: 'MIT',
      origin: 'openai/whisper-tiny',
      localName: 'whisper-tiny',
    },
  ],
};

describe('models schema', () => {
  it('parses a registry and rejects NC/AGPL', () => {
    const parsed = parseRegistry(sample);
    expect(parsed.models).toHaveLength(1);
    expect(forbiddenLicense('MIT')).toBe(false);
    expect(forbiddenLicense('Apache-2.0')).toBe(false);
    expect(forbiddenLicense('CC-BY-NC-4.0')).toBe(true);
    expect(forbiddenLicense('AGPL-3.0')).toBe(true);
    const api = createCatalog(sample);
    expect(api.getModel('demo')?.tools[0]).toBe('speech-transcribe');
  });
});
