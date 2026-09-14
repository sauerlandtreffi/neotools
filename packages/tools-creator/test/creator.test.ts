import { describe, expect, it } from 'vitest';
import { createToolContext, neoFileFromBytes, runTool } from '@neotools/engine';
import { encodePngRgba } from '@neotools/tools-image';
import { createCreatorRegistry, creatorSocialCard, creatorTools } from '../src/index.js';

function png(name: string, w = 32, h = 24) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 30;
    data[i + 1] = 80;
    data[i + 2] = 160;
    data[i + 3] = 255;
  }
  return neoFileFromBytes(name, encodePngRgba(data, w, h), 'image/png');
}

describe('creator pack', () => {
  it('registers 22 tools in pack creator', () => {
    const reg = createCreatorRegistry();
    expect(creatorTools).toHaveLength(22);
    expect(reg.ids()).toHaveLength(22);
    expect(creatorTools.every((t) => t.pack === 'creator')).toBe(true);
    expect(reg.get('creator-social-card')).toBeTruthy();
  });

  it('social-card renders a PNG', async () => {
    const result = await runTool(creatorSocialCard, createToolContext(), [png('hero.png', 64, 40)], {
      template: 'og',
      title: 'NeoTools',
      subtitle: 'Lokal',
    });
    expect(result.outputs[0]?.mime).toBe('image/png');
    const bytes = await result.outputs[0]!.bytes();
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes.byteLength).toBeGreaterThan(80);
  });
});
