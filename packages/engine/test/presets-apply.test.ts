import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Registry } from '../src/registry.js';
import { applyTeamPresets, getAppliedPresets, mergePresetOptions } from '../src/presets.js';
import { defineTool } from '../src/define-tool.js';
import { MIME } from '../src/types.js';

function sampleTool(id: string) {
  return defineTool({
    id,
    pack: 'test',
    category: 'test',
    title: { de: id, en: id },
    description: { de: id, en: id },
    inputs: { accept: [MIME.pdf], multiple: true },
    options: z.object({
      strip: z.boolean().default(false),
      label: z.string().default('x'),
    }),
    licenses: [],
    async run(_ctx, files) {
      return { outputs: files, warnings: [] };
    },
  });
}

const presets = {
  version: 1,
  organization: 'Kanzlei',
  defaults: { 'pdf-sanitize': { strip: true, label: 'team' } },
  locked: { 'pdf-sanitize': ['strip'] },
  hiddenTools: ['secret-tool'],
  requiredPipelines: { send: ['pdf-sanitize'] },
};

describe('applyTeamPresets', () => {
  it('hides tools, applies defaults, and forces locked keys', () => {
    const registry = new Registry().register(sampleTool('pdf-sanitize')).register(sampleTool('secret-tool'));
    const next = applyTeamPresets(registry, presets);
    expect(next.get('secret-tool')).toBeUndefined();
    expect(next.get('pdf-sanitize')).toBeTruthy();
    expect(getAppliedPresets(next)?.hiddenTools).toContain('secret-tool');
    const parsed = next.require('pdf-sanitize').options.parse({ strip: false, label: 'user' });
    expect(parsed.strip).toBe(true);
    expect(parsed.label).toBe('user');
  });

  it('mergePresetOptions forces locked keys back to defaults', () => {
    const merged = mergePresetOptions('pdf-sanitize', { strip: false, label: 'u' }, presets as never);
    expect(merged.strip).toBe(true);
    expect(merged.label).toBe('u');
  });
});
