import { describe, expect, it } from 'vitest';
import { zodObjectFields } from '@neotools/engine';
import { pdfLock } from '../src/tools/pdf-lock.js';

describe('password field convention', () => {
  it('exposes Zod .describe("password") for lock fields', () => {
    const fields = zodObjectFields(pdfLock.options);
    const secrets = fields.filter((f) => f.description === 'password').map((f) => f.name);
    expect(secrets).toEqual(expect.arrayContaining(['userPassword', 'ownerPassword', 'password']));
  });
});
