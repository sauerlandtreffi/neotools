import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodObjectFields } from '../src/zod-fields.js';

describe('zodObjectFields nested', () => {
  it('exposes z.object and z.array(z.object)', () => {
    const schema = z.object({
      seller: z.object({ name: z.string().default(''), city: z.string().default('') }),
      lines: z.array(z.object({ name: z.string().default('x'), net: z.number().default(1) })).default([]),
    });
    const fields = zodObjectFields(schema);
    const seller = fields.find((f) => f.name === 'seller');
    expect(seller?.kind).toBe('object');
    expect(seller?.fields?.map((c) => c.name)).toEqual(expect.arrayContaining(['name', 'city']));
    const lines = fields.find((f) => f.name === 'lines');
    expect(lines?.kind).toBe('array');
    expect(lines?.itemKind).toBe('object');
    expect(lines?.fields?.map((c) => c.name)).toEqual(expect.arrayContaining(['name', 'net']));
  });
});
