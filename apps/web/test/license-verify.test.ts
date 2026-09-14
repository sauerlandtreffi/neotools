import { describe, expect, it } from 'vitest';
import { generateKeypair, issueLicense, verifyLicense } from '@neotools/license';

describe('license page verification (unit, no E2E branding inject)', () => {
  it('verifies a runtime-generated token with an injected pubkey', async () => {
    const keys = await generateKeypair();
    const { token } = await issueLicense({
      org: 'E2E',
      plan: 'pro',
      days: 30,
      privateKey: keys.privateKeyHex,
    });
    const result = await verifyLicense(token, keys.publicKeyHex);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.org).toBe('E2E');
  });
});
