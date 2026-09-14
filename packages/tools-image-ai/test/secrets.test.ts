import { describe, expect, it } from 'vitest';
import { findSecrets, isValidIban, isValidKennzeichen } from '../src/secrets/patterns.js';

describe('secret regex', () => {
  it('hits AWS, GitHub, Stripe, Slack, Google, JWT, IBAN, email, phone, IP, plate', () => {
    const text = [
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_abcdefghijklmnopqrstuvwxyz012345',
      'sk_live_51abcdefghijklmnopqrst',
      'xoxb-1234567890-abcdefghij',
      'AIzaabcdefghijklmnopqrstuvwxyz012345678',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signaturexx',
      'DE89 3704 0044 0532 0130 00',
      'alice@example.org',
      '+49 30 1234567',
      '10.0.0.8',
      'B-MW 1234',
    ].join('\n');
    const hits = findSecrets(text);
    const kinds = new Set(hits.map((h) => h.kind));
    expect(kinds.has('aws')).toBe(true);
    expect(kinds.has('github')).toBe(true);
    expect(kinds.has('stripe')).toBe(true);
    expect(kinds.has('slack')).toBe(true);
    expect(kinds.has('google-api')).toBe(true);
    expect(kinds.has('jwt')).toBe(true);
    expect(kinds.has('iban')).toBe(true);
    expect(kinds.has('email')).toBe(true);
    expect(kinds.has('phone')).toBe(true);
    expect(kinds.has('private-ip')).toBe(true);
    expect(kinds.has('kennzeichen')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidKennzeichen('B-MW 1234')).toBe(true);
  });
});
