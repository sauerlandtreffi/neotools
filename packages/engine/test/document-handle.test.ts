import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createToolContext } from '../src/context.js';
import { defineTool } from '../src/define-tool.js';
import {
  ParseCache,
  advanceHandle,
  handleBytes,
  handleFromBytes,
  handleFromOpfs,
  mutateHandle,
  pickPrimaryOutput,
} from '../src/document-handle.js';
import { neoFileFromBytes } from '../src/neo-file.js';
import { MIME } from '../src/types.js';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('DocumentHandle', () => {
  it('reads bytes from memory and from an OPFS reader', async () => {
    const mem = handleFromBytes('a.pdf', bytes('%PDF-a'), MIME.pdf);
    expect(await handleBytes(mem)).toEqual(bytes('%PDF-a'));
    const opfs = handleFromOpfs('b.pdf', 'sessions/s1/src/f1', MIME.pdf, 6);
    const reader = { read: async (p: string) => (p === 'sessions/s1/src/f1' ? bytes('%PDF-b') : undefined) };
    expect(await handleBytes(opfs, reader)).toEqual(bytes('%PDF-b'));
    await expect(handleBytes(opfs)).rejects.toThrow(/OPFS/);
  });

  it('advanceHandle keeps id and bumps generation', () => {
    const h0 = handleFromBytes('a.pdf', bytes('one'), MIME.pdf);
    const h1 = advanceHandle(h0, { bytes: bytes('two!') , name: 'a-compressed.pdf' });
    expect(h1.id).toBe(h0.id);
    expect(h1.generation).toBe(1);
    expect(h1.size).toBe(4);
    expect(h1.name).toBe('a-compressed.pdf');
  });

  it('pickPrimaryOutput prefers same mime, then non-sidecar', () => {
    const json = neoFileFromBytes('r.json', bytes('{}'), MIME.json);
    const pdf = neoFileFromBytes('o.pdf', bytes('p'), MIME.pdf);
    const png = neoFileFromBytes('o.png', bytes('g'), MIME.png);
    expect(pickPrimaryOutput([json, pdf], MIME.pdf)).toBe(pdf);
    expect(pickPrimaryOutput([json, png], MIME.pdf)).toBe(png);
    expect(pickPrimaryOutput([json], MIME.pdf)).toBe(json);
    expect(pickPrimaryOutput([], MIME.pdf)).toBeUndefined();
  });
});

describe('ParseCache', () => {
  it('parses once per (id, generation) and dedupes concurrent calls', async () => {
    const cache = new ParseCache(4);
    const h = handleFromBytes('a.pdf', bytes('abc'), MIME.pdf);
    let calls = 0;
    const parse = async (b: Uint8Array) => {
      calls += 1;
      return b.byteLength;
    };
    const [a, b] = await Promise.all([cache.get(h, parse), cache.get(h, parse)]);
    expect(a).toBe(3);
    expect(b).toBe(3);
    expect(calls).toBe(1);
    await cache.get(h, parse);
    expect(calls).toBe(1);
    const next = advanceHandle(h, { bytes: bytes('abcd') });
    expect(await cache.get(next, parse)).toBe(4);
    expect(calls).toBe(2);
    expect(cache.stats()).toEqual({ hits: 2, misses: 2, size: 2 });
  });

  it('evicts the least recently used entry and supports invalidate', async () => {
    const cache = new ParseCache(2);
    const parse = async (b: Uint8Array) => b.byteLength;
    const h1 = handleFromBytes('1', bytes('1'), MIME.txt);
    const h2 = handleFromBytes('2', bytes('22'), MIME.txt);
    const h3 = handleFromBytes('3', bytes('333'), MIME.txt);
    await cache.get(h1, parse);
    await cache.get(h2, parse);
    await cache.get(h1, parse); // touch h1 → h2 is LRU
    await cache.get(h3, parse);
    expect(cache.has(h1)).toBe(true);
    expect(cache.has(h2)).toBe(false);
    expect(cache.has(h3)).toBe(true);
    cache.invalidate(h1.id);
    expect(cache.has(h1)).toBe(false);
  });

  it('drops failed parses so a retry can succeed', async () => {
    const cache = new ParseCache();
    const h = handleFromBytes('x', bytes('x'), MIME.txt);
    let fail = true;
    const parse = async () => {
      if (fail) throw new Error('boom');
      return 'ok';
    };
    await expect(cache.get(h, parse)).rejects.toThrow('boom');
    fail = false;
    expect(await cache.get(h, parse)).toBe('ok');
  });
});

describe('mutateHandle', () => {
  const upper = defineTool({
    id: 'upper',
    pack: 'test',
    category: 'test',
    title: { de: 'u', en: 'u' },
    description: { de: 'u', en: 'u' },
    inputs: { accept: [MIME.txt], multiple: false },
    outputs: { mime: [MIME.txt, MIME.json] },
    options: z.object({}),
    licenses: [],
    async run(ctx, files) {
      expect(ctx.document?.id).toBeDefined();
      const src = new TextDecoder().decode(await files[0]!.bytes());
      return {
        outputs: [
          neoFileFromBytes('r.json', bytes('{}'), MIME.json),
          neoFileFromBytes('out.txt', bytes(src.toUpperCase()), MIME.txt),
        ],
        warnings: [],
      };
    },
  });

  it('returns the next generation and separates sidecars', async () => {
    const h0 = handleFromBytes('in.txt', bytes('hi'), MIME.txt);
    const { handle, sidecars, result } = await mutateHandle(createToolContext(), h0, upper, {});
    expect(handle.generation).toBe(1);
    expect(handle.name).toBe('out.txt');
    expect(new TextDecoder().decode(await handleBytes(handle))).toBe('HI');
    expect(sidecars.map((s) => s.name)).toEqual(['r.json']);
    expect(result.outputs).toHaveLength(2);
  });
});
