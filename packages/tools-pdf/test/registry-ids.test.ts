import { describe, expect, it } from 'vitest';
import { createPdfRegistry } from '../src/index.js';

describe('pdf pack registry', () => {
  it('registers backlog ids including reorder (not organize)', () => {
    const ids = createPdfRegistry().ids();
    expect(ids).toContain('pdf-reorder');
    expect(ids).not.toContain('pdf-organize');
    expect(ids).toEqual(
      expect.arrayContaining(['pdf-lock', 'pdf-repair', 'pdf-compress', 'pdf-ocr', 'pdf-forms', 'pdf-redact']),
    );
  });
});
