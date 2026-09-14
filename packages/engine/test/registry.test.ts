import { describe, expect, it } from 'vitest';
import { Registry } from '../src/registry.js';
import { passthroughTool } from './helpers.js';

describe('Registry', () => {
  it('register, get, list, byPack', () => {
    const registry = new Registry();
    const a = passthroughTool('a');
    const b = defineB();
    registry.register(a).register(b);
    expect(registry.get('a')?.id).toBe('a');
    expect(registry.list()).toHaveLength(2);
    expect(registry.byPack('test')).toHaveLength(1);
    expect(registry.byPack('other')).toHaveLength(1);
    expect(registry.require('b').pack).toBe('other');
  });

  it('rejects duplicate ids', () => {
    const registry = new Registry();
    registry.register(passthroughTool('dup'));
    expect(() => registry.register(passthroughTool('dup'))).toThrow(/bereits registriert/);
  });

  it('require throws for unknown tools', () => {
    expect(() => new Registry().require('missing')).toThrow(/Unbekanntes Tool/);
  });
});

function defineB() {
  const t = passthroughTool('b');
  return { ...t, pack: 'other' };
}
