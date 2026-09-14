import { describe, expect, it } from 'vitest';
import { createSpeechRegistry, speechTools } from '../src/index.js';
import { forbiddenLicense, listModels } from '../src/models/catalog.js';

describe('speech registry', () => {
  it('registers twelve tools without AGPL/NC licenses', () => {
    expect(speechTools).toHaveLength(12);
    const ids = speechTools.map((t) => t.id);
    expect(ids).toContain('speech-transcribe');
    expect(ids).toContain('a11y-audio-description-draft');
    expect(speechTools.find((t) => t.id === 'speech-transcribe')?.ui?.editor).toBe('transcript');
    expect(speechTools.find((t) => t.id === 'a11y-audio-description-draft')?.pack).toBe('a11y');
    const reg = createSpeechRegistry();
    expect(reg.size).toBe(12);
    for (const t of speechTools) {
      expect(t.licenses.some((l) => /AGPL|NC/i.test(l.license))).toBe(false);
      expect(t.category).toBe('speech');
    }
    for (const m of listModels()) {
      expect(forbiddenLicense(m.license)).toBe(false);
      expect(m.license.toUpperCase()).not.toContain('CC-BY-NC');
    }
  });
});
