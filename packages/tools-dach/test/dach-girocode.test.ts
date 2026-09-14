import { describe, expect, it } from 'vitest';
import { createToolContext } from '@neotools/engine';
import { dachGirocode } from '../src/tools/dach-girocode.js';
import { buildEpcPayload, parseEpcPayload } from '../src/girocode/epc.js';
import { decodeGiroFromImage } from '../src/girocode/read.js';

/** DE89 3704 0044 0532 0130 00 — valid IBAN. */
const IBAN = 'DE89370400440532013000';

describe('dach-girocode', () => {
  it('roundtrips EPC payload string', () => {
    const payload = buildEpcPayload({
      name: 'Muster GmbH',
      iban: IBAN,
      amount: '12.34',
      unstructured: 'Rechnung 42',
      hint: 'Danke',
    });
    expect(payload.startsWith('BCD\n002\n1\nSCT')).toBe(true);
    expect(payload).toContain('EUR12.34');
    const parsed = parseEpcPayload(payload);
    expect(parsed.iban).toBe(IBAN);
    expect(parsed.name).toBe('Muster GmbH');
  });

  it('creates PNG/SVG and tries zxing decode', async () => {
    const result = await dachGirocode.run(createToolContext(), [], {
      mode: 'create',
      name: 'Muster GmbH',
      iban: IBAN,
      bic: '',
      amount: '12.34',
      purpose: '',
      reference: '',
      unstructured: 'Rechnung 42',
      hint: '',
      format: 'both',
    });
    const png = result.outputs.find((o) => o.mime === 'image/png');
    expect(png).toBeTruthy();
    expect(result.outputs.some((o) => o.name.endsWith('.svg'))).toBe(true);
    const payloads = (result.report?.payloads as string[] | undefined) ?? [];
    expect(payloads[0]).toContain('BCD');
    if (png) {
      const decoded = await decodeGiroFromImage(await png.bytes());
      if (decoded) {
        expect(decoded.iban.replace(/\s/g, '')).toBe(IBAN);
      }
    }
  });
});
