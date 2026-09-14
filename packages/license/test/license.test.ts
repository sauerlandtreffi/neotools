import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_LICENSE,
  generateKeypair,
  hasFeature,
  issueLicense,
  verifyLicense,
} from '../src/index.js';

describe('license issue/verify', () => {
  it('issues and verifies a pro token', async () => {
    const keys = await generateKeypair();
    const { token, payload } = await issueLicense({
      org: 'Kanzlei Test',
      plan: 'pro',
      days: 365,
      features: ['api', 'watch', 'presets'],
      privateKey: keys.privateKeyHex,
    });
    expect(payload.plan).toBe('pro');
    expect(payload.features).toContain('api');
    const result = await verifyLicense(token, keys.publicKeyHex);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.org).toBe('Kanzlei Test');
      expect(result.grace).toBe(false);
      expect(hasFeature('api', result)).toBe(true);
      expect(hasFeature('whitelabel', result)).toBe(false);
    }
  });

  it('treats missing token as community (tools stay free)', async () => {
    const result = await verifyLicense('', '');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.id).toBe(COMMUNITY_LICENSE.id);
    expect(hasFeature('api', result)).toBe(false);
    expect(hasFeature('watch')).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const keys = await generateKeypair();
    const { token } = await issueLicense({
      org: 'X',
      plan: 'pro',
      days: 30,
      privateKey: keys.privateKeyHex,
    });
    const [payloadPart] = token.split('.');
    const json = JSON.parse(Buffer.from(payloadPart!, 'base64url').toString('utf8')) as { org: string };
    json.org = 'Hacked';
    const tampered = `${Buffer.from(JSON.stringify(json), 'utf8').toString('base64url')}.${token.split('.')[1]}`;
    const result = await verifyLicense(tampered, keys.publicKeyHex);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Signatur|ungültig/i);
    expect(hasFeature('api', result)).toBe(false);
  });

  it('rejects an expired token after grace', async () => {
    const keys = await generateKeypair();
    const issued = new Date('2020-01-01T00:00:00.000Z');
    const { token } = await issueLicense({
      org: 'Alt',
      plan: 'enterprise',
      days: 1,
      now: issued,
      issuedAt: issued,
      privateKey: keys.privateKeyHex,
    });
    const result = await verifyLicense(token, keys.publicKeyHex, new Date('2024-01-01T00:00:00.000Z'));
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('accepts grace period', async () => {
    const keys = await generateKeypair();
    const issued = new Date('2024-01-01T00:00:00.000Z');
    const { token } = await issueLicense({
      org: 'Grace',
      plan: 'pro',
      days: 1,
      now: issued,
      issuedAt: issued,
      privateKey: keys.privateKeyHex,
    });
    const duringGrace = new Date(issued.getTime() + 2 * 24 * 60 * 60 * 1000);
    const result = await verifyLicense(token, keys.publicKeyHex, duringGrace);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.grace).toBe(true);
    expect(hasFeature('api', result)).toBe(true);
  });

  it('rejects issuedAt far in the future (clock rollback) as Community', async () => {
    const keys = await generateKeypair();
    const now = new Date('2024-06-01T00:00:00.000Z');
    const future = new Date('2024-06-10T00:00:00.000Z');
    const { token } = await issueLicense({
      org: 'Clock',
      plan: 'pro',
      days: 30,
      now,
      issuedAt: future,
      privateKey: keys.privateKeyHex,
    });
    const result = await verifyLicense(token, keys.publicKeyHex, now);
    expect(result.ok).toBe(false);
    expect(hasFeature('api', result)).toBe(false);
    expect(result.warnings.some((w) => /Uhr|Zukunft/i.test(w))).toBe(true);
  });

  it('treats a token without a public key as Community, never Pro', async () => {
    const keys = await generateKeypair();
    const { token } = await issueLicense({
      org: 'ProOrg',
      plan: 'pro',
      days: 30,
      privateKey: keys.privateKeyHex,
    });
    const result = await verifyLicense(token, '');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.plan).toBe('community');
    expect(hasFeature('api', result)).toBe(false);
  });

  it('rejects a validUntil mutation and a non-canonical key order', async () => {
    const keys = await generateKeypair();
    const { token } = await issueLicense({
      org: 'X',
      plan: 'pro',
      days: 30,
      privateKey: keys.privateKeyHex,
    });
    const [payloadPart, sig] = token.split('.');
    const json = JSON.parse(Buffer.from(payloadPart!, 'base64url').toString('utf8')) as {
      validUntil: string;
      org: string;
    };
    json.validUntil = '2099-01-01T00:00:00.000Z';
    const tamperedUntil = `${Buffer.from(JSON.stringify(json), 'utf8').toString('base64url')}.${sig}`;
    const untilResult = await verifyLicense(tamperedUntil, keys.publicKeyHex);
    expect(untilResult.ok).toBe(false);
    expect(hasFeature('api', untilResult)).toBe(false);

    const reordered = `${Buffer.from(JSON.stringify({ z: 1, ...json, validUntil: json.validUntil }), 'utf8').toString('base64url')}.${sig}`;
    const orderResult = await verifyLicense(reordered, keys.publicKeyHex);
    expect(orderResult.ok).toBe(false);
  });

  it('rejects features/plan escalation on a validly signed token', async () => {
    const keys = await generateKeypair();
    const { token } = await issueLicense({ org: 'X', plan: 'pro', days: 30, privateKey: keys.privateKeyHex });
    const [payloadPart, sig] = token.split('.');
    const base = JSON.parse(Buffer.from(payloadPart!, 'base64url').toString('utf8')) as Record<string, unknown>;
    const reencode = (obj: Record<string, unknown>) => `${Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')}.${sig}`;
    const escalatedFeatures = await verifyLicense(reencode({ ...base, features: ['api', 'watch', 'presets', 'whitelabel', 'audit'] }), keys.publicKeyHex);
    expect(escalatedFeatures.ok).toBe(false);
    expect(hasFeature('whitelabel', escalatedFeatures)).toBe(false);
    const escalatedPlan = await verifyLicense(reencode({ ...base, plan: 'enterprise' }), keys.publicKeyHex);
    expect(escalatedPlan.ok).toBe(false);
    const unknownFeature = await verifyLicense(reencode({ ...base, features: [...(base.features as string[]), 'root'] }), keys.publicKeyHex);
    expect(unknownFeature.ok).toBe(false);
    expect(unknownFeature.error).toMatch(/kanonisch|Signatur/i);
    // wrong public key: a token signed by someone else never unlocks anything
    const other = await generateKeypair();
    const wrongKey = await verifyLicense(token, other.publicKeyHex);
    expect(wrongKey.ok).toBe(false);
    expect(hasFeature('api', wrongKey)).toBe(false);
  });

  it('grace: 14 days after validUntil ok+grace, one second later expired', async () => {
    const keys = await generateKeypair();
    const issued = new Date('2024-01-01T00:00:00.000Z');
    const { token, payload } = await issueLicense({ org: 'G', plan: 'pro', days: 1, now: issued, issuedAt: issued, privateKey: keys.privateKeyHex });
    const until = Date.parse(payload.validUntil);
    const lastGrace = await verifyLicense(token, keys.publicKeyHex, new Date(until + 14 * 24 * 60 * 60 * 1000));
    expect(lastGrace.ok).toBe(true);
    expect(lastGrace.grace).toBe(true);
    expect(lastGrace.warnings.some((w) => /Grace/i.test(w))).toBe(true);
    const afterGrace = await verifyLicense(token, keys.publicKeyHex, new Date(until + 14 * 24 * 60 * 60 * 1000 + 1000));
    expect(afterGrace.ok).toBe(false);
    expect(afterGrace.expired).toBe(true);
    expect(hasFeature('api', afterGrace)).toBe(false);
  });

  it('hasFeature/payloadFromResult ignore a forged grace flag on a failed result', async () => {
    const { payloadFromResult } = await import('../src/index.js');
    const forged = {
      ok: false as const,
      grace: true,
      payload: { ...COMMUNITY_LICENSE, plan: 'enterprise' as const, features: ['api', 'audit'] as ('api' | 'audit')[] },
      warnings: [],
      expired: true,
      error: 'abgelaufen',
    };
    expect(hasFeature('api', forged)).toBe(false);
    expect(payloadFromResult(forged).plan).toBe('community');
    expect(hasFeature('api', { ok: 'true' } as never)).toBe(false);
    expect(hasFeature('api', 'api' as never)).toBe(false);
  });

  it('rejects JWT alg=none (algorithm confusion)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        org: 'X',
        plan: 'pro',
        features: ['api'],
        seats: 1,
        validUntil: '2099-01-01T00:00:00.000Z',
        id: 'x',
        issuedAt: '2024-01-01T00:00:00.000Z',
      }),
      'utf8',
    ).toString('base64url');
    const result = await verifyLicense(`${header}.${payload}.`, '00'.repeat(32));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Algorithmus|Confusion|Ed25519/i);
    expect(hasFeature('api', result)).toBe(false);
  });

  it('hasFeature is fail-closed on a failed verify that still carries a pro payload', async () => {
    const fake = {
      ok: false as const,
      payload: {
        org: 'Evil',
        plan: 'enterprise' as const,
        features: ['api', 'watch', 'presets', 'whitelabel', 'audit'] as const,
        seats: 99,
        validUntil: '2099-01-01T00:00:00.000Z',
        id: 'evil',
        issuedAt: '2020-01-01T00:00:00.000Z',
      },
      grace: false,
      warnings: [],
      expired: false,
      error: 'Signatur ungültig',
    };
    expect(hasFeature('api', fake)).toBe(false);
    expect(hasFeature('whitelabel', fake)).toBe(false);
  });

  it('repo sources do not embed PEM private keys or seed phrases', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = ['src/crypto.ts', 'src/issue.ts', 'src/verify.ts', 'src/codec.ts', 'src/types.ts'];
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8');
      expect(text).not.toMatch(/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
      expect(text).not.toMatch(/mnemonic|seed phrase/i);
    }
  });

  it('gates only platform extras — community payload has no tool restrictions', () => {
    expect(hasFeature('api', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('presets', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('whitelabel', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('audit', COMMUNITY_LICENSE)).toBe(false);
  });
});
