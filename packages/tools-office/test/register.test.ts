import { describe, expect, it } from 'vitest';
import { createOfficeRegistry, officeTools } from '../src/index.js';

describe('office registry', () => {
  it('registers 32 tools with unique ids', () => {
    const reg = createOfficeRegistry();
    expect(officeTools).toHaveLength(32);
    expect(reg.size).toBe(32);
    expect(new Set(reg.ids()).size).toBe(32);
    expect(reg.ids()).toContain('docx-to-pdf');
    expect(reg.ids()).toContain('markdown-to-pdf');
    expect(reg.ids()).toContain('epub-from-markdown');
    expect(reg.ids()).toContain('qr-batch');
  });
});
