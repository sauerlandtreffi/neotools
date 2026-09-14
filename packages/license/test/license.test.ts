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

  it('warns when issuedAt is in the future (clock hint only)', async () => {
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
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => /Uhr-Manipulation/i.test(w))).toBe(true);
  });

  it('gates only platform extras — community payload has no tool restrictions', () => {
    expect(hasFeature('api', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('presets', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('whitelabel', COMMUNITY_LICENSE)).toBe(false);
    expect(hasFeature('audit', COMMUNITY_LICENSE)).toBe(false);
  });
});
