import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Registry, applyTeamPresets, defineTool, MIME } from '@neotools/engine';
import { generateKeyPair, signPresets, verifyPresets } from '../src/presets/sign.js';
import { examplePresets, presetsFileSchema } from '../src/presets/schema.js';

describe('team presets', () => {
  it('Ed25519 sign / verify', async () => {
    const body = examplePresets('kanzlei');
    const keys = await generateKeyPair();
    const sig = await signPresets(body, keys.privateKey);
    expect(await verifyPresets(body, sig, keys.publicKey)).toBe(true);
    expect(await verifyPresets({ ...body, organization: 'other' }, sig, keys.publicKey)).toBe(false);
  });

  it('applyTeamPresets locks options', () => {
    const tool = defineTool({
      id: 'pdf-sanitize',
      pack: 'test',
      category: 'test',
      title: { de: 's', en: 's' },
      description: { de: 's', en: 's' },
      inputs: { accept: [MIME.pdf], multiple: false },
      options: z.object({ dropJs: z.boolean().default(false), label: z.string().default('x') }),
      licenses: [],
      async run(_ctx, files) {
        return { outputs: files, warnings: [] };
      },
    });
    const presets = presetsFileSchema.parse({
      version: 1,
      organization: 'K',
      defaults: { 'pdf-sanitize': { dropJs: true, label: 'team' } },
      locked: { 'pdf-sanitize': ['dropJs'] },
      hiddenTools: ['secret'],
    });
    const registry = new Registry().register(tool);
    const next = applyTeamPresets(registry, presets);
    const parsed = next.require('pdf-sanitize').options.parse({ dropJs: false, label: 'user' });
    expect(parsed.dropJs).toBe(true);
    expect(parsed.label).toBe('user');
  });
});
