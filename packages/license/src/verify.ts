import { canonicalizePayload, parsePayload } from './canonical.js';
import { base64UrlToBytes, parsePublicKey } from './codec.js';
import { verifyBytes } from './crypto.js';
import {
  CLOCK_SKEW_WARN_MS,
  COMMUNITY_LICENSE,
  GRACE_MS,
  type LicensePayload,
  type LicenseVerifyResult,
} from './types.js';

export function decodeLicenseToken(token: string): { payload: LicensePayload; signature: Uint8Array; message: Uint8Array } {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) throw new Error('Lizenz-Token ungültig.');
  const message = base64UrlToBytes(trimmed.slice(0, dot));
  const signature = base64UrlToBytes(trimmed.slice(dot + 1));
  const json = new TextDecoder().decode(message);
  const payload = parsePayload(JSON.parse(json));
  const canonical = canonicalizePayload(payload);
  if (canonical !== json) {
    // Accept non-canonical encoding as long as fields parse; re-sign verify uses original bytes.
  }
  return { payload, signature, message };
}

export async function verifyLicense(
  token: string | undefined | null,
  publicKey: string | Uint8Array | undefined | null,
  now = new Date(),
): Promise<LicenseVerifyResult> {
  if (!token || !token.trim()) {
    return {
      ok: true,
      payload: COMMUNITY_LICENSE,
      grace: false,
      warnings: [],
      expired: false,
    };
  }
  if (!publicKey || (typeof publicKey === 'string' && !publicKey.trim())) {
    return {
      ok: false,
      grace: false,
      warnings: [],
      expired: false,
      error: 'Kein Public Key konfiguriert — Token kann nicht geprüft werden.',
    };
  }

  let decoded: ReturnType<typeof decodeLicenseToken>;
  try {
    decoded = decodeLicenseToken(token);
  } catch (err) {
    return {
      ok: false,
      grace: false,
      warnings: [],
      expired: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const pub = typeof publicKey === 'string' ? parsePublicKey(publicKey) : publicKey;
  const good = await verifyBytes(decoded.signature, decoded.message, pub);
  if (!good) {
    return {
      ok: false,
      payload: decoded.payload,
      grace: false,
      warnings: [],
      expired: false,
      error: 'Signatur ungültig (Token verändert oder falscher Schlüssel).',
    };
  }

  const warnings: string[] = [];
  const issued = Date.parse(decoded.payload.issuedAt);
  if (Number.isFinite(issued) && issued - now.getTime() > CLOCK_SKEW_WARN_MS) {
    warnings.push(
      'issuedAt liegt in der Zukunft — mögliche Uhr-Manipulation. Nur Hinweis, Prüfung läuft weiter.',
    );
  }

  const until = Date.parse(decoded.payload.validUntil);
  if (!Number.isFinite(until)) {
    return {
      ok: false,
      payload: decoded.payload,
      grace: false,
      warnings,
      expired: false,
      error: 'validUntil ungültig.',
    };
  }

  if (now.getTime() <= until) {
    return { ok: true, payload: decoded.payload, grace: false, warnings, expired: false };
  }

  if (now.getTime() <= until + GRACE_MS) {
    warnings.push('Lizenz abgelaufen, Grace-Period aktiv (14 Tage).');
    return { ok: true, payload: decoded.payload, grace: true, warnings, expired: false };
  }

  return {
    ok: false,
    payload: decoded.payload,
    grace: false,
    warnings,
    expired: true,
    error: 'Lizenz abgelaufen.',
  };
}
