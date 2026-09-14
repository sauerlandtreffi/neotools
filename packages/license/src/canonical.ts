import type { GatedFeature, LicensePayload, LicensePlan } from './types.js';
import { GATED_FEATURES, LICENSE_PLANS } from './types.js';

const FEATURE_SET = new Set<string>(GATED_FEATURES);
const PLAN_SET = new Set<string>(LICENSE_PLANS);

export function canonicalizePayload(payload: LicensePayload): string {
  const features = [...new Set(payload.features)].sort();
  const obj: Record<string, unknown> = {
    features,
    id: payload.id,
    issuedAt: payload.issuedAt,
    org: payload.org,
    plan: payload.plan,
    seats: payload.seats,
    validUntil: payload.validUntil,
  };
  if (payload.domain) obj.domain = payload.domain;
  return JSON.stringify(obj);
}

export function parsePayload(raw: unknown): LicensePayload {
  if (!raw || typeof raw !== 'object') throw new Error('Lizenz-Payload ungültig.');
  const o = raw as Record<string, unknown>;
  if (typeof o.org !== 'string' || !o.org.trim()) throw new Error('org fehlt.');
  if (typeof o.plan !== 'string' || !PLAN_SET.has(o.plan)) throw new Error('plan ungültig.');
  if (!Array.isArray(o.features)) throw new Error('features fehlt.');
  const features = o.features.filter((f): f is GatedFeature => typeof f === 'string' && FEATURE_SET.has(f));
  if (typeof o.seats !== 'number' || !Number.isFinite(o.seats) || o.seats < 0) {
    throw new Error('seats ungültig.');
  }
  if (typeof o.validUntil !== 'string') throw new Error('validUntil fehlt.');
  if (typeof o.id !== 'string' || !o.id.trim()) throw new Error('id fehlt.');
  if (typeof o.issuedAt !== 'string') throw new Error('issuedAt fehlt.');
  const payload: LicensePayload = {
    org: o.org,
    plan: o.plan as LicensePlan,
    features,
    seats: o.seats,
    validUntil: o.validUntil,
    id: o.id,
    issuedAt: o.issuedAt,
  };
  if (typeof o.domain === 'string' && o.domain) payload.domain = o.domain;
  return payload;
}
