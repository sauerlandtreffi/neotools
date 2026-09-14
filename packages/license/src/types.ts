export const LICENSE_PLANS = ['community', 'pro', 'enterprise'] as const;

export type LicensePlan = (typeof LICENSE_PLANS)[number];

/** Feature gates — never applied to individual tools. Community can run every tool. */
export const GATED_FEATURES = ['api', 'watch', 'presets', 'whitelabel', 'audit'] as const;

export type GatedFeature = (typeof GATED_FEATURES)[number];

export const PLAN_FEATURES: Record<LicensePlan, readonly GatedFeature[]> = {
  community: [],
  pro: ['api', 'watch', 'presets'],
  enterprise: ['api', 'watch', 'presets', 'whitelabel', 'audit'],
};

export const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export const CLOCK_SKEW_WARN_MS = 24 * 60 * 60 * 1000;

export interface LicensePayload {
  org: string;
  plan: LicensePlan;
  features: GatedFeature[];
  seats: number;
  validUntil: string;
  id: string;
  issuedAt: string;
  domain?: string;
}

export interface LicenseVerifyOk {
  ok: true;
  payload: LicensePayload;
  grace: boolean;
  warnings: string[];
  expired: false;
}

export interface LicenseVerifyFail {
  ok: false;
  payload?: LicensePayload;
  grace: boolean;
  warnings: string[];
  expired: boolean;
  error: string;
}

export type LicenseVerifyResult = LicenseVerifyOk | LicenseVerifyFail;

export const COMMUNITY_LICENSE: LicensePayload = {
  org: 'Community',
  plan: 'community',
  features: [],
  seats: 0,
  validUntil: '9999-12-31T23:59:59.000Z',
  id: 'community',
  issuedAt: '2020-01-01T00:00:00.000Z',
};
