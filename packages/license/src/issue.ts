import { canonicalizePayload } from './canonical.js';
import { bytesToBase64Url, parsePrivateKey } from './codec.js';
import { getPublicKey, signBytes } from './crypto.js';
import { PLAN_FEATURES, type GatedFeature, type LicensePayload, type LicensePlan } from './types.js';

export interface IssueOptions {
  org: string;
  plan: LicensePlan;
  days: number;
  features?: readonly string[];
  seats?: number;
  domain?: string;
  id?: string;
  issuedAt?: Date;
  now?: Date;
  privateKey: string | Uint8Array;
}

function newId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function resolveFeatures(plan: LicensePlan, extra: readonly string[] = []): GatedFeature[] {
  const allowed = new Set<GatedFeature>(PLAN_FEATURES[plan]);
  for (const f of extra) {
    if (allowed.has(f as GatedFeature) || PLAN_FEATURES.enterprise.includes(f as GatedFeature)) {
      allowed.add(f as GatedFeature);
    }
  }
  if (plan === 'community') return [];
  return [...allowed].sort();
}

export async function issueLicense(opts: IssueOptions): Promise<{ token: string; payload: LicensePayload; publicKeyHex: string }> {
  const now = opts.now ?? new Date();
  const issuedAt = opts.issuedAt ?? now;
  const until = new Date(now.getTime() + opts.days * 24 * 60 * 60 * 1000);
  const payload: LicensePayload = {
    org: opts.org.trim(),
    plan: opts.plan,
    features: resolveFeatures(opts.plan, opts.features ?? []),
    seats: opts.seats ?? (opts.plan === 'community' ? 0 : 1),
    validUntil: until.toISOString(),
    id: opts.id ?? newId(),
    issuedAt: issuedAt.toISOString(),
  };
  if (opts.domain) payload.domain = opts.domain;
  const priv = typeof opts.privateKey === 'string' ? parsePrivateKey(opts.privateKey) : opts.privateKey;
  const pub = await getPublicKey(priv);
  const msg = new TextEncoder().encode(canonicalizePayload(payload));
  const sig = await signBytes(msg, priv);
  const token = `${bytesToBase64Url(msg)}.${bytesToBase64Url(sig)}`;
  return { token, payload, publicKeyHex: [...pub].map((b) => b.toString(16).padStart(2, '0')).join('') };
}
