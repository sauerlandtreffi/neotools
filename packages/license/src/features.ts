import { COMMUNITY_LICENSE, type GatedFeature, type LicensePayload, type LicenseVerifyResult } from './types.js';

/**
 * Fail-closed: only `ok === true` (which already covers the 14-day grace window)
 * yields the signed payload. A failed verify that still carries a payload
 * (bad signature, expired, future issuedAt) is always Community.
 */
export function payloadFromResult(result: LicenseVerifyResult | undefined): LicensePayload {
  if (result?.ok === true) return result.payload ?? COMMUNITY_LICENSE;
  return COMMUNITY_LICENSE;
}

export function hasFeature(
  feature: GatedFeature,
  license?: LicensePayload | LicenseVerifyResult | null,
): boolean {
  if (!license || typeof license !== 'object') return false;
  if ('ok' in license) {
    if (license.ok !== true) return false;
    return payloadFromResult(license).features.includes(feature);
  }
  return Array.isArray(license.features) && license.features.includes(feature);
}

export function communityPromiseDe(): string {
  return [
    'Gratis-Versprechen: Der Community-Plan bleibt für alle Werkzeuge voll funktionsfähig.',
    'Ohne Lizenzschlüssel laufen Browser, CLI (run/pipeline/list) und Self-Host-Web wie gewohnt — lokal, ohne Upload, ohne Wasserzeichen.',
    'Lizenz-Gates gelten nur für: REST-API, Watch-Ordner-Automatik, Team-Presets-Erzwingung, White-Label ohne „Powered by NeoTools“-Footer, signierter Audit-Log-Export.',
    'Kein Phone-Home. Prüfung ist offline (Ed25519).',
  ].join(' ');
}

export function communityPromiseEn(): string {
  return [
    'Free promise: the Community plan stays fully functional for every tool.',
    'Without a license key, browser, CLI (run/pipeline/list) and self-hosted web work as usual — local, no upload, no watermark.',
    'License gates apply only to: REST API, watch-folder automation, team-preset enforcement, white-label without a “Powered by NeoTools” footer, signed audit-log export.',
    'No phone-home. Verification is offline (Ed25519).',
  ].join(' ');
}
