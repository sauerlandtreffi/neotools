import { describe, expect, it } from 'vitest';
import {
  generateSteuerId,
  isValidIban,
  isValidKennzeichen,
  isValidSteuerId,
  isValidSvNummer,
  findPatternMatches,
  maskSecret,
} from '../src/redact/patterns.js';

describe('IBAN checksum', () => {
  it('accepts the well-known DE fixture and rejects a flipped digit', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
    expect(isValidIban('DE00')).toBe(false);
  });
});

describe('Steuer-ID check digit', () => {
  it('roundtrips generate + validate and rejects a bad digit', () => {
    const id = generateSteuerId('8609574271');
    expect(id).toHaveLength(11);
    expect(isValidSteuerId(id)).toBe(true);
    expect(isValidSteuerId(id.slice(0, 10) + ((Number(id[10]) + 1) % 10))).toBe(false);
    expect(isValidSteuerId('00000000000')).toBe(false);
  });
});

describe('SV-Nummer and Kennzeichen', () => {
  it('validates RVNR format and plates with Kreis codes', () => {
    expect(isValidSvNummer('15 070649 C 103')).toBe(true);
    expect(isValidSvNummer('15070649C103')).toBe(true);
    expect(isValidSvNummer('123')).toBe(false);
    expect(isValidKennzeichen('M-AB 1234')).toBe(true);
    expect(isValidKennzeichen('HH-S 12')).toBe(true);
    expect(isValidKennzeichen('QQ-AB 1')).toBe(false);
  });
});

describe('findPatternMatches', () => {
  it('finds IBAN, email and plate in mixed German text', () => {
    const text = 'Kontakt: DE89 3704 0044 0532 0130 00 oder a.b@example.org — Kennzeichen M-AB 1234';
    const hits = findPatternMatches(text, ['iban', 'email', 'kennzeichen']);
    expect(hits.map((h) => h.pattern).sort()).toEqual(['email', 'iban', 'kennzeichen']);
    expect(maskSecret('DE89370400440532013000', 'iban')).toBe('DE89 **** 3000');
  });
});
